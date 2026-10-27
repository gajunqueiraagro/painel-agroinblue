/**
 * P109 (FIN-META-01) — a meta tem UM dono no banco (`fn_meta_linhas`); o front só lê, põe na conta do plano e junta por UMA regra
 * (tudo soma). Prova: (1) a leitura e os mapas; (2) a regra única (soma, sem prioridade); (3) a TELA DE META = a VISÃO GERAL por
 * subcentro × mês (a VG soma |valor| das mesmas linhas pela conta do plano); (4) a TRAVA: nenhum cálculo de meta paralelo no front —
 * reintroduzir a nutrição por fazenda, as parcelas do snapshot, o financiamento direto ou as listas de nomes derruba este teste.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { autoDoSubcentro, gridMetaConsolidado, lerMetaLinhas, mapaDaOrigem, mapasDaMeta, type MetaLinha } from './metaLinhas';

const FZ_A = 'fz-a';
const FZ_B = 'fz-b';
const PLANO = new Map([['c-nut', 'Nutrição'], ['c-abm', 'Abates de Machos'], ['c-amort', 'Amortização Financiamento Pecuária'],
  ['c-cerca', 'Cercas'], ['c-adto', 'Adiantamento de Boitel'], ['c-imp', 'Impostos e Despesas de Abates e Vendas'], ['c-boitel', 'Venda em Boitel']]);

const L = (p: Partial<MetaLinha>): MetaLinha => ({ fazenda_id: FZ_A, plano_conta_id: 'c-nut', mes: 1, valor: 0, origem: 'digitada',
  origem_detalhe: 'meta digitada', origem_id: null, ...p });

const LINHAS: MetaLinha[] = [
  L({ plano_conta_id: 'c-nut', mes: 1, valor: 1000, origem: 'calculada:nutricao', origem_detalhe: 'parâmetros' }),
  L({ plano_conta_id: 'c-nut', mes: 1, valor: 250, origem: 'digitada' }),
  L({ plano_conta_id: 'c-nut', mes: 1, valor: 400, origem: 'calculada:financiamento', origem_detalhe: 'parcela do financiamento: principal' }),
  L({ plano_conta_id: 'c-abm', mes: 3, valor: 5000, origem: 'calculada:receita', origem_detalhe: 'abates e vendas meta, pelo recebimento' }),
  L({ plano_conta_id: 'c-boitel', mes: 4, valor: 9000, origem: 'calculada:receita', origem_detalhe: 'abates e vendas meta, pelo recebimento' }),
  L({ plano_conta_id: 'c-adto', mes: 2, valor: 3000, origem: 'calculada:receita', origem_detalhe: 'adiantamento de boitel' }),
  L({ plano_conta_id: 'c-amort', mes: 6, valor: 700.004, origem: 'calculada:financiamento', origem_detalhe: 'parcela do financiamento: principal' }),
  L({ plano_conta_id: 'c-cerca', mes: 8, valor: 1200, origem: 'digitada', origem_detalhe: 'projeto de investimento' }),
  L({ plano_conta_id: 'c-imp', mes: 5, valor: 20, origem: 'calculada:comercial', origem_detalhe: 'custo comercial' }),
  L({ fazenda_id: FZ_B, plano_conta_id: 'c-nut', mes: 1, valor: 111, origem: 'calculada:nutricao', origem_detalhe: 'parâmetros' }),
];

describe('P109 — leitura da fn_meta_linhas', () => {
  it('confere campo a campo e recusa linha sem mês ou valor válido (nunca vira zero)', () => {
    const r = lerMetaLinhas([
      { fazenda_id: 'f', plano_conta_id: 'p', mes: 2, valor: '10.5', origem: 'digitada', origem_detalhe: 'meta digitada', origem_id: 'x' },
      { mes: 13, valor: 1, origem: 'digitada' }, { mes: 1, valor: 'abc', origem: 'digitada' }, { mes: 1, valor: 1 }, null, 'lixo',
    ]);
    expect(r).toEqual([{ fazenda_id: 'f', plano_conta_id: 'p', mes: 2, valor: 10.5, origem: 'digitada', origem_detalhe: 'meta digitada', origem_id: 'x' }]);
    expect(lerMetaLinhas(null)).toEqual([]);
  });

  it('cada origem cai no seu mapa; a digitada do planejamento não (ela é o ajuste editável)', () => {
    expect(mapaDaOrigem({ origem: 'digitada', origem_detalhe: 'meta digitada' })).toBeNull();
    expect(mapaDaOrigem({ origem: 'digitada', origem_detalhe: 'projeto de investimento' })).toBe('projetos');
    expect(mapaDaOrigem({ origem: 'calculada:financiamento', origem_detalhe: '' })).toBe('financiamento');
    expect(mapaDaOrigem({ origem: 'calculada:reposicao', origem_detalhe: '' })).toBe('rebanho');
    expect(mapaDaOrigem({ origem: 'calculada:receita', origem_detalhe: 'adiantamento de boitel' })).toBe('rebanho');
    /* P109/P120: o espelho (lançamento META no financeiro) não é meta — se reaparecer, não entra em mapa nenhum */
    expect(mapaDaOrigem({ origem: 'espelho', origem_detalhe: '' })).toBeNull();
    expect(mapaDaOrigem({ origem: 'calculada:frete', origem_detalhe: '' })).toBe('nutricao');
  });

  it('os mapas: pela CONTA do plano, em módulo, 2 casas, só a fazenda pedida; conta fora do plano volta em semConta', () => {
    const m = mapasDaMeta([...LINHAS, L({ plano_conta_id: 'c-sumiu', valor: 9, origem: 'calculada:frete' })], PLANO, FZ_A);
    expect(m.nutricao.get('Nutrição')?.[0]).toBe(1000);
    expect(m.financiamento.get('Nutrição')?.[0]).toBe(400);
    expect(m.financiamento.get('Amortização Financiamento Pecuária')?.[5]).toBe(700);
    expect(m.nutricao.get('Impostos e Despesas de Abates e Vendas')?.[4]).toBe(20);
    expect(m.rebanho.get('Adiantamento de Boitel')?.[1]).toBe(3000);
    expect(m.projetos.get('Cercas')?.[7]).toBe(1200);
    expect(m.semConta.map((l) => l.plano_conta_id)).toEqual(['c-sumiu']);
    expect(mapasDaMeta(LINHAS, PLANO, null).nutricao.get('Nutrição')?.[0]).toBe(1111);
  });
});

describe('P109 — a regra única de juntar', () => {
  const mapas = mapasDaMeta(LINHAS, PLANO, FZ_A);

  it('no mesmo subcentro e mês TUDO SOMA — sem prioridade entre origens (a do PC-100 morreu)', () => {
    expect(autoDoSubcentro('Nutrição', mapas)?.[0]).toBe(1400);
    expect(autoDoSubcentro('Subcentro sem auto', mapas)).toBeNull();
  });

  it('o adiantamento de boitel não dobra a venda: 5010 e 1150 são linhas separadas, cada uma com o seu valor', () => {
    expect(autoDoSubcentro('Adiantamento de Boitel', mapas)?.[1]).toBe(3000);
    expect(autoDoSubcentro('Venda em Boitel', mapas)?.reduce((a, b) => a + b, 0)).toBe(9000);
  });

  it('o grid consolidado = auto + digitado; o auto sem linha no grid ganha a dele (nunca some)', () => {
    const grid = [{ subcentro: 'Nutrição', meses: [250, ...new Array(11).fill(0)] }, { subcentro: 'Abates de Machos', meses: new Array(12).fill(0) }];
    const out = gridMetaConsolidado(grid, mapas, (sub, meses) => ({ subcentro: sub, meses }));
    expect(out[0].meses[0]).toBe(1650);
    expect(out[1].meses[2]).toBe(5000);
    expect(out.map((g) => g.subcentro)).toContain('Cercas');
    expect(grid[0].meses[0]).toBe(250);
  });

  it('A TELA DE META = A VISÃO GERAL: por subcentro × mês, o consolidado = a soma de |valor| de todas as linhas (a regra da fn_vg_meta)', () => {
    const daFazenda = LINHAS.filter((l) => l.fazenda_id === FZ_A);
    const vg = new Map<string, number>();
    for (const l of daFazenda) {
      const k = `${PLANO.get(l.plano_conta_id ?? '')}|${l.mes}`;
      vg.set(k, Math.round(((vg.get(k) ?? 0) + Math.abs(l.valor)) * 100) / 100);
    }
    const digitado = new Map<string, number[]>();
    for (const l of daFazenda.filter((x) => mapaDaOrigem(x) === null)) {
      const sub = PLANO.get(l.plano_conta_id ?? '') ?? '';
      if (!digitado.has(sub)) digitado.set(sub, new Array(12).fill(0));
      digitado.get(sub)![l.mes - 1] += l.valor;
    }
    const grid = [...PLANO.values()].map((sub) => ({ subcentro: sub, meses: digitado.get(sub) ?? new Array(12).fill(0) }));
    const tela = new Map<string, number>();
    for (const g of gridMetaConsolidado(grid, mapas, (sub, meses) => ({ subcentro: sub, meses }))) {
      g.meses.forEach((v, i) => { if (v) tela.set(`${g.subcentro}|${i + 1}`, Math.round(v * 100) / 100); });
    }
    expect(vg.size).toBeGreaterThan(5);
    expect(tela).toEqual(vg);
  });
});

/* ── A TRAVA: o front não calcula meta ── */
const RAIZ = resolve(process.cwd(), 'src');
function fontes(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const c = join(dir, nome);
    if (statSync(c).isDirectory()) { fontes(c, achados); continue; }
    if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome) && !nome.endsWith('.d.ts')) achados.push(c);
  }
  return achados;
}
const TODAS = fontes(RAIZ).map((c) => ({ caminho: relative(process.cwd(), c), texto: readFileSync(c, 'utf8') }));
const ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('P109 — a trava: nenhuma meta paralela no front', () => {
  it('as peças do cálculo e da junta antigos não voltam em arquivo nenhum', () => {
    /* declaração ou importação (comentário histórico que cita o nome antigo não conta) */
    const proibidos = /\b(?:function|const)\s+(?:calcNutricaoFazenda|mergeNutricaoMaps|mapRebanhoSubcentro|lerNutricaoMetaAutoMensal|composeGridMetaConsolidado)\b|import[^;\n]*composeGridMetaConsolidado|\bconst\s+SUBCENTROS_(?:NUTRICAO|REBANHO|FINANCIAMENTO|AUTO|NUTRICAO_META_AUTO)\b|\bextrasGrid\b/;
    const achados = TODAS.filter((f) => f.caminho !== 'src/lib/financeiro/metaLinhas.ts' && proibidos.test(f.texto)).map((f) => f.caminho);
    expect(achados).toEqual([]);
  });

  it('os parâmetros de nutrição e os projetos só se leem nas próprias telas de cadastro (nunca para calcular meta)', () => {
    const quem = (tabela: string) => TODAS.filter((f) => f.texto.includes(`.from('${tabela}'`)).map((f) => f.caminho).sort();
    expect(quem('meta_parametros_nutricao')).toEqual(['src/components/financeiro/ModalParametrosNutricao.tsx']);
    expect(quem('meta_projetos_investimento')).toEqual(['src/components/financeiro/ProjetosInvestimento.tsx']);
  });

  it('o hub lê a meta auto SÓ da fn_meta_linhas (nada de rebanho, parcelas ou cache zootécnico direto)', () => {
    const hub = ler('src/hooks/usePlanejamentoFinanceiro.ts');
    expect(hub).toContain("rpc('fn_meta_linhas', { p_cliente: clienteId, p_ano: ano, p_regime: 'caixa' })");
    for (const t of ['financiamento_parcelas', 'zoot_mensal_cache', 'lancamentos', 'meta_parametros_nutricao', 'meta_projetos_investimento']) {
      expect(hub).not.toContain(`.from('${t}'`);
    }
  });

  it('o Resumo Executivo e o histórico de indicador leem a meta da fn_meta_linhas, não do planejamento cru', () => {
    for (const p of ['src/hooks/useResumoExecMeta.ts', 'src/hooks/useHistoricoIndicador.ts']) {
      const t = ler(p);
      expect(t).toContain("rpc('fn_meta_linhas'");
      expect(t).not.toContain(".from('planejamento_financeiro'");
    }
  });
});
