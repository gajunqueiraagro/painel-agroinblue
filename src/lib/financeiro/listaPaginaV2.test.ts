/**
 * FIN-V2-DESEMPENHO-01b — a lista de Lançamentos Financeiros paginada no servidor.
 * (1) os filtros crus da tela no formato da RPC (sentinelas "Todos" somem; "Sem safra"/"Sem cultura" e o `conciliado_real` vão
 *     como estão — quem os entende é o banco);
 * (2) o leitor da resposta: peça torta = nulo (nunca "0 lançamentos"), conciliados pela marca da RPC;
 * (3) as frases e as reservas do rodapé (o texto de agora nunca é mais largo que a reserva);
 * (4) a ligação na tela, lida da fonte: a grade é a página, a lista inteira não é mais lida, os totais são do servidor, o rodapé mora
 *     dentro do quadro e a faixa dos totais não tem altura fixa.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  filtrosDaPaginaV2, ordemDaPaginaV2, lerPaginaV2, intervaloDaPaginaV2, paginasDaListaV2, reservasDaPaginaV2,
  lerPorPaginaV2, guardarPorPaginaV2, porPaginaV2DoTexto, textoDoPorPaginaV2, type FiltrosDaTelaV2,
} from './listaPaginaV2';

const VAZIO: FiltrosDaTelaV2 = {
  fazendaId: '__all__', anos: ['2026'], meses: [], dimensao: 'financeira', tipoOperacao: '__all__', status: [], contaOrigem: '__all__',
  contaDestino: '__all__', macro: '__all__', grupo: '__all__', centro: '__all__', subcentro: '__all__', safra: '__all__', cultura: '__all__',
  atividade: '__all__', produto: '', documento: '', fornecedor: '__all__', modoSemCaixa: 'ocultar',
};

describe('os filtros da tela no formato da RPC', () => {
  it('"Todos" e campo vazio não vão; ano e mês viram inteiros', () => {
    expect(filtrosDaPaginaV2(VAZIO)).toEqual({ dimensao: 'financeira', modo_sem_caixa: 'ocultar', anos: [2026] });
    expect(filtrosDaPaginaV2({ ...VAZIO, meses: ['09', '10'], produto: '   ' })).toEqual({ dimensao: 'financeira', modo_sem_caixa: 'ocultar', anos: [2026], meses: [9, 10] });
  });
  it('cada filtro no seu nome; sentinelas e status derivado vão crus (o banco os entende)', () => {
    const f = filtrosDaPaginaV2({
      ...VAZIO, fazendaId: 'faz', tipoOperacao: '2-Saídas', status: ['realizado', 'conciliado_real'], contaOrigem: 'c1', contaDestino: 'c2',
      macro: 'M', grupo: 'G', centro: 'C', subcentro: 'S', safra: '__sem_safra__', cultura: '__sem_cultura__', atividade: 'pecuaria',
      produto: 'Sal', documento: '518', fornecedor: 'forn', modoSemCaixa: 'so_dre', dimensao: 'competencia',
    });
    expect(f).toEqual({
      dimensao: 'competencia', modo_sem_caixa: 'so_dre', fazenda_id: 'faz', tipo_operacao: '2-Saídas', conta_origem: 'c1', conta_destino: 'c2',
      macro: 'M', grupo: 'G', centro: 'C', subcentro: 'S', safra: '__sem_safra__', cultura: '__sem_cultura__', atividade: 'pecuaria',
      fornecedor_id: 'forn', produto: 'Sal', documento: '518', anos: [2026], status: ['realizado', 'conciliado_real'],
    });
  });
  it('a ordem leva o nível da classificação', () => {
    expect(ordemDaPaginaV2('centro', 'desc', 'subcentro')).toEqual({ campo: 'centro', dir: 'desc', nivel: 'subcentro' });
  });
});

const RESPOSTA = {
  versao: 'fin-v2-lista-01a', pagina: 0, por_pagina: 200, total_linhas: 2,
  linhas: [{ id: 'a', cliente_id: 'c', valor: 10, conciliado: true }, { id: 'b', cliente_id: 'c', valor: 5, conciliado: false }],
  totais: { entradas: 10, saidas: 5, transferencias: 0, entradas_sem_caixa: 1, saidas_sem_caixa: 2 },
  sem_caixa: { linhas: 3, total: -7.5 },
};

describe('o leitor da resposta', () => {
  it('lê página, total, totais e os conciliados', () => {
    const p = lerPaginaV2(RESPOSTA);
    expect(p?.total).toBe(2);
    expect(p?.linhas.map((l) => l.id)).toEqual(['a', 'b']);
    expect([...(p?.conciliados ?? [])]).toEqual(['a']);
    expect(p?.totais).toEqual({ entradas: 10, saidas: 5, transferencias: 0, entradasSemCaixa: 1, saidasSemCaixa: 2 });
    expect(p?.semCaixa).toEqual({ linhas: 3, total: -7.5 });
  });
  it('peça torta = nulo inteiro (nunca zeros inventados)', () => {
    expect(lerPaginaV2(null)).toBeNull();
    expect(lerPaginaV2([])).toBeNull();
    expect(lerPaginaV2({ ...RESPOSTA, total_linhas: '2' })).toBeNull();
    expect(lerPaginaV2({ ...RESPOSTA, totais: { ...RESPOSTA.totais, saidas: null } })).toBeNull();
    expect(lerPaginaV2({ ...RESPOSTA, sem_caixa: undefined })).toBeNull();
    expect(lerPaginaV2({ ...RESPOSTA, linhas: [{ id: 'a' }] })).toBeNull();
  });
});

describe('o rodapé da página', () => {
  it('intervalo, contagem de páginas e o vazio', () => {
    expect(intervaloDaPaginaV2(5303, 0, 200)).toBe('Mostrando 1–200 de 5.303');
    expect(intervaloDaPaginaV2(5303, 26, 200)).toBe('Mostrando 5.201–5.303 de 5.303');
    expect(intervaloDaPaginaV2(0, 0, 200)).toBe('Nenhum lançamento');
    expect(paginasDaListaV2(5303, 200)).toBe(27);
    expect(paginasDaListaV2(0, 50)).toBe(1);
  });
  it('a reserva tem pelo menos o comprimento de qualquer texto possível', () => {
    const r = reservasDaPaginaV2(99999);
    for (const [t, p, por] of [[99999, 0, 50], [99999, 1999, 50], [12345, 61, 200], [7, 0, 100]] as const) {
      expect(r.intervalo.length).toBeGreaterThanOrEqual(intervaloDaPaginaV2(t, p, por).length);
      expect(r.pagina.length).toBeGreaterThanOrEqual(`Página ${(p + 1).toLocaleString('pt-BR')} de ${paginasDaListaV2(t, por).toLocaleString('pt-BR')}`.length);
    }
  });
  describe('o "por página" lembrado', () => {
    /* um armazenamento de mentira (o jsdom deste ambiente não traz `localStorage`) */
    beforeEach(() => {
      const m = new Map<string, string>();
      Object.defineProperty(window, 'localStorage', { configurable: true, value: {
        getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, clear: () => m.clear() } });
    });
    it('padrão 200; guarda 50 e 100; valor estranho volta ao padrão', () => {
      expect(lerPorPaginaV2(null)).toBe(200);
      guardarPorPaginaV2(null, 50); expect(lerPorPaginaV2(null)).toBe(50);
      guardarPorPaginaV2(null, 100); expect(lerPorPaginaV2(null)).toBe(100);
      window.localStorage.setItem('fin-v2-lista-por-pagina:sem-usuario', '37'); expect(lerPorPaginaV2(null)).toBe(200);
      expect(porPaginaV2DoTexto(textoDoPorPaginaV2(50))).toBe(50);
    });
  });
});

describe('a ligação na tela (lida da fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
  it('a grade é a página do servidor; a lista inteira não é mais lida', () => {
    expect(tela).toContain('const listaV2 = useListaPaginaV2(clienteAtual?.id, { filtros: filtrosV2, ordem: ordemV2, pagina: paginaV2, porPagina },');
    expect(tela).toContain("const linhasDaGrade = useMemo(() => (LISTA_V2 ? hook.listaPagina : (paginaDaLista?.linhas ?? [])), [LISTA_V2, hook.listaPagina, paginaDaLista]);");
    expect(tela).not.toContain('hook.loadLancamentos(');
    expect(tela).not.toContain('const sortedLancamentos');
    expect(tela).toContain('const totalLancamentosFiltrados = paginaDaLista?.total ?? 0;');
    expect(tela).toContain('const totais = paginaDaLista?.totais ?? TOTAIS_VAZIOS;');
  });
  it('trocar filtro, ordem ou "por página" volta à primeira; a seleção é da página', () => {
    expect(tela).toContain('const chaveDoRecorte = JSON.stringify([filtrosV2, ordemV2, porPagina]);');
    expect(tela).toContain('useEffect(() => { setPaginaV2(0); }, [chaveDoRecorte]);');
    expect(tela).toContain('useEffect(() => { setSelectedIds(new Set()); }, [paginaV2, porPagina]);');
    expect(tela).toContain('const selectedLancamentos = useMemo(() => linhasDaGrade.filter(l => selectedIds.has(l.id)), [linhasDaGrade, selectedIds]);');
  });
  it('o rodapé da página mora DENTRO do quadro, depois do scrollport', () => {
    const quadro = tela.indexOf('data-testid="quadro-lancamentos"');
    const rolagem = tela.indexOf('<div ref={scrollContainerRef}', quadro);
    const rodape = tela.indexOf('data-testid="rodape-lancamentos"', rolagem);
    expect(quadro).toBeGreaterThan(0);
    expect(rolagem).toBeGreaterThan(quadro);
    expect(rodape).toBeGreaterThan(rolagem);
    for (const t of ['intervalo-lancamentos', 'pagina-lancamentos']) expect(tela).toContain(`testid="${t}"`);
    for (const t of ['pagina-anterior', 'pagina-proxima']) expect(tela).toContain(`data-testid="${t}"`);
    expect(tela).not.toContain('encontrado{totalLancamentosFiltrados');
  });
  it('a faixa dos totais cresce com o conteúdo (nunca altura fixa com quebra) e os totais têm largura reservada', () => {
    expect(tela).toContain('<div className="flex min-h-6 shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-1 py-0.5 text-[10px] tabular-nums" data-testid="faixa-totais">');
    expect(tela).not.toContain('<div className="flex h-6 shrink-0 flex-wrap');
    expect(tela).toContain("Entradas: <TextoReservado reserva={RESERVA_TOTAL} texto={paginaDaLista ? formatMoeda(totalEntradas) : '—'} />");
  });
  it('enquanto o mapa dos vínculos não chega, a pílula "Conciliado" sai da marca da página', () => {
    expect(tela).toContain('const temVinculo = vinculosProntos ? !!vinculo : !!paginaDaLista?.conciliados.has(l.id);');
  });
});
