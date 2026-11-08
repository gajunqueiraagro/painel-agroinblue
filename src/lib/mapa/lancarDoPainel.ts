import type { DadosDoPastoNoMes } from '@/lib/mapa/mapaDoMes';

/**
 * MAPA-LOTES-01 fatia 1 (A) — o botão do painel do pasto no Geo pastos. O mapa NÃO é fonte de lote: o botão só ABRE o modal do P1
 * (`useModalDoPasto`, o mesmo do Fechamento) no card do pasto; quem grava e quem trava o mês fechado é o modal e o banco.
 *  - fora da vigência no mês: sem card → o botão fica, desligado, com o motivo escrito;
 *  - card do mês fechado: "Ver fechamento" (o modal abre só leitura);
 *  - unidade com divisões (piquetes): o Fechamento conta por divisão → escolher qual (D5);
 *  - senão: "Lançar no fechamento" do próprio pasto.
 */
export type LancarDoPainel =
  | { tipo: 'bloqueado'; rotulo: string; motivo: string }
  | { tipo: 'um'; rotulo: string; pastoId: string }
  | { tipo: 'divisoes'; rotulo: string; opcoes: { pastoId: string; nome: string }[] };

export const ROTULO_LANCAR = 'Lançar no fechamento';
export const ROTULO_VER = 'Ver fechamento';

export function lancarDoPainel(e: {
  pastoId: string;
  dados: DadosDoPastoNoMes | null;
  divisoes: readonly { pastoId: string; nome: string }[];
  /** o mês como o painel o escreve ('09/26') */
  mes: string;
}): LancarDoPainel {
  const rotulo = e.dados?.fechado ? ROTULO_VER : ROTULO_LANCAR;
  if (!e.dados) return { tipo: 'bloqueado', rotulo: ROTULO_LANCAR, motivo: `Fora da vigência em ${e.mes}` };
  if (e.divisoes.length > 0) return { tipo: 'divisoes', rotulo, opcoes: e.divisoes.map(d => ({ pastoId: d.pastoId, nome: d.nome })) };
  return { tipo: 'um', rotulo, pastoId: e.pastoId };
}
