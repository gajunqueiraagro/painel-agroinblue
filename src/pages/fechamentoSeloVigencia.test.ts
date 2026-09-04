/**
 * O que este teste trava — leitor e gravador do fechamento de pastos com a MESMA regua.
 *
 * ⚠ O DEFEITO TINHA DOIS LADOS E SO' UM ERA VISIVEL. Do lado do gravador, o dialogo do
 * mapa de rebanho oferecia qualquer pasto `ativo` e deixava o operador escolher qualquer
 * mes alvo: um pasto encerrado em maio ganhava card em junho. Do lado do leitor, o selo
 * da regua do ano contava TODO card do mes — inclusive o desse pasto que ja nao existia.
 * Medido em 04/09/2026 no Proto: 83 cards para pasto fora do periodo (48 num pasto so',
 * de 2020-01 a 2023-12), e os 19 em rascunho que apareceram na medicao do arquiteto
 * faziam o mes inteiro parecer 'rascunho' com todos os pastos vigentes ja fechados.
 *
 * ⚠ E O MES FICAVA IMPOSSIVEL DE FECHAR. A tela lista so' pasto vigente, entao o card
 * orfao nao aparecia para ninguem fechar nem apagar — o selo acusava pendencia que a
 * tela nao tinha como resolver. Nao era um numero errado: era um trabalho sem botao.
 *
 * ⚠ A REGUA E' UMA FUNCAO SO', `pastosAtivosNoMes`, e os dois lados a chamam. Enquanto
 * cada lado escrevia a sua copia, um deles escrevia menos — e foi o que aconteceu.
 */
import { describe, it, expect } from 'vitest';
import { resumirStatusPorMes, type LinhaSeloMes } from '@/pages/FechamentoTab';
import { pastosAtivosNoMes } from '@/hooks/usePastos';

/** Encerrado em 31/05: existe ate maio, nao existe em junho. */
const ENCERRADO_EM_MAIO = {
  id: 'p1', ativo: true, tipo_uso: 'engorda',
  data_inicio: '2024-01-01', data_fim: '2025-05-31',
};
/** Sem datas: existe em todo mes. */
const SEMPRE = {
  id: 'p2', ativo: true, tipo_uso: 'engorda',
  data_inicio: null as string | null, data_fim: null as string | null,
};

const card = (
  anoMes: string,
  status: string,
  p: { ativo: boolean; tipo_uso: string | null; data_inicio: string | null; data_fim: string | null },
): LinhaSeloMes => ({ ano_mes: anoMes, status, pastos: p });

describe('o gravador — pasto fora do periodo nao entra no universo do mes', () => {
  it('pasto com data_fim em maio NAO ganha card em junho', () => {
    const universo = pastosAtivosNoMes([ENCERRADO_EM_MAIO, SEMPRE], '2025-06');
    expect(universo.map(p => p.id)).toEqual(['p2']);
  });

  it('e continua no universo de maio — o mes em que ele ainda existia', () => {
    const universo = pastosAtivosNoMes([ENCERRADO_EM_MAIO, SEMPRE], '2025-05');
    expect(universo.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('pasto inativo no cadastro fica de fora mesmo dentro da vigencia', () => {
    /* `ativo` e vigencia sao duas perguntas diferentes e a regua faz as duas — foi
       oferecer so' `ativo` que criou os cards orfaos. */
    const inativo = { ...SEMPRE, id: 'p3', ativo: false };
    expect(pastosAtivosNoMes([inativo], '2025-06')).toHaveLength(0);
  });

  it('pasto que comeca no meio do mes conta no mes inteiro', () => {
    /* Espelho de fn_pastos_aplicaveis_mes: a comparacao e' contra o ULTIMO dia do mes
       na entrada e o PRIMEIRO na saida — o pasto que nasce dia 20 ja e' do mes. */
    const nasceEm20 = { ...SEMPRE, id: 'p4', data_inicio: '2025-06-20' };
    expect(pastosAtivosNoMes([nasceEm20], '2025-06')).toHaveLength(1);
    expect(pastosAtivosNoMes([nasceEm20], '2025-05')).toHaveLength(0);
  });
});

describe('o selo do mes — conta so o card de pasto que existia naquele mes', () => {
  it('card orfao em rascunho NAO faz o mes parecer pendente', () => {
    /* Junho: o pasto vigente esta fechado; o orfao, em rascunho. Antes, o mes saia
       'rascunho' — e nao havia como fecha-lo pela tela. */
    const selo = resumirStatusPorMes([
      card('2025-06', 'fechado', SEMPRE),
      card('2025-06', 'rascunho', ENCERRADO_EM_MAIO),
    ]);
    expect(selo[6]).toBe('fechado');
  });

  it('mes que so tem card orfao esta vazio, nao fechado', () => {
    /* ⚠ 'vazio' e' o certo: nao ha nada a fechar ali. Dizer 'fechado' seria afirmar um
       trabalho que ninguem fez, com base num card que nao devia existir. */
    const selo = resumirStatusPorMes([card('2025-07', 'fechado', ENCERRADO_EM_MAIO)]);
    expect(selo[7]).toBe('vazio');
  });

  it('em maio o mesmo card conta — ali o pasto existia', () => {
    const selo = resumirStatusPorMes([
      card('2025-05', 'fechado', SEMPRE),
      card('2025-05', 'rascunho', ENCERRADO_EM_MAIO),
    ]);
    expect(selo[5]).toBe('rascunho');
  });

  it('pasto de divergencia continua fora da conta', () => {
    const divergencia = { ...SEMPRE, tipo_uso: 'divergencia' };
    expect(resumirStatusPorMes([card('2025-06', 'rascunho', divergencia)])[6]).toBe('vazio');
  });

  it('mes sem card nenhum e vazio, e os doze meses vem respondidos', () => {
    const selo = resumirStatusPorMes([card('2025-06', 'fechado', SEMPRE)]);
    expect(Object.keys(selo)).toHaveLength(12);
    expect(selo[1]).toBe('vazio');
    expect(selo[6]).toBe('fechado');
  });
});
