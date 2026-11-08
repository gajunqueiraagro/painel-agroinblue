/**
 * PASTO-FICHA-01 PR B (Gabriel 08/11 08:57) — a LISTA dos pastos: uma linha por pasto, piquetes recuados abaixo do pai, toda coluna
 * ordenável, total e médias no rodapé. Pura (sem I/O), para o teste e para a tela lerem a MESMA conta.
 *
 * ⚠ PAI E PIQUETE (FECH-PASTO-UNIDADE-01, modelo A): o piquete é o pasto com `pai_id` (a origem do grupo ativo dele, lido pelo
 * `usePastos`). O pai é o pasto que tem o card do mês; os piquetes são subáreas dele. Por isso:
 *   · o piquete NUNCA aparece solto: ele vem sempre embaixo do pai, e o filtro/ordem/agrupamento olham o PAI;
 *   · a ÁREA DO PAI na lista é a SOMA dos piquetes (pedido 2 do Gabriel); a do cadastro do pai fica no `title` quando difere;
 *   · o total soma as linhas de cima (pais e pastos sem piquete) — somar os piquetes também contaria a mesma terra duas vezes.
 * ⚠ AUSÊNCIA É "—", NUNCA ZERO: sem avaliação, sem suporte, sem lotação, a célula fica vazia e a média ignora o pasto.
 */

/** O pasto como a lista o vê (o `Pasto` do cadastro tem tudo isso). */
export interface PastoDaLista {
  id: string;
  nome: string;
  tipo_uso: string;
  /** a área OFICIAL do mês (a vigência, `useAreaDosPastosNoMes`), nunca a de hoje lida direto (trava PASTO-AREA-OFICIAL-02a) */
  area_ha: number | null;
  ativo: boolean;
  pai_id?: string | null;
  /** PASTOS-CAD-02 — a posse (selo "arrendado") e a vigência ('AAAA-MM-DD'), para Vigentes/Encerrados/Todos no mês escolhido */
  posse?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
}

/** O que a ficha acrescenta a cada pasto (lido pelo `useFichaDosPastos`). Tudo pode faltar. */
export interface FichaNaLista {
  forrageira: string | null;
  /** ano da última reforma/formação (Patrimônio) */
  reformaAno: number | null;
  /** anos desde a implantação da forrageira (ou da última reforma) */
  idadeAnos: number | null;
  degradacao: Degradacao | null;
  /** potencial de lotação do mês (UA/ha) — o "suporte" */
  suporte: number | null;
  /** lotação do último mês fechado (UA/ha) */
  lotacao: number | null;
  /** data da última avaliação de campo, 'AAAA-MM-DD' */
  avaliadoEm: string | null;
  /** PASTOS-CAD-02 — nº de polígonos do pasto no mapa (0 = "sem desenho"; nulo = não lido) */
  poligonos: number | null;
}

export type Degradacao = 'sem' | 'leve' | 'moderada' | 'forte' | 'muito forte';
export const DEGRADACOES: readonly Degradacao[] = ['sem', 'leve', 'moderada', 'forte', 'muito forte'];
export const ehDegradacao = (v: unknown): v is Degradacao => DEGRADACOES.some(d => d === v);
/** o degrau da degradação (0 = sem … 4 = muito forte), para ordenar e tirar a média */
export const degrauDaDegradacao = (d: Degradacao | null): number | null => (d == null ? null : DEGRADACOES.indexOf(d));

export const FICHA_VAZIA: FichaNaLista = {
  forrageira: null, reformaAno: null, idadeAnos: null, degradacao: null, suporte: null, lotacao: null, avaliadoEm: null, poligonos: null,
};

export interface LinhaDaLista {
  pasto: PastoDaLista;
  /** a área que a lista mostra: a do cadastro, ou a soma dos piquetes no pai */
  area: number | null;
  /** a área do cadastro do PAI quando ela difere da soma dos piquetes (vai para o `title`); nulo nos outros */
  areaDoCadastro: number | null;
  ficha: FichaNaLista;
  piquetes: LinhaDaLista[];
  ehPiquete: boolean;
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

/** Σ das áreas; nenhuma com número = sem número (nunca "0,00") — a mesma regra do grupo (`areaDoGrupo`). */
export function somaDasAreas(areas: ReadonlyArray<number | null>): number | null {
  const com = areas.filter((a): a is number => a != null && Number.isFinite(a));
  return com.length === 0 ? null : arred2(com.reduce((s, a) => s + a, 0));
}

/**
 * As linhas de cima (pais e pastos sem piquete), cada pai com os seus piquetes. O piquete cujo pai não está na lista (o pai inativo ou
 * fora da vigência) sobe como linha de cima, marcado `ehPiquete` — sumir com ele esconderia terra; a tela diz de quem ele é.
 */
export function montarLinhas(pastos: readonly PastoDaLista[], ficha: ReadonlyMap<string, FichaNaLista>): LinhaDaLista[] {
  const porId = new Map(pastos.map(p => [p.id, p]));
  const filhos = new Map<string, PastoDaLista[]>();
  for (const p of pastos) {
    if (p.pai_id && p.pai_id !== p.id && porId.has(p.pai_id)) {
      const l = filhos.get(p.pai_id) ?? [];
      l.push(p);
      filhos.set(p.pai_id, l);
    }
  }
  const linha = (p: PastoDaLista, ehPiquete: boolean): LinhaDaLista => {
    const piquetes = (filhos.get(p.id) ?? []).map(f => linha(f, true));
    const soma = piquetes.length > 0 ? somaDasAreas(piquetes.map(q => q.area)) : null;
    const area = piquetes.length > 0 ? soma : p.area_ha;
    const areaDoCadastro = piquetes.length > 0 && p.area_ha != null && soma != null && Math.abs(p.area_ha - soma) >= 0.005
      ? p.area_ha : null;
    return { pasto: p, area, areaDoCadastro, ficha: ficha.get(p.id) ?? FICHA_VAZIA, piquetes, ehPiquete };
  };
  return pastos
    .filter(p => !(p.pai_id && p.pai_id !== p.id && porId.has(p.pai_id)))
    .map(p => linha(p, !!p.pai_id && p.pai_id !== p.id));
}

/* ── ordenação ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export type ColunaDaLista = 'pasto' | 'uso' | 'area' | 'forrageira' | 'reforma' | 'idade' | 'degradacao' | 'suporte' | 'lotacao' | 'avaliacao' | 'vigencia' | 'mapa';
export type Direcao = 'asc' | 'desc';

/** o valor de cada coluna para comparar; `null` = ausência (vai para o fim, nos dois sentidos) */
export function valorDaColuna(l: LinhaDaLista, c: ColunaDaLista, rotuloDoUso: (tipo: string) => string): string | number | null {
  switch (c) {
    case 'pasto': return l.pasto.nome;
    case 'uso': return rotuloDoUso(l.pasto.tipo_uso);
    case 'area': return l.area;
    case 'forrageira': return l.ficha.forrageira;
    case 'reforma': return l.ficha.reformaAno;
    case 'idade': return l.ficha.idadeAnos;
    case 'degradacao': return degrauDaDegradacao(l.ficha.degradacao);
    case 'suporte': return l.ficha.suporte;
    case 'lotacao': return l.ficha.lotacao;
    case 'avaliacao': return l.ficha.avaliadoEm;
    case 'vigencia': return l.pasto.data_inicio ?? l.pasto.data_fim ?? null;
    case 'mapa': return l.ficha.poligonos;
  }
}

export const COLUNAS_DE_TEXTO: ReadonlySet<ColunaDaLista> = new Set(['pasto', 'uso', 'forrageira', 'avaliacao']);

function comparar(a: string | number | null, b: string | number | null, sinal: number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return sinal * (a - b);
  /* nome de pasto: "P2" antes de "P10" (numeric), sem acento nem caixa */
  return sinal * String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Ordena as linhas de cima e, dentro de cada pai, os piquetes — pela MESMA coluna. Estável pelo índice de origem. */
export function ordenarLinhas(linhas: readonly LinhaDaLista[], c: ColunaDaLista, d: Direcao, rotuloDoUso: (tipo: string) => string): LinhaDaLista[] {
  const sinal = d === 'asc' ? 1 : -1;
  const ord = (ls: readonly LinhaDaLista[]): LinhaDaLista[] => ls
    .map((l, i) => ({ l, i }))
    .sort((x, y) => comparar(valorDaColuna(x.l, c, rotuloDoUso), valorDaColuna(y.l, c, rotuloDoUso), sinal) || x.i - y.i)
    .map(({ l }) => (l.piquetes.length > 1 ? { ...l, piquetes: ord(l.piquetes) } : l));
  return ord(linhas);
}

/* ── o rodapé ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface TotaisDaLista {
  pastos: number;
  piquetes: number;
  area: number | null;
  /** média simples dos pastos com idade */
  idadeMedia: number | null;
  /** a degradação média (degrau 0–4) e o nome do degrau mais próximo */
  degradacaoMedia: number | null;
  degradacaoMediaNome: Degradacao | null;
  /** médias PONDERADAS PELA ÁREA (UA/ha × ha ÷ ha) — a média de uma razão por hectare */
  suporteMedio: number | null;
  lotacaoMedia: number | null;
}

/** Ponderada pela área, só com os pastos que têm valor E área. */
function mediaPorArea(linhas: readonly LinhaDaLista[], v: (l: LinhaDaLista) => number | null): number | null {
  let soma = 0; let area = 0;
  for (const l of linhas) {
    const x = v(l);
    if (x == null || l.area == null || !(l.area > 0)) continue;
    soma += x * l.area; area += l.area;
  }
  return area > 0 ? arred2(soma / area) : null;
}

/** Totais e médias das linhas de cima (os piquetes já estão na área do pai). */
export function totaisDaLista(linhas: readonly LinhaDaLista[]): TotaisDaLista {
  const idades = linhas.map(l => l.ficha.idadeAnos).filter((x): x is number => x != null);
  const degraus = linhas.map(l => degrauDaDegradacao(l.ficha.degradacao)).filter((x): x is number => x != null);
  const degradacaoMedia = degraus.length ? Math.round((degraus.reduce((s, x) => s + x, 0) / degraus.length) * 10) / 10 : null;
  return {
    pastos: linhas.length,
    piquetes: linhas.reduce((s, l) => s + l.piquetes.length, 0),
    area: somaDasAreas(linhas.map(l => l.area)),
    idadeMedia: idades.length ? Math.round((idades.reduce((s, x) => s + x, 0) / idades.length) * 10) / 10 : null,
    degradacaoMedia,
    degradacaoMediaNome: degradacaoMedia == null ? null : DEGRADACOES[Math.min(4, Math.max(0, Math.round(degradacaoMedia)))],
    suporteMedio: mediaPorArea(linhas, l => l.ficha.suporte),
    lotacaoMedia: mediaPorArea(linhas, l => l.ficha.lotacao),
  };
}

/* ── os sinais da linha ────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Lotação acima do suporte (os dois com número). */
export const acimaDoSuporte = (f: FichaNaLista): boolean => f.lotacao != null && f.suporte != null && f.lotacao > f.suporte + 1e-9;

/** Avaliação com mais de 12 meses (pelo dia de hoje, 'AAAA-MM-DD'). Sem avaliação não é "vencida": é ausente. */
export function avaliacaoVencida(avaliadoEm: string | null, hoje: string): boolean {
  if (!avaliadoEm) return false;
  const [a, m, d] = hoje.split('-').map(Number);
  const limite = `${a - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return avaliadoEm < limite;
}

/** Anos inteiros entre uma data 'AAAA-MM-DD' (ou 'AAAA-MM') e hoje. */
export function anosDesde(data: string | null, hoje: string): number | null {
  if (!data) return null;
  const [a0, m0] = data.split('-').map(Number);
  const [a1, m1] = hoje.split('-').map(Number);
  if (!a0 || !a1) return null;
  const meses = (a1 - a0) * 12 + ((m1 || 1) - (m0 || 1));
  return meses < 0 ? 0 : Math.floor(meses / 12);
}

/* ── a coluna Pasto (Gabriel 09:22): o nome NUNCA corta ─────────────────────────────────────────────────────────────────── */

/** a fonte da coluna Pasto: a da régua, e o piso da casa */
export const FONTE_PASTO_PX = 10;
export const PISO_DA_FONTE_PX = 9.5;
/** o mínimo que a Forrageira guarda antes de a fonte do Pasto descer */
export const FORRAGEIRA_MINIMA_PX = 90;

/**
 * A largura e a fonte da coluna Pasto. `pedido` = o maior nome da fazenda medido na fonte da régua (com recuo, seta e "· N piq.");
 * `disponivel` = a largura da tabela; `outras` = a soma das colunas fixas fora a Pasto.
 *   · cabe deixando a Forrageira com o mínimo → a largura do maior nome, fonte da régua;
 *   · não cabe → a fonte desce (proporcional) até caber, nunca abaixo do piso;
 *   · nem no piso → a coluna fica com o que o nome pede no piso e a Forrageira cede. Reticência no nome, nunca.
 */
export function colunaDoPasto(pedido: number, disponivel: number, outras: number): { px: number; fontePx: number } {
  const teto = disponivel - outras - FORRAGEIRA_MINIMA_PX;
  const largura = Math.ceil(pedido) + 2;
  if (largura <= teto || !(disponivel > 0)) return { px: Math.max(largura, 60), fontePx: FONTE_PASTO_PX };
  const fonte = Math.max(PISO_DA_FONTE_PX, Math.floor((FONTE_PASTO_PX * teto / largura) * 2) / 2);
  return { px: Math.ceil(largura * fonte / FONTE_PASTO_PX), fontePx: fonte };
}


/* ── PASTOS-CAD-02 (Gabriel 09:54): Vigentes · Encerrados · Todos no mês escolhido ─────────────────────────────────────────── */

export type FiltroDeVigencia = 'vigentes' | 'encerrados' | 'todos';

/** O pasto vale no mês 'AAAA-MM'? (início ≤ mês ≤ fim; sem data = sempre) — a regra de `isPastoAtivoNoMes`, no mês ESCOLHIDO. */
export function vigenteNoMes(p: Pick<PastoDaLista, 'data_inicio' | 'data_fim'>, anoMes: string): boolean {
  const ini = p.data_inicio ? p.data_inicio.slice(0, 7) : null;
  const fim = p.data_fim ? p.data_fim.slice(0, 7) : null;
  return (!ini || ini <= anoMes) && (!fim || fim >= anoMes);
}

/** Encerrado no mês = o fim já passou (o que ainda vai começar não é "encerrado": também sai dos vigentes, e aparece em Todos). */
export const encerradoNoMes = (p: Pick<PastoDaLista, 'data_fim'>, anoMes: string): boolean => !!p.data_fim && p.data_fim.slice(0, 7) < anoMes;

/** As linhas de cima pelo filtro (o pai decide: o piquete vem com ele). */
export function filtrarPorVigencia(linhas: readonly LinhaDaLista[], filtro: FiltroDeVigencia, anoMes: string): LinhaDaLista[] {
  if (filtro === 'todos') return [...linhas];
  return linhas.filter(l => (filtro === 'vigentes' ? vigenteNoMes(l.pasto, anoMes) : !vigenteNoMes(l.pasto, anoMes)));
}

export const ehArrendado = (p: Pick<PastoDaLista, 'posse'>): boolean => p.posse === 'arrendada_de_terceiro';

/** "07/26 → 08/26", "09/26 →", "início → 05/25"; sem datas = "" (vale sempre). */
export function textoDaVigencia(p: Pick<PastoDaLista, 'data_inicio' | 'data_fim'>): string {
  const mm = (d: string) => `${d.slice(5, 7)}/${d.slice(2, 4)}`;
  if (!p.data_inicio && !p.data_fim) return '';
  return `${p.data_inicio ? mm(p.data_inicio) : 'início'} → ${p.data_fim ? mm(p.data_fim) : ''}`.trimEnd();
}

export interface TotalDaPosse { pastos: number; area: number | null; suporteMedio: number | null; lotacaoMedia: number | null }
/** O rodapé do PASTOS-CAD-02: própria × arrendada × total, SÓ dos vigentes no mês (o que está na lista e não vale no mês não soma). */
export function totaisPorPosse(linhas: readonly LinhaDaLista[], anoMes: string): { propria: TotalDaPosse; arrendada: TotalDaPosse; total: TotalDaPosse; naLista: number } {
  /* o pasto técnico da divergência do campeiro (área 0) não é pasto do mês: o banco o tira do conjunto (`fn_pastos_aplicaveis_mes`) */
  const vig = linhas.filter(l => vigenteNoMes(l.pasto, anoMes) && l.pasto.tipo_uso !== 'divergencia');
  const de = (ls: LinhaDaLista[]): TotalDaPosse => ({
    pastos: ls.length, area: somaDasAreas(ls.map(l => l.area)),
    suporteMedio: mediaPorArea(ls, l => l.ficha.suporte), lotacaoMedia: mediaPorArea(ls, l => l.ficha.lotacao),
  });
  return { propria: de(vig.filter(l => !ehArrendado(l.pasto))), arrendada: de(vig.filter(l => ehArrendado(l.pasto))), total: de(vig), naLista: linhas.length };
}
