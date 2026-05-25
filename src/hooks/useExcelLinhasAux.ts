/**
 * useExcelLinhasAux — Persistência de linhas operacionais auxiliares.
 *
 * Tabela: excel_linhas_aux (criada via migration manual no proto).
 *
 * REGRAS ARQUITETURAIS:
 * - Excel/PDF/TXT/OCR NUNCA cria lançamento.
 * - NUNCA altera extrato_bancario_v2 ou financeiro_lancamentos_v2.
 * - É só armazenamento bruto + visualização + apoio operacional humano.
 * - PR2 (futuro) consumirá essas linhas dentro do ConciliarExtratoDialog.
 *
 * Sem React Query — chamadas Supabase diretas, sem cache.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExcelLinhaAux {
  id: string;
  cliente_id: string;
  batch_id: string;
  origem: string;                       // 'excel' por enquanto; futuro: 'pdf' | 'txt' | 'ocr' | ...
  conta_bancaria_id: string | null;
  data_referencia: string | null;
  valor: number | null;
  fornecedor_texto: string | null;
  fazenda_texto: string | null;
  plano_texto: string | null;
  centro_texto: string | null;
  produto_texto: string | null;
  observacao: string | null;
  favorecido_id: string | null;
  fazenda_id: string | null;
  status: 'pendente' | 'aplicada' | 'descartada';
  aplicada_lancamento_id: string | null;
  aplicada_extrato_id: string | null;
  aplicada_em: string | null;
  payload_extra: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ExcelLinhaCru {
  data_referencia: string | null;       // ISO 'YYYY-MM-DD'
  valor: number | null;                 // signed: positivo=entrada, negativo=saída
  fornecedor_texto?: string | null;
  fazenda_texto?: string | null;
  plano_texto?: string | null;
  centro_texto?: string | null;
  produto_texto?: string | null;
  observacao?: string | null;
  payload_extra?: Record<string, unknown> | null;
}

const CHUNK_SIZE = 500;

/**
 * PR2.3 — Chave de dedup determinística para detectar reimportação do mesmo
 * Excel. Normaliza texto (trim + lowercase) e valor (centavos inteiros para
 * evitar problema de ponto flutuante).
 *
 * Linhas com data_referencia=null retornam '' e NÃO entram em dedup
 * (não dá pra comparar sem âncora temporal).
 */
function dedupKey(
  data: string | null | undefined,
  valor: number | null | undefined,
  fornecedor: string | null | undefined,
  fazenda: string | null | undefined,
  plano: string | null | undefined,
): string {
  if (!data) return ''; // sem data não participa de dedup
  const norm = (s: string | null | undefined): string =>
    (s ?? '').trim().toLowerCase();
  const v = valor == null ? '∅' : Math.round(valor * 100).toString();
  return [data, v, norm(fornecedor), norm(fazenda), norm(plano)].join('|');
}

export function useExcelLinhasAux() {
  const sb = supabase as any;

  async function inserirBatch(
    rows: ExcelLinhaCru[],
    contaBancariaId: string,
    clienteId: string,
    origem: string = 'excel',
  ): Promise<{ batchId: string; inseridas: number; duplicadas: number; falhadas: number }> {
    const batchId = crypto.randomUUID();
    if (rows.length === 0) return { batchId, inseridas: 0, duplicadas: 0, falhadas: 0 };

    // PR2.3 — Anti-duplicação: detecta reimportação do mesmo Excel.
    // Compara cliente+conta+origem+(data,valor,forn,faz,plano) com linhas
    // pendentes/aplicadas existentes no banco. Descartadas NÃO bloqueiam
    // (operador pode ter descartado de propósito e querer re-importar).
    const datasNovas = rows
      .map((r) => r.data_referencia)
      .filter((d): d is string => typeof d === 'string' && d.length > 0);

    let duplicadas = 0;
    let rowsNovas: ExcelLinhaCru[] = rows;

    if (datasNovas.length > 0) {
      const dataMin = datasNovas.reduce((m, d) => (d < m ? d : m), datasNovas[0]);
      const dataMax = datasNovas.reduce((m, d) => (d > m ? d : m), datasNovas[0]);

      const { data: existentes, error: errSelect } = await sb
        .from('excel_linhas_aux')
        .select('data_referencia,valor,fornecedor_texto,fazenda_texto,plano_texto,status')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaBancariaId)
        .eq('origem', origem)
        .in('status', ['pendente', 'aplicada'])
        .gte('data_referencia', dataMin)
        .lte('data_referencia', dataMax);

      if (errSelect) {
        // Falha na pré-validação: NÃO bloquear o import (dedup é best-effort).
        // Logar e prosseguir com todas as linhas como novas.
        console.error('[useExcelLinhasAux] dedup pre-check error:', errSelect);
      } else {
        const setExistentes = new Set<string>();
        for (const e of (existentes ?? []) as Array<{
          data_referencia: string | null;
          valor: number | null;
          fornecedor_texto: string | null;
          fazenda_texto: string | null;
          plano_texto: string | null;
        }>) {
          const k = dedupKey(
            e.data_referencia,
            e.valor,
            e.fornecedor_texto,
            e.fazenda_texto,
            e.plano_texto,
          );
          if (k) setExistentes.add(k);
        }

        rowsNovas = [];
        for (const r of rows) {
          const k = dedupKey(
            r.data_referencia,
            r.valor,
            r.fornecedor_texto,
            r.fazenda_texto,
            r.plano_texto,
          );
          if (k && setExistentes.has(k)) {
            duplicadas++;
          } else {
            rowsNovas.push(r);
          }
        }
      }
    }

    // Se TODAS são duplicadas, retornar sem chamar INSERT.
    if (rowsNovas.length === 0) {
      toast.warning(
        duplicadas > 0
          ? `Nenhuma linha importada — ${duplicadas} já existia(m) no sistema`
          : 'Nenhuma linha para importar',
      );
      return { batchId, inseridas: 0, duplicadas, falhadas: 0 };
    }

    const payload = rowsNovas.map((r) => ({
      cliente_id: clienteId,
      batch_id: batchId,
      origem,
      conta_bancaria_id: contaBancariaId,
      data_referencia: r.data_referencia,
      valor: r.valor,
      fornecedor_texto: r.fornecedor_texto ?? null,
      fazenda_texto: r.fazenda_texto ?? null,
      plano_texto: r.plano_texto ?? null,
      centro_texto: r.centro_texto ?? null,
      produto_texto: r.produto_texto ?? null,
      observacao: r.observacao ?? null,
      status: 'pendente',
      payload_extra:
        r.payload_extra && Object.keys(r.payload_extra).length > 0
          ? r.payload_extra
          : null,
    }));

    let inseridas = 0;
    let falhadas = 0;

    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
      const { error } = await sb.from('excel_linhas_aux').insert(chunk);
      if (error) {
        console.error('[useExcelLinhasAux] inserirBatch chunk error:', error);
        falhadas += chunk.length;
      } else {
        inseridas += chunk.length;
      }
    }

    const sufixoDup = duplicadas > 0 ? `, ${duplicadas} duplicada(s) ignorada(s)` : '';

    if (falhadas > 0 && inseridas === 0) {
      toast.error(`Erro ao importar lote${sufixoDup}`);
    } else if (falhadas > 0) {
      toast.warning(
        `Lote parcial: ${inseridas} inserida(s), ${falhadas} falharam${sufixoDup}`,
      );
    } else if (duplicadas > 0) {
      toast.success(
        `Lote importado: ${inseridas} nova(s), ${duplicadas} duplicada(s) ignorada(s)`,
      );
    } else {
      toast.success(`Lote importado: ${inseridas} linha(s)`);
    }

    return { batchId, inseridas, duplicadas, falhadas };
  }

  async function listarPorContaMes(
    contaBancariaId: string,
    anoMes: string,
    clienteId: string,
  ): Promise<ExcelLinhaAux[]> {
    const [ano, mes] = anoMes.split('-').map(Number);
    if (!ano || !mes) return [];
    const primeiroDia = `${anoMes}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const ultimoDiaIso = `${anoMes}-${String(ultimoDia).padStart(2, '0')}`;

    const { data, error } = await sb
      .from('excel_linhas_aux')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('conta_bancaria_id', contaBancariaId)
      .gte('data_referencia', primeiroDia)
      .lte('data_referencia', ultimoDiaIso)
      .order('data_referencia', { ascending: true })
      .order('batch_id', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[useExcelLinhasAux] listarPorContaMes error:', error);
      toast.error('Erro ao carregar referências: ' + error.message);
      return [];
    }
    return ((data ?? []) as unknown) as ExcelLinhaAux[];
  }

  async function apagarBatch(
    batchId: string,
    clienteId: string,
  ): Promise<{ deletadas: number }> {
    // Conta antes pra retornar quantidade (PostgREST não retorna count
    // confiável em DELETE sem header Prefer; SELECT + DELETE é robusto).
    const { count: contagem } = await sb
      .from('excel_linhas_aux')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .eq('cliente_id', clienteId)
      .eq('status', 'pendente');

    const { error } = await sb
      .from('excel_linhas_aux')
      .delete()
      .eq('batch_id', batchId)
      .eq('cliente_id', clienteId)
      .eq('status', 'pendente');

    if (error) {
      console.error('[useExcelLinhasAux] apagarBatch error:', error);
      toast.error('Erro ao apagar lote: ' + error.message);
      return { deletadas: 0 };
    }
    const deletadas = contagem ?? 0;
    toast.success(`${deletadas} linha(s) pendente(s) apagada(s)`);
    return { deletadas };
  }

  async function descartarLinha(id: string): Promise<void> {
    const { error } = await sb
      .from('excel_linhas_aux')
      .update({ status: 'descartada' })
      .eq('id', id);
    if (error) {
      console.error('[useExcelLinhasAux] descartarLinha error:', error);
      toast.error('Erro ao descartar linha: ' + error.message);
      return;
    }
    toast.success('Linha descartada');
  }

  /**
   * PR2 — Busca sugestões de referência operacional para um movimento OFX.
   * TRAVA 10: filtra pela data_movimento ±3 dias (cruza meses), NÃO pelo
   * mês do header. TRAVA 2A: sinal+valor exato com tolerância R$ 0,01.
   * Ordenação 5B: distância de data ASC (linhas mais próximas vêm primeiro).
   */
  async function buscarSugestoesPorMovimento(
    clienteId: string,
    contaBancariaId: string,
    dataMovimento: string,    // ISO 'YYYY-MM-DD'
    valorMovimento: number,   // signed
  ): Promise<ExcelLinhaAux[]> {
    const valorAbs = Math.abs(valorMovimento);
    const TOL = 0.01;

    const base = new Date(`${dataMovimento}T00:00:00`);
    const isoDay = (n: number): string =>
      new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10);
    const dataMin = isoDay(-3);
    const dataMax = isoDay(3);

    let q = sb
      .from('excel_linhas_aux')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('conta_bancaria_id', contaBancariaId)
      .eq('status', 'pendente')
      .gte('data_referencia', dataMin)
      .lte('data_referencia', dataMax);

    if (valorMovimento < 0) {
      q = q.gte('valor', -(valorAbs + TOL)).lte('valor', -(valorAbs - TOL));
    } else {
      q = q.gte('valor', valorAbs - TOL).lte('valor', valorAbs + TOL);
    }

    const { data, error } = await q;
    if (error) {
      console.error('[useExcelLinhasAux] buscarSugestoesPorMovimento error:', error);
      return [];
    }

    const rows = ((data ?? []) as unknown) as ExcelLinhaAux[];
    return rows.sort((a, b) => {
      if (!a.data_referencia || !b.data_referencia) return 0;
      const da = Math.abs(new Date(a.data_referencia).getTime() - base.getTime());
      const db = Math.abs(new Date(b.data_referencia).getTime() - base.getTime());
      return da - db;
    });
  }

  /**
   * PR2 — Marca uma referência como aplicada após criação do lançamento +
   * vínculo no extrato. Idempotente: `.eq('status','pendente')` no UPDATE
   * impede dupla marcação por clique duplo.
   */
  async function marcarAplicada(
    id: string,
    lancamentoId: string,
    extratoId: string,
  ): Promise<{ ok: boolean }> {
    const { error } = await sb
      .from('excel_linhas_aux')
      .update({
        status: 'aplicada',
        aplicada_lancamento_id: lancamentoId,
        aplicada_extrato_id: extratoId,
        aplicada_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pendente');

    if (error) {
      console.error('[useExcelLinhasAux] marcarAplicada error:', error);
      return { ok: false };
    }
    return { ok: true };
  }

  return {
    inserirBatch,
    listarPorContaMes,
    apagarBatch,
    descartarLinha,
    buscarSugestoesPorMovimento,
    marcarAplicada,
  };
}
