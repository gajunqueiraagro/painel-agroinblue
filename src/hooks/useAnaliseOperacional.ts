/**
 * Hook de análise operacional — fonte oficial: vw_zoot_categoria_mensal.
 *
 * Resumo de movimentações: vem de lancamentos (detalhe do fluxo).
 * Saldo do sistema: vem da view oficial (saldo_final por categoria).
 * Conciliação: sistema (view) × pastos (fechamento_pasto_itens).
 */
import { useMemo } from 'react';
import type { Lancamento } from '@/types/cattle';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import {
  calcResumoMovimentacoes,
  classificarNivelConciliacao,
  type ResumoMovimentacoes,
  type NivelConciliacao,
} from '@/lib/calculos/zootecnicos';

export type { ResumoMovimentacoes };

export interface ConciliacaoCategoria {
  categoria: { id: string; nome: string; codigo: string };
  qtdSistema: number;
  qtdPastos: number;
  diferenca: number;
  nivel: NivelConciliacao;
}

export interface AlertaInteligente {
  tipo: 'info' | 'atencao' | 'critico';
  mensagem: string;
}

export interface SugestaoAjuste {
  tipo: 'evolucao' | 'entrada_faltante' | 'saida_faltante';
  mensagem: string;
  categoriaOrigem?: string;
  categoriaDestino?: string;
  quantidade?: number;
}

export function useAnaliseOperacional(
  lancamentos: Lancamento[],
  /** Dados da view oficial para o mês selecionado */
  viewCategoriasMes: ZootCategoriaMensal[],
  itensPastos: Map<string, number>,
  anoMes: string,
) {
  // Movimentações do mês — de lancamentos (detalhe de fluxo)
  const resumoMov = useMemo(
    () => calcResumoMovimentacoes(lancamentos, anoMes),
    [lancamentos, anoMes],
  );

  // Saldo do sistema — da view oficial
  const saldoSistema = useMemo(() => {
    const map = new Map<string, number>();
    viewCategoriasMes.forEach(c => map.set(c.categoria_id, c.saldo_final));
    return map;
  }, [viewCategoriasMes]);

  // Conciliação: sistema (view) × pastos
  const conciliacao = useMemo((): ConciliacaoCategoria[] => {
    const allCatIds = new Set([...saldoSistema.keys(), ...itensPastos.keys()]);
    const catMap = new Map(viewCategoriasMes.map(c => [c.categoria_id, c]));

    return Array.from(allCatIds)
      .map(catId => {
        const cat = catMap.get(catId);
        const qtdSistema = saldoSistema.get(catId) || 0;
        const qtdPastos = itensPastos.get(catId) || 0;
        const diferenca = qtdPastos - qtdSistema;
        return {
          categoria: {
            id: catId,
            nome: cat?.categoria_nome || catId,
            codigo: cat?.categoria_codigo || '',
          },
          qtdSistema,
          qtdPastos,
          diferenca,
          nivel: classificarNivelConciliacao(diferenca),
          ordem: cat?.ordem_exibicao ?? 999,
        };
      })
      .filter(r => r.qtdSistema !== 0 || r.qtdPastos !== 0)
      .sort((a, b) => (a as any).ordem - (b as any).ordem);
  }, [saldoSistema, itensPastos, viewCategoriasMes]);

  // Alertas inteligentes
  const alertas: AlertaInteligente[] = useMemo(() => {
    const msgs: AlertaInteligente[] = [];
    const totalSistema = conciliacao.reduce((s, r) => s + r.qtdSistema, 0);
    const totalPastos = conciliacao.reduce((s, r) => s + r.qtdPastos, 0);

    if (totalPastos === 0 && totalSistema > 0) {
      msgs.push({ tipo: 'info', mensagem: 'Nenhum dado de fechamento encontrado para este mês.' });
      return msgs;
    }

    if (totalPastos > totalSistema + 3) {
      msgs.push({
        tipo: 'atencao',
        mensagem: `Total nos pastos (${totalPastos}) é ${totalPastos - totalSistema} cabeças acima do sistema (${totalSistema}). Possível falta de lançamento de entrada.`,
      });
    }
    if (totalPastos < totalSistema - 3) {
      msgs.push({
        tipo: 'atencao',
        mensagem: `Total nos pastos (${totalPastos}) é ${totalSistema - totalPastos} cabeças abaixo do sistema (${totalSistema}). Possível falta de lançamento de saída.`,
      });
    }

    const criticos = conciliacao.filter(r => r.nivel === 'critico');
    if (criticos.length > 0) {
      msgs.push({
        tipo: 'critico',
        mensagem: `${criticos.length} categoria(s) com divergência crítica: ${criticos.map(c => c.categoria.nome).join(', ')}.`,
      });
    }

    return msgs;
  }, [conciliacao]);

  // Sugestões de ajustes operacionais
  const sugestoes: SugestaoAjuste[] = useMemo(() => {
    const result: SugestaoAjuste[] = [];

    for (let i = 0; i < conciliacao.length; i++) {
      for (let j = i + 1; j < conciliacao.length; j++) {
        const a = conciliacao[i];
        const b = conciliacao[j];

        if (a.diferenca < -2 && b.diferenca > 2 && Math.abs(a.diferenca + b.diferenca) <= 2) {
          result.push({
            tipo: 'evolucao',
            mensagem: `Possível evolução de ${a.categoria.nome} → ${b.categoria.nome}: ${Math.abs(a.diferenca)} cabeças não lançadas como reclassificação.`,
            categoriaOrigem: a.categoria.nome,
            categoriaDestino: b.categoria.nome,
            quantidade: Math.abs(a.diferenca),
          });
        }
        if (b.diferenca < -2 && a.diferenca > 2 && Math.abs(a.diferenca + b.diferenca) <= 2) {
          result.push({
            tipo: 'evolucao',
            mensagem: `Possível evolução de ${b.categoria.nome} → ${a.categoria.nome}: ${Math.abs(b.diferenca)} cabeças não lançadas como reclassificação.`,
            categoriaOrigem: b.categoria.nome,
            categoriaDestino: a.categoria.nome,
            quantidade: Math.abs(b.diferenca),
          });
        }
      }
    }

    conciliacao.filter(r => r.diferenca > 5).forEach(r => {
      result.push({
        tipo: 'entrada_faltante',
        mensagem: `${r.categoria.nome}: ${r.diferenca} cabeças a mais nos pastos. Verificar se há nascimento, compra ou transferência não lançada.`,
        quantidade: r.diferenca,
      });
    });

    conciliacao.filter(r => r.diferenca < -5).forEach(r => {
      result.push({
        tipo: 'saida_faltante',
        mensagem: `${r.categoria.nome}: ${Math.abs(r.diferenca)} cabeças a menos nos pastos. Verificar se há venda, abate ou morte não lançada.`,
        quantidade: Math.abs(r.diferenca),
      });
    });

    return result;
  }, [conciliacao]);

  return {
    resumoMov,
    saldoSistema,
    conciliacao,
    alertas,
    sugestoes,
  };
}
