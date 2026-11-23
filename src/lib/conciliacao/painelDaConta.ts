/**
 * CONC-PAINEL-CONTA-01 (fatia 1, decisão do Gabriel 17/11 09:57) e CONC-PAINEL-02 (mock aprovado 23/11 08:11) — as REGRAS do painel
 * da conta no mês. Puras.
 * ⚠ NADA SE RECALCULA: os passos leem o DONO (`fn_conciliacao_resumo_mes`, a linha da conta + `saldosDaLinha`) — extrato, sem par,
 *   saldos e diferença. O painel só os arruma em passos, POR TIPO DE CONTA (CONC-PAINEL-02 item 2), e LEVA às peças que já existem.
 */
import type { LinhaResumo, ProprioDono } from '@/lib/conciliacao/resumoDoDono';
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';

export type EstadoDoPasso = 'ok' | 'pendente' | 'espera';

/** A FONTE da conta (D3 do v1, derivada — nada gravado): ligada ao Open Finance → "Open Finance"; senão o tipo do último arquivo;
 *  senão "sem extrato". `rotulo` é o selo; `detalhe` a frase do cabeçalho do painel. */
export interface FonteDaConta { tipo: 'open_finance' | 'arquivo' | 'sem_extrato'; rotulo: string; detalhe: string }
export interface UltimaImportacao { tipo_arquivo: string | null; saldo_declarado_data: string | null; data_importacao: string | null }

export const ddmmaaaa = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
export const moeda = (v: number | null | undefined): string =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fonteDaConta(ligadaAoOpenFinance: boolean, ultima: UltimaImportacao | null): FonteDaConta {
  if (ligadaAoOpenFinance) return { tipo: 'open_finance', rotulo: 'Open Finance', detalhe: 'Open Finance · ligada ao banco' };
  if (ultima) {
    const bruto = (ultima.tipo_arquivo ?? '').trim();
    const tipo = bruto.toUpperCase() === 'OPEN_FINANCE' ? 'Open Finance' : bruto ? bruto.toUpperCase() : 'Arquivo';
    const ate = ultima.saldo_declarado_data ? ` até ${ddmmaaaa(ultima.saldo_declarado_data)}` : '';
    return { tipo: 'arquivo', rotulo: `${tipo}${ate}`, detalhe: `${tipo} · último arquivo${ate}` };
  }
  return { tipo: 'sem_extrato', rotulo: 'sem extrato', detalhe: 'sem extrato do banco importado' };
}

/* ─── CONC-PAINEL-02: os passos POR TIPO de conta ─── */

export type TipoDoPainel = 'corrente' | 'investimento' | 'cartao';
/** O tipo do cadastro (`tipo_conta`: cc, inv, cartao…) → o jeito de fechar o mês. O desconhecido fecha como conta corrente. */
export function tipoDoPainel(tipoConta: string | null | undefined): TipoDoPainel {
  const t = (tipoConta ?? '').trim().toLowerCase();
  if (t === 'inv' || t.startsWith('invest') || t === 'aplicacao' || t === 'poupanca') return 'investimento';
  if (t === 'cartao' || t.startsWith('cart')) return 'cartao';
  return 'corrente';
}
export const ROTULO_DO_TIPO: Readonly<Record<TipoDoPainel, { nome: string; frase: string }>> = {
  corrente: { nome: 'Conta corrente', frase: 'extrato OFX ou PDF' },
  investimento: { nome: 'Investimento', frase: 'sem OFX: o saldo vem do PDF do banco' },
  cartao: { nome: 'Cartão de crédito', frase: 'a fatura é o extrato' },
};

export type IdDoPasso = 'extrato' | 'casar' | 'saldo' | 'movimentos' | 'diferenca' | 'fatura' | 'compras' | 'pagamento';
export interface PassoDoPainel {
  id: IdDoPasso;
  n: 1 | 2 | 3;
  titulo: string;
  frase: string;
  /** o número da coluna da direita do passo (sempre texto pronto: "—" quando não há) */
  valor: string;
  negativo: boolean;
  estado: EstadoDoPasso;
}

type LinhaDoPasso = Pick<LinhaResumo, 'tem_extrato' | 'saldo_extrato_data' | 'extratos_sem_par' | 'lancamentos_sem_par' | 'entradas' | 'saidas' | 'saidas_terceiros'>;
type SaldosDoPasso = Pick<ProprioDono, 'saldo_extrato' | 'saldo_sistema' | 'diferenca'>;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Os 3 passos do mês da conta, pelo DONO, no jeito do tipo (o mock: corrente = extrato → casar → saldo; investimento = saldo →
 *  movimentos → explicar a diferença; cartão = fatura → compras → pagamento). `arquivos` = quantos `arquivosDoMes` a conta tem. */
export function passosDoPainel(tipo: TipoDoPainel, linha: LinhaDoPasso | null, saldos: SaldosDoPasso, p: { arquivos: number; fonte: FonteDaConta }): PassoDoPainel[] {
  const temExtrato = !!linha?.tem_extrato;
  const soBanco = linha?.extratos_sem_par.qtde ?? 0;
  const soSistema = linha?.lancamentos_sem_par.qtde ?? 0;
  const dif = saldos.diferenca;
  const informado = saldos.saldo_extrato != null;
  const saldoOk = informado && dif != null && saldoConfere(dif);
  const nArq = p.arquivos > 0 ? plural(p.arquivos, 'arquivo', 'arquivos') : '—';
  const passoDif = (id: IdDoPasso, n: 1 | 2 | 3, titulo: string, fraseOk: string, frasePend: string): PassoDoPainel => ({
    id, n, titulo, valor: moeda(dif), negativo: dif != null && dif < 0 && !saldoOk,
    estado: !informado ? 'espera' : saldoOk ? 'ok' : 'pendente',
    frase: !informado ? 'depois do saldo do banco' : saldoOk ? fraseOk : frasePend,
  });

  if (tipo === 'investimento') {
    const mov = (linha?.entradas ?? 0) - (linha?.saidas ?? 0);
    return [
      { id: 'saldo', n: 1, titulo: 'Saldo do banco', valor: moeda(saldos.saldo_extrato), negativo: false, estado: informado ? 'ok' : 'pendente',
        frase: informado ? `informado${linha?.saldo_extrato_data ? ` em ${ddmmaaaa(linha.saldo_extrato_data)}` : ''}` : 'anexe o PDF do banco e informe o saldo' },
      { id: 'movimentos', n: 2, titulo: 'Movimentos do mês', valor: moeda(mov), negativo: mov < 0, estado: 'ok',
        frase: `entradas ${moeda(linha?.entradas ?? 0)} · saídas ${moeda(linha?.saidas ?? 0)}` },
      passoDif('diferenca', 3, 'Explicar a diferença', 'saldo do sistema = saldo do banco', 'rendimento, taxa ou IR do mês?'),
    ];
  }
  if (tipo === 'cartao') {
    const temFatura = p.arquivos > 0 || temExtrato;
    return [
      { id: 'fatura', n: 1, titulo: 'Fatura', valor: nArq, negativo: false, estado: temFatura ? 'ok' : 'pendente',
        frase: temFatura ? 'fatura do mês no sistema' : 'anexe o PDF da fatura' },
      { id: 'compras', n: 2, titulo: 'Compras da fatura', valor: moeda(linha?.saidas_terceiros ?? 0), negativo: false, estado: 'ok',
        frase: 'as compras lançadas no mês' },
      passoDif('pagamento', 3, 'Pagamento da fatura', 'o saldo do cartão confere', 'a fatura e o sistema não fecham'),
    ];
  }
  return [
    { id: 'extrato', n: 1, titulo: 'Extrato', valor: nArq, negativo: false, estado: temExtrato ? 'ok' : 'pendente',
      frase: temExtrato ? `extrato do mês até ${ddmmaaaa(linha?.saldo_extrato_data)}`
        : p.fonte.tipo === 'open_finance' ? 'busque o extrato no banco' : 'importe o OFX ou o PDF do banco' },
    { id: 'casar', n: 2, titulo: 'Casar lançamentos', valor: temExtrato ? String(soBanco + soSistema) : '—', negativo: false,
      estado: !temExtrato ? 'espera' : soBanco + soSistema === 0 ? 'ok' : 'pendente',
      frase: !temExtrato ? 'depois do extrato' : `${soBanco} só no banco · ${soSistema} só no sistema` },
    { id: 'saldo', n: 3, titulo: 'Saldo do banco', valor: moeda(saldos.saldo_extrato), negativo: false,
      estado: saldoOk ? 'ok' : informado ? 'pendente' : 'pendente',
      frase: !informado ? (p.fonte.tipo === 'open_finance' ? 'o banco ainda não informou' : 'informe o saldo, com o comprovante')
        : saldoOk ? 'confere com o sistema' : `diferença de ${moeda(dif)}` },
  ];
}

/** O passo que o painel abre: o 1º pendente; tudo verde, o último. */
export function passoInicial(passos: readonly PassoDoPainel[]): IdDoPasso {
  return (passos.find((x) => x.estado === 'pendente') ?? passos[passos.length - 1]).id;
}

/** O selo do cabeçalho (o mock): "✓ conciliado" ou "✕ N passos pendentes" (o que espera também falta). */
export function seloDosPassos(passos: readonly PassoDoPainel[]): { ok: boolean; texto: string } {
  const n = passos.filter((x) => x.estado !== 'ok').length;
  return n === 0 ? { ok: true, texto: '✓ conciliado' } : { ok: false, texto: `✕ ${n} ${n === 1 ? 'passo pendente' : 'passos pendentes'}` };
}

/** O rodapé "← anterior · Próxima pendente →": as contas NÃO conciliadas na ordem da tela, em volta da atual (circular). */
export function vizinhasPendentes(ordem: readonly { id: string; pendente: boolean }[], atual: string): {
  anterior: string | null; proxima: string | null; posicao: number | null; total: number;
} {
  const pend = ordem.filter((c) => c.pendente).map((c) => c.id);
  const total = pend.length;
  const i = pend.indexOf(atual);
  const outras = pend.filter((id) => id !== atual);
  if (outras.length === 0) return { anterior: null, proxima: null, posicao: i >= 0 ? 1 : null, total };
  if (i >= 0) return { anterior: pend[(i - 1 + total) % total], proxima: pend[(i + 1) % total], posicao: i + 1, total };
  /* a atual já fechou (ou não estava pendente): a próxima é a 1ª pendente depois dela na ordem da tela */
  const ids = ordem.map((c) => c.id);
  const k = ids.indexOf(atual);
  const depois = ids.slice(k + 1).concat(ids.slice(0, Math.max(0, k))).filter((id) => pend.includes(id));
  return { anterior: depois[depois.length - 1] ?? null, proxima: depois[0] ?? null, posicao: null, total };
}

/* ─── "Explicar a diferença": 1º o lançamento que JÁ EXISTE com o valor exato (Gabriel 23/11) ─── */

export interface LancamentoCandidato {
  id: string;
  descricao: string | null;
  valor: number;
  tipo_operacao: string | null;
  status_transacao: string | null;
  conta_bancaria_id: string | null;
  data_pagamento: string | null;
  data_vencimento: string | null;
}

/** Os lançamentos que explicam a diferença EXATA (meio centavo, a tolerância da Conciliação): o sentido certo (o banco tem MENOS que
 *  o sistema = falta uma SAÍDA; MAIS = falta uma ENTRADA), sem conta ou nesta conta, e que ainda NÃO contam no saldo do mês desta conta
 *  (o realizado nesta conta até o fim do mês já está no "sistema"). Os mais perto do fim do mês primeiro. */
export function candidatosDaDiferenca(linhas: readonly LancamentoCandidato[], p: { diferenca: number; contaId: string; anoMes: string }): LancamentoCandidato[] {
  if (Math.abs(p.diferenca) < 0.005) return [];
  const alvo = Math.abs(p.diferenca);
  const sentido = p.diferenca < 0 ? '2-' : '1-';
  const fim = fimDoMes(p.anoMes);
  const dataDe = (l: LancamentoCandidato) => l.data_pagamento ?? l.data_vencimento ?? '';
  const distancia = (l: LancamentoCandidato) => Math.abs(Date.parse(`${dataDe(l) || fim}T00:00:00Z`) - Date.parse(`${fim}T00:00:00Z`));
  return linhas
    .filter((l) => Math.abs(Math.abs(l.valor) - alvo) < 0.005)
    .filter((l) => (l.tipo_operacao ?? '').startsWith(sentido))
    .filter((l) => l.conta_bancaria_id == null || l.conta_bancaria_id === p.contaId)
    .filter((l) => !(l.conta_bancaria_id === p.contaId && l.status_transacao === 'realizado' && (l.data_pagamento ?? '9999') <= fim))
    .slice()
    .sort((a, b) => distancia(a) - distancia(b));
}

/** O último dia do mês (YYYY-MM-DD). */
export function fimDoMes(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}
