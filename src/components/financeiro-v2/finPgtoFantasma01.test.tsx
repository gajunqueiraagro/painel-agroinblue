/**
 * FIN-PGTO-FANTASMA-01 — A TELA MOSTRA O QUE VAI GRAVAR. O modal mostrava (desabilitada) a data de pagamento do banco de um
 * lançamento previsto/programado/agendado, e o salvar a apagava sem aviso. A regra não mudou (`pagamentoParaGravar`, só
 * realizado/conciliado tem pagamento): o campo e o resumo passam a ler o irmão `pagamentoParaMostrar`, e o caso legado é avisado.
 * ⚠ O `LancamentoV2Dialog` não se monta em teste: as funções puras são exercitadas, e a ligação é lida da FONTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  pagamentoParaGravar, pagamentoParaMostrar, pagamentoQueSeraRemovido, avisoPagamentoLegado,
} from '@/lib/financeiro/statusFinanceiro';

const D = '2026-08-10';
const FORA = ['previsto', 'programado', 'agendado', 'meta'];
const COM = ['realizado', 'conciliado'];

describe('o que a tela mostra = o que vai gravar', () => {
  it('previsto, programado e agendado COM data no banco: campo VAZIO', () => {
    for (const s of FORA) expect(pagamentoParaMostrar(s, D, false)).toBe('');
  });
  it('realizado e conciliado: a data, como antes', () => {
    for (const s of COM) expect(pagamentoParaMostrar(s, D, false)).toBe(D);
    expect(pagamentoParaMostrar('realizado', '', false)).toBe('');
  });
  it('pagamento TRAVADO pelo extrato: a data fica à vista em qualquer status (é a do banco, e é gravada)', () => {
    for (const s of [...FORA, ...COM]) expect(pagamentoParaMostrar(s, D, true)).toBe(D);
  });
  it('nunca diverge do salvar: em toda combinação, mostrado = gravado (vazio no lugar do nulo)', () => {
    for (const s of [...FORA, ...COM]) for (const p of [D, '']) for (const t of [true, false]) {
      expect(pagamentoParaMostrar(s, p, t)).toBe(pagamentoParaGravar(s, p, t) ?? '');
    }
  });
});

describe('o aviso do caso legado', () => {
  it('data no banco + status fora do realizado: avisa, com a data do banco', () => {
    for (const s of FORA) expect(pagamentoQueSeraRemovido(D, s, D, false)).toBe(D);
    expect(avisoPagamentoLegado(D)).toBe('este lançamento tinha data de pagamento 10/08/2026 sem estar realizado; ao salvar ela é removida');
    expect(avisoPagamentoLegado('2026-10-05T00:00:00')).toContain('05/10/2026');
  });
  it('sem data no banco (o previsto comum): nada a avisar', () => {
    for (const s of [...FORA, ...COM]) for (const g of [null, undefined, '']) expect(pagamentoQueSeraRemovido(g, s, '', false)).toBeNull();
  });
  it('realizado/conciliado com data, ou pagamento travado pelo extrato: a data é gravada — sem aviso', () => {
    for (const s of COM) expect(pagamentoQueSeraRemovido(D, s, D, false)).toBeNull();
    for (const s of FORA) expect(pagamentoQueSeraRemovido(D, s, D, true)).toBeNull();
  });
  it('o usuário leva o legado a realizado: a data hidratada passa a valer e o aviso some', () => {
    expect(pagamentoQueSeraRemovido(D, 'programado', D, false)).toBe(D);
    expect(pagamentoQueSeraRemovido(D, 'realizado', D, false)).toBeNull();
    expect(pagamentoParaMostrar('realizado', D, false)).toBe(D);
  });
});

const fonte = (arq: string) => readFileSync(resolve(__dirname, arq), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('LancamentoV2Dialog — a ligação (fonte)', () => {
  const modal = fonte('./LancamentoV2Dialog.tsx');
  it('um valor só para o campo e o resumo, saído do dono da regra', () => {
    expect(modal).toContain('const pagamentoMostrado = pagamentoParaMostrar(statusTransacao, dataPagamento, pagamentoTravado);');
  });
  it('M1 — o campo "Data Pagamento" mostra o que vai gravar, desabilitado e com o title de sempre', () => {
    expect(modal).toContain("title={!pagamentoPermitido && !pagamentoTravado ? 'Só realizado tem data de pagamento' : undefined}> <Label className=\"text-[10px]\">Data Pagamento *</Label> <DatePicker value={pagamentoMostrado} onChange={handleDataPagamentoChange} disabled={pagamentoTravado || !pagamentoPermitido}");
    expect(modal).not.toContain('<DatePicker value={dataPagamento}');
  });
  it('M2 — o resumo lateral mostra o mesmo valor ("—" quando vazio)', () => {
    expect(modal).toContain('<LinhaResumo rotulo="Pagamento" valor={resumoFmtData(pagamentoMostrado)} />');
    expect(modal).not.toContain('resumoFmtData(dataPagamento)');
  });
  it('M3 — o aviso só existe com a data que o salvar vai remover, lida do registro do banco, e só na edição', () => {
    expect(modal).toContain('const pagamentoLegadoARemover = isEdit ? pagamentoQueSeraRemovido(lancamento?.data_pagamento, statusTransacao, dataPagamento, pagamentoTravado) : null;');
    expect(modal).toContain('{pagamentoLegadoARemover && ( <p className="-mt-1 text-[10px] leading-tight text-amber-700 dark:text-amber-400" data-testid="aviso-pagamento-legado"> {avisoPagamentoLegado(pagamentoLegadoARemover)} </p> )}');
    expect(modal.match(/aviso-pagamento-legado/g)).toHaveLength(1);
  });
  it('a gravação NÃO mudou: o payload segue por `pagamentoParaGravar`, com o estado hidratado', () => {
    expect(modal).toContain('data_pagamento: pagamentoParaGravar(statusPersistido, dataPagamento, pagamentoTravado),');
    expect(modal).toContain("setDataPagamento(lancamento.data_pagamento || '');");
  });
});
