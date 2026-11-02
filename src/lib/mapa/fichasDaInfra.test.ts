/**
 * INFRA-FICHAS-PATR-01 — o catálogo das fichas (as mesmas chaves e formas do banco, pelos exemplos que o teste SQL também grava), a ficha
 * limpa que vai ao banco, os metros úteis, a vida útil sugerida (D6), a categoria (D2), a descrição do bem e o `p_bem` do criar bem.
 */
import { describe, expect, it } from 'vitest';
import exemplos from './fichasDaInfra.exemplos.json';
import {
  FICHAS, categoriaDoTipo, descricaoDaFicha, limparFicha, lerFicha, metrosUteis, textoDoCampo, vidaUtilSugerida, type Ficha,
} from './fichasDaInfra';
import { TIPOS_INFRA, argumentoDaInfra, ehTipoInfra } from './infraestrutura';
import { argumentoDoBem } from '@/components/mapa-geo/CriarBemDaInfra';

const EXEMPLOS: Record<string, Ficha> = exemplos;

describe('o catálogo × os exemplos (que o teste SQL grava no banco)', () => {
  it('os 14 tipos têm ficha e exemplo, com as MESMAS chaves', () => {
    expect(Object.keys(FICHAS).sort()).toEqual(TIPOS_INFRA.map(t => t.tipo).sort());
    expect(Object.keys(EXEMPLOS).sort()).toEqual(TIPOS_INFRA.map(t => t.tipo).sort());
    for (const [tipo, ex] of Object.entries(EXEMPLOS)) {
      if (!ehTipoInfra(tipo)) throw new Error(tipo);
      expect(FICHAS[tipo].campos.map(c => c.chave).sort()).toEqual(Object.keys(ex).sort());
    }
  });
  it('cada valor do exemplo tem a forma do campo e sobrevive à limpeza', () => {
    for (const [tipo, ex] of Object.entries(EXEMPLOS)) {
      if (!ehTipoInfra(tipo)) throw new Error(tipo);
      expect(limparFicha(tipo, ex)).toEqual(ex);
    }
  });
});

describe('a ficha que vai ao banco', () => {
  it('só os campos do tipo e só os preenchidos; texto aparado; inteiro arredondado; lados 1|2', () => {
    expect(limparFicha('cocho', { material: '  Madeira ', comprimento_m: 0, lados: 3, coberto: false, capacidade_l: 10, uso: '' }))
      .toEqual({ material: 'Madeira', coberto: false });
    expect(limparFicha('curral', { divisoes: 5.6, area_m2: 900 })).toEqual({ divisoes: 6, area_m2: 900 });
    expect(lerFicha({ a: 1, b: null, c: { x: 1 }, d: 'x' })).toEqual({ a: 1, d: 'x' });
    expect(lerFicha(null)).toEqual({});
  });
  it('o p_infra leva a ficha só quando vem (sem ela, a gravada não muda)', () => {
    const base = { fazendaId: 'f', tipo: 'cocho' as const, lon: -47, lat: -20, nome: '', pastoId: null, bemId: null, observacao: '' };
    expect('ficha' in argumentoDaInfra(base)).toBe(false);
    expect(argumentoDaInfra({ ...base, ficha: { lados: 2 } })).toMatchObject({ ficha: { lados: 2 } });
  });
});

describe('metros úteis, vida útil (D6), categoria (D2)', () => {
  it('metros lineares úteis = comprimento × lados', () => {
    expect(metrosUteis({ comprimento_m: 12, lados: 2 })).toBe(24);
    expect(metrosUteis({ comprimento_m: 12 })).toBeNull();
  });
  it('vida útil sugerida pela tabela do pedido (concreto 20, madeira 15…); material fora da tabela = a da categoria', () => {
    expect(vidaUtilSugerida('cocho', { material: 'Concreto' })).toBe(20);
    expect(vidaUtilSugerida('cocho', { material: 'madeira' })).toBe(15);
    expect(vidaUtilSugerida('cocho', { material: 'Pneu' })).toBe(5);
    expect(vidaUtilSugerida('cocho', { material: 'Bambu' })).toBeNull();
    expect(vidaUtilSugerida('cerca', { modelo: 'Elétrica' })).toBe(10);
    expect(vidaUtilSugerida('cerca', { modelo: 'Arame liso' })).toBe(15);
    expect(vidaUtilSugerida('curral', { material: 'Concreto' })).toBe(25);
    expect(vidaUtilSugerida('balanca', {})).toBe(10);
  });
  it('a categoria do Patrimônio de cada tipo, entre as que existem', () => {
    expect(categoriaDoTipo('cocho', {})).toBe('instalacoes');
    expect(categoriaDoTipo('bebedouro', {})).toBe('rede_agua');
    expect(categoriaDoTipo('sede_casa', {})).toBe('benfeitorias');
    expect(categoriaDoTipo('balanca', {})).toBe('maquinas');
    expect(categoriaDoTipo('tronco_brete', { modelo: 'Tronco hidráulico' })).toBe('maquinas');
    expect(categoriaDoTipo('tronco_brete', { modelo: 'Brete' })).toBe('instalacoes');
    expect(categoriaDoTipo('cerca', {})).toBe('cercas');
    /* o seletor "Ligar a um bem existente" mostra a categoria em que o bem nasce */
    for (const t of TIPOS_INFRA) expect(t.categorias).toContain(categoriaDoTipo(t.tipo, {}));
  });
});

describe('a descrição do bem e o p_bem', () => {
  it('a descrição montada da ficha (o mock)', () => {
    expect(descricaoDaFicha('cocho', EXEMPLOS.cocho, 'P_01')).toBe('Cocho de concreto coberto · 12 m · 2 lados (24 m úteis) · sal mineral · P_01');
    expect(descricaoDaFicha('caixa_dagua', EXEMPLOS.caixa_dagua, null)).toBe("Caixa d'água de fibra elevada · 20.000 L");
    expect(descricaoDaFicha('cerca', EXEMPLOS.cerca, null)).toBe('Cerca · arame liso · 5 fios · eucalipto tratado');
    expect(descricaoDaFicha('galpao', {}, null)).toBe('Galpão');
  });
  it('o texto do campo na leitura', () => {
    expect(textoDoCampo({ chave: 'coberto', rotulo: 'Coberto', forma: 'simnao' }, false)).toBe('Não');
    expect(textoDoCampo({ chave: 'vazao_m3h', rotulo: 'Vazão', forma: 'numero', unidade: 'm³/h', casas: 1 }, 6.5)).toBe('6,5 m³/h');
    expect(textoDoCampo({ chave: 'x', rotulo: 'X', forma: 'texto' }, undefined)).toBe('');
  });
  it('o p_bem: vida útil em MESES; valor só "sem lançamento"; o vazio não vai (vale o da categoria)', () => {
    const base = { tipo: 'cocho' as const, ficha: EXEMPLOS.cocho, descricao: ' Cocho ', emUsoDesde: '2024-03-15', atividade: 'pecuaria' as const,
      origem: 'lancamentos' as const, valor: 900, vidaAnos: 20, residual: null };
    expect(argumentoDoBem(base)).toEqual({ categoria_codigo: 'instalacoes', descricao: 'Cocho', em_uso_desde: '2024-03-15', atividade: 'pecuaria',
      origem_valor: 'lancamentos', vida_util_meses: 240 });
    expect(argumentoDoBem({ ...base, origem: 'sem_lancamento', vidaAnos: null, residual: 5 }))
      .toMatchObject({ origem_valor: 'sem_lancamento', valor_sem_lancamento: 900, residual_pct: 5 });
    expect('vida_util_meses' in argumentoDoBem({ ...base, vidaAnos: null })).toBe(false);
  });
});
