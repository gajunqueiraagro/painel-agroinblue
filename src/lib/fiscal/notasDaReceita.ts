/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA (Chat 16/11 20:05; mock ui-validar/notas-receita-f34.html aprovado 15:15, D1/D2/D3).
 * A REGRA da lista "Notas da Receita": lê o que a busca já gravou (`fiscal_dfe_recebidos`, RLS por cliente) — só leitura.
 *  · Nº e série saem da CHAVE (pos. 26–34 e 23–25), que existe já no resumo;
 *  · tipo = Resumo (só o resumo da Receita) × Completa (o XML inteiro); os eventos (cancelamento etc.) vêm dentro do resumo;
 *  · situação: Nova × Já no sistema (a chave já está numa nota_fiscal do cliente, ou a linha já foi ligada/importada) × Cancelada;
 *  · CNPJ do emitente inteiro; CPF de emitente pessoa física mascarado (`documentoNaTabela`).
 * Fora desta fatia: Dar ciência (F3.3), Ignorar (RPC nova), Fazenda pela IE.
 */
import { classeDaNota, type AtributosFiscais, type ClasseDaNota, type MotivoNaoFinanceira } from './classeDaNota';
import { documentoNaTabela } from '@/lib/fiscal/documentoNaTabela';
import type { DuplicataNFe } from '@/lib/financeiro/nfe/tipos';
import { hojeLocal } from '@/lib/datas/hojeLocal';

export type SituacaoNoBanco = 'resumo' | 'manifestado' | 'xml' | 'importado' | 'ignorado' | 'cancelado_na_sefaz';

export interface LinhaRecebida {
  id: string;
  titularId: string;
  chave: string;
  situacao: SituacaoNoBanco;
  emitenteDocumento: string | null;
  emitenteNome: string | null;
  emissao: string | null;
  valorCent: number | null;
  notaId: string | null;
  recebidoEm: string | null;
  eventos: { tpEvento: string; descricao: string | null }[];
  temXml: boolean;
}

export type TipoNaLista = 'resumo' | 'completa';
/* NOTAS-RECEITA-SEM-LANCAMENTO-01: + 'nao_financeira' (a nota diz que não gera lançamento: comodato, entrega futura…) e 'venda_titular' (a NF de
   entrada do comprador: é a venda do titular) — pela `classeDaNota`, automático pelo XML */
export type SituacaoNaLista = 'nova' | 'pode_estar' | 'no_sistema' | 'pede_ciencia' | 'esperando_xml' | 'cancelada' | 'ignorada' | 'nao_financeira'
  | 'venda_titular';

/** NOTA-RECEITA-CASAR-01 — um lançamento que PODE SER a nota (a regra é do banco: `fn_notas_candidatos`; a tela só lê e mostra) */
export type ClasseDoCandidato = 'mesmo_cnpj' | 'sem_fornecedor' | 'outro_fornecedor';
export interface CandidatoDaNota {
  id: string;
  competencia: string | null;
  vencimento: string | null;
  pagamento: string | null;
  descricao: string | null;
  status: string | null;
  conciliado: boolean;
  valorCent: number;
  conta: string | null;
  fornecedorNome: string | null;
  classe: ClasseDoCandidato;
}

export interface NotaNaLista extends LinhaRecebida {
  numero: string;
  serie: string;
  tipo: TipoNaLista;
  sit: SituacaoNaLista;
  /** NOTA-RECEITA-CASAR-01 — os lançamentos que podem ser esta nota (na ordem do banco); vazio = nenhum */
  candidatos: CandidatoDaNota[];
  titularNome: string;
  emitenteNaTabela: string;
  /** NOTAS-RECEITA-SEM-LANCAMENTO-01 — a classe pela própria nota (sem os atributos, "compra": a lista de sempre) */
  classe: ClasseDaNota;
  /** os nº das notas que esta nota CITA (refNFe): a remessa de entrega futura → o faturamento; a devolução → a original */
  citadas: string[];
  /** ENTREGA-FUTURA-LIGAR-01 — as CHAVES que esta nota cita (refNFe), para buscar o faturamento pela chave quando ele não está na caixa */
  refs: string[];
  /** a cancelada: o nº da nota viva do mesmo emitente e do mesmo valor (a que a substituiu), quando há */
  substituta: string | null;
  /** NOTAS-RECEITA-VENC-01 (Gabriel 19/11 07:36) — o vencimento pelas duplicatas da nota (cobr/dup do XML) */
  venc: VencimentoDaNota;
  /** NOTA-DEMONSTRACAO-01 — a ligação da demonstração com a compra ou o retorno que veio depois (`fn_notas_demonstracao_ligacoes`) */
  demonstracao: LigacaoNaLista | null;
}

/** NOTA-DEMONSTRACAO-01 (Gabriel 19/11 08:03) — a demonstração (5912/6912) e o que veio DEPOIS do mesmo fornecedor: a COMPRA do bem ou
 *  o RETORNO. `por` = a força (cita a chave · o mesmo item · só o fornecedor = "confira"). Comprado/devolvido é DERIVADO das notas. */
export type ForcaDaLigacao = 'cita' | 'item' | 'fornecedor';
export interface LigacaoDaDemonstracao { demo: string; nota: string; tipo: 'compra' | 'retorno'; por: ForcaDaLigacao }
/** o lado desta nota: a demonstração vê a compra/o retorno; a compra/o retorno vê a demonstração (`outra` = nº, `outraChave` = a chave) */
export interface LigacaoNaLista { papel: 'demo' | 'compra' | 'retorno'; tipo: 'compra' | 'retorno'; outra: string; outraChave: string; por: ForcaDaLigacao }
export function lerLigacoes(dados: unknown): LigacaoDaDemonstracao[] {
  if (!Array.isArray(dados)) return [];
  return dados.flatMap((d) => {
    if (!d || typeof d !== 'object') return [];
    const demo = Reflect.get(d, 'demo'); const nota = Reflect.get(d, 'nota'); const tipo = Reflect.get(d, 'tipo'); const por = Reflect.get(d, 'por');
    if (typeof demo !== 'string' || typeof nota !== 'string' || (tipo !== 'compra' && tipo !== 'retorno')) return [];
    return [{ demo, nota, tipo, por: por === 'cita' || por === 'item' ? por : 'fornecedor' }];
  });
}
export function ligacaoDaNota(chave: string, ligacoes: readonly LigacaoDaDemonstracao[]): LigacaoNaLista | null {
  const comoDemo = ligacoes.find((l) => l.demo === chave);
  if (comoDemo) return { papel: 'demo', tipo: comoDemo.tipo, outra: numeroDaChave(comoDemo.nota), outraChave: comoDemo.nota, por: comoDemo.por };
  const comoNota = ligacoes.find((l) => l.nota === chave);
  return comoNota ? { papel: comoNota.tipo, tipo: comoNota.tipo, outra: numeroDaChave(comoNota.demo), outraChave: comoNota.demo, por: comoNota.por } : null;
}
const CONFIRA: Record<ForcaDaLigacao, string> = { cita: ' (a nota cita a demonstração)', item: ' (o mesmo item)', fornecedor: ' — só pelo fornecedor: confira se é o mesmo bem' };
/** a frase da ligação (o ⓘ / o title) */
export function fraseDaLigacao(l: LigacaoNaLista): string {
  if (l.papel === 'demo') return `${l.tipo === 'compra' ? 'Comprado' : 'Devolvido'} pela NF ${l.outra}${CONFIRA[l.por]}.`;
  if (l.papel === 'compra') return `Esta compra é do bem em demonstração NF ${l.outra}${CONFIRA[l.por]}.`;
  return `Fecha a demonstração NF ${l.outra}${CONFIRA[l.por]}.`;
}

/** NOTAS-RECEITA-VENC-01 — a coluna "Venc.": a PRÓXIMA duplicata (a 1ª que vence hoje ou depois; todas vencidas = a última), "k/N" com
 *  várias; sem duplicata: "à vista" pelo tPag (01 dinheiro · 03 crédito · 04 débito · 17 PIX) ou "—". O resumo da Receita não traz duplicata. */
export interface VencimentoDaNota {
  todas: DuplicataNFe[];
  proxima: DuplicataNFe | null;
  /** a posição da próxima (1…N) */
  indice: number;
  aVista: boolean;
  /** dias de hoje até a próxima (negativo = venceu) */
  dias: number | null;
}
const TPAG_A_VISTA = ['01', '03', '04', '17'];
const diasEntre = (de: string, ate: string): number => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
export function vencimentoDaNota(dups: readonly DuplicataNFe[], tpags: readonly string[], hoje: string): VencimentoDaNota {
  const todas = [...dups].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  if (todas.length === 0) return { todas, proxima: null, indice: 0, aVista: tpags.some((t) => TPAG_A_VISTA.includes(t)), dias: null };
  const k = todas.findIndex((d) => d.vencimento >= hoje);
  const i = k < 0 ? todas.length - 1 : k;
  return { todas, proxima: todas[i], indice: i + 1, aVista: false, dias: diasEntre(hoje, todas[i].vencimento) };
}
/** a cor da coluna: só para a que AINDA NÃO ESTÁ LANÇADA (a lançar): venceu = vermelho; vence em até 7 dias = âmbar */
export type TomDoVenc = 'vencida' | 'perto' | null;
export const naoLancada = (n: Pick<NotaNaLista, 'sit'>): boolean => n.sit === 'nova' || n.sit === 'pode_estar';
export function tomDoVenc(n: Pick<NotaNaLista, 'sit' | 'venc'>): TomDoVenc {
  if (!naoLancada(n) || n.venc.dias == null) return null;
  if (n.venc.dias < 0) return 'vencida';
  return n.venc.dias <= 7 ? 'perto' : null;
}
/** o filtro rápido "vencidas sem lançamento" */
export const vencidaSemLancamento = (n: Pick<NotaNaLista, 'sit' | 'venc'>): boolean => tomDoVenc(n) === 'vencida';
/** o texto da dica (title/ⓘ) da coluna */
export function dicaDoVenc(n: Pick<NotaNaLista, 'sit' | 'venc'>): string | undefined {
  const t = tomDoVenc(n);
  if (t === 'vencida' && n.venc.dias != null) return `Venceu há ${-n.venc.dias} ${n.venc.dias === -1 ? 'dia' : 'dias'} — confira se já pagou.`;
  if (t === 'perto' && n.venc.dias != null) return n.venc.dias === 0 ? 'Vence hoje.' : `Vence em ${n.venc.dias} ${n.venc.dias === 1 ? 'dia' : 'dias'}.`;
  return undefined;
}

/** o que o banco extrai do XML de cada nota (`fn_notas_atributos_fiscais`); `dups`/`tpags` = NOTAS-RECEITA-VENC-01 (lote 28) */
export interface AtributosDaNota extends AtributosFiscais { refs: string[]; dups: DuplicataNFe[]; tpags: string[] }
/** a resposta da `fn_notas_atributos_fiscais` → chave → atributos (fora do formato fica de fora: a nota segue "compra") */
export function lerAtributos(dados: unknown): Map<string, AtributosDaNota> {
  const m = new Map<string, AtributosDaNota>();
  if (!Array.isArray(dados)) return m;
  for (const d of dados) {
    if (!d || typeof d !== 'object') continue;
    const ch = Reflect.get(d, 'chave'); const cf = Reflect.get(d, 'cfops'); const rf = Reflect.get(d, 'refs');
    if (typeof ch !== 'string') continue;
    const tp = Reflect.get(d, 'tpnf'); const no = Reflect.get(d, 'natop');
    const du = Reflect.get(d, 'dups'); const pg = Reflect.get(d, 'tpags');
    m.set(ch, {
      cfops: Array.isArray(cf) ? cf.filter((x): x is string => typeof x === 'string') : [],
      tpNF: typeof tp === 'string' ? tp : null, natOp: typeof no === 'string' ? no : null,
      refs: Array.isArray(rf) ? rf.filter((x): x is string => typeof x === 'string' && /^\d{44}$/.test(x)) : [],
      dups: Array.isArray(du) ? du.flatMap((x) => {
        if (!x || typeof x !== 'object') return [];
        const venc = Reflect.get(x, 'venc'); const valor = Number(Reflect.get(x, 'valor'));
        return typeof venc === 'string' && Number.isFinite(valor)
          ? [{ numero: String(Reflect.get(x, 'n') ?? ''), vencimento: venc, valorCent: Math.round(valor * 100) }] : [];
      }) : [],
      tpags: Array.isArray(pg) ? pg.filter((x): x is string => typeof x === 'string') : [],
    });
  }
  return m;
}

const SITUACOES: readonly SituacaoNoBanco[] = ['resumo', 'manifestado', 'xml', 'importado', 'ignorado', 'cancelado_na_sefaz'];
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null);

/** a linha do banco → a linha da regra (o que não for do formato fica de fora) */
export function lerLinhasRecebidas(dados: unknown): LinhaRecebida[] {
  if (!Array.isArray(dados)) return [];
  const saida: LinhaRecebida[] = [];
  for (const d of dados) {
    if (!d || typeof d !== 'object') continue;
    const r = d as Record<string, unknown>;
    const chave = texto(r.chave);
    const situacao = r.situacao as SituacaoNoBanco;
    if (!texto(r.id) || !chave || !/^\d{44}$/.test(chave) || !SITUACOES.includes(situacao)) continue;
    const resumo = r.resumo && typeof r.resumo === 'object' ? (r.resumo as Record<string, unknown>) : {};
    const eventos = Array.isArray(resumo.eventos)
      ? resumo.eventos.flatMap((e) => (e && typeof e === 'object' && texto((e as Record<string, unknown>).tpEvento)
        ? [{ tpEvento: String((e as Record<string, unknown>).tpEvento), descricao: texto((e as Record<string, unknown>).descricao) }] : []))
      : [];
    const valor = typeof r.valor_cent === 'number' ? r.valor_cent : typeof r.valor_cent === 'string' && /^-?\d+$/.test(r.valor_cent) ? Number(r.valor_cent) : null;
    saida.push({
      id: String(r.id), titularId: String(r.titular_id ?? ''), chave, situacao,
      emitenteDocumento: texto(r.emitente_documento), emitenteNome: texto(r.emitente_nome), emissao: texto(r.emissao),
      valorCent: valor, notaId: texto(r.nota_id), recebidoEm: texto(r.recebido_em), eventos, temXml: r.tem_xml === true,
    });
  }
  return saida;
}

/** nº da NF sem os zeros à esquerda, com ponto de milhar (pos. 26–34 da chave) */
export function numeroDaChave(chave: string): string {
  const n = Number(chave.slice(25, 34));
  return Number.isFinite(n) ? n.toLocaleString('pt-BR') : '';
}
export const serieDaChave = (chave: string): string => String(Number(chave.slice(22, 25)));

export function situacaoNaLista(l: LinhaRecebida, chavesNoSistema: ReadonlySet<string>): SituacaoNaLista {
  if (l.situacao === 'cancelado_na_sefaz' || l.eventos.some((e) => e.tpEvento === '110111')) return 'cancelada';
  if (l.situacao === 'ignorado') return 'ignorada';
  if (l.situacao === 'importado' || l.notaId || chavesNoSistema.has(l.chave)) return 'no_sistema';
  if (l.situacao === 'resumo') return 'pede_ciencia';
  if (l.situacao === 'manifestado') return 'esperando_xml';
  return 'nova';
}

export function montarLista(linhas: readonly LinhaRecebida[], titulares: ReadonlyMap<string, string>, chavesNoSistema: ReadonlySet<string>,
  candidatos: ReadonlyMap<string, CandidatoDaNota[]> = new Map(), atributos: ReadonlyMap<string, AtributosDaNota> = new Map(),
  hoje: string = hojeLocal(), ligacoes: readonly LigacaoDaDemonstracao[] = []): NotaNaLista[] {
  return linhas.map((l) => {
    const base = situacaoNaLista(l, chavesNoSistema);
    const a = atributos.get(l.chave);
    const classe: ClasseDaNota = a ? classeDaNota(a, base === 'cancelada') : base === 'cancelada' ? { classe: 'cancelada' } : { classe: 'compra' };
    /* a classe só tira a nota do "a lançar" (nova/pode estar): já no sistema, cancelada e ciência ficam como estão */
    const aLancar = base === 'nova';
    const sit: SituacaoNaLista = aLancar && classe.classe === 'nao_financeira' ? 'nao_financeira'
      : aLancar && classe.classe === 'venda_do_titular' ? 'venda_titular' : comCandidatos(base, candidatos.get(l.chave) ?? []);
    return {
      ...l,
      numero: numeroDaChave(l.chave),
      serie: serieDaChave(l.chave),
      tipo: (l.temXml || l.situacao === 'xml' || l.situacao === 'importado' ? 'completa' : 'resumo') as TipoNaLista,
      sit,
      candidatos: sit === 'nova' || sit === 'pode_estar' ? (candidatos.get(l.chave) ?? []) : [],
      titularNome: titulares.get(l.titularId) ?? '—',
      emitenteNaTabela: documentoNaTabela(l.emitenteDocumento),
      classe,
      citadas: (a?.refs ?? []).map(numeroDaChave),
      refs: [...(a?.refs ?? [])],
      substituta: base === 'cancelada' ? substitutaDa(l, linhas) : null,
      venc: vencimentoDaNota(a?.dups ?? [], a?.tpags ?? [], hoje),
      demonstracao: ligacaoDaNota(l.chave, ligacoes),
    };
  }).sort((a, b) => (b.emissao ?? '').localeCompare(a.emissao ?? '') || b.chave.localeCompare(a.chave));
}

/** a cancelada foi refeita: a nota VIVA do mesmo emitente com o mesmo valor (a mais próxima na data) */
export function substitutaDa(l: LinhaRecebida, todas: readonly LinhaRecebida[]): string | null {
  if (!l.emitenteDocumento || l.valorCent == null) return null;
  const vivas = todas.filter((x) => x.chave !== l.chave && x.situacao !== 'cancelado_na_sefaz' && x.emitenteDocumento === l.emitenteDocumento
    && x.valorCent === l.valorCent && !x.eventos.some((e) => e.tpEvento === '110111'));
  const t = (d: string | null) => (d ? Date.parse(d.slice(0, 10)) : 0);
  vivas.sort((x, y) => Math.abs(t(x.emissao) - t(l.emissao)) - Math.abs(t(y.emissao) - t(l.emissao)));
  return vivas[0] ? numeroDaChave(vivas[0].chave) : null;
}

/** o selo da linha (CURTO, nunca corta) e o ⓘ (o que é e O QUE FAZER) — pela situação e, nas não financeiras, pelo motivo da nota */
export function seloDaNota(n: Pick<NotaNaLista, 'sit' | 'classe' | 'citadas' | 'substituta'> & { demonstracao?: LigacaoNaLista | null }):
  { rotulo: string; cor: string; dica: string } {
  if (n.sit === 'nao_financeira' && n.classe.classe === 'nao_financeira') {
    const m = n.classe.motivo;
    const lig = n.demonstracao ? ` ${fraseDaLigacao(n.demonstracao)}` : '';
    const cit = n.citadas.length ? ` A nota cita a NF ${n.citadas.join(', ')}.` : '';
    const dica: Record<typeof m, string> = {
      entrega_futura: `Remessa da mercadoria de um pedido já faturado: o pagamento está na NF de faturamento (5922), não nesta.${cit}`,
      comodato: 'Bem do fornecedor emprestado (comodato): não é compra. Registre como bem de terceiro para devolver.',
      bonificacao: 'Entrada sem custo (bonificação/brinde): não gera lançamento.',
      devolucao: `Devolução: abate do fornecedor — ligue à nota original e ao lançamento dela.${cit}`,
      garantia: `Troca em garantia: não gera lançamento.${cit}`,
      demonstracao: n.demonstracao
        ? `Bem em demonstração (CFOP 5912/6912), não é compra.${lig} ${n.demonstracao.papel === 'demo' ? 'Sai de Bens de terceiros.' : ''}`.trim()
        : 'Bem em demonstração (CFOP 5912/6912): não é compra. Registre como bem de terceiro; quando vier a NF de venda (a compra) ou o retorno, as notas se ligam.',
      conserto: 'Bem em conserto: vai e volta; o serviço vem em outra nota. Registre como bem de terceiro.',
      retorno: `Retorno de um bem que foi: fecha a remessa de ida.${cit}`,
      retorno_demonstracao: `O bem em demonstração voltou ao fornecedor (CFOP 1913/2913/5913/6913): fecha a demonstração; não gera lançamento.${lig || cit}`,
      outra_remessa: `Remessa sem pagamento (CFOP de remessa/retorno): não gera lançamento.${cit}`,
    };
    return { rotulo: ROTULO_CURTO[m], cor: 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-300', dica: dica[m] };
  }
  if (n.sit === 'venda_titular') {
    return { rotulo: 'Sua venda', cor: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300',
      dica: 'É a sua venda: o comprador emitiu a NF de entrada (ex.: o frigorífico). Confira no abate/venda (OC); não lance como compra.' };
  }
  const s = SITUACAO_NA_TELA[n.sit];
  if (n.sit === 'cancelada' && n.substituta) return { ...s, dica: `O emitente cancelou na Receita; foi substituída pela NF ${n.substituta}.` };
  return s;
}
/** os rótulos curtos (cabem no selo a 9px; o resto vai no ⓘ) */
export const ROTULO_CURTO: Record<MotivoNaoFinanceira, string> = {
  entrega_futura: 'Entrega futura', comodato: 'Comodato', bonificacao: 'Bonificação', devolucao: 'Devolução', garantia: 'Garantia',
  demonstracao: 'Demonstração', conserto: 'Conserto', retorno: 'Retorno', retorno_demonstracao: 'Retorno demo.', outra_remessa: 'Remessa',
};

/** D4 — a "Nova" com candidato do MESMO CNPJ ou SEM fornecedor vira "Pode estar lançada"; só "outro fornecedor" fica "Nova" (o "Lançar"
 *  mostra o quadro do mesmo jeito) */
export function comCandidatos(sit: SituacaoNaLista, candidatos: readonly CandidatoDaNota[]): SituacaoNaLista {
  return sit === 'nova' && candidatos.some((c) => c.classe === 'mesmo_cnpj' || c.classe === 'sem_fornecedor') ? 'pode_estar' : sit;
}

/** o pré-marcado do quadro: SÓ quando há UM candidato e ele é do mesmo CNPJ; vários = nenhum (o operador escolhe) */
export const candidatoPreMarcado = (c: readonly CandidatoDaNota[]): string | null => (c.length === 1 && c[0].classe === 'mesmo_cnpj' ? c[0].id : null);

const CLASSES: readonly ClasseDoCandidato[] = ['mesmo_cnpj', 'sem_fornecedor', 'outro_fornecedor'];
const txt = (x: unknown): string | null => (typeof x === 'string' && x ? x : null);
/** a resposta da `fn_notas_candidatos` → chave → candidatos; fora do formato = `null` (quem lê trata como falha, nunca como "Nova") */
export function lerCandidatos(dados: unknown): Map<string, CandidatoDaNota[]> | null {
  if (!Array.isArray(dados)) return null;
  const saida = new Map<string, CandidatoDaNota[]>();
  for (const d of dados) {
    if (!d || typeof d !== 'object') return null;
    const chave: unknown = Reflect.get(d, 'chave');
    const lista: unknown = Reflect.get(d, 'candidatos');
    if (typeof chave !== 'string' || !Array.isArray(lista)) return null;
    const cs: CandidatoDaNota[] = [];
    for (const c of lista) {
      if (!c || typeof c !== 'object') return null;
      const id = txt(Reflect.get(c, 'id'));
      const classe = CLASSES.find((k) => k === Reflect.get(c, 'classe'));
      const valor: unknown = Reflect.get(c, 'valor_cent');
      if (!id || !classe || typeof valor !== 'number') return null;
      cs.push({ id, classe, valorCent: valor, competencia: txt(Reflect.get(c, 'competencia')), vencimento: txt(Reflect.get(c, 'vencimento')),
        pagamento: txt(Reflect.get(c, 'pagamento')), descricao: txt(Reflect.get(c, 'descricao')), status: txt(Reflect.get(c, 'status')),
        conciliado: Reflect.get(c, 'conciliado') === true, conta: txt(Reflect.get(c, 'conta')), fornecedorNome: txt(Reflect.get(c, 'fornecedor_nome')) });
    }
    saida.set(chave, cs);
  }
  return saida;
}

export type AbaDaReceita = 'lancar' | 'ciencia' | 'no_sistema' | 'vendas' | 'nao_financeiras' | 'canceladas' | 'todas';
export const ABAS_DA_RECEITA: { valor: AbaDaReceita; rotulo: string; filtro: (n: NotaNaLista) => boolean }[] = [
  { valor: 'lancar', rotulo: 'A lançar', filtro: (n) => n.sit === 'nova' || n.sit === 'pode_estar' },
  { valor: 'ciencia', rotulo: 'Ciência pendente', filtro: (n) => n.sit === 'pede_ciencia' || n.sit === 'esperando_xml' },
  { valor: 'no_sistema', rotulo: 'Já no sistema', filtro: (n) => n.sit === 'no_sistema' },
  /* NOTAS-RECEITA-SEM-LANCAMENTO-01: saem do "A lançar" sem sumir */
  { valor: 'vendas', rotulo: 'Vendas', filtro: (n) => n.sit === 'venda_titular' },
  { valor: 'nao_financeiras', rotulo: 'Não geram lançamento', filtro: (n) => n.sit === 'nao_financeira' },
  { valor: 'canceladas', rotulo: 'Canceladas', filtro: (n) => n.sit === 'cancelada' || n.sit === 'ignorada' },
  { valor: 'todas', rotulo: 'Todas', filtro: () => true },
];

/** o que PEDE AÇÃO (o selo do "+ Novo", D2): a lançar + ciência pendente */
export const pedemAcao = (lista: readonly NotaNaLista[]): number => lista.filter((n) => n.sit === 'nova' || n.sit === 'pode_estar' || n.sit === 'pede_ciencia').length;

export const SITUACAO_NA_TELA: Record<SituacaoNaLista, { rotulo: string; cor: string; dica: string }> = {
  nova: { rotulo: 'Nova', cor: 'bg-emerald-100 text-emerald-800', dica: 'XML completo e a chave não está no sistema: "Lançar" abre o "Da nota fiscal"' },
  pode_estar: { rotulo: 'Pode estar lançada', cor: 'bg-orange-100 text-orange-800', dica: 'há lançamento sem nota com o mesmo valor (do mesmo CNPJ ou sem fornecedor): "Lançar" mostra antes de criar' },
  no_sistema: { rotulo: 'Já no sistema', cor: 'bg-zinc-200 text-zinc-700', dica: 'a chave desta nota já está numa nota do sistema' },
  pede_ciencia: { rotulo: 'Pede ciência', cor: 'bg-amber-100 text-amber-800', dica: 'só o resumo da Receita; o XML completo vem depois da ciência (F3.3)' },
  esperando_xml: { rotulo: 'Esperando XML', cor: 'bg-sky-100 text-sky-800', dica: 'ciência enviada; o XML chega na próxima busca' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-red-100 text-red-800', dica: 'o emitente cancelou na Receita: nada a lançar' },
  ignorada: { rotulo: 'Ignorada', cor: 'bg-zinc-200 text-zinc-700', dica: 'marcada para não lançar' },
  nao_financeira: { rotulo: 'Não gera', cor: 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-300', dica: 'a nota diz que não gera lançamento' },
  venda_titular: { rotulo: 'Sua venda', cor: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300', dica: 'NF de entrada do comprador: é a sua venda' },
};

/** F34-SITUACAO-01 + NJ-NOTAS-LENTAS — "já no sistema" pelo critério do "+ Da nota", numa pergunta só (`fn_notas_ja_lancadas`, equivalente à
 *  `fn_nota_ja_lancada` sem parcelas: achado vivo pela chave, pelo nº com o fornecedor do emitente ou pelo nº num documento). A resposta
 *  `[{chave, ja_lancada}]` → as chaves já lançadas; fora do formato = `null` (quem lê trata como falha, nunca como "Nova"). */
export function chavesJaLancadas(dados: unknown): Set<string> | null {
  if (!Array.isArray(dados)) return null;
  const saida = new Set<string>();
  for (const d of dados) {
    if (!d || typeof d !== 'object') return null;
    const chave: unknown = Reflect.get(d, 'chave');
    const ja: unknown = Reflect.get(d, 'ja_lancada');
    if (typeof chave !== 'string' || typeof ja !== 'boolean') return null;
    if (ja) saida.add(chave);
  }
  return saida;
}
/** só estas perguntam ao banco: a cancelada/ignorada/ligada não muda de aba por isso */
export function precisaConferirLancamento(l: LinhaRecebida, chavesNoSistema: ReadonlySet<string>): boolean {
  const sit = situacaoNaLista(l, chavesNoSistema);
  return sit === 'nova' || sit === 'pede_ciencia' || sit === 'esperando_xml';
}

/** total das que valem (sem canceladas/ignoradas) */
export const totalDaLista = (lista: readonly NotaNaLista[]): number =>
  lista.filter((n) => n.sit !== 'cancelada' && n.sit !== 'ignorada').reduce((s, n) => s + (n.valorCent ?? 0), 0);

export function filtrarBusca(lista: readonly NotaNaLista[], busca: string, titularId: string | null): NotaNaLista[] {
  const q = busca.trim().toLowerCase();
  /* dígitos só quando a busca é um número (nº, CNPJ): "exemplo 2" não pode casar todo CNPJ com um 2 */
  const qd = /^[\d.\/\s-]+$/.test(q) ? q.replace(/\D/g, '') : '';
  return lista.filter((n) => (!titularId || n.titularId === titularId) && (!q
    || (n.emitenteNome ?? '').toLowerCase().includes(q)
    || (qd.length > 0 && (n.numero.replace(/\D/g, '').includes(qd) || (n.emitenteDocumento ?? '').includes(qd)))));
}

/** o arquivo do XML para baixar (D3) e para o "Da nota fiscal" (D1) */
export const nomeDoXml = (chave: string): string => `NFe${chave}.xml`;
export const arquivoDoXml = (chave: string, xml: string): File => new File([xml], nomeDoXml(chave), { type: 'application/xml' });
