/**
 * CANCELAR UMA PARCELA DE COMPRA PARCELADA — PARC-CADEIA-01 passo 2 (Gabriel, 07/10/2026).
 *
 * A parcela e o lançamento dela mudam JUNTOS, no banco (`fn_parcelamento_cancelar_parcela`). Este é o dono PURO do que a tela
 * escreve e oferece a partir do retorno da SIMULAÇÃO dessa função: nenhuma regra é decidida aqui — o banco diz o antes, o
 * depois e a recusa; a tela só posiciona.
 * ⚠ SEM CONTA: os números (parcelas, total da compra, quantos lançamentos saem) vêm prontos do banco.
 * ⚠ "É PARCELA?" QUEM RESPONDE É O BANCO: a porta pergunta pela simulação; lançamento que não é parcela viva de compra
 *   parcelada volta `null` e segue o cancelamento de sempre. Nenhum `if` de origem espalhado pelas telas.
 */
import { formatMoeda } from '@/lib/calculos/formatters';
import { rotuloDoDocumento } from '@/lib/financeiro/documentoHelper';

export type EscopoDoCancelamento = 'so_esta' | 'todas';

export interface RecusaDoBanco { motivo: string; frase: string }

export interface PreviaCancelarParcela {
  escopo: EscopoDoCancelamento;
  contrato: { id: string; descricao: string; credor: string | null };
  parcela: { id: string; numero: number; total: number; valor: number; vencimento: string | null; paga: boolean };
  /** o número da NF viva ligada ao lançamento da parcela; nulo = sem nota fiscal ligada */
  nota: string | null;
  antes: { parcelas: number; valorTotal: number };
  depois: { parcelas: number; valorTotal: number };
  /** só no escopo 'todas': quantos lançamentos e parcelas saem */
  todas: { lancamentos: number; parcelas: number } | null;
  recusa: RecusaDoBanco | null;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

function lerRecusa(v: unknown): RecusaDoBanco | null {
  if (!ehObjeto(v)) return null;
  const frase = texto(v.frase);
  return frase ? { motivo: texto(v.motivo) ?? 'banco', frase } : null;
}

function lerAntesDepois(v: unknown): { parcelas: number; valorTotal: number } | null {
  if (!ehObjeto(v)) return null;
  const parcelas = numero(v.parcelas); const valorTotal = numero(v.valor_total);
  return parcelas === null || valorTotal === null ? null : { parcelas, valorTotal };
}

/** Lê o retorno de `fn_parcelamento_cancelar_parcela`. Peça torta = `null` inteiro (nunca zeros no lugar do que faltou). */
export function lerPreviaCancelarParcela(json: unknown): PreviaCancelarParcela | null {
  if (!ehObjeto(json)) return null;
  const escopo = json.escopo === 'so_esta' || json.escopo === 'todas' ? json.escopo : null;
  const c = json.contrato; const p = json.parcela;
  if (!escopo || !ehObjeto(c) || !ehObjeto(p)) return null;
  const id = texto(c.id); const descricao = texto(c.descricao);
  const pid = texto(p.id); const num = numero(p.numero); const total = numero(p.total); const valor = numero(p.valor);
  const antes = lerAntesDepois(json.antes); const depois = lerAntesDepois(json.depois);
  if (!id || descricao === null || !pid || num === null || total === null || valor === null || !antes || !depois) return null;
  let todas: PreviaCancelarParcela['todas'] = null;
  if (ehObjeto(json.todas)) {
    const l = numero(json.todas.lancamentos); const q = numero(json.todas.parcelas);
    if (l === null || q === null) return null;
    todas = { lancamentos: l, parcelas: q };
  }
  if (escopo === 'todas' && !todas) return null;
  return {
    escopo,
    contrato: { id, descricao, credor: texto(c.credor) },
    parcela: { id: pid, numero: num, total, valor, vencimento: texto(p.vencimento), paga: p.paga === true },
    nota: texto(json.nota),
    antes, depois, todas,
    recusa: lerRecusa(json.recusa),
  };
}

/** "Parcela 3/4 de «Nome do contrato»" — uma linha; a tela corta com o inteiro no `title`. */
export const tituloDoCancelamento = (p: PreviaCancelarParcela): string =>
  `Parcela ${p.parcela.numero}/${p.parcela.total} de «${p.contrato.descricao}»`;

export const SEM_NOTA = 'sem nota fiscal ligada';

const dataBR = (iso: string | null): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

/** A linha de dados: credor · nota · vencimento · valor. Só o credor é texto livre (corta); o resto nunca corta. */
export function dadosDaParcela(p: PreviaCancelarParcela): { credor: string; nota: string; vencimento: string; valor: string } {
  return {
    credor: p.contrato.credor?.trim() || 'sem credor',
    nota: (p.nota ? rotuloDoDocumento('NF', p.nota) : '') || SEM_NOTA,
    vencimento: dataBR(p.parcela.vencimento),
    valor: formatMoeda(p.parcela.valor),
  };
}

export interface LinhaAntesDepois { rotulo: string; antes: string; depois: string }

/** A tabela antes × depois do escopo escolhido — os números do banco, só escritos. */
export function antesDepois(p: PreviaCancelarParcela): LinhaAntesDepois[] {
  return [
    { rotulo: 'Parcelas', antes: String(p.antes.parcelas), depois: String(p.depois.parcelas) },
    { rotulo: 'Total da compra', antes: formatMoeda(p.antes.valorTotal), depois: formatMoeda(p.depois.valorTotal) },
  ];
}

export interface CaminhoDoCancelamento {
  escopo: EscopoDoCancelamento;
  rotulo: string;
  explica: string;
  /** a frase da recusa do banco; nula = o caminho vale */
  recusa: string | null;
}

/**
 * Os dois caminhos que GRAVAM, a partir das duas simulações. O caminho que o banco recusa fica APAGADO com a frase da recusa
 * escrita (nunca some). A simulação de 'todas' ainda não chegou (`null`): o caminho fica apagado com "calculando…".
 */
export function caminhosDoCancelamento(soEsta: PreviaCancelarParcela, todas: PreviaCancelarParcela | null, erroDeTodas?: string | null): CaminhoDoCancelamento[] {
  const n = todas?.todas?.lancamentos;
  return [
    {
      escopo: 'so_esta', rotulo: 'Cancelar só esta parcela',
      explica: `A compra passa a ${soEsta.depois.parcelas} ${soEsta.depois.parcelas === 1 ? 'parcela' : 'parcelas'} e o total é recalculado.`,
      recusa: soEsta.recusa?.frase ?? null,
    },
    {
      escopo: 'todas', rotulo: 'Cancelar a compra inteira',
      explica: n === undefined ? 'Cancela todas as parcelas e o contrato.'
        : `${n === 1 ? '1 lançamento será cancelado' : `${n} lançamentos serão cancelados`}, com as parcelas e o contrato.`,
      recusa: todas ? (todas.recusa?.frase ?? null) : (erroDeTodas ?? 'calculando…'),
    },
  ];
}

/** O caminho que nasce marcado: "só esta" quando vale; senão "a compra inteira" quando vale; senão nenhum. */
export function caminhoInicial(caminhos: readonly CaminhoDoCancelamento[]): EscopoDoCancelamento | null {
  return caminhos.find(c => !c.recusa)?.escopo ?? null;
}

export const rotuloDoBotao = (escopo: EscopoDoCancelamento | null): string =>
  escopo === 'todas' ? 'Cancelar a compra' : 'Cancelar parcela';

/* ── o lote ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** No cancelamento em lote a parcela de compra parcelada é PULADA (cada uma muda o contrato: cancela-se uma a uma). */
export function separarParcelas(ids: readonly string[], parcelas: ReadonlySet<string>): { cancelaveis: string[]; puladosParcela: string[] } {
  return {
    cancelaveis: ids.filter(id => !parcelas.has(id)),
    puladosParcela: ids.filter(id => parcelas.has(id)),
  };
}

export const fraseDoLote = (n: number): string =>
  `${n === 1 ? '1 parcela' : `${n} parcelas`} de compra parcelada: cancele uma a uma.`;
