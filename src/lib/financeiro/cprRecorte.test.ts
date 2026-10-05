/**
 * CPR-PERIODO-VENCIDOS-01 — o dono do recorte de Contas a Pagar e Receber.
 * Tabela de casos da função pura + o contrato da tela lido da FONTE (a tela não se monta em teste: a consulta é do hook).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  periodoDoAtalho, baldeDaConta, recortarCpr, ramoDaConsultaCpr, somarDiasIso, diasEntre, liquidoEmAberto, doSegmentoCpr,
  tituloDoGrupoVencidos, rotuloDoTotal, centavosDaConta, type ContaCpr,
} from '@/lib/financeiro/cprRecorte';

const HOJE = '2026-10-05';
let n = 0;
const conta = (venc: string | null, valor: number, o: Partial<ContaCpr> = {}): ContaCpr => ({
  id: `c${String(++n).padStart(3, '0')}`, data_vencimento: venc, data_pagamento: null, status_transacao: 'programado', tipo_operacao: '2-Saídas', valor, ...o,
});
const MES = periodoDoAtalho('mes', HOJE);
const D30 = periodoDoAtalho('30', HOJE);

describe('os atalhos — datas locais, em texto', () => {
  it('Este mês = 1º ao último dia; 30 e 60 dias = hoje a hoje+N', () => {
    expect(MES).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(D30).toEqual({ de: '2026-10-05', ate: '2026-11-04' });
    expect(periodoDoAtalho('60', HOJE)).toEqual({ de: '2026-10-05', ate: '2026-12-04' });
    expect(periodoDoAtalho('mes', '2028-02-10')).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
    expect(periodoDoAtalho('mes', '2026-12-31')).toEqual({ de: '2026-12-01', ate: '2026-12-31' });
    expect(periodoDoAtalho('30', '2026-12-20')).toEqual({ de: '2026-12-20', ate: '2027-01-19' });
  });
  it('a aritmética de dias não usa o relógio nem o fuso', () => {
    expect(somarDiasIso('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDiasIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(diasEntre('2025-08-31', HOJE)).toBe(400);
    expect(readFileSync(resolve(__dirname, 'cprRecorte.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('toISOString');
  });
});

describe('os baldes — cada conta em exatamente um', () => {
  it('a tabela', () => {
    const casos: [string, ContaCpr, ReturnType<typeof baldeDaConta>][] = [
      ['hoje é do período, não vencida', conta(HOJE, 10), 'periodo'],
      ['ontem é vencida', conta('2026-10-04', 10), 'vencido'],
      ['vencida há 400 dias', conta('2025-08-31', 10), 'vencido'],
      ['último dia do período', conta('2026-11-04', 10), 'periodo'],
      ['um dia depois do período', conta('2026-11-05', 10), 'fora'],
      ['sem vencimento', conta(null, 10), 'sem_vencimento'],
      ['realizada no período', conta('2026-10-10', 10, { status_transacao: 'realizado', data_pagamento: '2026-10-10' }), 'paga'],
      ['realizada e vencida no calendário', conta('2026-09-01', 10, { status_transacao: 'realizado', data_pagamento: '2026-09-01' }), 'paga'],
      ['em aberto no status, mas com data de pagamento', conta('2026-09-01', 10, { data_pagamento: '2026-09-01' }), 'paga'],
      ['previsto e agendado contam como em aberto', conta('2026-10-20', 10, { status_transacao: 'agendado' }), 'periodo'],
    ];
    for (const [nome, c, esperado] of casos) expect(baldeDaConta(c, D30, HOJE), nome).toBe(esperado);
  });
  it('"de" no passado: o que está entre "de" e ontem e em aberto é VENCIDO, uma vez só', () => {
    const c = conta('2026-10-02', 100);
    expect(baldeDaConta(c, MES, HOJE)).toBe('vencido');
    const r = recortarCpr([c, conta('2026-10-20', 50)], { periodo: MES, hoje: HOJE, incluirVencidos: true });
    expect(r.vencidos.pagar).toEqual({ valor: 100, contas: 1 });
    expect(r.periodoSoma.pagar).toEqual({ valor: 50, contas: 1 });
    expect(r.total.pagar).toEqual({ valor: 150, contas: 2 });
  });
  it('"de" no futuro: entre hoje e "de" fica fora (nem vencido, nem período)', () => {
    expect(baldeDaConta(conta('2026-10-10', 1), { de: '2026-10-15', ate: '2026-10-31' }, HOJE)).toBe('fora');
  });
});

describe('cartões e total — uma função, os mesmos dados', () => {
  const linhas = [
    conta('2025-08-31', 1000.10),                                              // vencida há 400 dias, a pagar
    conta('2026-10-04', 200.20, { tipo_operacao: '1-Entradas' }),              // vencida ontem, a receber
    conta(HOJE, 300.30),                                                       // hoje, a pagar
    conta('2026-10-20', 0.1), conta('2026-10-21', 0.2),                        // 0,1 + 0,2 = 0,30 exato
    conta('2026-11-01', 5000, { tipo_operacao: '1-Entradas' }),                // período, a receber
    conta('2026-10-10', 999, { status_transacao: 'realizado', data_pagamento: '2026-10-09' }),   // paga: fora dos totais
    conta(null, 77),                                                           // sem vencimento
    conta('2026-12-25', 4000),                                                 // fora do período
    conta('2026-10-12', 50, { tipo_operacao: '3-Transferências' }),            // transferência: nem pagar nem receber
  ];
  const r = recortarCpr(linhas, { periodo: D30, hoje: HOJE, incluirVencidos: true });
  it('vencidos, período, saldo do período (sem vencidos) e total', () => {
    expect(r.vencidos.pagar).toEqual({ valor: 1000.10, contas: 1 });
    expect(r.vencidos.receber).toEqual({ valor: 200.20, contas: 1 });
    expect(r.vencidos.maisAntiga).toBe('2025-08-31');
    expect(r.vencidos.diasDaMaisAntiga).toBe(400);
    expect(r.periodoSoma.pagar).toEqual({ valor: 300.60, contas: 3 });
    expect(r.periodoSoma.receber).toEqual({ valor: 5000, contas: 1 });
    expect(r.periodoSoma.saldo).toBe(4699.40);
    expect(r.total.pagar).toEqual({ valor: 1300.70, contas: 4 });
    expect(r.total.receber).toEqual({ valor: 5200.20, contas: 2 });
    expect(r.total.ambos).toEqual({ valor: 3899.50, contas: 6 });
    expect(r.pagas.length).toBe(1);
    expect(r.semVencimento.pagar).toEqual({ valor: 77, contas: 1 });
  });
  it('"Incluir vencidos" desligada: o cartão de vencidos continua dizendo o valor; o total fica só com o período', () => {
    const s = recortarCpr(linhas, { periodo: D30, hoje: HOJE, incluirVencidos: false });
    expect(s.vencidos.pagar).toEqual(r.vencidos.pagar);
    expect(s.total.pagar).toEqual({ valor: 300.60, contas: 3 });
    expect(s.total.receber).toEqual({ valor: 5000, contas: 1 });
    expect(s.total.ambos).toEqual({ valor: 4699.40, contas: 4 });
    expect(s.periodoSoma).toEqual(r.periodoSoma);
  });
  it('a soma dos grupos da lista = o total, ao centavo, nos três segmentos', () => {
    for (const seg of ['pagar', 'receber', 'ambos'] as const) {
      const grupoVencidos = r.vencidos.linhas.filter(l => doSegmentoCpr(l, seg));
      const porDia = new Map<string, ContaCpr[]>();
      for (const l of [...r.periodoSoma.linhas, ...r.pagas].filter(x => doSegmentoCpr(x, seg))) {
        porDia.set(l.data_vencimento ?? '', [...(porDia.get(l.data_vencimento ?? '') ?? []), l]);
      }
      const centavos = (v: number) => Math.round(v * 100);
      const soma = centavos(liquidoEmAberto(grupoVencidos)) + Array.from(porDia.values()).reduce((t, g) => t + centavos(liquidoEmAberto(g)), 0);
      const esperado = seg === 'pagar' ? -centavos(r.total.pagar.valor) : centavos(r.total[seg].valor);
      expect(soma, seg).toBe(esperado);
    }
  });
  it('nunca arredonda: centavos inteiros, e zero é zero', () => {
    expect(centavosDaConta({ valor: '1234567.89' })).toBe(123456789);
    expect(centavosDaConta({ valor: -0.07 })).toBe(7);
    const z = recortarCpr([], { periodo: D30, hoje: HOJE, incluirVencidos: true });
    expect(z.periodoSoma.pagar).toEqual({ valor: 0, contas: 0 });
    expect(z.periodoSoma.saldo).toBe(0);
    expect(z.vencidos.maisAntiga).toBeNull();
  });
  it('o resultado não depende da ordem em que as linhas chegam', () => {
    const inv = recortarCpr([...linhas].reverse(), { periodo: D30, hoje: HOJE, incluirVencidos: true });
    expect({ ...inv, vencidos: { ...inv.vencidos }, pagas: [], semVencimento: null })
      .toEqual({ ...r, vencidos: { ...r.vencidos }, pagas: [], semVencimento: null });
  });
});

describe('a consulta e as frases', () => {
  it('uma busca: período ∪ vencidos EM ABERTO de qualquer idade ∪ sem vencimento', () => {
    expect(ramoDaConsultaCpr(D30, HOJE)).toBe(
      'and(data_vencimento.gte.2026-10-05,data_vencimento.lte.2026-11-04),'
      + 'and(data_vencimento.lt.2026-10-05,status_transacao.in.(previsto,programado,agendado),data_pagamento.is.null),'
      + 'data_vencimento.is.null');
  });
  it('o título do grupo e o rótulo do total', () => {
    expect(tituloDoGrupoVencidos(12, 87)).toBe('Vencidos · 12 contas · a mais antiga há 87 dias');
    expect(tituloDoGrupoVencidos(1, 1)).toBe('Vencidos · 1 conta · a mais antiga há 1 dia');
    expect(rotuloDoTotal('pagar', true, 14)).toBe('Total a pagar · vencidos + período · 14 contas');
    expect(rotuloDoTotal('receber', false, 1)).toBe('Total a receber · período, sem vencidos · 1 conta');
  });
});

describe('a tela só renderiza o dono (lido da fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  const fluxo = readFileSync(resolve(__dirname, '../../components/financeiro-v2/CprFluxoPrevisto.tsx'), 'utf8');
  it('a consulta e a chave de cache não dependem da visão', () => {
    const chave = /queryKey: \['cpr-lancs',[^\]]*\]/.exec(tela)?.[0] ?? '';
    expect(chave).toContain('periodo.de, periodo.ate');
    expect(chave).not.toContain('visao');
    expect(tela).toContain('const ramo = ramoDaConsultaCpr(periodo, hojeIso);');
    expect(tela).not.toMatch(/ramoDoHorizonte|limiteDoHorizonte/);
  });
  it('os cartões e o total leem `recorte`; nenhuma soma de `linhas` na tela', () => {
    expect(tela).toContain('recortarCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos })');
    for (const campo of ['recorte.vencidos.pagar.valor', 'recorte.periodoSoma.pagar.valor', 'recorte.periodoSoma.receber.valor', 'recorte.periodoSoma.saldo', 'recorte.total[segmento]']) {
      expect(tela, campo).toContain(campo);
    }
    expect(tela).not.toMatch(/linhas\.filter\([^)]*\)\.reduce\(/);
    expect(tela).not.toMatch(/totalPagar|totalReceber/);
  });
  it('saíram Vencidos, 7 dias, 90 dias e Tudo; "Banco" virou "Conta"; o total é fixo, fora da rolagem', () => {
    expect(tela).not.toMatch(/rotulo: '(Vencidos|7 dias|90 dias|Tudo)'/);
    expect(tela).toContain(">Conta</span>");
    expect(tela).not.toContain(">Banco</span>");
    expect(tela.indexOf('data-testid="cpr-total"')).toBeGreaterThan(tela.indexOf('overflow-y-auto overflow-x-hidden rolagem-fina'));
    expect(tela).toMatch(/data-testid="cpr-total" className="flex h-\[22px\] shrink-0/);
  });
  it('o cartão tem 40px e o valor não corta; o gráfico começa em "de"', () => {
    expect(tela).toContain("'flex min-w-0 h-[40px] items-center gap-1 rounded-md border border-l-[3px] px-1 py-[3px]'");
    /* NENHUM VALOR CORTA NEM FICA SÓ EM `title`: todo valor é `whitespace-nowrap`, sem `truncate`; 12px e a grade são os medidos a
       1.126px com "−R$ 99.999.999,99" nos OITO valores (cinco totais, o "a receber" dos vencidos e as duas linhas do caixa) */
    expect(tela).toMatch(/data-valor-do-cartao\n\s+className=\{cn\('whitespace-nowrap text-\[12px\] font-medium leading-\[18px\] tabular-nums', classeValor\)\}/);
    expect(tela).toContain('grid grid-cols-[1.72fr_1fr_1fr_1fr_1.9fr] gap-1.5');
    const cartao = tela.slice(tela.indexOf('function CardResumo('), tela.indexOf('function Vazio('));
    expect(cartao.match(/data-valor-do-cartao/g)?.length).toBe(2);
    expect(cartao).toContain("<div key={i} title={l.title} className={cn('whitespace-nowrap', l.classe ?? 'text-muted-foreground')}>");
    expect(cartao.match(/truncate/g)?.length).toBe(1);                       // só o RÓTULO (texto) corta
    expect(cartao).toMatch(/className="truncate text-\[10px\] leading-\[12px\] text-muted-foreground" title=\{titulo \?\? rotulo\}/);
    /* o cartão Vencidos mostra os dois lados À VISTA (a receber em verde, só quando > 0); o do caixa, corrente e investido em duas linhas */
    expect(tela).toContain("lado={recorte.vencidos.receber.valor > 0");
    expect(tela).toContain("rotulo: n.rotulo === 'Corrente' ? 'corr.' : 'inv.',");
    expect(tela).not.toMatch(/extraTitle|classeExtra/);
    expect(tela).toContain('inicio={periodo.de}');
    expect(fluxo).toContain('const inicioDesenho = inicio < hoje ? inicio : hoje;');
    expect(fluxo).not.toContain('d.setUTCMonth(d.getUTCMonth() - 1)');
  });
});
