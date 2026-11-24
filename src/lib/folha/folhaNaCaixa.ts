/**
 * FOLHA-NA-CAIXA-01 (Gabriel 24/11 10:55, "preciso que isso funcione") — a REGRA PURA do recibo do contador na Caixa: da `FolhaLida`
 * (o `lerFolha`) ao pedido da `fn_folha_recibos_aplicar` (contrato do Code 6, §A de folha-20261122-0939) e da resposta do banco às
 * linhas da prévia (uma por funcionário, na ordem do PDF).
 *
 * ⚠ O BANCO DECIDE: casar, criar, pendência, soma = documento, "já aplicado", mês fechado — a tela só mostra o que ele devolveu.
 * ⚠ CRIAR é gesto: só quem o banco deu como `sem_lancamento` e o operador marcou vai com `criar: true`.
 * ⚠ Leitura da resposta sem cast: cada campo conferido pelo tipo; o que não vier é null ("—" na tela), nunca zero.
 */
import type { FolhaLida, PessoaDaFolha, TipoDaFolha } from './lerFolha';

export const ROTULO_DO_TIPO: Record<TipoDaFolha, string> = { '13_1': '13º 1ª parcela', '13_2': '13º 2ª parcela', mensal: 'Salário do mês' };
/** '2026-11' → '11/2026' */
export const competenciaBR = (c: string): string => (/^\d{4}-\d{2}$/.test(c) ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : c);

/* ═══ o pedido ═══ */
export interface PedacoDaPessoa { tamanho: number; md5: string }
export interface DocumentoDoPedido { md5: string; nome: string; tipo: TipoDaFolha; competencia: string; total: number; empregador: string }
export interface ItemDoPedido {
  nome: string; cei: string; paginas: number[]; valor: number;
  arquivo: { nome: string; tamanho: number; md5: string };
  criar?: true;
}
/** O nome do pedaço de cada pessoa: "<código>-<nome>.pdf" (o contrato A1), sem barra nem caractere que o storage recuse. */
export const nomeDoPedaco = (p: Pick<PessoaDaFolha, 'codigo' | 'nome'>): string =>
  `${p.codigo}-${p.nome}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) + '.pdf';

/** `criar`: os índices (0…N-1, na ordem do PDF) que o operador marcou para criar o lançamento. */
export function pedidoDaFolha(folha: FolhaLida, nomeDoArquivo: string, md5DoDocumento: string, pedacos: readonly PedacoDaPessoa[],
  criar: ReadonlySet<number>): { documento: DocumentoDoPedido; itens: ItemDoPedido[] } {
  return {
    documento: {
      md5: md5DoDocumento, nome: nomeDoArquivo, tipo: folha.tipo, competencia: folha.competencia, total: folha.total,
      empregador: folha.empregadores.join(', '),
    },
    itens: folha.pessoas.map((p, i) => ({
      nome: p.nome, cei: p.cei, paginas: [...p.paginas], valor: p.valor,
      arquivo: { nome: nomeDoPedaco(p), tamanho: pedacos[i]?.tamanho ?? 0, md5: pedacos[i]?.md5 ?? '' },
      ...(criar.has(i) ? { criar: true as const } : {}),
    })),
  };
}

/* ═══ a resposta do banco ═══ */
export interface Automatico {
  paginas: number[]; nome: string; lancamentoId: string; antes: number | null; depois: number | null;
  nomeConfere: 'exato' | 'parcial' | null; casouPor: 'funcionario' | 'favorecido' | null;
  /** contrato do Code 6 (FILA 24/11 10:57, 118570): 'dividir' = o 13º inteiro vira a 2ª parcela (`segunda`) e o recibo é a 1ª */
  acao: 'casar' | 'dividir';
  descricaoAntes: string | null; descricao: string | null; vencimentoAntes: string | null; vencimento: string | null; status: string | null;
  segunda: { descricao: string | null; valor: number | null; vencimento: string | null } | null;
}
export interface Pendencia { paginas: number[]; nome: string; valor: number | null; pendencia: 'ambiguo' | 'sem_lancamento' }
export interface SemRecibo { lancamentoId: string; nome: string; valor: number | null }
export interface ACriar { nome: string; valor: number | null; descricao: string | null; vencimento: string | null }
export interface SemFuncionario { paginas: number[]; nome: string }
export interface DocumentoGravado { documentoId: string; storagePath: string; nome: string; paginas: number[]; lancamentoId: string | null }
export interface RespostaDaFolha {
  jaAplicado: boolean;
  automaticos: Automatico[]; criar: ACriar[]; pendencias: Pendencia[]; semRecibo: SemRecibo[]; semFuncionario: SemFuncionario[];
  soma: number | null;
  /** só no aplicar */
  documentos: DocumentoGravado[];
}

const obj = (x: unknown): Record<string, unknown> | null => (typeof x === 'object' && x !== null && !Array.isArray(x) ? Object.fromEntries(Object.entries(x)) : null);
const lista = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.flatMap((i) => { const o = obj(i); return o ? [o] : []; }) : []);
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
const numero = (x: unknown): number | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};
const paginasDe = (x: unknown): number[] => (Array.isArray(x) ? x : [x]).flatMap((p) => { const n = numero(p); return n === null ? [] : [n]; });
const umDe = <T extends string>(x: unknown, valores: readonly T[]): T | null => valores.find((v) => v === x) ?? null;

function segundaDe(x: unknown): Automatico['segunda'] {
  const o = obj(x);
  return o ? { descricao: texto(o.descricao), valor: numero(o.valor), vencimento: texto(o.vencimento) } : null;
}

export function respostaDaFolha(j: unknown): RespostaDaFolha | null {
  const r = obj(j);
  if (!r || r.ok !== true) return null;
  return {
    jaAplicado: r.ja_aplicado === true,
    automaticos: lista(r.automaticos).map((a) => ({
      paginas: paginasDe(a.pagina), nome: texto(a.nome) ?? '—', lancamentoId: texto(a.lancamento_id) ?? '', antes: numero(a.antes), depois: numero(a.depois),
      nomeConfere: umDe(a.nome_confere, ['exato', 'parcial'] as const), casouPor: umDe(a.casou_por, ['funcionario', 'favorecido'] as const),
      acao: a.acao === 'dividir' ? 'dividir' : 'casar',
      descricaoAntes: texto(a.descricao_antes) ?? texto(a.descricao), descricao: texto(a.descricao_depois) ?? texto(a.descricao),
      vencimentoAntes: texto(a.vencimento_antes) ?? texto(a.vencimento), vencimento: texto(a.vencimento_depois) ?? texto(a.vencimento),
      status: texto(a.status), segunda: segundaDe(a.segunda),
    })),
    criar: lista(r.criar ?? r.criados).map((c) => ({ nome: texto(c.nome) ?? '—', valor: numero(c.valor), descricao: texto(c.descricao), vencimento: texto(c.vencimento) })),
    pendencias: lista(r.pendencias).flatMap((p) => {
      const pendencia = umDe(p.pendencia, ['ambiguo', 'sem_lancamento'] as const);
      return pendencia ? [{ paginas: paginasDe(p.pagina), nome: texto(p.nome) ?? '—', valor: numero(p.valor), pendencia }] : [];
    }),
    semRecibo: lista(r.sem_recibo).map((s) => ({ lancamentoId: texto(s.lancamento_id) ?? '', nome: texto(s.nome) ?? '—', valor: numero(s.valor) })),
    semFuncionario: lista(r.documentos_sem_funcionario).map((s) => ({ paginas: paginasDe(s.pagina), nome: texto(s.nome) ?? '—' })),
    soma: numero(r.soma),
    documentos: lista(r.documentos).flatMap((d) => {
      const documentoId = texto(d.documento_id); const storagePath = texto(d.storage_path);
      return documentoId && storagePath
        ? [{ documentoId, storagePath, nome: texto(d.nome) ?? '—', paginas: paginasDe(d.paginas), lancamentoId: texto(d.lancamento_id) }] : [];
    }),
  };
}

/* ═══ as linhas da prévia ═══ */
export type OQueAcontece = 'casa' | 'divide' | 'cria' | 'sem_lancamento' | 'ambiguo' | 'sem_resposta';
export interface LinhaDaPrevia {
  /** o índice da pessoa no PDF (0…N-1) */
  k: number;
  paginas: number[]; nome: string; recibo: number;
  acontece: OQueAcontece;
  antes: number | null; descricao: string | null; vencimento: string | null; status: string | null;
  /** o que muda além do valor (o title da célula): a descrição e o vencimento de antes, quando mudam */
  descricaoAntes: string | null; vencimentoAntes: string | null;
  /** 'divide': o que continua previsto como 2ª parcela */
  segunda: Automatico['segunda'];
  nomeParcial: boolean;
  /** o PDF da pessoa se guarda (ela está no cadastro de funcionários) */
  guardaArquivo: boolean;
}
const mesmasPaginas = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Uma linha por pessoa do PDF; o que o banco disse dela (pelas páginas, que são únicas no documento). `criar`: as marcadas. */
export function linhasDaPrevia(folha: FolhaLida, r: RespostaDaFolha, criar: ReadonlySet<number>): LinhaDaPrevia[] {
  let iCriar = 0;
  return folha.pessoas.map((p, k) => {
    const base: LinhaDaPrevia = {
      k, paginas: p.paginas, nome: p.nome, recibo: p.valor, acontece: 'sem_resposta', antes: null, descricao: null, vencimento: null,
      status: null, descricaoAntes: null, vencimentoAntes: null, segunda: null, nomeParcial: false, guardaArquivo: !r.semFuncionario.some((s) => mesmasPaginas(s.paginas, p.paginas)),
    };
    const a = r.automaticos.find((x) => mesmasPaginas(x.paginas, p.paginas));
    if (a) {
      return {
        ...base, acontece: a.acao === 'dividir' ? 'divide' : 'casa', antes: a.antes, descricao: a.descricao, vencimento: a.vencimento, status: a.status,
        descricaoAntes: a.descricaoAntes !== a.descricao ? a.descricaoAntes : null, vencimentoAntes: a.vencimentoAntes !== a.vencimento ? a.vencimentoAntes : null,
        segunda: a.acao === 'dividir' ? a.segunda : null, nomeParcial: a.nomeConfere === 'parcial',
      };
    }
    const pend = r.pendencias.find((x) => mesmasPaginas(x.paginas, p.paginas));
    if (pend) return { ...base, acontece: pend.pendencia };
    if (criar.has(k)) {
      const c = r.criar[iCriar++];
      return { ...base, acontece: 'cria', descricao: c?.descricao ?? null, vencimento: c?.vencimento ?? null };
    }
    return base;
  });
}

/** O que impede o Aprovar (a frase vai ao lado do botão; null = pode). */
export function motivoParaNaoAprovar(folha: FolhaLida, r: RespostaDaFolha | null, linhas: readonly LinhaDaPrevia[]): string | null {
  if (!r) return 'esperando a prévia do banco';
  if (r.jaAplicado) return 'este documento já foi aplicado';
  if (r.soma === null || Math.round(r.soma * 100) !== Math.round(folha.total * 100)) return 'a soma dos recibos não confere com o documento';
  const amb = linhas.filter((l) => l.acontece === 'ambiguo').length;
  if (amb) return `${amb} recibo(s) acham mais de um funcionário ou lançamento: confira o cadastro`;
  const sem = linhas.filter((l) => l.acontece === 'sem_lancamento').length;
  if (sem) return `${sem} recibo(s) sem lançamento: marque "Criar" ou fale com o consultor`;
  if (linhas.some((l) => l.acontece === 'sem_resposta')) return 'o banco não respondeu sobre todos os recibos';
  return null;
}

/** "No sistema" da linha da Caixa (tipo e competência vão na coluna do emitente; o total, na de valor). */
export const fraseDaLinhaDaFolha = (folha: FolhaLida): string => {
  const n = folha.pessoas.length;
  const e = folha.empregadores.length;
  return `${n} ${n === 1 ? 'pessoa' : 'pessoas'}${e > 1 ? ` · ${e} empregadores` : ''} · "Abrir" mostra a prévia`;
};
