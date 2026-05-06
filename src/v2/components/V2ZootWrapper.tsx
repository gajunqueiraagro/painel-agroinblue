/**
 * V2ZootWrapper — Wrapper mínimo para telas zootécnicas que exigem lancamentos/saldosIniciais
 *
 * Chama useLancamentos() — mesma fonte que o Index.tsx original.
 * Repassa lancamentos e saldosIniciais via render prop, sem nenhum cálculo ou fallback.
 *
 * NÃO altera hooks, telas ou lógica existente.
 */
import { useMemo } from 'react';
import { useLancamentos } from '@/hooks/useLancamentos';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface WrapperProps {
  children: (props: {
    lancamentos: Lancamento[];
    saldosIniciais: SaldoInicial[];
    removerLancamento: (id: string) => Promise<boolean>;
    editarLancamento: (id: string, dados: any) => Promise<void>;
    lancamentosTodosCenarios: Lancamento[];
  }) => React.ReactNode;
}

export function V2ZootWrapper({ children }: WrapperProps) {
  const realizado = useLancamentos();
  const meta = useLancamentos('meta');

  const { lancamentos, saldosIniciais } = realizado;
  const metaLancamentos = meta.lancamentos;

  const lancamentosTodosCenarios = useMemo(() => {
    const merged = [...lancamentos];
    for (const ml of metaLancamentos) {
      if (!lancamentos.some(l => l.id === ml.id)) merged.push(ml);
    }
    return merged;
  }, [lancamentos, metaLancamentos]);

  // Roteamento por cenário — useLancamentos mantém state local separado por
  // instância (realizado/meta). A função correta deve ser chamada conforme
  // o lançamento, senão o state da instância adversa fica stale.
  //
  // Usamos `lancamentosTodosCenarios` (mesma fonte exibida na tela) para olhar
  // a propriedade `.cenario` do objeto. Roteamento por presença em
  // `metaLancamentos.some(...)` falha em casos de timing/refetch dessincronizados.
  const removerLancamento = async (id: string) => {
    const lanc = lancamentosTodosCenarios.find(l => l.id === id);
    const ehMeta = lanc?.cenario === 'meta';
    return ehMeta ? meta.removerLancamento(id) : realizado.removerLancamento(id);
  };
  const editarLancamento = async (id: string, dados: any) => {
    const lanc = lancamentosTodosCenarios.find(l => l.id === id);
    const ehMeta = lanc?.cenario === 'meta';
    return ehMeta ? meta.editarLancamento(id, dados) : realizado.editarLancamento(id, dados);
  };

  return <>{children({ lancamentos, saldosIniciais, removerLancamento, editarLancamento, lancamentosTodosCenarios })}</>;
}
