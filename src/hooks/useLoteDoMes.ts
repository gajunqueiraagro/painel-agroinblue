import { useCallback, useEffect, useMemo, useState } from 'react';
import { pastosAtivosNoMes, type Pasto } from '@/hooks/usePastos';
import { semAreaDaFazenda } from '@/lib/pastos/areaDaFazenda';
import type { FechamentoPasto } from '@/hooks/useFechamento';
import { isPastoDivergencia } from '@/lib/classificacaoArea';
import { useGruposDePastejo } from '@/components/pastos/GruposDePastejo';
import type { ContextoDoLote } from '@/components/fechamento/OndeOLoteEsteve';
import { API_LOTE_NO_GRUPO, alocacaoDoCard, quemRecebe, type AlocacaoDoMes, type LotacaoDoPasto, type PastoDoLote } from '@/lib/fechamento/loteNoGrupo';
import { areaNoMesOuHoje, useAreaDosPastosNoMes } from '@/lib/pastos/areaDoPastoNoMes';

/**
 * MAPA-LOTES-01 fatia 1 — o grupo de pastejo do mês e o contexto do lote do modal do pasto, numa peça só. Saiu do `FechamentoTab`
 * (FECH-ROTACAO-01 fatia 3) sem mudar uma linha: o Fechamento, o Mapa de pastos e o Geo pastos montam o MESMO modal do P1 com o
 * MESMO contexto (`useModalDoPasto`). `pastosAtivos` = os pastos do mês na ordem dos cards (`pastosDoFechamentoNoMes`).
 */
export function useLoteDoMes(fazendaDoMes: string | null, anoMes: string, pastosAtivos: readonly Pasto[], fechamentos: readonly FechamentoPasto[]) {
  const { grupos: gruposDePastejo } = useGruposDePastejo(fazendaDoMes);
  /* a área de cada pasto NO MÊS (PASTO-AREA-OFICIAL-02a): enquanto não lê, a de hoje (`areaNoMesOuHoje`) */
  const fazendasDaArea = useMemo(() => (fazendaDoMes ? [fazendaDoMes] : []), [fazendaDoMes]);
  const { areaDe } = useAreaDosPastosNoMes(fazendasDaArea, anoMes, anoMes);
  const paraLote = useCallback((p: Pasto): PastoDoLote => ({ id: p.id, nome: p.nome, grupo_id: p.grupo_id ?? null, area: areaNoMesOuHoje(p, anoMes, areaDe) }), [anoMes, areaDe]);
  const [lotacaoDoMes, setLotacaoDoMes] = useState<Map<string, LotacaoDoPasto>>(new Map());
  const [alocacoesDoMes, setAlocacoesDoMes] = useState<AlocacaoDoMes[]>([]);
  useEffect(() => {
    if (!fazendaDoMes) { setLotacaoDoMes(new Map()); setAlocacoesDoMes([]); return; }
    let vivo = true;
    void Promise.all([API_LOTE_NO_GRUPO.lotacaoDoMes(fazendaDoMes, anoMes), API_LOTE_NO_GRUPO.alocacoesDoMes(fazendaDoMes, anoMes)]).then(([l, a]) => {
      if (!vivo) return;
      setLotacaoDoMes(l.ok ? l.dados : new Map());
      setAlocacoesDoMes(a.ok ? a.dados : []);
    });
    return () => { vivo = false; };
  }, [fazendaDoMes, anoMes, fechamentos]);
  /** os membros VIGENTES no mês de cada grupo ativo com 2 ou mais pastos (um grupo de 1 no mês não vira moldura) */
  const membrosPorGrupo = useMemo(() => {
    const ativos = new Map(gruposDePastejo.filter(g => g.ativo).map(g => [g.id, g.nome]));
    const mapa = new Map<string, { nome: string; membros: Pasto[] }>();
    for (const p of pastosAtivos) {
      const nome = p.grupo_id ? ativos.get(p.grupo_id) : undefined;
      if (!p.grupo_id || !nome) continue;
      const atual = mapa.get(p.grupo_id) ?? { nome, membros: [] };
      atual.membros.push(p);
      mapa.set(p.grupo_id, atual);
    }
    for (const [id, g] of mapa) if (g.membros.length < 2) mapa.delete(id);
    return mapa;
  }, [gruposDePastejo, pastosAtivos]);
  /** quem não recebe lote no mês: card vedado ou fechado */
  const impedidosDoMes = useMemo(() => {
    const mapa = new Map<string, 'vedado' | 'fechado'>();
    for (const f of fechamentos) {
      if (f.tipo_uso_mes === 'vedado') mapa.set(f.pasto_id, 'vedado');
      else if (f.status === 'fechado') mapa.set(f.pasto_id, 'fechado');
    }
    return mapa;
  }, [fechamentos]);
  /** pasto que RECEBE o lote de outro card no mês → os pastos de origem */
  const recebeDe = useMemo(() => quemRecebe(alocacoesDoMes, fechamentos), [alocacoesDoMes, fechamentos]);
  /** o contexto do lote para o modal do pasto (F3-1: por card) */
  const contextoDoLote = useCallback((p: Pasto, fechamentoId: string): ContextoDoLote => {
    const g = p.grupo_id ? membrosPorGrupo.get(p.grupo_id) : undefined;
    const membros = g?.membros ?? [];
    const idsDoGrupo = new Set(membros.map(m => m.id));
    const impedidos = new Map([...impedidosDoMes].filter(([id]) => id !== p.id));
    return {
      proprio: paraLote(p),
      nomeDoGrupo: g?.nome ?? null,
      membros: membros.map(paraLote),
      outrosPastos: pastosAtivos.filter(x => x.id !== p.id && !idsDoGrupo.has(x.id) && !isPastoDivergencia(x.tipo_uso)).map(paraLote),
      impedidos,
      gravada: alocacaoDoCard(alocacoesDoMes, fechamentoId),
    };
  }, [membrosPorGrupo, impedidosDoMes, pastosAtivos, alocacoesDoMes, paraLote]);
  return { lotacaoDoMes, alocacoesDoMes, membrosPorGrupo, impedidosDoMes, recebeDe, paraLote, contextoDoLote, areaDe };
}

/** MAPA-LOTES-01 fatia 1 — os pastos que têm card no mês, na ordem dos cards (o corpo saiu do `pastosAtivos` do `FechamentoTab`, sem mudança). */
export function pastosDoFechamentoNoMes<T extends Pasto>(pastos: T[], anoMes: string): T[] {
      // PR-PASTO-VIGENCIA-02 — esta era a ÚNICA reimplementação inline da regra de
      // vigência, e discordava do helper e do banco: testava data_inicio contra o
      // PRIMEIRO dia do mês e ignorava data_fim, então pasto encerrado em 2024 ainda
      // gerava card em 2026. O dono da regra agora é isPastoAtivoNoMes, espelho de
      // fn_pastos_aplicaveis_mes. entra_conciliacao saiu: foi aposentado.
      /* MAPA-PIQUETE-SUBAREA-01 C1: Reserva, APP e Benfeitorias são área da fazenda desde 11/2026 — fora do fechamento (o banco recusa o card) */
      const filtrados = semAreaDaFazenda(pastosAtivosNoMes(pastos, anoMes), anoMes);
      // Pastos de divergência sempre no FINAL da lista
      const normais = filtrados.filter(p => !isPastoDivergencia(p.tipo_uso));
      const divergencia = filtrados.filter(p => isPastoDivergencia(p.tipo_uso));
      return [...normais, ...divergencia];
}
