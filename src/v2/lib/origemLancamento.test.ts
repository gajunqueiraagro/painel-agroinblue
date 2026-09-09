/**
 * O ÍCONE DE ORIGEM, FIXADO — PR-TEST-01.
 *
 * A regra tem três consumidores (lista do Financeiro, minimodal, Extrato Gerencial) e
 * nenhum deles a exercita fora do navegador. O que este arquivo protege não é a função em
 * si: é o dia em que alguém "simplificar" a ordem das cláusulas e o `!` passar a aparecer
 * em conta de caixa — que é o defeito exato que o B-1 existiu para evitar.
 */
import { describe, it, expect } from 'vitest';
import {
  iconeOrigemLancamento,
  rotuloOrigem,
  ORIGEM_LANCAMENTO_LABEL,
  TITULO_ICONE,
  LEGENDA_ICONES,
} from './origemLancamento';
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';

const CONTA = 'conta-1';

/**
 * ⚠ O CAST É DO TESTE, NÃO DA PRODUÇÃO. `LancamentoV2.editado_manual` é `boolean`, mas a
 * coluna do banco é `boolean | null` e a regra usa `!== true` justamente por isso. Testar o
 * nulo exige dizer ao compilador o que o banco de fato devolve; sem isso, o ramo que trata o
 * caso mais comum (coluna nunca preenchida) ficaria sem teste.
 */
type CamposDoIcone = Pick<LancamentoV2, 'status_transacao' | 'editado_manual' | 'conta_bancaria_id' | 'data_pagamento'>;

function lanc(over: Partial<Record<keyof CamposDoIcone, unknown>> = {}): CamposDoIcone {
  return {
    status_transacao: 'realizado',
    editado_manual: false,
    conta_bancaria_id: CONTA,
    data_pagamento: '2026-07-15',
    ...over,
  } as CamposDoIcone;
}

/** A conta tem extrato em julho/2026 — a régua do "!". */
const COM_EXTRATO: ReadonlySet<string> = new Set([`${CONTA}|2026-07`]);
const SEM_EXTRATO: ReadonlySet<string> = new Set([`${CONTA}|2026-05`]);

describe('iconeOrigemLancamento — com vínculo ativo', () => {
  it('ofx_substituiu vira ↺', () => {
    const r = iconeOrigemLancamento(lanc(), { tipoAprovacao: 'ofx_substituiu' }, COM_EXTRATO);
    expect(r?.simbolo).toBe('↺');
    expect(r?.cor).toBe('text-warning');
  });

  it('ofx_cru com editado_manual nulo vira B', () => {
    const r = iconeOrigemLancamento(lanc({ editado_manual: null }), { tipoAprovacao: 'ofx_cru' }, COM_EXTRATO);
    expect(r?.simbolo).toBe('B');
  });

  it('ofx_cru com editado_manual false vira B', () => {
    const r = iconeOrigemLancamento(lanc({ editado_manual: false }), { tipoAprovacao: 'ofx_cru' }, COM_EXTRATO);
    expect(r?.simbolo).toBe('B');
    expect(r?.cor).toBe('text-primary');
  });

  it('ofx_cru JÁ EDITADO deixa de ser cru e vira ✓', () => {
    const r = iconeOrigemLancamento(lanc({ editado_manual: true }), { tipoAprovacao: 'ofx_cru' }, COM_EXTRATO);
    expect(r?.simbolo).toBe('✓');
  });

  it.each(['manual', 'agrupamento_manual', 'agrupamento_legado'])('%s vira ✓', (tipo) => {
    const r = iconeOrigemLancamento(lanc(), { tipoAprovacao: tipo }, COM_EXTRATO);
    expect(r?.simbolo).toBe('✓');
    expect(r?.cor).toBe('text-success');
  });

  it('vínculo vence a cobertura: com vínculo o "!" nunca aparece', () => {
    const r = iconeOrigemLancamento(lanc(), { tipoAprovacao: 'manual' }, SEM_EXTRATO);
    expect(r?.simbolo).toBe('✓');
  });
});

describe('iconeOrigemLancamento — sem vínculo', () => {
  it('realizado com extrato na conta e no mês vira !', () => {
    const r = iconeOrigemLancamento(lanc(), undefined, COM_EXTRATO);
    expect(r?.simbolo).toBe('!');
    expect(r?.cor).toBe('text-destructive');
  });

  it('realizado sem extrato naquele mês vira M, nunca !', () => {
    const r = iconeOrigemLancamento(lanc(), undefined, SEM_EXTRATO);
    expect(r?.simbolo).toBe('M');
  });

  it('conta nula (caixa) vira M', () => {
    const r = iconeOrigemLancamento(lanc({ conta_bancaria_id: null }), undefined, COM_EXTRATO);
    expect(r?.simbolo).toBe('M');
  });

  it('a cobertura é por conta E mês: outra conta no mesmo mês não gera !', () => {
    const r = iconeOrigemLancamento(lanc({ conta_bancaria_id: 'conta-2' }), undefined, COM_EXTRATO);
    expect(r?.simbolo).toBe('M');
  });

  it('sem cobertura carregada não há palpite: nada de ícone, e nunca M', () => {
    expect(iconeOrigemLancamento(lanc(), undefined, undefined)).toBeNull();
  });
});

describe('iconeOrigemLancamento — previsto', () => {
  it.each([undefined, { tipoAprovacao: 'manual' }])('previsto com vínculo=%j', (vinculo) => {
    const l = lanc({ status_transacao: 'programado' });
    const r = iconeOrigemLancamento(l, vinculo, COM_EXTRATO);
    /* Previsto COM vínculo ainda ganha ícone: o vínculo é a primeira cláusula, e um previsto
       conciliado é contradição que a tela deve mostrar, não esconder. Sem vínculo, nada. */
    if (vinculo) expect(r?.simbolo).toBe('✓');
    else expect(r).toBeNull();
  });
});

/**
 * ⚠ A PRECEDÊNCIA ENTRE DOIS VÍNCULOS NÃO PASSA POR AQUI, e é a lacuna que este arquivo
 * documenta em vez de fingir cobrir: `iconeOrigemLancamento` recebe UM vínculo, já resolvido.
 * A escolha do vencedor está escrita TRÊS VEZES, nenhuma exportada —
 * `useConciliacaoDoMes.ts:561` (`FORCA_APROVACAO`), `MinimodalOrigemLancamento.tsx:74`
 * (`FORCA`) e `ExtratoGerencialTab.tsx:204` (`forca` inline). Enquanto forem três, um teste
 * só não as protege; o que dá para fixar aqui é que, dado o vencedor, o ícone é o certo.
 */
describe('iconeOrigemLancamento — dado o vencedor da precedência', () => {
  it('manual + ofx_substituiu: o vencedor é ofx_substituiu e o ícone é ↺', () => {
    expect(iconeOrigemLancamento(lanc(), { tipoAprovacao: 'ofx_substituiu' }, COM_EXTRATO)?.simbolo).toBe('↺');
  });

  it('manual + ofx_cru não editado: o vencedor é ofx_cru e o ícone é B', () => {
    expect(iconeOrigemLancamento(lanc(), { tipoAprovacao: 'ofx_cru' }, COM_EXTRATO)?.simbolo).toBe('B');
  });
});

describe('rotuloOrigem', () => {
  it('sem origem devolve a sentinela de ausência, não vazio', () => {
    expect(rotuloOrigem(null)).toBe('—');
    expect(rotuloOrigem(undefined)).toBe('—');
  });

  it('origem conhecida vira português', () => {
    expect(rotuloOrigem('extrato')).toBe('Criado pelo banco');
    expect(rotuloOrigem('ofx')).toBe('Extrato OFX');
  });

  it('origem desconhecida devolve o valor cru, sem quebrar', () => {
    expect(rotuloOrigem('x_desconhecido')).toBe('x_desconhecido');
  });
});

describe('catálogos', () => {
  it('TITULO_ICONE cobre exatamente os cinco símbolos da legenda', () => {
    expect(Object.keys(TITULO_ICONE).sort()).toEqual(LEGENDA_ICONES.map((l) => l.simbolo).sort());
    expect(LEGENDA_ICONES).toHaveLength(5);
  });

  it('ORIGEM_LANCAMENTO_LABEL tem as 18 origens do banco', () => {
    expect(Object.keys(ORIGEM_LANCAMENTO_LABEL)).toHaveLength(18);
  });

  it('todo símbolo da legenda é produzível pelo classificador', () => {
    const produzidos = new Set([
      iconeOrigemLancamento(lanc(), { tipoAprovacao: 'ofx_substituiu' }, COM_EXTRATO)?.simbolo,
      iconeOrigemLancamento(lanc(), { tipoAprovacao: 'ofx_cru' }, COM_EXTRATO)?.simbolo,
      iconeOrigemLancamento(lanc(), { tipoAprovacao: 'manual' }, COM_EXTRATO)?.simbolo,
      iconeOrigemLancamento(lanc(), undefined, COM_EXTRATO)?.simbolo,
      iconeOrigemLancamento(lanc(), undefined, SEM_EXTRATO)?.simbolo,
    ]);
    for (const l of LEGENDA_ICONES) expect(produzidos.has(l.simbolo)).toBe(true);
  });
});
