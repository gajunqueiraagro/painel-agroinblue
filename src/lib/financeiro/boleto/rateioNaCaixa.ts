/**
 * CAIXA-FOLHA-RATEIO-01 (Gabriel 27/11 19:45) — O DOCUMENTO DA OUTRA PARTE DE UM RATEIO É COMPROVANTE, NUNCA CONTA A PAGAR DO CLIENTE.
 *
 * O caso: a Vera divide a folha com o Higino (acordo "Rateio Folha", 50%, ela transfere a parte dela a ele). O contador manda o pacote do
 * mês em nome do Higino (folhas analíticas, 13º, DARF do INSS, GFD e relação do FGTS, o resumo escrito à mão). A Caixa lia tudo, mas a única
 * ação era Ignorar — e o DARF oferecia "Guardar", que viraria boleto DA VERA (risco de pagar em dobro).
 *
 * A regra (universal): o documento cujo PAGADOR/EMPREGADOR é o terceiro de um acordo de rateio ATIVO do cliente (`fiscal_acordos_rateio`)
 * entra num PACOTE (terceiro + competência) e ganha UMA ação, "Anexar ao rateio": cada arquivo vai, como comprovante, aos lançamentos da
 * parte do cliente daquele mês e da mesma natureza, e as linhas vão para Resolvidos. Nada cria lançamento nem boleto; "Guardar" some.
 *   - quem paga: o contribuinte do DARF e o empregador da GFD e da relação (CPF/CNPJ impresso); a folha analítica, pelo nome do
 *     empregador no cabeçalho ("<EMPREGADOR> <FAZENDA>").
 *   - os lançamentos da parte do cliente: o fornecedor com o prefixo do rateio ("Pec.3M-<nome>", a regra da casa: "Pec.<x>-" = pagamento
 *     por rateio), a competência do pacote e a natureza pela descrição — folha mensal → "Folha Pagamento…" (sem o "- 13"), 13º → "Folha
 *     Pagamento - 13", DARF → "INSS", GFD e relação → "FGTS" e "FGTS - 13"; a folha só aos lançamentos das PESSOAS dela.
 *   - o arquivo sem leitura (o resumo escrito à mão) no mesmo conjunto de um pacote → o REEMBOLSO ao terceiro (fornecedor = o terceiro,
 *     competência do mês seguinte, ainda não realizado; com mais de um, o que traz o nome do acordo na descrição). Só se sobrar um.
 *   - o DARF/boleto cujo pagador é conhecido e NÃO é titular do cliente (e não é de rateio) perde o "Guardar": é comprovante de outro.
 * PURO: recebe as linhas montadas e devolve as linhas com o rateio; quem lê o banco e grava é o hook.
 */
import { normalizarParaBusca } from '@/lib/texto/busca';
import type { LinhaDaCaixa } from './caixaPorEmail';
import type { QuemPaga } from '@/lib/folha/lerGuiasDaFolha';

/** O acordo de rateio ativo do cliente, do lado do terceiro (quem recebe a guia e o reembolso). */
export interface TerceiroDoRateio {
  acordoId: string;
  acordo: string;
  terceiro: string;
  /** CPF/CNPJ só dígitos (null = sem documento no cadastro) */
  documento: string | null;
  /** a parte do cliente em % (o `parte_produtor`) */
  parteDoCliente: number | null;
}
/** Um lançamento do cliente que pode receber o documento. */
export interface LancamentoDoRateio {
  id: string;
  descricao: string;
  favorecido: string | null;
  valor: number;
  /** 'AAAA-MM' */
  competencia: string;
  /** 'AAAA-MM-DD' */
  vencimento: string | null;
  status: string;
}
export type NaturezaDoDocumento = 'salario' | 'decimo' | 'inss' | 'fgts' | 'reembolso';
export interface RateioDaLinha {
  /** terceiro + competência */
  pacote: string;
  terceiro: string;
  /** 'AAAA-MM' */
  competencia: string;
  /** '11/2026' */
  rotuloCompetencia: string;
  natureza: NaturezaDoDocumento;
  /** os lançamentos a que ESTE arquivo se anexa (vazio = nenhum: a linha fica só com Ignorar) */
  alvos: LancamentoDoRateio[];
  /** quantos arquivos o pacote tem (o "Anexar" anexa todos) */
  documentos: number;
}
export interface ContextoDoRateio {
  terceiros: readonly TerceiroDoRateio[];
  /** os lançamentos das competências dos pacotes e do mês seguinte (o reembolso); null = ainda lendo do banco */
  lancamentos: readonly LancamentoDoRateio[] | null;
  /** os CPF/CNPJ dos titulares ativos do cliente (vazio = não se sabe: a regra do "titular não é o pagador" não age) */
  titulares: readonly string[];
}

export const FRASE_PAGADOR_NAO_TITULAR = 'o pagador não é titular deste cliente: é comprovante de outro, não conta a pagar';

const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const norm = (s: string | null | undefined) => normalizarParaBusca(s);
/** "Pec.3M-Ana Maria" → "ana maria"; sem o prefixo do rateio = null (não é lançamento de rateio) */
export function nomeDoRateio(favorecido: string | null): string | null {
  const m = /^\s*pec\.[^-\s]+-(.+)$/i.exec(favorecido ?? '');
  return m ? norm(m[1]) : null;
}
const rotulo = (comp: string) => `${comp.slice(5, 7)}/${comp.slice(0, 4)}`;
export function mesSeguinte(comp: string): string {
  const a = Number(comp.slice(0, 4)); const m = Number(comp.slice(5, 7));
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

interface Lido { quem: QuemPaga; competencia: string | null; natureza: NaturezaDoDocumento; pessoas: string[] | null }
/** Quem paga o documento da linha, a competência e a natureza (null = a linha não é documento de folha/guia com pagador). */
export function pagadorDaLinha(l: LinhaDaCaixa): Lido | null {
  if (l.analitica) {
    return { quem: { documento: null, nome: l.analitica.empresa }, competencia: l.analitica.competencia,
      natureza: l.analitica.tipo === 'mensal' ? 'salario' : 'decimo', pessoas: l.analitica.pessoas.map((p) => norm(p.nome)) };
  }
  if (l.gfd?.empregador) return { quem: l.gfd.empregador, competencia: l.gfd.competencia, natureza: 'fgts', pessoas: null };
  if (l.relacao?.empregador) return { quem: l.relacao.empregador, competencia: l.relacao.competencia, natureza: 'fgts', pessoas: null };
  /* o DARF (o boleto de arrecadação com o beneficiário "Receita Federal"): a competência vem do pacote */
  if (l.boleto?.pagador && l.boleto.beneficiario === 'Receita Federal') return { quem: l.boleto.pagador, competencia: null, natureza: 'inss', pessoas: null };
  return null;
}

/** O terceiro de rateio que paga o documento: pelo CPF/CNPJ; sem documento, pelo nome (o cabeçalho da folha começa com ele). */
export function terceiroQuePaga(q: QuemPaga, terceiros: readonly TerceiroDoRateio[]): TerceiroDoRateio | null {
  const doc = digitos(q.documento);
  if (doc) return terceiros.find((t) => digitos(t.documento) === doc) ?? null;
  const nome = norm(q.nome);
  if (!nome) return null;
  return terceiros.find((t) => { const n = norm(t.terceiro); return !!n && (nome === n || nome.startsWith(`${n} `)); }) ?? null;
}

/** Os lançamentos da parte do cliente a que o documento se anexa. */
export function alvosDoDocumento(natureza: NaturezaDoDocumento, comp: string, t: TerceiroDoRateio, pessoas: string[] | null,
  lancs: readonly LancamentoDoRateio[]): LancamentoDoRateio[] {
  if (natureza === 'reembolso') {
    const seg = mesSeguinte(comp);
    const r = lancs.filter((l) => l.competencia === seg && norm(l.favorecido) === norm(t.terceiro) && l.status !== 'realizado' && l.status !== 'conciliado');
    /* o terceiro pode ter outro repasse aberto no mesmo mês (o caso real: "Rateio D05" ao lado do "Rateio Folha Pagamento"): fica o que
       traz o NOME do acordo na descrição; ainda mais de um = nenhum (não se escolhe às cegas) */
    const doAcordo = r.length > 1 ? r.filter((l) => !!norm(t.acordo) && norm(l.descricao).includes(norm(t.acordo))) : r;
    return doAcordo.length === 1 ? doAcordo : [];
  }
  const daCompetencia = lancs.filter((l) => l.competencia === comp && nomeDoRateio(l.favorecido) !== null);
  const d = (l: LancamentoDoRateio) => norm(l.descricao);
  const daPessoa = (l: LancamentoDoRateio) => {
    if (!pessoas) return true;
    const n = nomeDoRateio(l.favorecido) ?? '';
    return pessoas.some((p) => p === n || p.startsWith(`${n} `) || n.startsWith(`${p} `));
  };
  switch (natureza) {
    case 'salario': return daCompetencia.filter((l) => /^folha pagamento\b/.test(d(l)) && !/^folha pagamento\s*-\s*13\b/.test(d(l)) && daPessoa(l));
    case 'decimo': return daCompetencia.filter((l) => /^folha pagamento\s*-\s*13\b/.test(d(l)) && daPessoa(l));
    case 'inss': return daCompetencia.filter((l) => d(l) === 'inss');
    case 'fgts': return daCompetencia.filter((l) => /^fgts(\s*-\s*13)?$/.test(d(l)));
  }
}

/** "Folha Pagamento ×5 · Folha Pagamento - pago fora da folha" ; o reembolso: "Rateio Folha Pagamento · 04/12/2026" */
export function resumoDosAlvos(alvos: readonly LancamentoDoRateio[]): string {
  if (alvos.length === 1 && alvos[0].vencimento) {
    const v = alvos[0].vencimento;
    return `${alvos[0].descricao} · ${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  }
  const n = new Map<string, number>();
  for (const a of alvos) n.set(a.descricao, (n.get(a.descricao) ?? 0) + 1);
  return [...n.entries()].map(([k, x]) => (x > 1 ? `${k} ×${x}` : k)).join(' · ');
}

/** As competências a ler do banco: a de cada documento de terceiro de rateio e o mês seguinte (o reembolso). */
export function competenciasDoRateio(linhas: readonly LinhaDaCaixa[], terceiros: readonly TerceiroDoRateio[]): string[] {
  const cs = new Set<string>();
  for (const l of linhas) {
    const p = l.feito ? null : pagadorDaLinha(l);
    if (p?.competencia && terceiroQuePaga(p.quem, terceiros)) { cs.add(p.competencia); cs.add(mesSeguinte(p.competencia)); }
  }
  return [...cs].sort();
}

/** As linhas com o rateio aplicado (as que não são de rateio voltam iguais, salvo o "Guardar" do pagador que não é titular). */
export function comRateio(linhas: readonly LinhaDaCaixa[], ctx: ContextoDoRateio): LinhaDaCaixa[] {
  if (!ctx.terceiros.length && !ctx.titulares.length) return [...linhas];
  /* 1. quem paga cada linha (só as não feitas) */
  const lidas = linhas.map((l) => {
    if (l.feito) return null;
    const p = pagadorDaLinha(l);
    const t = p ? terceiroQuePaga(p.quem, ctx.terceiros) : null;
    return p && t ? { ...p, t } : null;
  });
  /* 2. a competência do DARF = a do pacote do mesmo terceiro, se houver uma só */
  const comps = new Map<string, Set<string>>();
  for (const x of lidas) if (x?.competencia) comps.set(x.t.acordoId, new Set([...(comps.get(x.t.acordoId) ?? []), x.competencia]));
  const compDe = (x: NonNullable<(typeof lidas)[number]>) => {
    if (x.competencia) return x.competencia;
    const c = comps.get(x.t.acordoId);
    return c && c.size === 1 ? [...c][0] : null;
  };
  /* 3. o arquivo sem leitura entra no pacote, se houver UM pacote no conjunto (o resumo do contador → o reembolso) */
  const pacotes = new Map<string, { t: TerceiroDoRateio; comp: string }>();
  for (const x of lidas) { const c = x ? compDe(x) : null; if (x && c) pacotes.set(`${x.t.acordoId}:${c}`, { t: x.t, comp: c }); }
  const unico = pacotes.size === 1 ? [...pacotes.values()][0] : null;
  const membros = linhas.map((l, i) => {
    const x = lidas[i];
    const c = x ? compDe(x) : null;
    if (x && c) return { t: x.t, comp: c, natureza: x.natureza, pessoas: x.pessoas };
    if (unico && l.tipo === 'nada' && !l.feito) return { t: unico.t, comp: unico.comp, natureza: 'reembolso' as const, pessoas: null };
    return null;
  });
  const porPacote = new Map<string, number>();
  for (const m of membros) if (m) porPacote.set(`${m.t.acordoId}:${m.comp}`, (porPacote.get(`${m.t.acordoId}:${m.comp}`) ?? 0) + 1);
  const titulares = new Set(ctx.titulares.map(digitos).filter(Boolean));

  return linhas.map((l, i) => {
    const m = membros[i];
    if (!m) {
      /* o pagador conhecido que não é titular do cliente: comprovante de outro, sem "Guardar" */
      const doc = digitos(l.boleto?.pagador?.documento);
      if (!l.feito && doc && titulares.size && !titulares.has(doc) && l.acoes.includes('guardar')) {
        return { ...l, acoes: l.acoes.filter((a) => a !== 'guardar'),
          noSistema: { ...l.noSistema, texto: FRASE_PAGADOR_NAO_TITULAR, titulo: `${FRASE_PAGADOR_NAO_TITULAR} · ${l.noSistema.titulo}` } };
      }
      return l;
    }
    const pacote = `${m.t.acordoId}:${m.comp}`;
    if (ctx.lancamentos === null) {
      const t = `procurando os lançamentos de ${rotulo(m.comp)}…`;
      return { ...l, rateio: null, acoes: ['ignorar'], noSistema: { selo: { texto: 'rateio', tom: 'cinza' }, texto: t, titulo: `${m.t.terceiro} · rateio ${m.t.acordo}: ${t}` } };
    }
    const alvos = alvosDoDocumento(m.natureza, m.comp, m.t, m.pessoas, ctx.lancamentos);
    const rateio: RateioDaLinha = { pacote, terceiro: m.t.terceiro, competencia: m.comp, rotuloCompetencia: rotulo(m.comp), natureza: m.natureza,
      alvos, documentos: porPacote.get(pacote) ?? 1 };
    const quem = `${m.t.terceiro} · rateio ${m.t.acordo}`;
    const texto = alvos.length
      ? `${m.natureza === 'reembolso' ? 'sem leitura: o resumo do contador → ' : ''}anexa a ${resumoDosAlvos(alvos)}`
      : `nenhum lançamento de ${rotulo(m.natureza === 'reembolso' ? mesSeguinte(m.comp) : m.comp)} para anexar`;
    return {
      ...l, rateio,
      acoes: alvos.length ? ['anexar_rateio', 'ignorar'] : ['ignorar'],
      noSistema: { selo: { texto: 'rateio', tom: 'cinza' }, texto,
        titulo: `${quem}: é comprovante (a outra parte paga), nunca conta a pagar deste cliente · ${texto}` },
    };
  });
}
