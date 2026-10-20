/**
 * UI-SEM-CORTE-02 (item 4) — o ícone do OFX na linha da conta em "Saldos por conta" tem DOIS estados no MESMO lugar de 11px:
 *   'cheio'  — há OFX com saldo declarado pelo banco naquele mês (a leitura de sempre de `financeiro_importacoes_v2`);
 *   'vazado' — a conta importa OFX e o dono diz que há extrato no mês (`tem_extrato`), mas nenhum OFX daquele mês trouxe saldo:
 *              o saldo do extrato da tela é o calculado pelos movimentos.
 * Nenhum dos dois: o lugar fica vazio (a largura nunca muda).
 */
export type EstadoDoSlotOfx = 'cheio' | 'vazado' | null;

export const TITULO_OFX_COM_SALDO = 'Extrato OFX importado · o banco informou o saldo deste mês';
export const TITULO_OFX_SEM_SALDO = 'saldo calculado pelos movimentos — o banco não informou o saldo deste mês';

export function estadoDoSlotOfx(p: { comSaldoNoMes: boolean; importaOfx: boolean; temExtratoNoMes: boolean }): EstadoDoSlotOfx {
  if (p.comSaldoNoMes) return 'cheio';
  if (p.importaOfx && p.temExtratoNoMes) return 'vazado';
  return null;
}
