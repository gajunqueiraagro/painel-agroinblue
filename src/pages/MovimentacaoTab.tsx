import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { FinanceiroTab, type SubAba } from './FinanceiroTab';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onEditar?: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover?: (id: string) => void;
}

/**
 * Wrapper que reutiliza o FinanceiroTab (tela de movimentações com tabela operacional)
 * como a aba "Movimentações" dentro do hub Evolução do Rebanho.
 */
export function MovimentacaoTab({ lancamentos, saldosIniciais, onEditar, onRemover }: Props) {
  return (
    <FinanceiroTab
      lancamentos={lancamentos}
      onEditar={onEditar || (() => {})}
      onRemover={onRemover || (() => {})}
    />
  );
}
