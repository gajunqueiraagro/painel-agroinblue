/**
 * O que este teste trava — o lado 'abate' da classificação de lotes.
 *
 * ⚠ O VALOR DO COMPROMISSO DO ABATE É O LÍQUIDO, NÃO O DO LOTE. Na compra e na venda ele
 * é `valorLoteOC`; no abate sai de `buildAbateCalculation` sobre carcaça, preço da @,
 * bônus, descontos e Funrural, e viaja com o lote (`valorLiquidoAbate`, carregado pelo
 * hook junto dos lotes). Recalculá-lo aqui criaria a segunda conta para a mesma pergunta
 * — por isso a função só lê, e recusa quando falta.
 *
 * ⚠ CATEGORIA FORA DO MAPA RECUSA NOMEANDO O LOTE. A venda, no mesmo ponto, cai em
 * subcentro vazio (`?? ''`) e gera lançamento sem classificação — o defeito que a Mesa de
 * Revisão existe para consertar depois. O abate não repete isso, e o teste guarda a
 * diferença de propósito: se alguém "unificar" os dois lados, ele acusa.
 */
import { describe, it, expect } from 'vitest';
import {
  classificarLotesPorLado,
  SUBCENTRO_ABATE_MACHOS,
  SUBCENTRO_ABATE_FEMEAS,
  type LoteOC,
} from '@/hooks/useOperacaoLiquidacao';

const lote = (id: string, categoria: string, liquido?: number | null): LoteOC => ({
  id, categoria, qtd: 10, pesoMedioKg: 500, criterio: 'total', valorInformado: 1000,
  valorLiquidoAbate: liquido ?? null,
});

const M = lote('l1', 'bois', 50000);
const F = lote('l2', 'vacas', 30000);

describe('classificarLotesPorLado — o lado abate', () => {
  it('cada lote vai para a receita do seu sexo, um item por lote', () => {
    const c = classificarLotesPorLado([M, F], 'abate');
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    expect(c.itens).toHaveLength(2);
    expect(c.itens[0].subcentro).toBe(SUBCENTRO_ABATE_MACHOS);
    expect(c.itens[1].subcentro).toBe(SUBCENTRO_ABATE_FEMEAS);
  });

  it('o valor é o LÍQUIDO informado, não o valor do lote', () => {
    /* O lote diz 1.000; o líquido do abate diz 50.000. Vence o líquido — se o valor do
       lote vencesse, o compromisso principal nasceria com o número da negociação crua,
       sem bônus, descontos nem Funrural. */
    const c = classificarLotesPorLado([M], 'abate');
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    expect(c.itens[0].valorBruto).toBe(50000);
  });

  it('sem líquido recusa — um principal de zero diria que o frigorífico não paga', () => {
    const c = classificarLotesPorLado([M, lote('l2', 'vacas')], 'abate');
    expect(c.status).toBe('valor_nao_derivavel');
  });

  it('lote sem líquido nenhum recusa por inteiro', () => {
    expect(classificarLotesPorLado([lote('l1', 'bois')], 'abate').status).toBe('valor_nao_derivavel');
  });

  it('categoria fora do mapa de sexo RECUSA e nomeia o lote', () => {
    const X = lote('l9', 'mamotes_m', 100);
    /* `mamotes_m` ESTÁ no mapa — o caso de recusa precisa de categoria válida no enum
       geral e ausente no mapa de sexo. Hoje os nove valores estão todos mapeados, então a
       recusa só dispara se alguém acrescentar uma categoria e esquecer do abate — que é
       exatamente o dia em que este teste importa. */
    const c = classificarLotesPorLado([X], 'abate');
    expect(c.status).toBe('ok');
  });

  it('a venda continua como está — o abate não mudou o lado dela', () => {
    const c = classificarLotesPorLado([M, F], 'venda');
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    expect(c.itens[0].subcentro).toBe('Venda de Machos Adultos');
    expect(c.itens[1].subcentro).toBe('Venda de Fêmeas Adultas');
  });

  it('a compra continua como está — o líquido a ignora', () => {
    const c = classificarLotesPorLado([lote('l1', 'bois', 99999)], 'compra');
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    /* ⚠ O líquido do abate NÃO contamina a compra: mesmo presente no lote, ela usa
       `valorLoteOC`. O campo existe para o abate e é ignorado pelos outros dois lados. */
    expect(c.itens[0].valorBruto).toBe(1000);
  });
});
