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

export function useExcelLinhasAux() {
  const sb = supabase as any;

  async function inserirBatch(
    rows: ExcelLinhaCru[],
    contaBancariaId: string,
    clienteId: string,
    origem: string = 'excel',
  ): Promise<{ batchId: string; inseridas: number; falhadas: number }> {
    const batchId = crypto.randomUUID();
    if (rows.length === 0) return { batchId, inseridas: 0, falhadas: 0 };

    const payload = rows.map((r) => ({
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

    if (falhadas > 0 && inseridas === 0) {
      toast.error('Erro ao importar lote');
    } else if (falhadas > 0) {
      toast.warning(`Lote parcial: ${inseridas} inseridas, ${falhadas} falharam`);
    } else {
      toast.success(`Lote importado: ${inseridas} linha(s)`);
    }

    return { batchId, inseridas, falhadas };
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

  return { inserirBatch, listarPorContaMes, apagarBatch, descartarLinha };
}
