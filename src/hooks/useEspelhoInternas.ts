/**
 * CONTA INTERNA — PR-ESPELHO-07 itens C e D.
 *
 * ⚠ O QUE É "INTERNA" É CADASTRO, NÃO HEURÍSTICA. O banco CONSOLIDA o saldo de algumas
 * contas na conta corrente e NÃO exporta as transferências entre elas — a Invest Fácil do
 * Agnaldo é uma. Ler isso do dado levaria a uma correlação frágil: medindo agosto/2026, as
 * 17 transferências da Invest Fácil estavam 17/17 sem par enquanto Renda Fixa, CDB e os
 * cartões estavam 100% pareados, e seria tentador chamar "sem par + conta sem extrato no
 * mês" de regra. Mas isso é o EFEITO, não a causa: elas nunca pareiam PORQUE o banco não as
 * exporta, e no dia em que uma delas parear por acaso a regra derivada se cala. A coluna
 * `consolida_em_conta_id` diz a causa, e é ela que manda.
 *
 * ⚠ E A DIFERENÇA NÃO É TEÓRICA: Renda Fixa, CDB, Cartão Elo e Mastercard TAMBÉM não têm
 * extrato próprio no mês. Um critério de "conta sem extrato" excluiria as quatro e derrubaria
 * as entradas de agosto de 2.998.236,25 para 982.521,33 — o número deixaria de bater com o
 * banco. Só a Invest Fácil sai, porque só ela é consolidada.
 *
 * ⚠ O SALDO DO EXTRATO É A SOMA. O extrato do Bradesco mostra a conta corrente JUNTO com a
 * Invest Fácil: 1,00 + 238.790,26 = 238.791,26 em 31/07. Comparar o extrato com o saldo da
 * conta sozinha acusaria uma divergência de 238.790,26 que não existe.
 *
 * ⚠ FALTOU UM SALDO, O RESULTADO É "—". Somar só as contas que têm linha daria um número
 * MENOR e com cara de certo — e a sentinela do CLAUDE.md existe para isto: ausência é traço,
 * nunca um total silenciosamente incompleto.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EspelhoInternas {
  /** As contas que o banco consolida nesta — vazio quando não há nenhuma. */
  contasInternas: ReadonlySet<string>;
  /** Lançamentos de transferência entre esta conta e uma interna. */
  lancamentosInternos: ReadonlySet<string>;
  /** Saldo informado do mês ANTERIOR, conta + internas. `null` = alguma faltou. */
  saldoInicialConsolidado: number | null;
  /** Saldo informado DO MÊS, conta + internas. `null` = alguma faltou. */
  saldoInformadoConsolidado: number | null;
}

const VAZIO: EspelhoInternas = {
  contasInternas: new Set(),
  lancamentosInternos: new Set(),
  saldoInicialConsolidado: null,
  saldoInformadoConsolidado: null,
};

const TRANSFERENCIA = '3-Transferências';

function mesAnterior(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

function ultimoDia(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  return `${anoMes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
}

export function useEspelhoInternas(
  clienteId: string | null | undefined,
  contaId: string | null | undefined,
  anoMes: string,
): EspelhoInternas {
  const { data } = useQuery({
    queryKey: ['espelho-internas', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EspelhoInternas> => {
      /* O `enabled` já impede a chamada sem os dois; a guarda existe para o compilador saber
         disso sem um `!` de não-nulo — o `as` que a regra zero-cast proíbe. */
      if (!clienteId || !contaId) return VAZIO;

      const { data: contas, error: erroContas } = await supabase
        .from('financeiro_contas_bancarias')
        .select('id')
        .eq('cliente_id', clienteId)
        .eq('consolida_em_conta_id', contaId);
      if (erroContas) throw erroContas;
      const internas = new Set((contas ?? []).map((c) => c.id));

      /* Sem conta interna nenhuma não há o que ler adiante: o saldo do extrato é o da própria
         conta, e nenhuma transferência é interna. Duas consultas economizadas na maioria. */
      const anterior = mesAnterior(anoMes);
      const contasDoSaldo = [contaId, ...internas];

      const { data: saldos, error: erroSaldos } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('conta_bancaria_id, ano_mes, saldo_final')
        .eq('cliente_id', clienteId)
        .in('conta_bancaria_id', contasDoSaldo)
        .in('ano_mes', [anoMes, anterior]);
      if (erroSaldos) throw erroSaldos;

      const somaDoMes = (mes: string): number | null => {
        let total = 0;
        for (const conta of contasDoSaldo) {
          const linha = (saldos ?? []).find((s) => s.conta_bancaria_id === conta && s.ano_mes === mes);
          if (!linha || linha.saldo_final == null) return null;
          total += Number(linha.saldo_final);
        }
        return total;
      };

      if (internas.size === 0) {
        return {
          contasInternas: internas,
          lancamentosInternos: new Set(),
          saldoInicialConsolidado: somaDoMes(anterior),
          saldoInformadoConsolidado: somaDoMes(anoMes),
        };
      }

      /* ⚠ A RPC DO ESPELHO NÃO DEVOLVE `tipo_operacao` NEM AS DUAS CONTAS, e é só por isso
         que esta leitura existe. Ela não recalcula nada: pergunta quais lançamentos do mês
         ligam esta conta a uma interna, e devolve os ids. */
      const lista = [...internas].join(',');
      const { data: lancs, error: erroLancs } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, conta_bancaria_id, conta_destino_id')
        .eq('cliente_id', clienteId)
        .eq('tipo_operacao', TRANSFERENCIA)
        .eq('cancelado', false)
        .gte('data_pagamento', `${anoMes}-01`)
        .lte('data_pagamento', ultimoDia(anoMes))
        .or(`and(conta_bancaria_id.eq.${contaId},conta_destino_id.in.(${lista})),`
          + `and(conta_destino_id.eq.${contaId},conta_bancaria_id.in.(${lista}))`);
      if (erroLancs) throw erroLancs;

      return {
        contasInternas: internas,
        lancamentosInternos: new Set((lancs ?? []).map((l) => l.id)),
        saldoInicialConsolidado: somaDoMes(anterior),
        saldoInformadoConsolidado: somaDoMes(anoMes),
      };
    },
  });

  return data ?? VAZIO;
}
