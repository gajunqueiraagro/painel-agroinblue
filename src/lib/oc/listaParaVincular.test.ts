/**
 * OC-BUSCAR-RECEBIMENTO-01 — a lista do "+ Buscar recebimento no Financeiro". O caso da OC de abate de 22/10 (print do Gabriel 07/11 08:31)
 * no FORMATO real (sintético: nomes e ids inventados; as datas e a mistura são as do caso — recebimentos do frigorífico desde 2021, parte
 * ligada a outras OCs, o "já nesta operação", e nenhum livre na janela).
 */
import { describe, expect, it } from 'vitest';
import type { RecebimentoVinculavel } from '@/hooks/useOcContaCorrente';
import { MOTIVO_OUTRA_OC, listaParaVincular, ordenarPorColuna } from '@/lib/oc/listaParaVincular';

const R = (id: string, data: string, valor: number, extra: Partial<RecebimentoVinculavel> = {}): RecebimentoVinculavel => ({
  lancamentoId: id, data, valor, descricao: `Recebimento ${id}`, subcentro: 'Venda de gado', mesmoFavorecido: true, semContaBancaria: false,
  status: 'realizado', conciliado: false, competencia: data, vencimento: data, pagamento: data, favorecido: 'Frigorífico Sintético',
  contaBancaria: 'Banco Alfa', motivoExcluido: null, ...extra,
});
const OC = '2026-10-22';
const SALDO = 229033.59;
const padrao = { dataDaOc: OC, saldo: SALDO, verVinculados: false, todoHistorico: false };

/* o caso: 2021 (livre e ligado a outra OC), 2025, e na janela: o já desta OC, um de valor igual, um perto, um de outro favorecido */
const CASO = [
  R('a2021', '2021-04-24', 180000),
  R('b2021-outra', '2021-05-20', 95000, { motivoExcluido: MOTIVO_OUTRA_OC }),
  R('c2025', '2025-11-03', 210000),
  R('d-nesta', '2026-10-31', 229033.59, { motivoExcluido: 'já está nesta operação (1/1)' }),
  R('e-longe-valor', '2026-12-10', 100000),
  R('f-igual', '2026-11-20', 229033.59),
  R('g-perto', '2026-10-25', 229000),
  R('h-outro', '2026-10-23', 229033.59, { mesmoFavorecido: false, favorecido: 'Outra Empresa' }),
  R('i-outra-janela', '2026-10-30', 50000, { motivoExcluido: MOTIVO_OUTRA_OC }),
  R('j-depois-60', '2026-12-22', 229033.59),
];

describe('o que o Buscar recebimento mostra', () => {
  it('por padrão: só a janela (30 antes, 60 depois) e sem os ligados a outra OC; diz quantos ficaram de fora', () => {
    const l = listaParaVincular(CASO, padrao);
    expect(l.linhas.map((r) => r.lancamentoId)).toEqual(['f-igual', 'g-perto', 'e-longe-valor', 'h-outro', 'd-nesta']);
    expect(l.emOutraOc).toBe(2);
    expect(l.foraDaJanela).toBe(3);
  });
  it('a ordem: do frigorífico com o valor IGUAL ao saldo primeiro, depois o valor mais perto, depois o resto pela data mais perto', () => {
    const l = listaParaVincular(CASO, padrao).linhas.map((r) => r.lancamentoId);
    expect(l.indexOf('f-igual')).toBeLessThan(l.indexOf('g-perto'));
    expect(l.indexOf('g-perto')).toBeLessThan(l.indexOf('e-longe-valor'));
    /* o de outro favorecido, mesmo com o valor igual e a data mais perto, vem depois dos do frigorífico */
    expect(l.indexOf('e-longe-valor')).toBeLessThan(l.indexOf('h-outro'));
  });
  it('"ver também os já vinculados" traz o ligado a outra OC da janela (o de 2021 só com o histórico)', () => {
    const l = listaParaVincular(CASO, { ...padrao, verVinculados: true });
    expect(l.linhas.map((r) => r.lancamentoId)).toContain('i-outra-janela');
    expect(l.linhas.map((r) => r.lancamentoId)).not.toContain('b2021-outra');
    expect(l.emOutraOc).toBe(0);
  });
  it('"procurar em todo o histórico": os antigos entram DEPOIS dos da janela, pela data mais perto da OC', () => {
    const l = listaParaVincular(CASO, { ...padrao, todoHistorico: true }).linhas.map((r) => r.lancamentoId);
    expect(l.slice(0, 3)).toEqual(['f-igual', 'g-perto', 'e-longe-valor']);
    expect(l.indexOf('j-depois-60')).toBeLessThan(l.indexOf('c2025'));
    expect(l.indexOf('c2025')).toBeLessThan(l.indexOf('a2021'));
    expect(l).not.toContain('b2021-outra');
  });
  it('o caso real: nenhum livre na janela → lista só com o já desta OC; os antigos esperam o histórico', () => {
    const real = [R('x2021', '2021-04-24', 1), R('y2022', '2022-03-01', 2), R('z-nesta', '2026-10-31', 3, { motivoExcluido: 'já está nesta operação (1/1)' }),
      R('w-outra', '2026-10-28', 4, { motivoExcluido: MOTIVO_OUTRA_OC })];
    const l = listaParaVincular(real, padrao);
    expect(l.linhas.map((r) => r.lancamentoId)).toEqual(['z-nesta']);
    expect(l.foraDaJanela).toBe(2);
    expect(l.emOutraOc).toBe(1);
  });
});

describe('toda coluna ordena', () => {
  const l = listaParaVincular(CASO, padrao).linhas;
  it('valor e data nos dois sentidos; o vazio no fim', () => {
    expect(ordenarPorColuna(l, 'valor', true).map((r) => r.valor)).toEqual([100000, 229000, 229033.59, 229033.59, 229033.59]);
    expect(ordenarPorColuna(l, 'vencimento', false)[0].lancamentoId).toBe('e-longe-valor');
    const semPgto = [...l, R('k-sem', '2026-10-24', 1, { pagamento: null })];
    expect(ordenarPorColuna(semPgto, 'pagamento', true).at(-1)?.lancamentoId).toBe('k-sem');
    expect(ordenarPorColuna(semPgto, 'pagamento', false).at(-1)?.lancamentoId).toBe('k-sem');
  });
  it('fazenda pelo código lido', () => {
    const faz: Record<string, string> = { 'f-igual': 'RET', 'g-perto': 'ADM' };
    expect(ordenarPorColuna(l, 'fazenda', true, (r) => faz[r.lancamentoId] ?? null).slice(0, 2).map((r) => r.lancamentoId)).toEqual(['g-perto', 'f-igual']);
  });
});

/* OC-BUSCAR-RECEBIMENTO-01 (adendos de 07/11 08:34 e do DRE): a competência do Programar recebimento e o texto do DRE do título da OC */
import { competenciaDoModoOC, primeiraSaidaDaOC, textoDoDreDaOC } from '@/lib/oc/lancarPeloModal';

describe('Programar recebimento: a competência nasce da 1ª SAÍDA, nunca de hoje (FIN-COMPETENCIA-VENDA-01)', () => {
  const HOJE = '2026-11-07';
  it('o caso da OC de abate: saída 22/10 → 22/10 (era 07/11, hoje)', () => {
    expect(competenciaDoModoOC('principal', 'abate', '2026-10-22', 'Venda de gado para abate', HOJE)).toBe('2026-10-22');
    expect(competenciaDoModoOC('principal', 'venda', '2026-10-22', 'Venda de Desmama Machos', HOJE)).toBe('2026-10-22');
  });
  it('fora da regra, como sempre: compra, despesa, Venda em Boitel e a OC ainda sem saída', () => {
    expect(competenciaDoModoOC('principal', 'compra', '2026-10-22', null, HOJE)).toBe(HOJE);
    expect(competenciaDoModoOC('obrigacao', 'abate', '2026-10-22', null, HOJE)).toBe(HOJE);
    expect(competenciaDoModoOC('principal', 'venda', '2026-10-22', 'Venda em Boitel', HOJE)).toBe(HOJE);
    expect(competenciaDoModoOC('principal', 'abate', null, null, HOJE)).toBe(HOJE);
  });
  it('a 1ª saída é a entrega MAIS ANTIGA da conta corrente (o recebimento e a explicação não contam)', () => {
    expect(primeiraSaidaDaOC({ linhas: [{ tipo: 'recebimento', data: '2026-10-01' }, { tipo: 'entrega', data: '2026-10-25' },
      { tipo: 'entrega', data: '2026-10-22' }] })).toBe('2026-10-22');
    expect(primeiraSaidaDaOC({ linhas: [{ tipo: 'recebimento', data: '2026-10-01' }] })).toBeNull();
    expect(primeiraSaidaDaOC(null)).toBeNull();
  });
  it('o texto do DRE do título da OC: a data da entrega em dd/mm; sem ela, sem parênteses', () => {
    expect(textoDoDreDaOC('2026-10-22')).toBe('DRE: pela entrega da OC (22/10)');
    expect(textoDoDreDaOC(null)).toBe('DRE: pela entrega da OC');
  });
});

import { readFileSync } from 'node:fs';
describe('o modal da OC usa a regra (lido da FONTE)', () => {
  it('o prefill do Programar recebimento: a competência pela regra, nunca hojeLocal() direto; a 1ª saída sai da conta corrente', () => {
    const dialogo = readFileSync('src/components/operacao-comercial/LancamentoDaOCDialog.tsx', 'utf8');
    expect(dialogo).toContain('data_competencia: competenciaDoModoOC(natureza, tipo, primeiraSaida,');
    expect(dialogo).not.toMatch(/data_competencia:\s*hojeLocal\(\)/);
    expect(readFileSync('src/components/compra/AbaFinanceiroOC.tsx', 'utf8')).toContain('primeiraSaida={primeiraSaidaDaOC(ccApi.contaCorrente)}');
  });
});
