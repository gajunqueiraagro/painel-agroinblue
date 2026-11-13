/** FAZENDA-CADASTRO-01 · F1a — a regra da lista de fazendas: área sem piquete, atividades, pendências (P5), último fechamento, lotação própria. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import type { Pasto } from '@/hooks/usePastos';
import { agruparPastosPorFamilia } from '@/lib/pastos/agruparPorFamilia';
import {
  atividadesDaFazenda, linhasDaLista, lotacaoPropria, mesCurtoDe, pastosDaArea, pendenciasDoCadastro, textosDaVariacao, totaisDaLista,
  ultimoFechamentoPorFazenda, variacaoNoAno, type CadastroDaFazenda,
} from './listaDeFazendas';

const MES = '2026-11';
const pasto = (id: string, fazenda: string, tipo: string, ha: number, mais: Partial<Pasto> = {}): Pasto =>
  ({ id, fazenda_id: fazenda, nome: id, tipo_uso: tipo, area_produtiva_ha: ha, ativo: true, data_inicio: null, data_fim: null, pai_id: null,
    lote_padrao: null, qualidade: null, entra_conciliacao: false, observacoes: null, ordem_exibicao: 0, created_at: '2024-01-01',
    updated_at: '2024-01-01', ...mais });
const CAD = (fazenda_id: string, mais: Partial<CadastroDaFazenda> = {}): CadastroDaFazenda => ({
  fazenda_id, municipio: 'Coxim', estado: 'MS', car: 'MS-1', nirf: '1', ie: '28', roteiro: 'BR-163', area_total_ha: 100, ...mais,
});

describe('FAZENDA-CADASTRO-01 · lista de fazendas', () => {
  it('a área conta o pasto-pai e NÃO os piquetes dele (a mesma terra uma vez só)', () => {
    const ps = [pasto('pai', 'f', 'cria', 100), pasto('q1', 'f', 'cria', 60, { pai_id: 'pai' }), pasto('q2', 'f', 'cria', 40, { pai_id: 'pai' }),
      pasto('x', 'f', 'cria', 50, { ativo: false })];
    expect(pastosDaArea(ps).map(p => p.id)).toEqual(['pai']);
    /* o agrupamento cru (o de hoje) somaria 200 */
    expect(agruparPastosPorFamilia(ps.filter(p => p.ativo), MES).familias.reduce((s, f) => s + f.somaHa, 0)).toBe(200);
    const [l] = linhasDaLista({ fazendas: [{ id: 'f', nome: 'F', codigo: 'F', status: 'ativa' }], cadastros: new Map([['f', CAD('f')]]),
      pastos: ps, desenhados: new Set(['pai', 'q1']), fechamentos: new Map(), comRebanhoInicial: new Set(['f']), mesRef: MES });
    expect([l.pastosHa, l.diferencaHa, l.nPastos, l.noMapa, l.pendencias]).toEqual([100, 0, 1, 1, []]);
  });

  it('atividades: destinos de pecuária com área e famílias de produção; vedado, reserva e zero não contam', () => {
    const ag = agruparPastosPorFamilia([pasto('a', 'f', 'recria', 10), pasto('b', 'f', 'cria', 5), pasto('c', 'f', 'engorda', 0),
      pasto('d', 'f', 'vedado', 9), pasto('e', 'f', 'reserva', 9), pasto('g', 'f', 'agricultura', 3)], MES);
    expect(atividadesDaFazenda(ag)).toEqual(['Cria', 'Recria', 'Agricultura']);
  });

  it('pendências P5 na ordem do mock; sem pasto = área "—", nunca zero', () => {
    const f = { id: 'f', nome: 'F', codigo: null, status: 'ativa' };
    expect(pendenciasDoCadastro(f, CAD('f', { car: ' ', roteiro: null, area_total_ha: 0 }), false))
      .toEqual(['código', 'matrícula', 'CAR', 'roteiro', 'rebanho inicial']);
    expect(pendenciasDoCadastro(f, undefined, true)).toEqual(['código', 'município', 'matrícula', 'CAR', 'NIRF', 'inscrição estadual', 'roteiro']);
    const [l] = linhasDaLista({ fazendas: [f], cadastros: new Map(), pastos: [], desenhados: new Set(), fechamentos: new Map(),
      comRebanhoInicial: new Set(), mesRef: MES });
    expect([l.pastosHa, l.diferencaHa, l.local, l.rebanho]).toEqual([null, null, null, null]);
  });

  it('último fechamento: só o mês em que TODAS as categorias vêm do fechamento', () => {
    const m = ultimoFechamentoPorFazenda([
      { fazenda_id: 'f', ano_mes: '2026-09', saldo_final: 600, fonte_oficial_mes: 'fechamento' },
      { fazenda_id: 'f', ano_mes: '2026-09', saldo_final: 400, fonte_oficial_mes: 'fechamento' },
      { fazenda_id: 'f', ano_mes: '2026-10', saldo_final: 700, fonte_oficial_mes: 'fechamento' },
      { fazenda_id: 'f', ano_mes: '2026-10', saldo_final: 331, fonte_oficial_mes: 'fallback_movimentacao' },
    ]);
    expect(m.get('f')).toEqual({ anoMes: '2026-09', cabecas: 1000, inicioDoAno: null });
    /* o saldo inicial do ano = o de JANEIRO do ano do fechamento (qualquer fonte), somadas as categorias */
    const n = ultimoFechamentoPorFazenda([
      { fazenda_id: 'f', ano_mes: '2025-01', saldo_inicial: 999, saldo_final: 1, fonte_oficial_mes: 'fechamento' },
      { fazenda_id: 'f', ano_mes: '2026-01', saldo_inicial: 600, saldo_final: 610, fonte_oficial_mes: 'fallback_movimentacao' },
      { fazenda_id: 'f', ano_mes: '2026-01', saldo_inicial: 400, saldo_final: 405, fonte_oficial_mes: 'fallback_movimentacao' },
      { fazenda_id: 'f', ano_mes: '2026-10', saldo_inicial: 900, saldo_final: 1031, fonte_oficial_mes: 'fechamento' },
    ]);
    expect(n.get('f')).toEqual({ anoMes: '2026-10', cabecas: 1031, inicioDoAno: 1000 });
  });

  it('rebanho no ano: delta e % contra o saldo inicial; ▲ verde, ▼ vermelho; sem início ou início zero, sem %', () => {
    expect(textosDaVariacao(variacaoNoAno(7450, 7140))).toEqual({ curto: '▲ 310 · 4,3%', nota: '▲ 310 cab. · ▲ 4,3% no ano',
      inteiro: '▲ 310 cab. · ▲ 4,3% no ano (saldo inicial 7.140)', sinal: 1 });
    expect(textosDaVariacao(variacaoNoAno(6909, 7140))?.nota).toBe('▼ 231 cab. · ▼ 3,2% no ano');
    expect(textosDaVariacao(variacaoNoAno(12, 0))).toMatchObject({ curto: '▲ 12', nota: '▲ 12 cab. no ano' });
    expect([variacaoNoAno(10, null), variacaoNoAno(null, 10)]).toEqual([null, null]);
  });

  it('lotação própria: Σ UA ÷ Σ área, arrendado e sem UA fora; totais ponderados pela área', () => {
    expect(lotacaoPropria([{ pasto_id: 'a', area_ha: 100, ua: 60 }, { pasto_id: 'b', area_ha: 50, ua: 15 }, { pasto_id: 'c', area_ha: 80, ua: 200 },
      { pasto_id: 'd', area_ha: 30, ua: null }], new Set(['c']))).toEqual({ lotacao: 0.5, area: 150 });
    const base = { id: 'x', codigo: 'X', nome: 'X', local: null, situacao: 'Ativa', ativa: true, atividades: [], matriculaHa: 10, pastosHa: 10,
      diferencaHa: 0, nPastos: 1, noMapa: 1, rebanho: 10, rebanhoInicioDoAno: 8, mesDoFechamento: '2026-10', pendencias: [] };
    const t = totaisDaLista([{ ...base, lotacao: 1, areaDaLotacao: 100 }, { ...base, id: 'y', lotacao: 0.4, areaDaLotacao: 300, diferencaHa: -2,
      mesDoFechamento: '2026-09', pendencias: ['CAR'] }, { ...base, id: 'z', rebanho: 50, rebanhoInicioDoAno: null, lotacao: null, areaDaLotacao: null }], 300);
    /* a variação do total compara o MESMO conjunto: só quem tem rebanho e início (20 contra 16; a de 50 sem início fica fora) */
    expect([t.rebanhoComInicio, t.rebanhoInicioDoAno]).toEqual([20, 16]);
    expect([t.lotacao, t.diferencaHa, t.fazendasComDiferenca, t.ultimoFechamento, t.comPendencia, t.rebanho]).toEqual([0.55, -2, 1, '2026-10', 1, 70]);
    expect(mesCurtoDe('2026-10')).toBe('out/26');
  });
});
