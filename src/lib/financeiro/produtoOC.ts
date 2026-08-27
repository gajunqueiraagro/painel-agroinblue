// PR-FIN-OC-COMPOSICAO-02 — Produto (descrição operacional) dos títulos da Operação Comercial.
// Único ponto de verdade do formato. Derivado de dados ESTRUTURADOS do lote (categoria + quantidade)
// e da parcela. NÃO inclui fornecedor, emoji, UUID nem código humano da OC (inexistente).
import { CATEGORIAS } from '@/types/cattle';

// Mapa oficial de siglas por SLUG de categoria (identificador estável — nunca texto exibido).
const SIGLA_POR_SLUG: Record<string, string> = {
  mamotes_m: 'MM', mamotes_f: 'MF',
  desmama_m: 'DM', desmama_f: 'DF',
  garrotes: 'G', novilhas: 'N',
  bois: 'B', vacas: 'V', touros: 'T',
};

// Sigla por slug; fallback COMPACTO e determinístico (label oficial sem espaços, ou o slug) — nunca
// inventa sigla nova. Categoria fora do mapa deve ser relatada pelo chamador.
export function siglaCategoria(slug: string): string {
  const s = SIGLA_POR_SLUG[slug];
  if (s) return s;
  const label = CATEGORIAS.find(c => c.value === slug)?.label;
  return (label ? label.replace(/\s+/g, '') : slug).toUpperCase();
}

// Categoria reconhecida no mapa oficial?
export function categoriaTemSigla(slug: string): boolean {
  return slug in SIGLA_POR_SLUG;
}

// Quantidade com MÍNIMO de 3 dígitos (10→010, 25→025); acima de 999 NÃO trunca (1200→1200).
function qtd3(qtd: number): string {
  return String(Math.max(0, Math.trunc(qtd))).padStart(3, '0');
}

// Verbo do Produto a partir do tipo da OC.
export function verboOC(tipoOperacao: 'compra' | 'venda' | 'abate' | string): string {
  switch (tipoOperacao) {
    case 'compra': return 'Compra';
    case 'venda': return 'Venda';
    case 'abate': return 'Abate';
    default: return tipoOperacao.charAt(0).toUpperCase() + tipoOperacao.slice(1);
  }
}

// Produto PRINCIPAL: "{Verbo} {qtd:3} {SIGLA} — Parc. {seq}/{total}".
//   quantidade = qtd_negociada integral do lote (repetida em todas as parcelas; NÃO dividir físico);
//   categoria = slug oficial; parcela = da obrigação.
export function produtoOCPrincipal(
  tipoOperacao: string, qtd: number, categoriaSlug: string, seq: number, totalParcelas: number,
): string {
  return `${verboOC(tipoOperacao)} ${qtd3(qtd)} ${siglaCategoria(categoriaSlug)} — Parc. ${seq}/${totalParcelas}`;
}

// Produto do COMPROMISSO principal (grão AGREGADO, sem parcela): "{Verbo} {qtd:3} {Categoria}".
//   Irmão de produtoOCPrincipal, mesma fonte única de qtd3/verbo, mas SEM sufixo "— Parc. x/y" (grão-parcela)
//   e com o LABEL completo da categoria (ex.: "Garrotes"), não a sigla. Ex.: "Compra 007 Garrotes".
//   O fornecedor NÃO entra no Produto/Descrição (permanece nos campos Favorecido/dados da OC) — coerente
//   com o cabeçalho deste módulo. categoriaLabel já resolvido pelo chamador (string de exibição).
export function produtoOCCompromisso(
  tipoOperacao: string, qtd: number, categoriaLabel: string,
): string {
  return `${verboOC(tipoOperacao)} ${qtd3(qtd)}${categoriaLabel ? ` ${categoriaLabel}` : ''}`.trim();
}

// Compromisso de UM LOTE: "{Verbo} {qtd:3} {SIGLA}" — ex. "Compra 029 DF", "Compra 001 V".
//   Irmao do de cima; a unica diferenca e' a SIGLA no lugar do label completo, porque o
//   compromisso por lote convive com os irmaos na mesma tela e o nome precisa ser curto.
//   O verbo sai de verboOC, entao Venda e Abate ja saem prontos na replicacao.
export function produtoOCCompromissoLote(
  tipoOperacao: string, qtd: number, categoriaSlug: string,
): string {
  return `${verboOC(tipoOperacao)} ${qtd3(qtd)} ${siglaCategoria(categoriaSlug)}`;
}
