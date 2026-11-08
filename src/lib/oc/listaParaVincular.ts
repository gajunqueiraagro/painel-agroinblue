/**
 * OC-BUSCAR-RECEBIMENTO-01 (Gabriel 07/11 08:31, print da OC de abate da PUR de 22/10) — QUAIS recebimentos o "+ Buscar recebimento no
 * Financeiro" mostra e EM QUE ORDEM. PURO: a lista vem inteira da `oc_recebimentos_do_financeiro` (a regra do banco de sempre, com o motivo
 * de cada excluído); aqui só se escolhe o que aparece.
 *   1. o já ligado a OUTRA operação comercial sai ("ver também os já vinculados", desligado por padrão);
 *   2. só a JANELA da OC (30 dias antes a 60 depois da data dela) — os antigos só com "procurar em todo o histórico";
 *   3. o mais provável primeiro: do frigorífico/comprador da OC, valor IGUAL ao saldo, depois o valor mais perto; depois o resto pela
 *      data mais perto da OC. O excluído que fica (o já desta OC, o de conta que não é de gado…) vai depois dos vinculáveis.
 * ⚠ No caso real (06/11): 104 recebimentos do frigorífico desde 2021, 29 ligados a outras OCs, 73 livres e TODOS fora da janela — a
 *   lista abria com 104 linhas de 2021 em diante; agora abre vazia e diz quantos antigos há.
 */
import type { RecebimentoVinculavel } from '@/hooks/useOcContaCorrente';

export const DIAS_ANTES_DA_OC = 30;
export const DIAS_DEPOIS_DA_OC = 60;
/** O motivo que a `oc_recebimentos_do_financeiro` escreve no ligado a outra OC (o mesmo texto do banco). */
export const MOTIVO_OUTRA_OC = 'ligado a outra operação comercial';

/** A data que conta do lançamento: o pagamento; sem ele, o vencimento; sem ele, a competência. */
export const dataDoRecebimento = (r: RecebimentoVinculavel): string | null => r.pagamento || r.vencimento || r.competencia || r.data || null;

const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
/** Dias da OC até o lançamento (negativo = antes); sem data = nulo. */
export function diasDaOc(r: RecebimentoVinculavel, dataDaOc: string | null): number | null {
  const d = dataDoRecebimento(r);
  return d && dataDaOc ? dia(d) - dia(dataDaOc) : null;
}

export interface OpcoesDaLista {
  /** A data da OC (no abate, o dia do abate); sem ela não há janela: vale tudo, pelo mais recente. */
  dataDaOc: string | null;
  /** O que falta receber/pagar na tela (positivo). */
  saldo: number;
  verVinculados: boolean;
  todoHistorico: boolean;
}

export interface ListaParaVincular {
  linhas: RecebimentoVinculavel[];
  /** quantos ficaram de fora só pela janela (o "procurar em todo o histórico" diz o número) */
  foraDaJanela: number;
  /** quantos ficaram de fora por estarem em outra OC */
  emOutraOc: number;
}

const centavos = (v: number) => Math.round(Math.abs(v) * 100);

export function listaParaVincular(itens: readonly RecebimentoVinculavel[], o: OpcoesDaLista): ListaParaVincular {
  let emOutraOc = 0;
  let foraDaJanela = 0;
  const ficam: RecebimentoVinculavel[] = [];
  for (const r of itens) {
    if (!o.verVinculados && r.motivoExcluido === MOTIVO_OUTRA_OC) { emOutraOc++; continue; }
    const d = diasDaOc(r, o.dataDaOc);
    const naJanela = d === null || o.dataDaOc === null || (d >= -DIAS_ANTES_DA_OC && d <= DIAS_DEPOIS_DA_OC);
    if (!naJanela && !o.todoHistorico) { foraDaJanela++; continue; }
    ficam.push(r);
  }
  const alvo = centavos(o.saldo);
  const chave = (r: RecebimentoVinculavel): number[] => {
    const d = diasDaOc(r, o.dataDaOc);
    const naJanela = d !== null && d >= -DIAS_ANTES_DA_OC && d <= DIAS_DEPOIS_DA_OC;
    const provavel = r.mesmoFavorecido && (naJanela || o.dataDaOc === null);
    const distancia = d === null ? 1e9 : Math.abs(d);
    return [
      r.motivoExcluido ? 1 : 0,
      provavel ? 0 : 1,
      /* o valor mais perto do saldo (o igual = distância zero, no topo) */
      provavel ? Math.abs(centavos(r.valor) - alvo) : 0,
      /* sem a data da OC: o mais recente primeiro */
      o.dataDaOc === null ? -(dataDoRecebimento(r) ? dia(dataDoRecebimento(r) ?? '') : -1e9) : distancia,
    ];
  };
  const comChave = ficam.map((r) => ({ r, k: chave(r) }));
  comChave.sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
    return a.r.lancamentoId < b.r.lancamentoId ? -1 : 1;
  });
  return { linhas: comChave.map((x) => x.r), foraDaJanela, emOutraOc };
}

/** As colunas que se ordenam pelo clique no cabeçalho (nulo = a ordem do mais provável). */
export type ColunaDaBusca = 'vencimento' | 'pagamento' | 'descricao' | 'fazenda' | 'contaBancaria' | 'valor' | 'status';

export function ordenarPorColuna<T extends RecebimentoVinculavel>(linhas: readonly T[], coluna: ColunaDaBusca, crescente: boolean,
  fazendaDe: (r: T) => string | null = () => null): T[] {
  const valorDe = (r: T): string | number => {
    switch (coluna) {
      case 'valor': return r.valor;
      case 'vencimento': return r.vencimento ?? '';
      case 'pagamento': return r.pagamento ?? '';
      case 'descricao': return (r.descricao ?? '').toLocaleLowerCase('pt-BR');
      case 'fazenda': return (fazendaDe(r) ?? '').toLocaleLowerCase('pt-BR');
      case 'contaBancaria': return (r.contaBancaria ?? '').toLocaleLowerCase('pt-BR');
      case 'status': return (r.motivoExcluido ?? r.status ?? '').toLocaleLowerCase('pt-BR');
    }
  };
  const s = crescente ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const x = valorDe(a);
    const y = valorDe(b);
    if (x === y) return 0;
    /* vazio (sem data, sem nome) sempre no fim, nos dois sentidos */
    if (x === '') return 1;
    if (y === '') return -1;
    return (x < y ? -1 : 1) * s;
  });
}
