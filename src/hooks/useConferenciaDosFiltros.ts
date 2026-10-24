/**
 * QUANDO A CONFERÊNCIA DOS FILTROS RODA — P94 (FIN-V2-FILTRO-FANTASMA-01). A regra é `conferirFiltrosDaLista` (pura); aqui fica o
 * MOMENTO: todo filtro que volta (memória, instantâneo da OC, drill da Visão Geral/Fluxo, props, troca de cliente) é conferido UMA vez,
 * e só quando as opções DO CLIENTE ATUAL carregaram (`pronto`). Conferir contra a lista ainda vazia apagaria o filtro certo; conferir
 * contra a do cliente anterior manteria o fantasma.
 * ⚠ A MONTAGEM JÁ NASCE PEDINDO (o ref começa em `true`); a troca de cliente pede de novo (`pedir`). Fora disso a conferência não roda:
 * o que o operador escolhe na barra vem das opções, e o que some depois (uma mescla, um cadastro inativado) aparece em vermelho no
 * próprio seletor ("valor inexistente (limpar)").
 */
import { useCallback, useEffect, useRef } from 'react';
import { conferirFiltrosDaLista, type Conferencia, type FiltrosDeCadastro, type OpcoesDoCliente } from '@/lib/financeiro/conferirFiltrosDaLista';

export function useConferenciaDosFiltros(p: {
  /** o cliente cujas opções estão TODAS carregadas; nulo enquanto carrega */
  pronto: string | null;
  filtros: FiltrosDeCadastro;
  opcoes: OpcoesDoCliente;
  /** recebe só quando há o que trocar */
  aplicar: (c: Conferencia) => void;
}): { pedir: () => void } {
  const pendente = useRef(true);
  const atual = useRef(p);
  atual.current = p;
  useEffect(() => {
    if (!p.pronto || !pendente.current) return;
    pendente.current = false;
    const r = conferirFiltrosDaLista(atual.current.filtros, atual.current.opcoes);
    if (r.avisos.length) atual.current.aplicar(r);
  }, [p.pronto]);
  const pedir = useCallback(() => { pendente.current = true; }, []);
  return { pedir };
}
