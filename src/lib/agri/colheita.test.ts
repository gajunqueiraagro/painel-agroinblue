/**
 * A colheita: unidade, romaneio e totais — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ O CASO QUE MOTIVA QUASE TODOS ESTES TESTES é o seco que chega DEPOIS. Entre embarcar e a
 * cooperativa devolver a classificação passam dias, e nesse meio-tempo a tela tem de dizer o
 * que sabe sem inventar o que não sabe.
 */
import { describe, it, expect } from 'vitest';
import {
  unidadeDaCultura, sacasDoPeso, validarRomaneio, totaisColheita, DESTINOS,
  type RomaneioForm,
} from './colheita';

const linha = (over: Partial<RomaneioForm> = {}): RomaneioForm => ({
  id: null, dataColheita: '2026-02-10', pesoVerdeKg: '5000', sacas: '',
  pesoSecoKg: '', pesoRefugoKg: '', destino: '', romaneioRef: '', observacoes: '',
  ...over,
});

describe('a unidade muda com a cultura', () => {
  it('amendoim é saca de 25 kg', () => {
    expect(unidadeDaCultura('amendoim').kgPorSaca).toBe(25);
    expect(unidadeDaCultura('amendoim').unidadeProdutividade).toBe('sc/ha');
    expect(sacasDoPeso(5000, 'amendoim')).toBe(200);
  });

  it('mandioca é raiz: tonelada, sem saca', () => {
    expect(unidadeDaCultura('mandioca').kgPorSaca).toBeNull();
    expect(unidadeDaCultura('mandioca').unidadeTotal).toBe('t');
    expect(sacasDoPeso(5000, 'mandioca')).toBeNull();
  });

  it('⚠ soja e milho ficam SEM saca até alguém decidir o peso', () => {
    /* 60 kg é convenção de mercado, não decisão registrada. Afirmá-la aqui faria o sistema
       publicar uma produtividade que ninguém confirmou. */
    expect(unidadeDaCultura('soja').kgPorSaca).toBeNull();
    expect(unidadeDaCultura('milho').kgPorSaca).toBeNull();
    expect(unidadeDaCultura('cultura_que_nao_existe').kgPorSaca).toBeNull();
    expect(unidadeDaCultura(null).kgPorSaca).toBeNull();
  });

  it('peso zero ou negativo não vira saca', () => {
    expect(sacasDoPeso(0, 'amendoim')).toBeNull();
    expect(sacasDoPeso(-10, 'amendoim')).toBeNull();
  });
});

describe('validarRomaneio', () => {
  it('caminho feliz: sacas derivam do verde quando ninguém as digita', () => {
    const r = validarRomaneio(linha(), 'amendoim');
    expect(r.ok).toBe(true);
    expect(r.payload?.peso_bruto_kg).toBe(5000);
    expect(r.payload?.sacas).toBe(200);
    expect(r.payload?.peso_liquido_kg).toBeNull();
  });

  it('⚠ as sacas digitadas VENCEM o cálculo — o romaneio às vezes já vem em sacas', () => {
    const r = validarRomaneio(linha({ sacas: '198' }), 'amendoim');
    expect(r.payload?.sacas).toBe(198);
  });

  it('milhar com ponto E vírgula decimal é lido certo', () => {
    const r = validarRomaneio(linha({ pesoVerdeKg: '5.000,00', pesoSecoKg: '4.312,5' }), 'amendoim');
    expect(r.payload?.peso_bruto_kg).toBe(5000);
    expect(r.payload?.peso_liquido_kg).toBe(4312.5);
  });

  it('⚠ ARMADILHA CONHECIDA: "5.000" sem casas decimais é lido como CINCO', () => {
    /* `parseNumericValue` (a mesma do abate, usada aqui de propósito para não haver duas
       leituras de número no sistema) trata ponto SEM vírgula como separador DECIMAL — é o que
       "1.5" pede. Num campo de quilos isso morde: quem digita "5.000" quer cinco mil.
       O que segura o engano é o eco: o total do bloco recalcula a cada tecla, e "Total verde:
       5 kg" denuncia na hora. Máscara de milhar no campo é a correção de raiz, e é decisão de
       produto — não se resolve inventando uma segunda regra de parsing aqui. */
    const r = validarRomaneio(linha({ pesoVerdeKg: '5.000' }), 'amendoim');
    expect(r.payload?.peso_bruto_kg).toBe(5);
  });

  it('sem data não grava', () => {
    expect(validarRomaneio(linha({ dataColheita: '' })).ok).toBe(false);
  });

  it('sem peso nenhum não grava — romaneio vazio não é entrega', () => {
    expect(validarRomaneio(linha({ pesoVerdeKg: '' })).ok).toBe(false);
  });

  it('só o seco basta: o romaneio pode ser lançado quando a classificação chega', () => {
    expect(validarRomaneio(linha({ pesoVerdeKg: '', pesoSecoKg: '4000' })).ok).toBe(true);
  });

  it('⚠ seco maior que verde é recusado — secar tira água, não acrescenta', () => {
    const r = validarRomaneio(linha({ pesoSecoKg: '6000' }), 'amendoim');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('não pode ser maior');
  });

  it('destino fora da lista é recusado; vazio é aceito como ausência', () => {
    expect(validarRomaneio(linha({ destino: 'exportacao' })).ok).toBe(false);
    expect(validarRomaneio(linha({ destino: '' })).payload?.destino).toBeNull();
    expect(validarRomaneio(linha({ destino: 'armazem' })).payload?.destino).toBe('armazem');
  });

  it('os quatro destinos do CHECK do banco estão na lista da tela', () => {
    expect(DESTINOS.map(d => d.valor)).toEqual(['armazem', 'venda', 'consumo', 'outro']);
  });
});

describe('totaisColheita', () => {
  it('soma verde e sacas de vários romaneios', () => {
    const t = totaisColheita([linha(), linha({ pesoVerdeKg: '3000' })], 'amendoim', 96.4);
    expect(t.verdeKg).toBe(8000);
    expect(t.sacas).toBe(320);
  });

  it('⚠ sem nenhum seco, quebra e produtividade NÃO existem — é o "aguardando cooperativa"', () => {
    const t = totaisColheita([linha(), linha({ pesoVerdeKg: '3000' })], 'amendoim', 96.4);
    expect(t.quebraPct).toBeNull();
    expect(t.produtividade).toBeNull();
    expect(t.aguardandoSeco).toBe(2);
  });

  it('⚠ a quebra é do que JÁ voltou seco, não do verde total', () => {
    /* Um romaneio de 5.000 voltou com 4.000 (20%); o outro, de 5.000, ainda está na
       cooperativa. Contra o verde total a quebra pareceria 60% — perda inventada. */
    const t = totaisColheita([linha({ pesoSecoKg: '4000' }), linha()], 'amendoim', 100);
    expect(t.quebraPct).toBe(20);
    expect(t.aguardandoSeco).toBe(1);
  });

  it('a produtividade é do seco e por hectare', () => {
    /* 4.000 kg secos ÷ 25 kg/saca = 160 sacas; ÷ 100 ha = 1,6 sc/ha. */
    const t = totaisColheita([linha({ pesoSecoKg: '4000' })], 'amendoim', 100);
    expect(t.produtividade).toBe(1.6);
  });

  it('mandioca mede produtividade em toneladas por hectare', () => {
    const t = totaisColheita([linha({ pesoVerdeKg: '50000', pesoSecoKg: '50000' })], 'mandioca', 2);
    expect(t.sacas).toBeNull();
    expect(t.produtividade).toBe(25); // 50 t ÷ 2 ha
  });

  it('sem área não há produtividade — não se divide por ausência', () => {
    expect(totaisColheita([linha({ pesoSecoKg: '4000' })], 'amendoim', null).produtividade).toBeNull();
    expect(totaisColheita([linha({ pesoSecoKg: '4000' })], 'amendoim', 0).produtividade).toBeNull();
  });

  it('lista vazia não quebra a conta', () => {
    const t = totaisColheita([], 'amendoim', 96.4);
    expect(t.verdeKg).toBe(0);
    expect(t.sacas).toBeNull();
    expect(t.quebraPct).toBeNull();
  });

  it('o grão de roça soma à parte, sem entrar no verde', () => {
    const t = totaisColheita([linha({ pesoRefugoKg: '120' })], 'amendoim', 96.4);
    expect(t.refugoKg).toBe(120);
    expect(t.verdeKg).toBe(5000);
  });
});
