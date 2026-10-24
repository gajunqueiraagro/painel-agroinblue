/**
 * P94 — FIN-V2-FILTRO-FANTASMA-01: a ligação na tela de Lançamentos, lida da FONTE (a tela inteira não se monta em teste; a regra e o
 * momento são testados de verdade em `conferirFiltrosDaLista.test.ts` e `useConferenciaDosFiltros.test.ts`).
 *   L1 as três memórias levam o cliente (filtros ativos, instantâneo da OC, volta do financiamento); nenhuma leitura sem cliente
 *   L2 trocar de cliente com a tela aberta: padrão, busca esquecida, memória DO NOVO, conferência pedida
 *   L3 as limpezas "fora da lista" (plano, safra) esperam os cadastros do cliente — nunca contra a lista vazia ainda carregando
 *   L4 a conferência roda com as opções do cliente e aplica pelos setters; o aviso vai à faixa dos totais, em lugar reservado
 *   L5 o caminho Visão Geral → lista (PR 5/5b) continua pulando a memória
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
const trecho = (de: string, ate: string) => { const i = tela.indexOf(de); expect(i).toBeGreaterThan(-1); return tela.slice(i, tela.indexOf(ate, i)); };

describe('P94 — a lista de Lançamentos não filtra o que não mostra', () => {
  it('L1 as três memórias são do cliente', () => {
    expect(tela).toContain('lerFiltros(cli)');
    expect(tela).toContain('guardarFiltros(cli, apenasAtivos(');
    expect(tela).toContain('esquecerFiltros(clienteAtual.id)');
    expect(tela).toContain('sessionStorage.getItem(chaveRetornoOC(cli))');
    expect(tela).toContain('sessionStorage.setItem(chaveRetornoOC(clienteAtual.id)');
    expect(tela).toContain('chaveDoCliente(CHAVE_ESTADO_FIN, clienteAtual.id)');
    expect(tela).not.toMatch(/lerFiltros\(\)|esquecerFiltros\(\)|getItem\(CHAVE_RETORNO_OC\)|getItem\('financeiro_v2_state'\)/);
  });
  it('L2 trocar de cliente volta ao padrão, esquece a busca, aplica a memória do NOVO e pede a conferência', () => {
    const efeito = trecho('const clienteDaTelaRef = useRef(clienteAtual?.id);', '}, [clienteAtual?.id]);');
    const ordem = ['voltarAoPadrao();', "setFazendaId('__all__');", 'limparBuscasLembradas(PREFIXO_BUSCA);', 'const memoria = cli ? lerFiltros(cli) : null;',
      'aplicarFiltrosGuardados(memoria, false);', 'conferencia.pedir();'].map((t) => efeito.indexOf(t));
    expect(ordem.every((i) => i > -1)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });
  it('L3 as limpezas do plano e da safra esperam os cadastros do cliente', () => {
    expect(tela.match(/if \(!cadastrosProntos\) return;/g)).toHaveLength(5);
    expect(tela).toContain('const cadastrosProntos = !!clienteAtual?.id && hook.cadastrosDoCliente === clienteAtual.id;');
  });
  it('L4 a conferência: opções do cliente, os setters, o aviso no lugar reservado da faixa', () => {
    expect(tela).toContain('useConferenciaDosFiltros({ pronto: prontoParaConferir, filtros: filtrosDeCadastro, opcoes: opcoesDoCliente, aplicar: aplicarConferencia })');
    const aplicar = trecho('const aplicarConferencia = (c: Conferencia) => {', '  };');
    for (const s of ['setFazendaId', 'setContaOrigem', 'setContaDestino', 'setMacroFiltro', 'setGrupoFiltro', 'setCentroFiltro', 'setSubcentroFiltro',
      'setFornecedorFiltro', 'setSafraFiltro', 'setCulturaFiltro', 'setAtividadeFiltro', 'setAvisosDoFiltro(c.avisos)']) expect(aplicar).toContain(s);
    const faixa = trecho('data-testid="faixa-totais"', 'data-testid="controles-da-lista"');
    expect(faixa).toContain('data-testid="avisos-do-filtro" data-desloca');
    expect(faixa).toContain('data-desloca-livre');
  });
  it('L5 Visão Geral → lista: com o drill, a memória não entra', () => {
    expect(trecho('// ── Restauração de filtros ao voltar de FinanciamentoDetalhe ──', '}, []);'))
      .toContain('if (drillFilters) return; /* PR 5 — com o drill, a memória não entra');
  });
});
