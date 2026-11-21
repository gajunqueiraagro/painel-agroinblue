import { useFazenda } from '@/contexts/FazendaContext';

/**
 * Retorna { bloqueado: true } quando a fazenda selecionada é a ADMINISTRATIVA (FAZ-TEM-PECUARIA-DERIVADA-01: coluna própria).
 * Usar nas abas zootécnicas para exibir mensagem de bloqueio. Fazenda sem gado NÃO bloqueia: é por aqui que entra o 1º gado
 * (e o banco liga `tem_pecuaria` sozinho).
 */
export function useRedirecionarPecuaria() {
  const { fazendaAtual, isGlobal } = useFazenda();
  const bloqueado = !isGlobal && fazendaAtual?.eh_administrativa === true;
  return { bloqueado };
}
