/**
 * CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36) — a SELEÇÃO das "Sugestões para casar" e do "Procurar no histórico": as caixinhas das duas
 * listas somam juntas, e o rodapé diz "Selecionados N · soma · extrato · diferença" em colunas. "Casar selecionados" abre o "Casar com o
 * banco" de hoje com todos levados (é ele que ajusta um ou mais para bater com o extrato). Aqui só a conta do rodapé e o motivo curto.
 */
import type { Sugestao } from '@/lib/conciliacao/sugestoesCasamento';

/** O rodapé: quantos, a soma assinada, o extrato e a diferença (soma − extrato, a mesma conta do `CasarComBancoModal`). */
export function resumoDaSelecao(valores: readonly number[], valorDoExtrato: number) {
  const soma = Math.round(valores.reduce((t, v) => t + v, 0) * 100) / 100;
  return { n: valores.length, soma, extrato: valorDoExtrato, diferenca: Math.round((soma - valorDoExtrato) * 100) / 100 };
}

/** O MOTIVO CURTO da coluna (o inteiro vai no `title`): "mesmo valor · nome", "soma de 2", "mesmo forn. · valor ≠". */
export function motivoCurto(s: Pick<Sugestao, 'tipo' | 'lancamentos'>): string {
  const n = s.lancamentos.length;
  switch (s.tipo) {
    case 'mesmo_valor_nome': return 'mesmo valor · nome';
    case 'mesmo_valor': return 'mesmo valor';
    case 'soma': return `soma de ${n}`;
    case 'mesmo_fornecedor': return 'mesmo forn. · valor ≠';
    case 'nome_valor': return 'nome · valor ≠';
    case 'nome_soma': return `nome · soma de ${n}`;
    case 'soma_mista': return `soma de ${n} · vários`;
    default: return '';
  }
}
