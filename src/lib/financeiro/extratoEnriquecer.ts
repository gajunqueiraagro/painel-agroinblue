/**
 * extratoEnriquecer — função pura que enriquece linhas do extrato com:
 *   - statusEnriquecido (cascata de regras visuais)
 *   - vínculos existentes (de conciliacao_bancaria_itens)
 *   - valor aplicado / pendente
 *   - quantidade de candidatos sistema (lançamentos órfãos compatíveis)
 *   - quantidade de refs Excel pendentes compatíveis
 *
 * Sem side effects: não toca em supabase, não escreve em banco, não muda
 * estado de nada. APENAS visual/descritivo. Compatibilidade exata (valor
 * absoluto ± 0.01, janela ±3 dias, sinais compatíveis).
 */
import type { ExtratoMovimento } from '@/hooks/useExtratoBancario';
import type { ConciliacaoItem } from '@/hooks/useConciliacaoBancariaItens';

export type StatusEnriquecido =
  | 'conciliado'
  | 'parcial'
  | 'orfao_com_sistema'
  | 'orfao_com_excel'
  | 'orfao_com_ambos'
  | 'orfao_sem_pista'
  | 'ignorado';

export interface LancamentoCandidatoMinimo {
  id: string;
  data_pagamento: string;        // 'YYYY-MM-DD'
  valor: number;                 // sempre positivo (já normalizado pelo caller)
  sinal: number;                 // 1 ou -1 (NÃO string)
  descricao: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
}

export interface RefExcelMinima {
  id: string;
  data_referencia: string | null;
  valor: number | null;          // signed (BR convention)
  fornecedor_texto: string | null;
  produto_texto: string | null;
  status: 'pendente' | 'aplicada' | 'descartada';
}

export interface MovimentoEnriquecido extends ExtratoMovimento {
  statusEnriquecido: StatusEnriquecido;
  vinculos: ConciliacaoItem[];
  valorAplicado: number;
  valorPendente: number;
  qtCandidatosSistema: number;
  qtRefsExcel: number;
  candidatosSistemaIds: string[];
  refsExcelIds: string[];
}

// Diferença em dias absolutos entre 2 datas 'YYYY-MM-DD'.
// Date.parse + divisão por 86400000. Não usar libs externas.
function diasEntre(d1: string, d2: string): number {
  const t1 = Date.parse(d1);
  const t2 = Date.parse(d2);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Number.POSITIVE_INFINITY;
  return Math.abs((t1 - t2) / 86_400_000);
}

const TOLERANCIA = 0.01;
const JANELA_DIAS = 3;

export function enriquecerMovimentos(input: {
  movimentos: ExtratoMovimento[];
  vinculosByExtratoId: Map<string, ConciliacaoItem[]>;
  refsExcelPendentes: RefExcelMinima[];
  lancamentosOrfaosDoMes: LancamentoCandidatoMinimo[];
}): MovimentoEnriquecido[] {
  const { movimentos, vinculosByExtratoId, refsExcelPendentes, lancamentosOrfaosDoMes } = input;

  return movimentos.map((m) => {
    const vinculos = vinculosByExtratoId.get(m.id) ?? [];
    const valorAplicado = vinculos.reduce(
      (s, v) => s + Math.abs(Number(v.valor_aplicado) || 0),
      0,
    );
    const valorAbs = Math.abs(Number(m.valor) || 0);
    const valorPendente = Math.max(0, valorAbs - valorAplicado);
    const sinalOfx = m.valor < 0 ? -1 : 1;

    // Match Sistema: lançamento órfão com mesmo valor abs, sinal compatível,
    // janela ±3 dias. Já assumimos que caller filtrou apenas órfãos da conta.
    const candidatosSistema = lancamentosOrfaosDoMes.filter((l) => {
      if (Math.abs(Math.abs(l.valor) - valorAbs) > TOLERANCIA) return false;
      if (sinalOfx === -1 && l.sinal !== -1) return false;
      if (sinalOfx === 1 && l.sinal !== 1) return false;
      if (!l.data_pagamento) return false;
      return diasEntre(l.data_pagamento, m.data_movimento) <= JANELA_DIAS;
    });

    // Match Excel: ref pendente com mesmo valor abs, sinal compatível,
    // janela ±3 dias. Caller já filtrou status='pendente'.
    const refsExcel = refsExcelPendentes.filter((r) => {
      if (r.valor == null) return false;
      if (r.data_referencia == null) return false;
      if (Math.abs(Math.abs(r.valor) - valorAbs) > TOLERANCIA) return false;
      if (sinalOfx === -1 && r.valor >= 0) return false;
      if (sinalOfx === 1 && r.valor <= 0) return false;
      return diasEntre(r.data_referencia, m.data_movimento) <= JANELA_DIAS;
    });

    const qtCandidatosSistema = candidatosSistema.length;
    const qtRefsExcel = refsExcel.length;

    let statusEnriquecido: StatusEnriquecido;
    if (m.status === 'ignorado') {
      statusEnriquecido = 'ignorado';
    } else if (valorAplicado + 0.005 >= valorAbs && valorAbs > 0) {
      statusEnriquecido = 'conciliado';
    } else if (valorAplicado > 0) {
      statusEnriquecido = 'parcial';
    } else if (qtCandidatosSistema > 0 && qtRefsExcel > 0) {
      statusEnriquecido = 'orfao_com_ambos';
    } else if (qtCandidatosSistema > 0) {
      statusEnriquecido = 'orfao_com_sistema';
    } else if (qtRefsExcel > 0) {
      statusEnriquecido = 'orfao_com_excel';
    } else {
      statusEnriquecido = 'orfao_sem_pista';
    }

    return {
      ...m,
      statusEnriquecido,
      vinculos,
      valorAplicado,
      valorPendente,
      qtCandidatosSistema,
      qtRefsExcel,
      candidatosSistemaIds: candidatosSistema.map((l) => l.id),
      refsExcelIds: refsExcel.map((r) => r.id),
    };
  });
}
