/**
 * FECH-PASTO-UNIDADE-01 F2 — o card é do PASTO; o piquete é um campo opcional da linha (`fechamento_pasto_itens.piquete_id`).
 * O modal tem a MESMA grade de 9 categorias nos dois modos: "Pasto inteiro" (uma grade, sem piquete) e "Por piquetes" (uma grade por
 * piquete, em abas, e a aba Total só de leitura). Aqui ficam as regras puras: separar as linhas por piquete, juntar as abas (o MESMO
 * cálculo da `fn_fechamento_pasto_inteiro`: cabeças somadas, peso médio ponderado pelas linhas com peso, lote só se for um só), o que vai
 * ao gravador e o "Usar" do mês anterior.
 */

export interface ItemDaGrade {
  categoria_id: string;
  quantidade: number;
  peso_medio_kg: number | null;
  lote: string | null;
  observacoes: string | null;
  origem_dado: string;
  lote_id?: string | null;
}

/** a linha como o banco guarda (com o piquete; nulo = o pasto inteiro) */
export interface LinhaDoCard extends ItemDaGrade {
  piquete_id?: string | null;
}

export type ModoDoCard = 'inteiro' | 'piquetes';

/** a chave da aba das linhas sem piquete num card que tem as duas (raro: o banco aceita) */
export const SEM_PIQUETE = '';

export function gradeVazia(categorias: readonly { id: string }[]): ItemDaGrade[] {
  return categorias.map(c => ({ categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: null, observacoes: null, origem_dado: 'manual' }));
}

/** a grade das 9 categorias a partir das linhas (uma por categoria; a categoria que falta vem zerada) */
export function gradeDasLinhas(categorias: readonly { id: string }[], linhas: readonly ItemDaGrade[]): ItemDaGrade[] {
  return categorias.map(c => {
    const l = linhas.find(x => x.categoria_id === c.id);
    return l
      ? { categoria_id: c.id, quantidade: l.quantidade, peso_medio_kg: l.peso_medio_kg, lote: l.lote, observacoes: l.observacoes, origem_dado: l.origem_dado, lote_id: l.lote_id }
      : { categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: null, observacoes: null, origem_dado: 'manual' };
  });
}

/** o card foi lançado por piquetes se ALGUMA linha tem piquete */
export function modoDasLinhas(linhas: readonly LinhaDoCard[]): ModoDoCard {
  return linhas.some(l => !!l.piquete_id) ? 'piquetes' : 'inteiro';
}

/** as abas: os piquetes do mês e, além deles, todo piquete que já tem linha no card; as linhas SEM piquete de um card que também tem
 *  piquete ganham a aba "Sem piquete" (nenhuma cabeça fica sem aba) */
export function abasDoCard(piquetesDoMes: readonly string[], linhas: readonly LinhaDoCard[]): string[] {
  const abas = [...piquetesDoMes];
  const misto = modoDasLinhas(linhas) === 'piquetes' && linhas.some(l => !l.piquete_id && l.quantidade > 0);
  for (const l of linhas) {
    if (l.piquete_id && !abas.includes(l.piquete_id)) abas.push(l.piquete_id);
  }
  if (misto) abas.push(SEM_PIQUETE);
  return abas;
}

/** uma grade por aba */
export function separarPorPiquete(categorias: readonly { id: string }[], abas: readonly string[], linhas: readonly LinhaDoCard[]): Map<string, ItemDaGrade[]> {
  const mapa = new Map<string, ItemDaGrade[]>();
  for (const a of abas) mapa.set(a, gradeDasLinhas(categorias, linhas.filter(l => (l.piquete_id || SEM_PIQUETE) === a)));
  return mapa;
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Juntar as abas numa grade só — o espelho da `fn_fechamento_pasto_inteiro`: por categoria, cabeças somadas; peso médio ponderado pelas
 * linhas que têm peso (2 casas); o lote cadastrado e o texto do lote ficam só se forem UM só (com alguma linha sem lote, sai o lote).
 */
export function juntarAbas(categorias: readonly { id: string }[], grades: Iterable<readonly ItemDaGrade[]>): ItemDaGrade[] {
  const todas = [...grades].flat().filter(i => i.quantidade > 0);
  return categorias.map(c => {
    const ls = todas.filter(i => i.categoria_id === c.id);
    if (ls.length === 0) return { categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: null, observacoes: null, origem_dado: 'manual' };
    const q = ls.reduce((s, i) => s + i.quantidade, 0);
    const comPeso = ls.filter(i => (i.peso_medio_kg ?? 0) > 0);
    const qp = comPeso.reduce((s, i) => s + i.quantidade, 0);
    const pm = qp > 0 ? arred2(comPeso.reduce((s, i) => s + i.quantidade * (i.peso_medio_kg ?? 0), 0) / qp) : null;
    const lotes = new Set(ls.map(i => i.lote_id ?? null));
    const textos = new Set(ls.map(i => i.lote).filter((t): t is string => !!t));
    const obs = [...new Set(ls.map(i => i.observacoes).filter((t): t is string => !!t))].join(' · ');
    return {
      categoria_id: c.id, quantidade: q, peso_medio_kg: pm,
      lote: textos.size === 1 ? [...textos][0] : null,
      observacoes: obs || null,
      origem_dado: ls.length === 1 ? ls[0].origem_dado : 'ajustado',
      lote_id: lotes.size === 1 && !lotes.has(null) ? [...lotes][0] : null,
    };
  });
}

/** o que vai ao `fn_fechamento_pasto_salvar`: pasto inteiro = as linhas sem piquete; por piquetes = cada aba com o piquete dela */
export function linhasParaGravar(modo: ModoDoCard, inteiro: readonly ItemDaGrade[], abas: ReadonlyMap<string, readonly ItemDaGrade[]>): LinhaDoCard[] {
  if (modo === 'inteiro') return inteiro.map(i => ({ ...i }));
  const out: LinhaDoCard[] = [];
  for (const [aba, grade] of abas) {
    for (const i of grade) if (i.quantidade > 0) out.push({ ...i, piquete_id: aba === SEM_PIQUETE ? null : aba });
  }
  return out;
}

/** cabeças de uma grade */
export const cabecasDe = (grade: readonly { quantidade: number }[]) => grade.reduce((s, i) => s + (i.quantidade || 0), 0);

/**
 * "Usar" uma linha do mês anterior numa grade: categoria vazia recebe a linha (cab, peso, lote); categoria com cabeça SOMA (peso médio
 * ponderado; o lote fica só se for o mesmo). A origem diz "copiado do mês anterior".
 */
export function usarNaGrade(grade: readonly ItemDaGrade[], linha: ItemDaGrade): ItemDaGrade[] {
  return grade.map(i => {
    if (i.categoria_id !== linha.categoria_id || linha.quantidade <= 0) return i;
    if (i.quantidade <= 0) {
      return { ...i, quantidade: linha.quantidade, peso_medio_kg: linha.peso_medio_kg, lote: linha.lote, lote_id: linha.lote_id ?? null, origem_dado: 'copiado_mes_anterior' };
    }
    const [junto] = juntarAbas([{ id: i.categoria_id }], [[i], [linha]]);
    return { ...i, quantidade: junto.quantidade, peso_medio_kg: junto.peso_medio_kg, lote: junto.lote, lote_id: junto.lote_id, origem_dado: 'copiado_mes_anterior' };
  });
}
