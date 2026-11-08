/**
 * VISAO-GERAL-03 — o "Mapa das fazendas" do card Área produtiva da Visão Geral (Gabriel 04/11 06:28: "os MAPAS PEQUENOS das fazendas, o
 * mesmo componente da Geo pastos"). Os números e as cores são os da Geo pastos › Global, pelas MESMAS peças, na MESMA ordem que a
 * `MapaGeoPastosTab` as liga no Global: os pastos e os grupos do mês (`unidadesDoMapa`), a leitura do mês (`useMapaDoMes`), o resumo por
 * fazenda (`resumoGlobal`, a regra do Gestor) e a situação de cada pasto (`situacaoDoPasto`). Esta leitura só junta; não conta nada.
 * As fazendas = as com pecuária (fora o Global), como lá; com uma fazenda escolhida, só ela.
 * A ÁREA de cada pasto é a DO MÊS (`useAreaDosPastosNoMes`, a regra da casa para arquivo novo — PASTO-AREA-OFICIAL-02a), e a da unidade
 * (pai + piquetes) entra pelo `comAreaDoMes`. A Geo pastos ainda lê a área de hoje: num mês em que a área de um pasto mudou depois, o
 * kg/ha daqui segue o mês e o de lá, a área de hoje.
 */
import { useCallback, useMemo } from 'react';
import { GLOBAL_FAZENDA, useFazenda } from '@/contexts/FazendaContext';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { useMapaDoMes } from '@/hooks/useMapaDoMes';
import { useGeometriasDasFazendas, type GeometriaDoGlobal } from '@/hooks/useGeometriasDasFazendas';
import { useGruposComOrigem } from '@/hooks/useGruposComOrigem';
import { resumoGlobal, situacaoDoPasto, type LinhaDaFazenda, type Situacao } from '@/lib/mapa/resumoGlobal';
import { unidadesDoMapa } from '@/lib/mapa/unidadesDoMapa';
import { semAreaDaFazenda } from '@/lib/pastos/areaDaFazenda';
import { areaNoMesOuHoje, comAreaDoMes, useAreaDosPastosNoMes } from '@/lib/pastos/areaDoPastoNoMes';

export interface MapaDasFazendas {
  fazendas: LinhaDaFazenda[];
  geometriasPorFazenda: ReadonlyMap<string, GeometriaDoGlobal[]>;
  situacaoDoPasto: (pastoId: string) => Situacao;
  carregando: boolean;
  erro: string | null;
}

export function useMapaDasFazendas(anoMes: string): MapaDasFazendas {
  const { isGlobal, fazendaAtual, fazendasComPecuaria } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendasDoMapa = useMemo(() => (isGlobal
    ? fazendasComPecuaria.filter(f => f.id !== GLOBAL_FAZENDA.id)
    : fazendasComPecuaria.filter(f => f.id === fazendaAtual?.id)), [isGlobal, fazendasComPecuaria, fazendaAtual]);
  const ids = useMemo(() => fazendasDoMapa.map(f => f.id), [fazendasDoMapa]);
  const geos = useGeometriasDasFazendas(ids);
  const { grupos } = useGruposComOrigem(ids);
  const { areaDe: areaDoMes } = useAreaDosPastosNoMes(ids, anoMes || null, anoMes || null);
  const areaDe = useCallback((p: Pasto) => areaNoMesOuHoje(p, anoMes, areaDoMes), [anoMes, areaDoMes]);
  /* MAPA-PIQUETE-SUBAREA-01 C1: a área da fazenda desde 11/2026 não é pasto do mapa */
  const unidades = useMemo(() => unidadesDoMapa<Pasto, GeometriaDoGlobal>({ pastos: semAreaDaFazenda(pastos, anoMes), grupos, poligonos: geos.geometrias, anoMes, areaDe }),
    [pastos, grupos, geos.geometrias, anoMes, areaDe]);
  /* o pasto da unidade leva a área da unidade (a do pai, ou Σ dos piquetes vigentes no mês) */
  const pastosDoMapa = useMemo(() => comAreaDoMes(unidades.pastos, anoMes, (id) => unidades.unidades.get(id)?.areaHa), [unidades, anoMes]);
  const doMes = useMapaDoMes(ids, anoMes, pastosDoMapa, categorias, unidades.unidadeDe);

  const fazendas = useMemo(() => {
    const comPoligono = new Set<string>();
    const fazendasComMapa = new Set<string>();
    for (const g of unidades.poligonos) {
      fazendasComMapa.add(g.fazenda_id);
      if (g.tipo === 'pasto' && g.pasto_id) comPoligono.add(g.pasto_id);
    }
    return resumoGlobal({
      anoMes, fazendas: fazendasDoMapa.map(f => ({ id: f.id, codigo: f.codigo ?? '', nome: f.nome })),
      vigentes: doMes.vigentes, comPoligono, fazendasComMapa, dados: doMes.dados,
    }).fazendas;
  }, [unidades.poligonos, anoMes, fazendasDoMapa, doMes.vigentes, doMes.dados]);
  const geometriasPorFazenda = useMemo(() => {
    const m = new Map<string, GeometriaDoGlobal[]>();
    for (const g of unidades.poligonos) m.set(g.fazenda_id, [...(m.get(g.fazenda_id) ?? []), g]);
    return m;
  }, [unidades.poligonos]);
  const situacao = useCallback((id: string) => situacaoDoPasto(doMes.dados.get(id)), [doMes.dados]);

  return { fazendas, geometriasPorFazenda, situacaoDoPasto: situacao, carregando: doMes.carregando || geos.carregando, erro: doMes.erro ?? geos.erro };
}
