/**
 * FIN-FINANC-28 · PASSO 4 — a TELA DO CONTRATO DE CRÉDITO (mock `docs/mocks/mock-financiamentos-v1_2.html`, seção 2). Dono PURO, em
 * CENTAVOS INTEIROS, de tudo o que a tela mostra e o banco não devolve pronto: o total das liberações listadas, o liberado de cada
 * destinação, o "saldo após" de cada parcela do cronograma e os dois avisos do cronograma. A tela só desenha (sem `reduce`).
 *
 * ⚠ O QUE O BANCO JÁ TEM NÃO SE RECALCULA AQUI: contratado, liberado, amortizado e saldo devedor são de `fn_financiamento_saldo`
 *   (a chave `saldo` da situação); juros a vencer e próxima parcela são de `resumoDoContratoNaLista` (os cartões do dono).
 * ⚠ "SALDO APÓS" NÃO É O SALDO DEVEDOR: é o que resta do CONTRATADO depois do principal de cada parcela, na ordem do cronograma —
 *   um número do cronograma (o do mock), não do dinheiro que entrou. O saldo devedor de verdade é o cartão.
 */
import type { ParcelaDoContrato } from './situacaoDoContrato';

const cent = (v: number) => Math.round(v * 100);

export type FormaDaLiberacao = 'conta' | 'fornecedor' | 'liquidacao';
export const ROTULO_DA_FORMA: Record<FormaDaLiberacao, string> = {
  conta: 'em conta', fornecedor: 'direto ao fornecedor', liquidacao: 'liquidação do anterior',
};
export const FORMAS_DA_LIBERACAO: readonly FormaDaLiberacao[] = ['conta', 'fornecedor', 'liquidacao'];

/** Uma liberação viva, como a tela a lê (as canceladas não chegam aqui). */
export interface LiberacaoDoContrato {
  id: string;
  data: string;
  valor: number;
  forma: FormaDaLiberacao;
  lancamentoId: string | null;
  /** o lançamento ligado: descrição, data de pagamento e a conta (pela direção) */
  lancamento: { descricao: string | null; data: string | null; conta: string | null } | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  contratoLiquidadoId: string | null;
  contratoLiquidadoNumero: string | null;
  destinacaoId: string | null;
  observacao: string | null;
}

export interface DestinacaoDoContrato { id: string; descricao: string; orcado: number }

/** O total das liberações LISTADAS (vivas), ao centavo. */
export function totalDasLiberacoes(libs: readonly LiberacaoDoContrato[]): number {
  let t = 0;
  for (const l of libs) t += cent(l.valor);
  return t / 100;
}

/** "a casar" / "vinculado" / "sem caixa": o estado da coluna Extrato / lançamento. */
export function estadoDoExtrato(l: LiberacaoDoContrato): 'vinculado' | 'a_casar' | 'sem_caixa' {
  if (l.forma !== 'conta') return 'sem_caixa';
  return l.lancamentoId ? 'vinculado' : 'a_casar';
}

/** "Conta ou fornecedor": a conta do lançamento ligado, senão a do contrato; o fornecedor; o contrato anterior. */
export function contaOuFornecedor(l: LiberacaoDoContrato, contaDoContrato: string | null): { texto: string; title: string } {
  if (l.forma === 'fornecedor') return { texto: l.fornecedorNome ?? '—', title: l.fornecedorNome ? `pago direto a ${l.fornecedorNome}` : 'fornecedor fora do cadastro' };
  if (l.forma === 'liquidacao') {
    const n = l.contratoLiquidadoNumero ?? 'sem nº';
    return { texto: `contrato ${n}`, title: `liquida o contrato ${n} · sem caixa` };
  }
  if (l.lancamento?.conta) return { texto: l.lancamento.conta, title: `conta do lançamento: ${l.lancamento.conta}` };
  return { texto: contaDoContrato ?? '—', title: contaDoContrato ? `conta do contrato: ${contaDoContrato}` : 'contrato sem conta' };
}

export interface LinhaDaDestinacao { id: string; descricao: string; orcado: number; liberado: number; pct: number | null }
/** Orçado × liberado por destinação (o liberado = as liberações vivas apontadas para ela), e o total. % = liberado ÷ orçado. */
export function resumoDasDestinacoes(dests: readonly DestinacaoDoContrato[], libs: readonly LiberacaoDoContrato[]): {
  linhas: LinhaDaDestinacao[]; total: { orcado: number; liberado: number; pct: number | null };
} {
  const porDest = new Map<string, number>();
  for (const l of libs) if (l.destinacaoId) porDest.set(l.destinacaoId, (porDest.get(l.destinacaoId) ?? 0) + cent(l.valor));
  let o = 0; let lb = 0;
  const linhas = dests.map((d) => {
    const oc = cent(d.orcado); const lc = porDest.get(d.id) ?? 0;
    o += oc; lb += lc;
    return { id: d.id, descricao: d.descricao, orcado: oc / 100, liberado: lc / 100, pct: oc > 0 ? Math.round((lc * 1000) / oc) / 10 : null };
  });
  return { linhas, total: { orcado: o / 100, liberado: lb / 100, pct: o > 0 ? Math.round((lb * 1000) / o) / 10 : null } };
}

/** Um encargo vivo do contrato (IOF, tarifa, TAC…): o papel e o valor do lançamento ligado (FIN-CONTRATO-VINCULAR-ENCARGO-01). */
export interface EncargoDoContrato { papel: string; valor: number }
/** A linha "Encargos" das destinações: a soma e os papéis, ao centavo. Sem encargo, nulo (a linha não aparece). */
export function encargosDoContrato(encs: readonly EncargoDoContrato[]): { total: number; papeis: string } | null {
  if (encs.length === 0) return null;
  let t = 0; const papeis = new Set<string>();
  for (const e of encs) { t += cent(Math.abs(e.valor)); papeis.add(e.papel); }
  return { total: t / 100, papeis: [...papeis].join(' · ') };
}

/** "Saldo após" de cada parcela: contratado − principal acumulado, na ordem do cronograma. Sem contratado, nulo. */
export function saldoAposDasParcelas(contratado: number | null, parcelas: readonly ParcelaDoContrato[]): Map<string, number | null> {
  const m = new Map<string, number | null>();
  if (contratado === null) { for (const p of parcelas) m.set(p.id, null); return m; }
  let resta = cent(contratado);
  for (const p of parcelas) { resta -= cent(p.valorPrincipal); m.set(p.id, resta / 100); }
  return m;
}

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const dias = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

/**
 * Os avisos do cronograma — SÓ INFORMAM, nada é ajustado:
 *  (a) o principal das parcelas não soma o contratado (a diferença, com sinal);
 *  (b) a 1ª parcela com juros cobra o PERÍODO INTEIRO (os mesmos juros da 2ª, sem amortização entre elas) e a 1ª liberação caiu no
 *      meio desse período (mais de 15 dias depois do início dele) — se o banco cobra por dia desde a liberação, a 1ª é menor.
 */
/** TELA v3 B3: o aviso do principal que não fecha com o contratado — vira item da aba "A resolver" (os outros avisos ficam sob o cronograma). */
export function avisoDoPrincipal(entrada: { contratado: number | null; somaPrincipal: number | null }): string | null {
  if (entrada.contratado === null || entrada.somaPrincipal === null) return null;
  const dif = cent(entrada.somaPrincipal) - cent(entrada.contratado);
  if (dif === 0) return null;
  return `O principal das parcelas soma ${reais(cent(entrada.somaPrincipal))} — ${reais(Math.abs(dif))} ${dif > 0 ? 'acima' : 'abaixo'} do contratado (${reais(cent(entrada.contratado))}).`;
}
export function avisosDoCronograma(entrada: {
  contratado: number | null; somaPrincipal: number | null; parcelas: readonly ParcelaDoContrato[]; primeiraLiberacao: string | null;
}): string[] {
  const out: string[] = [];
  const principal = avisoDoPrincipal(entrada);
  if (principal !== null) out.push(principal);
  const ps = entrada.parcelas.filter((p) => p.dataVencimento);
  const lib = entrada.primeiraLiberacao;
  if (lib && ps.length >= 2 && ps[0].valorJuros > 0 && cent(ps[0].valorPrincipal) === 0) {
    const p1 = ps[0]; const p2 = ps[1];
    const periodo = dias(p1.dataVencimento!, p2.dataVencimento!);
    if (periodo > 0 && cent(p1.valorJuros) >= Math.round(cent(p2.valorJuros) * 0.99)) {
      const inicio = new Date(Date.UTC(+p1.dataVencimento!.slice(0, 4), +p1.dataVencimento!.slice(5, 7) - 1, +p1.dataVencimento!.slice(8, 10) - periodo)).toISOString().slice(0, 10);
      if (dias(inicio, lib) > 15 && lib < p1.dataVencimento!) {
        out.push(`A 1ª parcela (${br(p1.dataVencimento!)}) cobra o período inteiro de juros (${reais(cent(p1.valorJuros))}), mas a 1ª liberação foi em ${br(lib)}. Se o banco cobra por dia desde a liberação, a 1ª parcela é menor — confira na cédula.`);
      }
    }
  }
  return out;
}

/* ── Documentos do contrato ─────────────────────────────────────────────────────────────────────────────────────────────── */
export type EspecieDoContrato = 'cedula' | 'aditivo' | 'demonstrativo_saldo' | 'comprovante_liberacao' | 'comprovante_pagamento' | 'outro';
/** ESPELHO DECLARADO do CHECK de `financiamento_documentos.especie` (migration 20261027200200): quem mexer num confere o outro. */
export const ESPECIES_DO_CONTRATO: readonly EspecieDoContrato[] = ['cedula', 'aditivo', 'demonstrativo_saldo', 'comprovante_liberacao', 'comprovante_pagamento', 'outro'];
export const ROTULO_DA_ESPECIE: Record<EspecieDoContrato, string> = {
  cedula: 'Cédula / Contrato', aditivo: 'Aditivo', demonstrativo_saldo: 'Demonstrativo de saldo',
  comprovante_liberacao: 'Comprovante de liberação', comprovante_pagamento: 'Comprovante de pagamento', outro: 'Outros',
};
export interface DocumentoDoContrato { id: string; especie: EspecieDoContrato; nome: string; storagePath: string | null; criadoEm: string; enviadoPor: string | null }
/** A pendência "sem_documento" do banco, do lado da tela: falta a cédula viva. */
export const faltaCedula = (docs: readonly DocumentoDoContrato[]): boolean => !docs.some((d) => d.especie === 'cedula');

/* ── Subtítulo do contrato: linha de crédito · taxa · carência · sistema · "até" (o que não existe, sai) ──────────────────── */
const SISTEMA: Record<string, string> = { sac: 'SAC', price: 'Price', bullet: 'parcela única', livre: 'personalizado' };
export function subtituloDoContrato(f: {
  linha: string | null; taxaAnual: number | null; taxaMensal: number | null; carenciaAte: string | null; sistema: string | null; ate: string | null;
}): string {
  const partes: string[] = [];
  if (f.linha) partes.push(f.linha);
  const pct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  if (f.taxaAnual && f.taxaAnual > 0) partes.push(`${pct(f.taxaAnual)} % a.a.`);
  else if (f.taxaMensal && f.taxaMensal > 0) partes.push(`${pct(f.taxaMensal)} % a.m.`);
  if (f.carenciaAte) partes.push(`carência até ${f.carenciaAte.slice(5, 7)}/${f.carenciaAte.slice(0, 4)}`);
  if (f.sistema) partes.push(SISTEMA[f.sistema] ?? f.sistema);
  if (f.ate) partes.push(`até ${f.ate.slice(8, 10)}/${f.ate.slice(5, 7)}/${f.ate.slice(0, 4)}`);
  return partes.join(' · ');
}
