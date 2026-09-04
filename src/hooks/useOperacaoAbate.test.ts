/**
 * O que este teste trava — o payload do abate não pode apagar o que não veio, e
 * `valor` nunca viaja sem `fonte`.
 *
 * ⚠ AS DUAS REGRAS SÃO DO BANCO, e ele as cobra: `oc_salvar_abate` RECUSA um
 * `_valor` sem `_fonte` (sem a unidade, a leitura não sabe se 3 é três por cento
 * ou três reais) e PRESERVA o campo que não veio no payload. A segunda é a
 * perigosa: mandar `null` para dizer "não mexi" apagaria o bônus que o operador
 * digitou na outra aba, e o apagamento seria silencioso.
 *
 * ⚠ O LADO DERIVADO NÃO É GRAVADO. Só `{valor, fonte}` sobem; o outro lado sai de
 * `buildAbateCalculation` na leitura. Se um dia os dois forem gravados, este teste
 * não pega — mas o comentário aqui diz por que não devem ser.
 */
import { describe, it, expect } from 'vitest';
import { paraPayload, daLinha, type LinhaAbate, type AbateRow } from '@/hooks/useOperacaoAbate';

const vazia = (loteId: string): LinhaAbate => ({
  operacaoLoteId: loteId,
  pesoCarcacaKg: null, rendimentoCarcacaPct: null, pesoTotalKgNf: null,
  precoArroba: null, valorBaseOverride: null,
  bonusPrecoce: { valor: null, fonte: null },
  bonusQualidade: { valor: null, fonte: null },
  bonusListaTrace: { valor: null, fonte: null },
  descontoQualidade: { valor: null, fonte: null },
  outrosDescontos: { valor: null, fonte: null },
  funrural: { valor: null, fonte: null },
});

describe('paraPayload — o que sobe para oc_salvar_abate', () => {
  it('linha vazia manda só o id do lote: nada a apagar', () => {
    expect(paraPayload(vazia('lote-1'))).toEqual({ operacao_lote_id: 'lote-1' });
  });

  it('campo nulo NÃO vira chave — o banco preserva o que não veio', () => {
    const l = { ...vazia('lote-1'), precoArroba: 320 };
    const p = paraPayload(l);
    expect(p.preco_arroba).toBe(320);
    expect('peso_carcaca_kg' in p).toBe(false);
    expect('bonus_precoce_valor' in p).toBe(false);
  });

  it('valor sempre acompanhado da fonte — a RPC recusa um sem o outro', () => {
    const l = { ...vazia('lote-1'), funrural: { valor: 1.5, fonte: 'pct' as const } };
    const p = paraPayload(l);
    expect(p.funrural_valor).toBe(1.5);
    expect(p.funrural_fonte).toBe('pct');
  });

  it('outros_descontos aceita @ — fonte própria, não a dos bônus', () => {
    const l = { ...vazia('lote-1'), outrosDescontos: { valor: 2, fonte: 'arroba' as const } };
    expect(paraPayload(l).outros_descontos_fonte).toBe('arroba');
  });

  it('zero é valor e sobe — não é o mesmo que ausente', () => {
    const l = { ...vazia('lote-1'), descontoQualidade: { valor: 0, fonte: 'reais' as const } };
    const p = paraPayload(l);
    expect(p.desconto_qualidade_valor).toBe(0);
    expect(p.desconto_qualidade_fonte).toBe('reais');
  });
});

describe('daLinha — o que volta do banco', () => {
  const cru: AbateRow = {
    operacao_lote_id: 'lote-9', cenario: 'realizado',
    peso_carcaca_kg: 280, rendimento_carcaca_pct: 52.5, peso_total_kg_nf: null,
    preco_arroba: 320, valor_base_override: null,
    bonus_precoce_valor: 3, bonus_precoce_fonte: 'pct',
    bonus_qualidade_valor: null, bonus_qualidade_fonte: null,
    bonus_lista_trace_valor: null, bonus_lista_trace_fonte: null,
    desconto_qualidade_valor: null, desconto_qualidade_fonte: null,
    outros_descontos_valor: 10, outros_descontos_fonte: 'arroba',
    funrural_valor: 1.5, funrural_fonte: 'pct',
  };

  it('traduz par a par, mantendo a fonte', () => {
    const l = daLinha(cru);
    expect(l.pesoCarcacaKg).toBe(280);
    expect(l.bonusPrecoce).toEqual({ valor: 3, fonte: 'pct' });
    expect(l.outrosDescontos).toEqual({ valor: 10, fonte: 'arroba' });
    expect(l.bonusQualidade).toEqual({ valor: null, fonte: null });
  });

  it('fonte desconhecida vira null — não se inventa unidade', () => {
    const l = daLinha({ ...cru, funrural_fonte: 'sei_la' });
    expect(l.funrural.valor).toBe(1.5);
    expect(l.funrural.fonte).toBeNull();
  });

  it('ida e volta preserva o que tinha valor', () => {
    const p = paraPayload(daLinha(cru));
    expect(p.bonus_precoce_valor).toBe(3);
    expect(p.bonus_precoce_fonte).toBe('pct');
    expect('bonus_qualidade_valor' in p).toBe(false);
  });
});
