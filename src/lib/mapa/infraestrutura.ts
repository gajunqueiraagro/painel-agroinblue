/**
 * MAPA-02f-b — a INFRAESTRUTURA da fazenda como PONTOS no mapa (banco da 02f-a: `fazenda_infraestruturas`, `fn_infra_salvar`,
 * `fn_infra_desativar`). Puro: sem React e sem rede.
 * - Os 14 tipos e os rótulos são os do banco (`_fn_infra_rotulo`) e do menu "+ Adicionar › Infraestrutura".
 * - Nesta fatia tudo se coloca como PONTO; a cerca (só linha) e o desenho de linhas/áreas ficam para a 02f-c (ferramenta de desenho do
 *   Code 3). Curral, represa/açude, sede/casa, galpão e energia aceitam ponto no banco (Q1).
 * - Cor por grupo (água azul, manejo laranja, construção cinza, energia amarela); ícone SVG de tamanho fixo em qualquer zoom.
 */
export type TipoInfra =
  | 'cocho' | 'bebedouro' | 'saleiro' | 'curral' | 'tronco_brete' | 'balanca' | 'porteira' | 'cerca' | 'poco' | 'represa_acude'
  | 'caixa_dagua' | 'sede_casa' | 'galpao' | 'energia'
  /* MAPA-AREA-TIPOS-02: as estruturas que nascem de uma ÁREA do mapa (não se colocam como ponto pelo menu) */
  | 'armazem_graos' | 'silo_secador' | 'oficina' | 'casa_funcionario' | 'escritorio' | 'confinamento';

export type GrupoInfra = 'agua' | 'manejo' | 'construcao' | 'energia';

export interface DefinicaoInfra {
  tipo: TipoInfra;
  rotulo: string;
  grupo: GrupoInfra;
  /** se coloca como ponto nesta fatia (a cerca não: só linha, 02f-c) */
  ponto: boolean;
  /** as categorias do Patrimônio (código) que casam com o tipo, para o seletor do bem */
  categorias: readonly string[];
  /** o desenho do ícone (path SVG num quadro 16×16) */
  desenho: string;
}

export const COR_DO_GRUPO: Record<GrupoInfra, string> = { agua: '#2B6CB0', manejo: '#D9822B', construcao: '#5A6472', energia: '#D4A017' };
export const ROTULO_DO_GRUPO: Record<GrupoInfra, string> = { agua: 'Água', manejo: 'Manejo', construcao: 'Construção', energia: 'Energia' };

const CIRCULO = 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3z';
const QUADRADO = 'M3.5 3.5h9v9h-9z';
const GOTA = 'M8 2.5c2 3 4 5.2 4 7.4a4 4 0 0 1-8 0c0-2.2 2-4.4 4-7.4z';
const CASA = 'M2.5 8 8 3l5.5 5v5.5h-11z';
const RAIO = 'M9 2 4 9h3.5L7 14l5-7H8.5z';
const COCHO = 'M2.5 6h11l-1.5 5h-8z';
const PORTEIRA = 'M2.5 4v8M13.5 4v8M2.5 5.5h11M2.5 10.5h11M2.5 10.5l11-5';

export const TIPOS_INFRA: readonly DefinicaoInfra[] = [
  { tipo: 'cocho', rotulo: 'Cocho', grupo: 'manejo', ponto: true, categorias: ['instalacoes'], desenho: COCHO },
  { tipo: 'bebedouro', rotulo: 'Bebedouro', grupo: 'agua', ponto: true, categorias: ['rede_agua', 'instalacoes'], desenho: GOTA },
  { tipo: 'saleiro', rotulo: 'Saleiro', grupo: 'manejo', ponto: true, categorias: ['instalacoes'], desenho: QUADRADO },
  { tipo: 'curral', rotulo: 'Curral', grupo: 'manejo', ponto: true, categorias: ['instalacoes', 'benfeitorias'], desenho: PORTEIRA },
  /* INFRA-FICHAS-PATR-01: o tronco hidráulico e a balança nascem em Máquinas (D2) — o seletor do bem também as mostra */
  { tipo: 'tronco_brete', rotulo: 'Tronco / brete', grupo: 'manejo', ponto: true, categorias: ['instalacoes', 'maquinas'], desenho: QUADRADO },
  { tipo: 'balanca', rotulo: 'Balança', grupo: 'manejo', ponto: true, categorias: ['instalacoes', 'maquinas'], desenho: QUADRADO },
  { tipo: 'porteira', rotulo: 'Porteira', grupo: 'manejo', ponto: true, categorias: ['cercas'], desenho: PORTEIRA },
  { tipo: 'cerca', rotulo: 'Cerca', grupo: 'manejo', ponto: false, categorias: ['cercas'], desenho: PORTEIRA },
  { tipo: 'poco', rotulo: 'Poço', grupo: 'agua', ponto: true, categorias: ['rede_agua'], desenho: CIRCULO },
  { tipo: 'represa_acude', rotulo: 'Represa / açude', grupo: 'agua', ponto: true, categorias: ['rede_agua'], desenho: GOTA },
  { tipo: 'caixa_dagua', rotulo: "Caixa d'água", grupo: 'agua', ponto: true, categorias: ['rede_agua'], desenho: QUADRADO },
  { tipo: 'sede_casa', rotulo: 'Sede / casa', grupo: 'construcao', ponto: true, categorias: ['benfeitorias'], desenho: CASA },
  { tipo: 'galpao', rotulo: 'Galpão', grupo: 'construcao', ponto: true, categorias: ['benfeitorias'], desenho: CASA },
  { tipo: 'energia', rotulo: 'Energia', grupo: 'energia', ponto: true, categorias: ['instalacoes'], desenho: RAIO },
  /* MAPA-AREA-TIPOS-02 (rótulos do banco, `_fn_infra_rotulo` da 117120) */
  { tipo: 'armazem_graos', rotulo: 'Armazém de grãos', grupo: 'construcao', ponto: false, categorias: ['benfeitorias', 'instalacoes'], desenho: CASA },
  { tipo: 'silo_secador', rotulo: 'Silo / secador', grupo: 'construcao', ponto: false, categorias: ['instalacoes', 'benfeitorias'], desenho: CIRCULO },
  { tipo: 'oficina', rotulo: 'Oficina / galpão de máquinas', grupo: 'construcao', ponto: false, categorias: ['benfeitorias'], desenho: CASA },
  { tipo: 'casa_funcionario', rotulo: 'Casa de funcionário', grupo: 'construcao', ponto: false, categorias: ['benfeitorias'], desenho: CASA },
  { tipo: 'escritorio', rotulo: 'Escritório', grupo: 'construcao', ponto: false, categorias: ['benfeitorias'], desenho: CASA },
  { tipo: 'confinamento', rotulo: 'Confinamento', grupo: 'manejo', ponto: false, categorias: ['instalacoes'], desenho: PORTEIRA },
];

export function definicaoDoTipo(tipo: string): DefinicaoInfra | null {
  return TIPOS_INFRA.find(t => t.tipo === tipo) ?? null;
}

export function ehTipoInfra(tipo: string): tipo is TipoInfra {
  return TIPOS_INFRA.some(t => t.tipo === tipo);
}

/** O tipo do menu pelo rótulo ("Tronco / brete" → 'tronco_brete'); só os que se colocam como ponto nesta fatia. */
export function tipoDePontoPeloRotulo(rotulo: string): TipoInfra | null {
  const d = TIPOS_INFRA.find(t => t.rotulo === rotulo);
  return d && d.ponto ? d.tipo : null;
}

/** O ícone (HTML de um SVG de 18 px, tamanho fixo na tela em qualquer zoom): círculo branco com o desenho na cor do grupo. */
export function iconeDaInfra(tipo: string, selecionado = false): string {
  const d = definicaoDoTipo(tipo);
  const cor = d ? COR_DO_GRUPO[d.grupo] : '#5A6472';
  const desenho = d?.desenho ?? CIRCULO;
  const traco = desenho === PORTEIRA ? `stroke="${cor}" stroke-width="1.6" fill="none"` : `fill="${cor}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="-1 -1 18 18" aria-hidden="true">`
    + `<circle cx="8" cy="8" r="8" fill="#FFFFFF" stroke="${selecionado ? '#1B2A44' : cor}" stroke-width="${selecionado ? 2 : 1.2}"/>`
    + `<path d="${desenho}" ${traco} transform="translate(2.4 2.4) scale(0.7)"/></svg>`;
}

/* ── o pasto onde o ponto caiu (sugestão do formulário) ── */
type Anel = number[][];
function noAnel(lon: number, lat: number, anel: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i]; const [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
function noPoligono(lon: number, lat: number, aneis: Anel[]): boolean {
  if (!aneis.length || !noAnel(lon, lat, aneis[0])) return false;
  return !aneis.slice(1).some(buraco => noAnel(lon, lat, buraco));
}
/** O pasto do polígono que contém o ponto (o primeiro achado); null fora de qualquer pasto. */
export function pastoNoPonto(lon: number, lat: number, geometrias: readonly { pasto_id: string | null; geojson: GeoJSON.Geometry }[]): string | null {
  for (const g of geometrias) {
    if (!g.pasto_id) continue;
    const geo = g.geojson;
    if (geo.type === 'Polygon' && noPoligono(lon, lat, geo.coordinates)) return g.pasto_id;
    if (geo.type === 'MultiPolygon' && geo.coordinates.some(p => noPoligono(lon, lat, p))) return g.pasto_id;
  }
  return null;
}

/* ── o que vai ao banco ── */
export interface CamposDaInfra {
  id?: string | null;
  versao?: number | null;
  fazendaId: string;
  tipo: TipoInfra;
  lon: number;
  lat: number;
  nome: string;
  pastoId: string | null;
  bemId: string | null;
  observacao: string;
  /** INFRA-FICHAS-PATR-01: a ficha do tipo (já limpa); ausente = não mexe na ficha gravada */
  ficha?: Record<string, string | number | boolean>;
  /** MAPA-AREA-TIPOS-02: a geometria gravada quando NÃO é ponto (a estrutura que veio de uma área do mapa): vai como está, nunca vira ponto */
  geometriaOriginal?: unknown;
}

/** O `p_infra` da `fn_infra_salvar`: ao criar leva a fazenda; ao editar, id + versão (a fazenda não muda). */
export function argumentoDaInfra(c: CamposDaInfra): Record<string, unknown> {
  const base = {
    tipo: c.tipo,
    geometria: c.geometriaOriginal ?? { type: 'Point', coordinates: [c.lon, c.lat] },
    nome: c.nome.trim() || null,
    pasto_id: c.pastoId || null,
    bem_id: c.bemId || null,
    observacao: c.observacao.trim() || null,
    ...(c.ficha ? { ficha: c.ficha } : {}),
  };
  return c.id ? { id: c.id, versao: c.versao, ...base } : { fazenda_id: c.fazendaId, ...base };
}

/** A linha lida de `fazenda_infraestruturas` (só os pontos entram no mapa desta fatia). */
export interface InfraLida {
  id: string;
  fazenda_id: string;
  tipo: string;
  geometria: unknown;
  nome: string | null;
  pasto_id: string | null;
  bem_id: string | null;
  observacao: string | null;
  /** MAPA-AREA-TIPOS-02: o polígono do mapa de onde a estrutura nasceu (null = ponto colocado no mapa) */
  geometria_id?: string | null;
  /** INFRA-FICHAS-PATR-01: a ficha gravada ({} = sem ficha) */
  ficha?: Record<string, string | number | boolean>;
  versao: number;
  criado_em: string;
  criado_por: string | null;
}

export function pontoDaInfra(geometria: unknown): { lon: number; lat: number } | null {
  if (typeof geometria !== 'object' || geometria === null || !('type' in geometria) || geometria.type !== 'Point') return null;
  const c = 'coordinates' in geometria ? geometria.coordinates : null;
  if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
  return { lon: c[0], lat: c[1] };
}

/** Contagem por tipo presente (o filtro "Infraestruturas" mostra só os tipos que existem, com o número). */
export function contagemPorTipo(lista: readonly { tipo: string }[]): { tipo: TipoInfra; rotulo: string; n: number }[] {
  return TIPOS_INFRA.map(t => ({ tipo: t.tipo, rotulo: t.rotulo, n: lista.filter(i => i.tipo === t.tipo).length })).filter(x => x.n > 0);
}
