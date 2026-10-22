/**
 * FIN-CLASSIF-DIVIDIDA-01a-2 — a distribuicao economica do Extrato Gerencial / Painel por periodo abre o movimento do lancamento
 * DIVIDIDO pelas partes; sem divisao, o proprio item (e nenhuma consulta).
 *   R1 Selluz: saida de R$ 9.583,00 -> −8.528,00 (Investimento) e −1.055,00 (Manutencao), soma exata
 *   R2 terco: a ultima parte fecha o centavo (100,00 em tres contas iguais)
 *   R3 sem partes = o item; sem ids divididos, `carregarPartes` nao consulta
 */
import { describe, it, expect, vi } from 'vitest';

const FROM = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => { FROM.n += 1; throw new Error('nao devia consultar'); } } }));
import { carregarPartes, porParte, chaveDaParte, type ParteDaClassificacao } from './partesDaClassificacao';

const parte = (ordem: number, valor: number, sub: string): ParteDaClassificacao => ({
  lancamento_id: 'l1', ordem, valor, macro_custo: null, grupo_custo: null, centro_custo: null, subcentro: sub, escopo_negocio: 'pecuaria' });
const abre = (mov: number, partes?: ParteDaClassificacao[]) =>
  porParte({ id: 'l1', mov, sub: 'cheio' }, partes, mov, (p, m) => ({ id: chaveDaParte({ id: 'l1', parte_ordem: p.ordem }), mov: m, sub: p.subcentro ?? '' }));

describe('FIN-CLASSIF-DIVIDIDA-01a-2 — o movimento aberto por parte', () => {
  it('R1 Selluz', () => {
    const r = abre(-9583, [parte(1, 8528, 'Investimento'), parte(2, 1055, 'Manutenção')]);
    expect(r).toEqual([{ id: 'l1', mov: -8528, sub: 'Investimento' }, { id: 'l1#2', mov: -1055, sub: 'Manutenção' }]);
  });
  it('R2 a ultima parte fecha o centavo', () => {
    const r = abre(100, [parte(1, 1, 'a'), parte(2, 1, 'b'), parte(3, 1, 'c')]);
    expect(r.map(x => x.mov)).toEqual([33.33, 33.33, 33.34]);
  });
  it('R3 sem partes, o item; sem divididos, nenhuma consulta', async () => {
    expect(abre(50)).toEqual([{ id: 'l1', mov: 50, sub: 'cheio' }]);
    expect((await carregarPartes([])).size).toBe(0);
    expect(FROM.n).toBe(0);
  });
});
