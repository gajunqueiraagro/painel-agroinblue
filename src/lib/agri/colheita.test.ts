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
  cargaVazia, sacasDoPeso, quebraKg, type CargaForm,
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

/**
 * AS DERIVAÇÕES DA CARGA — AGRI-COLHEITA-DERIVADOS-02.
 *
 * ⚠ OS NÚMEROS SÃO OS DA CARGA 1 REAL DO NJ 23/24, conferidos contra o papel da Casul:
 * 27.160 kg verdes, 22.222,70 secos, 1.304,00 kg de grão de roça.
 */
describe('sacas derivadas do peso', () => {
  it('a carga 1: 22.222,70 kg secos dão 888,91 sacas', () => {
    expect(sacasDoPeso(22222.70, 'amendoim')).toBe(888.91);
  });

  it('o grão de roça: 1.304 kg dão 52,16 sacas', () => {
    expect(sacasDoPeso(1304, 'amendoim')).toBe(52.16);
  });

  it('⚠ DUAS CASAS, NÃO INTEIRO — é o que faz o total fechar com a cooperativa', () => {
    /* Guardar 889 em vez de 888,91 perderia 9 centésimos NESTA carga; em dez, o
       consolidado não bate com o papel. A célula é que arredonda, não o dado. */
    expect(sacasDoPeso(22222.70, 'amendoim')).not.toBe(889);
    expect(Math.round(sacasDoPeso(22222.70, 'amendoim') ?? 0)).toBe(889);
  });

  it('⚠ CULTURA SEM SACA NÃO DERIVA NADA: mandioca é tonelada, não saca', () => {
    expect(sacasDoPeso(10000, 'mandioca')).toBeNull();
    expect(sacasDoPeso(10000, 'soja')).toBeNull();
  });

  it('sem peso não há saca — zero e nulo não viram "0 sc"', () => {
    expect(sacasDoPeso(0, 'amendoim')).toBeNull();
    expect(sacasDoPeso(null, 'amendoim')).toBeNull();
  });
});

describe('a quebra da carga', () => {
  it('a carga 1: 27.160 − 22.222,70 = 4.937,30 kg', () => {
    expect(quebraKg(27160, 22222.70)).toBe(4937.30);
  });

  it('⚠ SEM O SECO NÃO HÁ QUEBRA, e ela não é zero: ainda não aconteceu', () => {
    expect(quebraKg(27160, null)).toBeNull();
    expect(quebraKg(null, 22222.70)).toBeNull();
  });
});

/**
 * O PARSE DO QUE SE DIGITA — AGRI-COLHEITA-FIX-05.
 *
 * ⚠ ESTE BLOCO NASCEU DE UMA CARGA QUE NÃO SALVAVA. "26.560" era lido como 26,56, a quebra
 * dava −22.655,92 e a tela recusava dizendo que o seco era maior que o verde. O parser do
 * abate trata ponto sem vírgula como decimal (`'5.000'` → 5, está no CLAUDE.md); o do dinheiro
 * olha quantos dígitos vêm depois. Para peso de balança, só o segundo acerta.
 */
describe('o número que o operador digita', () => {
  const verde = (t: string) => validarCarga(carga({ pesoVerdeKg: t })).payload?.peso_verde_kg;

  it('⚠ "26.560" É VINTE E SEIS MIL, não 26,56 — o defeito que travava a carga', () => {
    expect(verde('26.560')).toBe(26560);
  });

  it('as três formas de digitar o mesmo peso chegam ao mesmo número', () => {
    expect(verde('26560')).toBe(26560);
    expect(verde('26.560')).toBe(26560);
    expect(verde('26560,00')).toBe(26560);
    expect(verde('26.560,00')).toBe(26560);
  });

  it('uma ou duas casas depois do ponto continuam sendo decimal', () => {
    expect(verde('26,5')).toBe(26.5);
    expect(verde('26.5')).toBe(26.5);
    expect(verde('26.56')).toBe(26.56);
  });

  it('a carga real volta a passar: verde 26.560 e seco 22.682,48', () => {
    const v = validarCarga(carga({ pesoVerdeKg: '26.560', pesoSecoKg: '22.682,48' }));
    expect(v.ok).toBe(true);
    expect(quebraKg(v.payload?.peso_verde_kg ?? null, v.payload?.peso_seco_kg ?? null)).toBe(3877.52);
  });

  it('⚠ E O BLOQUEIO CONTINUA DE PÉ quando o seco é MESMO maior que o verde', () => {
    expect(validarCarga(carga({ pesoVerdeKg: '22.000', pesoSecoKg: '26.560' })).ok).toBe(false);
  });
});

describe('o sinal de menos', () => {
  it('⚠ "-1" É RECUSADO, não convertido em 1 — o parser do dinheiro come o sinal', () => {
    /* `parseMoeda` limpa tudo que não é dígito/ponto/vírgula. Sem preservar o sinal, a tela
       "corrigia" o operador em silêncio: pior que recusar. */
    expect(validarCarga(carga({ aflatoxinaPpb: '-1' })).ok).toBe(false);
    expect(validarCarga(carga({ pesoVerdeKg: '-26.560' })).ok).toBe(false);
  });
});

/**
 * A SECAGEM — AGRI-COLHEITA-03 / LAYOUT-06.
 *
 * ⚠ Os números são os do romaneio do Gabriel: taxa 3,80 e R$ 4.128,32 na carga; R$ 16.604,38
 * na safra inteira.
 */
describe('a secagem da carga', () => {
  it('taxa e valor são dois campos digitados, nenhum derivado do outro', () => {
    const v = validarCarga(carga({ taxaSecagem: '3,80', valorSecagem: '4.128,32' }));
    expect(v.ok).toBe(true);
    expect(v.payload?.taxa_secagem).toBe(3.8);
    expect(v.payload?.valor_secagem).toBe(4128.32);
  });

  it('⚠ "4.128,32" É QUATRO MIL, não 4,12 — o mesmo parse do peso', () => {
    expect(validarCarga(carga({ valorSecagem: '4.128' })).payload?.valor_secagem).toBe(4128);
  });

  it('negativo é recusado, como os outros valores', () => {
    expect(validarCarga(carga({ valorSecagem: '-100' })).ok).toBe(false);
  });

  it('o consolidado soma a secagem da safra', () => {
    const quatro = [
      carga({ valorSecagem: '4.128,32' }), carga({ valorSecagem: '4.128,32' }),
      carga({ valorSecagem: '4.128,32' }), carga({ valorSecagem: '4.219,42' }),
    ];
    expect(totaisColheita(quatro, 'amendoim', 60.6).valorSecagem).toBeCloseTo(16604.38, 2);
  });

  it('sem secagem lançada o total é zero — e a tela mostra traço, não "R$ 0,00"', () => {
    expect(totaisColheita([carga()], 'amendoim', 60.6).valorSecagem).toBe(0);
  });
});
