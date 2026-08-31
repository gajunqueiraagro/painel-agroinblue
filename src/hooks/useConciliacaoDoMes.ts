import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * useConciliacaoDoMes — os dados da tela de conciliação do extrato.
 * FIN-CONCIL-PORTAR-01, rodada 1. Portado do `AllinBlues/financas`
 * (`use-extrato.ts` / `extrato.repository.ts`), com a fonte trocada.
 *
 * ⚠ CLASSIFICAÇÃO VÍNCULO-FIRST, e é a regra que este arquivo existe para
 * garantir: `conciliado` NÃO é heurística — é a soma dos `valor_aplicado`
 * ATIVOS cobrindo o valor do movimento, com a tolerância de R$ 0,005. A tela
 * nunca adivinha grupo, e nenhum balde de sugestão vira vínculo.
 *
 * ⚠ OS TRÊS BALDES DE SUGESTÃO VÊM DE OUTRO LUGAR — match direto, provável e
 * ambíguo saem de `fn_sugestoes_extrato` (o motor portado, aplicado em 31/08), e
 * são carregados SOB DEMANDA por `useSugestoesDoMes`. Enquanto o operador não
 * pede, eles ficam AUSENTES na tela — e ausente não é zero: dizer "0 prováveis"
 * afirmaria que o motor olhou e não achou, quando ele ainda não olhou.
 *
 * ⚠ VIVO É O QUE NÃO FOI CANCELADO NEM IGNORADO. O Proto separa os dois de
 * propósito — cancelado é o movimento que não existe, ignorado é o que existe e
 * foi desconsiderado —, e colapsá-los num só perderia a distinção que o schema
 * faz. Ambos ficam fora da conciliação.
 */

export type SituacaoMovimento = 'conciliado' | 'parcial' | 'nao_conciliado';

export interface MovimentoConciliacao {
  id: string;
  data_movimento: string;
  descricao: string | null;
  documento: string | null;
  valor: number;
  valorConciliado: number;
  valorAberto: number;
  situacao: SituacaoMovimento;
}

export interface VinculoDoMovimento {
  id: string;
  lancamentoId: string;
  valorAplicado: number;
  lancamentoDescricao: string | null;
  lancamentoData: string | null;
  lancamentoValor: number | null;
  favorecido: string | null;
}

/** A tolerância do dinheiro nesta tela — a mesma do briefing e do banco. */
export const TOL = 0.005;

export interface ContagemBaldes {
  todos: number;
  conciliado: number;
  parcial: number;
  sem_vinculo: number;
  /* ⚠ NULOS ENQUANTO O MOTOR NÃO RODOU, e não zero: `null` diz "não perguntei",
     `0` diria "perguntei e não há". A tela imprime coisas diferentes para os
     dois, porque são respostas diferentes. */
  match_direto: number | null;
  provavel: number | null;
  ambiguo: number | null;
  sem_match: number | null;
}

/**
 * ⚠ O CONTADOR E A LISTA SAEM DO MESMO CAMPO — a regra que o original documenta
 * e o motivo de `fn_sugestoes_extrato` existir. Os três baldes de sugestão
 * contam o `estado` que a RPC devolveu; nada é recalculado aqui. Repetir o
 * predicado no front seria concordância por manutenção manual.
 * ⚠ E CONCILIADO/PARCIAL CONTINUAM SAINDO DO VÍNCULO, mesmo com o motor ligado:
 * a situação é a verdade do banco, e o score nunca define pendência.
 */
export function contarBaldes(
  movs: readonly MovimentoConciliacao[],
  sugestoes?: readonly { extratoId: string; estado: string }[] | null,
): ContagemBaldes {
  const c: ContagemBaldes = {
    todos: movs.length, conciliado: 0, parcial: 0, sem_vinculo: 0,
    match_direto: null, provavel: null, ambiguo: null, sem_match: null,
  };
  for (const m of movs) {
    if (m.situacao === 'conciliado') c.conciliado += 1;
    else if (m.situacao === 'parcial') c.parcial += 1;
    else c.sem_vinculo += 1;
  }
  if (sugestoes) {
    c.match_direto = 0; c.provavel = 0; c.ambiguo = 0; c.sem_match = 0;
    for (const s of sugestoes) {
      if (s.estado === 'match_direto') c.match_direto += 1;
      else if (s.estado === 'provavel') c.provavel += 1;
      else if (s.estado === 'ambiguo') c.ambiguo += 1;
      else if (s.estado === 'sem_match') c.sem_match += 1;
    }
  }
  return c;
}

/**
 * O rodapé — traduzido do `palco.ts` do original, com a condição adaptada ao
 * que o Proto sabe hoje.
 *
 * ⚠ "MÊS CONFERIDO" EXIGE ZERO EM ABERTO E ZERO PARCIAL. No original ele exige
 * também o resíduo do outro lado (lançamentos com saldo), porque um mês onde o
 * extrato fecha e o ledger sangra NÃO está conferido. Aqui esse resíduo ainda
 * não é medido — então a frase diz o que sabe, e não mais do que isso.
 */
export function frameDoRodape(c: ContagemBaldes): string {
  if (c.todos === 0) return 'Nenhum movimento importado neste mês.';
  const emAberto = c.sem_vinculo;
  if (emAberto === 0 && c.parcial === 0) {
    return `Mês conferido · ${c.todos} movimento${c.todos === 1 ? '' : 's'} · nenhuma ação necessária.`;
  }
  const partes = [`${c.todos} movimento${c.todos === 1 ? '' : 's'}`];
  if (c.conciliado > 0) partes.push(`${c.conciliado} conciliado${c.conciliado === 1 ? '' : 's'}`);
  if (c.parcial > 0) partes.push(`${c.parcial} parcial${c.parcial === 1 ? '' : 'is'}`);
  if (emAberto > 0) partes.push(`${emAberto} a resolver`);
  return partes.join(' · ');
}

/** Primeiro dia do mês e primeiro dia do mês seguinte — fim EXCLUSIVO, como o resto do sistema. */
export function faixaDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  const ini = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1));
  return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

export function useConciliacaoDoMes(
  clienteId: string | null, contaId: string | null, ano: number, mes: number,
) {
  const [movimentos, setMovimentos] = useState<MovimentoConciliacao[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId || !contaId) { setMovimentos([]); return; }
    setLoading(true);
    try {
      const { inicio, fim } = faixaDoMes(ano, mes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
      const { data: linhas } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('id, data_movimento, descricao, documento, valor')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .is('cancelado_em', null)
        .is('ignorado_em', null)
        .gte('data_movimento', inicio)
        .lt('data_movimento', fim)
        .order('data_movimento');
      const movs: { id: string; data_movimento: string; descricao: string | null; documento: string | null; valor: number }[] = linhas ?? [];
      if (movs.length === 0) { setMovimentos([]); return; }

      /* ⚠ UMA CONSULTA PARA O CONJUNTO, nunca uma por linha: os vínculos vêm em
         lote pelos ids já carregados. É o mesmo cuidado que a Central declara
         no topo dela — zero N+1, requests fixos. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data: vinc } = await (supabase as any)
        .from('conciliacao_bancaria_itens')
        .select('extrato_id, valor_aplicado')
        .in('extrato_id', movs.map(m => m.id))
        .is('desfeito_em', null);
      const aplicadoPorMov: Record<string, number> = {};
      for (const v of (vinc ?? []) as { extrato_id: string; valor_aplicado: number }[]) {
        aplicadoPorMov[v.extrato_id] = (aplicadoPorMov[v.extrato_id] ?? 0) + Number(v.valor_aplicado ?? 0);
      }

      setMovimentos(movs.map(m => {
        const valor = Number(m.valor ?? 0);
        const aplicado = aplicadoPorMov[m.id] ?? 0;
        const aberto = Math.abs(valor) - aplicado;
        /* A MESMA precedência da view do original: coberto vence, depois
           parcial, depois não conciliado. O fato manda; heurística nenhuma. */
        const situacao: SituacaoMovimento =
          aplicado <= TOL ? 'nao_conciliado'
          : aberto <= TOL ? 'conciliado'
          : 'parcial';
        return {
          id: m.id, data_movimento: m.data_movimento, descricao: m.descricao,
          documento: m.documento, valor,
          valorConciliado: aplicado, valorAberto: Math.max(0, aberto), situacao,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [clienteId, contaId, ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);
  return { movimentos, loading, recarregar: carregar };
}

/** Os vínculos ATIVOS de um movimento — a tabela "Vínculos deste movimento". */
export type EstadoSugestao = 'match_direto' | 'provavel' | 'ambiguo' | 'sem_match';
export interface SugestaoDoMes { extratoId: string; estado: string }

/**
 * AS SUGESTÕES DO MÊS — `fn_sugestoes_extrato`, o motor portado.
 *
 * ⚠ SOB DEMANDA, E A MEDIÇÃO É QUE DECIDIU. A função chama
 * `fn_candidatos_conciliacao` por LATERAL uma vez POR MOVIMENTO, e cada chamada
 * custa ~91 ms medidos no Proto (EXPLAIN ANALYZE, agosto/2026): 31 movimentos já
 * dão ~2,8 s, 58 dão ~5,3 s no banco — e mais que isso pelo canal. Carregar
 * automático ao abrir o mês faria a tela parecer travada toda vez que alguém só
 * queria ver a lista.
 *
 * ⚠ O GARGALO NÃO É O QUE PARECIA. Medido no plano: 92% do tempo está num
 * `Bitmap Index Scan` sobre `idx_fin_lanc_v2_cliente` (30.460 linhas, 83,5 ms),
 * que o planejador cruza por `BitmapAnd` com o índice de conta — este, sim,
 * seletivo (1.378 linhas, 0,1 ms). Um índice COMPOSTO `(cliente_id,
 * conta_bancaria_id)` dispensaria o cruzamento. Índice é migration; enquanto ele
 * não vem, quem manda no custo é o operador.
 *
 * ⚠ ERRO NÃO VIRA TELA VAZIA: sem sugestões, os três baldes voltam a aparecer
 * como ausentes — que é o estado honesto de "o motor não respondeu".
 */
export function useSugestoesDoMes(
  clienteId: string | null, contaId: string | null, ano: number, mes: number,
) {
  const [sugestoes, setSugestoes] = useState<SugestaoDoMes[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  /* Trocar de mês/conta ZERA o que estava calculado: manter o placar do mês
     anterior sobre a lista do mês novo seria a pior mentira possível aqui. */
  useEffect(() => { setSugestoes(null); }, [clienteId, contaId, ano, mes]);

  const calcular = useCallback(async () => {
    if (!clienteId || !contaId) return;
    setCarregando(true);
    try {
      const { inicio, fim } = faixaDoMes(ano, mes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_sugestoes_extrato', {
        p_cliente_id: clienteId, p_conta_bancaria_id: contaId, p_de: inicio, p_ate: fim,
      });
      if (error) { setSugestoes(null); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas da RPC, fora de types.ts
      setSugestoes((data ?? []).map((r: any) => ({ extratoId: r.extrato_id, estado: r.estado })));
    } finally {
      setCarregando(false);
    }
  }, [clienteId, contaId, ano, mes]);

  return { sugestoes, carregando, calcular };
}

export function useVinculosDoMovimento(extratoId: string | null) {
  const [vinculos, setVinculos] = useState<VinculoDoMovimento[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!extratoId) { setVinculos([]); return; }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('conciliacao_bancaria_itens')
        .select('id, lancamento_id, valor_aplicado, financeiro_lancamentos_v2(descricao, data_pagamento, data_vencimento, data_competencia, valor, financeiro_fornecedores(nome))')
        .eq('extrato_id', extratoId)
        .is('desfeito_em', null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas da view, fora de types.ts
      setVinculos((data ?? []).map((r: any) => {
        const l = r.financeiro_lancamentos_v2;
        return {
          id: r.id,
          lancamentoId: r.lancamento_id,
          valorAplicado: Number(r.valor_aplicado ?? 0),
          lancamentoDescricao: l?.descricao ?? null,
          /* A ÂNCORA DE DATA é a mesma do motor de candidatos: pagamento,
             vencimento, competência — nessa ordem. Escrever outra aqui faria a
             tabela dos vínculos e a dos candidatos mostrarem datas diferentes
             para o mesmo lançamento. */
          lancamentoData: l?.data_pagamento ?? l?.data_vencimento ?? l?.data_competencia ?? null,
          lancamentoValor: l?.valor == null ? null : Number(l.valor),
          favorecido: l?.financeiro_fornecedores?.nome ?? null,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [extratoId]);

  useEffect(() => { carregar(); }, [carregar]);
  return { vinculos, loading, recarregar: carregar };
}
