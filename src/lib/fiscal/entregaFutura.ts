/**
 * ENTREGA-FUTURA-LIGAR-01 (Gabriel 19/11 08:55 + 22/11, NJ: o milho do João Rodrigo) — as REMESSAS de entrega futura (5116/5117/6116/6117)
 * não geram pagamento, mas são da compra: "Ligar à compra" guarda a NF (XML + DANFE) nos documentos dos lançamentos da compra, SEM criar
 * lançamento e SEM mudar valor (R2). O confronto do banco (lote 30) já não soma a remessa no "Documentado" — ela é informativa.
 * Aqui: quais remessas vão juntas, quais lançamentos são "a compra", o quanto já foi entregue (R$, kg e sacas de 60 kg dos grãos).
 */
import type { NotaNaLista } from '@/lib/fiscal/notasDaReceita';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';

export const ehRemessaDeEntregaFutura = (n: Pick<NotaNaLista, 'classe'>): boolean =>
  n.classe.classe === 'nao_financeira' && n.classe.motivo === 'entrega_futura';

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** as remessas que vão junto com `n`: do MESMO emitente e que citam o MESMO faturamento (ou nenhum, quando `n` não cita), na ordem da emissão */
export function remessasDaMesmaCompra(lista: readonly NotaNaLista[], n: NotaNaLista): NotaNaLista[] {
  const doc = soDigitos(n.emitenteDocumento);
  const cita = [...n.citadas].sort().join('|');
  return lista
    .filter((x) => ehRemessaDeEntregaFutura(x) && soDigitos(x.emitenteDocumento) === doc && [...x.citadas].sort().join('|') === cita)
    .sort((a, b) => (a.emissao ?? '').localeCompare(b.emissao ?? '') || a.numero.localeCompare(b.numero));
}

/** a descrição sem o "n/N" das parcelas ("Compra 10.000 sc milho 1/3" → "compra 10.000 sc milho"): a chave do grupo da compra */
export const descricaoDoGrupo = (d: string | null): string => (d ?? '').replace(/\s*\(?\d+\s*\/\s*\d+\)?\s*$/, '').trim().toLowerCase();

export interface GrupoDaCompra { chave: string; rotulo: string; ids: string[]; totalCent: number }

/** os lançamentos de SAÍDA do mesmo CPF/CNPJ agrupados pela descrição sem o "n/N" (o grupo de 1 só também entra: compra à vista) */
export function gruposDaCompra(lancs: readonly LancamentoJaLancado[]): GrupoDaCompra[] {
  const m = new Map<string, GrupoDaCompra>();
  for (const l of lancs) {
    const k = descricaoDoGrupo(l.descricao);
    if (!k) continue;
    const g = m.get(k) ?? { chave: k, rotulo: (l.descricao ?? '').replace(/\s*\(?\d+\s*\/\s*\d+\)?\s*$/, '').trim(), ids: [], totalCent: 0 };
    g.ids.push(l.id);
    g.totalCent += l.valorCent;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.totalCent - a.totalCent);
}

/** o grupo que se marca sozinho: o ÚNICO que cobre as remessas (total ≥ o entregue); nenhum ou vários = o operador escolhe */
export function grupoSugerido(grupos: readonly GrupoDaCompra[], entregueCent: number): GrupoDaCompra | null {
  const cabem = grupos.filter((g) => g.ids.length > 1 && g.totalCent >= entregueCent);
  return cabem.length === 1 ? cabem[0] : null;
}

/** a quantidade da remessa pelos itens do XML: só soma unidade de PESO (kg/t) e SACA; o resto não vira sacas */
export interface QuantidadeDaRemessa { kg: number | null; sacas: number | null }
export function quantidadeDosItens(itens: readonly { quantidade: string; unidade: string }[]): QuantidadeDaRemessa {
  let kg = 0; let sacas = 0; let deu = false;
  for (const i of itens) {
    const q = Number(String(i.quantidade).replace(',', '.'));
    if (!Number.isFinite(q)) continue;
    const u = i.unidade.trim().toUpperCase();
    if (u === 'KG' || u === 'KGS' || u === 'QUILO') { kg += q; deu = true; }
    else if (u === 'T' || u === 'TON' || u === 'TONELADA') { kg += q * 1000; deu = true; }
    else if (u === 'SC' || u === 'SACA' || u === 'SACAS' || u === 'SC60') { sacas += q; deu = true; }
    else return { kg: null, sacas: null };
  }
  if (!deu) return { kg: null, sacas: null };
  const total = kg + sacas * 60;
  return { kg: total, sacas: total / 60 };
}

export interface EntregaDaCompra { entregueCent: number; compraCent: number; faltaCent: number; pct: number; kg: number | null; sacas: number | null }
/** "Entregue R$ X de Y · P% · falta Z" (+ kg e sacas quando TODAS as remessas trazem peso/saca) */
export function entregaDaCompra(remessas: readonly { valorCent: number | null; qtd: QuantidadeDaRemessa | null }[], compraCent: number): EntregaDaCompra {
  const entregueCent = remessas.reduce((s, r) => s + (r.valorCent ?? 0), 0);
  const comPeso = remessas.length > 0 && remessas.every((r) => r.qtd?.kg != null);
  const kg = comPeso ? remessas.reduce((s, r) => s + (r.qtd?.kg ?? 0), 0) : null;
  return {
    entregueCent, compraCent, faltaCent: Math.max(0, compraCent - entregueCent),
    pct: compraCent > 0 ? Math.round((entregueCent / compraCent) * 100) : 0,
    kg, sacas: kg == null ? null : kg / 60,
  };
}
