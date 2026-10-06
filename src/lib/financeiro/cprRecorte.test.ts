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
  ancorasDoCaixaCpr, vencidoContaNoSaldo, serieDoSaldoCpr, linhasDoSaldoCpr,
  resumoPorSemanaCpr, saldoPorContaCpr,
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
  it('"de" no futuro: entre hoje e "de" é ANTES DO PERÍODO (passa pelo saldo, não é listada); depois de "até", fora', () => {
    expect(baldeDaConta(conta('2026-10-10', 1), { de: '2026-10-15', ate: '2026-10-31' }, HOJE)).toBe('antes_do_periodo');
    expect(baldeDaConta(conta(HOJE, 1), { de: '2026-10-15', ate: '2026-10-31' }, HOJE)).toBe('antes_do_periodo');
    expect(baldeDaConta(conta('2026-11-01', 1), { de: '2026-10-15', ate: '2026-10-31' }, HOJE)).toBe('fora');
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
    /* "de" no futuro: a busca começa em HOJE (o que vence entre hoje e "de" passa pelo saldo); "de" no passado: em "de" */
    expect(ramoDaConsultaCpr({ de: '2026-10-20', ate: '2026-10-31' }, HOJE)).toContain('and(data_vencimento.gte.2026-10-05,data_vencimento.lte.2026-10-31)');
    expect(ramoDaConsultaCpr(MES, HOJE)).toContain('and(data_vencimento.gte.2026-10-01,data_vencimento.lte.2026-10-31)');
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
    expect(tela2).toMatch(/\{resumoContas\.map\(\(c\) => \(\n\s+<SelectItem key=\{c\.conta\}/);
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
    expect(tela).toContain('recortarCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos, ancoras, estimadas })');
    for (const campo of ['recorte.vencidos.pagar.valor', 'recorte.periodoSoma.pagar.valor', 'recorte.periodoSoma.receber.valor', 'recorte.total.pagar.valor', 'recorte.total.receber.valor', 'serie.fim', 'serie.menor']) {
      expect(tela, campo).toContain(campo);
    }
    expect(tela).not.toMatch(/linhas\.filter\([^)]*\)\.reduce\(/);
    expect(tela).not.toMatch(/totalPagar|totalReceber/);
  });
  it('saíram Vencidos, 7 dias, 90 dias e Tudo; "Banco" virou "Conta"; o total é fixo, fora da rolagem', () => {
    expect(tela).not.toMatch(/rotulo: '(Vencidos|7 dias|90 dias|Tudo)'/);
    expect(tela).toContain(">Conta</span>");
    expect(tela).not.toContain(">Banco</span>");
    expect(tela.indexOf('testId="cpr-total"')).toBeGreaterThan(tela.indexOf('overflow-y-auto overflow-x-hidden rolagem-fina'));
    /* o rodapé é navy, 26px e `sticky bottom-0` DENTRO do scrollport (as colunas de valor alinham com as linhas) */
    expect(tela).toMatch(/testId="cpr-total" regua=\{regua\} navy\s+className="sticky bottom-0 z-20 h-\[26px\] bg-primary text-\[11px\] font-bold text-primary-foreground"/);
    expect(Array.from(tela.matchAll(/overflow-y-auto/g)).length).toBe(1);
  });
  it('CPR-CONTA-01: o filtro entra no dono e chega a tudo — cartões, lista, total, gráfico, caixa e cabeçalho', () => {
    expect(tela).toContain('recortarCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos, conta: contaSel, ancoras, estimadas })');
    expect(tela).toContain('resumoPorContaCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos })');
    /* o gráfico desenha o que sai do MESMO recorte filtrado, e parte do saldo da MESMA conta */
    expect(tela).toContain('const doFluxo = useMemo(() => linhasDoSaldoCpr(recorte), [recorte]);');
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
    expect(tela).toContain('conta: ${nomeConta(contaDaConta(l))}');   // a Conta saiu da grade: mora no `title` da Descrição
    expect(tela).not.toContain('nomeConta(l.conta_bancaria_id)');
    /* nenhuma consulta nova: a tela continua com as mesmas três chaves de cache */
    expect(Array.from(new Set(Array.from(tela.matchAll(/queryKey: \['(cpr-[a-z]+)'/g)).map(m => m[1]))).sort())
      /* REC-VALOR-CERTO-02: entrou UMA leitura por cliente (`cpr-estimadas`, o conjunto dos lançamentos ainda estimados) — a view da
         lista não expõe `recorrencia_id` nem a marca do valor do mês. Continua sem consulta por linha. */
      .toEqual(['cpr-anexos', 'cpr-caixa', 'cpr-estimadas', 'cpr-lancs']);
  });
  it('o cartão tem 40px e o valor não corta; o gráfico começa em "de"', () => {
    expect(tela).toContain("'flex min-w-0 h-[40px] items-center gap-1 rounded-md border border-l-[3px] px-1 py-[3px]'");
    /* NENHUM VALOR CORTA NEM FICA SÓ EM `title`: todo valor é `whitespace-nowrap`, sem `truncate`; 12px e a grade são os medidos a
       1.126px com "−R$ 99.999.999,99" nos OITO valores (cinco totais, o "a receber" dos vencidos e as duas linhas do caixa) */
    expect(tela).toMatch(/data-valor-do-cartao\n\s+className=\{cn\('whitespace-nowrap text-\[12px\] font-medium leading-\[18px\] tabular-nums', classeValor\)\}/);
    expect(tela).toContain('grid grid-cols-[1.75fr_1fr_1fr_1fr_1.94fr] gap-1.5');
    /* rótulos curtos, que não cortam; o período fica só na barra 1 e o nome completo no `title` */
    for (const r of ['rotulo="Vencidos"', 'rotulo="A pagar"', 'rotulo="A receber"', 'rotulo="Mínimo"']) expect(tela, r).toContain(r);
    expect(tela).not.toMatch(/rotulo="(A pagar no período|A receber no período|Saldo do período|Saldo em caixa)"/);
    const cartao = tela.slice(tela.indexOf('function CardResumo('), tela.indexOf('function CelValor('));
    expect(cartao.match(/data-valor-do-cartao/g)?.length).toBe(2);
    expect(cartao).toContain("<div key={i} title={l.title} className={cn('whitespace-nowrap', l.classe ?? 'text-muted-foreground')}>");
    expect(cartao.match(/truncate/g)?.length).toBe(1);                       // só o TEXTO do rótulo corta
    expect(cartao).toContain('<span className="truncate">{rotulo}</span>');
    expect(cartao).toMatch(/\{contagem && <span className=\{cn\('shrink-0 whitespace-pre tabular-nums', classeContagem\)\}/);   // a contagem é número: não corta
    /* o cartão Vencidos mostra os dois lados À VISTA (a receber em verde, só quando > 0); o do caixa, corrente e investido em duas linhas */
    expect(tela).toContain("lado={recorte.vencidos.receber.valor > 0");
    expect(tela).toContain("rotulo: n.rotulo === 'Corrente' ? 'corr.' : 'inv.',");
    expect(tela).not.toMatch(/extraTitle|classeExtra/);
    expect(tela).toContain('inicio={periodo.de}');
    expect(fluxo).toContain('const inicioDesenho = inicio < hoje ? inicio : hoje;');
    expect(fluxo).not.toContain('d.setUTCMonth(d.getUTCMonth() - 1)');
  });
});

/* ─── CPR-SALDO-DIA-01 — o vencido que conta no saldo, a série do saldo e o contrato da tela ─────────────────────────── */
describe('CPR-SALDO-DIA-01 — qual vencido conta no saldo (D1/D2)', () => {
  const ANC = new Map([['A', '2026-09-30'], ['B', '2026-08-31']]);
  const sai = (venc: string, valor: number, c: string | null) => conta(venc, valor, { conta_bancaria_id: c });
  const entra = (venc: string, valor: number, c: string | null) => conta(venc, valor, { tipo_operacao: '1-Entradas', conta_destino_id: c });
  it('conta no saldo SÓ com vencimento POSTERIOR à âncora da conta DA LINHA', () => {
    expect(vencidoContaNoSaldo(sai('2026-10-01', 1, 'A'), ANC)).toBe(true);
    expect(vencidoContaNoSaldo(sai('2026-09-30', 1, 'A'), ANC)).toBe(false);   // no dia da âncora: já conferido com o banco
    expect(vencidoContaNoSaldo(sai('2026-09-15', 1, 'A'), ANC)).toBe(false);
    /* a MESMA data conta na conta B (âncora 31/08) e não na A (âncora 30/09): a âncora é por conta */
    expect(vencidoContaNoSaldo(sai('2026-09-15', 1, 'B'), ANC)).toBe(true);
    /* a conta da entrada é a de DESTINO */
    expect(vencidoContaNoSaldo(entra('2026-09-15', 1, 'B'), ANC)).toBe(true);
    expect(vencidoContaNoSaldo(conta('2026-09-15', 1, { tipo_operacao: '1-Entradas', conta_bancaria_id: 'B', conta_destino_id: 'A' }), ANC)).toBe(false);
  });
  it('sem conta, conta sem âncora e sem mapa de âncoras: FORA do saldo', () => {
    expect(vencidoContaNoSaldo(sai('2026-10-01', 1, null), ANC)).toBe(false);
    expect(vencidoContaNoSaldo(sai('2026-10-01', 1, 'CARTAO'), ANC)).toBe(false);
    expect(vencidoContaNoSaldo(sai('2026-10-01', 1, 'A'), undefined)).toBe(false);
  });
  it('o recorte separa os dois subgrupos; a soma deles é o cartão Vencidos, ao centavo', () => {
    const linhas = [sai('2026-10-02', 100.10, 'A'), sai('2026-09-10', 200.20, 'A'), sai('2026-09-10', 300.30, 'B'), entra('2026-10-03', 50.05, 'A'),
      entra('2026-08-01', 70.07, 'B'), sai('2026-10-01', 9.99, null), sai('2026-10-20', 1000, 'A')];
    const r = recortarCpr(linhas, { periodo: D30, hoje: HOJE, incluirVencidos: true, ancoras: ANC });
    expect(r.vencidos.contam.pagar).toEqual({ valor: 400.40, contas: 2 });
    expect(r.vencidos.contam.receber).toEqual({ valor: 50.05, contas: 1 });
    expect(r.vencidos.anteriores.pagar).toEqual({ valor: 210.19, contas: 2 });
    expect(r.vencidos.anteriores.receber).toEqual({ valor: 70.07, contas: 1 });
    expect(Math.round((r.vencidos.contam.pagar.valor + r.vencidos.anteriores.pagar.valor) * 100)).toBe(Math.round(r.vencidos.pagar.valor * 100));
    expect(r.vencidos.contam.linhas.length + r.vencidos.anteriores.linhas.length).toBe(r.vencidos.linhas.length);
    /* a busca sabe achar: sem âncoras TODOS são anteriores */
    const semAncora = recortarCpr(linhas, { periodo: D30, hoje: HOJE, incluirVencidos: true });
    expect(semAncora.vencidos.contam.linhas).toHaveLength(0);
    expect(semAncora.vencidos.anteriores.linhas).toHaveLength(6);
  });
  it('as âncoras são LIDAS do cartão Caixa (a data que o cálculo dele usou), sem espelho', () => {
    const m = ancorasDoCaixaCpr([{ contaId: 'CC', data: '2026-09-17' }, { contaId: 'INV', data: '2026-08-31' }]);
    expect(m.get('CC')).toBe('2026-09-17');
    expect(m.get('INV')).toBe('2026-08-31');
    expect(ancorasDoCaixaCpr(null).size).toBe(0);
    /* o dono do recorte não refaz a escolha da âncora: não importa nada de saldoEmCaixa */
    const dono = readFileSync(resolve(__dirname, 'cprRecorte.ts'), 'utf8');
    expect(dono).not.toMatch(/from '@\/lib\/financeiro\/saldoEmCaixa'/);
    expect(dono).not.toMatch(/ancoraDaConta|ancoraSemExtrato|grupoDoTipoConta/);
  });
});

describe('CPR-SALDO-DIA-01 — a série do saldo, em centavos', () => {
  const ANC = new Map([['A', '2026-09-30'], ['B', '2026-08-31']]);
  const sai = (venc: string | null, valor: number, c: string | null = 'A', o: Partial<ContaCpr> = {}) => conta(venc, valor, { conta_bancaria_id: c, ...o });
  const entra = (venc: string, valor: number, c: string | null = 'A') => conta(venc, valor, { tipo_operacao: '1-Entradas', conta_destino_id: c });
  const linhas = [
    sai('2026-10-02', 100.10),                       // vencido que conta
    entra('2026-10-03', 50.05),                      // vencido a receber que conta
    sai('2026-09-10', 9999.99),                      // anterior à conciliação: FORA do saldo
    sai('2026-10-01', 777.77, null),                 // sem conta: FORA do saldo
    sai(HOJE, 0.10), sai(HOJE, 0.20),                // hoje: 0,30 (centavos, sem float)
    sai('2026-10-10', 5000), entra('2026-10-10', 1000),
    entra('2026-10-20', 9000),
    sai('2026-10-12', 333.33, 'A', { status_transacao: 'realizado', data_pagamento: '2026-10-04' }),   // PAGA: nunca soma
    sai(null, 123.45),                               // sem vencimento: fora do saldo
    sai('2026-12-31', 1e6),                          // depois de "até": fora
  ];
  const rec = (incluirVencidos: boolean, extra: Partial<Parameters<typeof recortarCpr>[1]> = {}) =>
    recortarCpr(linhas, { periodo: D30, hoje: HOJE, incluirVencidos, ancoras: ANC, ...extra });
  it('partida = caixa − vencidos a pagar que contam + a receber que contam; cada dia = anterior − a pagar + a receber', () => {
    const s = serieDoSaldoCpr(rec(true), 1000);
    expect(s.hoje).toBe(1000);
    expect(s.partida).toEqual({ pagar: { valor: 100.10, contas: 1 }, receber: { valor: 50.05, contas: 1 }, saldo: 949.95 });
    expect(s.entreHojeEDe).toBeNull();
    expect(s.dias.map(d => [d.data, d.pagar.valor, d.receber.valor, d.saldo])).toEqual([
      [HOJE, 0.30, 0, 949.65], ['2026-10-10', 5000, 1000, -3050.35], ['2026-10-20', 0, 9000, 5949.65],
    ]);
    /* o último dia É o saldo no fim; o menor É o mínimo da série, com o dia dele */
    expect(s.fim).toBe(5949.65);
    expect(s.fim).toBe(s.dias[s.dias.length - 1].saldo);
    expect(s.menor).toEqual({ valor: -3050.35, data: '2026-10-10' });
    expect(s.menor?.valor).toBe(Math.min(s.partida.saldo ?? 0, ...s.dias.map(d => d.saldo ?? 0)));
    expect(s.menor?.valor).not.toBe(s.fim);
  });
  it('D3: a caixa "Incluir vencidos" NÃO muda o saldo — só a lista e o total', () => {
    const lig = serieDoSaldoCpr(rec(true), 1000), des = serieDoSaldoCpr(rec(false), 1000);
    expect(des).toEqual(lig);
    expect(rec(true).total.pagar.valor).not.toBe(rec(false).total.pagar.valor);
  });
  it('o menor saldo pode ser o de partida (data nula = hoje)', () => {
    const s = serieDoSaldoCpr(recortarCpr([sai('2026-10-02', 500), entra('2026-10-10', 100)], { periodo: D30, hoje: HOJE, incluirVencidos: true, ancoras: ANC }), 100);
    expect(s.menor).toEqual({ valor: -400, data: null });
    expect(s.fim).toBe(-300);
  });
  it('"de" no futuro: o que vence entre hoje e "de" passa pelo saldo antes do primeiro dia, sem ser listado', () => {
    const r = rec(true, { periodo: { de: '2026-10-15', ate: '2026-10-31' } });
    const s = serieDoSaldoCpr(r, 1000);
    expect(s.entreHojeEDe).toEqual({ pagar: { valor: 5000.30, contas: 3 }, receber: { valor: 1000, contas: 1 }, saldo: -3050.35 });
    expect(s.dias.map(d => d.data)).toEqual(['2026-10-20']);
    expect(s.fim).toBe(5949.65);
    expect(r.periodoSoma.pagar.contas).toBe(0);
    expect(r.total.pagar.valor).toBe(r.vencidos.pagar.valor);          // o intervalo não entra no total da lista
  });
  it('sem saldo em caixa (cartão de crédito, conta sem âncora): os totais do dia existem, os saldos são nulos', () => {
    const s = serieDoSaldoCpr(rec(true), null);
    expect([s.hoje, s.partida.saldo, s.fim, s.menor]).toEqual([null, null, null, null]);
    expect(s.dias.every(d => d.saldo === null)).toBe(true);
    expect(s.dias[1].pagar.valor).toBe(5000);
  });
  it('a soma das contas = o total: partida, cada dia e fim (com o caixa de cada uma), ao centavo', () => {
    const duas = [...linhas, sai('2026-09-15', 40.40, 'B'), sai('2026-10-10', 60.60, 'B'), entra('2026-10-25', 5.55, 'B')];
    const de = (c: string | null) => serieDoSaldoCpr(recortarCpr(duas, { periodo: D30, hoje: HOJE, incluirVencidos: true, ancoras: ANC, conta: c }), c === 'A' ? 1000 : c === 'B' ? 250.25 : 0);
    const todas = serieDoSaldoCpr(recortarCpr(duas, { periodo: D30, hoje: HOJE, incluirVencidos: true, ancoras: ANC }), 1250.25);
    const c = (v: number | null) => Math.round((v ?? 0) * 100);
    expect(c(de('A').partida.saldo) + c(de('B').partida.saldo) + c(de(SEM_CONTA).partida.saldo)).toBe(c(todas.partida.saldo));
    expect(c(de('A').fim) + c(de('B').fim) + c(de(SEM_CONTA).fim)).toBe(c(todas.fim));
    expect(de('B').partida.pagar).toEqual({ valor: 40.40, contas: 1 });   // 15/09 conta na B (âncora 31/08)
    /* o filtro de conta entra no saldo: o fim de A não é o de Todas */
    expect(de('A').fim).not.toBe(todas.fim);
  });
  it('o gráfico recebe EXATAMENTE as contas que a série soma (lista × gráfico pela mesma regra)', () => {
    for (const p of [D30, MES, { de: '2026-10-15', ate: '2026-10-31' }]) {
      const r = rec(true, { periodo: p });
      const doGrafico = linhasDoSaldoCpr(r);
      const s = serieDoSaldoCpr(r, 1000);
      expect(Math.round(((s.hoje ?? 0) + liquidoEmAberto(doGrafico)) * 100)).toBe(Math.round((s.fim ?? 0) * 100));
      expect(doGrafico.some(l => l.data_vencimento === '2026-09-10')).toBe(false);   // o anterior à conciliação não vai ao gráfico
      expect(doGrafico.some(l => l.status_transacao === 'realizado')).toBe(false);
    }
  });
});

describe('CPR-SALDO-DIA-01 — a tela só renderiza (lido da fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  const fluxo = readFileSync(resolve(__dirname, '../../components/financeiro-v2/CprFluxoPrevisto.tsx'), 'utf8');
  const shell = readFileSync(resolve(__dirname, '../../v2/V2Index.tsx'), 'utf8');
  it('âncoras e série vêm do dono, da mesma entrada do Caixa; lista e gráfico partem do MESMO saldo', () => {
    expect(tela).toContain('ancorasDoCaixaCpr(caixaTodas.ancoraPorConta)');
    expect(tela).toContain('serieDoSaldoCpr(recorte, caixa && caixa.ancoradas > 0 ? caixa.total : null)');
    expect(tela).toContain('saldoInicial={serie.hoje}');
    /* o gráfico não tem regra própria de vencido: desconta todo vencido que RECEBE, sem piso e sem "conciliado até" */
    expect(fluxo).toContain('ajusteVencidoPorDia(linhas, null, hoje, null)');
    expect(fluxo).not.toContain('ajusteVencidoPorDia(linhas, inicioDesenho');
    /* a caixa "Incluir vencidos" não chega nem à série nem ao gráfico */
    const dono = readFileSync(resolve(__dirname, 'cprRecorte.ts'), 'utf8');
    const serie = dono.slice(dono.indexOf('export function serieDoSaldoCpr'), dono.indexOf('export function linhasDoSaldoCpr'));
    expect(serie).not.toContain('incluirVencidos');
    expect(dono.slice(dono.indexOf('export function linhasDoSaldoCpr'), dono.indexOf('CPR-EXPORT-01'))).not.toContain('incluirVencidos');
  });
  it('setas e cores num lugar só: ▼ a pagar, ▲ a receber, saldo pelo sinal, de COR_SINAL', () => {
    const cel = tela.slice(tela.indexOf('function CelValor('), tela.indexOf('function Faixa('));
    expect(cel).toContain("const negativo = tipo === 'pagar' || (tipo === 'saldo' && valor < 0);");
    expect(cel).toContain("const seta = semSeta || zero ? '' : negativo ? '▼ ' : '▲ ';");
    expect(cel).toContain('const tom = navy ? TOM_NO_NAVY : COR_SINAL;');
    expect(tela).toContain("const moedaComSinal = (v: number) => `${v < 0 ? '−' : ''}${formatMoeda(Math.abs(v))}`;");
    expect(Array.from(tela.matchAll(/#fca5a5|#86efac/g)).length).toBe(2);       // os dois tons do navy, uma vez cada
    expect(tela).not.toMatch(/text-destructive'? : 'text-success|text-success' : 'text-destructive/);
  });
  it('duas réguas, uma por modo; as mesmas três colunas de valor nas linhas e nas faixas', () => {
    expect(tela).toContain('const regua = ampliado ? REGUA_AMPLIADA : REGUA_NORMAL;');
    for (const col of ['regua.pagar', 'regua.receber', 'regua.saldo']) expect(Array.from(tela.matchAll(new RegExp(`larg(?:ura=\\{|\\()${col.replace('.', '\\.')}`, 'g'))).length, col).toBe(3);
    expect(tela).not.toMatch(/COL\.(banco|origem|doc|valor)/);
    expect(tela).toContain('origem: ${rotuloOrigem(l.origem_lancamento)} · doc: ${doc || \'—\'}');
    expect(tela).toContain("title={segmento === 'ambos' ? undefined : MOTIVO_SALDO_DOIS_LADOS}");
    expect(tela).toContain("const MOTIVO_ANTERIORES = 'vencimento em mês já conciliado: abra o lançamento e atualize a data para entrar no saldo';");
  });
  it('Ampliar é o mecanismo do shell: uma prop, estado local, e sair da tela desliga', () => {
    expect(shell).toContain("return <ContasPagarReceberTab onIntensiveToggle={setIntensivo} />;");
    expect(tela).toContain('useEffect(() => { onIntensiveToggle?.(ampliado); }, [ampliado, onIntensiveToggle]);');
    expect(tela).toContain('useEffect(() => () => { onIntensiveToggle?.(false); }, [onIntensiveToggle]);');
    expect(tela).toContain("!ampliado && 'max-w-5xl mx-auto'");
    expect(tela).toContain('data-testid="cpr-faixa-recolhida"');
  });
});

describe('CPR-SALDO-DIA-01 (G/H) — saldo do gráfico sem segmento; Ampliado com os mesmos filtros (lido da fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  const fluxo = readFileSync(resolve(__dirname, '../../components/financeiro-v2/CprFluxoPrevisto.tsx'), 'utf8');
  it('G: o gráfico recebe os DOIS lados em qualquer segmento; o segmento só escolhe as barras', () => {
    /* as linhas do saldo não passam pelo segmento em lugar nenhum da tela */
    expect(tela).toContain('const doFluxo = useMemo(() => linhasDoSaldoCpr(recorte), [recorte]);');
    expect(tela).not.toMatch(/linhasDoSaldoCpr\(recorte\)\.filter/);
    const montagem = tela.slice(tela.indexOf('<CprFluxoPrevisto'), tela.indexOf('/>', tela.indexOf('<CprFluxoPrevisto')));
    expect(montagem).toContain('linhas={doFluxo}');
    expect(montagem).toContain('saldoInicial={serie.hoje}');
    expect(montagem).toContain('barras={segmento}');
    /* no componente, `barras` só aparece na prop e nas duas <Bar>: nenhuma série de saldo o lê */
    const usos = Array.from(fluxo.matchAll(/\bbarras (?:===|!==)/g)).length;
    expect(fluxo).toContain(`{barras !== 'pagar' && <Bar dataKey="entradas"`);
    expect(fluxo).toContain(`{barras !== 'receber' && <Bar dataKey="saidas"`);
    expect(usos).toBe(2);   // só as duas <Bar> comparam `barras`
    expect(fluxo).toMatch(/montarFluxoPrevisto\(linhas, \(saldoInicial \?\? 0\) \+ ajusteTotal/);
    /* o Fluxo não força mais "Ambos" */
    expect(tela).not.toMatch(/if \(visao === 'fluxo'\) setSegmento\('ambos'\)/);
  });
  it('G: a série do dono não conhece segmento', () => {
    const dono = readFileSync(resolve(__dirname, 'cprRecorte.ts'), 'utf8');
    const serie = dono.slice(dono.indexOf('export function serieDoSaldoCpr'));
    expect(serie).not.toMatch(/segmento|doSegmentoCpr/);   // vale também para os agregados da folha exportada, que vêm depois
  });
  it('H: cada controle é UM nó, posicionado na tela normal OU no Ampliado — um estado só', () => {
    for (const ctl of ['ctlVisao', 'ctlAtalho', 'ctlDatas', 'ctlIncluir', 'ctlConta', 'ctlSegmento']) {
      expect(Array.from(tela.matchAll(new RegExp(`const ${ctl} = \\(`, 'g'))).length, ctl).toBe(1);
      expect(Array.from(tela.matchAll(new RegExp(`\\{${ctl}\\}`, 'g'))).length, ctl).toBe(2);   // normal + ampliado
    }
    for (const unico of ['onEscolher={setVisao}', 'onEscolher={escolherAtalho}', 'onEscolher={setSegmento}', 'data-testid="cpr-incluir-vencidos"', 'data-testid="cpr-conta"', 'data-testid="cpr-de"', 'data-testid="cpr-ate"']) {
      expect(Array.from(tela.matchAll(new RegExp(unico.replace(/[{}()]/g, '\\$&'), 'g'))).length, unico).toBe(1);
    }
    /* os obrigatórios estão na barra do Ampliado, numa linha de 26px, com o Recolher */
    const barra = tela.slice(tela.indexOf('data-testid="cpr-barra-ampliada"'), tela.indexOf('data-testid="cpr-faixa-recolhida"'));
    expect(barra).toContain('className="flex h-[26px] flex-nowrap items-center gap-1.5 whitespace-nowrap"');
    for (const ctl of ['{ctlVisao}', '{ctlDatas}', '{ctlConta}', '{ctlAtalho}', '{ctlSegmento}', '{ctlIncluir}', 'data-testid="cpr-recolher"']) expect(barra, ctl).toContain(ctl);
    /* tela normal e Ampliado são alternativas: os dois cabeçalhos nunca se montam juntos */
    expect(tela).toMatch(/\{ampliado && \(\s*<div className="shrink-0 space-y-1 px-4 pb-1 pt-1">/);
    expect(tela).toMatch(/\{!ampliado && \(\s*<div className="shrink-0 px-4 pt-2 pb-2 space-y-2">/);
    /* o corpo (Lista ou Fluxo) é o mesmo nos dois modos: trocar a visão não mexe no Ampliado */
    expect(Array.from(tela.matchAll(/<CprFluxoPrevisto/g)).length).toBe(1);
    expect(tela).not.toMatch(/setVisao\([^)]*\)[^\n]*setAmpliado|setAmpliado\(false\)[^\n]*setVisao/);
  });
});

describe('CPR-EXPORT-01 — agregados da folha exportada, no dono e em centavos', () => {
  const ANC = new Map([['A', '2026-09-30'], ['B', '2026-08-31']]);
  const sai = (venc: string, valor: number, c: string | null = 'A') => conta(venc, valor, { conta_bancaria_id: c });
  const entra = (venc: string, valor: number, c: string | null = 'A') => conta(venc, valor, { tipo_operacao: '1-Entradas', conta_destino_id: c });
  /* 05/10/2026 é segunda-feira */
  const linhas = [
    sai('2026-10-02', 100.10),                                   // vencido que conta
    sai('2026-10-05', 0.10), sai('2026-10-05', 0.20),            // seg — centavos
    entra('2026-10-11', 1000),                                   // dom da 1ª semana
    sai('2026-10-12', 5000),                                     // seg da 2ª
    sai('2026-10-30', 70.07), sai('2026-11-02', 30.03),          // 5ª semana cruza o mês (26/10–01/11); 6ª começa em 02/11
    sai('2026-09-15', 40.40, 'B'), sai('2026-10-20', 60.60, 'B'), sai('2026-10-21', 9.99, null),
  ];
  const rec = (conta?: string | null, periodo = D30) => recortarCpr(linhas, { periodo, hoje: HOJE, incluirVencidos: true, ancoras: ANC, conta });
  it('a série diz TUDO o que consome: hoje − a pagar + a receber = fim', () => {
    const s = serieDoSaldoCpr(rec('A'), 1000);
    expect(s.totalPagar).toEqual({ valor: 5200.50, contas: 6 });
    expect(s.totalReceber).toEqual({ valor: 1000, contas: 1 });
    expect(Math.round(((s.hoje ?? 0) - s.totalPagar.valor + s.totalReceber.valor) * 100)).toBe(Math.round((s.fim ?? 0) * 100));
  });
  it('resumo por semana: segunda a domingo, cortado no período; semana sem conta repete o saldo; cruza o mês', () => {
    const s = serieDoSaldoCpr(rec('A'), 1000);
    const w = resumoPorSemanaCpr(s, D30);
    expect(w.map(x => [x.de, x.ate])).toEqual([
      ['2026-10-05', '2026-10-11'], ['2026-10-12', '2026-10-18'], ['2026-10-19', '2026-10-25'], ['2026-10-26', '2026-11-01'], ['2026-11-02', '2026-11-04'],
    ]);
    expect(w[0]).toMatchObject({ pagar: 0.30, receber: 1000, saldo: 1899.60 });      // 1000 − 100,10 − 0,30 + 1000
    expect(w[1]).toMatchObject({ pagar: 5000, receber: 0, saldo: -3100.40 });
    expect(w[2]).toMatchObject({ pagar: 0, receber: 0, saldo: -3100.40 });           // semana sem conta: o saldo anterior
    expect(w[3]).toMatchObject({ pagar: 70.07, receber: 0, saldo: -3170.47 });       // 26/10 a 01/11: cruza o mês
    expect(w[4]).toMatchObject({ pagar: 30.03, receber: 0, saldo: -3200.50 });
    /* a última semana fecha no saldo no fim, e as semanas somam o período da série, ao centavo */
    expect(w[w.length - 1].saldo).toBe(s.fim);
    const c = (v: number) => Math.round(v * 100);
    expect(w.reduce((t, x) => t + c(x.pagar), 0)).toBe(s.dias.reduce((t, d) => t + c(d.pagar.valor), 0));
  });
  it('resumo por semana: período de um dia; período invertido; sem saldo em caixa', () => {
    const umDia = { de: '2026-10-12', ate: '2026-10-12' };
    const w = resumoPorSemanaCpr(serieDoSaldoCpr(rec('A', umDia), 1000), umDia);
    expect(w).toEqual([{ de: '2026-10-12', ate: '2026-10-12', pagar: 5000, receber: 0, saldo: -3100.40 }]);   // 1000 − 100,10, depois "entre hoje e de" (−0,30 + 1000), depois −5000
    expect(resumoPorSemanaCpr(serieDoSaldoCpr(rec('A'), 1000), { de: '2026-10-20', ate: '2026-10-10' })).toEqual([]);
    const semCaixa = resumoPorSemanaCpr(serieDoSaldoCpr(rec('A'), null), D30);
    expect(semCaixa.every(x => x.saldo === null)).toBe(true);
    expect(semCaixa[1].pagar).toBe(5000);
  });
  it('saldo por conta: a soma das contas é o total de "Todas" (a pagar, a receber e caixa); sem caixa o saldo é nulo', () => {
    const caixa: Record<string, number> = { A: 1000, B: 250.25, C: 7, ZERADA: 0 };
    const por = saldoPorContaCpr(linhas, { periodo: D30, hoje: HOJE, incluirVencidos: true, ancoras: ANC }, (c) => caixa[c] ?? null, ['A', 'B', 'C', 'ZERADA', 'SEM_ANCORA']);
    /* a conta zerada e sem movimento e a sem caixa e sem movimento NÃO entram; a busca sabe achar (C, só com caixa, entra) */
    expect(por.some(x => x.conta === 'ZERADA' || x.conta === 'SEM_ANCORA')).toBe(false);
    const todas = serieDoSaldoCpr(rec(null), 1257.25);
    const c = (v: number | null) => Math.round((v ?? 0) * 100);
    expect(por.map(x => x.conta).sort()).toEqual(['A', 'B', 'C', SEM_CONTA].sort());
    expect(por.reduce((t, x) => t + c(x.pagar.valor), 0)).toBe(c(todas.totalPagar.valor));
    expect(por.reduce((t, x) => t + c(x.receber.valor), 0)).toBe(c(todas.totalReceber.valor));
    expect(por.reduce((t, x) => t + c(x.caixa), 0)).toBe(c(todas.hoje));
    expect(por.find(x => x.conta === 'B')).toMatchObject({ caixa: 250.25, pagar: { valor: 101, contas: 2 }, fim: 149.25 });   // 15/09 conta na B (âncora 31/08)
    expect(por.find(x => x.conta === SEM_CONTA)).toMatchObject({ caixa: null, fim: null, pagar: { valor: 9.99, contas: 1 } });
    expect(por.find(x => x.conta === 'C')).toMatchObject({ caixa: 7, fim: 7 });          // só tem caixa: entra, para a soma do caixa fechar
    /* cada linha fecha sozinha */
    for (const x of por) if (x.caixa != null) expect(c(x.caixa) - c(x.pagar.valor) + c(x.receber.valor)).toBe(c(x.fim));
  });
});

describe('CPR-SALDO-DIA-02 — pílulas de status no Ampliado: o mesmo nó, o mesmo estado (lido da fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  it('as pílulas são UM nó (`ctlStatus`), posicionado na tela normal e na 3ª linha do Ampliado', () => {
    expect(Array.from(tela.matchAll(/const ctlStatus = \(/g)).length).toBe(1);
    expect(Array.from(tela.matchAll(/\{ctlStatus\}/g)).length).toBe(2);
    expect(Array.from(tela.matchAll(/STATUS_DISPONIVEIS\.map\(/g)).length).toBe(1);     // a lista de pílulas é desenhada num lugar só
    /* um estado só: uma declaração, um escritor (o clique da pílula) */
    expect(Array.from(tela.matchAll(/useState<string\[\]>\(/g)).length).toBe(1);
    expect(Array.from(tela.matchAll(/setStatusLigados\(/g)).length).toBe(1);
    expect(tela).toContain('const [statusLigados, setStatusLigados] = useState<string[]>(STATUS_INICIAIS);');
  });
  it('no Ampliado a 3ª linha é fixa, de 20px, sempre presente; o texto "status: …" saiu', () => {
    const ampliado = tela.slice(tela.indexOf('{ampliado && ('), tela.indexOf('{!ampliado && ('));
    expect(ampliado).toContain('<div data-testid="cpr-linha-status" className="flex h-[20px] flex-nowrap items-center gap-2 whitespace-nowrap">');
    expect(ampliado.indexOf('data-testid="cpr-linha-status"')).toBeGreaterThan(ampliado.indexOf('data-testid="cpr-faixa-recolhida"'));
    expect(ampliado).toContain('{ctlStatus}');
    expect(ampliado).not.toMatch(/\{[^}]*&&\s*<div data-testid="cpr-linha-status"/);   // nenhuma condição: a linha existe sempre
    expect(tela).not.toMatch(/cpr-status-ligados|statusLigadosTexto|status: \{/);
    /* no Ampliado a pílula encolhe (16px / 9,5px, o piso) — pela classe do MESMO botão */
    expect(tela).toContain("ampliado ? 'h-[16px] px-1.5 text-[9.5px] leading-none' : 'h-[22px] px-2 text-[10px]',");
    /* todas desligadas: a MESMA mensagem, num lugar só */
    expect(Array.from(tela.matchAll(/Nenhum status selecionado — ligue ao menos um acima/g)).length).toBe(1);
  });
});

describe('CPR-SALDO-DIA-02 — pílula Realizado ligada não derruba a tela', () => {
  const tela = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  it('o dono põe a paga SEM vencimento no balde das pagas (a busca a traz pelo ramo "sem vencimento")', () => {
    const paga = conta(null, 50, { status_transacao: 'realizado', data_pagamento: '2026-10-01' });
    const r = recortarCpr([paga, conta('2026-10-10', 10)], { periodo: D30, hoje: HOJE, incluirVencidos: true });
    expect(r.pagas).toHaveLength(1);
    expect(r.pagas[0].data_vencimento).toBeNull();
    expect(serieDoSaldoCpr(r, 100).fim).toBe(90);           // e ela não soma
  });
  it('a tela não abre grupo de dia sem data: a chave vazia é pulada ANTES de formatar', () => {
    const grupos = tela.slice(tela.indexOf('const grupos = useMemo((): Grupo[] => {'), tela.indexOf('// ── Abrir o lançamento'));
    expect(grupos).toMatch(/const chave = \(l\.data_vencimento \?\? ''\)\.slice\(0, 10\);[\s\S]{0,420}if \(!chave\) continue;\s+const atual = mapa\.get\(chave\);/);
    /* toda chave que chega a `faixaDaData` vem do mapa (já sem a vazia) ou dos dias da série (que têm data) */
    expect(grupos).toContain('const chaves = Array.from(new Set([...mapa.keys(), ...passos.keys()])).sort();');
  });
});
