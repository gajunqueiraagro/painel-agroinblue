/**
 * OC-CC-VOLTA-01b — o ajuste de preco nos dois sentidos, em todos os lotes, com previa. O rateio mora no banco (`_oc_ratear_por_kg`,
 * `oc_explicar_saldo` em simulacao); aqui se trava o que a TELA faz: o sentido e o valor que nascem com o "Falta explicar", o sinal
 * que vai a' RPC, o rotulo que diz o sentido e a leitura da previa. Os numeros sao os da prova em rollback da migration 20261027183000
 * (NJ af334f9c: 1.544.082,84 / 658.875,74 / 347.041,42 = 2.550.000,00; Santa Rita 858acb08 com duas saidas).
 */
import { describe, it, expect } from 'vitest';
import {
  efeitoNoSaldo, linhasDaPreviaAjuste, rotuloSentidoAjuste, sugestaoAjuste, totalDoRascunho, valorAjusteParaRpc,
  type LadoContaCorrente,
} from './contaCorrente';

const reais = (s: string) => s.replace(/ /g, ' ');

describe('ajuste de preco — os dois sentidos', () => {
  it('VENDA: o comprador pagou a mais (falta positivo) -> SOBE o valor todo; pagou a menos -> BAIXA', () => {
    expect(sugestaoAjuste(1535000, 'venda')).toEqual({ sentido: 'sobe', valor: 1535000 });
    expect(sugestaoAjuste(-1357.89, 'venda')).toEqual({ sentido: 'baixa', valor: 1357.89 });
  });

  it('COMPRA: o espelho — a fazenda pagou a mais ao fornecedor (falta negativo) -> SOBE', () => {
    expect(sugestaoAjuste(-1000, 'compra')).toEqual({ sentido: 'sobe', valor: 1000 });
    expect(sugestaoAjuste(1000, 'compra')).toEqual({ sentido: 'baixa', valor: 1000 });
  });

  it('o sugerido ZERA o que falta, pelo mesmo efeito do rascunho (nenhuma segunda regra de sinal)', () => {
    const lados: LadoContaCorrente[] = ['venda', 'compra'];
    for (const lado of lados) {
      for (const falta of [1535000, -1357.89, 0.01, -0.01]) {
        const s = sugestaoAjuste(falta, lado);
        const efeito = totalDoRascunho([{ tipo: 'ajuste_preco', valor: valorAjusteParaRpc(s.sentido, s.valor) }], lado);
        expect(Math.round((falta + efeito) * 100)).toBe(0);
      }
    }
  });

  it('nada a explicar: nasce vazio, no sentido de sempre', () => {
    expect(sugestaoAjuste(0, 'venda')).toEqual({ sentido: 'baixa', valor: 0 });
    expect(sugestaoAjuste(0.004, 'venda').valor).toBe(0);
  });

  it('a RPC recebe positivo para baixar e negativo para subir; o efeito no saldo segue o sinal', () => {
    expect(valorAjusteParaRpc('baixa', 1000)).toBe(1000);
    expect(valorAjusteParaRpc('sobe', 1535000)).toBe(-1535000);
    expect(efeitoNoSaldo('ajuste_preco', valorAjusteParaRpc('sobe', 1535000), 'venda')).toBe(-1535000);
  });

  it('o rotulo diz o sentido e de quem', () => {
    expect(reais(rotuloSentidoAjuste('sobe', 1535000, true))).toBe('Sobe o preço dos lotes em R$ 1.535.000,00');
    expect(reais(rotuloSentidoAjuste('baixa', 10990.2, false))).toBe('Baixa o preço do lote em R$ 10.990,20');
  });
});

/* A previa como `oc_explicar_saldo` a devolve em simulacao (af334f9c, "todos", sobe 1.535.000). */
const lote = (id: string, ordem: number, kg: number, total: number) =>
  ({ lote_id: id, ordem, categoria: 'novilhas', qtd: kg / 430, peso: 430, kg, criterio_valor: 'total', valor_informado: total, total });
const entrega = (parte: string, id: string, data: string, kg: number, valor: number) =>
  ({ parte_id: parte, lote_id: id, lote_ordem: 0, data, cab: kg / 430, kg, valor });
const PREVIA_AF = {
  criterio: 'todos_por_kg', total_antes: 1015000, total_novo: 2550000,
  lotes_antes: [lote('l1', 1, 132010, 610990.2), lote('l2', 2, 56330, 260715.69), lote('l3', 3, 29670, 143294.11)],
  lotes_depois: [lote('l1', 1, 132010, 1544082.84), lote('l2', 2, 56330, 658875.74), lote('l3', 3, 29670, 347041.42)],
  entregas_antes: [entrega('e1', 'l1', '2021-04-06', 132010, 610990.2), entrega('e2', 'l2', '2021-04-21', 56330, 260715.69),
    entrega('e3', 'l3', '2021-06-02', 29670, 143294.11)],
  entregas_depois: [entrega('e1', 'l1', '2021-04-06', 132010, 1544082.84), entrega('e2', 'l2', '2021-04-21', 56330, 658875.74),
    entrega('e3', 'l3', '2021-06-02', 29670, 347041.42)],
};

describe('previa do ajuste — lida da RPC, nunca recalculada', () => {
  it('af334f9c: lote | entregas (data) | kg | hoje | novo | R$/kg novo, e o total 2.550.000,00 a 11,70/kg', () => {
    const l = linhasDaPreviaAjuste(PREVIA_AF);
    expect(l.map(x => [x.nivel, x.loteOrdem, x.datas.join(','), x.kg, x.hoje, x.novo, x.porKgNovo])).toEqual([
      ['lote', 1, '06/04/21', 132010, 610990.2, 1544082.84, 11.7],
      ['lote', 2, '21/04/21', 56330, 260715.69, 658875.74, 11.7],
      ['lote', 3, '02/06/21', 29670, 143294.11, 347041.42, 11.7],
      ['total', null, '', 218010, 1015000, 2550000, 11.7],
    ]);
  });

  it('os centavos do total fecham exatos (soma em centavos, sem erro de ponto flutuante)', () => {
    const total = linhasDaPreviaAjuste(PREVIA_AF).find(x => x.nivel === 'total');
    expect(total?.novo).toBe(2550000);
    expect(total?.hoje).toBe(1015000);
  });

  it('lote com DUAS entregas abre as duas embaixo, cada uma na data da sua saida (858acb08, ajuste de +1.000)', () => {
    const p = {
      lotes_antes: [{ lote_id: 'x', ordem: 1, categoria: 'garrotes', kg: 17600, total: 160000 }],
      lotes_depois: [{ lote_id: 'x', ordem: 1, categoria: 'garrotes', kg: 17600, total: 161000 }],
      entregas_antes: [{ parte_id: 'a', lote_id: 'x', data: '2026-06-16', kg: 12800, valor: 114798.21 },
        { parte_id: 'b', lote_id: 'x', data: '2026-07-10', kg: 5040, valor: 45201.79 }],
      entregas_depois: [{ parte_id: 'a', lote_id: 'x', data: '2026-06-16', kg: 12800, valor: 115515.7 },
        { parte_id: 'b', lote_id: 'x', data: '2026-07-10', kg: 5040, valor: 45484.3 }],
    };
    const l = linhasDaPreviaAjuste(p);
    expect(l.map(x => [x.nivel, x.datas.join(','), x.hoje, x.novo])).toEqual([
      ['lote', '16/06/26,10/07/26', 160000, 161000],
      ['entrega', '16/06/26', 114798.21, 115515.7],
      ['entrega', '10/07/26', 45201.79, 45484.3],
      ['total', '', 160000, 161000],
    ]);
  });

  it('previa vazia ou fora do contrato: nenhuma linha (nunca um zero inventado)', () => {
    expect(linhasDaPreviaAjuste(null)).toEqual([]);
    expect(linhasDaPreviaAjuste({ criterio: 'entregas_por_kg', partes: [] })).toEqual([]);
    expect(linhasDaPreviaAjuste('x')).toEqual([]);
  });
});
