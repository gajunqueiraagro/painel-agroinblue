/**
 * NOTA-LIGAR-LANCAMENTO-01 P1–P3 (Gabriel 11/11, OK 10:42; caso NJ: a NF 73.007 da Iguaçu filial 0015-75, R$ 280.500 em 2 duplicatas, anexada
 * a um lançamento de 42.075 da filial 0014-94, sem aviso nenhum) — a regra do "Novo documento" que LÊ a nota, pura:
 * · P1 `avisoDeFilial`: a nota é de OUTRA filial (mesmo CNPJ raiz) ou de OUTRO fornecedor que o do lançamento — nomeando os dois CNPJs (as
 *   filiais têm a mesma razão social: o nome sozinho não distingue). Só avisa; trocar é gesto (a `fn_lancamentos_trocar_favorecido`).
 * · P2 `quadroNotaXLancamento`: a nota e as duplicatas dela, e quem paga cada uma — ESTE lançamento (valor igual), outro lançamento já no
 *   sistema (o `fn_nota_ja_lancada`), uma liberação "direto ao fornecedor" de contrato (mesmo CNPJ raiz, valor igual, data próxima) ou
 *   ninguém ainda. Só mostra: nada se grava nem se corrige.
 * · P3 `participacaoSugerida`: o lançamento paga só parte da nota → a participação do anexo sugerida = lançamento ÷ nota (no lugar de 100%).
 */
import type { DuplicataNFe } from './tipos';
import type { LancamentoJaLancado } from './jaLancada';

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
/** "33.656.729/0015-75" → "0015-75" (o final da filial); CPF ou vazio → o que houver */
export function finalDaFilial(documento: string | null | undefined): string {
  const d = soDigitos(documento);
  return d.length === 14 ? `${d.slice(8, 12)}-${d.slice(12, 14)}` : d;
}
const raiz = (documento: string | null | undefined) => { const d = soDigitos(documento); return d.length === 14 ? d.slice(0, 8) : d; };

export type AvisoDeFilial =
  /** mesmo CNPJ raiz, filial diferente — e a filial da nota JÁ está no cadastro: dá para trocar */
  | { tipo: 'outra-filial'; notaFinal: string; lancamentoFinal: string; frase: string }
  /** mesmo CNPJ raiz, e a filial da nota NÃO está no cadastro: cadastrar antes de trocar */
  | { tipo: 'filial-fora-do-cadastro'; notaFinal: string; lancamentoFinal: string; frase: string }
  /** CNPJ raiz diferente: é outro fornecedor */
  | { tipo: 'outro-fornecedor'; notaFinal: string; lancamentoFinal: string; frase: string };

export function avisoDeFilial(e: {
  notaDocumento: string;
  /** o cadastro com o CNPJ exato da nota (`null` = não há) */
  notaFornecedorId: string | null;
  /** o fornecedor do lançamento (`null` = o lançamento não tem, ou não se leu: nada a avisar) */
  lancamento: { id: string; documento: string | null } | null;
}): AvisoDeFilial | null {
  const l = e.lancamento;
  if (!l || soDigitos(e.notaDocumento).length < 11) return null;
  if (e.notaFornecedorId && e.notaFornecedorId === l.id) return null;
  const nd = soDigitos(e.notaDocumento); const ld = soDigitos(l.documento);
  if (!ld) return null;
  if (nd === ld) return null;
  const notaFinal = finalDaFilial(nd); const lancamentoFinal = finalDaFilial(ld);
  if (raiz(nd) !== raiz(ld)) {
    return { tipo: 'outro-fornecedor', notaFinal, lancamentoFinal,
      frase: `A nota é de outro fornecedor (CNPJ ${nd.length === 14 ? `${nd.slice(0, 8)}/${notaFinal}` : nd}) — o lançamento está em outro CNPJ (${ld.length === 14 ? `${ld.slice(0, 8)}/${lancamentoFinal}` : ld}). Confira se é esta a nota.` };
  }
  return e.notaFornecedorId
    ? { tipo: 'outra-filial', notaFinal, lancamentoFinal, frase: `A nota é da filial ${notaFinal} · o lançamento está na ${lancamentoFinal}.` }
    : { tipo: 'filial-fora-do-cadastro', notaFinal, lancamentoFinal, frase: `A nota é da filial ${notaFinal}, que não está no cadastro · o lançamento está na ${lancamentoFinal}.` };
}

/** Uma liberação "direto ao fornecedor" de contrato do mesmo CNPJ raiz da nota. */
export interface LiberacaoDireta { id: string; data: string; valorCent: number; contrato: string | null }

export type QuemPaga =
  | { tipo: 'este' }
  | { tipo: 'outro'; lancamentoId: string; descricao: string | null; status: string | null }
  | { tipo: 'liberacao'; liberacaoId: string; contrato: string | null; data: string }
  | { tipo: 'ninguem' };

export interface LinhaDoQuadro { numero: string; vencimento: string | null; valorCent: number; quem: QuemPaga }
export interface QuadroNotaXLancamento {
  linhas: LinhaDoQuadro[];
  notaCent: number;
  /** a soma das duplicatas sem dono (ninguém paga ainda) */
  semDonoCent: number;
  /** ESTE lançamento não casou com nenhuma duplicata (nem com a nota inteira) */
  esteSemDuplicata: boolean;
}

/** valor igual = até R$ 0,01 (a tolerância do casamento da nota); "data próxima" da liberação = até 60 dias */
export const TOLERANCIA_CENT = 1;
export const JANELA_DA_LIBERACAO_DIAS = 60;
const dias = (a: string | null, b: string | null) => (a && b ? Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000 : Infinity);

export function quadroNotaXLancamento(e: {
  duplicatas: readonly DuplicataNFe[];
  notaCent: number;
  emissao: string | null;
  /** o lançamento aberto: o id e o valor (positivo), e a data dele para desempatar duplicatas de mesmo valor */
  lancamento: { id: string | null; valorCent: number | null; data: string | null };
  /** os achados do `fn_nota_ja_lancada` (o próprio lançamento é ignorado aqui) */
  outros: readonly LancamentoJaLancado[];
  liberacoes: readonly LiberacaoDireta[];
}): QuadroNotaXLancamento {
  /* sem duplicata, a nota inteira é uma linha só (à vista) */
  const base: { numero: string; vencimento: string | null; valorCent: number }[] = e.duplicatas.length
    ? e.duplicatas.map((d) => ({ numero: d.numero, vencimento: d.vencimento || null, valorCent: d.valorCent }))
    : [{ numero: 'nota', vencimento: e.emissao, valorCent: e.notaCent }];
  const quem: QuemPaga[] = base.map(() => ({ tipo: 'ninguem' }));
  /* 1. ESTE: a duplicata de valor igual mais perto da data do lançamento */
  const v = e.lancamento.valorCent;
  let esteIdx = -1;
  if (v !== null && v > 0) {
    base.forEach((d, i) => {
      if (Math.abs(d.valorCent - v) > TOLERANCIA_CENT) return;
      if (esteIdx < 0 || dias(d.vencimento, e.lancamento.data) < dias(base[esteIdx].vencimento, e.lancamento.data)) esteIdx = i;
    });
  }
  if (esteIdx >= 0) quem[esteIdx] = { tipo: 'este' };
  /* 2. OUTRO lançamento: o achado que o banco casou com a duplicata (n = posição + 1) */
  const outros = e.outros.filter((o) => !o.cancelado && o.id !== e.lancamento.id);
  base.forEach((_, i) => {
    if (quem[i].tipo !== 'ninguem') return;
    const o = outros.find((x) => x.parcelas.some((p) => p.n === i + 1));
    if (o) quem[i] = { tipo: 'outro', lancamentoId: o.id, descricao: o.descricao, status: o.status };
  });
  /* 3. LIBERAÇÃO direta ao fornecedor: valor igual, data até 60 dias da duplicata; cada liberação paga uma só */
  const usadas = new Set<string>();
  base.forEach((d, i) => {
    if (quem[i].tipo !== 'ninguem') return;
    const l = e.liberacoes
      .filter((x) => !usadas.has(x.id) && Math.abs(x.valorCent - d.valorCent) <= TOLERANCIA_CENT && dias(x.data, d.vencimento ?? e.emissao) <= JANELA_DA_LIBERACAO_DIAS)
      .sort((a, b) => dias(a.data, d.vencimento) - dias(b.data, d.vencimento))[0];
    if (l) { usadas.add(l.id); quem[i] = { tipo: 'liberacao', liberacaoId: l.id, contrato: l.contrato, data: l.data }; }
  });
  const linhas = base.map((d, i) => ({ ...d, quem: quem[i] }));
  return {
    linhas, notaCent: e.notaCent,
    semDonoCent: linhas.filter((l) => l.quem.tipo === 'ninguem').reduce((s, l) => s + l.valorCent, 0),
    esteSemDuplicata: esteIdx < 0,
  };
}

/** P3 — o lançamento paga só parte da nota: a participação sugerida em % inteiro (1–99); paga a nota inteira (ou mais), ou sem valor: `null`. */
export function participacaoSugerida(lancamentoCent: number | null, notaCent: number): number | null {
  if (lancamentoCent === null || !(lancamentoCent > 0) || !(notaCent > 0)) return null;
  if (lancamentoCent >= notaCent - TOLERANCIA_CENT) return null;
  return Math.min(99, Math.max(1, Math.round((lancamentoCent / notaCent) * 100)));
}
