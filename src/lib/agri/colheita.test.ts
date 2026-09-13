/**
 * A colheita carga por carga — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ OS NÚMEROS SÃO OS DO ROMANEIO QUE O GABRIEL VAI LANÇAR: dez cargas da 23/24 de amendoim,
 * 227.500 kg verdes e ~193.666 kg secos. Se um dia a régua de faixa ou de quebra mudar, é aqui
 * que a divergência aparece antes de chegar à tela.
 */
import { describe, it, expect } from 'vitest';
import {
  LIMITE_AFLATOXINA, faixaAflatoxina, unidadeDaCultura, validarCarga, totaisColheita,
  cargaVazia, type CargaForm,
} from './colheita';

const carga = (over: Partial<CargaForm> = {}): CargaForm => ({
  ...cargaVazia(), dataColheita: '2024-03-15', pesoVerdeKg: '22750', ...over,
});

describe('a faixa de aflatoxina', () => {
  it('o corte é 20 ppb, e ele é constante nomeada', () => {
    expect(LIMITE_AFLATOXINA).toBe(20);
  });

  it('no limite ainda é "até" — o corte inclui o próprio 20', () => {
    expect(faixaAflatoxina(20)).toBe('ate');
    expect(faixaAflatoxina(19.9)).toBe('ate');
    expect(faixaAflatoxina(0)).toBe('ate');
  });

  it('acima do corte é outra faixa, e outra tabela de preço', () => {
    expect(faixaAflatoxina(20.1)).toBe('acima');
    expect(faixaAflatoxina(35)).toBe('acima');
  });

  it('⚠ SEM LAUDO NÃO É "ATÉ 20": ausência não vira faixa boa', () => {
    expect(faixaAflatoxina(null)).toBeNull();
    expect(faixaAflatoxina(undefined)).toBeNull();
  });
});

describe('a unidade da cultura', () => {
  it('amendoim se mede em saca de 25 kg; mandioca, em tonelada', () => {
    expect(unidadeDaCultura('amendoim').kgPorSaca).toBe(25);
    expect(unidadeDaCultura('mandioca').kgPorSaca).toBeNull();
  });

  it('⚠ soja e milho ficam SEM saca até alguém decidir — convenção não é decisão', () => {
    expect(unidadeDaCultura('soja').kgPorSaca).toBeNull();
    expect(unidadeDaCultura('milho').kgPorSaca).toBeNull();
    expect(unidadeDaCultura(null).unidadeProdutividade).toBe('t/ha');
  });
});

describe('validar a carga', () => {
  it('sem data não grava: é ela que põe a carga na safra', () => {
    expect(validarCarga(carga({ dataColheita: '' })).ok).toBe(false);
  });

  it('sem peso nenhum não grava', () => {
    const v = validarCarga(carga({ pesoVerdeKg: '', pesoSecoKg: '' }));
    expect(v.ok).toBe(false);
  });

  it('⚠ SECO MAIOR QUE VERDE É DÍGITO TROCADO: secar tira água, não acrescenta', () => {
    const v = validarCarga(carga({ pesoVerdeKg: '22750', pesoSecoKg: '23000' }));
    expect(v.ok).toBe(false);
    expect(v.erro).toMatch(/seco/i);
  });

  it('percentual acima de 100 é recusado, nos dois campos', () => {
    expect(validarCarga(carga({ umidadePct: '120' })).ok).toBe(false);
    expect(validarCarga(carga({ rendaLiquidaPct: '101' })).ok).toBe(false);
  });

  it('negativo é recusado e a mensagem diz qual campo', () => {
    const v = validarCarga(carga({ aflatoxinaPpb: '-1' }));
    expect(v.ok).toBe(false);
    expect(v.erro).toMatch(/aflatoxina/i);
  });

  it('⚠ O TEXTO É pt-BR: "22.750,5" são vinte e dois mil, não vinte e dois', () => {
    const v = validarCarga(carga({ pesoVerdeKg: '22.750,5' }));
    expect(v.payload?.peso_verde_kg).toBe(22750.5);
  });

  it('campo em branco vira null, nunca zero — zero é medição, branco é ausência', () => {
    const v = validarCarga(carga({ pesoSecoKg: '', aflatoxinaPpb: '', ticketBalanca: '' }));
    expect(v.ok).toBe(true);
    expect(v.payload?.peso_seco_kg).toBeNull();
    expect(v.payload?.aflatoxina_ppb).toBeNull();
    expect(v.payload?.ticket_balanca).toBeNull();
  });

  it('o payload leva os campos do romaneio, um a um', () => {
    const v = validarCarga(carga({
      ticketBalanca: '12345', nfProdutor: '778', filial: 'Matriz',
      pesoSecoKg: '19366,6', umidadePct: '8,2', aflatoxinaPpb: '12',
      sacasBoas: '774,66', graoRocaSacas: '22', graoRocaKg: '550', rendaLiquidaPct: '85,1',
    }));
    expect(v.ok).toBe(true);
    expect(v.payload).toMatchObject({
      data_colheita: '2024-03-15', ticket_balanca: '12345', nf_produtor: '778', filial: 'Matriz',
      peso_verde_kg: 22750, peso_seco_kg: 19366.6, umidade_pct: 8.2, aflatoxina_ppb: 12,
      sacas_boas: 774.66, grao_roca_sacas: 22, grao_roca_kg: 550, renda_liquida_pct: 85.1,
    });
  });
});

describe('os totais da safra', () => {
  /* Dez cargas iguais: 227.500 kg verdes e 193.666 kg secos — o romaneio da 23/24. */
  const dez = Array.from({ length: 10 }, (_, i) => carga({
    pesoVerdeKg: '22750', pesoSecoKg: '19366,6', sacasBoas: '774,66',
    aflatoxinaPpb: i < 8 ? '12' : '35', graoRocaSacas: '22,2',
  }));

  it('soma o verde e o seco das cargas', () => {
    const t = totaisColheita(dez, 'amendoim', 60.6);
    expect(t.verdeKg).toBe(227500);
    expect(t.secoKg).toBeCloseTo(193666, 0);
    expect(t.cargas).toBe(10);
  });

  it('a separação por faixa sai do ppb de cada carga', () => {
    const t = totaisColheita(dez, 'amendoim', 60.6);
    expect(t.sacasAteLimite).toBeCloseTo(774.66 * 8, 2);
    expect(t.sacasAcimaLimite).toBeCloseTo(774.66 * 2, 2);
    expect(t.sacasSemClasse).toBe(0);
  });

  it('⚠ O GRÃO DE ROÇA FICA FORA DAS DUAS FAIXAS — ele já é refugo', () => {
    const t = totaisColheita(dez, 'amendoim', 60.6);
    expect(t.graoRocaSacas).toBeCloseTo(222, 1);
    expect(t.sacasAteLimite + t.sacasAcimaLimite).toBeCloseTo(t.sacasBoas, 2);
  });

  it('⚠ CARGA SEM LAUDO VAI PARA "SEM CLASSE", não para a faixa boa', () => {
    const t = totaisColheita([carga({ sacasBoas: '100', aflatoxinaPpb: '' })], 'amendoim', 10);
    expect(t.sacasSemClasse).toBe(100);
    expect(t.sacasAteLimite).toBe(0);
  });

  it('⚠ A QUEBRA É SOBRE O VERDE QUE JÁ VOLTOU SECO, não sobre o verde total', () => {
    /* Metade da safra ainda na cooperativa: a quebra é 10%, não 55%. */
    const meio = [
      carga({ pesoVerdeKg: '1000', pesoSecoKg: '900' }),
      carga({ pesoVerdeKg: '1000', pesoSecoKg: '' }),
    ];
    const t = totaisColheita(meio, 'amendoim', 1);
    expect(t.quebraPct).toBe(10);
    expect(t.aguardandoSeco).toBe(1);
  });

  it('sem nenhum seco não há quebra — e não é zero', () => {
    const t = totaisColheita([carga({ pesoSecoKg: '' })], 'amendoim', 10);
    expect(t.quebraPct).toBeNull();
  });

  it('a produtividade do amendoim é em sacas boas por hectare', () => {
    const t = totaisColheita(dez, 'amendoim', 60.6);
    expect(t.produtividade).toBeCloseTo((774.66 * 10) / 60.6, 2);
  });

  it('sem saca, a produtividade é o seco em tonelada por hectare', () => {
    const t = totaisColheita([carga({ pesoVerdeKg: '10000', pesoSecoKg: '9000' })], 'mandioca', 3);
    expect(t.produtividade).toBeCloseTo(3, 2);
  });

  it('⚠ SEM ÁREA NÃO HÁ PRODUTIVIDADE — dividir por zero daria "∞ sc/ha"', () => {
    expect(totaisColheita(dez, 'amendoim', 0).produtividade).toBeNull();
    expect(totaisColheita(dez, 'amendoim', null).produtividade).toBeNull();
  });

  it('lista vazia não quebra', () => {
    const t = totaisColheita([], 'amendoim', 60.6);
    expect(t.cargas).toBe(0);
    expect(t.verdeKg).toBe(0);
    expect(t.quebraPct).toBeNull();
  });
});
