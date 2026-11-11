/**
 * LOTE-BUSCA-01 (Gabriel 11/11 10:00) — a lista do campo Lote do modal do pasto. Antes o seletor desenhava só os 50 primeiros lotes (na
 * Pureza, 63: os REC- do fim nunca apareciam) e a busca casava o texto inteiro ("LOT 9.2 F1" não achava o 9.2). Agora:
 * (a) TODOS os lotes ativos, em grupos; (b) a busca é por palavras (no `SearchableSelect`, `buscaPorPalavras`) e o carimbo lido do
 * "Nome no caderno" sugere no topo (dois lotes com o mesmo carimbo = os dois); (c) grupos pelo mês anterior: "Neste pasto",
 * "Em outros pastos" (pasto · cab) e os demais. O mês anterior vem das LIGAÇÕES (`fn_lotes_da_fazenda` no mês anterior); lote sem ligação
 * naquele mês procura o TEXTO dos cards do mês anterior (set/26 só tem texto): o nome do campeiro igual ao texto, senão o carimbo no texto.
 */
import type { OpcaoSearchable } from '@/components/ui/searchable-select';
import { normalizarParaBusca } from '@/lib/texto/busca';
import { CARIMBO_VALIDO, codigoAoLado, nomeNaTela, type LoteDaLista } from './tipos';

export const GRUPO_NESTE_PASTO = 'Neste pasto no mês anterior';
export const GRUPO_OUTROS_PASTOS = 'Em outros pastos no mês anterior';
export const GRUPO_DEMAIS = 'Demais lotes';
export const GRUPO_DO_CADERNO = 'Pelo nome no caderno';

/** onde o lote LIGADO esteve no mês anterior (os pastos pelo nome e as cabeças daquele mês) */
export interface LoteNoMesAnterior { pastos: string[]; cabecas: number | null }
/** o "Nome no caderno" de um card do mês anterior */
export interface TextoNoMesAnterior { pasto: string; texto: string }
export interface MesAnteriorDoLote {
  porLote: ReadonlyMap<string, LoteNoMesAnterior>;
  textos: readonly TextoNoMesAnterior[];
}
export interface ContextoDaBusca {
  pastoNome: string;
  textoDoCaderno: string;
  mesAnterior: MesAnteriorDoLote | null;
}

/** Os carimbos escritos num texto do caderno: "LOT 9.2 F1" → ["9.2"]; "Vacas CAR_9.2" → ["9.2"]; "7R e 8.1" → ["7R", "8.1"]. */
export function carimbosDoTexto(texto: string | null | undefined): string[] {
  const pedacos = (texto ?? '').toUpperCase().split(/[^0-9A-Z.]+/).map(p => p.replace(/^\.+|\.+$/g, ''));
  return [...new Set(pedacos.filter(p => CARIMBO_VALIDO.test(p)))];
}

const mesmoTexto = (a: string | null | undefined, b: string | null | undefined) =>
  !!normalizarParaBusca(a) && normalizarParaBusca(a) === normalizarParaBusca(b);

/** O lote está escrito no texto? Pelo nome do campeiro (igual) ou, sem nome igual na fazenda, pelo carimbo. */
function textoCitaOLote(texto: string, l: LoteDaLista, ativos: readonly LoteDaLista[]): boolean {
  if (mesmoTexto(texto, l.nomeCampeiro)) return true;
  if (ativos.some(o => mesmoTexto(texto, o.nomeCampeiro))) return false;   // o texto é o nome de OUTRO lote: o carimbo não decide
  return !!l.carimbo && carimbosDoTexto(texto).includes(l.carimbo.trim().toUpperCase());
}

interface OndeEsteve { pastos: string[]; texto: string }

/** Onde o lote esteve no mês anterior: a ligação manda; sem ela, os cards cujo texto cita o lote. Nada = null. */
function ondeEsteve(l: LoteDaLista, ctx: MesAnteriorDoLote, ativos: readonly LoteDaLista[]): OndeEsteve | null {
  const ligado = ctx.porLote.get(l.id);
  if (ligado && ligado.pastos.length) {
    return { pastos: ligado.pastos, texto: [ligado.pastos.join(', '), ligado.cabecas != null ? `${ligado.cabecas} cab` : ''].filter(Boolean).join(' · ') };
  }
  const citado = ctx.textos.filter(t => textoCitaOLote(t.texto, l, ativos));
  if (!citado.length) return null;
  return { pastos: citado.map(t => t.pasto), texto: citado.map(t => `${t.pasto} · caderno "${t.texto.trim()}"`).join(' · ') };
}

/** O lote é o do texto do caderno DESTE card? (o nome do campeiro igual ou o carimbo escrito nele) */
function sugeridoPeloCaderno(texto: string, l: LoteDaLista, ativos: readonly LoteDaLista[]): boolean {
  return !!texto.trim() && textoCitaOLote(texto, l, ativos);
}

/** As opções do campo Lote, em grupos e já na ordem dos grupos (o `SearchableSelect` põe o cabeçalho antes do 1º de cada um). */
export function opcoesDosLotesNoPasto(lotes: readonly LoteDaLista[], ctx: ContextoDaBusca): OpcaoSearchable[] {
  const ativos = lotes.filter(l => l.situacao === 'ativo');
  const neste = normalizarParaBusca(ctx.pastoNome);
  const grupos: OpcaoSearchable[][] = [[], [], [], []];
  for (const l of ativos) {
    const onde = ctx.mesAnterior ? ondeEsteve(l, ctx.mesAnterior, ativos) : null;
    const i = sugeridoPeloCaderno(ctx.textoDoCaderno, l, ativos) ? 0
      : !onde ? 3
      : onde.pastos.some(p => normalizarParaBusca(p) === neste) ? 1 : 2;
    grupos[i].push({
      value: l.id,
      label: nomeNaTela(l),
      sub: [onde?.texto, codigoAoLado(l), l.nomeCampeiro].filter(Boolean).join(' · ') || undefined,
      busca: [l.codigo, ...l.codigosAntigos].join(' '),
      grupo: [GRUPO_DO_CADERNO, GRUPO_NESTE_PASTO, GRUPO_OUTROS_PASTOS, GRUPO_DEMAIS][i],
    });
  }
  /* sem nenhum grupo além dos "demais" (nada no mês anterior, nada no caderno) a lista fica sem cabeçalho, como era */
  if (!grupos[0].length && !grupos[1].length && !grupos[2].length) return grupos[3].map(o => ({ value: o.value, label: o.label, sub: o.sub, busca: o.busca }));
  return grupos.flat();
}
