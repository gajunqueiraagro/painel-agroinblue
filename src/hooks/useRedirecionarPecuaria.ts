import { useFazenda } from '@/contexts/FazendaContext';

/**
 * Retorna { bloqueado: true } quando a fazenda selecionada não tem pecuária.
 * Usar nas abas zootécnicas para exibir mensagem de bloqueio.
 */
export function useRedirecionarPecuaria() {
  const { fazendaAtual, isGlobal } = useFazenda();
  const bloqueado = !isGlobal && fazendaAtual?.tem_pecuaria === false;
  return { bloqueado };
}
