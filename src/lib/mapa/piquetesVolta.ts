/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2b (o caminho de volta dos piquetes) — a parte PURA: quem pode mover a linha / juntar / desfazer, a união das duas
 * vizinhas, a leitura do que as três RPCs devolvem (`fn_piquetes_mover_linha`, `fn_piquetes_juntar`, `fn_piquetes_desfazer`) e a frase de cada recusa.
 * Nada de mapa nem de banco aqui; as chamadas ficam em `src/hooks/usePiquetesVolta.ts`.
 * Leitura sem cast (`Reflect.get`): resposta fora do formato = null (a tela trata como falha, nunca como prévia vazia).
 */
import { distanciaEntrePoligonosM, sobreposicoes, TOLERANCIA_FRESTA_M, unirVarios, type Vizinho } from '@/lib/mapa/edicaoDoPoligono';
import { areaDoBancoHa } from '@/lib/mapa/criarPiquetes';
import { fraseDo42501 } from '@/lib/mapa/fraseDaPermissao';

/** Quanto um vizinho pode perder de área antes de a prévia avisar em vermelho (Gabriel 02/11). */
export const PERDA_MAXIMA_PCT = 2;

export const FRASE_LINHA_SO_ENTRE_DUAS = 'A linha só se move entre as duas divisões; não arraste pontos da borda do pasto';
export const FRASE_LINHA_SEM_VIZINHA = 'Arraste um ponto da divisa entre as duas divisões: o ponto tem de ser comum às duas.';
export const FRASE_ALGUEM_MEXEU = 'Alguém mexeu nestes desenhos ou pastos enquanto você via a prévia. Recarregue a tela e tente de novo.';

/** O que trava o "Mover linha" pelo número de polígonos que o gesto de vértices montou (a divisão + os que andam junto na divisa). */
export function motivoDaLinha(poligonosNoGesto: number): string | null {
  if (poligonosNoGesto === 2) return null;
  return poligonosNoGesto > 2 ? FRASE_LINHA_SO_ENTRE_DUAS : FRASE_LINHA_SEM_VIZINHA;
}

/** Os ids dos polígonos que um gesto (`fn_geometria_gravar`) altera: o que o "Mover linha" confere antes de abrir a prévia. */
export function idsDoAlterar(gesto: unknown): string[] {
  const alterar = gesto && typeof gesto === 'object' ? Reflect.get(gesto, 'alterar') : null;
  if (!Array.isArray(alterar)) return [];
  const ids: string[] = [];
  for (const a of alterar) { const id = a && typeof a === 'object' ? Reflect.get(a, 'id') : null; if (typeof id === 'string') ids.push(id); }
  return ids;
}

/** O que trava o "Mover linha": o gesto de vértices (com a divisa junto) tem de ter mexido em EXATAMENTE as duas divisões do mesmo grupo. */
export function travaDaLinha(ids: readonly string[], divisoesDoGrupo: ReadonlySet<string> | null): string | null {
  const porNumero = motivoDaLinha(ids.length);
  if (porNumero) return porNumero;
  return divisoesDoGrupo && ids.some(id => !divisoesDoGrupo.has(id)) ? FRASE_LINHA_SO_ENTRE_DUAS : null;
}

/** A frase de uma recusa das três RPCs: a do banco (P0001) vai inteira; 40001 = alguém mexeu; o resto vira frase da casa. */
export function fraseDaVolta(erro: unknown): string {
  const c = erro && typeof erro === 'object' ? Reflect.get(erro, 'code') : null;
  const m = erro && typeof erro === 'object' ? Reflect.get(erro, 'message') : null;
  const mensagem = typeof m === 'string' ? m : null;
  if (c === 'P0001' && mensagem && mensagem.trim()) return mensagem;
  if (c === '40001') return FRASE_ALGUEM_MEXEU;
  if (c === '42501') return fraseDo42501(mensagem);
  console.error('[MAPA-CRIAR-PIQUETES-01 2b] a função falhou', erro);
  return 'Não consegui concluir. Nada foi gravado; tente de novo.';
}

/**
 * MAPA-PIQUETES-MANUAL-01 (2) (Gabriel 03/11 06:22: "todo piquete gravado edita como qualquer polígono"): os VÉRTICES de um piquete com a
 * "divisa junto" que mexem em exatamente DUAS divisões do mesmo grupo gravam pela `fn_piquetes_mover_linha` (mês, motivo e a área oficial
 * das duas), como o "Mover linha". Qualquer outro gesto (recortar, um polígono só, um vizinho de fora do grupo) segue o escritor de sempre.
 */
export function vaiPelaLinha(e: { modo: string; moverLinha: boolean; divisaJunto: boolean; recortar: boolean; ids: readonly string[]; divisoesDoGrupo: ReadonlySet<string> | null }): boolean {
  if (e.moverLinha) return true;
  if (e.modo !== 'vertices' || !e.divisaJunto || e.recortar || !e.divisoesDoGrupo) return false;
  return travaDaLinha(e.ids, e.divisoesDoGrupo) === null;
}

/**
 * MAPA-PIQUETES-MANUAL-01 (4) (Gabriel 03/11 06:22): corredor e praça desenhados à mão DENTRO de um pasto com piquetes nascem com o
 * "Recortar vizinhos" LIGADO (o desenho sai dos piquetes por baixo dele). Ligado uma vez, quando o desenho fecha em cima de um piquete;
 * o operador pode desligar (aí a escolha dele vale até o fim do gesto).
 */
export function recortarPorPadrao(nova: GeoJSON.Geometry | null, vizinhos: readonly Vizinho[], piquetes: ReadonlySet<string> | null): boolean {
  if (!nova || !piquetes || piquetes.size === 0) return false;
  return sobreposicoes(nova, vizinhos.filter(v => piquetes.has(v.id))).length > 0;
}

// --- quem aparece onde ---------------------------------------------------------------------------------------------------------------
export interface GrupoDoMapa { id: string; nome: string; pasto_origem_id: string; ativo: boolean }
export interface PoligonoDePasto { id: string; nome_original: string; pasto_id: string | null; geojson: GeoJSON.Geometry; tipo?: string | null }
export interface PastoDoGrupo { id: string; grupo_id?: string | null }

/** O grupo ATIVO (com origem) de que o polígono é uma DIVISÃO: o pasto dele está num grupo que nasceu de outro pasto. */
export function grupoDaDivisao(pastoId: string | null, pastos: readonly PastoDoGrupo[], grupos: readonly GrupoDoMapa[]): GrupoDoMapa | null {
  if (!pastoId) return null;
  const gid = pastos.find(p => p.id === pastoId)?.grupo_id;
  return gid ? grupos.find(g => g.id === gid && g.ativo) ?? null : null;
}

/** O grupo ATIVO de que o pasto é o PAI (`pasto_origem_id`): é quem leva o "Desfazer piquetes". */
export function grupoDoPai(pastoId: string | null, grupos: readonly GrupoDoMapa[]): GrupoDoMapa | null {
  return pastoId ? grupos.find(g => g.pasto_origem_id === pastoId && g.ativo) ?? null : null;
}

/**
 * MAPA-PIQUETES-FECHADOS-01 F0 (Gabriel 06/11 16:03: "os polígonos dos piquetes valem para o pasto macro"; D1 do Code 6): o polígono do PAI de
 * grupo ATIVO (a mesma regra do "Desfazer piquetes", `grupoDoPai`) não é vizinho editável — o contorno dele é a união dos piquetes. Desde 02/11 o
 * editor o tratava como vizinho: o recortar tirava o piquete de dentro dele e o "mover a divisa junto" o arrastava (8 cortes; P8 85,34 → 63,27 ha).
 */
export function poligonosDosPais<G extends { id: string; pasto_id: string | null }>(geometrias: readonly G[], grupos: readonly GrupoDoMapa[]): Set<string> {
  return new Set(geometrias.filter(g => !!grupoDoPai(g.pasto_id, grupos)).map(g => g.id));
}

/** Os vizinhos que a edição pode mexer (recortar, divisa junto, aviso de sobreposição): sem o alvo, sem os unidos e sem o polígono de um pai. */
export function vizinhosEditaveis<G extends { id: string }>(geometrias: readonly G[], alvoId: string | null, unidos: readonly string[],
  pais: ReadonlySet<string> | null): G[] {
  return geometrias.filter(g => g.id !== alvoId && !unidos.includes(g.id) && !(pais?.has(g.id) ?? false));
}

/** As irmãs do mesmo grupo que ENCOSTAM no polígono (até a fresta do KMZ): são as candidatas do "Juntar com…". */
export function irmasQueEncostam(alvo: PoligonoDePasto, grupo: GrupoDoMapa, pastos: readonly PastoDoGrupo[], geometrias: readonly PoligonoDePasto[]): PoligonoDePasto[] {
  const doGrupo = new Set(pastos.filter(p => p.grupo_id === grupo.id).map(p => p.id));
  return geometrias.filter(g => g.id !== alvo.id && !!g.pasto_id && g.pasto_id !== alvo.pasto_id && doGrupo.has(g.pasto_id)
    && distanciaEntrePoligonosM(alvo.geojson, g.geojson) <= TOLERANCIA_FRESTA_M);
}

/** A união das duas divisões pela MESMA `unirVarios` do Concluir piquetes; tem de dar UM Polygon, senão "não são vizinhas". */
export function uniaoDasDuas(fica: { id: string; nome: string; geojson: GeoJSON.Geometry }, sai: { id: string; nome: string; geojson: GeoJSON.Geometry }):
  { ok: true; valor: GeoJSON.Polygon } | { ok: false; motivo: string } {
  const r = unirVarios([fica, sai]);
  if ('motivo' in r) return { ok: false, motivo: `${fica.nome} e ${sai.nome} não são vizinhas: ${r.motivo}` };
  if (r.valor.geojson.type !== 'Polygon') return { ok: false, motivo: `${fica.nome} e ${sai.nome} não são vizinhas: a união não ficou numa peça só.` };
  return { ok: true, valor: r.valor.geojson };
}

// --- o aviso do mini-mapa ------------------------------------------------------------------------------------------------------------
export interface ItemDaPreviaComMapa {
  chave: string;
  nome: string;
  antes: GeoJSON.Geometry | null;
  depois: GeoJSON.Geometry | null;
  /** vizinho que muda junto (laranja tracejado no mapa; entra na conta do aviso de perda) */
  vizinho?: boolean;
}

function haDoBanco(g: GeoJSON.Geometry | null): number | null {
  return g && (g.type === 'Polygon' || g.type === 'MultiPolygon') ? areaDoBancoHa(g) : null;
}

export interface PerdaDeVizinho { chave: string; nome: string; antesHa: number; depoisHa: number; perdaPct: number }

/** Os vizinhos que perdem MAIS de `limitePct` da área (a conta é a da casa, `areaDoBancoHa`). Exatamente no limite não avisa. */
export function vizinhosQuePerdem(itens: readonly ItemDaPreviaComMapa[], limitePct = PERDA_MAXIMA_PCT): PerdaDeVizinho[] {
  const saida: PerdaDeVizinho[] = [];
  for (const i of itens) {
    if (!i.vizinho) continue;
    const a = haDoBanco(i.antes), d = haDoBanco(i.depois);
    if (a == null || d == null || a <= 0) continue;
    const perdaPct = ((a - d) / a) * 100;
    if (perdaPct > limitePct) saida.push({ chave: i.chave, nome: i.nome, antesHa: a, depoisHa: d, perdaPct });
  }
  return saida;
}

/** Os lados de todos os anéis dos polígonos, SEM repetir o lado comum a dois deles (a mesma divisa entre duas divisões vale uma vez só). */
export function segmentosSemRepetir(geometrias: readonly (GeoJSON.Geometry | null)[]): { p: number[]; q: number[] }[] {
  const vistos = new Set<string>();
  const saida: { p: number[]; q: number[] }[] = [];
  const chave = (a: readonly number[]) => `${a[0].toFixed(6)},${a[1].toFixed(6)}`;
  const anel = (pts: readonly (readonly number[])[]) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = [pts[i][0], pts[i][1]], q = [pts[i + 1][0], pts[i + 1][1]];
      if (chave(p) === chave(q)) continue;
      const k = [chave(p), chave(q)].sort().join('|');
      if (vistos.has(k)) continue;
      vistos.add(k);
      saida.push({ p, q });
    }
  };
  for (const g of geometrias) {
    if (!g) continue;
    if (g.type === 'Polygon') g.coordinates.forEach(anel);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(poli => poli.forEach(anel));
  }
  return saida;
}

// --- o que as três RPCs devolvem -----------------------------------------------------------------------------------------------------
const campo = (o: unknown, k: string): unknown => (o && typeof o === 'object' ? Reflect.get(o, k) : undefined);
const texto = (o: unknown, k: string): string | null => { const v = campo(o, k); return typeof v === 'string' ? v : null; };
const numero = (o: unknown, k: string): number | null => {
  const v = campo(o, k);
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export interface ItemDaLinha {
  pastoId: string | null; nome: string; situacao: string | null; motivo: string | null;
  areaAntesHa: number | null; areaMapaHa: number | null; difHa: number | null; difPct: number | null;
}
export interface PreviaMoverLinha {
  mes: string | null; itens: ItemDaLinha[]; somaAntesHa: number; somaDepoisHa: number; difSomaHa: number | null; areaMuda: boolean; frase: string;
}
export function lerMoverLinha(dado: unknown): PreviaMoverLinha | null {
  if (campo(dado, 'ok') !== true) return null;
  const itens = campo(dado, 'itens');
  const antes = numero(dado, 'soma_antes_ha'), depois = numero(dado, 'soma_depois_ha'), frase = texto(dado, 'frase');
  if (!Array.isArray(itens) || antes == null || depois == null || !frase) return null;
  return {
    mes: texto(dado, 'mes'), somaAntesHa: antes, somaDepoisHa: depois, difSomaHa: numero(dado, 'dif_soma_ha'), areaMuda: campo(dado, 'area_muda') === true, frase,
    itens: itens.map(i => ({
      pastoId: texto(i, 'pasto_id'), nome: texto(i, 'nome') ?? '—', situacao: texto(i, 'situacao'), motivo: texto(i, 'motivo'),
      areaAntesHa: numero(i, 'area_antes'), areaMapaHa: numero(i, 'area_mapa'), difHa: numero(i, 'dif_ha'), difPct: numero(i, 'dif_pct'),
    })),
  };
}

export interface PreviaJuntar {
  mes: string | null;
  fica: { id: string; nome: string; areaAntesHa: number | null; areaDepoisHa: number | null };
  sai: { id: string; nome: string; areaAntesHa: number | null; encerraEm: string | null };
  grupo: { nome: string; divisoes: number | null };
  frase: string;
}
export function lerJuntar(dado: unknown): PreviaJuntar | null {
  if (campo(dado, 'ok') !== true) return null;
  const fica = campo(dado, 'fica'), sai = campo(dado, 'sai'), grupo = campo(dado, 'grupo');
  const fid = texto(fica, 'id'), fnome = texto(fica, 'nome'), sid = texto(sai, 'id'), snome = texto(sai, 'nome'), frase = texto(dado, 'frase');
  if (!fid || !fnome || !sid || !snome || !frase) return null;
  return {
    mes: texto(dado, 'mes'),
    fica: { id: fid, nome: fnome, areaAntesHa: numero(fica, 'area_antes_ha'), areaDepoisHa: numero(fica, 'area_depois_ha') },
    sai: { id: sid, nome: snome, areaAntesHa: numero(sai, 'area_antes_ha'), encerraEm: texto(sai, 'encerra_em') },
    grupo: { nome: texto(grupo, 'nome') ?? '—', divisoes: numero(grupo, 'divisoes') }, frase,
  };
}

export interface PreviaDesfazer {
  modo: 'criados' | 'ligados';
  pai: { id: string; nome: string; voltaAValer: boolean };
  divisoes: { id: string; nome: string; ficaInativo: boolean }[];
  poligonos: { id: string; nome: string; destino: 'apagar' | 'soltar' }[];
  areas: { id: string; nome: string; tipo: string | null }[];
  frase: string;
}
export function lerDesfazer(dado: unknown): PreviaDesfazer | null {
  if (campo(dado, 'ok') !== true) return null;
  const modo = texto(dado, 'modo'), pai = campo(dado, 'pai'), frase = texto(dado, 'frase');
  const divisoes = campo(dado, 'divisoes'), poligonos = campo(dado, 'poligonos'), areas = campo(dado, 'areas');
  const paiId = texto(pai, 'id'), paiNome = texto(pai, 'nome');
  if ((modo !== 'criados' && modo !== 'ligados') || !paiId || !paiNome || !frase || !Array.isArray(divisoes) || !Array.isArray(poligonos) || !Array.isArray(areas)) return null;
  return {
    modo, frase, pai: { id: paiId, nome: paiNome, voltaAValer: campo(pai, 'volta_a_valer') === true },
    divisoes: divisoes.map(d => ({ id: texto(d, 'id') ?? '', nome: texto(d, 'nome') ?? '—', ficaInativo: campo(d, 'fica_inativo') === true })),
    poligonos: poligonos.map(p => ({ id: texto(p, 'id') ?? '', nome: texto(p, 'nome') ?? '—', destino: texto(p, 'destino') === 'apagar' ? 'apagar' : 'soltar' })),
    areas: areas.map(a => ({ id: texto(a, 'id') ?? '', nome: texto(a, 'nome') ?? '—', tipo: texto(a, 'tipo') })),
  };
}

// --- PIQUETE-VIGENCIA-01: "Mudar mês de início" (fn_piquetes_mudar_inicio) e o caminho de volta dele (fn_piquetes_mudar_inicio_desfazer) ---------
/** Um mês 'AAAA-MM' (ou 'AAAA-MM-DD') como 'MM/AAAA'. */
export function mesBr(anoMes: string): string {
  const [a, m] = anoMes.slice(0, 7).split('-');
  return a && m ? `${m}/${a}` : anoMes;
}

/**
 * D1 (Gabriel 05/11, pela recomendação): os meses oferecidos são os últimos 4 contados de HOJE, os mesmos do Concluir (`mesesDeInicio`), sem o mês em
 * que os piquetes já começam. Antes do início = antecipar; depois = adiar. Mês fechado aparece: quem recusa é o banco, com o link do Reabrir (D3).
 */
export function mesesParaMudarInicio<M extends { valor: string }>(meses: readonly M[], inicioAtual: string | null): M[] {
  const atual = inicioAtual ? `${inicioAtual.slice(0, 7)}-01` : null;
  return meses.filter(m => m.valor !== atual);
}

/**
 * PIQUETE-VIGENCIA-01 (bug do P9, Gabriel 06/11 17:11): o início dos piquetes vem do BANCO na abertura do diálogo — a mesma tabela que a
 * `fn_piquetes_mudar_inicio` lê —, nunca da lista de pastos da tela (velha depois de gravar: o P9 já começava em 10/2026 e o diálogo dizia
 * "início 11/2026", ofereceu 10/2026 e o banco recusou "já começam em 10/2026"). Todos no mesmo mês = esse mês; meses diferentes = desencontrados
 * (a tela mostra cada piquete com o seu início).
 */
export interface InicioDoPiquete { pastoId: string; nome: string; inicio: string | null }
export function inicioDoGrupo(inicios: readonly InicioDoPiquete[]): { mes: string | null; desencontrados: boolean } {
  if (inicios.length === 0) return { mes: null, desencontrados: false };
  const meses = new Set(inicios.map(i => (i.inicio ? `${i.inicio.slice(0, 7)}-01` : '')));
  if (meses.size > 1) return { mes: null, desencontrados: true };
  const [m] = [...meses];
  return { mes: m || null, desencontrados: false };
}

/**
 * O mini-mapa do diálogo: com a prévia, os meses que mudam (antecipar = antes o pai, depois os piquetes; adiar = o contrário); SEM prévia
 * (lendo, ou recusada) o que vale HOJE — o pai em cinza e os piquetes por cima —, para o mapa sempre aproximar no pasto (antes ele abria no
 * Brasil inteiro quando o banco recusava).
 */
export function itensDoMapaDoInicio(direcao: 'antecipar' | 'adiar' | null, pai: { chave: string; nome: string; geojson: GeoJSON.Geometry | null },
  piquetes: readonly { pastoId: string; nome: string; geojson: GeoJSON.Geometry | null }[]): ItemDaPreviaComMapa[] {
  const adiar = direcao === 'adiar';
  return [
    { chave: pai.chave, nome: pai.nome, antes: adiar ? null : pai.geojson, depois: adiar ? pai.geojson : null },
    ...piquetes.map(q => ({ chave: q.pastoId, nome: q.nome, antes: adiar ? q.geojson : null, depois: adiar ? null : q.geojson })),
  ];
}

/** D3: o banco põe o 1º mês fechado no HINT da recusa ('fechamento:AAAA-MM'); é ele que acende o link do Reabrir ao lado da frase. */
export function mesFechadoDoErro(erro: unknown): string | null {
  const h = erro && typeof erro === 'object' ? Reflect.get(erro, 'hint') : null;
  const m = typeof h === 'string' ? /^fechamento:(\d{4}-\d{2})$/.exec(h.trim()) : null;
  return m ? m[1] : null;
}

export interface PreviaMudarInicio {
  direcao: 'antecipar' | 'adiar';
  de: string; para: string; meses: string[];
  pai: { id: string; nome: string };
  areaPaiHa: number | null; areaGrupoHa: number | null;
  pastos: { id: string; nome: string }[];
  cards: number; cabecas: number; cardVaiPara: string | null;
  /** a frase em pt-BR montada aqui (`fraseDoInicio`): a do banco sai com ponto decimal ("0.00 UA/ha", "108.83 ha") */
  frase: string;
  grupoNome: string | null; fimDepois: string | null;
  lotacao: { kg: number | null; ua: number | null; uaHaGrupo: number | null; piquete: string | null; areaPiqueteHa: number | null; uaHaPiquete: number | null };
}

const nBr = (v: number | null, casas: number) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const diaBr = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
/** PIQUETE-VIGENCIA-01 (Gabriel 06/11 17:13, P17): a frase da prévia com os números da casa (vírgula decimal, ponto de milhar), dos campos do banco */
export function fraseDoInicio(p: Omit<PreviaMudarInicio, 'frase'>): string {
  const grupo = p.grupoNome ?? p.pai.nome, n = p.pastos.length, mm = mesBr(p.para);
  if (p.direcao === 'adiar') {
    return `${grupo}: os ${n} piquetes passam a começar em ${mm}; ${p.pai.nome} volta a valer até ${diaBr(p.fimDepois)} (${nBr(p.areaPaiHa, 2)} ha); nenhum card muda.`;
  }
  const l = p.lotacao, piq = l.piquete ?? p.cardVaiPara ?? '—';
  return `${grupo}: os ${n} piquetes passam a começar em ${mm}; ${p.pai.nome} fica encerrado em ${diaBr(p.fimDepois)}; ${p.cards} card(s) de ${p.pai.nome} `
    + `(${nBr(p.cabecas, 0)} cab, ${nBr(l.kg, 0)} kg, ${nBr(l.ua, 1)} UA) passam inteiros a ${piq}; lotação do grupo ${nBr(l.uaHaGrupo, 2)} UA/ha `
    + `(${nBr(p.areaGrupoHa, 2)} ha), de ${piq} ${nBr(l.uaHaPiquete, 2)} UA/ha (${nBr(l.areaPiqueteHa, 2)} ha).`;
}

/** PIQUETE-VIGENCIA-01 (Gabriel 06/11 17:13, P17): o que a GRAVAÇÃO devolve (as duas funções, `p_simular` false) — ela NÃO traz frase, meses nem
 *  pastos; lida pelo leitor da prévia, a tela dizia "não entende… Nada foi gravado" com o gesto JÁ gravado (P9 17:10, P17 17:13). */
export function lerGravouInicio(dado: unknown): { trilhaId: string } | null {
  if (campo(dado, 'ok') !== true || campo(dado, 'simulado') !== false) return null;
  const trilhaId = texto(dado, 'trilha_id');
  return trilhaId ? { trilhaId } : null;
}
const listaDeTextos = (v: unknown): string[] | null => (Array.isArray(v) && v.every(x => typeof x === 'string') ? v.map(String) : null);
export function lerMudarInicio(dado: unknown): PreviaMudarInicio | null {
  if (campo(dado, 'ok') !== true) return null;
  const direcao = texto(dado, 'direcao'), de = texto(dado, 'de'), para = texto(dado, 'para'), frase = texto(dado, 'frase');
  const pai = campo(dado, 'pai'), paiId = texto(pai, 'id'), paiNome = texto(pai, 'nome');
  const meses = listaDeTextos(campo(dado, 'meses')), pastos = campo(dado, 'pastos'), cards = campo(dado, 'cards');
  if ((direcao !== 'antecipar' && direcao !== 'adiar') || !de || !para || !frase || !paiId || !paiNome || !meses || !Array.isArray(pastos)) return null;
  const l = campo(dado, 'lotacao');
  const sem: Omit<PreviaMudarInicio, 'frase'> = {
    direcao, de, para, meses, pai: { id: paiId, nome: paiNome },
    areaPaiHa: numero(dado, 'area_pai_ha'), areaGrupoHa: numero(l, 'area_grupo_ha'),
    pastos: pastos.map(x => ({ id: texto(x, 'id') ?? '', nome: texto(x, 'nome') ?? '—' })),
    cards: Array.isArray(cards) ? cards.length : 0, cabecas: numero(dado, 'cabecas_antes') ?? 0, cardVaiPara: texto(dado, 'card_vai_para'),
    grupoNome: texto(campo(dado, 'grupo'), 'nome'), fimDepois: texto(pai, 'fim_depois'),
    lotacao: { kg: numero(l, 'kg'), ua: numero(l, 'ua'), uaHaGrupo: numero(l, 'ua_ha_grupo'), piquete: texto(l, 'piquete'),
      areaPiqueteHa: numero(l, 'area_piquete_ha'), uaHaPiquete: numero(l, 'ua_ha_piquete') },
  };
  return { ...sem, frase: fraseDoInicio(sem) };
}

export interface PreviaDesfazerInicio {
  direcao: 'antecipar' | 'adiar';
  de: string; para: string; meses: string[];
  pai: { id: string; nome: string };
  cards: number; cabecas: number; gravadaEm: string | null; motivoDoGesto: string | null;
  frase: string;
}
export function lerDesfazerInicio(dado: unknown): PreviaDesfazerInicio | null {
  if (campo(dado, 'ok') !== true) return null;
  const direcao = texto(dado, 'direcao'), de = texto(dado, 'de'), para = texto(dado, 'para'), frase = texto(dado, 'frase');
  const pai = campo(dado, 'pai'), paiId = texto(pai, 'id'), paiNome = texto(pai, 'nome');
  const meses = listaDeTextos(campo(dado, 'meses'));
  if ((direcao !== 'antecipar' && direcao !== 'adiar') || !de || !para || !frase || !paiId || !paiNome || !meses) return null;
  return {
    direcao, de, para, meses, frase, pai: { id: paiId, nome: paiNome },
    cards: numero(dado, 'cards') ?? 0, cabecas: numero(dado, 'cabecas') ?? 0,
    gravadaEm: texto(dado, 'gravada_em'), motivoDoGesto: texto(dado, 'motivo_do_gesto'),
  };
}

/** Os nomes dos piquetes numa célula curta: "7A–7D (4)"; um só = o nome. */
export function nomesDosPiquetes(nomes: readonly string[]): string {
  if (nomes.length === 0) return '—';
  if (nomes.length === 1) return nomes[0];
  return `${nomes[0]}–${nomes[nomes.length - 1]} (${nomes.length})`;
}
