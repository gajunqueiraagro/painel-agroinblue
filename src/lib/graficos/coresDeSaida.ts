/**
 * AS CORES DOS GRÁFICOS DE SAÍDA — FIN-FINANC-28 passo 4c (Gabriel 17/10/2026; paleta validada em CVD e contraste no mock
 * `docs/mocks/mock-grafico-a-pagar-v2.html`). Regra da casa: saída a pagar / principal LARANJA, juros e encargos VIOLETA, vencido e
 * não pago VERMELHO, já pago CINZA. AZUL FICA RESERVADO PARA ENTRADA / RECEITA. Gráfico de saída lê daqui; nunca hex solto.
 */
export const COR_SAIDA: Readonly<{ aPagar: string; juros: string; vencido: string; pago: string }> = {
  aPagar: '#d97706',
  juros: '#8b5cf6',
  vencido: '#b91c1c',
  pago: '#cbd5e1',
};
