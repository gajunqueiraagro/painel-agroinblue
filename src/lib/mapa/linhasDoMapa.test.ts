/**
 * MAPA-REBANHO-R2 (Gabriel 08/11 19:18, prints NJ · Faz. Pureza · out/26) — o Mapa do rebanho listava o pasto E cada piquete como linha
 * própria (P5, P5-A, P5-B, P6, P6-A…D, 7A…7D, P7) e os piquetes da 7 vinham ANTES do P7. Regra: o pasto é a linha; o piquete só como
 * sub-linha recuada sob o pai quando o card foi lançado por piquetes, com o pai somando; ordem sempre pelo pai. Dados SINTÉTICOS no
 * formato da PUR.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categoriasDasLinhas, nomeNaSaida, subLinhasPorPiquete, type ItemDoMapa } from './linhasDoMapa';
import { pastosDoFechamentoNoMes } from '@/hooks/useLoteDoMes';
import type { Pasto } from '@/hooks/usePastos';

const pasto = (id: string, nome: string, ordem: number, pai: string | null = null): Pasto & { pai_id: string | null } => ({
  id, fazenda_id: 'pur', nome, lote_padrao: null, area_produtiva_ha: 10, tipo_uso: 'recria', qualidade: null, entra_conciliacao: true,
  ativo: true, observacoes: null, ordem_exibicao: ordem, data_inicio: null, created_at: '2026-01-01', updated_at: '2026-01-01', pai_id: pai });

/* a lista como o usePastos entrega (a ordem do cadastro), com os piquetes que vieram para a tela */
const PUR = [
  pasto('p5', 'P5', 1), pasto('p5a', 'P5-A', 2, 'p5'), pasto('p5b', 'P5-B', 3, 'p5'),
  pasto('p6', 'P6', 4), pasto('p6a', 'P6-A', 5, 'p6'), pasto('p6b', 'P6-B', 6, 'p6'),
  pasto('7a', '7A', 7, 'p7'), pasto('7b', '7B', 8, 'p7'), pasto('7c', '7C', 9, 'p7'), pasto('7d', '7D', 10, 'p7'),
  pasto('p7', 'P7', 11), pasto('p8', 'P8', 12),
];

const item = (cat: string, q: number, kg: number | null, piquete: string | null = null, atual = true): ItemDoMapa & { lote: string | null } =>
  ({ categoria_id: cat, quantidade: q, peso_medio_kg: kg, peso_atualizado: atual, piquete_id: piquete, lote: null });

describe('as linhas do Mapa do rebanho (MAPA-REBANHO-R2)', () => {
  it('PUR out/26: o pasto é a linha — nenhum piquete solto (P5-A, P6-B, 7A…7D saem), a ordem é a do pai (P5, P6, P7, P8)', () => {
    expect(pastosDoFechamentoNoMes(PUR, '2026-10').map(p => p.nome)).toEqual(['P5', 'P6', 'P7', 'P8']);
  });
  it('a tela monta as linhas pela MESMA regra dos cards (nunca mais o filtro próprio que listava o piquete como pasto)', () => {
    const f = readFileSync('src/pages/MapaPastosTab.tsx', 'utf8');
    expect(f).toContain('const pastosAtivos = pastosDoFechamentoNoMes(pastos, anoMes);');
    expect(f).not.toContain('pastos.filter(p => p.ativo && p.entra_conciliacao && isPastoAtivoNoMes(p, anoMes))');
    /* os totais e o resumo contam só os pastos: a sub-linha já está dentro do pai */
    expect(f).toContain('const pastosDasLinhas = useMemo(() => rows.filter(r => !r.piqueteDe), [rows]);');
    expect(f).toContain('const areaTotal = pastosDasLinhas');
    expect(f).toContain('const totalCab = pastosDasLinhas.reduce(');
  });
  it('P7 lançado por piquetes: uma sub-linha por piquete, em ordem natural (7A, 7B… 10A), e o pai SOMA todas (nunca só a última)', () => {
    const itens = [item('vacas', 30, 400, '7b'), item('vacas', 20, 450, '7a'), item('bez', 12, 120, '7a'), item('vacas', 5, null, '10a')];
    const nomes: Record<string, string> = { '7a': '7A', '7b': '7B', '10a': '10A' };
    const subs = subLinhasPorPiquete(itens, id => nomes[id] ?? null);
    expect(subs.map(s => [s.nome, s.itens.reduce((t, i) => t + i.quantidade, 0)])).toEqual([['7A', 32], ['7B', 30], ['10A', 5]]);
    const pai = categoriasDasLinhas(itens);
    expect(pai.get('vacas')).toEqual({ quantidade: 55, peso_medio_kg: 420, peso_atualizado: true });
    expect(pai.get('bez')?.quantidade).toBe(12);
  });
  it('pasto inteiro: só o pai, sem sub-linha; sobra sem piquete num card por piquetes vira "Sem piquete" (nenhuma cabeça some)', () => {
    expect(subLinhasPorPiquete([item('vacas', 40, 400)], () => null)).toEqual([]);
    const subs = subLinhasPorPiquete([item('vacas', 10, 400, '7a'), item('vacas', 3, 400, null), item('bez', 0, null, null)], () => '7A');
    expect(subs.map(s => s.nome)).toEqual(['7A', 'Sem piquete']);
    expect(subs[1].itens).toHaveLength(1);
  });
  it('"peso atualizado" do pai só com todas as linhas com cabeça atualizadas', () => {
    expect(categoriasDasLinhas([item('vacas', 10, 400, '7a', true), item('vacas', 5, 400, '7b', false)]).get('vacas')?.peso_atualizado).toBe(false);
  });
  it('PDF e Excel: as mesmas linhas, o piquete recuado com "·"', () => {
    expect(nomeNaSaida('7A', true)).toBe('   · 7A');
    expect(nomeNaSaida('P7', false)).toBe('P7');
    for (const arq of ['src/lib/exportMapaPastosPdf.ts', 'src/lib/exportMapaPastos.ts']) expect(readFileSync(arq, 'utf8')).toContain('nomeNaSaida(row.pasto.nome, ');
  });
});
