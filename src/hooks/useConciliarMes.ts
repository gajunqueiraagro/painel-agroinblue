/**
 * A conciliação do mês inteiro, numa chamada — [CONCIL-MES-01] (envelope 130).
 *
 * ⚠ NASCE DE UM DEFEITO MEDIDO. O "Lançar todos os sem vínculo" criava um lançamento cru
 * para CADA movimento do extrato, sem prévia e sem olhar o que o sistema já tinha. Na
 * Sicredi Pessoal do NJ em ago/2026: 107 movimentos do banco, 31 lançamentos já existentes
 * sem vínculo — o botão criaria 107 crus por cima, e os 31 virariam duplicata.
 *
 * ⚠ A RPC É O ÚNICO GRAVADOR, e agora é UMA chamada atômica: `fn_extrato_conciliar_mes`
 * decide sozinha o que substitui e o que entra cru, na mesma transação. O laço no front
 * morreu junto com o botão antigo — ele era um segundo lugar onde a regra vivia.
 *
 * ⚠ SIMULAR NÃO É PREVISÃO, É A MESMA CONTA. `p_simular = true` percorre o mesmo caminho e
 * devolve o mesmo formato, sem gravar (só `lancamento_id` vem nulo nos crus). É por isso
 * que a prévia pode prometer o que vai acontecer — montá-la no front seria a segunda
 * resposta, e ela divergiria na primeira mudança da RPC.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface CruConciliar {
  extratoId: string;
  lancamentoId: string | null;
  dataBanco: string | null;
  /** Com sinal: negativo é saída. */
  valorBanco: number;
  historicoBanco: string | null;
  documentoBanco: string | null;
  importacaoId: string | null;
  /** 2+ candidatos no sistema: a RPC não adivinha e entra cru. */
  ambiguo: boolean;
}

export interface SubstituidoConciliar {
  extratoId: string;
  lancamentoId: string;
  dataBanco: string | null;
  valorBanco: number;
  historicoBanco: string | null;
  documentoBanco: string | null;
  descricao: string | null;
  subcentro: string | null;
  origemLancamento: string | null;
  antes: { dataPagamento: string | null; dataVencimento: string | null; valor: number | null; statusTransacao: string | null };
  depois: { dataPagamento: string | null; valor: number | null; statusTransacao: string | null };
}

export interface SemParConciliar {
  lancamentoId: string;
  data: string | null;
  valor: number;
  descricao: string | null;
  subcentro: string | null;
  statusTransacao: string | null;
  origemLancamento: string | null;
}

export interface SaldoConciliar {
  inicial: number | null;
  movimentosExtrato: number | null;
  finalCalculado: number | null;
  finalDigitado: number | null;
  /** `null` quando falta saldo do mês — e "não sei" não é "não confere". */
  confere: boolean | null;
}

export interface PreviaConciliarMes {
  simulado: boolean;
  movimentosExtrato: number;
  jaConciliados: number;
  crus: CruConciliar[];
  crusTotal: number;
  substituidos: SubstituidoConciliar[];
  substituidosTotal: number;
  semPar: SemParConciliar[];
  semParTotal: number;
  ambiguos: number;
  saldo: SaldoConciliar;
}

/* ⚠ NARROWING, NÃO CAST — o retorno é `jsonb`. Perguntar antes de ler é o que faz a tela
   dizer "não sei" em vez de quebrar, se a RPC um dia responder outra coisa. */
const obj = (j: Json | null | undefined): Record<string, Json> | null =>
  j && typeof j === 'object' && !Array.isArray(j) ? j : null;
const num = (j: Json | undefined): number => { const n = Number(j); return Number.isFinite(n) ? n : 0; };
const numOuNulo = (j: Json | undefined): number | null => {
  if (j == null) return null;
  const n = Number(j); return Number.isFinite(n) ? n : null;
};
const txt = (j: Json | undefined): string | null => (typeof j === 'string' ? j : null);
const lista = (j: Json | undefined): Record<string, Json>[] =>
  Array.isArray(j) ? j.flatMap(i => { const o = obj(i); return o ? [o] : []; }) : [];

function daPrevia(j: Json | null): PreviaConciliarMes | null {
  const e = obj(j);
  if (!e || e.ok !== true) return null;
  const s = obj(e.saldo);
  return {
    simulado: e.simulado === true,
    movimentosExtrato: num(e.movimentos_extrato),
    jaConciliados: num(e.ja_conciliados),
    crus: lista(e.crus).map(c => ({
      extratoId: String(c.extrato_id), lancamentoId: txt(c.lancamento_id),
      dataBanco: txt(c.data_banco), valorBanco: num(c.valor_banco),
      historicoBanco: txt(c.historico_banco), documentoBanco: txt(c.documento_banco),
      importacaoId: txt(c.importacao_id), ambiguo: c.ambiguo === true,
    })),
    crusTotal: num(e.crus_total),
    substituidos: lista(e.substituidos).map(x => {
      const a = obj(x.antes) ?? {}; const d = obj(x.depois) ?? {};
      return {
        extratoId: String(x.extrato_id), lancamentoId: String(x.lancamento_id),
        dataBanco: txt(x.data_banco), valorBanco: num(x.valor_banco),
        historicoBanco: txt(x.historico_banco), documentoBanco: txt(x.documento_banco),
        descricao: txt(x.descricao), subcentro: txt(x.subcentro), origemLancamento: txt(x.origem_lancamento),
        antes: {
          dataPagamento: txt(a.data_pagamento), dataVencimento: txt(a.data_vencimento),
          valor: numOuNulo(a.valor), statusTransacao: txt(a.status_transacao),
        },
        depois: {
          dataPagamento: txt(d.data_pagamento), valor: numOuNulo(d.valor), statusTransacao: txt(d.status_transacao),
        },
      };
    }),
    substituidosTotal: num(e.substituidos_total),
    semPar: lista(e.sem_par).map(x => ({
      lancamentoId: String(x.lancamento_id), data: txt(x.data), valor: num(x.valor),
      descricao: txt(x.descricao), subcentro: txt(x.subcentro),
      statusTransacao: txt(x.status_transacao), origemLancamento: txt(x.origem_lancamento),
    })),
    semParTotal: num(e.sem_par_total),
    ambiguos: lista(e.ambiguos).length,
    saldo: {
      inicial: numOuNulo(s?.inicial), movimentosExtrato: numOuNulo(s?.movimentos_extrato),
      finalCalculado: numOuNulo(s?.final_calculado), finalDigitado: numOuNulo(s?.final_digitado),
      /* ⚠ `null` SOBREVIVE: sem saldo do mês a RPC devolve `null`, e "não sei" não pode
         virar `false` — a tela mostra âmbar, não vermelho. */
      confere: s?.confere == null ? null : s.confere === true,
    },
  };
}

export interface ConciliarMesApi {
  simulando: boolean;
  gravando: boolean;
  simular: (clienteId: string, contaId: string, anoMes: string) => Promise<PreviaConciliarMes | null>;
  gravar: (clienteId: string, contaId: string, anoMes: string) => Promise<PreviaConciliarMes | null>;
  /** A mensagem crua do Postgres quando a RPC recusou. `null` quando não houve erro. */
  erro: string | null;
}

export function useConciliarMes(): ConciliarMesApi {
  const [simulando, setSimulando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const chamar = useCallback(async (
    clienteId: string, contaId: string, anoMes: string, simular: boolean,
  ): Promise<PreviaConciliarMes | null> => {
    setErro(null);
    try {
      const { data, error } = await supabase.rpc('fn_extrato_conciliar_mes', {
        p_cliente_id: clienteId, p_conta_bancaria_id: contaId, p_ano_mes: anoMes, p_simular: simular,
      });
      if (error) throw error;
      const p = daPrevia(data);
      if (!p) throw new Error('A prévia não voltou no formato esperado.');
      return p;
    } catch (e) {
      /* ⚠ A MENSAGEM DO POSTGRES VAI SEM TRADUZIR — ela nomeia o invariante violado (mês
         fechado, conta sem fazenda, sem permissão) e é mais precisa que qualquer texto
         nosso. É a mesma decisão do `LancarMesEmMassa` que este fluxo substitui. */
      setErro(e instanceof Error ? e.message : 'Falha ao conciliar o mês.');
      return null;
    }
  }, []);

  const simular = useCallback(async (clienteId: string, contaId: string, anoMes: string) => {
    setSimulando(true);
    try { return await chamar(clienteId, contaId, anoMes, true); } finally { setSimulando(false); }
  }, [chamar]);

  const gravar = useCallback(async (clienteId: string, contaId: string, anoMes: string) => {
    setGravando(true);
    try { return await chamar(clienteId, contaId, anoMes, false); } finally { setGravando(false); }
  }, [chamar]);

  return { simulando, gravando, simular, gravar, erro };
}
