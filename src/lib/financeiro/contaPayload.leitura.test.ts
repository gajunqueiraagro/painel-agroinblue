/**
 * ⚠ A REGRA DE LEITURA É A DE ESCRITA AO CONTRÁRIO, e estes testes existem para as duas não
 * poderem divergir: `montarPayloadConta` guarda a entrada em `conta_destino_id`, então quem
 * lê `conta_bancaria_id` direto vê VAZIO em toda entrada. Foi o que aconteceu na exportação
 * do Financeiro — 246 das 262 entradas de 2026 do NJ saíram sem conta.
 */
import { describe, it, expect } from 'vitest';
import { contasExibidasDoLancamento, montarPayloadConta } from './contaPayload';

const ORIGEM = 'conta-origem';
const DESTINO = 'conta-destino';

describe('qual conta o lançamento mostra', () => {
  it('entrada mostra a conta que RECEBEU', () => {
    expect(contasExibidasDoLancamento('1-Entradas', null, DESTINO))
      .toEqual({ forma: 'unica', contaId: DESTINO });
  });

  it('entrada antiga, gravada antes do helper, ainda mostra a conta que tem', () => {
    /* 25 das 262 entradas de 2026 do NJ têm só `conta_bancaria_id`. Sem o fallback elas
       sairiam vazias por fidelidade a uma convenção que nunca seguiram. */
    expect(contasExibidasDoLancamento('1-Entradas', ORIGEM, null))
      .toEqual({ forma: 'unica', contaId: ORIGEM });
  });

  it('saída mostra a conta de onde SAIU', () => {
    expect(contasExibidasDoLancamento('2-Saídas', ORIGEM, null))
      .toEqual({ forma: 'unica', contaId: ORIGEM });
  });

  it('transferência mostra as DUAS pontas', () => {
    expect(contasExibidasDoLancamento('3-Transferências', ORIGEM, DESTINO))
      .toEqual({ forma: 'par', origemId: ORIGEM, destinoId: DESTINO });
  });

  it('a variante legada de importação também é transferência', () => {
    expect(contasExibidasDoLancamento('3-Transferência', ORIGEM, DESTINO).forma).toBe('par');
  });

  it('sem conta nenhuma, nada — nunca um id inventado', () => {
    expect(contasExibidasDoLancamento('2-Saídas', null, null))
      .toEqual({ forma: 'unica', contaId: null });
  });
});

describe('leitura e escrita não podem divergir', () => {
  /* ⚠ O teste que importa: o que `montarPayloadConta` grava é o que
     `contasExibidasDoLancamento` acha. Se alguém mudar um lado, este quebra. */
  it.each(['1-Entradas', '2-Saídas'] as const)('%s: o gravado é o exibido', (tipo) => {
    const payload = montarPayloadConta(tipo, ORIGEM);
    const exibida = contasExibidasDoLancamento(tipo, payload.conta_bancaria_id, payload.conta_destino_id);
    expect(exibida).toEqual({ forma: 'unica', contaId: ORIGEM });
  });

  it('transferência: o par gravado é o par exibido', () => {
    const payload = montarPayloadConta('3-Transferências', ORIGEM, DESTINO);
    expect(contasExibidasDoLancamento('3-Transferências', payload.conta_bancaria_id, payload.conta_destino_id))
      .toEqual({ forma: 'par', origemId: ORIGEM, destinoId: DESTINO });
  });
});
