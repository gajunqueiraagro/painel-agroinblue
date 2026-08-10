/**
 * PR-FIN-LISTA-VENCIMENTO-03 · 2C-4 — V1..V5, V10..V12 sobre a máquina pura.
 *
 * O que dá para provar sem DOM fica aqui: a regra de rascunho × aplicado, a
 * volta à página 1, o contador de sem-vencimento e a derivação da paginação.
 * V6..V9 e V13 vivem no teste de wiring; V14 é medido no navegador.
 */
import { describe, it, expect } from 'vitest';
import {
  reduzirLista,
  ESTADO_INICIAL,
  FILTROS_LIMPOS,
  temPendencias,
  saoEquivalentes,
  calcularPaginacao,
  rotuloPaginacao,
  avisoSemVencimento,
  type EstadoLista,
} from './estadoFiltrosLista';
import { TODOS } from './listaPaginadaV2';

describe('V1 — editar mexe SÓ no rascunho, e não consulta', () => {
  it('o aplicado não se move quando o rascunho muda', () => {
    const e = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'produto', valor: 'racao' });
    expect(e.rascunho.produto).toBe('racao');
    expect(e.aplicado.produto).toBe('');
    expect(e.aplicado).toEqual(ESTADO_INICIAL.aplicado);
  });

  it('várias edições seguidas continuam sem tocar o aplicado', () => {
    let e = ESTADO_INICIAL;
    for (const v of ['r', 'ra', 'rac', 'raca', 'racao']) {
      e = reduzirLista(e, { tipo: 'editar', campo: 'produto', valor: v });
    }
    expect(e.rascunho.produto).toBe('racao');
    expect(e.aplicado).toBe(ESTADO_INICIAL.aplicado);   // mesma referência: não mudou
  });

  it('editar não mexe na página', () => {
    const naPagina3 = reduzirLista(ESTADO_INICIAL, { tipo: 'pagina', pagina: 3 });
    const e = reduzirLista(naPagina3, { tipo: 'editar', campo: 'documento', valor: '123' });
    expect(e.pagina).toBe(3);
  });

  it('o reducer nunca muta o estado recebido', () => {
    const antes = JSON.stringify(ESTADO_INICIAL);
    reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'produto', valor: 'x' });
    expect(JSON.stringify(ESTADO_INICIAL)).toBe(antes);
  });
});

describe('V2 — Aplicar copia rascunho para aplicado', () => {
  it('depois de aplicar, os dois são iguais', () => {
    let e = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'produto', valor: 'milho' });
    e = reduzirLista(e, { tipo: 'editar', campo: 'atividade', valor: 'outros' });
    e = reduzirLista(e, { tipo: 'aplicar' });
    expect(e.aplicado.produto).toBe('milho');
    expect(e.aplicado.atividade).toBe('outros');
    expect(temPendencias(e)).toBe(false);
  });
});

describe('V3 — Aplicar volta à página 1', () => {
  it('estando na página 8', () => {
    let e = reduzirLista(ESTADO_INICIAL, { tipo: 'pagina', pagina: 7 });
    e = reduzirLista(e, { tipo: 'editar', campo: 'produto', valor: 'x' });
    expect(e.pagina).toBe(7);
    e = reduzirLista(e, { tipo: 'aplicar' });
    expect(e.pagina).toBe(0);
  });
});

describe('V4 — aviso de pendência', () => {
  it('aparece quando divergem, some quando coincidem', () => {
    const editado = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'produto', valor: 'x' });
    expect(temPendencias(editado)).toBe(true);
    expect(temPendencias(reduzirLista(editado, { tipo: 'aplicar' }))).toBe(false);
    expect(temPendencias(ESTADO_INICIAL)).toBe(false);
  });

  it('voltar o campo ao valor original apaga a pendência', () => {
    let e = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'produto', valor: 'x' });
    e = reduzirLista(e, { tipo: 'editar', campo: 'produto', valor: '' });
    expect(temPendencias(e)).toBe(false);
  });

  it("'', undefined e a sentinela __all__ são o mesmo 'sem filtro'", () => {
    expect(saoEquivalentes({ produto: '' }, { produto: undefined })).toBe(true);
    expect(saoEquivalentes({ atividade: TODOS }, { atividade: '' })).toBe(true);
    expect(saoEquivalentes({ produto: '  ' }, { produto: '' })).toBe(true);
    expect(saoEquivalentes({ produto: 'a' }, { produto: 'b' })).toBe(false);
  });

  it('a opção sem-vencimento também gera pendência', () => {
    const e = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'incluirSemVencimento', valor: true });
    expect(temPendencias(e)).toBe(true);
  });
});

describe('V5 — Limpar zera os dois e volta à página 1', () => {
  it('rascunho, aplicado e página', () => {
    let e: EstadoLista = ESTADO_INICIAL;
    e = reduzirLista(e, { tipo: 'editar', campo: 'produto', valor: 'x' });
    e = reduzirLista(e, { tipo: 'aplicar' });
    e = reduzirLista(e, { tipo: 'pagina', pagina: 4 });
    e = reduzirLista(e, { tipo: 'editar', campo: 'documento', valor: 'y' });

    const limpo = reduzirLista(e, { tipo: 'limpar' });
    expect(limpo.rascunho).toEqual(FILTROS_LIMPOS);
    expect(limpo.aplicado).toEqual(FILTROS_LIMPOS);
    expect(limpo.pagina).toBe(0);
    expect(temPendencias(limpo)).toBe(false);   // e o aviso some
  });
});

describe('paginação derivada do count do servidor', () => {
  it('87 registros em páginas de 30', () => {
    const p = calcularPaginacao(87, 0, 30);
    expect(p).toMatchObject({ pagina: 0, totalPaginas: 3, primeira: true, ultima: false, vazio: false, de: 1, ate: 30 });
    expect(calcularPaginacao(87, 2, 30)).toMatchObject({ ultima: true, de: 61, ate: 87 });
  });

  it('exatamente 30 é uma página só', () => {
    expect(calcularPaginacao(30, 0, 30)).toMatchObject({ totalPaginas: 1, primeira: true, ultima: true, ate: 30 });
  });

  it('31 abre a segunda página, com uma linha', () => {
    expect(calcularPaginacao(31, 1, 30)).toMatchObject({ totalPaginas: 2, de: 31, ate: 31, ultima: true });
  });

  it('vazio não vira "0 a 0 de 0"', () => {
    const p = calcularPaginacao(0, 0, 30);
    expect(p).toMatchObject({ vazio: true, totalPaginas: 1, primeira: true, ultima: true });
    expect(rotuloPaginacao(p, 0)).toBe('Nenhum lançamento');
  });

  it('count encolheu: a página passa a ser a última existente', () => {
    // estava na página 8; o filtro novo devolve 40 registros → só 2 páginas
    expect(calcularPaginacao(40, 7, 30).pagina).toBe(1);
  });

  it('página negativa é tratada', () => {
    expect(calcularPaginacao(87, -3, 30).pagina).toBe(0);
  });

  it('o rótulo conta o conjunto inteiro, não os 30 visíveis', () => {
    expect(rotuloPaginacao(calcularPaginacao(29407, 1, 30), 29407)).toBe('31–60 de 29407');
  });
});

describe('V10/V11/V12 — sem vencimento', () => {
  it('V10 com período e excluídos, o contador aparece com o número certo', () => {
    expect(avisoSemVencimento(1, false)).toBe('1 lançamento sem vencimento fora do período');
    expect(avisoSemVencimento(7, false)).toBe('7 lançamentos sem vencimento fora do período');
  });

  it('sem excluídos, NÃO mostra contador enganoso', () => {
    expect(avisoSemVencimento(0, false)).toBeNull();
    expect(avisoSemVencimento(-1, false)).toBeNull();
    expect(avisoSemVencimento(Number.NaN, false)).toBeNull();
  });

  it('V11 incluindo, o contador de excluídos some', () => {
    expect(avisoSemVencimento(7, true)).toBeNull();
  });

  it('V11 ligar a opção fica pendente até aplicar', () => {
    const e = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'incluirSemVencimento', valor: true });
    expect(e.rascunho.incluirSemVencimento).toBe(true);
    expect(e.aplicado.incluirSemVencimento).toBe(false);   // a lista ainda não mudou
    expect(temPendencias(e)).toBe(true);

    const aplicado = reduzirLista(e, { tipo: 'aplicar' });
    expect(aplicado.aplicado.incluirSemVencimento).toBe(true);
    expect(aplicado.pagina).toBe(0);
  });

  it('V12 sem período, a opção é irrelevante e não há excluídos a anunciar', () => {
    // Sem período o servidor não corta nada: excluídos = 0 → sem contador.
    expect(avisoSemVencimento(0, false)).toBeNull();
  });
});
