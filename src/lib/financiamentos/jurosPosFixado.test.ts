/**
 * FIN-POS-FIXADO-01a — os juros estimados do pós-fixado: o espelho da regra do banco (os MESMOS casos do teste SQL), a união com
 * os estimados da recorrência num dono só, o `title` por origem, e o recorte da CPR com uma linha de cada origem.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import casos from './jurosPosFixado.casos.json';
import { jurosEstimadoPosFixado, lerJurosEstimados } from './jurosPosFixado';
import { juntarEstimados, origensPresentes, tituloDoEstimado, TITULO_DO_ESTIMADO } from '@/lib/financeiro/estimadosDaCpr';
import { recortarCpr, type ContaCpr } from '@/lib/financeiro/cprRecorte';

describe('a regra (espelho de _fn_juros_estimado), pelos mesmos casos do teste SQL', () => {
  for (const c of casos) {
    it(`${c.nome}: ${c.esperado ? 'estimado' : 'não estimado'}`, () => {
      expect(jurosEstimadoPosFixado({ tipoTaxa: c.tipoTaxa, statusParcela: c.statusParcela, statusLancamento: c.statusLancamento })).toBe(c.esperado);
    });
  }
  it('"ajustada" não entra na regra: os casos pos e pos_ajustada dão o mesmo resultado', () => {
    const a = casos.find((c) => c.nome === 'pos'); const b = casos.find((c) => c.nome === 'pos_ajustada');
    expect(a?.esperado).toBe(true); expect(b?.esperado).toBe(true);
    expect(readFileSync('src/lib/financiamentos/jurosPosFixado.ts', 'utf8')).not.toMatch(/j\.ajustada/);
  });
  it('os casos do TS são os do teste SQL (mesmos nomes e mesmo esperado)', () => {
    const sql = readFileSync('supabase/tests/fin_pos_fixado_01a_test.sql', 'utf8');
    for (const c of casos) expect(sql).toContain(`('${c.nome}',`);
    for (const c of casos) expect(sql).toMatch(new RegExp(`\\('${c.nome}',[^\\n]*${c.esperado}\\)`));
  });
});

describe('a leitura e a união das origens', () => {
  it('o leitor aceita a lista de ids e recusa peça torta', () => {
    expect(lerJurosEstimados([{ lancamento_id: 'j1' }, { lancamento_id: 'j2' }])).toEqual(new Set(['j1', 'j2']));
    expect(lerJurosEstimados([{ lancamento_id: null }])).toBeNull();
    expect(lerJurosEstimados({})).toBeNull();
  });
  it('a união junta as duas origens num conjunto só; a linha com as duas guarda as duas', () => {
    const e = juntarEstimados(new Set(['r1', 'ambas']), new Set(['j1', 'ambas']), false);
    expect([...e.ids].sort()).toEqual(['ambas', 'j1', 'r1']);
    expect(e.origens.get('ambas')).toEqual(['recorrencia', 'juros_pos']);
    expect(origensPresentes(e)).toEqual(['recorrencia', 'juros_pos']);
    expect(origensPresentes(juntarEstimados(new Set(), new Set(['j1']), false))).toEqual(['juros_pos']);
  });
  it('o title por origem: recorrência o texto atual; juros pós o novo; as duas, os dois; o aviso de leitura incompleta por último', () => {
    expect(tituloDoEstimado(['recorrencia'], '')).toBe('valor estimado pela recorrência · informe o valor do mês no lançamento');
    expect(tituloDoEstimado(['juros_pos'], '')).toBe('juros estimados pela taxa do contrato pós-fixado · o valor real entra quando a parcela for paga');
    expect(tituloDoEstimado(['juros_pos', 'recorrencia'], 'AVISO')).toBe(`${TITULO_DO_ESTIMADO.recorrencia}\n${TITULO_DO_ESTIMADO.juros_pos}\nAVISO`);
    expect(tituloDoEstimado(['juros_pos'], 'AVISO').endsWith('\nAVISO')).toBe(true);
  });
});

describe('o recorte da CPR com uma linha de recorrência e uma de juros pós', () => {
  const conta = (id: string, valor: number): ContaCpr => ({
    id, data_vencimento: '2026-10-15', data_pagamento: null, status_transacao: 'programado', tipo_operacao: '2-Saídas', valor, conta_bancaria_id: 'bb' });
  const linhas = [conta('rec', 300), conta('juros', 35665.34), conta('principal', 120004.5)];
  const e = juntarEstimados(new Set(['rec']), new Set(['juros']), false);
  const r = recortarCpr(linhas, { periodo: { de: '2026-10-01', ate: '2026-10-31' }, hoje: '2026-10-05', estimadas: e.ids });
  it('as duas entram no estimado; o principal fica no confirmado; confirmado + estimado = total', () => {
    expect(r.aPagarEstimado).toEqual({ valor: 3596534, qtd: 2 });
    expect(r.aPagarConfirmado).toEqual({ valor: 12000450, qtd: 1 });
  });
});
