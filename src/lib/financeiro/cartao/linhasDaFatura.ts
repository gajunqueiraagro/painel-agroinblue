/**
 * CARTAO-FATURA-IMPORT-01 — a PRÉVIA da fatura: cada linha lida (lerFaturaOurocard) contra o que JÁ ESTÁ no sistema nos cartões do
 * titular. Função pura: nada grava. Um a um: o lançamento que casa sai do páreo.
 * AS REGRAS (pedido do Gabriel 12/11 + aviso do Code 5):
 *  - pagamento da fatura = TRANSFERÊNCIA: fica fora (nunca vira saída);
 *  - anuidade + desconto da anuidade: mostrados como PAR (soma zero), nada a lançar;
 *  - "PARC k/N": casa com a parcela k/N já lançada (mesmo valor + mesmo k/N + estabelecimento OU competência = data da compra); NUNCA
 *    pelo vencimento (a linha traz a data da COMPRA e a parcela mora no VENCIMENTO); parcela solta vale pelo "k/N" no fim da descrição. Mesmo estabelecimento com outro k ou outro valor = "parcela com diferença" (nada se cria);
 *    Parcela lançada SOLTA sem k/N: o mesmo valor + o vencimento desta fatura OU a competência = a data da compra;
 *  - compra: já lançada = mesmo valor ao centavo + data da compra até 3 dias (em QUALQUER conta do cliente: o cartão errado e a conta
 *    corrente pegam compra do cartão lançada como boleto); 1 centavo de diferença ou outra conta/outro vencimento = "já lançado com
 *    diferença" (dito, nunca corrigido aqui);
 *  - o que sobra = "lança" (saída no cartão, forma Cartão de crédito, vencimento da fatura).
 *  - CARTAO-FATURA-GRAVAR (25/11, achado no caso real do NJ): 2ª PASSADA, só para a compra à vista que sobrou — o lançamento JÁ NESTA FATURA
 *    (o mesmo cartão e o vencimento dela) com o mesmo valor ao centavo é o já lançado, qualquer que seja a competência: a recorrência
 *    prevista (competência no dia 1º; a "Internet" do NJ) e a compra lançada com outra data. Sem ela o Gravar lançava de novo (duplicata).
 *    É a regra da parcela solta ("o mesmo valor + o vencimento desta fatura") estendida à compra à vista; vem DEPOIS de todas as outras.
 */
import { normalizarParaBusca } from '@/lib/texto/busca';
import type { FaturaLida, LinhaDaFatura } from './lerFaturaOurocard';

export interface LancamentoNoCartao {
  id: string; contaId: string; vencimento: string | null; competencia: string | null; valorCent: number; descricao: string;
  fornecedor: string | null; parcela: { k: number; n: number } | null; status: string;
  /** CARTAO-FATURA-GRAVAR: o `updated_at` lido (a string do banco) — vai como `lido_em` no mover/ajustar ("mudou desde a leitura") */
  atualizadoEm?: string | null;
}

export type Decisao = 'transferencia' | 'anuidade_par' | 'ja_lancado' | 'ja_lancado_diferenca' | 'parcela' | 'parcela_diferenca' | 'lanca';
export interface LinhaDaPrevia { linha: LinhaDaFatura; decisao: Decisao; existente: LancamentoNoCartao | null; diferencas: string[] }
export interface PreviaDaFatura { linhas: LinhaDaPrevia[]; totais: Record<Decisao, { n: number; cent: number }> }

const VAZIAS = new Set(['comercio', 'com', 'ltda', 'mercadolivre', 'mercadoli', 'mercadoliv', 'mercadolivo', 'campo', 'grande', 'paulo', 'osasco', 'parc']);
/** As palavras que identificam o estabelecimento (4+ letras, sem acento, sem cidade/genéricas). */
export function palavrasDoEstabelecimento(s: string | null | undefined): string[] {
  return normalizarParaBusca(s ?? '').split(/[^a-z0-9]+/).filter(p => p.length >= 4 && !VAZIAS.has(p) && !/^\d+$/.test(p));
}
export function mesmoEstabelecimento(daFatura: string, ex: LancamentoNoCartao): boolean {
  const a = palavrasDoEstabelecimento(daFatura);
  const b = new Set([...palavrasDoEstabelecimento(ex.fornecedor), ...palavrasDoEstabelecimento(ex.descricao)]);
  return a.some(p => b.has(p) || [...b].some(q => q.startsWith(p.slice(0, 5)) && p.length >= 5));
}
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
/** Parcela sem elo com o parcelamento (lançada solta, P104): o "k/N" no fim da descrição. */
export function parcelaDaDescricao(descricao: string): { k: number; n: number } | null {
  const m = /(?:^|\s)(\d{1,2})\/(\d{1,2})\s*$/.exec(descricao.trim());
  if (!m) return null;
  const k = Number(m[1]); const n = Number(m[2]);
  return k >= 1 && n >= 2 && k <= n ? { k, n } : null;
}
const parcelaDe = (e: LancamentoNoCartao) => e.parcela ?? parcelaDaDescricao(e.descricao);
/** A mesma compra: o estabelecimento parecido OU a competência da parcela = a data da compra (o parcelado do cartão nasce com ela). */
const mesmaCompra = (l: LinhaDaFatura, e: LancamentoNoCartao) => mesmoEstabelecimento(l.descricao, e) || e.competencia === l.dataCompra;

export function linhasDaFatura(f: FaturaLida, contaDaFatura: string, existentes: readonly LancamentoNoCartao[]): PreviaDaFatura {
  const usados = new Set<string>();
  const livres = () => existentes.filter(e => !usados.has(e.id));
  const out: LinhaDaPrevia[] = [];

  for (const l of f.linhas) {
    if (l.tipo === 'pagamento' || l.tipo === 'credito') { out.push({ linha: l, decisao: 'transferencia', existente: null, diferencas: [] }); continue; }
    if (l.tipo === 'anuidade' || l.tipo === 'desconto_anuidade') { out.push({ linha: l, decisao: 'anuidade_par', existente: null, diferencas: [] }); continue; }

    if (l.parcela) {
      const p = l.parcela;
      const exata = livres().find(e => { const q = parcelaDe(e); return q != null && q.k === p.k && q.n === p.n && e.valorCent === l.valorCent && mesmaCompra(l, e); });
      if (exata) {
        usados.add(exata.id);
        const d: string[] = [];
        if (!exata.parcela) d.push('parcela solta (sem elo com o parcelamento)');
        if (exata.contaId !== contaDaFatura) d.push('outra conta');
        if (exata.vencimento !== f.vencimento) d.push(`vencimento ${exata.vencimento ?? '—'}`);
        out.push({ linha: l, decisao: d.length ? 'parcela_diferenca' : 'parcela', existente: exata, diferencas: d });
        continue;
      }
      /* o mesmo estabelecimento e a mesma parcela, mas outro valor; ou o mesmo valor com outro k */
      const quase = livres().filter(e => { const q = parcelaDe(e); return mesmaCompra(l, e) && ((q?.k === p.k && q?.n === p.n) || (e.valorCent === l.valorCent && q?.n === p.n)); })
        .sort((a, b) => Number(b.vencimento === f.vencimento) - Number(a.vencimento === f.vencimento)
          || Math.abs((parcelaDe(a)?.k ?? 99) - p.k) - Math.abs((parcelaDe(b)?.k ?? 99) - p.k))[0];
      if (quase) {
        usados.add(quase.id);
        const d: string[] = [];
        const q = parcelaDe(quase);
        if (quase.valorCent !== l.valorCent) d.push(`valor ${quase.valorCent}`);
        if (!q) d.push('sem k/N no sistema');
        else if (q.k !== p.k || q.n !== p.n) d.push(`parcela ${q.k}/${q.n}`);
        if (quase.contaId !== contaDaFatura) d.push('outra conta');
        if (quase.vencimento !== f.vencimento) d.push(`vencimento ${quase.vencimento ?? '—'}`);
        out.push({ linha: l, decisao: 'parcela_diferenca', existente: quase, diferencas: d });
        continue;
      }
      /* a parcela lançada SOLTA, sem k/N (ex.: "Parcela 4 - hilux", "-"): o mesmo valor ao centavo E o vencimento desta fatura OU a
         competência = a data da compra (nunca uma janela de dias) */
      const solta = livres().filter(e => !parcelaDe(e) && e.valorCent === l.valorCent && (e.vencimento === f.vencimento || e.competencia === l.dataCompra))
        .sort((a, b) => Number(b.contaId === contaDaFatura) - Number(a.contaId === contaDaFatura))[0];
      if (solta) {
        usados.add(solta.id);
        const d = ['sem k/N no sistema'];
        if (solta.contaId !== contaDaFatura) d.push('outra conta');
        if (solta.vencimento !== f.vencimento) d.push(`vencimento ${solta.vencimento ?? '—'}`);
        out.push({ linha: l, decisao: 'parcela_diferenca', existente: solta, diferencas: d });
        continue;
      }
      out.push({ linha: l, decisao: 'lanca', existente: null, diferencas: [] });
      continue;
    }

    /* compra à vista (ou IOF): mesmo valor e a data da compra perto, em qualquer cartão do titular */
    const perto = (e: LancamentoNoCartao, tol: number) => Math.abs(e.valorCent - l.valorCent) <= tol && !parcelaDe(e)
      && e.competencia != null && dias(e.competencia, l.dataCompra) <= 3;
    const cand = livres().filter(e => perto(e, 0)).sort((a, b) => Number(b.contaId === contaDaFatura) - Number(a.contaId === contaDaFatura))[0]
      ?? livres().filter(e => perto(e, 1))[0];
    if (cand) {
      usados.add(cand.id);
      const d: string[] = [];
      if (cand.valorCent !== l.valorCent) d.push(`valor ${cand.valorCent} (1 centavo)`);
      if (cand.contaId !== contaDaFatura) d.push('outra conta');
      if (cand.vencimento !== f.vencimento) d.push(`vencimento ${cand.vencimento ?? '—'}`);
      out.push({ linha: l, decisao: d.length ? 'ja_lancado_diferenca' : 'ja_lancado', existente: cand, diferencas: d });
      continue;
    }
    out.push({ linha: l, decisao: 'lanca', existente: null, diferencas: [] });
  }

  /* 2ª passada: a compra à vista que sobrou × o que já está NESTA fatura (mesmo cartão, mesmo vencimento, mesmo valor) */
  for (const x of out) {
    if (x.decisao !== 'lanca' || x.linha.parcela || x.linha.tipo !== 'compra') continue;
    const naFatura = livres().find(e => e.contaId === contaDaFatura && e.vencimento === f.vencimento && e.valorCent === x.linha.valorCent && !parcelaDe(e));
    if (naFatura) { usados.add(naFatura.id); x.decisao = 'ja_lancado'; x.existente = naFatura; }
  }

  const zero = () => ({ n: 0, cent: 0 });
  const totais: Record<Decisao, { n: number; cent: number }> = { transferencia: zero(), anuidade_par: zero(), ja_lancado: zero(),
    ja_lancado_diferenca: zero(), parcela: zero(), parcela_diferenca: zero(), lanca: zero() };
  for (const x of out) { totais[x.decisao].n += 1; totais[x.decisao].cent += x.linha.valorCent; }
  return { linhas: out, totais };
}
