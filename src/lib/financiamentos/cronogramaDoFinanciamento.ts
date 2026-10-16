/**
 * FIN-PARCELAS-TAXA-ZERO-01 — o cronograma do financiamento/empréstimo cadastrado pela tela, e a linha que cada parcela grava.
 *
 * ⚠ SAIU DE `useFinanciamentoCadastro.gerarParcelas` SEM MUDAR A CONTA: principal = (valor − entrada) / N; juros compostos
 *   anual → mensal → período sobre esse principal; taxa 0 = juros 0; vencimento = 1ª parcela + i períodos (`addMonths`, que no
 *   dia 31 cai no último dia do mês curto e volta ao 31 no mês seguinte, porque conta sempre a partir da 1ª, nunca da anterior).
 *   O que mudou: o centavo que o arredondamento perde vai para a ÚLTIMA parcela — a soma do principal fecha com o contrato.
 * ⚠ O `valor_total` DA PARCELA É GRAVADO NO INSERT (principal + juros). Antes o insert não o mandava, o banco punha o default 0,
 *   e a parcela nascia com principal preenchido e total zero — com qualquer taxa, não só com 0.
 */
import { addMonths, format } from 'date-fns';

export interface ParcelaDoCronograma {
  numero: number;
  data_vencimento: string;
  valor_principal: number;
  valor_juros: number;
}

export interface EntradaDoCronograma {
  valorTotal: number;
  valorEntrada: number;
  totalParcelas: number;
  taxaJurosAnual: number;
  /** 'yyyy-MM-dd' — o vencimento da parcela 1, exatamente */
  dataPrimeiraParcela: string;
  mesesPorParcela: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

export function montarCronograma(e: EntradaDoCronograma): ParcelaDoCronograma[] {
  if (!e.valorTotal || !e.totalParcelas || !e.dataPrimeiraParcela) return [];
  const financiado = e.valorTotal - (e.valorEntrada || 0);
  const base = centavos(financiado / e.totalParcelas);
  const taxaMensal = e.taxaJurosAnual > 0 ? Math.pow(1 + e.taxaJurosAnual / 100, 1 / 12) - 1 : 0;
  const taxaPeriodo = taxaMensal > 0 ? Math.pow(1 + taxaMensal, e.mesesPorParcela) - 1 : 0;
  const juros = centavos((financiado / e.totalParcelas) * taxaPeriodo);
  const primeira = new Date(e.dataPrimeiraParcela + 'T12:00:00');
  const ultima = centavos(financiado - base * (e.totalParcelas - 1));
  return Array.from({ length: e.totalParcelas }, (_, i) => ({
    numero: i + 1,
    data_vencimento: format(addMonths(primeira, i * e.mesesPorParcela), 'yyyy-MM-dd'),
    valor_principal: i === e.totalParcelas - 1 ? ultima : base,
    valor_juros: juros,
  }));
}

/** A linha de `financiamento_parcelas` de cada parcela — com o total, nunca deixado para o default do banco. */
export function linhasDasParcelas(financiamentoId: string, clienteId: string, parcelas: ParcelaDoCronograma[]) {
  return parcelas.map(p => {
    const principal = Number(p.valor_principal) || 0;
    const juros = Number(p.valor_juros) || 0;
    return {
      financiamento_id: financiamentoId,
      cliente_id: clienteId,
      numero_parcela: p.numero,
      data_vencimento: p.data_vencimento,
      valor_principal: principal,
      valor_juros: juros,
      valor_total: centavos(principal + juros),
      status: 'pendente',
    };
  });
}
