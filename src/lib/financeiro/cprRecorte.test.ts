/**
 * CPR-PERIODO-VENCIDOS-01 — o dono do recorte de Contas a Pagar e Receber.
 * Tabela de casos da função pura + o contrato da tela lido da FONTE (a tela não se monta em teste: a consulta é do hook).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  periodoDoAtalho, baldeDaConta, recortarCpr, ramoDaConsultaCpr, somarDiasIso, diasEntre, liquidoEmAberto, doSegmentoCpr,
  tituloDoGrupoVencidos, rotuloDoTotal, centavosDaConta, contaDaConta, daContaCpr, resumoPorContaCpr, contasDaFaixaCpr, SEM_CONTA, type ContaCpr,
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

describe('CPR-CONTA-01 — filtro e resumo por conta, no mesmo dono', () => {
  const tela2 = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  const sai = (venc: string | null, valor: number, ct: string | null, o: Partial<ContaCpr> = {}) => conta(venc, valor, { conta_bancaria_id: ct, conta_destino_id: null, ...o });
  const entra = (venc: string | null, valor: number, ct: string | null, o: Partial<ContaCpr> = {}) => conta(venc, valor, { tipo_operacao: '1-Entradas', conta_destino_id: ct, conta_bancaria_id: null, ...o });
  const linhas = [
    sai('2025-08-31', 1000.10, 'A'), sai('2026-10-04', 0.1, 'B'), sai('2026-10-03', 0.2, null),     // vencidos a pagar: A, B e sem conta
    entra('2026-10-01', 200.20, 'A'),                                                              // vencido a receber, conta A (pelo destino)
    sai(HOJE, 300.30, 'A'), sai('2026-10-20', 50, 'B'), sai('2026-10-21', 12000, null),             // período a pagar
    entra('2026-11-01', 5000, 'B'), entra('2026-10-30', 70, null),                                  // período a receber
    sai('2026-10-10', 999, 'A', { status_transacao: 'realizado', data_pagamento: '2026-10-09' }),   // paga
    sai('2026-12-25', 4000, 'C'),                                                                   // fora do período: a conta C não entra no resumo
  ];
  const op = { periodo: D30, hoje: HOJE, incluirVencidos: true };
  const todas = recortarCpr(linhas, op);
  const c = (v: number) => Math.round(v * 100);
  it('a conta de cada lançamento é a da DIREÇÃO: entrada pelo destino, saída pela bancária', () => {
    expect(contaDaConta(entra(HOJE, 1, 'X'))).toBe('X');
    expect(contaDaConta(sai(HOJE, 1, 'Y'))).toBe('Y');
    expect(contaDaConta(conta(HOJE, 1, { tipo_operacao: '1-Entradas', conta_bancaria_id: 'Y', conta_destino_id: null }))).toBeNull();
    expect(daContaCpr(sai(HOJE, 1, null), SEM_CONTA)).toBe(true);
    expect(daContaCpr(sai(HOJE, 1, 'Y'), SEM_CONTA)).toBe(false);
    expect(daContaCpr(sai(HOJE, 1, 'Y'), null)).toBe(true);
  });
  it('a soma das contas (com "sem conta") = o total de Todas, ao centavo — vencidos, a pagar e a receber', () => {
    const chaves = ['A', 'B', 'C', SEM_CONTA];
    const por = chaves.map(k => recortarCpr(linhas, { ...op, conta: k }));
    const soma = (f: (r: typeof todas) => number) => por.reduce((t, r) => t + c(f(r)), 0);
    expect(soma(r => r.vencidos.pagar.valor)).toBe(c(todas.vencidos.pagar.valor));
    expect(soma(r => r.vencidos.receber.valor)).toBe(c(todas.vencidos.receber.valor));
    expect(soma(r => r.periodoSoma.pagar.valor)).toBe(c(todas.periodoSoma.pagar.valor));
    expect(soma(r => r.periodoSoma.receber.valor)).toBe(c(todas.periodoSoma.receber.valor));
    expect(soma(r => r.total.pagar.valor)).toBe(c(todas.total.pagar.valor));
    expect(por.reduce((t, r) => t + r.total.pagar.contas + r.total.receber.contas, 0)).toBe(todas.total.ambos.contas);
    /* cada linha em exatamente uma conta */
    for (const l of linhas) expect(chaves.filter(k => daContaCpr(l, k)).length).toBe(1);
  });
  it('conta filtrada devolve só as dela', () => {
    const a = recortarCpr(linhas, { ...op, conta: 'A' });
    expect(a.vencidos.pagar).toEqual({ valor: 1000.10, contas: 1 });
    expect(a.vencidos.receber).toEqual({ valor: 200.20, contas: 1 });
    expect(a.periodoSoma.pagar).toEqual({ valor: 300.30, contas: 1 });
    expect(a.pagas.length).toBe(1);
    expect([...a.vencidos.linhas, ...a.periodoSoma.linhas, ...a.pagas].every(l => contaDaConta(l) === 'A')).toBe(true);
    const sem = recortarCpr(linhas, { ...op, conta: SEM_CONTA });
    expect(sem.total.pagar).toEqual({ valor: 12000.20, contas: 2 });
    expect(sem.periodoSoma.receber).toEqual({ valor: 70, contas: 1 });
  });
  it('o resumo: maior valor a pagar primeiro, "sem conta" NUNCA escondida, e a soma é o total de Todas', () => {
    const r = resumoPorContaCpr(linhas, op);
    expect(r.map(x => x.conta)).toEqual([SEM_CONTA, 'A', 'B']);
    expect(r.map(x => x.pagar)).toEqual([{ valor: 12000.20, contas: 2 }, { valor: 1300.40, contas: 2 }, { valor: 50.10, contas: 2 }]);
    expect(r.reduce((t, x) => t + c(x.pagar.valor), 0)).toBe(c(todas.total.pagar.valor));
    expect(r.reduce((t, x) => t + x.pagar.contas, 0)).toBe(todas.total.pagar.contas);
    expect(r.reduce((t, x) => t + c(x.receber.valor), 0)).toBe(c(todas.total.receber.valor));
  });
  it('a FAIXA não desenha conta com a pagar zero (nem a conta no "+N"); o seletor continua com ela, com R$ 0,00 e a contagem real', () => {
    const soReceber = [...linhas, entra('2026-10-15', 900, 'R')];
    const r = resumoPorContaCpr(soReceber, op);
    expect(r.find(x => x.conta === 'R')).toMatchObject({ pagar: { valor: 0, contas: 0 }, receber: { valor: 900, contas: 1 } });
    expect(contasDaFaixaCpr(r).map(x => x.conta)).toEqual([SEM_CONTA, 'A', 'B']);
    expect(contasDaFaixaCpr(r).every(x => x.pagar.valor > 0)).toBe(true);
    expect(tela2).toContain('{contasNaFaixa.slice(0, MAX_CONTAS_NA_FAIXA).map((c) => (');
    expect(tela2).toContain('+{contasNaFaixa.length - MAX_CONTAS_NA_FAIXA}');
    expect(tela2).toContain('{resumoContas.map((c) => (\n                <SelectItem key={c.conta}');
  });
  it('o resumo segue a caixa "Incluir vencidos": desligada, só o período', () => {
    const r = resumoPorContaCpr(linhas, { ...op, incluirVencidos: false });
    expect(r.map(x => [x.conta, x.pagar.valor])).toEqual([[SEM_CONTA, 12000], ['A', 300.30], ['B', 50]]);
    expect(r.reduce((t, x) => t + c(x.pagar.valor), 0)).toBe(c(recortarCpr(linhas, { ...op, incluirVencidos: false }).total.pagar.valor));    /* conta que só tem VENCIDO: entra no resumo com a caixa ligada (com o valor dela), e sai com a caixa desligada */
    const comD = [...linhas, sai('2026-09-01', 7, 'D')];
    expect(resumoPorContaCpr(comD, op).find(x => x.conta === 'D')?.pagar).toEqual({ valor: 7, contas: 1 });
    expect(resumoPorContaCpr(comD, { ...op, incluirVencidos: false }).some(x => x.conta === 'D')).toBe(false);
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
  it('CPR-CONTA-01: o filtro entra no dono e chega a tudo — cartões, lista, total, gráfico, caixa e cabeçalho', () => {
    expect(tela).toContain('recortarCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos, conta: contaSel })');
    expect(tela).toContain('resumoPorContaCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos })');
    /* o gráfico desenha o que sai do MESMO recorte filtrado, e parte do saldo da MESMA conta */
    expect(tela).toMatch(/const doFluxo = useMemo\(\s*\(\) => \[\.\.\.vencidosDoSegmento, \.\.\.recorte\.periodoSoma\.linhas/);
    expect(tela).toContain('linhas={doFluxo}');
    expect(tela).toContain("contas: caixaTodas.argumentos.contas.filter((c) => c.id === contaSel)");
    /* o cartão do caixa DIZ de quem é o número: a conta, ou "todas as contas" quando o filtro não é uma conta */
    expect(tela).toContain("rotulo={caixaDeUmaConta ? `Caixa · ${nomeConta(contaSel)}` : contaSel === SEM_CONTA ? 'Caixa · todas as contas' : 'Caixa'}");
    /* o nome da conta no cabeçalho enquanto o filtro está ligado */
    expect(tela).toMatch(/\{contaSel != null && \(\s*<span data-testid="cpr-conta-no-cabecalho"/);
    /* clicar no resumo filtra; clicar de novo volta a Todas */
    expect(tela).toContain('const alternarConta = (conta: string) => setContaSel((atual) => (atual === conta ? null : conta));');
    expect(tela).toContain('onClick={() => alternarConta(c.conta)}');
    /* a faixa existe mesmo vazia, com altura fixa; a coluna Conta lê a conta pela direção */
    expect(tela).toMatch(/data-testid="cpr-resumo-contas" className="flex h-\[18px\] flex-nowrap/);
    expect(tela).toContain('{nomeConta(contaDaConta(l))}');
    expect(tela).not.toContain('nomeConta(l.conta_bancaria_id)');
    /* nenhuma consulta nova: a tela continua com as mesmas três chaves de cache */
    expect(Array.from(new Set(Array.from(tela.matchAll(/queryKey: \['(cpr-[a-z]+)'/g)).map(m => m[1]))).sort()).toEqual(['cpr-anexos', 'cpr-caixa', 'cpr-lancs']);
  });
  it('o cartão tem 40px e o valor não corta; o gráfico começa em "de"', () => {
    expect(tela).toContain("'flex min-w-0 h-[40px] items-center gap-1 rounded-md border border-l-[3px] px-1 py-[3px]'");
    /* NENHUM VALOR CORTA NEM FICA SÓ EM `title`: todo valor é `whitespace-nowrap`, sem `truncate`; 12px e a grade são os medidos a
       1.126px com "−R$ 99.999.999,99" nos OITO valores (cinco totais, o "a receber" dos vencidos e as duas linhas do caixa) */
    expect(tela).toMatch(/data-valor-do-cartao\n\s+className=\{cn\('whitespace-nowrap text-\[12px\] font-medium leading-\[18px\] tabular-nums', classeValor\)\}/);
    expect(tela).toContain('grid grid-cols-[1.75fr_1fr_1fr_1fr_1.94fr] gap-1.5');
    /* rótulos curtos, que não cortam; o período fica só na barra 1 e o nome completo no `title` */
    for (const r of ['rotulo="Vencidos"', 'rotulo="A pagar"', 'rotulo="A receber"', 'rotulo="Saldo"']) expect(tela, r).toContain(r);
    expect(tela).not.toMatch(/rotulo="(A pagar no período|A receber no período|Saldo do período|Saldo em caixa)"/);
    const cartao = tela.slice(tela.indexOf('function CardResumo('), tela.indexOf('function Vazio('));
    expect(cartao.match(/data-valor-do-cartao/g)?.length).toBe(2);
    expect(cartao).toContain("<div key={i} title={l.title} className={cn('whitespace-nowrap', l.classe ?? 'text-muted-foreground')}>");
    expect(cartao.match(/truncate/g)?.length).toBe(1);                       // só o TEXTO do rótulo corta
    expect(cartao).toContain('<span className="truncate">{rotulo}</span>');
    expect(cartao).toMatch(/\{contagem && <span className="shrink-0 whitespace-pre tabular-nums"/);   // a contagem é número: não corta
    /* o cartão Vencidos mostra os dois lados À VISTA (a receber em verde, só quando > 0); o do caixa, corrente e investido em duas linhas */
    expect(tela).toContain("lado={recorte.vencidos.receber.valor > 0");
    expect(tela).toContain("rotulo: n.rotulo === 'Corrente' ? 'corr.' : 'inv.',");
    expect(tela).not.toMatch(/extraTitle|classeExtra/);
    expect(tela).toContain('inicio={periodo.de}');
    expect(fluxo).toContain('const inicioDesenho = inicio < hoje ? inicio : hoje;');
    expect(fluxo).not.toContain('d.setUTCMonth(d.getUTCMonth() - 1)');
  });
});
