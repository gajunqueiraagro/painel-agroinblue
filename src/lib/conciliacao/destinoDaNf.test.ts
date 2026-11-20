/** CONC-DESCONCILIAR-EDSON-01 (R2) — a leitura da pergunta da NF e a escolha que vai no item. */
import { describe, it, expect } from 'vitest';
import { fraseDaEscolha, itensComDestino, perguntaNfDaResposta } from './destinoDaNf';

const brl = (n: number) => n.toFixed(2).replace('.', ',');

describe('perguntaNfDaResposta', () => {
  it('lê a pergunta do banco (a mais → só juros; a menos → desconto e parcial)', () => {
    expect(perguntaNfDaResposta({ ok: true, pergunta_nf: { lancamento_id: 'n', frase: 'A NF nº 1 vale…', sentido: 'a_mais', opcoes: ['juros'], diferenca: 100 } }))
      .toEqual({ lancamentoId: 'n', frase: 'A NF nº 1 vale…', sentido: 'a_mais', opcoes: ['juros'], diferenca: 100 });
    expect(perguntaNfDaResposta({ ok: false, motivo: 'nf_diferenca', pergunta_nf: { lancamento_id: 'n', frase: 'f', sentido: 'a_menos', opcoes: ['desconto', 'parcial'], diferenca: '-4863.35' } })?.opcoes)
      .toEqual(['desconto', 'parcial']);
  });
  it('sem pergunta, ou pergunta torta, é null (nunca inventa opção)', () => {
    expect(perguntaNfDaResposta({ ok: true })).toBeNull();
    expect(perguntaNfDaResposta(null)).toBeNull();
    expect(perguntaNfDaResposta({ pergunta_nf: { lancamento_id: 'n', frase: 'f', sentido: 'a_mais', opcoes: ['apagar'] } })).toBeNull();
    expect(perguntaNfDaResposta({ pergunta_nf: { frase: 'f', sentido: 'a_mais', opcoes: ['juros'] } })).toBeNull();
  });
});

describe('itensComDestino', () => {
  const itens = [{ lancamento_id: 'a', valor: 10 }, { lancamento_id: 'n', valor: 386.65 }];
  it('só a NF escolhida leva o destino; desconto leva o motivo', () => {
    expect(itensComDestino(itens, { n: { destino: 'parcial' } })).toEqual([{ lancamento_id: 'a', valor: 10 }, { lancamento_id: 'n', valor: 386.65, destino: 'parcial' }]);
    expect(itensComDestino(itens, { n: { destino: 'desconto', motivo: ' pagou à vista ' } })[1]).toEqual({ lancamento_id: 'n', valor: 386.65, destino: 'desconto', motivo_desconto: 'pagou à vista' });
  });
  it('taxa leva a conta escolhida; sem conta não vai (FILA 18/11 09:22)', () => {
    expect(itensComDestino(itens, { n: { destino: 'taxa', planoContaId: 'pc-1', planoNome: 'Tarifas' } })[1]).toEqual({ lancamento_id: 'n', valor: 386.65, destino: 'taxa', plano_conta_id: 'pc-1' });
    expect(itensComDestino(itens, { n: { destino: 'taxa' } })[1]).toEqual({ lancamento_id: 'n', valor: 386.65 });
    expect(perguntaNfDaResposta({ pergunta_nf: { lancamento_id: 'n', frase: 'f', sentido: 'a_mais', opcoes: ['juros', 'taxa'] } })?.opcoes).toEqual(['juros', 'taxa']);
  });
  it('desconto sem motivo não vai (o banco pediria o motivo)', () => {
    expect(itensComDestino(itens, { n: { destino: 'desconto', motivo: '  ' } })[1]).toEqual({ lancamento_id: 'n', valor: 386.65 });
  });
});

describe('outra nota (falta lançar) — 115570', () => {
  const itens = [{ lancamento_id: 'n', valor: 3404.16 }];
  it('a pergunta com o 3º gesto é lida; o item leva só as notas preenchidas (nº e/ou valor)', () => {
    expect(perguntaNfDaResposta({ pergunta_nf: { lancamento_id: 'n', frase: 'f', sentido: 'a_mais', opcoes: ['juros', 'taxa', 'outra_nota'] } })?.opcoes)
      .toEqual(['juros', 'taxa', 'outra_nota']);
    expect(itensComDestino(itens, { n: { destino: 'outra_nota', outrasNotas: [{ numero: ' 270, 272 ', valor: null }, { numero: '', valor: null }] } })[0])
      .toEqual({ lancamento_id: 'n', valor: 3404.16, destino: 'outra_nota', outras_notas: [{ numero: '270, 272' }] });
    expect(itensComDestino(itens, { n: { destino: 'outra_nota', outrasNotas: [{ numero: '270', valor: 1200.164 }, { numero: '272', valor: 800 }] } })[0])
      .toEqual({ lancamento_id: 'n', valor: 3404.16, destino: 'outra_nota', outras_notas: [{ numero: '270', valor: 1200.16 }, { numero: '272', valor: 800 }] });
  });
  it('tudo em branco: vai o destino sem notas (uma linha "Falta nota" sem nº)', () => {
    expect(itensComDestino(itens, { n: { destino: 'outra_nota', outrasNotas: [{ numero: ' ', valor: null }] } })[0])
      .toEqual({ lancamento_id: 'n', valor: 3404.16, destino: 'outra_nota' });
  });
  it('a frase diz os números e a pendência', () => {
    expect(fraseDaEscolha({ destino: 'outra_nota', outrasNotas: [{ numero: '270', valor: null }, { numero: '272', valor: null }] }, 2000.16, brl))
      .toBe('R$ 2000,16 viram "Falta nota nº 270, 272" (a classificar), no mesmo extrato; a NF fica com o valor dela e fica a pendência de anexar a nota.');
    expect(fraseDaEscolha({ destino: 'outra_nota' }, 2000.16, brl)).toBe('R$ 2000,16 viram "Falta nota" (a classificar), no mesmo extrato; a NF fica com o valor dela e fica a pendência de anexar a nota.');
  });
});

describe('fraseDaEscolha', () => {
  it('diz o valor e o que acontece com a NF', () => {
    expect(fraseDaEscolha({ destino: 'juros' }, 100, brl)).toBe('R$ 100,00 viram "Juros/multa da NF", no mesmo extrato; a NF fica com o valor dela.');
    expect(fraseDaEscolha({ destino: 'desconto', motivo: 'à vista' }, -100, brl)).toBe('R$ 100,00 viram "Desconto obtido" (sem caixa) · à vista; a NF fica quitada.');
    expect(fraseDaEscolha({ destino: 'taxa', planoContaId: 'x', planoNome: 'Tarifas Bancárias' }, 21.8, brl)).toBe('R$ 21,80 viram "Taxa (sem nota) da NF" em Tarifas Bancárias, no mesmo extrato; a NF fica com o valor dela.');
    expect(fraseDaEscolha({ destino: 'parcial' }, -4863.35, brl)).toBe('R$ 4863,35 ficam em aberto na NF, para o próximo pagamento.');
  });
});
