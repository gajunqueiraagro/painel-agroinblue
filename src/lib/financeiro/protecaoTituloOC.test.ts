import { describe, it, expect } from 'vitest';
import { isTituloOC, detectarViolacoesEstruturaisOC } from './protecaoTituloOC';

describe('isTituloOC — detecção estrutural de origem OC', () => {
  it('reconhece origem_lancamento=operacao_comercial', () => {
    expect(isTituloOC({ origem_lancamento: 'operacao_comercial' })).toBe(true);
  });
  it('reconhece origem_tipo iniciando por oc:', () => {
    expect(isTituloOC({ origem_lancamento: 'manual', origem_tipo: 'oc:obrigacao:principal:principal' })).toBe(true);
  });
  it('reconhece vínculo reverso de parte da OC mesmo sem marcador na origem', () => {
    expect(isTituloOC({ origem_lancamento: 'manual', origem_tipo: null }, true)).toBe(true);
  });
  it('NÃO marca título manual como OC', () => {
    expect(isTituloOC({ origem_lancamento: 'manual', origem_tipo: null }, false)).toBe(false);
  });
  it('NÃO marca importação/ofx/legado como OC', () => {
    expect(isTituloOC({ origem_lancamento: 'ofx' })).toBe(false);
    expect(isTituloOC({ origem_lancamento: 'importacao_incremental' })).toBe(false);
    expect(isTituloOC({})).toBe(false);
  });
});

describe('detectarViolacoesEstruturaisOC — recusa de alteração estrutural', () => {
  const base = {
    valor: 27062.5, favorecido_id: 'fav-1', tipo_operacao: '2-Saídas',
    macro_custo: 'Investimento em Bovinos', grupo_custo: 'Compra de Bovinos',
    centro_custo: 'Compra de Bovinos', subcentro: 'Investimento Compra Bovinos Machos',
    data_competencia: '2026-07-27',
  };

  it('sem alteração estrutural → nenhuma violação (permite salvar campos permitidos)', () => {
    expect(detectarViolacoesEstruturaisOC({ ...base }, base)).toEqual([]);
  });
  it('alterar data_competencia → viola (competência é estrutural na OC)', () => {
    expect(detectarViolacoesEstruturaisOC({ ...base, data_competencia: '2026-08-01' }, base)).toContain('competência');
  });
  it('alterar apenas campos permitidos (data_pagamento/conta/descrição) NÃO viola', () => {
    // data_pagamento e demais campos permitidos não fazem parte da estrutura da obrigação:
    // o detector só olha os campos estruturais, então uma edição permitida resulta em [].
    expect(detectarViolacoesEstruturaisOC({ ...base }, base)).toEqual([]);
  });
  it('alterar valor → viola', () => {
    expect(detectarViolacoesEstruturaisOC({ ...base, valor: 30000 }, base)).toContain('valor');
  });
  it('diferença de centavo dentro da tolerância NÃO viola', () => {
    expect(detectarViolacoesEstruturaisOC({ ...base, valor: 27062.503 }, base)).toEqual([]);
  });
  it('alterar favorecido → viola', () => {
    expect(detectarViolacoesEstruturaisOC({ ...base, favorecido_id: 'fav-2' }, base)).toContain('favorecido');
  });
  it('alterar tipo_operacao → viola', () => {
    expect(detectarViolacoesEstruturaisOC({ ...base, tipo_operacao: '1-Entradas' }, base)).toContain('tipo de operação');
  });
  it('alterar subcentro (classificação) → viola', () => {
    expect(detectarViolacoesEstruturaisOC({ ...base, subcentro: 'Investimento Compra Bovinos Fêmeas' }, base)).toContain('classificação');
  });
  it('alterar macro/grupo/centro → viola classificação', () => {
    expect(detectarViolacoesEstruturaisOC({ ...base, macro_custo: 'Outro' }, base)).toContain('classificação');
    expect(detectarViolacoesEstruturaisOC({ ...base, grupo_custo: 'Outro' }, base)).toContain('classificação');
    expect(detectarViolacoesEstruturaisOC({ ...base, centro_custo: 'Outro' }, base)).toContain('classificação');
  });
  it('múltiplas alterações → lista deduplicada de campos', () => {
    const viol = detectarViolacoesEstruturaisOC({ ...base, valor: 1, favorecido_id: 'x', subcentro: 'y', macro_custo: 'z' }, base);
    expect(viol).toContain('valor');
    expect(viol).toContain('favorecido');
    expect(viol).toContain('classificação');
    // classificação aparece uma única vez mesmo com subcentro+macro alterados
    expect(viol.filter(v => v === 'classificação')).toHaveLength(1);
  });
});
