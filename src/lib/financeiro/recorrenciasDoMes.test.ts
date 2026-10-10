/**
 * REC-VALOR-CERTO-01 — o dono do mês das recorrências (`recorrenciasDoMes.ts`): a linha de cada regra no mês, o resumo, o
 * filtro e o total. Centavos inteiros; certo + confirmado + estimado = total, ao centavo.
 */
import { describe, it, expect } from 'vitest';
import {
  competenciaQueVenceNoMes, filtrarLinhas, linhasDoMes, proporcoesDoMes, resumoDoMes, totalDaLista,
  type OcorrenciaDoMes, type RegraDoMes,
} from './recorrenciasDoMes';

const regra = (o: Partial<RegraDoMes> & { id: string }): RegraDoMes => ({
  valorBase: -1000, valorAConfirmar: false, folha: false, ativo: true, diaVencimento: 10,
  dataInicio: '2026-01-01', primeiroVencimento: '2026-01-10', dataFim: '2026-12-01', ultimoLancamentoGerado: '2026-12-01', ...o,
});
const oc = (recorrenciaId: string, valor: number, o: Partial<OcorrenciaDoMes> = {}): OcorrenciaDoMes => ({
  recorrenciaId, valor, dataVencimento: '2026-10-10', status: 'previsto', valorDoMesEm: null, ...o,
});
const MES = '2026-10';
const uma = (r: RegraDoMes, ocs: OcorrenciaDoMes[]) => linhasDoMes([r], ocs, MES);

describe('a linha da recorrência no mês', () => {
  it('valor certo: situação "certo", e o valor é o da OCORRÊNCIA, não o valor base', () => {
    const [l] = uma(regra({ id: 'r1' }), [oc('r1', 1234.56)]);
    expect(l).toMatchObject({ regraId: 'r1', tipo: 'certo', situacao: 'certo', previsto: 100000, valor: 123456, ocorrencias: 1, entrada: false });
  });
  it('valor certo com a marca do valor do mês segue "certo" (a marca vale para as duas, a situação é do tipo)', () => {
    const [l] = uma(regra({ id: 'r1' }), [oc('r1', 1100, { valorDoMesEm: '2026-10-05T12:00:00Z' })]);
    expect(l.situacao).toBe('certo');
    expect(l.valor).toBe(110000);
  });
  it('a confirmar: confirmado PELA MARCA, mesmo com o valor igual ao valor base (é a marca gravada, nunca comparação)', () => {
    const [l] = uma(regra({ id: 'r1', valorAConfirmar: true }), [oc('r1', 1000, { valorDoMesEm: '2026-10-05T12:00:00Z' })]);
    expect(l).toMatchObject({ tipo: 'a_confirmar', situacao: 'confirmado', valor: 100000 });
  });
  it('a confirmar: confirmado por estar REALIZADO ou CONCILIADO, sem marca', () => {
    for (const status of ['realizado', 'conciliado']) {
      expect(uma(regra({ id: 'r1', valorAConfirmar: true }), [oc('r1', 987.65, { status })])[0].situacao).toBe('confirmado');
    }
  });
  it('a confirmar: ESTIMADO sem marca e em aberto — mesmo com o valor diferente do valor base', () => {
    for (const status of ['previsto', 'programado', 'agendado', null]) {
      expect(uma(regra({ id: 'r1', valorAConfirmar: true }), [oc('r1', 1500, { status })])[0].situacao).toBe('estimado');
    }
  });
  it('sem ocorrência gerada (competência acima da marca): entra pelo VALOR BASE; a confirmar fica estimado', () => {
    const naoGerada = { ultimoLancamentoGerado: '2026-09-01' };
    expect(uma(regra({ id: 'r1', ...naoGerada }), [])[0]).toMatchObject({ valor: 100000, situacao: 'certo', ocorrencias: 0 });
    expect(uma(regra({ id: 'r1', valorAConfirmar: true, ...naoGerada }), [])[0]).toMatchObject({ valor: 100000, situacao: 'estimado', ocorrencias: 0 });
    /* nunca gerou nada: também entra */
    expect(uma(regra({ id: 'r1', ultimoLancamentoGerado: null }), [])).toHaveLength(1);
  });
  it('competência CANCELADA (o contexto diz) e sem ocorrência viva: não entra (conta cancelada não é previsão)', () => {
    const ctx = { canceladas: [{ recorrenciaId: 'r1', competencia: '2026-10-01' }], mesesFechados: [] };
    expect(linhasDoMes([regra({ id: 'r1', ultimoLancamentoGerado: '2026-10-01' })], [], MES, ctx)).toEqual([]);
    expect(linhasDoMes([regra({ id: 'r1', ultimoLancamentoGerado: '2026-12-01' })], [], MES, ctx)).toEqual([]);
    /* a cancelada de OUTRA regra, ou de OUTRA competência, não esconde esta */
    expect(linhasDoMes([regra({ id: 'r1' })], [], MES, { canceladas: [{ recorrenciaId: 'r9', competencia: '2026-10-01' }], mesesFechados: [] })).toHaveLength(1);
    expect(linhasDoMes([regra({ id: 'r1' })], [], MES, { canceladas: [{ recorrenciaId: 'r1', competencia: '2026-09-01' }], mesesFechados: [] })).toHaveLength(1);
  });
  /* RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01 — ANTES, competência abaixo da marca sem ocorrência viva era SUPOSTA cancelada e a
     regra sumia do mês (o defeito da Santa Rita: vigência levada para trás depois de gerar). */
  it('regra vigente no mês e SEM lançamento aparece como NÃO GERADO — abaixo e acima da marca — com o motivo', () => {
    for (const marca of ['2026-12-01', '2026-10-01', '2026-09-01', null]) {
      const [l] = uma(regra({ id: 'r1', ultimoLancamentoGerado: marca }), []);
      expect(l).toMatchObject({ regraId: 'r1', ocorrencias: 0, valor: 100000, situacao: 'certo', naoGerado: 'falta gerar' });
    }
    const [f] = linhasDoMes([regra({ id: 'r1' })], [], MES, { canceladas: [], mesesFechados: ['2026-10'] });
    expect(f.naoGerado).toBe('mês fechado');
    /* o mês fechado que conta é o da COMPETÊNCIA: outro mês fechado não muda o motivo */
    expect(linhasDoMes([regra({ id: 'r1' })], [], MES, { canceladas: [], mesesFechados: ['2026-09', '2026-11'] })[0].naoGerado).toBe('falta gerar');
    /* com deslocamento 1, a competência que vence em outubro é setembro: é ELA que se confere */
    const desl = regra({ id: 'r2', dataInicio: '2026-01-01', primeiroVencimento: '2026-02-05', diaVencimento: 5 });
    expect(linhasDoMes([desl], [], MES, { canceladas: [], mesesFechados: ['2026-09'] })[0].naoGerado).toBe('mês fechado');
    expect(linhasDoMes([desl], [], MES, { canceladas: [{ recorrenciaId: 'r2', competencia: '2026-09-01' }], mesesFechados: [] })).toEqual([]);
  });
  it('com ocorrência viva a linha NÃO é "não gerado"; a regra pausada sem lançamento continua fora', () => {
    expect(uma(regra({ id: 'r1' }), [oc('r1', 10)])[0].naoGerado).toBeNull();
    expect(linhasDoMes([regra({ id: 'r1', ativo: false })], [], MES, { canceladas: [], mesesFechados: ['2026-10'] })).toEqual([]);
  });
  it('fora da vigência no mês (antes do início, depois do fim): não entra', () => {
    expect(uma(regra({ id: 'r1', dataInicio: '2026-11-01', primeiroVencimento: '2026-11-10', ultimoLancamentoGerado: null }), [])).toEqual([]);
    expect(uma(regra({ id: 'r1', dataFim: '2026-09-01', ultimoLancamentoGerado: null }), [])).toEqual([]);
  });
  it('regra pausada: sem ocorrência não entra; COM ocorrência viva entra (a conta existe)', () => {
    expect(uma(regra({ id: 'r1', ativo: false, ultimoLancamentoGerado: null }), [])).toEqual([]);
    expect(uma(regra({ id: 'r1', ativo: false }), [oc('r1', 800)])[0].valor).toBe(80000);
  });
  it('o mês é o do VENCIMENTO: conta do mês anterior (deslocamento 1) entra no mês em que vence', () => {
    const r = regra({ id: 'r1', dataInicio: '2026-01-01', primeiroVencimento: '2026-02-05', diaVencimento: 5, ultimoLancamentoGerado: null });
    expect(competenciaQueVenceNoMes(r, '2026-10')).toBe('2026-09-01');
    expect(competenciaQueVenceNoMes(r, '2026-01')).toBeNull();           // a primeira vence em fevereiro
    expect(competenciaQueVenceNoMes(r, '2027-01')).toBe('2026-12-01');   // a última competência vence em janeiro
    expect(competenciaQueVenceNoMes(r, '2027-02')).toBeNull();
    /* ocorrência de outro mês de vencimento não conta neste */
    expect(linhasDoMes([regra({ id: 'r2' })], [oc('r2', 500, { dataVencimento: '2026-11-10' })], MES)[0]).toMatchObject({ ocorrencias: 0, valor: 100000 });
  });
  it('duas ocorrências vivas no mês: SOMA, e a situação é a pior (estimado > confirmado)', () => {
    const r = regra({ id: 'r1', valorAConfirmar: true });
    const [l] = uma(r, [oc('r1', 300.10, { valorDoMesEm: '2026-10-02T00:00:00Z' }), oc('r1', 200.25)]);
    expect(l).toMatchObject({ valor: 50035, situacao: 'estimado', ocorrencias: 2 });
    const [m] = uma(r, [oc('r1', 300.10, { valorDoMesEm: '2026-10-02T00:00:00Z' }), oc('r1', 200.25, { status: 'realizado' })]);
    expect(m.situacao).toBe('confirmado');
  });
});

describe('o resumo do mês', () => {
  const REGRAS = [
    regra({ id: 'certo-1' }),                                   // 1.000,00 certo
    regra({ id: 'certo-folha', folha: true }),                  // 2.500,10 certo, folha
    regra({ id: 'conf', valorAConfirmar: true }),               // 333,33 confirmado
    regra({ id: 'est', valorAConfirmar: true, folha: true }),   // 0,07 estimado, folha
    regra({ id: 'est-base', valorAConfirmar: true, valorBase: -450.5, ultimoLancamentoGerado: '2026-09-01' }), // 450,50 estimado (valor base)
    regra({ id: 'entrada', valorBase: 9000 }),                  // entrada 9.000,00
    regra({ id: 'fora', dataFim: '2026-08-01', ultimoLancamentoGerado: null }),
  ];
  const OCS = [oc('certo-1', 1000), oc('certo-folha', 2500.1), oc('conf', 333.33, { valorDoMesEm: '2026-10-01T00:00:00Z' }), oc('est', 0.07), oc('entrada', 9000)];
  const linhas = linhasDoMes(REGRAS, OCS, MES);
  const r = resumoDoMes(linhas);
  it('as quatro fatias, valor e quantidade', () => {
    expect(r.certo).toEqual({ valor: 350010, qtd: 2 });
    expect(r.confirmado).toEqual({ valor: 33333, qtd: 1 });
    expect(r.estimado).toEqual({ valor: 45057, qtd: 2 });
    expect(r.total).toEqual({ valor: 428400, qtd: 5 });
  });
  it('INVARIANTE: certo + confirmado + estimado = total, ao centavo, em valor e em quantidade', () => {
    expect(r.certo.valor + r.confirmado.valor + r.estimado.valor).toBe(r.total.valor);
    expect(r.certo.qtd + r.confirmado.qtd + r.estimado.qtd).toBe(r.total.qtd);
  });
  it('a FOLHA é subconjunto do total, não uma quarta fatia (não soma de novo)', () => {
    expect(r.folha).toEqual({ valor: 250017, qtd: 2 });
    expect(r.folha.valor).toBeLessThanOrEqual(r.total.valor);
    /* a busca sabe achar: sem as regras de folha o total cai exatamente o valor da folha */
    const sem = resumoDoMes(linhasDoMes(REGRAS.filter(x => !x.folha), OCS, MES));
    expect(r.total.valor - sem.total.valor).toBe(r.folha.valor);
  });
  it('a ENTRADA fica à parte: não entra no total nem em fatia nenhuma', () => {
    expect(r.entradas).toEqual({ valor: 900000, qtd: 1 });
    expect(linhas.find(l => l.regraId === 'entrada')?.entrada).toBe(true);
  });
  it('a recorrência fora da vigência não tem linha', () => {
    expect(linhas.map(l => l.regraId)).toEqual(['certo-1', 'certo-folha', 'conf', 'est', 'est-base', 'entrada']);
  });
  it('a barra: três larguras que somam 100; total zero = três zeros', () => {
    const p = proporcoesDoMes(r);
    expect(p.certo + p.confirmado + p.estimado).toBeCloseTo(100, 9);
    expect(p.certo).toBeCloseTo((350010 / 428400) * 100, 9);
    expect(proporcoesDoMes(resumoDoMes([]))).toEqual({ certo: 0, confirmado: 0, estimado: 0 });
  });
  it('o filtro e o total da lista: cada filtro devolve as suas linhas, e o total é o delas', () => {
    const ids = (t: Parameters<typeof filtrarLinhas>[1], s: Parameters<typeof filtrarLinhas>[2]) => filtrarLinhas(linhas, t, s).map(l => l.regraId);
    expect(ids('todas', 'todas')).toHaveLength(6);
    expect(ids('certo', 'todas')).toEqual(['certo-1', 'certo-folha', 'entrada']);
    expect(ids('a_confirmar', 'todas')).toEqual(['conf', 'est', 'est-base']);
    expect(ids('folha', 'todas')).toEqual(['certo-folha', 'est']);
    expect(ids('todas', 'confirmado')).toEqual(['conf']);
    expect(ids('todas', 'estimado')).toEqual(['est', 'est-base']);
    expect(ids('folha', 'estimado')).toEqual(['est']);
    expect(totalDaLista(filtrarLinhas(linhas, 'a_confirmar', 'todas'))).toEqual({ qtd: 3, previsto: 245050, valor: 78390, entradasQtd: 0, entradasPrevisto: 0, entradasValor: 0 });
    /* entradas e saídas nunca se anulam no total */
    expect(totalDaLista(linhas)).toMatchObject({ qtd: 5, valor: 428400, entradasQtd: 1, entradasValor: 900000 });
  });
  it('centavos inteiros: 0,1 + 0,2 não vira 0,30000000000000004', () => {
    const rr = resumoDoMes(linhasDoMes([regra({ id: 'a' }), regra({ id: 'b' })], [oc('a', 0.1), oc('b', 0.2)], MES));
    expect(rr.total.valor).toBe(30);
  });
});
