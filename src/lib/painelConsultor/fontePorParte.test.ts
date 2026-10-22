/**
 * FIN-CLASSIF-DIVIDIDA-01a-2 — o front que soma por classificacao le a VISAO por parte (`vw_fin_classificacao_por_parte`).
 *   P1 a chave da linha: o lancamento na parte 1 (e sem divisao); "id#n" nas demais
 *   P2 `mapV2ToLancamento` leva o valor e a classificacao da PARTE, e o lancamento, a ordem, o total de partes e o valor cheio
 *   P3 o carregador do ano corrente le a visao e NAO descarta a segunda parte do mesmo lancamento (o dedup e' pela chave da parte):
 *      a NF da Selluz (R$ 9.583,00) soma 8.528,00 em Investimento e 1.055,00 em Manutencao
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { chaveDaParte, mapV2ToLancamento, FONTE_POR_PARTE } from '@/hooks/useFinanceiro';
import { carregarLancFinAnoCorrenteReal } from './lancFinAnoCorrenteLoader';

const base = { fazenda_id: 'f', cliente_id: 'c', data_pagamento: '2026-09-29', status_transacao: 'realizado', tipo_operacao: '2-Saídas',
  sinal: '-1', cancelado: false, valor_lancamento: 9583, partes_total: 2, lancamento_id: 'l1', id: 'l1' };
const PARTE1 = { ...base, parte_ordem: 1, valor: 8528, macro_custo: 'Investimento na Fazenda', subcentro: 'Investimento em Instalações Pecuária' };
const PARTE2 = { ...base, parte_ordem: 2, valor: 1055, macro_custo: 'Custeio Produção', subcentro: 'Manutenção de Instalações Pecuária' };
const SEM = { ...base, id: 'l2', lancamento_id: 'l2', parte_ordem: 1, partes_total: 1, valor: 100, valor_lancamento: 100, macro_custo: 'Custeio Produção', subcentro: 'Sal' };

describe('FIN-CLASSIF-DIVIDIDA-01a-2 — a fonte por parte no front', () => {
  it('P1 a chave da linha', () => {
    expect(chaveDaParte(PARTE1)).toBe('l1');
    expect(chaveDaParte(PARTE2)).toBe('l1#2');
    expect(chaveDaParte({ id: 'x' })).toBe('x');
  });

  it('P2 o mapeamento leva a parte e o lancamento', () => {
    const m = mapV2ToLancamento(PARTE2);
    expect(m).toMatchObject({ id: 'l1#2', lancamento_id: 'l1', parte_ordem: 2, partes_total: 2, valor: 1055, valor_lancamento: 9583,
      subcentro: 'Manutenção de Instalações Pecuária' });
    expect(mapV2ToLancamento({ ...SEM, lancamento_id: undefined, parte_ordem: undefined, partes_total: undefined, valor_lancamento: undefined }))
      .toMatchObject({ id: 'l2', lancamento_id: 'l2', parte_ordem: 1, partes_total: 1, valor_lancamento: 100 });
  });

  it('P3 o carregador le a visao e mantem as duas partes', async () => {
    const tabelas: string[] = [];
    const q: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'gte', 'lt', 'order']) q[k] = () => q;
    q.range = async () => ({ data: [PARTE1, PARTE2, SEM], error: null });
    const sb = { from: (t: string) => { tabelas.push(t); return q; } };
    const linhas = await carregarLancFinAnoCorrenteReal({ clienteId: 'c', ano: 2026 }, sb as never);
    expect(tabelas).toEqual([FONTE_POR_PARTE]);
    expect(linhas.map(l => l.id)).toEqual(['l1', 'l1#2', 'l2']);
    const porSub = new Map<string, number>();
    for (const l of linhas) porSub.set(String(l.subcentro), (porSub.get(String(l.subcentro)) ?? 0) + Number(l.valor));
    expect(porSub.get('Manutenção de Instalações Pecuária')).toBe(1055);
    expect(porSub.get('Investimento em Instalações Pecuária')).toBe(8528);
  });
});
