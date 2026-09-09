import { describe, it, expect } from 'vitest';
import { sentidoNaConta, sinalDoSentido, contaEmFoco } from './sinalPorConta';

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
