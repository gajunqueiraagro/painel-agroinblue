/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA (Chat 16/11 20:05; mock ui-validar/notas-receita-f34.html aprovado 15:15, D1/D2/D3).
 * A REGRA da lista "Notas da Receita": lê o que a busca já gravou (`fiscal_dfe_recebidos`, RLS por cliente) — só leitura.
 *  · Nº e série saem da CHAVE (pos. 26–34 e 23–25), que existe já no resumo;
 *  · tipo = Resumo (só o resumo da Receita) × Completa (o XML inteiro); os eventos (cancelamento etc.) vêm dentro do resumo;
 *  · situação: Nova × Já no sistema (a chave já está numa nota_fiscal do cliente, ou a linha já foi ligada/importada) × Cancelada;
 *  · CNPJ do emitente inteiro; CPF de emitente pessoa física mascarado (`documentoNaTabela`).
 * Fora desta fatia: Dar ciência (F3.3), Ignorar (RPC nova), Fazenda pela IE.
 */
import { documentoNaTabela } from '@/lib/fiscal/documentoNaTabela';

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
export type SituacaoNaLista = 'nova' | 'no_sistema' | 'pede_ciencia' | 'esperando_xml' | 'cancelada' | 'ignorada';

export interface NotaNaLista extends LinhaRecebida {
  numero: string;
  serie: string;
  tipo: TipoNaLista;
  sit: SituacaoNaLista;
  titularNome: string;
  emitenteNaTabela: string;
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

export function montarLista(linhas: readonly LinhaRecebida[], titulares: ReadonlyMap<string, string>, chavesNoSistema: ReadonlySet<string>): NotaNaLista[] {
  return linhas.map((l) => ({
    ...l,
    numero: numeroDaChave(l.chave),
    serie: serieDaChave(l.chave),
    tipo: (l.temXml || l.situacao === 'xml' || l.situacao === 'importado' ? 'completa' : 'resumo') as TipoNaLista,
    sit: situacaoNaLista(l, chavesNoSistema),
    titularNome: titulares.get(l.titularId) ?? '—',
    emitenteNaTabela: documentoNaTabela(l.emitenteDocumento),
  })).sort((a, b) => (b.emissao ?? '').localeCompare(a.emissao ?? '') || b.chave.localeCompare(a.chave));
}

export type AbaDaReceita = 'lancar' | 'ciencia' | 'no_sistema' | 'canceladas' | 'todas';
export const ABAS_DA_RECEITA: { valor: AbaDaReceita; rotulo: string; filtro: (n: NotaNaLista) => boolean }[] = [
  { valor: 'lancar', rotulo: 'A lançar', filtro: (n) => n.sit === 'nova' },
  { valor: 'ciencia', rotulo: 'Ciência pendente', filtro: (n) => n.sit === 'pede_ciencia' || n.sit === 'esperando_xml' },
  { valor: 'no_sistema', rotulo: 'Já no sistema', filtro: (n) => n.sit === 'no_sistema' },
  { valor: 'canceladas', rotulo: 'Canceladas', filtro: (n) => n.sit === 'cancelada' || n.sit === 'ignorada' },
  { valor: 'todas', rotulo: 'Todas', filtro: () => true },
];

/** o que PEDE AÇÃO (o selo do "+ Novo", D2): a lançar + ciência pendente */
export const pedemAcao = (lista: readonly NotaNaLista[]): number => lista.filter((n) => n.sit === 'nova' || n.sit === 'pede_ciencia').length;

export const SITUACAO_NA_TELA: Record<SituacaoNaLista, { rotulo: string; cor: string; dica: string }> = {
  nova: { rotulo: 'Nova', cor: 'bg-emerald-100 text-emerald-800', dica: 'XML completo e a chave não está no sistema: "Lançar" abre o "Da nota fiscal"' },
  no_sistema: { rotulo: 'Já no sistema', cor: 'bg-zinc-200 text-zinc-700', dica: 'a chave desta nota já está numa nota do sistema' },
  pede_ciencia: { rotulo: 'Pede ciência', cor: 'bg-amber-100 text-amber-800', dica: 'só o resumo da Receita; o XML completo vem depois da ciência (F3.3)' },
  esperando_xml: { rotulo: 'Esperando XML', cor: 'bg-sky-100 text-sky-800', dica: 'ciência enviada; o XML chega na próxima busca' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-red-100 text-red-800', dica: 'o emitente cancelou na Receita: nada a lançar' },
  ignorada: { rotulo: 'Ignorada', cor: 'bg-zinc-200 text-zinc-700', dica: 'marcada para não lançar' },
};

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
