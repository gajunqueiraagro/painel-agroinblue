/**
 * A LEITURA DOS ANOS DO DRE DA PECUÁRIA — DRE-CASCATA-MODAL-01.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO É O DA EXTRAÇÃO: o R$/@ do desfrute, o da reposição e o ágio saíram do
 * corpo da `PecCascataView` para `indicadoresDoAno`. O corpo de ANTES está copiado aqui, do HEAD a607b1d2,
 * e os três números têm de ser IDÊNTICOS nos três clientes medidos — só cor e fonte mudaram na
 * cascata. Sem este caso, uma "limpeza" na função pura mudaria a cascata calada.
 * ⚠ OS NÚMEROS SÃO DO BANCO (`fn_dre_pecuaria`, realizado, ano civil, total do cliente, 28/09/2026).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { kgToArrobas } from '@/types/cattle';
import {
  indicadoresDoAno, passosDaPonte, posicionarPonte, ehParcial, variacaoNoAno, rsDoCentroDeVenda, type UnidadePonte,
} from '@/components/agri/pecLeituraAnos';
import { gmdDoPeriodo, mesesDoPeriodo } from '@/hooks/useLeituraAnosPec';
import { computePeriodGmd } from '@/lib/calculos/painelConsultorIndicadores';
import { TabelaIndicadores, deltaDaLinha, periodosDaLeitura } from '@/components/agri/PecGraficoModal';
import { colunaDoAnoAnterior } from '@/components/agri/drePecRegua';
import type { ColunaPec } from '@/components/agri/drePecRegua';
import type { DrePecLinhas, MovimentosPec } from '@/hooks/useDrePecuaria';

type Base = {
  vendas: number; reposicao: number; custo_variavel: number; custo_fixo: number; rateio_adm: number;
  resultado_operacional: number; vpb_operacional: number; efeito_mercado: number; cab_ini: number; cab_fim: number;
  producao: DrePecLinhas['producao'];
};
const linhas = (b: Base): DrePecLinhas => ({
  vendas: b.vendas, outras_receitas: 0, receita_bruta: b.vendas, deducoes: 0, receita_liquida: b.vendas,
  vpb_operacional: b.vpb_operacional, reposicao: b.reposicao, vbp: null, custo_variavel: b.custo_variavel,
  margem: null, custo_fixo: b.custo_fixo, rateio_adm: b.rateio_adm, resultado_operacional: b.resultado_operacional,
  juros: 0, resultado_periodo: null, efeito_mercado: b.efeito_mercado, resultado_com_mercado: null, investimento: 0,
  lucro_liquido: null, juros_proprio: 0, juros_rateado: 0, a_pagar: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: b.cab_ini, cab_fim: b.cab_fim, cab_media: 0 },
  producao: b.producao, p0_fonte: 'fechamento', p1_fonte: 'fechamento', centros: [], centros_juros: [],
});

const NJ2025 = linhas({
  vendas: 17061764.09, reposicao: 1483933.76, custo_variavel: 6276369.82, custo_fixo: 2624198.9, rateio_adm: 890372.6,
  resultado_operacional: 4550084.37, vpb_operacional: -1323200.21, efeito_mercado: 2082791.04, cab_ini: 7210, cab_fim: 6824,
  producao: { ha_medio: 4882.4, at_comprada: 3835.5, at_produzida: 38847.18, cab_comprada: 448, at_desfrutada: 53276.47, cab_desfrutada: 2943 },
});
/** SR 2021: compra de 6 cabeças SEM reposição no DRE (REPOSICAO-SEM-CUSTO-01). */
const SR2021 = linhas({
  vendas: 3815858.8, reposicao: 0, custo_variavel: 1241228.54, custo_fixo: 1086047.33, rateio_adm: 153571.94,
  resultado_operacional: 2522969.43, vpb_operacional: 1024679.71, efeito_mercado: 2583931.57, cab_ini: 3607, cab_fim: 4097,
  producao: { ha_medio: 2778.3, at_comprada: 90, at_produzida: 13198.15, cab_comprada: 6, at_desfrutada: 10371.57, cab_desfrutada: 1120 },
});
/** RRCC 2021: o cache do ano está vazio (CACHE-RRCC-2021-01) — `at_produzida` nulo. */
const RRCC2021 = linhas({
  vendas: 2874203.0833333335, reposicao: 1284934.64, custo_variavel: 249420.35, custo_fixo: 404289.94, rateio_adm: 33823.56,
  resultado_operacional: 842955.6233333335, vpb_operacional: 2896.31, efeito_mercado: 360087.52, cab_ini: 595, cab_fim: 615,
  producao: { ha_medio: 339.2, at_comprada: 4480.63, at_produzida: null, cab_comprada: 525, at_desfrutada: 8493.62, cab_desfrutada: 496 },
});

/** O corpo de ANTES, da `PecCascataView` do HEAD a607b1d2 (linhas 116-126): as mesmas expressões, lidas de `l`
    em vez de `col?.linhas` — a única troca é o nome de quem traz as linhas. */
function corpoAntigo(l: DrePecLinhas) {
  const prod = l.producao ?? null;
  const atDesf = prod?.at_desfrutada == null ? null : kgToArrobas(prod.at_desfrutada * 15 / 0.5);
  const atComp = prod?.at_comprada ?? null;
  const rsDesf = l.vendas ?? null;
  const rsComp = l.reposicao ?? null;
  const pkDesf = atDesf && atDesf !== 0 && rsDesf != null ? rsDesf / atDesf : null;
  const pkComp = atComp && atComp !== 0 && rsComp != null && rsComp !== 0 ? rsComp / atComp : null;
  const agio = pkComp == null || pkDesf == null || pkDesf === 0 ? null : pkComp / pkDesf - 1;
  return { atDesf, pkDesf, pkComp, agio };
}

describe('indicadoresDoAno — a extração da cascata não muda número', () => {
  it.each([['NJ 2025', NJ2025], ['SR 2021', SR2021], ['RRCC 2021', RRCC2021]])(
    '%s: @ desfrutada, R$/@ do desfrute, R$/@ da reposição e ágio idênticos ao corpo antigo', (_n, l) => {
      const novo = indicadoresDoAno(l);
      const velho = corpoAntigo(l);
      expect(novo.atDesf).toBe(velho.atDesf);
      expect(novo.pkDesf).toBe(velho.pkDesf);
      expect(novo.pkComp).toBe(velho.pkComp);
      expect(novo.agio).toBe(velho.agio);
    });
});

describe('indicadoresDoAno — custo por @ e margem (decisões 1 e 2)', () => {
  it('NJ 2025: custeio COM rateio, custo por @ produzida e margem por @', () => {
    const x = indicadoresDoAno(NJ2025);
    expect(x.custeio).toBeCloseTo(6276369.82 + 2624198.9 + 890372.6, 2);
    expect(x.pkDesf).toBeCloseTo(17061764.09 / 53276.47, 6);
    expect(x.custoAt).toBeCloseTo(9790941.32 / 38847.18, 6);
    expect(x.margemAt).toBeCloseTo(17061764.09 / 53276.47 - 9790941.32 / 38847.18, 6);
    expect(x.margemPct).toBeCloseTo((x.margemAt ?? 0) / (x.pkDesf ?? 1), 9);
    /* ⚠ O CUSTEIO SEM O RATEIO (o do PC-100) DARIA OUTRO NÚMERO — a decisão 1 escolheu o do Resumido. */
    expect(x.custoAt).not.toBeCloseTo((6276369.82 + 2624198.9) / 38847.18, 0);
    expect(x.lucroOp).toBe(4550084.37);
    expect(x.pctDesf).toBeCloseTo(2943 / 7210, 9);
    expect(x.varCab).toBe(6824 - 7210);
  });

  it('RRCC 2021 sem cache: custo por @ e margem saem em ausência, o resto continua', () => {
    const x = indicadoresDoAno(RRCC2021);
    expect(x.atProd).toBeNull();
    expect(x.custoAt).toBeNull();
    expect(x.margemAt).toBeNull();
    expect(x.margemPct).toBeNull();
    /* A busca sabe achar: o preço de venda e o custeio existem nesse ano. */
    expect(x.pkDesf).not.toBeNull();
    expect(x.custeio).toBeCloseTo(249420.35 + 404289.94 + 33823.56, 2);
  });

  it('SR 2021: compra sem reposição dá traço no R$/@ da compra e no ágio, nunca −100 %', () => {
    const x = indicadoresDoAno(SR2021);
    expect(x.cabComp).toBe(6);
    expect(x.pkComp).toBeNull();
    expect(x.agio).toBeNull();
  });

  it('produção negativa não tem custo por arroba', () => {
    const neg = { ...NJ2025, producao: { ...NJ2025.producao, at_produzida: -120 } };
    expect(indicadoresDoAno(neg).custoAt).toBeNull();
  });

  it('coluna sem linhas é tudo ausência', () => {
    const x = indicadoresDoAno(null);
    expect(Object.values(x).every(v => v === null)).toBe(true);
  });

  it('variação no ano: fração com base absoluta, e sem base é ausência', () => {
    expect(variacaoNoAno(110, 100)).toBeCloseTo(0.1, 9);
    expect(variacaoNoAno(90, -100)).toBeCloseTo(1.9, 9);
    expect(variacaoNoAno(10, 0)).toBeNull();
    expect(variacaoNoAno(null, 5)).toBeNull();
  });
});

/** RRCC 2021 na RPC da ponte: produção zero (cache vazio) e diferença de 3.189 @. */
const MOV_RRCC2021: MovimentosPec = {
  inicio: { cabecas: 595, arrobas: 7104, valor: 0 }, fim: { cabecas: 615, arrobas: 6617, valor: 0 },
  produzidas: { cabecas: 0, arrobas: 0, valor: 0 }, nascimentos: { cabecas: 0, arrobas: 0, valor: 0 },
  compradas: { cabecas: 525, arrobas: 4481, valor: 0 }, transf_entrada: { cabecas: 0, arrobas: 0, valor: 0 },
  vendas_abates: { cabecas: 496, arrobas: 8066, valor: 0 }, mortes: { cabecas: 9, arrobas: 92, valor: 0 },
  transf_saida: { cabecas: 0, arrobas: 0, valor: 0 }, ajustes: { cabecas: 0, arrobas: 3190, valor: 0 },
};

describe('a ponte do rebanho', () => {
  it('fecha: início + entradas − saídas + diferença = fim, em @ e em cab', () => {
    const unidades: UnidadePonte[] = ['at', 'cab'];
    for (const un of unidades) {
      const p = posicionarPonte(passosDaPonte(MOV_RRCC2021, un, true));
      expect(p.fecha).toBe(true);
      expect(p.barras[p.barras.length - 1].acc).toBe(un === 'at' ? 6617 : 615);
    }
  });

  it('a diferença aparece quando não é zero e some quando é — nunca escondida', () => {
    expect(passosDaPonte(MOV_RRCC2021, 'at', true).some(p => p.chave === 'dif' && p.valor === 3190)).toBe(true);
    /* Em cabeças o ajuste do RRCC 2021 é zero: a linha não existe. */
    expect(passosDaPonte(MOV_RRCC2021, 'cab', true).some(p => p.chave === 'dif')).toBe(false);
  });

  it('produção só em @, e em traço quando o DRE não tem produção', () => {
    expect(passosDaPonte(MOV_RRCC2021, 'cab', true).some(p => p.chave === 'producao')).toBe(false);
    expect(passosDaPonte(MOV_RRCC2021, 'at', false).find(p => p.chave === 'producao')?.valor).toBeNull();
    expect(passosDaPonte(MOV_RRCC2021, 'at', true).find(p => p.chave === 'producao')?.valor).toBe(0);
  });

  it('desfrute e mortes entram com sinal negativo; transferência com líquido zero some', () => {
    const ps = passosDaPonte(MOV_RRCC2021, 'at', true);
    expect(ps.find(p => p.chave === 'desfrute')?.valor).toBe(-8066);
    expect(ps.find(p => p.chave === 'mortes')?.valor).toBe(-92);
    expect(ps.some(p => p.chave === 'transf')).toBe(false);
  });
});

describe('ano parcial e GMD', () => {
  it('parcial é o período com menos de doze meses', () => {
    expect(ehParcial(8)).toBe(true);
    expect(ehParcial(12)).toBe(false);
    expect(ehParcial(0)).toBe(false);
  });

  it('meses do período atravessam a virada do ano (safra)', () => {
    expect(mesesDoPeriodo('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('GMD do período é a função oficial sobre os meses dele; sem cache, ausência', () => {
    const porMes = new Map([
      ['2025-07', { prodKg: 30000, cabMedia: 1000 }],
      ['2025-08', { prodKg: 25000, cabMedia: 1100 }],
    ]);
    const esperado = computePeriodGmd([30000, 25000], [1000, 1100], [31, 31])[1];
    expect(gmdDoPeriodo(porMes, '2025-07', '2025-08')).toBeCloseTo(esperado, 12);
    expect(gmdDoPeriodo(new Map(), '2021-01', '2021-12')).toBeNull();
  });

  it('o R$ de um grupo de centros de venda soma só o bloco venda daquele centro', () => {
    const l = { ...NJ2025, centros: [
      { bloco: 'venda', centro: 'Abates', valor: 1000, a_pagar: 0 },
      { bloco: 'venda', centro: 'Venda Peso Vivo', valor: 400, a_pagar: 0 },
      { bloco: 'fixo', centro: 'Abates', valor: 999, a_pagar: 0 },
    ] };
    expect(rsDoCentroDeVenda(l, 'Abates')).toBe(1000);
    expect(rsDoCentroDeVenda(l, 'Venda Geral')).toBe(0);
    expect(rsDoCentroDeVenda(null, 'Abates')).toBeNull();
  });
});

const col = (chave: string, nome: string, l: DrePecLinhas, meses: number): ColunaPec => ({
  chave, nome, sub: '', fazendaId: null, linhas: l, total: false, tipo: 'valor', unidade: 'ha',
  de: '2025-01', ate: meses === 12 ? '2025-12' : '2025-08', cenario: 'realizado', meses, atual: false,
});

describe('a tabela de indicadores — DRE-GRAFICOS-02 (colunas fixas, Unidade · base, Δ pelo sentido)', () => {
  const linha = (rot: string): HTMLTableRowElement => {
    const tr = document.querySelector(`tr[data-indicador="${rot}"]`);
    if (!(tr instanceof HTMLTableRowElement)) throw new Error(`sem a linha ${rot}`);
    return tr;
  };
  const celulaDoAno = (rot: string, i = 0) => linha(rot).querySelectorAll('td')[2 + i];

  it('marca "8m" só nos valores do período e deixa os comparáveis sem marca; a unidade e a base na 2ª coluna', () => {
    const anos = [col('a', 'jan-ago/25', NJ2025, 8)];
    render(<TabelaIndicadores anos={anos} ind={[indicadoresDoAno(NJ2025)]} movs={[null]} gmds={[0.5]}
      unidade="at" parcial={[true]} rotulo={(c) => `${c.nome}*`} onAbrirAno={() => {}} />);
    expect(within(linha('Receita das vendas')).getByText('8m')).toBeTruthy();
    expect(within(linha('Custeio de produção')).getByText('8m')).toBeTruthy();
    expect(within(linha('Preço médio de venda')).queryByText('8m')).toBeNull();
    expect(within(linha('Custo por arroba produzida')).queryByText('8m')).toBeNull();
    expect(linha('Preço médio de venda').querySelectorAll('td')[1].textContent).toBe('R$/@ · média do período');
    expect(linha('Rebanho inicial').querySelectorAll('td')[1].textContent).toBe('cab · no 1º dia');
    /* ⚠ O AVISO DO GMD MORA NO INDICADOR. */
    expect(screen.getByText('período parcial: não compara com ano cheio')).toBeTruthy();
    expect(screen.getByText('jan–ago')).toBeTruthy();
  });

  it('ano cheio não tem marca nem aviso do GMD; com 1 ano, o Δ é traço', () => {
    render(<TabelaIndicadores anos={[col('a', '2025', NJ2025, 12)]} ind={[indicadoresDoAno(NJ2025)]} movs={[null]}
      gmds={[0.5]} unidade="at" parcial={[false]} rotulo={(c) => c.nome} onAbrirAno={() => {}} />);
    expect(screen.queryByText('8m')).toBeNull();
    expect(screen.queryByText('período parcial: não compara com ano cheio')).toBeNull();
    expect(linha('Preço médio de venda').querySelector('[data-delta-qtd]')?.textContent).toBe('—');
  });

  it('RRCC 2021: custo por @ e margem em traço, o ajuste da ponte em cinza com o número', () => {
    render(<TabelaIndicadores anos={[col('a', '2021', RRCC2021, 12)]} ind={[indicadoresDoAno(RRCC2021)]}
      movs={[MOV_RRCC2021]} gmds={[null]} unidade="at" parcial={[false]} rotulo={(c) => c.nome} onAbrirAno={() => {}} />);
    expect(celulaDoAno('Custo por arroba produzida').textContent).toBe('—');
    expect(celulaDoAno('Margem por arroba').textContent).toBe('—');
    expect(celulaDoAno('Ganho médio diário (GMD)').textContent).toBe('—');
    expect(celulaDoAno('Ganho de peso (produção)').textContent).toBe('—');
    const dif = celulaDoAno('Ajuste de contagem');
    expect(dif.textContent).toBe('+3.190');
    expect(dif.className).toContain('text-muted-foreground');
    /* A busca sabe achar: o preço de venda existe (não é traço). */
    expect(celulaDoAno('Preço médio de venda').textContent).not.toBe('—');
  });

  it('o Δ (último × anterior): custo que sobe é vermelho; preço que sobe é verde; o cabeçalho diz os dois anos; a largura não estica', () => {
    const anos = [col('a', '2024', NJ2025, 12), col('b', '2025', { ...NJ2025, custo_variavel: NJ2025.custo_variavel * 2 }, 12)];
    const { container } = render(<TabelaIndicadores anos={anos} ind={anos.map(c => indicadoresDoAno(c.linhas))} movs={[null, null]}
      gmds={[null, null]} unidade="at" parcial={[false, false]} rotulo={(c) => c.nome} onAbrirAno={() => {}} />);
    const dq = (rot: string): HTMLElement => {
      const td = linha(rot).querySelector('[data-delta-qtd]');
      if (!(td instanceof HTMLElement)) throw new Error(`sem o Δ de ${rot}`);
      return td;
    };
    expect(dq('Custo por arroba produzida').textContent?.startsWith('+')).toBe(true);
    expect(dq('Custo por arroba produzida').className).toContain('text-destructive');
    expect(dq('Custeio de produção').className).toContain('text-destructive');   // mais custeio = pior
    expect(dq('Preço médio de venda').className).toContain('text-muted-foreground');   // mesmo preço nos dois anos: sem cor
    expect(screen.getByTestId('leitura-delta-cabecalho').textContent).toBe('Δ 2025 × 2024');
    expect(container.querySelector('table')?.style.width).toBe(`${194 + 146 + 92 * 2 + 96 + 56}px`);
  });
});

describe('deltaDaLinha — o sentido de cada indicador', () => {
  it('mais é melhor, menos é melhor, neutro; fração em pp sem %; base zero ou ausente', () => {
    expect(deltaDaLinha({ vals: [100, 120], sentido: 1 })).toEqual({ qtd: 20, pct: 0.2, tom: 'melhor' });
    expect(deltaDaLinha({ vals: [160, 150], sentido: -1 })).toEqual({ qtd: -10, pct: -10 / 160, tom: 'melhor' });   // custo caiu
    expect(deltaDaLinha({ vals: [-6100, -9996], sentido: -1 }).tom).toBe('melhor');   // vendeu mais (saída mais negativa)
    expect(deltaDaLinha({ vals: [-250, -142], sentido: 1 }).tom).toBe('melhor');       // morreu menos
    expect(deltaDaLinha({ vals: [1900, 0], sentido: 0 }).tom).toBeNull();               // compra não julga
    const d = deltaDaLinha({ vals: [0.261, 0.322], sentido: 1, forma: 'pct' });
    expect(d.qtd).toBeCloseTo(6.1, 6); expect(d.pct).toBeNull(); expect(d.tom).toBe('melhor');
    expect(deltaDaLinha({ vals: [0, 5], sentido: 1 }).pct).toBeNull();
    expect(deltaDaLinha({ vals: [-100, -50], sentido: 1 }).pct).toBe(0.5);   // base negativa: o % sobre o valor absoluto (o custeio, a morte)
    expect(deltaDaLinha({ vals: [null, 5], sentido: 1 })).toEqual({ qtd: null, pct: null, tom: null });
    expect(deltaDaLinha({ vals: [1, 2, 3], sentido: 1 }).qtd).toBe(1);   // só os dois últimos
  });
});

describe('DRE-GRAFICOS-02 — o seletor "Anos 2 · 3 · 5" e a coluna de ano anterior (uma regra só)', () => {
  it('os anos antes do período da tela: o mesmo recorte de meses, do mais antigo ao mais recente', () => {
    expect(periodosDaLeitura({ de: '2026-01', ate: '2026-10' }, 2)).toEqual([{ de: '2025-01', ate: '2025-10', cenario: 'realizado' }]);
    expect(periodosDaLeitura({ de: '2025-07', ate: '2026-06' }, 3).map(p => `${p.de}..${p.ate}`)).toEqual(['2023-07..2024-06', '2024-07..2025-06']);
    expect(periodosDaLeitura({ de: '2026-01', ate: '2026-10' }, 5)).toHaveLength(4);
    expect(periodosDaLeitura({ de: '2026-01', ate: '2026-10' }, 5)[0].de).toBe('2022-01');
  });
  it('a coluna de ano: sem fazenda na resposta = "—" (nunca escondida); carregando = esqueleto; com DRE, o total e os meses dele', () => {
    const dre = (fazendas: number) => ({ total: NJ2025, periodo: { de: '2025-01', ate: '2025-10', p0: '2025-01', meses: 10 },
      fazendas: Array.from({ length: fazendas }, (_, i) => ({ fazenda_id: `f${i}`, nome: 'Fazenda Exemplo', linhas: NJ2025 })) });
    const comDado = colunaDoAnoAnterior({ de: '2025-01', ate: '2025-10', dre: dre(1), carregando: false }, 1, null, 12);
    expect(comDado).toMatchObject({ chave: '__ano1__', nome: 'jan-out/25', linhas: NJ2025, meses: 10, semDado: false, comparacao: true, atual: false });
    expect(colunaDoAnoAnterior({ de: '2022-01', ate: '2022-10', dre: dre(0), carregando: false }, 4, null, 10).semDado).toBe(true);
    expect(colunaDoAnoAnterior({ de: '2022-01', ate: '2022-10', dre: null, carregando: false }, 4, null, 10)).toMatchObject({ semDado: true, linhas: null, meses: 10 });
    expect(colunaDoAnoAnterior({ de: '2022-01', ate: '2022-10', dre: null, carregando: true }, 4, null, 10)).toMatchObject({ semDado: false, linhas: null });
  });
});
