/**
 * V2ZootWrapper — Wrapper mínimo para telas zootécnicas que exigem lancamentos/saldosIniciais
 *
 * Chama useLancamentos() — mesma fonte que o Index.tsx original.
 * Repassa lancamentos e saldosIniciais via render prop, sem nenhum cálculo ou fallback.
 *
 * NÃO altera hooks, telas ou lógica existente.
 */
import { useLancamentos } from '@/hooks/useLancamentos';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface WrapperProps {
  children: (props: {
    lancamentos: Lancamento[];
    saldosIniciais: SaldoInicial[];
  }) => React.ReactNode;
}

export function V2ZootWrapper({ children }: WrapperProps) {
  const { lancamentos, saldosIniciais } = useLancamentos();
  return <>{children({ lancamentos, saldosIniciais })}</>;
}
