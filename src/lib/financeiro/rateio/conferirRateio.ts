/**
 * RATEIO-HIGINO-01 (Gabriel 17/11) — CONFERIR A RELAÇÃO DO RATEIO contra os itens que já estão na conta comum.
 *
 * O caso: as despesas em comum de duas pessoas, pagas por uma delas; a outra reembolsa a sua parte (50%). Cada linha da relação do
 * contador já existe na conta comum como item a 50% (as recorrências são a referência do que pagar: NUNCA se apagam aqui). Esta
 * tela confere linha a linha contra o papel: valor (100%) → a parte; nº da NF; fazenda e conta por escolha do operador; o que falta
 * vira item novo. A soma das partes × o pagamento fica sempre visível — nunca se ajusta um item para "bater".
 *
 * Tudo aqui é puro (sem banco): a tela monta as linhas, a regra diz a situação de cada uma e o pedido para gravar.
 */

/** O item que já está na conta comum. Valores em CENTAVOS inteiros. */
export interface ItemDoRateio {
  id: string;
  descricao: string | null;
  fazendaId: string | null;
  planoContaId: string | null;
  valorCent: number;
  vencimento: string | null;
  competencia: string | null;
  numeroDocumento: string | null;
  tipoDocumento: string | null;
  /** pago, realizado ou conciliado: valor, conta e vencimento não mudam (a trava do completar). */
  pago: boolean;
}

/** O que o operador lê no papel, para um item ou para uma linha nova (itemId null). */
export interface LinhaDaRelacao {
  chave: string;
  itemId: string | null;
  /** o valor da relação, 100% (null = ainda não conferido) */
  valorCheioCent: number | null;
  nf: string | null;
  /** fazenda e conta da RELAÇÃO (para a linha nova, as que valem) */
  fazendaId: string | null;
  planoContaId: string | null;
  descricao: string | null;
  vencimento: string | null;
  competencia: string | null;
  /** fazenda/conta diferente do item: o que o operador escolheu (nada automático) */
  escolha: 'manter' | 'relacao';
}

export type Diferenca = 'valor' | 'nf' | 'fazenda' | 'conta';

export interface SituacaoDaLinha {
  /** 'nova' = cria; 'confere' = nada muda; 'muda' = há o que gravar; 'falta' = ainda sem o valor da relação; 'travado' = valor diferente num item pago */
  tipo: 'nova' | 'confere' | 'muda' | 'falta' | 'travado';
  /** a parte (50%) do valor da relação, em centavos */
  parteCent: number | null;
  difCent: number | null;
  diferencas: Diferenca[];
  /** frase curta para a célula (uma linha) */
  frase: string;
}

/** O pedido do `fn_nota_completar` para um item: só os campos que mudam (os nomes do banco). */
export type PedidoDoCompletar = { id: string } & Partial<Record<'valor' | 'numero_documento' | 'tipo_documento' | 'fazenda_id' | 'plano_conta_id', string | number>>;

export const PARTE_PADRAO_PCT = 50;

/** A parte em centavos, arredondada como o sistema arredonda o item (meio centavo sobe: 3.302,09 → 1.651,05). */
export function parteCent(valorCheioCent: number, pct: number = PARTE_PADRAO_PCT): number {
  return Math.round((valorCheioCent * pct) / 100);
}

/** O nº como se compara: só dígitos, sem zeros à esquerda ("000.034.756" = "34756"); vazio = null. */
export function numeroDaNf(nf: string | null | undefined): string | null {
  const d = (nf ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return d || null;
}

const mesmo = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null);

export function situacaoDaLinha(linha: LinhaDaRelacao, item: ItemDoRateio | null, pct: number = PARTE_PADRAO_PCT): SituacaoDaLinha {
  const parte = linha.valorCheioCent == null ? null : parteCent(linha.valorCheioCent, pct);
  if (!item) {
    return parte == null
      ? { tipo: 'falta', parteCent: null, difCent: null, diferencas: [], frase: 'falta o valor da relação' }
      : { tipo: 'nova', parteCent: parte, difCent: null, diferencas: [], frase: 'cria o item' };
  }
  const diferencas: Diferenca[] = [];
  const dif = parte == null ? null : parte - item.valorCent;
  if (dif != null && dif !== 0) diferencas.push('valor');
  const nf = numeroDaNf(linha.nf);
  if (nf && nf !== numeroDaNf(item.numeroDocumento)) diferencas.push('nf');
  if (linha.fazendaId && !mesmo(linha.fazendaId, item.fazendaId)) diferencas.push('fazenda');
  if (linha.planoContaId && !mesmo(linha.planoContaId, item.planoContaId)) diferencas.push('conta');
  if (parte == null) return { tipo: 'falta', parteCent: null, difCent: null, diferencas, frase: 'falta o valor da relação' };
  if (diferencas.includes('valor') && item.pago) {
    return { tipo: 'travado', parteCent: parte, difCent: dif, diferencas, frase: 'pago: o valor não muda' };
  }
  const gravam = diferencas.filter((d) => d === 'valor' || d === 'nf' || linha.escolha === 'relacao');
  if (!gravam.length) {
    const resto = diferencas.filter((d) => d === 'fazenda' || d === 'conta');
    return { tipo: 'confere', parteCent: parte, difCent: dif, diferencas, frase: resto.length ? `mantém ${resto.join(' e ')} do sistema` : 'confere' };
  }
  return { tipo: 'muda', parteCent: parte, difCent: dif, diferencas, frase: gravam.map(frasesDaDiferenca).join(' · ') };
}

function frasesDaDiferenca(d: Diferenca): string {
  return d === 'valor' ? 'valor' : d === 'nf' ? 'nº da NF' : d === 'fazenda' ? 'fazenda da relação' : 'conta da relação';
}

/**
 * O pedido para o `fn_nota_completar` (a porta que já guarda o antes e desfaz): só os itens com o que gravar e, em cada um, só os campos
 * que mudam. Item pago com valor diferente: o valor NÃO vai (o banco recusaria); o resto vai. Fazenda/conta só com "usar a relação".
 */
export function pedidoDoCompletar(linhas: readonly LinhaDaRelacao[], itens: ReadonlyMap<string, ItemDoRateio>, pct: number = PARTE_PADRAO_PCT): PedidoDoCompletar[] {
  const out: PedidoDoCompletar[] = [];
  for (const l of linhas) {
    const item = l.itemId ? itens.get(l.itemId) : undefined;
    if (!item) continue;
    const s = situacaoDaLinha(l, item, pct);
    if (s.tipo === 'falta') continue;
    const p: PedidoDoCompletar = { id: item.id };
    if (s.diferencas.includes('valor') && !item.pago && s.parteCent != null) p.valor = s.parteCent / 100;
    if (s.diferencas.includes('nf') && l.nf) { p.numero_documento = l.nf.trim(); if (item.tipoDocumento !== 'Nota Fiscal') p.tipo_documento = 'Nota Fiscal'; }
    if (l.escolha === 'relacao') {
      if (s.diferencas.includes('fazenda') && l.fazendaId) p.fazenda_id = l.fazendaId;
      if (s.diferencas.includes('conta') && l.planoContaId) p.plano_conta_id = l.planoContaId;
    }
    if (Object.keys(p).length > 1) out.push(p);
  }
  return out;
}

/** As linhas novas, prontas para o writer do Novo lançamento (valor = a parte). Sem valor, sem fazenda ou sem conta: não vão. */
export interface ItemNovoDoRateio { chave: string; valorCent: number; fazendaId: string; planoContaId: string; descricao: string; vencimento: string; competencia: string; nf: string | null }
export function itensNovos(linhas: readonly LinhaDaRelacao[], pct: number = PARTE_PADRAO_PCT): { prontos: ItemNovoDoRateio[]; incompletos: string[] } {
  const prontos: ItemNovoDoRateio[] = []; const incompletos: string[] = [];
  for (const l of linhas) {
    if (l.itemId) continue;
    if (l.valorCheioCent == null || !l.fazendaId || !l.planoContaId || !l.vencimento || !(l.descricao ?? '').trim()) { incompletos.push(l.chave); continue; }
    prontos.push({ chave: l.chave, valorCent: parteCent(l.valorCheioCent, pct), fazendaId: l.fazendaId, planoContaId: l.planoContaId,
      descricao: (l.descricao ?? '').trim(), vencimento: l.vencimento, competencia: l.competencia ?? l.vencimento, nf: l.nf?.trim() || null });
  }
  return { prontos, incompletos };
}

/** O rodapé: a parte da relação (o que foi conferido), os itens como ficam, o pagamento e a diferença — visível, nunca ajustada. */
export interface ConferenciaDoRateio { relacaoCent: number; conferidas: number; linhas: number; itensCent: number; pagamentoCent: number; difCent: number }
export function conferencia(linhas: readonly LinhaDaRelacao[], itens: ReadonlyMap<string, ItemDoRateio>, pagamentoCent: number, pct: number = PARTE_PADRAO_PCT): ConferenciaDoRateio {
  let relacaoCent = 0; let conferidas = 0; let itensCent = 0;
  for (const l of linhas) {
    const item = l.itemId ? itens.get(l.itemId) : undefined;
    const s = situacaoDaLinha(l, item ?? null, pct);
    if (s.parteCent != null) { relacaoCent += s.parteCent; conferidas++; }
    /* como o item fica depois de gravar: a parte quando o valor muda; o de hoje quando pago (o valor não muda) ou sem conferir */
    if (item) itensCent += s.tipo === 'muda' && s.diferencas.includes('valor') ? (s.parteCent ?? item.valorCent) : item.valorCent;
    else if (s.parteCent != null) itensCent += s.parteCent;
  }
  return { relacaoCent, conferidas, linhas: linhas.length, itensCent, pagamentoCent, difCent: pagamentoCent - itensCent };
}

/** O rótulo antigo do item ("R_D05") a partir da descrição do pagamento ("Rateio D05"); sem rótulo, null. */
export function rotuloDoPagamento(descricao: string | null | undefined): string | null {
  const m = (descricao ?? '').match(/rateio\s+(d\s*\d{1,2}|folha)/i);
  if (!m) return null;
  const r = m[1].replace(/\s+/g, '');
  return /^folha$/i.test(r) ? 'R_Folha' : `R_${r.toUpperCase()}`;
}
