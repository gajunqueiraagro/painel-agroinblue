/**
 * NOTA-ENTREGA-FUTURA-01 (B) — mock aprovado pelo Gabriel 25/11 07:44 (`ui-validar/nota-entrega-documentos-ref/mock-aprovado.html`): a aba
 * Documentos de uma compra com entrega futura. A REGRA é do banco (`fn_lancamento_entregas`, lote 113560): o papel de cada documento (Compra ·
 * Entrega 1, 2… · Boleto · Comprovante) e o saldo a entregar por item. Aqui só a LEITURA (falhou = `{ ok: false }`, nunca vazio — P146) e os
 * textos da tela. Nenhuma conta de saldo aqui.
 */
import { supabase } from '@/integrations/supabase/client';
import { motivoDoErro, type Consulta } from '@/lib/financeiro/nfeConsultas';
import { ROTULO_DO_MOTIVO, type MotivoNaoFinanceira } from '@/lib/fiscal/classeDaNota';

export type PapelDoDocumento = 'compra' | 'entrega' | 'nota' | 'boleto' | 'comprovante' | 'outro' | MotivoNaoFinanceira;
export interface ItemDoSaldo { produto: string; unidade: string; comprado: number; entregue: number; falta: number }
export interface EntregasDoLancamento {
  /** a NF da compra (a do lançamento e do LCDPR); `null` = nenhuma é a compra */
  compra: { chave: string; nf: string } | null;
  entregas: number;
  /** documento → papel (e o nº da entrega) */
  papeis: ReadonlyMap<string, { papel: PapelDoDocumento; n: number | null }>;
  /** o saldo por item; `null` com o `motivo` */
  itens: ItemDoSaldo[] | null;
  motivo: 'sem_compra' | 'sem_itens_da_compra' | null;
}

const MOTIVOS: readonly string[] = Object.keys(ROTULO_DO_MOTIVO);
const PAPEIS_FIXOS: readonly string[] = ['compra', 'entrega', 'nota', 'boleto', 'comprovante', 'outro'];
const ehPapel = (x: unknown): x is PapelDoDocumento => typeof x === 'string' && (PAPEIS_FIXOS.includes(x) || MOTIVOS.includes(x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null);
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** lê o jsonb da `fn_lancamento_entregas`; forma estranha = `null` (a tela diz que não conseguiu ler) */
export function lerEntregas(data: unknown): EntregasDoLancamento | null {
  if (!obj(data)) return null;
  const c = data.compra;
  const compra = obj(c) && typeof c.chave === 'string' && typeof c.nf === 'string' ? { chave: c.chave, nf: c.nf } : c === null || c === undefined ? null : undefined;
  if (compra === undefined || !Array.isArray(data.papeis)) return null;
  const papeis = new Map<string, { papel: PapelDoDocumento; n: number | null }>();
  for (const p of data.papeis) {
    if (!obj(p) || typeof p.documento_id !== 'string' || !ehPapel(p.papel)) return null;
    papeis.set(p.documento_id, { papel: p.papel, n: num(p.n) });
  }
  let itens: ItemDoSaldo[] | null = null;
  if (Array.isArray(data.itens)) {
    itens = [];
    for (const i of data.itens) {
      const comprado = obj(i) ? num(i.comprado) : null; const entregue = obj(i) ? num(i.entregue) : null; const falta = obj(i) ? num(i.falta) : null;
      if (!obj(i) || comprado === null || entregue === null || falta === null) return null;
      itens.push({ produto: typeof i.produto === 'string' ? i.produto : '—', unidade: typeof i.unidade === 'string' ? i.unidade : '', comprado, entregue, falta });
    }
  } else if (data.itens !== null && data.itens !== undefined) return null;
  const motivo = data.motivo === 'sem_compra' || data.motivo === 'sem_itens_da_compra' ? data.motivo : null;
  return { compra, entregas: num(data.entregas) ?? 0, papeis, itens, motivo };
}

export async function entregasDoLancamento(lancamentoId: string): Promise<Consulta<EntregasDoLancamento>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_lancamento_entregas', { p_lancamento: lancamentoId });
    if (error) { console.error('fn_lancamento_entregas', error); return { ok: false, motivo: motivoDoErro(error) }; }
    const lido = lerEntregas(data);
    return lido ? { ok: true, valor: lido } : { ok: false, motivo: 'a resposta do banco veio num formato inesperado' };
  } catch (e) { console.error('fn_lancamento_entregas', e); return { ok: false, motivo: motivoDoErro(e) }; }
}

/** o rótulo da coluna Papel: "Compra", "Entrega 2", "Boleto"…; as outras notas não financeiras pelo nome do motivo */
export function rotuloDoPapel(p: { papel: PapelDoDocumento; n: number | null }): string {
  switch (p.papel) {
    case 'compra': return 'Compra';
    case 'entrega': return p.n ? `Entrega ${p.n}` : 'Entrega';
    case 'nota': return 'Nota';
    case 'boleto': return 'Boleto';
    case 'comprovante': return 'Comprovante';
    case 'outro': return 'Outro';
    default: return ROTULO_DO_MOTIVO[p.papel].replace(/^./, (x) => x.toUpperCase());
  }
}

/** o que o papel faz (o texto pequeno ao lado): só a Compra gera a conta e vai no LCDPR; a entrega não tem financeiro */
export function oQueOPapelFaz(papel: PapelDoDocumento): string {
  return papel === 'compra' ? 'gera a conta · vai no LCDPR' : papel === 'entrega' ? 'entrega · sem financeiro' : '';
}

const QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
export const quantidadeFalada = (q: number, unidade: string) => `${QTD.format(q)}${unidade ? ` ${unidade}` : ''}`;

/** "falta 6.412 sc" / "completa" — a coluna Falta e o Resumo */
export function fraseDaFalta(i: Pick<ItemDoSaldo, 'falta' | 'unidade'>): string {
  return i.falta > 0 ? quantidadeFalada(i.falta, i.unidade) : 'completa';
}

/** a linha "Entregas" do Resumo: "2 · falta 6.412 sc" / "1 · completa"; sem saldo, só o número */
export function fraseDasEntregas(e: Pick<EntregasDoLancamento, 'entregas' | 'itens'>): string {
  if (!e.itens || e.itens.length === 0) return `${e.entregas}`;
  const faltando = e.itens.filter((i) => i.falta > 0);
  if (faltando.length === 0) return `${e.entregas} · completa`;
  return faltando.length === 1 ? `${e.entregas} · falta ${quantidadeFalada(faltando[0].falta, faltando[0].unidade)}` : `${e.entregas} · faltam ${faltando.length} itens`;
}

/** o porquê de não haver saldo (a frase no lugar da tabela) */
export const FRASE_SEM_SALDO: Record<'sem_compra' | 'sem_itens_da_compra', string> = {
  sem_compra: 'Sem a NF da compra (simples faturamento) neste lançamento: o saldo a entregar aparece quando ela for anexada.',
  sem_itens_da_compra: 'A NF da compra ainda não tem os itens lidos: o saldo aparece quando o XML dela estiver no sistema.',
};
