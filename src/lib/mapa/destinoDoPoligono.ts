/**
 * MAPA-IMPORT-01b — o DESTINO de cada polígono do arquivo de mapa (mock `docs/mocks/mock-importar-mapa-v2.html`).
 * Puro: a tela só mostra e a gravação só recebe o que sai daqui.
 * - sugestão inicial: `casarNomePasto` claro → o pasto; senão palavra no nome → área da fazenda; senão "Escolher" (nunca chuta);
 * - o mesmo pasto em dois polígonos, ou dois "pasto novo" com o mesmo nome, ou pasto novo com o nome de um pasto que já existe na
 *   fazenda (ativo ou não, a regra do `motivoDoNomeDoPasto`): as linhas ficam com motivo e nada grava;
 * - "Não importar" não vai para a gravação; o import troca o mapa da fazenda inteiro (01a).
 */
import { casarNomePasto, type PastoParaCasar } from '@/lib/pastos/casarNomePasto';
import { normalizarNomeDoPasto } from '@/lib/pastos/nomeDoPasto';
import { normalizarParaBusca } from '@/lib/texto/busca';

export type TipoArea = 'area_sem_uso' | 'reserva_legal' | 'app' | 'benfeitoria' | 'estrada' | 'area_total';

/** O nome da área como aparece no seletor e na célula (MAPA-IMPORT-01c): só o nome; o grupo ("área") vai no `hint`, como o "pasto". */
export const ROTULO_DA_AREA: Record<TipoArea, string> = {
  area_sem_uso: 'Sem uso (terceiros)',
  reserva_legal: 'Reserva legal',
  app: 'APP',
  benfeitoria: 'Benfeitorias',
  estrada: 'Estradas',
  area_total: 'Área total',
};

export const AREAS_DA_FAZENDA: readonly TipoArea[] = ['area_sem_uso', 'reserva_legal', 'app', 'benfeitoria', 'estrada', 'area_total'];

export type Destino =
  | { tipo: 'escolher' }
  | { tipo: 'pasto'; pastoId: string }
  | { tipo: 'novo' }
  | { tipo: 'area'; area: TipoArea }
  | { tipo: 'nao' };

export interface PastoDoDestino extends PastoParaCasar {
  data_fim?: string | null;
}

export interface PoligonoLido {
  nome: string;
  geojson: GeoJSON.Geometry;
  areaHa: number;
}

export interface LinhaDoMapa extends PoligonoLido {
  /** A posição no arquivo (chave estável da linha e do polígono no mapa). */
  i: number;
  destino: Destino;
  /** Sugestão automática ou escolha de quem importa. */
  origem: 'sugestao' | 'escolha';
  /** Pastos que casaram pelo nome quando houve mais de um (vão no topo do seletor). */
  candidatos: { id: string; nome: string }[];
}

/** Palavra no nome → área da fazenda. A ordem importa: "área total" antes de qualquer outra. */
const PALAVRAS_DE_AREA: readonly [RegExp, TipoArea][] = [
  [/\barea\s*total\b/, 'area_total'],
  [/\breserva\b/, 'reserva_legal'],
  [/\bapp\b/, 'app'],
  [/\bbenfeit/, 'benfeitoria'],
  [/\bestrada/, 'estrada'],
];

export function areaPeloNome(nome: string): TipoArea | null {
  const n = normalizarParaBusca(nome);
  for (const [re, area] of PALAVRAS_DE_AREA) if (re.test(n)) return area;
  return null;
}

export function sugerirDestino(
  nome: string,
  pastos: readonly PastoParaCasar[],
  fazendaId?: string | null,
): { destino: Destino; candidatos: { id: string; nome: string }[] } {
  const casou = casarNomePasto(nome, pastos, fazendaId);
  if (casou.clara && casou.pastoId) return { destino: { tipo: 'pasto', pastoId: casou.pastoId }, candidatos: [] };
  const area = areaPeloNome(nome);
  if (area && casou.candidatos.length === 0) return { destino: { tipo: 'area', area }, candidatos: [] };
  return { destino: { tipo: 'escolher' }, candidatos: casou.candidatos };
}

const ORDEM_DO_GRUPO: Record<Destino['tipo'], number> = { escolher: 0, novo: 1, pasto: 2, area: 3, nao: 4 };

/** As linhas na ordem da tela (A escolher, Novo pasto, Pastos ligados, Áreas), por nome dentro do grupo. A ordem é a da ABERTURA:
 *  trocar o destino depois não move a linha (nada se desloca). */
export function montarLinhas(
  poligonos: readonly PoligonoLido[],
  pastos: readonly PastoParaCasar[],
  fazendaId?: string | null,
): LinhaDoMapa[] {
  const linhas = poligonos.map((p, i): LinhaDoMapa => {
    const s = sugerirDestino(p.nome, pastos, fazendaId);
    return { ...p, i, destino: s.destino, origem: 'sugestao', candidatos: s.candidatos };
  });
  return linhas.sort((a, b) =>
    ORDEM_DO_GRUPO[a.destino.tipo] - ORDEM_DO_GRUPO[b.destino.tipo]
    || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' })
    || a.i - b.i);
}

/** O valor do destino no seletor ('' = ainda não escolhido). */
export function valorDoDestino(d: Destino): string {
  if (d.tipo === 'pasto') return `pasto:${d.pastoId}`;
  if (d.tipo === 'area') return `area:${d.area}`;
  if (d.tipo === 'novo') return 'novo';
  if (d.tipo === 'nao') return 'nao';
  return '';
}

export function destinoDoValor(v: string): Destino {
  if (v.startsWith('pasto:')) return { tipo: 'pasto', pastoId: v.slice(6) };
  if (v.startsWith('area:')) {
    const area = AREAS_DA_FAZENDA.find(a => a === v.slice(5));
    if (area) return { tipo: 'area', area };
  }
  if (v === 'novo') return { tipo: 'novo' };
  if (v === 'nao') return { tipo: 'nao' };
  return { tipo: 'escolher' };
}

/** Troca o destino SÓ das linhas marcadas (o lote da barra de seleção). */
export function aplicarEmLote(linhas: readonly LinhaDoMapa[], marcadas: ReadonlySet<number>, destino: Destino): LinhaDoMapa[] {
  return linhas.map(l => (marcadas.has(l.i) ? { ...l, destino, origem: 'escolha' } : l));
}

export function trocarDestino(linhas: readonly LinhaDoMapa[], i: number, destino: Destino): LinhaDoMapa[] {
  return aplicarEmLote(linhas, new Set([i]), destino);
}

export const FRASE_ESCOLHER = 'Escolha um destino ou "Não importar".';
export const FRASE_PASTO_REPETIDO = 'O mesmo pasto está em outro polígono.';
export const FRASE_NOVO_REPETIDO = 'Outro polígono cria um pasto com este nome.';
export const FRASE_NOVO_JA_EXISTE = 'Já existe um pasto com este nome nesta fazenda.';
export const FRASE_NOVO_SEM_NOME = 'O polígono não tem nome para o pasto novo.';

/** O motivo de cada linha que impede salvar (linha sem motivo = pronta). `pastosDaFazenda` = todos, ativos ou não. */
export function problemasDasLinhas(
  linhas: readonly LinhaDoMapa[],
  pastosDaFazenda: readonly { nome: string }[],
): Map<number, string> {
  const motivos = new Map<number, string>();
  const porPasto = new Map<string, number[]>();
  const porNomeNovo = new Map<string, number[]>();
  const nomesExistentes = new Set(pastosDaFazenda.map(p => normalizarNomeDoPasto(p.nome)));
  for (const l of linhas) {
    if (l.destino.tipo === 'escolher') motivos.set(l.i, FRASE_ESCOLHER);
    if (l.destino.tipo === 'pasto') porPasto.set(l.destino.pastoId, [...(porPasto.get(l.destino.pastoId) ?? []), l.i]);
    if (l.destino.tipo === 'novo') {
      const chave = normalizarNomeDoPasto(l.nome);
      if (!chave || chave === 'sem nome') motivos.set(l.i, FRASE_NOVO_SEM_NOME);
      else if (nomesExistentes.has(chave)) motivos.set(l.i, FRASE_NOVO_JA_EXISTE);
      else porNomeNovo.set(chave, [...(porNomeNovo.get(chave) ?? []), l.i]);
    }
  }
  for (const is of porPasto.values()) if (is.length > 1) is.forEach(i => motivos.set(i, FRASE_PASTO_REPETIDO));
  for (const is of porNomeNovo.values()) if (is.length > 1) is.forEach(i => motivos.set(i, FRASE_NOVO_REPETIDO));
  return motivos;
}

export interface ContagemDoMapa {
  ligados: number;
  novos: number;
  areas: number;
  escolher: number;
  naoImportar: number;
  /** Pastos ATIVOS do cadastro sem polígono no que vai ser gravado. */
  semMapa: PastoDoDestino[];
}

export function contarLinhas(linhas: readonly LinhaDoMapa[], pastosAtivos: readonly PastoDoDestino[]): ContagemDoMapa {
  const ligadosIds = new Set(linhas.flatMap(l => (l.destino.tipo === 'pasto' ? [l.destino.pastoId] : [])));
  return {
    ligados: linhas.filter(l => l.destino.tipo === 'pasto').length,
    novos: linhas.filter(l => l.destino.tipo === 'novo').length,
    areas: linhas.filter(l => l.destino.tipo === 'area').length,
    escolher: linhas.filter(l => l.destino.tipo === 'escolher').length,
    naoImportar: linhas.filter(l => l.destino.tipo === 'nao').length,
    semMapa: pastosAtivos.filter(p => p.ativo && !ligadosIds.has(p.id)),
  };
}

export interface ItemParaGravar {
  tipo: 'pasto' | 'pasto_novo' | TipoArea;
  pasto_id: string | null;
  nome_original: string;
  geojson: GeoJSON.Geometry;
  /** Só no pasto novo: a área inicial do cadastro (2 casas). */
  area_ha?: number;
}

/** O que vai para a `fn_mapa_fazenda_substituir`, na ordem do arquivo. Só chamar sem problemas (a tela barra antes). */
export function itensParaGravar(linhas: readonly LinhaDoMapa[]): ItemParaGravar[] {
  return [...linhas].sort((a, b) => a.i - b.i).flatMap((l): ItemParaGravar[] => {
    const d = l.destino;
    if (d.tipo === 'pasto') return [{ tipo: 'pasto', pasto_id: d.pastoId, nome_original: l.nome, geojson: l.geojson }];
    if (d.tipo === 'novo') {
      return [{ tipo: 'pasto_novo', pasto_id: null, nome_original: l.nome.trim(), geojson: l.geojson, area_ha: Math.round(l.areaHa * 100) / 100 }];
    }
    if (d.tipo === 'area') return [{ tipo: d.area, pasto_id: null, nome_original: l.nome, geojson: l.geojson }];
    return [];
  });
}

export type CorDaSituacao = 'vermelho' | 'azul' | 'verde' | 'cinza';

/** O selo da coluna Situação. */
export function situacaoDaLinha(l: LinhaDoMapa, motivo: string | undefined): { texto: string; cor: CorDaSituacao } {
  if (motivo && l.destino.tipo !== 'escolher') return { texto: l.destino.tipo === 'pasto' ? 'Pasto repetido' : 'Nome repetido', cor: 'vermelho' };
  if (l.destino.tipo === 'escolher') return { texto: 'Escolher', cor: 'vermelho' };
  if (l.destino.tipo === 'novo') return { texto: 'Novo pasto', cor: 'azul' };
  if (l.destino.tipo === 'nao') return { texto: 'Não importar', cor: 'cinza' };
  return l.origem === 'sugestao' ? { texto: 'Sugestão clara', cor: 'verde' } : { texto: 'Escolhido', cor: 'verde' };
}

/** Cor do polígono na prévia, pelo destino. Área total: só contorno tracejado (ver `PreviaDoMapa`). */
export const COR_DO_DESTINO = {
  pasto: '#3E8E5A',
  escolher: '#E8A33B',
  novo: '#4F86C6',
  ambiental: '#5F7F4E',
  estrutura: '#9AA3AE',
  areaSemUso: '#B9A27A',
  areaTotal: '#1B2A44',
  nao: '#C9CED6',
} as const;

export function corDoDestino(d: Destino): string {
  if (d.tipo === 'pasto') return COR_DO_DESTINO.pasto;
  if (d.tipo === 'novo') return COR_DO_DESTINO.novo;
  if (d.tipo === 'nao') return COR_DO_DESTINO.nao;
  if (d.tipo === 'area') {
    if (d.area === 'reserva_legal' || d.area === 'app') return COR_DO_DESTINO.ambiental;
    if (d.area === 'benfeitoria' || d.area === 'estrada') return COR_DO_DESTINO.estrutura;
    if (d.area === 'area_total') return COR_DO_DESTINO.areaTotal;
    return COR_DO_DESTINO.areaSemUso;
  }
  return COR_DO_DESTINO.escolher;
}
