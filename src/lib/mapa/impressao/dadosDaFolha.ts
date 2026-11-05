/**
 * MAPA-IMPRESSAO-01 — a ENTRADA da folha a partir do que o Geo Pastos já lê (sem segunda fonte): os pastos e os grupos do cadastro, os
 * polígonos da fazenda, a área do mês (`useAreaDosPastosNoMes`), o uso do mês (fechamento, `usoDoMes`) e o cadastro da fazenda.
 * As UNIDADES são as do Gestor (`unidadesDoMapa`, MAPA-PIQUETES-03): pai ou piquetes conforme o mês; o piquete é divisão, sem rótulo.
 */
import { isPastoAtivoNoMes, type Pasto } from '@/hooks/usePastos';
import { pastosSemDesenho, unidadesDoMapa, type GrupoComOrigem } from '@/lib/mapa/unidadesDoMapa';
import { usoDoMes } from '@/lib/mapa/usoDoPasto';
import { areaNoMesOuHoje, areaNoMesOuNada, type AreaDoPastoNoMes } from '@/lib/pastos/areaDoPastoNoMes';
import type { Geometria, TamanhoDaFolha } from './folhaDoMapa';
import { areaDoPoligono, type EntradaDaFolha, type PoligonoDaFolha, type UnidadeDaFolha } from './montarFolha';
import { resumoDeAreas } from './resumoDeAreas';

export interface PoligonoLido { id: string; tipo: string; pasto_id: string | null; nome_original: string; geojson: Geometria }

export interface CadastroDaFazenda {
  cliente: string; fazenda: string; municipio: string | null; uf: string | null; matricula: number | null; matriculaConferidaEm: string | null;
}

export function entradaDaFolha(e: {
  tamanho: TamanhoDaFolha;
  anoMes: string;
  pastos: readonly Pasto[];
  grupos: readonly GrupoComOrigem[];
  poligonos: readonly PoligonoLido[];
  areaDe: AreaDoPastoNoMes;
  /** o `tipo_uso_mes` do fechamento do pasto no mês (null = sem fechamento: vale o do cadastro) */
  usoNoFechamento: (pastoId: string) => string | null;
  cadastro: CadastroDaFazenda;
  /** a data de hoje (AAAA-MM-DD, `hojeLocal`) */
  hoje: string;
}): EntradaDaFolha {
  const ativos = e.pastos.filter((p) => p.ativo);
  const res = unidadesDoMapa<Pasto, PoligonoLido>({
    pastos: ativos, grupos: e.grupos, poligonos: e.poligonos, anoMes: e.anoMes,
    areaDe: (p) => areaNoMesOuHoje(p, e.anoMes, e.areaDe),
  });
  const unidades = new Map<string, UnidadeDaFolha>();
  for (const p of res.pastos) {
    const u = res.unidades.get(p.id);
    unidades.set(p.id, {
      nome: p.nome,
      areaHa: u && u.fase === 'grupo' ? u.areaHa : areaNoMesOuNada(p, e.anoMes, e.areaDe),
      uso: usoDoMes(e.usoNoFechamento(p.id), p.tipo_uso),
    });
  }
  /* o polígono de pasto que não é unidade no mês (pasto encerrado/inativo) fica como "outra área", com o nome — nunca some, nunca conta */
  const vigentesNoMes = new Set(res.pastos.filter((p) => res.unidades.has(p.id) || (p.ativo && isPastoAtivoNoMes(p, e.anoMes))).map((p) => p.id));
  const poligonos: PoligonoDaFolha[] = res.poligonos.map((g) => {
    const pastoOk = g.tipo === 'pasto' && g.pasto_id && vigentesNoMes.has(g.pasto_id);
    return {
      id: g.id, tipo: pastoOk || g.tipo !== 'pasto' ? g.tipo : 'outra', pastoId: pastoOk ? g.pasto_id : null,
      nome: g.nome_original, geojson: g.geojson,
    };
  });
  const divisoes: Geometria[] = [];
  for (const u of res.unidades.values()) for (const d of u.divisoes) if (d.poligono) divisoes.push(d.poligono.geojson);

  const soma = (tipo: string) => e.poligonos.filter((g) => g.tipo === tipo).reduce((s, g) => s + areaDoPoligono(g.geojson), 0);
  const resumo = resumoDeAreas({
    pastos: ativos, anoMes: e.anoMes, areaDe: e.areaDe, matricula: e.cadastro.matricula,
    desenho: { reserva: soma('reserva_legal'), app: soma('app') },
  });

  return {
    tamanho: e.tamanho, anoMes: e.anoMes,
    identificacao: { ...e.cadastro, geradoEm: e.hoje },
    poligonos, unidades, divisoes, resumo,
    semDesenho: pastosSemDesenho(res.pastos, res.poligonos, e.anoMes),
  };
}
