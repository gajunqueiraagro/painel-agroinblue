import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  cabecasPorFazenda, ehFazendaAtiva, montarResumoGlobal,
  type CardDoResumo, type FazendaDoResumo, type PastoDoResumo, type ResumoGlobal,
} from '@/lib/pecuaria/fechamentoGlobal';

/**
 * FECH-GLOBAL-RESUMO-01 — as duas leituras do resumo Global do Fechamento Área. Só LÊ; quem decide é `fechamentoGlobal.ts`.
 *   (1) os cards (`fechamento_pastos`) das fazendas ativas, de jan do ano anterior a dez do ano pedido — PAGINADO até o fim
 *       (o maior cliente tem ~980 cards por ano: sem paginar o teto de 1.000 cortaria calado);
 *   (2) os itens dos cards do ÚLTIMO mês fechado de cada fazenda (uma leitura por fazenda), para as cabeças.
 * ⚠ ERRO NÃO VIRA ZERO: falha em (1) = `erro` e nenhum resumo; falha em (2) = a fazenda fica sem cabeças ("—").
 */
const PAGINA = 1000;

export interface FechamentoGlobal {
  resumo: ResumoGlobal | null;
  /** fazenda -> cabeças do último fechamento. Fazenda fora do mapa = "—". */
  cabecas: Map<string, number>;
  lendo: boolean;
  lendoCabecas: boolean;
  erro: string | null;
}

async function lerCards(fazendaIds: string[], ano: number): Promise<CardDoResumo[]> {
  const acc: CardDoResumo[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('fechamento_pastos')
      .select('id, fazenda_id, pasto_id, ano_mes, status')
      .in('fazenda_id', fazendaIds)
      .gte('ano_mes', `${ano - 1}-01`)
      .lte('ano_mes', `${ano}-12`)
      .order('id')
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      acc.push({ id: r.id, fazenda_id: r.fazenda_id, pasto_id: r.pasto_id, ano_mes: r.ano_mes, status: String(r.status ?? '') });
    }
    if (!data || data.length < PAGINA) break;
  }
  return acc;
}

async function lerItens(fazendaId: string, anoMes: string): Promise<{ fechamento_id: string; quantidade: number }[]> {
  const acc: { fechamento_id: string; quantidade: number }[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('fechamento_pasto_itens')
      .select('id, fechamento_id, quantidade, fechamento_pastos!inner(fazenda_id, ano_mes)')
      .eq('fechamento_pastos.fazenda_id', fazendaId)
      .eq('fechamento_pastos.ano_mes', anoMes)
      .order('id')
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) acc.push({ fechamento_id: r.fechamento_id, quantidade: Number(r.quantidade) || 0 });
    if (!data || data.length < PAGINA) break;
  }
  return acc;
}

export function useFechamentoGlobal(params: {
  enabled: boolean;
  fazendas: readonly FazendaDoResumo[];
  pastos: readonly PastoDoResumo[];
  ano: number;
  mes: number;
}): FechamentoGlobal {
  const { enabled, fazendas, pastos, ano, mes } = params;
  const ids = useMemo(
    () => fazendas.filter(f => f.id !== '__global__' && ehFazendaAtiva(f)).map(f => f.id).sort(),
    [fazendas]);
  const chave = `${ids.join(',')}|${ano}`;
  const [cards, setCards] = useState<{ chave: string; linhas: CardDoResumo[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [itens, setItens] = useState<{ chave: string; mapa: Map<string, number> } | null>(null);

  useEffect(() => {
    if (!enabled || ids.length === 0) return;
    let cancelado = false;
    setErro(null);
    lerCards(ids, ano).then(
      linhas => { if (!cancelado) setCards({ chave, linhas }); },
      e => { if (!cancelado) { setCards(null); setErro(`Não foi possível ler os fechamentos. (${e instanceof Error ? e.message : 'erro'})`); } },
    );
    return () => { cancelado = true; };
    // `ids` entra pela `chave`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, chave, ano]);

  const cardsDaChave = cards && cards.chave === chave ? cards.linhas : null;
  const resumo = useMemo(
    () => (enabled && cardsDaChave ? montarResumoGlobal({ fazendas, pastos, cards: cardsDaChave, ano, mes }) : null),
    [enabled, cardsDaChave, fazendas, pastos, ano, mes]);

  /* O que as cabeças pedem: fazenda + mês do último fechamento. Só relê quando isso muda. */
  const pedidos = useMemo(
    () => (resumo ? resumo.linhas.filter(l => l.ultimo).map(l => `${l.fazendaId}@${l.ultimo?.anoMes ?? ''}`).sort().join(',') : ''),
    [resumo]);

  useEffect(() => {
    if (!enabled || !resumo || !pedidos) return;
    let cancelado = false;
    const linhas = resumo.linhas.filter(l => l.ultimo);
    Promise.all(linhas.map(async l => {
      try { return { l, itens: await lerItens(l.fazendaId, l.ultimo?.anoMes ?? '') }; } catch { return { l, itens: null }; }
    })).then(lidas => {
      if (cancelado) return;
      const mapa = new Map<string, number>();
      for (const { l, itens: its } of lidas) {
        if (!its) continue; // leitura falhou: a fazenda fica sem cabeças ("—")
        const v = cabecasPorFazenda([l], its).get(l.fazendaId);
        if (v !== undefined) mapa.set(l.fazendaId, v);
      }
      setItens({ chave: `${chave}|${pedidos}`, mapa });
    });
    return () => { cancelado = true; };
    // `resumo` entra por `pedidos` (o mesmo pedido não relê)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, chave, pedidos]);

  const itensDaChave = itens && itens.chave === `${chave}|${pedidos}` ? itens.mapa : null;
  const vazio = useMemo(() => new Map<string, number>(), []);
  return {
    resumo,
    cabecas: itensDaChave ?? vazio,
    lendo: enabled && ids.length > 0 && !cardsDaChave && !erro,
    lendoCabecas: enabled && !!resumo && !!pedidos && !itensDaChave,
    erro,
  };
}
