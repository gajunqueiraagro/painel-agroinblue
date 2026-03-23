import { useMemo } from 'react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { CategoriaRebanho } from '@/hooks/usePastos';

export interface ResumoMovimentacoes {
  nascimentos: number;
  compras: number;
  vendas: number;
  abates: number;
  mortes: number;
  consumos: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
  reclassificacoes: number;
  totalEntradas: number;
  totalSaidas: number;
  saldoMes: number;
}

export interface ConciliacaoInteligente {
  categoria: CategoriaRebanho;
  qtdSistema: number;
  qtdPastos: number;
  diferenca: number;
  nivel: 'ok' | 'atencao' | 'critico';
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
  saldosIniciais: SaldoInicial[],
  categorias: CategoriaRebanho[],
  itensPastos: Map<string, number>,
  anoMes: string
) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const mesStr = anoMes;

  // Movimentações do mês
  const resumoMov: ResumoMovimentacoes = useMemo(() => {
    const startDate = `${mesStr}-01`;
    const endDate = `${mesStr}-31`;
    const doMes = lancamentos.filter(l => l.data >= startDate && l.data <= endDate);

    const count = (tipo: string) => doMes.filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0);

    const nascimentos = count('nascimento');
    const compras = count('compra');
    const vendas = count('venda');
    const abates = count('abate');
    const mortes = count('morte');
    const consumos = count('consumo');
    const transferenciasEntrada = count('transferencia_entrada');
    const transferenciasSaida = count('transferencia_saida');
    const reclassificacoes = count('reclassificacao');

    const totalEntradas = nascimentos + compras + transferenciasEntrada;
    const totalSaidas = vendas + abates + mortes + consumos + transferenciasSaida;

    return {
      nascimentos, compras, vendas, abates, mortes, consumos,
      transferenciasEntrada, transferenciasSaida, reclassificacoes,
      totalEntradas, totalSaidas,
      saldoMes: totalEntradas - totalSaidas,
    };
  }, [lancamentos, mesStr]);

  // Saldo do sistema por categoria até o final do mês
  const saldoSistema = useMemo(() => {
    const map = new Map<string, number>();
    const codeToId = new Map(categorias.map(c => [c.codigo, c.id]));

    saldosIniciais.filter(s => s.ano === ano).forEach(s => {
      const catId = codeToId.get(s.categoria);
      if (catId) map.set(catId, (map.get(catId) || 0) + s.quantidade);
    });

    const endDate = `${mesStr}-31`;
    const startDate = `${ano}-01-01`;
    lancamentos
      .filter(l => l.data >= startDate && l.data <= endDate)
      .forEach(l => {
        const catId = codeToId.get(l.categoria);
        if (!catId) return;
        const isEntrada = ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo);
        const isSaida = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(l.tipo);
        const isReclass = l.tipo === 'reclassificacao';

        if (isEntrada) map.set(catId, (map.get(catId) || 0) + l.quantidade);
        else if (isSaida) map.set(catId, (map.get(catId) || 0) - l.quantidade);
        else if (isReclass && l.categoriaDestino) {
          const destId = codeToId.get(l.categoriaDestino);
          map.set(catId, (map.get(catId) || 0) - l.quantidade);
          if (destId) map.set(destId, (map.get(destId) || 0) + l.quantidade);
        }
      });

    return map;
  }, [ano, mesStr, lancamentos, saldosIniciais, categorias]);

  // Conciliação por categoria
  const conciliacao: ConciliacaoInteligente[] = useMemo(() => {
    return categorias.map(cat => {
      const qtdSistema = saldoSistema.get(cat.id) || 0;
      const qtdPastos = itensPastos.get(cat.id) || 0;
      const diferenca = qtdPastos - qtdSistema;
      const absDif = Math.abs(diferenca);
      const nivel: 'ok' | 'atencao' | 'critico' = absDif === 0 ? 'ok' : absDif <= 3 ? 'atencao' : 'critico';
      return { categoria: cat, qtdSistema, qtdPastos, diferenca, nivel };
    });
  }, [categorias, saldoSistema, itensPastos]);

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

        // Padrão: uma categoria diminuiu e outra aumentou na mesma proporção
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

    // Categorias com diferença positiva grande (pastos > sistema) → entrada faltante
    conciliacao.filter(r => r.diferenca > 5).forEach(r => {
      result.push({
        tipo: 'entrada_faltante',
        mensagem: `${r.categoria.nome}: ${r.diferenca} cabeças a mais nos pastos. Verificar se há nascimento, compra ou transferência não lançada.`,
        quantidade: r.diferenca,
      });
    });

    // Categorias com diferença negativa grande (sistema > pastos) → saída faltante
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
