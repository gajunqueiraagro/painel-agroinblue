/**
 * VISAO-GERAL-03 (Gabriel 08/11 09:04) — o card "Caixa no fim do mês" do Início abre o Financeiro › Visão geral (a tela que substitui o fluxo
 * de caixa antigo) no MESMO mês e na MESMA fazenda da Visão Geral; a volta é o "‹ Voltar à Visão Geral" da barra do topo (o de toda tela
 * aberta do Início).
 */
import type { V2Section } from '@/v2/lib/navGrupos';

export const DESTINO_DO_CAIXA: V2Section = 'fin-visao-geral';

/** O estado de abertura do Financeiro › Visão geral: o mês 'AAAA-MM' do Início e a fazenda (nulo = Global). */
export function inicialDaVisaoFinanceira(ano: string | number, mes: string | number, fazendaId: string | null): { sel: string; fazenda: string | null } {
  return { sel: `${String(ano)}-${String(mes).padStart(2, '0')}`, fazenda: fazendaId };
}
