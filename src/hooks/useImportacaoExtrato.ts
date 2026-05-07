/**
 * useImportacaoExtrato — orquestra import OFX/CSV de extrato bancário.
 *
 * Fluxo:
 *   1. `gerarPreview({ arquivo, contaBancariaId })`
 *      - Detecta formato pelo nome/conteúdo (.ofx / .csv).
 *      - Roda parser (`parseOFX` ou `parseCSV`).
 *      - Calcula `hash_movimento` para cada movimento.
 *      - Consulta `extrato_bancario_v2` por cliente_id + hashes para marcar duplicados.
 *      - Devolve preview com totais e flag `duplicado` por linha.
 *
 *   2. `confirmarImportacao({ contaBancariaId, nomeArquivo, formato })`
 *      - Cria cabeçalho em `financeiro_importacoes_v2` (tipo='OFX'|'CSV', totais).
 *      - Insere apenas os NÃO-duplicados em `extrato_bancario_v2`, em batches de 500.
 *      - Status inicial dos movimentos: 'nao_conciliado'.
 *      - NÃO cria nada em `financeiro_lancamentos_v2`.
 *      - NÃO faz matching automático.
 *
 * Erros são propagados via `error` state e exception.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { parseOFX, type MovimentoBruto } from '@/lib/financeiro/parser/parseOFX';
import { parseCSV } from '@/lib/financeiro/parser/parseCSV';
import { hashMovimento } from '@/lib/financeiro/extratoHash';

export interface MovimentoPreview extends MovimentoBruto {
  hash: string;
  duplicado: boolean;
}

export interface PreviewResult {
  movimentos: MovimentoPreview[];
  totalLinhas: number;
  novos: number;
  duplicados: number;
  formato: 'OFX' | 'CSV';
}

export interface ConfirmarParams {
  contaBancariaId: string;
  nomeArquivo: string;
  formato: 'OFX' | 'CSV';
}

function detectarFormato(nomeArquivo: string, conteudo: string): 'OFX' | 'CSV' | null {
  const lower = nomeArquivo.toLowerCase();
  if (lower.endsWith('.ofx') || /<OFX>/i.test(conteudo)) return 'OFX';
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'CSV';
  return null;
}

export function useImportacaoExtrato() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function gerarPreview(params: {
    arquivo: File;
    contaBancariaId: string;
  }): Promise<PreviewResult> {
    setLoading(true);
    setError(null);
    try {
      if (!clienteAtual?.id) throw new Error('Cliente não selecionado');
      const conteudo = await params.arquivo.text();
      const formato = detectarFormato(params.arquivo.name, conteudo);
      if (!formato) throw new Error('Formato não reconhecido (espera-se .ofx ou .csv)');

      const movimentosBrutos = formato === 'OFX' ? parseOFX(conteudo) : parseCSV(conteudo);
      if (movimentosBrutos.length === 0) {
        throw new Error('Nenhum movimento encontrado no arquivo');
      }

      // Calcular hashes em paralelo.
      const movimentosComHash = await Promise.all(
        movimentosBrutos.map(async (m) => ({
          ...m,
          hash: await hashMovimento({
            contaBancariaId: params.contaBancariaId,
            dataISO: m.data,
            valor: m.valor,
            descricao: m.descricao,
            documento: m.documento ?? '',
          }),
        })),
      );

      // Consultar duplicatas em uma única query.
      const hashes = movimentosComHash.map((m) => m.hash);
      const { data: existentes, error: errSel } = await supabase
        .from('extrato_bancario_v2' as any)
        .select('hash_movimento')
        .eq('cliente_id', clienteAtual.id)
        .in('hash_movimento', hashes);
      if (errSel) throw errSel;

      const dupSet = new Set((existentes as unknown as { hash_movimento: string }[] ?? []).map((r) => r.hash_movimento));
      const movimentos: MovimentoPreview[] = movimentosComHash.map((m) => ({
        ...m,
        duplicado: dupSet.has(m.hash),
      }));

      const result: PreviewResult = {
        movimentos,
        totalLinhas: movimentos.length,
        novos: movimentos.filter((m) => !m.duplicado).length,
        duplicados: movimentos.filter((m) => m.duplicado).length,
        formato,
      };
      setPreview(result);
      return result;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function confirmarImportacao(params: ConfirmarParams): Promise<{
    inseridos: number;
    importacaoId: string;
  }> {
    if (!preview) throw new Error('Sem preview gerado — chame gerarPreview primeiro');
    if (!clienteAtual?.id) throw new Error('Cliente não selecionado');
    const fazendaId = fazendaAtual?.id;
    if (!fazendaId || fazendaId === '__global__') {
      throw new Error('Selecione uma fazenda específica para importar');
    }

    const novos = preview.movimentos.filter((m) => !m.duplicado);
    if (novos.length === 0) throw new Error('Nenhum movimento novo para importar');

    setLoading(true);
    setError(null);
    try {
      // 1) Cabeçalho de importação.
      const { data: imp, error: e1 } = await supabase
        .from('financeiro_importacoes_v2')
        .insert({
          cliente_id: clienteAtual.id,
          fazenda_id: fazendaId,
          conta_bancaria_id: params.contaBancariaId,
          nome_arquivo: params.nomeArquivo,
          tipo_arquivo: params.formato,
          total_linhas: preview.totalLinhas,
          total_validas: novos.length,
          total_com_erro: preview.duplicados,
          status: 'confirmada',
        } as any)
        .select('id')
        .single();
      if (e1) throw e1;
      const importacaoId = (imp as { id: string }).id;

      // 2) Insert dos movimentos em batches de 500.
      const BATCH = 500;
      let inseridos = 0;
      for (let i = 0; i < novos.length; i += BATCH) {
        const fatia = novos.slice(i, i + BATCH).map((m) => ({
          cliente_id: clienteAtual.id,
          conta_bancaria_id: params.contaBancariaId,
          importacao_id: importacaoId,
          data_movimento: m.data,
          descricao: m.descricao,
          documento: m.documento,
          valor: m.valor,
          tipo_movimento: m.tipo,
          hash_movimento: m.hash,
          status: 'nao_conciliado' as const,
        }));
        const { error: e2 } = await supabase
          .from('extrato_bancario_v2' as any)
          .insert(fatia);
        if (e2) throw e2;
        inseridos += fatia.length;
      }

      setPreview(null);
      return { inseridos, importacaoId };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPreview(null);
    setError(null);
  }

  return {
    preview,
    loading,
    error,
    gerarPreview,
    confirmarImportacao,
    reset,
  };
}
