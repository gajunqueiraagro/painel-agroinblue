/**
 * PR-CONC-SALDO-UMA-REGUA-02 — a leitura do dono do resumo e o que a tela escreve dele.
 *
 * ⚠ A TELA NÃO CALCULA: estes testes provam que o que sai daqui é o que o dono mandou — o parser não inventa número (nulo
 *   continua nulo), as frases saem dos motivos do dono (T2/T3) e o "Fechar contas sem movimento" grava o saldo do dono e
 *   pula a conta com movimento (T8).
 * ⚠ A linha do Emerson (NJ Sicredi Lavoura, set/26) é a do fixture real (`resumoMes.fixture.json`, recapturado no 01c).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  lerResumo, lerStatusAno, frasesDoStatus, fraseDoRetido, fraseSemConta, contasParaFecharSemMovimento,
  saldosDaLinha, marcaDoPar, contaEmPar, diferencaNaPosicao, sistemaNaPosicao, saldoSistemaNaData, tituloDoPar,
  TITULO_DIFERENCA_NA_POSICAO_INDISPONIVEL, TIPO_TRANSFERENCIA_INTERNA,
  type LinhaResumo,
} from './resumoDoDono';
import { comProprio } from './resumoDoDono.fixture';

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/resumoMes.fixture.json'), 'utf8'));
const emerson = () => lerResumo([{ ...FIX.nj_sicredi_lavoura_2026_09.resumo, nivel: 'conta', conta_id: '910e04b0', tem_extrato: true, motivos: [] }])[0];

const base = (x: Record<string, unknown>): LinhaResumo => lerResumo([{ nivel: 'conta', conta_id: 'c1', conta_nome: 'C1', ...x }])[0];

describe('a leitura do dono, sem cast e sem inventar', () => {
  it('o Emerson: conciliado, 155.972,29, zero nos dois lados, retido 1.217,01 (15), a lista com o saldo corrido', () => {
    const l = emerson();
    expect(l.status).toBe('conciliado');
    expect(l.saldo_sistema).toBe(155972.29);
    expect([l.diferenca_entradas, l.diferenca_saidas]).toEqual([0, 0]);
    expect(l.retido_em_depositos).toEqual({ qtde: 15, valor: 1217.01 });
    const linhas = l.linhas_sistema ?? [];
    expect(linhas[linhas.length - 1].saldo_apos).toBe(155972.29);
    expect(linhas.filter((x) => x.status_exibicao === 'parcial').map((x) => [x.lancamento_id?.slice(0, 8), x.falta])).toEqual([['d320635d', 300]]);
  });

  it('numeric em texto vira número; ausente fica NULO (nunca zero); lixo é ignorado', () => {
    const [l] = lerResumo([{ nivel: 'conta', conta_id: 'x', saldo_sistema: '26205.97', saldo_extrato: null, diferenca: null }, 7, null]);
    expect(l.saldo_sistema).toBe(26205.97);
    expect(l.saldo_extrato).toBeNull();
    expect(l.diferenca).toBeNull();
    expect(l.saldo_inicial).toBeNull();
    expect(lerResumo(null)).toEqual([]);
    expect(lerStatusAno([{ ano_mes: '2026-09', nivel: 'total', status: 'parcial' }])[0].status).toBe('pendente'); // não há 'parcial'
  });
});

describe('T2/T3 — as frases do status saem dos motivos do dono', () => {
  it('cada motivo com a sua frase; "N dias com diferença" leva ao PRIMEIRO dia', () => {
    const l = base({
      tem_extrato: true, status: 'nao_conciliado',
      motivos: [
        { motivo: 'dias_com_diferenca', qtde: 2, dias: ['2026-03-03', '2026-03-17'] },
        { motivo: 'saldo_diverge', valor: 150000 },
        { motivo: 'extrato_nao_fecha', valor: 0.02 },
        { motivo: 'saldo_nao_informado', falta: 'final' },
        { motivo: 'sem_extrato' },
      ],
    });
    const f = frasesDoStatus(l);
    /* O real do `toLocaleString` separa "R$" do número com espaço inseparável — normalizado só para comparar. */
    expect(f.map((x) => x.texto.replace(/\s/g, ' '))).toEqual([
      '2 dias com diferença',
      'saldo diverge R$ 150.000,00',
      'o extrato não fecha com o saldo informado R$ 0,02',
      'saldo não informado',
      'sem extrato',
    ]);
    expect(f[0].dia).toBe('2026-03-03');
    /* negativo: o "−" tipográfico colado ao "R$" por word-joiner — a frase quebra, o valor não */
    const neg = frasesDoStatus(base({ tem_extrato: false, motivos: [{ motivo: 'extrato_nao_fecha', valor: -881.49 }] }))[0].texto;
    expect(neg.endsWith('\u2212\u2060R$\u00a0881,49')).toBe(true);
  });

  it('"confere em todos os dias" NUNCA convive com um motivo de dias (e só com extrato)', () => {
    const com = frasesDoStatus(base({ tem_extrato: true, motivos: [{ motivo: 'dias_com_diferenca', qtde: 1, dias: ['2026-09-02'] }] }));
    expect(com.map((x) => x.chave)).not.toContain('confere_dias');
    const sem = frasesDoStatus(base({ tem_extrato: true, motivos: [{ motivo: 'saldo_diverge', valor: 1 }] }));
    expect(sem[0].texto).toBe('confere em todos os dias');
    expect(frasesDoStatus(base({ tem_extrato: false, motivos: [] }))).toEqual([]);
    expect(frasesDoStatus(emerson()).map((x) => x.texto)).toEqual(['confere em todos os dias']);
  });

  it('no total: "N contas não conciliadas" com o nome de cada uma e o primeiro dia dela; "N pendentes"', () => {
    const [t] = lerResumo([{
      nivel: 'total', conta_nome: 'Total', status: 'nao_conciliado', motivos: [
        { motivo: 'contas_nao_conciliadas', qtde: 2, contas: [
          { conta_id: 'a', conta_nome: 'Itau BBA', status: 'nao_conciliado', motivos: [{ motivo: 'dias_com_diferenca', qtde: 1, dias: ['2026-03-03'] }, { motivo: 'saldo_diverge', valor: 150000 }] },
          { conta_id: 'b', conta_nome: 'Cartão BB', status: 'nao_conciliado', motivos: [{ motivo: 'saldo_diverge', valor: -6470.73 }] },
        ] },
        { motivo: 'contas_pendentes', qtde: 3 },
      ],
    }]);
    const f = frasesDoStatus(t);
    expect(f.map((x) => x.texto)).toEqual(['2 contas não conciliadas', '3 pendentes']);
    expect(f[0].contas?.map((c) => [c.conta_nome, c.dia ?? null])).toEqual([['Itau BBA', '2026-03-03'], ['Cartão BB', null]]);
    expect(f[0].titulo).toContain('Itau BBA: 1 dia com diferença');
  });

  it('retido e sem conta: frase só quando há; o dono manda os dois lados do sem conta em módulo', () => {
    expect(fraseDoRetido({ qtde: 0, valor: 0 })).toBeNull();
    expect(fraseDoRetido({ qtde: 15, valor: 1217.01 })?.texto).toMatch(/^retido no depósito R\$\s1\.217,01 \(15\)$/);
    expect(fraseSemConta(null)).toBeNull();
    expect(fraseSemConta({ qtde: 3, entradas: 100, saidas: 869.29 })?.texto).toMatch(/^lançamentos sem conta \+R\$\s100,00 \/ −R\$\s869,29 \(3\)$/);
  });
});

describe('T8 — "Fechar contas sem movimento" grava o saldo do DONO e não fecha conta com movimento', () => {
  it('grava saldo_final = saldo_sistema e saldo_inicial = o do dono; pula movimento, extrato, ausente e a que já tem saldo', () => {
    const linhas = lerResumo([
      { nivel: 'conta', conta_id: 'parada', saldo_inicial: 300000, saldo_inicial_origem: 'herdado', saldo_sistema: 300000, saldo_extrato: null, entradas: 0, saidas: 0 },
      { nivel: 'conta', conta_id: 'mexeu', saldo_inicial: 54738.55, saldo_inicial_origem: 'informado', saldo_sistema: 26205.97, saldo_extrato: null, entradas: 1132588.6, saidas: -1161121.18 },
      { nivel: 'conta', conta_id: 'extrato', saldo_inicial: 10, saldo_inicial_origem: 'herdado', saldo_sistema: 10, saldo_extrato: null, tem_extrato: true },
      { nivel: 'conta', conta_id: 'ausente', saldo_inicial: null, saldo_inicial_origem: 'ausente', saldo_sistema: 0, saldo_extrato: null },
      { nivel: 'conta', conta_id: 'informada', saldo_inicial: 5, saldo_inicial_origem: 'informado', saldo_sistema: 5, saldo_extrato: 5 },
      { nivel: 'total', conta_id: null, saldo_sistema: 1, saldo_extrato: null },
    ].map(comProprio));
    const r = contasParaFecharSemMovimento(linhas);
    expect(r.fechar).toEqual([{ conta_id: 'parada', saldo_inicial: 300000, saldo_final: 300000 }]);
    expect(r.comMovimento).toBe(2);
    expect(r.semReferencia).toBe(1);
  });
});

/* ── PR-CONC-INTERNA-SEPARADA-01b ─────────────────────────────────────────────── */

const PROPRIO_MAE = { saldo_inicial: -39997.27, entradas: 53405.5, saidas: -69127.72, saldo_sistema: -55719.49, saldo_extrato: -55734.67,
  diferenca: -15.18, entradas_terceiros: 100, entradas_transferencias: 53305.5, saidas_terceiros: -15822.22, saidas_transferencias: -53305.5 };
const maeCrua = (x: Record<string, unknown> = {}) => ({
  nivel: 'conta', conta_id: 'brad', conta_nome: 'Bradesco', tem_extrato: true, status: 'nao_conciliado',
  saldo_inicial: -40000, saldo_sistema: -55723.51, saldo_extrato: -55738.69, diferenca: -15.18, entradas: 100, saidas: -15823.51,
  motivos: [{ motivo: 'saldo_diverge', valor: -15.18 }],
  proprio: PROPRIO_MAE, internas: [{ conta_id: 'if', conta_nome: 'Bradesco-Invest. Facil' }], par_conta_id: null, par_status: null,
  linhas_sistema: [
    { tipo: 'vinculo', data: '2024-04-10', valor: -15722.22, saldo_apos: -55722.22, saldo_apos_proprio: -55719.49 },
    { tipo: 'transferencia_interna', data: '2024-04-20', valor: -1.29, transferencia: true, status_exibicao: 'realizado', saldo_apos: -55722.22, saldo_apos_proprio: -55720.78 },
  ],
  ...x,
});
const internaCrua = (x: Record<string, unknown> = {}) => comProprio({
  nivel: 'conta', conta_id: 'if', conta_nome: 'Bradesco-Invest. Facil', status: 'nao_conciliado', par_conta_id: 'brad', par_status: 'nao_conciliado',
  saldo_inicial: -2.73, saldo_sistema: -4.02, saldo_extrato: -4.02, diferenca: 0,
  motivos: [{ motivo: 'conferida_com', conta_id: 'brad', conta_nome: 'Bradesco' }], ...x,
});

describe('T1 (01b) — o leitor: proprio, par_*, internas, saldo_apos_proprio e a transferência interna', () => {
  it('a mãe: os dez campos do `proprio`, as internas e a linha transferencia_interna com o saldo corrido próprio', () => {
    const [l] = lerResumo([maeCrua()]);
    expect(l.proprio).toEqual(PROPRIO_MAE);
    expect(l.internas).toEqual([{ conta_id: 'if', conta_nome: 'Bradesco-Invest. Facil' }]);
    expect([l.par_conta_id, l.par_status]).toEqual([null, null]);
    expect(l.saldo_sistema).toBe(-55723.51);   // o topo segue o consolidado: é o veredito do par
    const ti = (l.linhas_sistema ?? []).filter((x) => x.tipo === TIPO_TRANSFERENCIA_INTERNA);
    expect(ti.map((x) => [x.valor, x.saldo_apos, x.saldo_apos_proprio, x.status_exibicao])).toEqual([[-1.29, -55722.22, -55720.78, 'realizado']]);
  });

  it('a interna: par_conta_id, par_status e o motivo conferida_com com o nome da mãe', () => {
    const [l] = lerResumo([internaCrua()]);
    expect([l.par_conta_id, l.par_status, l.status]).toEqual(['brad', 'nao_conciliado', 'nao_conciliado']);
    expect(l.motivos).toEqual([{ motivo: 'conferida_com', conta_id: 'brad', conta_nome: 'Bradesco' }]);
    expect(l.internas).toEqual([]);
  });

  it('ausente vira NEUTRO: proprio nulo, par nulo, internas [], saldo_apos_proprio nulo, posição própria nula', () => {
    const [l] = lerResumo([{ nivel: 'conta', conta_id: 'x', saldo_sistema: 10, par_status: 'qualquer', internas: 'lixo', proprio: 7,
      posicao: { data: '2026-09-10', saldo_sistema_na_data: 5 }, linhas_sistema: [{ tipo: 'vinculo', data: '2026-09-01', valor: 1, saldo_apos: 11 }] }]);
    expect(l.proprio).toBeNull();
    expect([l.par_conta_id, l.par_status]).toEqual([null, null]);
    expect(l.internas).toEqual([]);
    expect(l.linhas_sistema?.[0].saldo_apos_proprio).toBeNull();
    expect(l.posicao?.saldo_sistema_proprio_na_data).toBeNull();
    /* e a tela NÃO cai no campo de topo por reserva */
    expect(saldosDaLinha(l).saldo_sistema).toBeNull();
    expect(saldoSistemaNaData(l, '2026-09-30')).toBeNull();
  });

  it('numeric em texto dentro do `proprio` vira número; nulo fica nulo', () => {
    const [l] = lerResumo([{ nivel: 'conta', conta_id: 'x', proprio: { saldo_sistema: '26205.97', saldo_extrato: null, entradas: '10.5' } }]);
    expect(l.proprio?.saldo_sistema).toBe(26205.97);
    expect(l.proprio?.saldo_extrato).toBeNull();
    expect(l.proprio?.entradas).toBe(10.5);
  });
});

describe('o que a tela lê do par', () => {
  it('saldosDaLinha: na conta, o `proprio`; nos agregados, o topo', () => {
    const [mae, total] = lerResumo([maeCrua(), { nivel: 'total', conta_id: null, saldo_sistema: -55723.51, saldo_extrato: -55738.69, diferenca: -15.18 }]);
    expect(saldosDaLinha(mae).saldo_sistema).toBe(-55719.49);
    expect(saldosDaLinha(mae).saldo_extrato).toBe(-55734.67);
    expect(saldosDaLinha(total).saldo_sistema).toBe(-55723.51);
  });

  it('marcaDoPar: a mãe cita as internas, a interna cita a mãe (do motivo), conta sem par não tem marca', () => {
    const [mae, interna, comum] = lerResumo([maeCrua(), internaCrua(), comProprio({ nivel: 'conta', conta_id: 'c', saldo_sistema: 1 })]);
    expect(marcaDoPar(mae)).toEqual({ texto: 'conferida com Bradesco-Invest. Facil', curto: 'par', titulo: tituloDoPar('Bradesco-Invest. Facil'),
      tituloLinha: 'conferida com Bradesco-Invest. Facil — o mês desta conta só fecha junto com Bradesco-Invest. Facil: o arquivo do banco traz o saldo das duas somado' });
    expect(marcaDoPar(interna)).toEqual({ texto: 'conferida com Bradesco', curto: 'par', titulo: tituloDoPar('Bradesco'),
      tituloLinha: `conferida com Bradesco — ${tituloDoPar('Bradesco')}` });
    expect(marcaDoPar(comum)).toBeNull();
    expect([contaEmPar(mae), contaEmPar(interna), contaEmPar(comum)]).toEqual([true, true, false]);
    expect(tituloDoPar('X')).toBe('o mês desta conta só fecha junto com X: o arquivo do banco traz o saldo das duas somado');
  });

  it('frasesDoStatus: a mãe ganha "conferida com <interna>" depois dos motivos; a interna escreve o motivo do dono', () => {
    const [mae, interna] = lerResumo([maeCrua(), internaCrua()]);
    expect(frasesDoStatus(mae).map((f) => f.texto)).toEqual(['confere em todos os dias', 'saldo diverge −\u2060R$\u00a015,18', 'conferida com Bradesco-Invest. Facil']);
    expect(frasesDoStatus(interna).map((f) => f.texto)).toEqual(['conferida com Bradesco']);
  });

  it('o lápis: o sistema na data é o `saldo_apos_proprio` da última linha até ela; antes da 1ª, o inicial PRÓPRIO', () => {
    const [mae] = lerResumo([maeCrua()]);
    expect(saldoSistemaNaData(mae, '2024-04-30')).toBe(-55720.78);
    expect(saldoSistemaNaData(mae, '2024-04-15')).toBe(-55719.49);
    expect(saldoSistemaNaData(mae, '2024-04-05')).toBe(-39997.27);   // nunca o −40.000,00 consolidado
  });

  it('T9 — posição no meio do mês: conta de par tem a diferença INDISPONÍVEL (nunca subtração); conta sem par lê a do dono', () => {
    const pos = { data: '2024-04-15', saldo_sistema_na_data: -55722.22, saldo_sistema_proprio_na_data: -55719.49, diferenca_na_data: -16.47, realizados_apos: { qtde: 2, valor: 0 } };
    const [mae, interna, comum] = lerResumo([maeCrua({ posicao: pos }), internaCrua({ posicao: pos }),
      comProprio({ nivel: 'conta', conta_id: 'c', saldo_sistema: 1, posicao: { data: '2026-09-10', saldo_sistema_na_data: 100010, diferenca_na_data: -10, realizados_apos: { qtde: 7, valor: 1 } } })]);
    expect(diferencaNaPosicao(mae)).toEqual({ valor: null, indisponivel: true });
    expect(diferencaNaPosicao(interna)).toEqual({ valor: null, indisponivel: true });
    expect(diferencaNaPosicao(comum)).toEqual({ valor: -10, indisponivel: false });
    expect(sistemaNaPosicao(mae)).toEqual({ saldo: -55719.49, diferenca: null, diferencaIndisponivel: true, aposQtde: 2, data: '2024-04-15' });
    expect(sistemaNaPosicao(comum)).toEqual({ saldo: 100010, diferenca: -10, diferencaIndisponivel: false, aposQtde: 7, data: '2026-09-10' });
    expect(TITULO_DIFERENCA_NA_POSICAO_INDISPONIVEL)
      .toBe('diferença na posição ainda não disponível para conta conferida em par — veja a diferença do fim do mês');
    /* sem posição: o `proprio` do mês */
    const [maeFim] = lerResumo([maeCrua()]);
    expect(sistemaNaPosicao(maeFim)).toMatchObject({ saldo: -55719.49, diferenca: -15.18, diferencaIndisponivel: false });
  });

  it('"Fechar contas sem movimento" na conta-mãe grava o saldo PRÓPRIO, não o consolidado do par', () => {
    const parado = { saldo_inicial: 100, entradas: 0, saidas: 0, saldo_sistema: 100, saldo_extrato: null, diferenca: null,
      entradas_terceiros: 0, entradas_transferencias: 0, saidas_terceiros: 0, saidas_transferencias: 0 };
    const linhas = lerResumo([
      maeCrua({ conta_id: 'mae-parada', tem_extrato: false, saldo_inicial: 600, saldo_inicial_origem: 'herdado', saldo_sistema: 600, saldo_extrato: null, entradas: 0, saidas: 0, proprio: parado }),
      /* a mãe com aplicação na interna tem movimento PRÓPRIO, mesmo com o consolidado parado: não se fecha */
      maeCrua({ conta_id: 'mae-aplicou', tem_extrato: false, saldo_inicial: 600, saldo_inicial_origem: 'herdado', saldo_sistema: 600, saldo_extrato: null, entradas: 0, saidas: 0,
        proprio: { ...parado, saidas: -50, saidas_transferencias: -50, saldo_sistema: 50 } }),
    ]);
    const r = contasParaFecharSemMovimento(linhas);
    expect(r.fechar).toEqual([{ conta_id: 'mae-parada', saldo_inicial: 100, saldo_final: 100 }]);
    expect(r.comMovimento).toBe(1);
  });
});
