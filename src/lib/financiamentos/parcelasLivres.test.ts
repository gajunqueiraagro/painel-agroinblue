/**
 * PARCELAS LIVRES — a soma, a diferença, os dois gestos e o payload (PARC-LIVRES-01).
 * O caso é o da nota que motivou o PR, MONTADO EM MEMÓRIA (nenhum XML no repositório): 110.000,00 em sete duplicatas.
 */
import { describe, expect, it } from 'vitest';
import {
  FRASE_SOMA_NAO_FECHA, acrescentarParcela, deOndeVeio, editarValor, editarVencimento, houveEdicao, indiceQueRecebeADiferenca,
  motivoDaPaga, motivoNaoSalva, mudancaDaParcela, parcelasComoPrevistas, parcelasDaNota, parcelasDoMensal, parcelasParaPayload,
  porDiferencaNaUltima, resumoDasParcelas, retirarParcela, type ParcelaLivre,
} from './parcelasLivres';
import { montarPayloadParcelamento, preverParcelas } from './montarPayloadParcelamento';

const SETE = [
  { vencimento: '2026-05-23', valorCent: 3300000 },
  { vencimento: '2026-06-19', valorCent: 1283334 },
  { vencimento: '2026-07-17', valorCent: 1283334 },
  { vencimento: '2026-08-14', valorCent: 1283333 },
  { vencimento: '2026-09-11', valorCent: 1283333 },
  { vencimento: '2026-10-09', valorCent: 1283333 },
  { vencimento: '2026-11-06', valorCent: 1283333 },
];
const COMPRA = 11000000;
const nota = () => parcelasDaNota(SETE);

describe('a soma e a diferença, em centavos inteiros', () => {
  it('(b) as sete duplicatas: 7 parcelas, soma 110.000,00, diferença 0,00 — e nada trava o Salvar', () => {
    expect(resumoDasParcelas(nota(), COMPRA)).toEqual({ n: 7, somaCent: 11000000, compraCent: 11000000, diferencaCent: 0 });
    expect(motivoNaoSalva(nota(), COMPRA)).toBeNull();
  });
  it('(c) trocar 12.833,33 por 12.333,33: diferença de 500,00 (a soma não chega) e o Salvar apagado com a frase', () => {
    const p = editarValor(nota(), 'nota-4', 1233333);
    expect(resumoDasParcelas(p, COMPRA)).toEqual({ n: 7, somaCent: 10950000, compraCent: 11000000, diferencaCent: -50000 });
    expect(motivoNaoSalva(p, COMPRA)).toBe(FRASE_SOMA_NAO_FECHA);
    expect(FRASE_SOMA_NAO_FECHA).toBe('A soma das parcelas não fecha com a compra.');
    expect(motivoNaoSalva(p, COMPRA, 'o contrato')).toBe('A soma das parcelas não fecha com o contrato.');
  });
  it('UM centavo de diferença trava (nunca arredonda, nunca engole)', () => {
    const p = editarValor(nota(), 'nota-7', 1283332);
    expect(resumoDasParcelas(p, COMPRA).diferencaCent).toBe(-1);
    expect(motivoNaoSalva(p, COMPRA)).toBe(FRASE_SOMA_NAO_FECHA);
    expect(resumoDasParcelas(editarValor(nota(), 'nota-7', 1283334), COMPRA).diferencaCent).toBe(1);
  });
  it('0,10 + 0,20 fecha com 0,30 (centavos inteiros, sem resíduo de ponto flutuante)', () => {
    const p = parcelasDaNota([{ vencimento: '2026-01-01', valorCent: 10 }, { vencimento: '2026-02-01', valorCent: 20 }]);
    expect(resumoDasParcelas(p, 30).diferencaCent).toBe(0);
  });
  it('o motivo segue a ordem do que se resolve primeiro: sem parcela, sem vencimento, sem valor, soma', () => {
    expect(motivoNaoSalva([], COMPRA)).toBe('Informe ao menos uma parcela.');
    const mais = acrescentarParcela(nota(), 'x');
    expect(motivoNaoSalva(mais, COMPRA)).toBe('Parcela 8 sem vencimento.');
    expect(motivoNaoSalva(editarVencimento(mais, 'x', '2026-12-04'), COMPRA)).toBe('Parcela 8 sem valor.');
  });
});

describe('os dois gestos — o sistema não escolhe', () => {
  it('"Pôr a diferença na última": a parcela 7 absorve os 500,00 e a soma fecha', () => {
    const p = editarValor(nota(), 'nota-4', 1233333);
    const fechada = porDiferencaNaUltima(p, COMPRA)!;
    expect(fechada[6].valorCent).toBe(1283333 + 50000);
    expect(fechada.slice(0, 6)).toEqual(p.slice(0, 6));
    expect(resumoDasParcelas(fechada, COMPRA).diferencaCent).toBe(0);
  });
  it('soma ACIMA da compra: a última desce; se ficaria zerada ou negativa, o gesto não existe', () => {
    const p = editarValor(nota(), 'nota-1', 3300000 + 100);
    expect(porDiferencaNaUltima(p, COMPRA)![6].valorCent).toBe(1283333 - 100);
    expect(porDiferencaNaUltima(editarValor(nota(), 'nota-1', 3300000 + 1283333), COMPRA)).toBeNull();
  });
  it('"A compra vale a soma": a soma É o novo valor — com ele a diferença zera sem tocar em parcela', () => {
    const p = editarValor(nota(), 'nota-4', 1233333);
    const { somaCent } = resumoDasParcelas(p, COMPRA);
    expect(somaCent).toBe(10950000);
    expect(resumoDasParcelas(p, somaCent).diferencaCent).toBe(0);
  });
});

describe('os gestos de lista', () => {
  it('"+ Parcela" nasce SEM vencimento e SEM valor (o sistema não fixa dia nem valor)', () => {
    const p = acrescentarParcela(nota(), 'x');
    expect(p).toHaveLength(8);
    expect(p[7]).toEqual({ chave: 'x', vencimento: '', valorCent: 0, origem: 'nova', era: null });
    expect(deOndeVeio(p[7])).toBe('acrescentada');
  });
  it('"✕" tira a parcela e a numeração do payload refaz pela posição', () => {
    const p = retirarParcela(nota(), 'nota-2');
    expect(p.map((x) => x.chave)).toEqual(['nota-1', 'nota-3', 'nota-4', 'nota-5', 'nota-6', 'nota-7']);
    expect(parcelasParaPayload(p).map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('"De onde veio": a duplicata da nota; editada diz o que era (o valor, a data, ou os dois)', () => {
    expect(deOndeVeio(nota()[0])).toBe('duplicata da nota');
    const v = editarValor(nota(), 'nota-4', 1233333)[3];
    expect(deOndeVeio(v)).toBe('editado · era 12.833,33');
    expect(mudancaDaParcela(v)).toEqual({ vencimento: false, valor: true });
    const d = editarVencimento(nota(), 'nota-4', '2026-08-20')[3];
    expect(deOndeVeio(d)).toBe('editado · era 14/08/26');
    expect(deOndeVeio(editarValor([d], 'nota-4', 1)[0])).toBe('editado · era 14/08/26 · 12.833,33');
    /* voltar ao valor de antes tira o "editado" */
    expect(deOndeVeio(editarValor([v], 'nota-4', 1283333)[0])).toBe('duplicata da nota');
  });
  it('houve edição? — valor, data, parcela a mais e parcela a menos contam; a lista igual não', () => {
    const base = nota();
    expect(houveEdicao(nota(), base)).toBe(false);
    expect(houveEdicao(editarValor(nota(), 'nota-1', 1), base)).toBe(true);
    expect(houveEdicao(editarVencimento(nota(), 'nota-1', '2026-05-24'), base)).toBe(true);
    expect(houveEdicao(acrescentarParcela(nota(), 'x'), base)).toBe(true);
    expect(houveEdicao(retirarParcela(nota(), 'nota-7'), base)).toBe(true);
  });
  it('a prévia mensal como ponto de partida: mesmos valores e datas do "Igual todo mês"', () => {
    const previa = preverParcelas(100, 3, '2026-01-31', 1);
    const p = parcelasDoMensal(previa);
    expect(p.map((x) => [x.vencimento, x.valorCent])).toEqual([['2026-01-31', 3333], ['2026-02-28', 3333], ['2026-03-31', 3334]]);
    expect(parcelasComoPrevistas(p)).toEqual(previa);
    expect(deOndeVeio(p[0])).toBe('igual todo mês');
  });
});

describe('parcela paga nunca muda (passo 2)', () => {
  const comPaga = (): ParcelaLivre[] => nota().map((p, i) => (i === 0 || i === 6 ? { ...p, paga: { em: '2026-05-23' } } : p));
  it('editar valor, editar vencimento e tirar NÃO alcançam a paga', () => {
    const p = comPaga();
    expect(editarValor(p, 'nota-1', 1)).toEqual(p);
    expect(editarVencimento(p, 'nota-1', '2027-01-01')).toEqual(p);
    expect(retirarParcela(p, 'nota-1')).toEqual(p);
    expect(motivoDaPaga(p[0])).toBe('paga em 23/05/26: data e valor não mudam');
    expect(motivoDaPaga(p[1])).toBeNull();
  });
  it('a diferença vai para a última NÃO paga; sem nenhuma em aberto o gesto não existe', () => {
    const p = editarValor(comPaga(), 'nota-4', 1233333);
    expect(indiceQueRecebeADiferenca(p)).toBe(5);
    const f = porDiferencaNaUltima(p, COMPRA)!;
    expect(f[5].valorCent).toBe(1283333 + 50000);
    expect(f[6]).toEqual(p[6]);
    const todas = nota().map((x) => ({ ...x, paga: { em: null } }));
    expect(porDiferencaNaUltima(todas, COMPRA + 1)).toBeNull();
  });
});

describe('o payload da RPC', () => {
  const GERAIS = {
    fazendaId: 'faz', descricao: ' Trator ', valorTotal: 110000, totalParcelas: 7, dataPrimeiraParcela: '2026-05-23',
    dataCompetencia: '2026-04-25', intervaloMeses: 1, favorecidoId: 'forn', formaPagamento: 'Boleto', contaBancariaId: 'bb',
    tipoFinanciamento: 'pecuaria', numeroContrato: null, observacao: null,
  };
  const CLASSE = { plano_conta_id: 'pl', safra_id: null, cultura: null, fase: null };
  const DE_SEMPRE = {
    cliente_id: 'cli', fazenda_id: 'faz', descricao: 'Trator', valor_total: 110000, total_parcelas: 7,
    data_primeira_parcela: '2026-05-23', data_competencia: '2026-04-25', intervalo_meses: 1, tipo_operacao: '2-Saídas',
    plano_conta_id: 'pl', safra_id: null, cultura: null, fase: null, favorecido_id: 'forn', forma_pagamento: 'Boleto',
    conta_bancaria_id: 'bb', tipo_financiamento: 'pecuaria', numero_contrato: null, observacao: null,
  };
  it('(a) SEM a lista: as 19 chaves de sempre, na mesma ordem, e NENHUMA chave `parcelas` (nem nula)', () => {
    for (const parcelas of [undefined, null, []]) {
      const p = montarPayloadParcelamento('cli', { ...GERAIS, parcelas }, CLASSE);
      expect(p).toEqual(DE_SEMPRE);
      expect(Object.keys(p)).toEqual(Object.keys(DE_SEMPRE));
      expect(JSON.stringify(p)).toBe(JSON.stringify(DE_SEMPRE));
    }
    expect(JSON.stringify(montarPayloadParcelamento('cli', GERAIS, CLASSE))).toBe(JSON.stringify(DE_SEMPRE));
  });
  it('COM a lista: a lista viaja inteira; o número de parcelas é o tamanho dela e a 1ª parcela é a da lista', () => {
    const lista = parcelasParaPayload(nota());
    expect(lista).toEqual([
      { numero: 1, data_vencimento: '2026-05-23', valor: 33000 },
      { numero: 2, data_vencimento: '2026-06-19', valor: 12833.34 },
      { numero: 3, data_vencimento: '2026-07-17', valor: 12833.34 },
      { numero: 4, data_vencimento: '2026-08-14', valor: 12833.33 },
      { numero: 5, data_vencimento: '2026-09-11', valor: 12833.33 },
      { numero: 6, data_vencimento: '2026-10-09', valor: 12833.33 },
      { numero: 7, data_vencimento: '2026-11-06', valor: 12833.33 },
    ]);
    const p = montarPayloadParcelamento('cli', { ...GERAIS, totalParcelas: 2, dataPrimeiraParcela: '2099-01-01', parcelas: lista }, CLASSE);
    expect(p).toEqual({ ...DE_SEMPRE, parcelas: lista });
    expect(p.total_parcelas).toBe(7);
    expect(p.data_primeira_parcela).toBe('2026-05-23');
  });
});
