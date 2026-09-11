import { describe, it, expect } from 'vitest';
import { sentidoNaConta, sinalDoSentido, contaEmFoco, formatarValorLinha } from './sinalPorConta';

const BRADESCO = 'bradesco-id';
const CDB = 'cdb-id';

/** O resgate que motivou o envelope: CDB -> Bradesco, R$ 1.180.941,36. */
const resgate = {
  tipo_operacao: '3-Transferências',
  conta_bancaria_id: CDB,
  conta_destino_id: BRADESCO,
};

describe('sentidoNaConta', () => {
  it('resgate visto pela conta de DESTINO é entrada — o defeito medido', () => {
    expect(sentidoNaConta(resgate, BRADESCO)).toBe('entrada');
    expect(sinalDoSentido(sentidoNaConta(resgate, BRADESCO))).toBe(1);
  });

  it('o mesmo resgate visto pela conta de ORIGEM é saída', () => {
    expect(sentidoNaConta(resgate, CDB)).toBe('saida');
    expect(sinalDoSentido(sentidoNaConta(resgate, CDB))).toBe(-1);
  });

  it('sem conta em foco, transferência não é entrada nem saída', () => {
    expect(sentidoNaConta(resgate, null)).toBe('transferencia');
    /* Continua exibida com o sinal de quem paga. */
    expect(sinalDoSentido(sentidoNaConta(resgate, null))).toBe(-1);
  });

  it('a grafia legada no singular conta como transferência', () => {
    expect(sentidoNaConta({ ...resgate, tipo_operacao: '3-Transferência' }, BRADESCO)).toBe('entrada');
    expect(sentidoNaConta({ ...resgate, tipo_operacao: '3-Transferência' }, null)).toBe('transferencia');
  });

  it('entrada e saída comuns não dependem do foco', () => {
    const entrada = { tipo_operacao: '1-Entradas', conta_bancaria_id: null, conta_destino_id: BRADESCO };
    const saida = { tipo_operacao: '2-Saídas', conta_bancaria_id: BRADESCO, conta_destino_id: null };
    expect(sentidoNaConta(entrada, null)).toBe('entrada');
    expect(sentidoNaConta(entrada, BRADESCO)).toBe('entrada');
    expect(sentidoNaConta(saida, null)).toBe('saida');
    expect(sentidoNaConta(saida, BRADESCO)).toBe('saida');
  });

  /* A cláusula que a cópia do PDF não tinha (`ExtratoGerencialTab:284`). Zero casos na base
     hoje — o teste existe para que continue assim se um aparecer. */
  it('transferência de uma conta para ela mesma não vira entrada', () => {
    const auto = { tipo_operacao: '3-Transferências', conta_bancaria_id: BRADESCO, conta_destino_id: BRADESCO };
    expect(sentidoNaConta(auto, BRADESCO)).toBe('saida');
  });
});

describe('contaEmFoco', () => {
  it('só destino filtrado: o destino é o ponto de vista', () => {
    expect(contaEmFoco('__all__', BRADESCO)).toBe(BRADESCO);
  });
  it('só origem filtrada: a origem é o ponto de vista', () => {
    expect(contaEmFoco(BRADESCO, '__all__')).toBe(BRADESCO);
  });
  it('os DOIS filtrados anulam o ponto de vista', () => {
    expect(contaEmFoco(CDB, BRADESCO)).toBeNull();
  });
  it('nenhum filtrado: sem ponto de vista', () => {
    expect(contaEmFoco('__all__', '__all__')).toBeNull();
    expect(contaEmFoco(null, undefined)).toBeNull();
  });
});

/**
 * COMO A LISTA MOSTRA O VALOR — FIN-LISTA-TRANSF-SINAL-01.
 *
 * ⚠ ESTE BLOCO NASCE DE UM RELATO: "transferência aparece com −R$ e em vermelho, como se
 * fosse saída". Não era erro de conta — era a decisão anterior, registrada em `sinalDoSentido`
 * ("fora de um recorte de conta, o ponto de vista padrão é o de quem paga"). O operador lia
 * prejuízo onde houve mudança de bolso, e a decisão foi revertida para a EXIBIÇÃO.
 */
describe('formatarValorLinha', () => {
  const transf = { tipo_operacao: '3-Transferências', conta_bancaria_id: 'origem', conta_destino_id: 'destino', valor: 1000 };

  it('transferência SEM foco: módulo e cor padrão — não é ganho nem perda', () => {
    const v = formatarValorLinha(transf, null);
    expect(v.sentido).toBe('transferencia');
    expect(v.classe).toBe('text-foreground');
    expect(v.texto).not.toContain('-');
  });

  it('a grafia legada no singular também', () => {
    /* O banco tem 593 linhas em '3-Transferência'. Reconhecer o legado não é perpetuá-lo. */
    const v = formatarValorLinha({ ...transf, tipo_operacao: '3-Transferência' }, null);
    expect(v.classe).toBe('text-foreground');
  });

  it('transferência COM foco no destino volta a ser entrada, verde e positiva', () => {
    /* É o caso dos cinco resgates do Agnaldo: filtrando pela conta que RECEBEU, entrou. */
    const v = formatarValorLinha(transf, 'destino');
    expect(v.sentido).toBe('entrada');
    expect(v.classe).toBe('text-success');
    expect(v.texto).not.toContain('-');
  });

  it('transferência COM foco na origem é saída, vermelha e negativa', () => {
    const v = formatarValorLinha(transf, 'origem');
    expect(v.sentido).toBe('saida');
    expect(v.classe).toBe('text-destructive');
    expect(v.texto).toContain('-');
  });

  it('entrada e saída comuns não mudaram', () => {
    const entrada = formatarValorLinha({ tipo_operacao: '1-Entradas', valor: 500 }, null);
    expect(entrada.classe).toBe('text-success');
    expect(entrada.texto).not.toContain('-');
    const saida = formatarValorLinha({ tipo_operacao: '2-Saídas', valor: 500 }, null);
    expect(saida.classe).toBe('text-destructive');
    expect(saida.texto).toContain('-');
  });

  it('valor já negativo no banco não vira positivo por acidente', () => {
    /* A coluna guarda módulo, mas nem sempre guardou: o `abs` é o que torna a regra estável. */
    expect(formatarValorLinha({ tipo_operacao: '2-Saídas', valor: -500 }, null).texto)
      .toBe(formatarValorLinha({ tipo_operacao: '2-Saídas', valor: 500 }, null).texto);
  });
});
