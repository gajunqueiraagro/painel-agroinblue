/**
 * CARTAO-FATURA-IMPORT-01 (mock aprovado 23/11 13:38, vista 1) — o que a prévia da fatura LÊ do sistema, em funções PURAS:
 *  · a JANELA dos lançamentos que podem ser estas compras (`janelaDaFatura`: o vencimento −60 dias até +40, a mesma base da prévia de 13/11);
 *  · a linha do banco → `LancamentoNoCartao` (`lancamentoDoBanco`: só saída, centavos inteiros, o nome do fornecedor pelo leitor único; a
 *    parcela COM ELO = `financiamento_id` + o "k/N" da descrição — no proto 23/11, nos cartões: 232 com elo e k/N, 79 k/N sem elo = soltas);
 *  · as PALAVRAS para buscar o histórico (`termosDoHistorico`: as do estabelecimento das linhas a lançar, sem repetir, no máx. 40);
 *  · a SUGESTÃO de classificação (`sugestaoPeloHistorico`): nos últimos 12 meses, os lançamentos com a 1ª PALAVRA do estabelecimento (a
 *    palavra comum — cidade, "exemplo", "comercio" — sozinha não basta); entre eles, os que dividem MAIS palavras; a conta do plano com a
 *    MAIORIA ESTRITA desses; histórico misto (o "Mercado Livre" do NJ) = sem sugestão ("Nova · classificar"). Nada grava.
 */
import { palavrasDoEstabelecimento, parcelaDaDescricao, type LancamentoNoCartao } from './linhasDaFatura';
import type { FaturaLida, LinhaDaFatura } from './lerFaturaOurocard';
import type { Sugestao } from './gruposDaFatura';

export const DIAS_ANTES_DO_VENCIMENTO = 60;
export const DIAS_DEPOIS_DO_VENCIMENTO = 40;
export const MAX_TERMOS = 40;

const somarDias = (iso: string, d: number) => {
  const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10);
};

/** de/até dos lançamentos a comparar (pelo vencimento); fatura sem vencimento lido = nada a comparar */
export function janelaDaFatura(f: Pick<FaturaLida, 'vencimento'>): { de: string; ate: string; historicoDe: string } | null {
  if (!f.vencimento) return null;
  return { de: somarDias(f.vencimento, -DIAS_ANTES_DO_VENCIMENTO), ate: somarDias(f.vencimento, DIAS_DEPOIS_DO_VENCIMENTO), historicoDe: somarDias(f.vencimento, -365) };
}

export interface LinhaDoBanco {
  id: string; conta_bancaria_id: string | null; data_vencimento: string | null; data_competencia: string | null; valor: number | string | null;
  descricao: string | null; favorecido_id: string | null; status_transacao: string | null; tipo_operacao: string | null; plano_conta_id?: string | null;
  financiamento_id?: string | null;
}

/** só SAÍDA vira candidato (a fatura lista compras); o valor em centavos inteiros (positivo) */
export function lancamentoDoBanco(r: LinhaDoBanco, nomeDoFornecedor: (id: string) => string | null): LancamentoNoCartao | null {
  if (!r.conta_bancaria_id || !(r.tipo_operacao ?? '').startsWith('2')) return null;
  const v = Number(r.valor);
  if (!Number.isFinite(v)) return null;
  return {
    id: r.id, contaId: r.conta_bancaria_id, vencimento: r.data_vencimento, competencia: r.data_competencia, valorCent: Math.round(Math.abs(v) * 100),
    descricao: r.descricao ?? '', fornecedor: r.favorecido_id ? nomeDoFornecedor(r.favorecido_id) : null,
    parcela: r.financiamento_id ? parcelaDaDescricao(r.descricao ?? '') : null, status: r.status_transacao ?? '',
  };
}

/** as palavras do estabelecimento das linhas que podem precisar de sugestão (compra, IOF, anuidade), uma vez cada */
export function termosDoHistorico(linhas: readonly LinhaDaFatura[]): string[] {
  const out: string[] = [];
  for (const l of linhas) {
    if (l.tipo === 'pagamento' || l.tipo === 'credito' || l.tipo === 'desconto_anuidade') continue;
    for (const p of palavrasDoEstabelecimento(l.descricao)) {
      if (!out.includes(p)) out.push(p);
      if (out.length >= MAX_TERMOS) return out;
    }
  }
  return out;
}

export interface CasoDoHistorico { descricao: string; fornecedor: string | null; planoContaId: string }

/** a palavra casa: igual, ou as 5 primeiras letras (a mesma régua do `mesmoEstabelecimento`) */
const casaPalavra = (p: string, q: string) => p === q || (p.length >= 5 && q.startsWith(p.slice(0, 5)));

/** a conta do plano com a MAIORIA ESTRITA dos lançamentos do mesmo estabelecimento (a 1ª palavra + o maior número de palavras); empate ou misto = nada */
export function sugestaoPeloHistorico(historico: readonly CasoDoHistorico[], rotuloDe: (planoContaId: string) => string | null) {
  const palavras = historico.map((h) => [...new Set([...palavrasDoEstabelecimento(h.fornecedor), ...palavrasDoEstabelecimento(h.descricao)])]);
  return (l: LinhaDaFatura): Sugestao | null => {
    const daFatura = palavrasDoEstabelecimento(l.descricao);
    if (daFatura.length === 0) return null;
    let maior = 0;
    const iguais: number[] = [];
    historico.forEach((_, i) => {
      const dele = palavras[i];
      if (!dele.some((q) => casaPalavra(daFatura[0], q))) return;
      const n = daFatura.filter((p) => dele.some((q) => casaPalavra(p, q))).length;
      if (n > maior) { maior = n; iguais.length = 0; }
      if (n === maior) iguais.push(i);
    });
    const conta = new Map<string, number>();
    for (const i of iguais) conta.set(historico[i].planoContaId, (conta.get(historico[i].planoContaId) ?? 0) + 1);
    let melhor: [string, number] | null = null;
    for (const par of conta) if (!melhor || par[1] > melhor[1]) melhor = par;
    if (!melhor || melhor[1] * 2 <= iguais.length) return null;
    const rotulo = rotuloDe(melhor[0]);
    return rotulo ? { planoContaId: melhor[0], rotulo } : null;
  };
}
