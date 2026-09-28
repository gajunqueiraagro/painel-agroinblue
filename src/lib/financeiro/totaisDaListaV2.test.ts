/**
 * OC-VENDA-ENTREGAS-01b (D2) — os totais do Financeiro V2 separam caixa de sem caixa, e NADA E' CONTADO DUAS VEZES.
 * O fixture sao as duas linhas da conta corrente da 232c05aa (uma entrega e um recebimento) mais um barter de saida e uma
 * transferencia. O caso que justifica o arquivo afirma a soma dos baldes = a soma de antes: sem ele, uma funcao que
 * mandasse a entrega para os DOIS totais passaria verde nos casos de cada balde.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { totaisDaListaV2, tipoDaLinha } from './totaisDaListaV2';
import { totaisNoCliente } from './listaPaginadaV2';

const ENTREGA = { valor: 565521.66, tipo_operacao: '1-Entradas', sinal: '1', sem_movimentacao_caixa: true, origem_tipo: 'oc:entrega',
  subcentro: 'Venda de Desmama Machos', compoe_dre: true, conta_bancaria_id: null };
const RECEBIMENTO = { valor: 992140.99, tipo_operacao: '1-Entradas', sinal: '1', sem_movimentacao_caixa: false, origem_tipo: null,
  subcentro: 'Adiantamento de Clientes', compoe_dre: false, conta_bancaria_id: null };
const BARTER_INSUMO = { valor: 1000, tipo_operacao: '2-Saídas', sinal: '-1', sem_movimentacao_caixa: true, origem_tipo: null,
  subcentro: 'Fertilizantes', compoe_dre: true, conta_bancaria_id: null };
const TRANSF = { valor: 50000, tipo_operacao: '3-Transferências', sinal: '-1', sem_movimentacao_caixa: false, origem_tipo: null,
  subcentro: null, compoe_dre: false, conta_bancaria_id: 'a', conta_destino_id: 'b' };
const LINHAS = [ENTREGA, RECEBIMENTO, BARTER_INSUMO, TRANSF];

describe('totais do Financeiro V2: caixa x sem caixa', () => {
  it('a entrega sai das Entradas de caixa e vai para Receita sem caixa; o recebimento fica no caixa', () => {
    const t = totaisDaListaV2(LINHAS, null);
    expect(t.entradas).toBe(992140.99);
    expect(t.entradasSemCaixa).toBe(565521.66);
    expect(t.saidas).toBe(0);
    expect(t.saidasSemCaixa).toBe(1000);
    expect(t.transferencias).toBe(50000);
  });

  it("nada contado duas vezes: a soma dos cinco baldes e' a soma de todas as linhas", () => {
    const t = totaisDaListaV2(LINHAS, null);
    const soma = t.entradas + t.entradasSemCaixa + t.saidas + t.saidasSemCaixa + t.transferencias;
    expect(soma).toBeCloseTo(LINHAS.reduce((a, l) => a + l.valor, 0), 2);
  });

  it('a referencia em memoria da RPC (totaisNoCliente) faz o mesmo corte', () => {
    const t = totaisNoCliente(LINHAS.map((l, i) => ({ ...l, id: String(i) })));
    expect(t).toEqual({ entradas: 992140.99, saidas: 50000, entradasSemCaixa: 565521.66, saidasSemCaixa: 1000 });
  });

  it('Tipo da linha; a coluna "Vai para" saiu da lista e o Tipo e os cinco totais ficaram (lido da fonte)', () => {
    expect(tipoDaLinha(ENTREGA)).toBe('Entrega');
    expect(tipoDaLinha(RECEBIMENTO)).toBe('Recebimento');
    expect(tipoDaLinha(BARTER_INSUMO)).toBe('Sem caixa');
    expect(tipoDaLinha({ subcentro: 'Adiantamento a Fornecedores' })).toBe('Pagamento');
    /* FIN-V2-VAI-PARA-FORA-01: a tela normal e a ampliada sao a MESMA tabela (o Ampliado so' acrescenta C. Origem/C. Destino). */
    const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
    expect(tela).not.toContain('>Vai para<');
    expect(tela).not.toContain('data-vai-para');
    expect(tela).not.toContain('vaiParaDaLinha');
    /* a busca sabe achar: o cabecalho vizinho e os cinco totais continuam la' */
    expect(tela).toContain('>Tipo</th>');
    for (const rotulo of ['Entradas de caixa:', 'Receita sem caixa:', 'Saídas de caixa:', 'Despesa sem caixa:', 'Transf.:']) {
      expect(tela).toContain(rotulo);
    }
  });

  it('D3: Contas a Pagar e Receber tira o sem caixa SEMPRE (lido da fonte: a consulta nao se monta em teste)', () => {
    const fonte = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
    expect(fonte).toContain(".or('sem_movimentacao_caixa.is.null,sem_movimentacao_caixa.eq.false')");
    /* a busca sabe achar: o corte de transferencia, vizinho, esta' la' */
    expect(fonte).toContain(".or('tipo_operacao.not.like.3-*')");
  });
});
