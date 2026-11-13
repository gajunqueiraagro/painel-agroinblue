/**
 * IMPORTAR-ABATE-01 · 117538 (Chat 12/11 22:55) — a linha do abate que a importação grava, ABERTA pela tela do abate (a mesma ponte:
 * `daLinha` → `paraCalculo` → `buildAbateCalculation`), tem de dar o MESMO líquido que o acerto: com o incentivo no bônus precoce
 * ('reais'), Salvar sem mexer não muda nada. Sem ele (a 117537 sozinha), a tela tiraria o incentivo do líquido — o caso que a 117538 fecha.
 * Números do lote 1 da Pureza (Fortunceres, ordem 10770).
 */
import { describe, it, expect } from 'vitest';
import { daLinha, type AbateRow } from '@/hooks/useOperacaoAbate';
import { paraCalculo, type LoteAbate } from '@/components/abate/calculoDoLote';
import { buildAbateCalculation } from '@/lib/calculos/abate';

const LOTE: LoteAbate = { id: 'l1', ordem: 1, categoria: 'bois', categoriaLabel: 'Bois', quantidade: 36, pesoMedioKg: 550 };
const linhaImportada = (bonus: number | null): AbateRow => ({
  operacao_lote_id: 'l1', cenario: 'realizado',
  peso_carcaca_kg: 11190.5, peso_carcaca_fonte: 'total', rendimento_carcaca_pct: 56.5177, peso_total_kg_nf: null,
  preco_arroba: 396.02875, preco_fonte: 'arroba',
  bonus_precoce_valor: bonus, bonus_precoce_fonte: bonus == null ? null : 'reais',
  bonus_qualidade_valor: null, bonus_qualidade_fonte: null, bonus_lista_trace_valor: null, bonus_lista_trace_fonte: null,
  desconto_qualidade_valor: null, desconto_qualidade_fonte: null, outros_descontos_valor: null, outros_descontos_fonte: null,
  funrural_valor: null, funrural_fonte: null, senar_valor: 590.9, senar_fonte: 'reais',
  valor_base_override: null, valor_liquido: 303351.55,
});
const liquidoNaTela = (r: AbateRow) => buildAbateCalculation(paraCalculo(daLinha(r), LOTE)).valorLiquido;

describe('117538 — abrir o abate importado e Salvar sem mexer', () => {
  it('com o incentivo no bônus precoce: a tela calcula 303.351,55 = o líquido gravado', () => {
    expect(liquidoNaTela(linhaImportada(8491.8))).toBe(303351.55);
  });
  it('sem o bônus (só a 117537): a tela daria 294.859,75 — o incentivo de 8.491,80 sairia no Salvar', () => {
    expect(liquidoNaTela(linhaImportada(null))).toBe(294859.75);
  });
});
