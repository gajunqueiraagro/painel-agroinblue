import { useEffect } from 'react';
import { useFazenda, GLOBAL_FAZENDA } from '@/contexts/FazendaContext';

/**
 * Auto-redireciona para a primeira fazenda com pecuária (ou Global)
 * quando a fazenda atualmente selecionada não tem pecuária.
 * Usar nas abas zootécnicas para evitar telas vazias.
 */
export function useRedirecionarPecuaria() {
  const { fazendaAtual, fazendasComPecuaria, setFazendaAtual, isGlobal } = useFazenda();

  useEffect(() => {
    if (!fazendaAtual || isGlobal) return;
    if (fazendaAtual.tem_pecuaria === false) {
      if (fazendasComPecuaria.length > 1) {
        setFazendaAtual(GLOBAL_FAZENDA);
      } else if (fazendasComPecuaria.length === 1) {
        setFazendaAtual(fazendasComPecuaria[0]);
      }
    }
  }, [fazendaAtual, fazendasComPecuaria, setFazendaAtual, isGlobal]);
}
