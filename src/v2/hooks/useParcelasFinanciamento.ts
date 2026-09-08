/**
 * useParcelasFinanciamento — as parcelas PENDENTES do cliente, e o detector que diz quais
 * delas podem ser o lançamento de extrato que está sem par. [133i-c item 3]
 *
 * ⚠ QUERY DIRETA, E NÃO REUSO DO PAINEL. A única leitura de `financiamento_parcelas` no
 * repo é `useFinanciamentosPainel.ts:171`, que traz o ano inteiro de TODOS os contratos
 * para montar o painel — carregar aquilo para oferecer três candidatas numa linha seria
 * pagar o painel para responder outra pergunta. Aqui a query é estreita: pendentes, com o
 * contrato pelo join (descrição, natureza, credor), e só quando a lista sem par existe.
 *
 * ⚠ O DETECTOR É PURO E EXPORTADO, de propósito: ele decide se uma pílula aparece sobre
 * dinheiro de outra pessoa, e a regra de tolerância é o tipo de coisa que se acerta com
 * teste, não com o olho no proto.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ParcelaCandidata {
  parcela_id: string;
  financiamento_id: string;
  numero_parcela: number;
  total_parcelas: number;
  data_vencimento: string;
  valor_principal: number;
  valor_juros: number;
  valor_total: number;
  contrato_descricao: string;
  natureza: string;
  credor_nome: string | null;
}

/** Dias de folga entre o vencimento da parcela e a data do extrato. */
export const JANELA_DIAS = 10;
/** Faixa fechada em torno do valor da parcela, para o pagamento pontual. */
export const TOLERANCIA_VALOR = 0.02;
/** Teto do pagamento em atraso: juros de mora somam, nunca subtraem. */
export const TETO_ATRASO = 1.5;

function diasEntre(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / 86400000;
}

/**
 * As parcelas que podem ser este lançamento de extrato.
 *
 * ⚠ O PISO É O `valor_total`, E NÃO O `valor_principal` — correção medida no proto.
 * A regra proposta era `valor_principal <= extrato <= valor_total * 1,5`, e com ela um
 * pagamento de ITR de R$ 13.750 casava com uma parcela de R$ 612.000: basta a parcela ter
 * principal pequeno e juros grandes para o piso desabar e a faixa engolir qualquer valor.
 * Quem paga ATRASADO paga MAIS, nunca menos — então o intervalo do atraso começa no total
 * da parcela. A faixa de ±2% continua cobrindo o pagamento pontual (e a diferença de
 * centavos do arredondamento).
 */
export function candidatasParaExtrato(
  extrato: { data: string | null; valor: number | null },
  parcelas: readonly ParcelaCandidata[],
): ParcelaCandidata[] {
  const { data, valor } = extrato;
  if (!data || valor == null || !Number.isFinite(valor)) return [];
  const v = Math.abs(valor);
  if (v <= 0) return [];

  return parcelas.filter((p) => {
    if (diasEntre(p.data_vencimento, data) > JANELA_DIAS) return false;
    const total = p.valor_total;
    if (!(total > 0)) return false;
    const pontual = Math.abs(v - total) <= total * TOLERANCIA_VALOR;
    const atrasado = v >= total && v <= total * TETO_ATRASO;
    return pontual || atrasado;
  });
}

export function useParcelasFinanciamento(clienteId: string | null, habilitado: boolean) {
  return useQuery({
    queryKey: ['parcelas-financiamento-pendentes', clienteId],
    enabled: !!clienteId && habilitado,
    staleTime: 60_000,
    queryFn: async (): Promise<ParcelaCandidata[]> => {
      const { data, error } = await supabase
        .from('financiamento_parcelas')
        .select(`
          id, financiamento_id, numero_parcela, data_vencimento,
          valor_principal, valor_juros,
          financiamentos!inner (
            descricao, natureza, total_parcelas, cliente_id,
            financeiro_fornecedores!financiamentos_credor_id_fkey ( nome )
          )
        `)
        .eq('status', 'pendente')
        .eq('financiamentos.cliente_id', clienteId!)
        .order('data_vencimento');
      if (error) throw error;

      return (data ?? []).map((r) => {
        const f = (r as { financiamentos?: Record<string, unknown> }).financiamentos ?? {};
        const credor = (f.financeiro_fornecedores as { nome?: string } | null) ?? null;
        const principal = Number(r.valor_principal) || 0;
        const juros = Number(r.valor_juros) || 0;
        return {
          parcela_id: r.id,
          financiamento_id: r.financiamento_id,
          numero_parcela: Number(r.numero_parcela) || 0,
          total_parcelas: Number(f.total_parcelas) || 0,
          data_vencimento: r.data_vencimento ?? '',
          valor_principal: principal,
          valor_juros: juros,
          valor_total: principal + juros,
          contrato_descricao: String(f.descricao ?? '—'),
          natureza: String(f.natureza ?? 'financiamento'),
          credor_nome: credor?.nome ?? null,
        };
      });
    },
  });
}
