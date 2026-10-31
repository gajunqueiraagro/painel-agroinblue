import { describe, it, expect, vi } from 'vitest';
import { buildLinhaExecutivaModalData } from './buildLinhaExecutivaModalData';
import { ORDEM_CENTROS_INVESTIMENTO_PECUARIA, ORDEM_CENTROS_INVESTIMENTO_AGRICULTURA } from '@/lib/financeiro/classificacao';
import type { ComposicaoSubcentro } from '@/lib/painelConsultor/agregadosFinanceiros';

/* P176 (PLANO-INVESTIMENTOS-PADRAO-01, migration 20261028114050): os centros de "Investimento na Fazenda" são os mesmos 4 nas atividades —
   Infraestrutura · Máquinas · Formação · RH ("Pastagem" e "Solo" viraram "Formação"). O modal da linha (Fechamento e Planejamento ›
   Visão Geral) ordena pela ordem oficial; centro fora dela cai no fim com aviso. */
const mes = (v: number) => Array.from({ length: 12 }, (_, i) => (i === 0 ? v : 0));
const sub = (centro: string, v: number): ComposicaoSubcentro => ({ centro_custo: centro, meses: mes(v) });
const linha = { label: 'Investimento', meta: 0, real: 0, delta: null };

describe('P176: centros de Investimento na ordem oficial com "Formação"', () => {
  it.each([
    ['Pecuária', ORDEM_CENTROS_INVESTIMENTO_PECUARIA, 'Investimento em Formação de Pasto Pecuária'],
    ['Agricultura', ORDEM_CENTROS_INVESTIMENTO_AGRICULTURA, 'Investimento em Correção de Solo Agricultura'],
  ])('%s: Infraestrutura · Máquinas · Formação · RH, nenhum fora da ordem', (_atividade, ordem, contaFormacao) => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const real: Record<string, ComposicaoSubcentro> = {
      'Investimento em Treinamentos': sub('RH', 10),
      [contaFormacao]: sub('Formação', 400),
      'Investimento em Cercas': sub('Infraestrutura', 30),
      'Investimento em Máquinas e Equipamentos': sub('Máquinas', 20),
    };
    const d = buildLinhaExecutivaModalData({ linha, porSubcentroMeta: {}, porSubcentroReal: real, ordemCentrosOficial: ordem, modo: 'fechamento' });
    expect(d.porCentro.map((c) => c.centro_custo)).toEqual(['Infraestrutura', 'Máquinas', 'Formação', 'RH']);
    expect(d.centrosForaDaOrdemOficial).toEqual([]);
    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });
});
