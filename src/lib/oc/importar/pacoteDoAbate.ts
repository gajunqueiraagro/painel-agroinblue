/**
 * IMPORTAR-ABATE-01 — o PACOTE da `oc_importar_abate` (migration 117510) montado do que foi LIDO nos PDFs do frigorífico (NF, acerto,
 * romaneio) + o que o operador responde nas Dúvidas (fazenda, contraparte, categoria, peso vivo médio). Puro: sem banco e sem React.
 *
 * Regras (as do gabarito 5d255b74 e do Chat 11/11 16:28):
 *  - um LOTE por faixa de preço do acerto, o de mais cabeças primeiro;
 *  - o SENAR (e o Funrural, quando retido) rateado pelo total de cada faixa, o resto de centavo no lote maior;
 *  - Funrural "sobre a folha" = 0 retido;
 *  - DIFERENÇA ENTRE DOCUMENTOS SE MOSTRA, NUNCA SE AJUSTA: NF × acerto (bruto), soma das faixas × total impresso no acerto, NF de produtor
 *    (valor de pauta) × NF do frigorífico, romaneio × acerto (cab e kg). Cada uma vira uma `Diferenca` com a frase pronta.
 *  - o recebimento é o LÍQUIDO DO ACERTO (o que cai no banco). Se a soma dos lotes não fecha com ele, o banco recusa (a conferência da
 *    117510) e a prévia diz por quê — a decisão sobre o centavo do SM-LT06 é a D-ABATE-1 (FILA 11/11 16:32).
 */
import type { CamposLidos } from '@/lib/oc/leitura/layoutsAbate';
import type { DetalhesDoAcerto, DetalhesDoRomaneio } from './detalhesMinerva';

export interface LoteDoPacote {
  ordem: number; cab: number; peso_carcaca_kg: number; preco_arroba: number; valor_liquido: number; senar: number; funrural: number; observacao: string;
  /** 117535: a categoria DESTE lote, só quando difere da do pacote (sem ela, a do pacote) */
  categoria?: string;
  /** 117537: o crédito do acerto (Fortunceres: "Incentivo Proape-Precoce/MS") que já está DENTRO do `valor_liquido`; só quando há */
  incentivo?: number;
  /** 117539 (IMPORTAR-ABATE-PESO-POR-LOTE-01): o peso vivo médio DESTE lote; sem ele, o geral do pacote */
  peso_vivo_kg?: number;
}
export interface PacoteDoAbate {
  fazenda_id: string; contraparte_id: string; data_abate: string; categoria: string; peso_vivo_medio_kg: number; observacoes: string;
  chave_nf: string | null;
  lotes: LoteDoPacote[];
  recebimento: { valor: number; vencimento: string; documento: string; observacao: string };
  documentos: Record<string, unknown>[];
  /** D-ABATE-1 (117530): o total impresso no acerto − a soma das faixas, com sinal, e o texto do papel. Ausente = 0. */
  diferenca_acerto?: { valor: number; texto: string };
}
export type QualDiferenca = 'nf_x_acerto' | 'faixas_x_acerto' | 'nf_produtor' | 'romaneio_x_acerto';
export interface Diferenca { qual: QualDiferenca; frase: string; a: number; b: number }
export type Duvida = 'fazenda' | 'contraparte' | 'categoria' | 'peso_vivo';

/** Um acerto do frigorífico com a NF e o romaneio que são dele (casados pela ordem de compra, cabeças e kg) */
export interface AcertoDaEntrada { nf: CamposLidos | null; acerto: CamposLidos; detalhes: DetalhesDoAcerto; romaneio: DetalhesDoRomaneio | null }
export interface EntradaDoPacote extends AcertoDaEntrada {
  /** os payloads do `oc_documento_registrar` (sem `lotes`), na ordem em que os PDFs entraram */
  documentos: Record<string, unknown>[];
  /** respostas das Dúvidas; nulo = ainda não respondida */
  fazendaId: string | null; contraparteId: string | null; categoria: string | null; pesoVivoMedioKg: number | null;
  /** 117535 (Chat 17:15 ajuste 3): a categoria de um lote (pela ordem) que não é a do lote 1; ausente = a de todos */
  categoriasPorLote?: Record<number, string | null>;
  /** 117539 (Chat 13/11 10:25): o peso vivo médio de um lote (pela ordem); o do lote manda, sem ele vale o geral */
  pesosPorLote?: Record<number, number | null>;
  /** 117537 (proposta A, Chat 18:35): os OUTROS acertos do mesmo abate (Fortunceres: um por ordem de compra) → um lote cada, na MESMA OC */
  maisAcertos?: AcertoDaEntrada[];
  /** com `maisAcertos`: de qual acerto (0 = o de cima) é cada documento, na ordem de `documentos`; nulo = de todos */
  acertoDoDocumento?: (number | null)[];
}
export interface Montagem { pacote: PacoteDoAbate | null; duvidas: Duvida[]; diferencas: Diferenca[]; recusa: string | null;
  /** o que falta e NÃO trava (117537: "falta a NF do lote N") */
  avisos?: string[];
  /** os lotes como vão ao pacote (também com Dúvidas em aberto: a tela pergunta a categoria de cada um) */
  lotes: LoteDoPacote[] }

const cent = (n: number) => Math.round(n * 100);
const real = (c: number) => c / 100;
const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Divide `total` (em centavos) pelos pesos pelo MAIOR RESTO: cada parte fica a menos de 1 centavo da proporção exata e a soma das
    partes é sempre o total (empate de resto: o de maior peso primeiro). */
export function ratearCentavos(totalCent: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, p) => a + p, 0);
  if (soma <= 0 || totalCent === 0) return pesos.map(() => 0);
  const exatas = pesos.map(p => (totalCent * p) / soma);
  const partes = exatas.map(e => Math.floor(e));
  let resto = totalCent - partes.reduce((a, p) => a + p, 0);
  const ordem = exatas.map((e, i) => i).sort((i, j) => (exatas[j] - partes[j]) - (exatas[i] - partes[i]) || pesos[j] - pesos[i]);
  for (const i of ordem) { if (resto <= 0) break; partes[i] += 1; resto -= 1; }
  return partes;
}

/** As diferenças entre os documentos (nenhuma é corrigida). */
export function diferencasDoAbate(e: Pick<EntradaDoPacote, 'nf' | 'acerto' | 'detalhes' | 'romaneio'>): Diferenca[] {
  const out: Diferenca[] = [];
  const somaFaixas = real(e.detalhes.faixas.reduce((a, f) => a + cent(f.total), 0));
  const brutoAcerto = e.acerto.bruto;
  if (brutoAcerto != null && cent(somaFaixas) !== cent(brutoAcerto)) {
    out.push({ qual: 'faixas_x_acerto', a: somaFaixas, b: brutoAcerto,
      frase: `A soma das faixas do acerto dá R$ ${brl(somaFaixas)}; o total impresso no acerto é R$ ${brl(brutoAcerto)} (${brutoAcerto > somaFaixas ? '+' : '−'}${brl(Math.abs(brutoAcerto - somaFaixas))}).` });
  }
  if (e.nf?.bruto != null && brutoAcerto != null && cent(e.nf.bruto) !== cent(brutoAcerto)) {
    out.push({ qual: 'nf_x_acerto', a: e.nf.bruto, b: brutoAcerto,
      frase: `NF do frigorífico R$ ${brl(e.nf.bruto)} × acerto R$ ${brl(brutoAcerto)} (${brutoAcerto > e.nf.bruto ? '+' : '−'}${brl(Math.abs(brutoAcerto - e.nf.bruto))}).` });
  }
  for (const p of e.nf?.nfsProdutor ?? []) {
    if (p.valor != null && e.nf?.bruto != null && cent(p.valor) !== cent(e.nf.bruto)) {
      out.push({ qual: 'nf_produtor', a: p.valor, b: e.nf.bruto,
        frase: `NF de produtor ${p.numero}${p.data ? ` de ${p.data.split('-').reverse().join('/')}` : ''}: R$ ${brl(p.valor)} (valor de pauta) × NF do frigorífico R$ ${brl(e.nf.bruto)}.` });
    }
  }
  if (e.romaneio && e.acerto.cab != null) {
    const kg = real(e.romaneio.animais.reduce((a, x) => a + cent(x.pesoKg), 0));
    const cab = e.romaneio.animais.length;
    if (cab !== e.acerto.cab || (e.acerto.pesoKg != null && cent(kg) !== cent(e.acerto.pesoKg))) {
      out.push({ qual: 'romaneio_x_acerto', a: cab, b: e.acerto.cab,
        frase: `Romaneio ${cab} cab · ${brl(kg)} kg × acerto ${e.acerto.cab} cab · ${brl(e.acerto.pesoKg ?? 0)} kg.` });
    }
  }
  return out;
}

const precoBR = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** " · @ 385,25 + idade 5,00 + programa 5,7788" — o preço composto lido na Classificação (vazio quando o papel não o traz) */
const textoDaComposicao = (d: DetalhesDoAcerto) => (d.composicaoDoPreco
  ? ` · @ ${precoBR(d.composicaoDoPreco.base)} + idade ${precoBR(d.composicaoDoPreco.idade)} + programa ${precoBR(d.composicaoDoPreco.programa)}` : '');

/** O peso vivo próprio do lote `k` (pela ordem), só quando informado e > 0 */
export function pesoProprioDoLote(e: Pick<EntradaDoPacote, 'pesosPorLote'>, k: number): number | null {
  const p = e.pesosPorLote?.[k];
  return p != null && p > 0 ? p : null;
}

/** O peso vivo é dúvida enquanto algum dos `nLotes` lotes fica sem peso: nem o dele, nem o geral */
function duvidasDa(e: EntradaDoPacote, nLotes: number): Duvida[] {
  const duvidas: Duvida[] = [];
  if (!e.fazendaId) duvidas.push('fazenda');
  if (!e.contraparteId) duvidas.push('contraparte');
  if (!e.categoria) duvidas.push('categoria');
  const geral = e.pesoVivoMedioKg != null && e.pesoVivoMedioKg > 0;
  if (!geral && Array.from({ length: Math.max(nLotes, 1) }, (_, i) => pesoProprioDoLote(e, i + 1)).some(p => p == null)) duvidas.push('peso_vivo');
  return duvidas;
}
const comPesoProprio = (e: EntradaDoPacote, k: number) => { const p = pesoProprioDoLote(e, k); return p != null ? { peso_vivo_kg: p } : {}; };

/* ── VÁRIOS ACERTOS NO MESMO ABATE (proposta A, Chat 12/11 18:35; banco 117537) ───────────────────────────────────────────────────
   Fortunceres (NJ · Pureza 12/11): um acerto por ordem de compra → UM LOTE por acerto na MESMA OC (o padrão das OCs da Fortunceres já
   lançadas); o crédito do acerto (incentivo) fica DENTRO do líquido do lote e vai no lote (`incentivo`); a NF e o romaneio de cada
   acerto se ligam só ao lote dele (`lote_ordem`) e a conferência do bruto é por NF; acerto sem NF = AVISO (não trava). */
function montarVariosAcertos(e: EntradaDoPacote, grupos: AcertoDaEntrada[]): Montagem {
  const duvidas = duvidasDa(e, grupos.length);
  const diferencas: Diferenca[] = [];
  const avisos: string[] = [];
  const lotes: LoteDoPacote[] = [];
  const nome = (g: AcertoDaEntrada, k: number) => `lote ${k} (ordem de compra ${g.acerto.ordemCompra ?? '—'})`;
  for (const [i, g] of grupos.entries()) {
    const k = i + 1;
    if (g.detalhes.faixas.length !== 1) {
      return { pacote: null, duvidas, diferencas, recusa: `O acerto do ${nome(g, k)} tem ${g.detalhes.faixas.length} faixas de preço: com vários acertos no mesmo abate, só sei montar um lote por acerto.`, lotes: [], avisos };
    }
    const f = g.detalhes.faixas[0];
    const total = cent(f.total);
    if (g.acerto.bruto != null && cent(g.acerto.bruto) !== total) {
      return { pacote: null, duvidas, diferencas, recusa: `O total impresso no acerto do ${nome(g, k)} (R$ ${brl(g.acerto.bruto)}) não é o da faixa (R$ ${brl(f.total)}): com vários acertos, a diferença do acerto ainda não entra.`, lotes: [], avisos };
    }
    for (const d of diferencasDoAbate(g)) diferencas.push({ ...d, frase: `Lote ${k}: ${d.frase}` });
    if (!g.nf) avisos.push(`Falta a NF do frigorífico do ${nome(g, k)}: esse lote não é conferido com a NF.`);
    const senar = g.detalhes.despesas.filter(d => d.tipo === 'senar').reduce((a, d) => a + cent(d.valor), 0);
    const funrural = g.detalhes.funruralPelaFolha ? 0 : g.detalhes.despesas.filter(d => d.tipo === 'funrural').reduce((a, d) => a + cent(d.valor), 0);
    const incentivo = g.detalhes.creditos.reduce((a, c) => a + cent(c.valor), 0);
    lotes.push({
      ordem: k, cab: f.cab, peso_carcaca_kg: f.kg, preco_arroba: f.precoArroba,
      valor_liquido: real(total - senar - funrural + incentivo), senar: real(senar), funrural: real(funrural),
      observacao: `Ordem de compra ${g.acerto.ordemCompra ?? '—'} · faixa do acerto: ${f.descricao}${textoDaComposicao(g.detalhes)}`,
      ...(() => { const c = e.categoriasPorLote?.[k]; return c && c !== e.categoria ? { categoria: c } : {}; })(),
      ...(incentivo > 0 ? { incentivo: real(incentivo) } : {}),
      ...comPesoProprio(e, k),
    });
  }
  const g0 = grupos[0].acerto;
  const dataAbate = g0.dataAbate ?? grupos[0].nf?.dataAbate;
  const vencimento = g0.vencimento;
  if (!dataAbate || !vencimento || grupos.some(g => g.acerto.liquido == null)) {
    return { pacote: null, duvidas, diferencas, recusa: 'Um dos acertos não trouxe a data do abate, o vencimento ou o líquido.', lotes, avisos };
  }
  if (grupos.some(g => (g.acerto.dataAbate ?? dataAbate) !== dataAbate || (g.acerto.vencimento ?? vencimento) !== vencimento)) {
    return { pacote: null, duvidas, diferencas, recusa: 'Os acertos têm datas de abate ou vencimentos diferentes: são abates diferentes, importe um de cada vez.', lotes, avisos };
  }
  if (duvidas.length > 0) return { pacote: null, duvidas, diferencas, recusa: null, lotes, avisos };
  const liquido = real(grupos.reduce((a, g) => a + cent(g.acerto.liquido ?? 0), 0));
  const nfs = grupos.map(g => g.nf?.numero).filter((n): n is string => !!n);
  const documentos = e.documentos.map((d, i) => {
    const g = e.acertoDoDocumento?.[i];
    return g == null ? d : { ...d, lote_ordem: g + 1 };
  });
  return {
    pacote: {
      fazenda_id: e.fazendaId ?? '', contraparte_id: e.contraparteId ?? '', data_abate: dataAbate, categoria: e.categoria ?? '',
      peso_vivo_medio_kg: e.pesoVivoMedioKg ?? 0,
      observacoes: [`Importado dos documentos do frigorífico (${grupos.map(g => `OC ${g.acerto.ordemCompra ?? '—'}, lote ${g.acerto.loteFrigorifico ?? '—'}`).join(' · ')}).`,
        ...diferencas.map(d => d.frase)].join(' '),
      chave_nf: grupos.map(g => g.nf?.chaveAcesso).find((c): c is string => !!c) ?? null,
      lotes,
      recebimento: { valor: liquido, vencimento, documento: nfs.map(n => `NF ${n}`).join(' · '), observacao: `Líquido dos ${grupos.length} acertos do frigorífico.` },
      documentos,
    },
    duvidas, diferencas, recusa: null, lotes, avisos,
  };
}

export function montarPacoteDoAbate(e: EntradaDoPacote): Montagem {
  if (e.maisAcertos && e.maisAcertos.length > 0) return montarVariosAcertos(e, [e, ...e.maisAcertos]);
  const diferencas = diferencasDoAbate(e);
  const duvidas = duvidasDa(e, e.detalhes.faixas.length);
  const faixas = [...e.detalhes.faixas].sort((a, b) => b.cab - a.cab);
  if (faixas.length === 0) return { pacote: null, duvidas, diferencas, recusa: 'O acerto não trouxe nenhuma faixa de preço.', lotes: [] };
  const dataAbate = e.acerto.dataAbate ?? e.nf?.dataAbate;
  const vencimento = e.acerto.vencimento;
  const liquido = e.acerto.liquido;
  if (!dataAbate || !vencimento || liquido == null) {
    return { pacote: null, duvidas, diferencas, recusa: 'O acerto não trouxe a data do abate, o vencimento ou o líquido.', lotes: [] };
  }
  const pesos = faixas.map(f => cent(f.total));
  /* D-ABATE-1 (Gabriel 11/11 18:25; banco 117530): a diferença entre o total impresso no acerto e a soma das faixas vira COMPONENTE
     EXPLÍCITO — no pacote (`diferenca_acerto`) e no documento ACERTO (`tipo: 'diferenca_acerto'`, o mesmo valor). Nunca arredonda: os lotes
     ficam como as faixas, e lotes + diferença = o líquido do acerto (a conferência do banco). */
  const difCent = e.acerto.bruto != null ? cent(e.acerto.bruto) - pesos.reduce((a, p) => a + p, 0) : 0;
  const difAcerto = difCent !== 0 ? diferencas.find(d => d.qual === 'faixas_x_acerto') : undefined;
  const diferencaAcerto = difCent !== 0 ? { valor: real(difCent), texto: difAcerto?.frase ?? '' } : undefined;
  const documentos = !diferencaAcerto ? e.documentos : e.documentos.map(d => {
    if (d.especie !== 'acerto') return d;
    const comps = Array.isArray(d.componentes) ? d.componentes : [];
    return { ...d, componentes: [...comps, { tipo: 'diferenca_acerto', natureza: difCent > 0 ? 'acrescimo' : 'desconto_comercial',
      valor: real(Math.abs(difCent)), ordem: comps.length + 1, descricao: `Diferença do acerto do frigorífico: ${diferencaAcerto.texto}` }] };
  });
  const senarTotal = e.detalhes.despesas.filter(d => d.tipo === 'senar').reduce((a, d) => a + cent(d.valor), 0);
  const funruralTotal = e.detalhes.funruralPelaFolha ? 0 : e.detalhes.despesas.filter(d => d.tipo === 'funrural').reduce((a, d) => a + cent(d.valor), 0);
  const senar = ratearCentavos(senarTotal, pesos);
  const funrural = ratearCentavos(funruralTotal, pesos);
  const incentivo = ratearCentavos(e.detalhes.creditos.reduce((a, c) => a + cent(c.valor), 0), pesos);
  const lotes: LoteDoPacote[] = faixas.map((f, i) => ({
    ordem: i + 1, cab: f.cab, peso_carcaca_kg: f.kg, preco_arroba: f.precoArroba,
    valor_liquido: real(pesos[i] - senar[i] - funrural[i] + incentivo[i]), senar: real(senar[i]), funrural: real(funrural[i]),
    observacao: `Faixa do acerto: ${f.descricao}${textoDaComposicao(e.detalhes)}`,
    ...(() => { const c = e.categoriasPorLote?.[i + 1]; return c && c !== e.categoria ? { categoria: c } : {}; })(),
    ...(incentivo[i] > 0 ? { incentivo: real(incentivo[i]) } : {}),
    ...comPesoProprio(e, i + 1),
  }));
  if (duvidas.length > 0) return { pacote: null, duvidas, diferencas, recusa: null, lotes };
  return {
    pacote: {
      fazenda_id: e.fazendaId ?? '', contraparte_id: e.contraparteId ?? '', data_abate: dataAbate, categoria: e.categoria ?? '',
      peso_vivo_medio_kg: e.pesoVivoMedioKg ?? 0,
      observacoes: [`Importado dos documentos do frigorífico (OC ${e.acerto.ordemCompra ?? '—'}, lote ${e.acerto.loteFrigorifico ?? '—'}).`,
        ...diferencas.map(d => d.frase)].join(' '),
      chave_nf: e.nf?.chaveAcesso ?? null,
      lotes,
      recebimento: { valor: liquido, vencimento, documento: e.nf?.numero ? `NF ${e.nf.numero}` : '', observacao: 'Líquido do acerto do frigorífico.' },
      documentos,
      ...(diferencaAcerto ? { diferenca_acerto: diferencaAcerto } : {}),
    },
    duvidas, diferencas, recusa: null, lotes,
  };
}

/** Chat 12/11 17:20 — o lote cujo R$/@ foge do lote de MAIS cabeças (mais de `limite`, padrão 15%) é outro tipo de animal na mesma
    OC (no SM-LT06 o lote 3 a R$ 247/@ é o Trat. Frio por cisticercose, não boi gordo): a tela AVISA, a categoria é confirmada pelo
    operador. Puro: nunca muda o lote. */
export function lotesComPrecoDiferente(lotes: readonly { ordem: number; cab: number; preco_arroba: number | null }[], limite = 0.15): number[] {
  const ref = [...lotes].filter(l => l.preco_arroba != null && l.preco_arroba > 0).sort((a, b) => b.cab - a.cab)[0];
  if (!ref || ref.preco_arroba == null) return [];
  const base = ref.preco_arroba;
  return lotes.filter(l => l.preco_arroba != null && Math.abs(l.preco_arroba - base) / base > limite).map(l => l.ordem);
}

/* ── ANEXAR À OC EXISTENTE (Chat 12/11 18:00) ─────────────────────────────────────────────────────────────────────────────────────
   O mesmo abate já lançado à mão (caso SM-LT06: OC 4192f9c0, 1 lote de 17 cab, o centavo já dentro do líquido, a retenção gravada como
   Funrural): os documentos entram NA OC de hoje (oc_documento_registrar, que não toca lote, rebanho nem financeiro) e a tela mostra
   documentos × OC lado a lado — diferença em âmbar, NADA ajustado. */
export interface OcExistente {
  lotes: { cab: number; peso_carcaca_kg: number | null; preco_arroba: number | null; valor_liquido: number | null; senar: number | null; funrural: number | null }[];
  recebimento: { valor: number | null; vencimento: string | null };
}
export interface LinhaDocsXOc { campo: string; documentos: string; oc: string; difere: boolean }
const fmt = (n: number | null | undefined) => (n == null ? '—' : brl(n));
const fmtData = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const soma = (ns: (number | null)[]) => real(ns.reduce<number>((a, n) => a + cent(n ?? 0), 0));

/** As chaves das NFs do frigorífico que o pacote leva (a `chave_nf` e as de todo documento `nf_principal`), sem repetir. */
export function chavesDoPacote(pacote: PacoteDoAbate): string[] {
  const cs = [pacote.chave_nf, ...pacote.documentos.map(d => (d.especie === 'nf_principal' && typeof d.chave_acesso === 'string' ? d.chave_acesso : null))];
  return Array.from(new Set(cs.filter((c): c is string => !!c && c.trim() !== '').map(c => c.trim())));
}

/**
 * A OC PARECIDA (viva, mesma fazenda + comprador, abate a ±3 dias) É ESTE ABATE? (Chat 13/11 10:10: a Pureza teve 3 ordens de compra no
 * mesmo dia — os bois numa NF, as novilhas noutra; a OC das novilhas não pode virar "anexar" para os bois.)
 *  - a OC sem NF do frigorífico pode ser este abate lançado à mão (o caso SM-LT06): bloqueia, como antes;
 *  - o pacote sem chave não tem como provar que é outro: bloqueia;
 *  - com chave dos dois lados: só é este abate se alguma chave da OC está no pacote. NF de outra chave = outro abate, não bloqueia.
 */
export function ocParecidaEDesteAbate(chavesDaOc: readonly string[], chavesDoPacoteAtual: readonly string[]): boolean {
  if (chavesDaOc.length === 0 || chavesDoPacoteAtual.length === 0) return true;
  return chavesDaOc.some(c => chavesDoPacoteAtual.includes(c));
}

export function docsXOc(pacote: PacoteDoAbate, oc: OcExistente): LinhaDocsXOc[] {
  const L = pacote.lotes;
  const linha = (campo: string, d: string, o: string): LinhaDocsXOc => ({ campo, documentos: d, oc: o, difere: d !== o });
  return [
    linha('Cabeças', String(L.reduce((a, l) => a + l.cab, 0)), String(oc.lotes.reduce((a, l) => a + l.cab, 0))),
    linha('Carcaça (kg)', fmt(soma(L.map(l => l.peso_carcaca_kg))), fmt(soma(oc.lotes.map(l => l.peso_carcaca_kg)))),
    linha('Lotes (cab)', L.map(l => l.cab).join(' · '), oc.lotes.map(l => l.cab).join(' · ')),
    linha('R$/@', L.map(l => fmt(l.preco_arroba)).join(' · '), oc.lotes.map(l => fmt(l.preco_arroba)).join(' · ')),
    linha('SENAR', fmt(soma(L.map(l => l.senar))), fmt(soma(oc.lotes.map(l => l.senar)))),
    linha('Funrural', fmt(soma(L.map(l => l.funrural))), fmt(soma(oc.lotes.map(l => l.funrural)))),
    linha('A receber (líquido)', fmt(pacote.recebimento.valor), fmt(oc.recebimento.valor)),
    linha('Vencimento', fmtData(pacote.recebimento.vencimento), fmtData(oc.recebimento.vencimento)),
  ];
}

/** A diferença do acerto só vira componente na OC existente quando os lotes dela são as FAIXAS como impressas (soma dos líquidos +
    a diferença = o a receber). Se o líquido da OC já tem o centavo dentro, registrar o componente o contaria DUAS vezes no próximo
    Salvar do abate (oc_salvar_abate soma o componente ao acordado). */
export function diferencaCabeNaOc(pacote: PacoteDoAbate, oc: OcExistente): boolean {
  const dif = pacote.diferenca_acerto?.valor ?? 0;
  if (dif === 0) return false;
  const lotesOc = soma(oc.lotes.map(l => l.valor_liquido));
  return oc.recebimento.valor != null && cent(lotesOc + dif) === cent(oc.recebimento.valor);
}
