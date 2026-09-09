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
  vinculoVencedor,
  tipoMaisForte,
  forcaAprovacao,
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
 * A PRECEDÊNCIA, AGORA EXERCITADA DE VERDADE — PR-CONC-B-4. Até aqui a escolha do vínculo
 * vencedor estava escrita três vezes, nenhuma exportada, e este bloco só sabia afirmar
 * "dado o vencedor, o ícone é o certo". Com uma função só, dá para testar a escolha.
 */
describe('vinculoVencedor', () => {
  const t = (tipo: string | null) => ({ tipoAprovacao: tipo });
  const tipoDe = (v: { tipoAprovacao: string | null }) => v.tipoAprovacao;

  it('lista vazia não tem vencedor', () => {
    expect(vinculoVencedor([], tipoDe)).toBeUndefined();
  });

  it('um só vínculo vence sozinho', () => {
    const unico = t('manual');
    expect(vinculoVencedor([unico], tipoDe)).toBe(unico);
  });

  it('manual + ofx_substituiu vence ofx_substituiu NAS DUAS ORDENS', () => {
    expect(vinculoVencedor([t('manual'), t('ofx_substituiu')], tipoDe)?.tipoAprovacao).toBe('ofx_substituiu');
    expect(vinculoVencedor([t('ofx_substituiu'), t('manual')], tipoDe)?.tipoAprovacao).toBe('ofx_substituiu');
  });

  it('manual + ofx_cru vence ofx_cru NAS DUAS ORDENS', () => {
    expect(vinculoVencedor([t('manual'), t('ofx_cru')], tipoDe)?.tipoAprovacao).toBe('ofx_cru');
    expect(vinculoVencedor([t('ofx_cru'), t('manual')], tipoDe)?.tipoAprovacao).toBe('ofx_cru');
  });

  it('ofx_substituiu vence ofx_cru nas duas ordens', () => {
    expect(vinculoVencedor([t('ofx_cru'), t('ofx_substituiu')], tipoDe)?.tipoAprovacao).toBe('ofx_substituiu');
    expect(vinculoVencedor([t('ofx_substituiu'), t('ofx_cru')], tipoDe)?.tipoAprovacao).toBe('ofx_substituiu');
  });

  it('empate de força fica com o PRIMEIRO — são 4 lançamentos assim no proto', () => {
    const primeiro = t('manual');
    expect(vinculoVencedor([primeiro, t('agrupamento_legado')], tipoDe)).toBe(primeiro);
    const outro = t('agrupamento_legado');
    expect(vinculoVencedor([outro, t('manual')], tipoDe)).toBe(outro);
  });

  it('o acessor lê o nome que a fonte usa — snake_case da linha crua também', () => {
    const linhas = [{ tipo_aprovacao: 'manual' }, { tipo_aprovacao: 'ofx_substituiu' }];
    expect(vinculoVencedor(linhas, (v) => v.tipo_aprovacao)?.tipo_aprovacao).toBe('ofx_substituiu');
  });

  it('o vencedor alimenta o ícone: as duas ordens dão o mesmo símbolo', () => {
    for (const lista of [[t('manual'), t('ofx_substituiu')], [t('ofx_substituiu'), t('manual')]]) {
      const v = vinculoVencedor(lista, tipoDe);
      expect(iconeOrigemLancamento(lanc(), v, COM_EXTRATO)?.simbolo).toBe('↺');
    }
  });
});

describe('tipoMaisForte e forcaAprovacao', () => {
  it('a força é 3, 2 e 1 — e desconhecido vale 1, nunca 0', () => {
    expect(forcaAprovacao('ofx_substituiu')).toBe(3);
    expect(forcaAprovacao('ofx_cru')).toBe(2);
    expect(forcaAprovacao('manual')).toBe(1);
    expect(forcaAprovacao('tipo_que_nao_existe')).toBe(1);
    expect(forcaAprovacao(null)).toBe(1);
  });

  it('desempata a favor do que já estava — é o que faz o acumulador ser estável', () => {
    expect(tipoMaisForte('manual', 'agrupamento_legado')).toBe('manual');
    expect(tipoMaisForte('manual', 'ofx_cru')).toBe('ofx_cru');
    expect(tipoMaisForte('ofx_substituiu', 'ofx_cru')).toBe('ofx_substituiu');
  });

  /* ⚠ ESTE CASO É A ARMADILHA que o B-4 encontrou: com `a = null` e `b = 'manual'` ambos
     valem 1, então o null PERMANECE. Quem acumula linha a linha precisa semear com a
     primeira linha em vez de comparar contra null — ver `useLancamentosConciliados`. */
  it('null contra manual mantém o null: quem acumula tem de semear', () => {
    expect(tipoMaisForte(null, 'manual')).toBeNull();
    expect(tipoMaisForte(null, 'ofx_cru')).toBe('ofx_cru');
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
