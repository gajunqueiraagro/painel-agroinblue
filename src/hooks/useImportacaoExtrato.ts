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
  /** Já existe em extrato_bancario_v2 (mesmo cliente, mesmo hash). */
  duplicado: boolean;
  /** Score 0-100 do melhor candidato em financeiro_lancamentos_v2 (apenas visual). */
  scoreMatch: number;
  /** Sinal de match: scoreMatch >= 50. */
  matchEncontrado: boolean;
  /** id do lançamento candidato (melhor score) ou null. */
  lancamentoMatchId: string | null;
  /** Nome do fornecedor do candidato, se houver. */
  fornecedorMatch: string | null;
  /** Descrição do candidato. */
  descricaoMatch: string | null;
}

export interface PreviewResult {
  movimentos: MovimentoPreview[];
  totalLinhas: number;
  novos: number;
  duplicados: number;
  /** Movimentos NOVOS com matchEncontrado=true. */
  comMatch: number;
  /** Movimentos NOVOS sem qualquer match (score < 50). */
  semMatch: number;
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

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasEntre(a: string, b: string): number {
  const d1 = new Date(a + 'T00:00:00').getTime();
  const d2 = new Date(b + 'T00:00:00').getTime();
  return Math.round((d1 - d2) / 86400000);
}

function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

interface LancamentoCandidato {
  id: string;
  data_pagamento: string | null;
  valor: number;
  sinal: number;
  descricao: string | null;
  favorecido_id: string | null;
}

/**
 * Score 0-100 de match entre movimento do extrato e lançamento financeiro.
 * Pré-condição: |valor| do extrato == |valor| do lançamento (tol 0.01).
 *   - 70 pontos: valor exato
 *   - +20:        diferença de data ≤ 3 dias
 *   - +10:        descrição/fornecedor similar
 */
function calcularScore(
  movDataISO: string,
  movDescricao: string,
  lanc: LancamentoCandidato,
  fornNome: string | null,
): number {
  let score = 70;
  if (lanc.data_pagamento) {
    const diff = Math.abs(diasEntre(movDataISO, lanc.data_pagamento));
    if (diff <= 3) score += 20;
  }
  const movN = normalizarTexto(movDescricao);
  const lancN = normalizarTexto(lanc.descricao);
  const fornN = normalizarTexto(fornNome);
  if (movN && (
    (lancN && (movN.includes(lancN) || lancN.includes(movN))) ||
    (fornN && movN.includes(fornN))
  )) {
    score += 10;
  }
  return score;
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

      // ── Match financeiro: buscar candidatos em financeiro_lancamentos_v2 ──
      // Range de datas amplo (±7 dias além do mínimo/máximo do arquivo).
      const datas = movimentosComHash.map((m) => m.data).sort();
      const dataMin = datas[0];
      const dataMax = datas[datas.length - 1];
      const fetchIni = addDays(dataMin, -7);
      const fetchFim = addDays(dataMax, +7);

      const { data: lancsRaw } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, data_pagamento, valor, sinal, descricao, favorecido_id, conta_bancaria_id, conta_destino_id')
        .eq('cliente_id', clienteAtual.id)
        .eq('cancelado', false)
        .eq('status_transacao', 'realizado')
        .or(`conta_bancaria_id.eq.${params.contaBancariaId},conta_destino_id.eq.${params.contaBancariaId}`)
        .gte('data_pagamento', fetchIni)
        .lte('data_pagamento', fetchFim);

      const lancs = (lancsRaw ?? []) as unknown as LancamentoCandidato[];

      // Carregar nomes de fornecedores referenciados (uma query agregada).
      const favIds = Array.from(
        new Set(lancs.map((l) => l.favorecido_id).filter((x): x is string => !!x)),
      );
      const fornMap = new Map<string, string>();
      if (favIds.length > 0) {
        const { data: forns } = await supabase
          .from('financeiro_fornecedores')
          .select('id, nome')
          .in('id', favIds);
        for (const f of (forns ?? []) as { id: string; nome: string }[]) {
          fornMap.set(f.id, f.nome);
        }
      }

      // Para cada movimento: encontrar melhor candidato (|valor| igual; data ±7d; maior score).
      const movimentos: MovimentoPreview[] = movimentosComHash.map((m) => {
        const valorMov = Math.abs(m.valor);
        let melhor: LancamentoCandidato | null = null;
        let melhorScore = 0;
        for (const l of lancs) {
          if (Math.abs(Math.abs(Number(l.valor) || 0) - valorMov) > 0.01) continue;
          if (!l.data_pagamento) continue;
          if (Math.abs(diasEntre(m.data, l.data_pagamento)) > 7) continue;
          const fornNome = l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null;
          const s = calcularScore(m.data, m.descricao, l, fornNome);
          if (s > melhorScore) {
            melhorScore = s;
            melhor = l;
          }
        }

        const fornecedorMatch = melhor?.favorecido_id ? fornMap.get(melhor.favorecido_id) ?? null : null;

        return {
          ...m,
          duplicado: dupSet.has(m.hash),
          scoreMatch: melhorScore,
          matchEncontrado: melhorScore >= 50,
          lancamentoMatchId: melhor?.id ?? null,
          fornecedorMatch,
          descricaoMatch: melhor?.descricao ?? null,
        };
      });

      const novos = movimentos.filter((m) => !m.duplicado);
      const result: PreviewResult = {
        movimentos,
        totalLinhas: movimentos.length,
        novos: novos.length,
        duplicados: movimentos.filter((m) => m.duplicado).length,
        comMatch: novos.filter((m) => m.matchEncontrado).length,
        semMatch: novos.filter((m) => !m.matchEncontrado).length,
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
