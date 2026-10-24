/**
 * P94 — o MOMENTO da conferência. Cadastros SINTÉTICOS.
 *   H1 carregando (pronto nulo): nada se confere — o filtro restaurado fica · H2 carregou: o id inexistente volta ao padrão com o aviso
 *   H3 confere uma vez só (re-render não repete) · H4 trocou de cliente: `pedir` + o pronto do novo cliente confere de novo
 *   H5 tudo existe: `aplicar` nem é chamado
 * Mutação: tirar a chamada de `conferirFiltrosDaLista` (aplicar nunca chamado) derruba H2 e H4.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConferenciaDosFiltros } from './useConferenciaDosFiltros';
import { TODOS, fraseDoRemovido, type FiltrosDeCadastro, type OpcoesDoCliente } from '@/lib/financeiro/conferirFiltrosDaLista';

const PADRAO: FiltrosDeCadastro = {
  fazendaId: TODOS, contaOrigem: TODOS, contaDestino: TODOS, macroFiltro: TODOS, grupoFiltro: TODOS, centroFiltro: TODOS,
  subcentroFiltro: TODOS, fornecedorFiltro: TODOS, safraFiltro: TODOS, culturaFiltro: TODOS, atividadeFiltro: TODOS,
};
const OPCOES: OpcoesDoCliente = { fazendas: ['faz-a'], contas: ['elo'], plano: [], fornecedores: [{ id: 'f-a', nome: 'Agro Sintetica' }], safras: [], culturas: [], atividades: [] };

type P = Parameters<typeof useConferenciaDosFiltros>[0];
function montar(inicial: Omit<P, 'aplicar'>) {
  const aplicar = vi.fn();
  const r = renderHook((p: Omit<P, 'aplicar'>) => useConferenciaDosFiltros({ ...p, aplicar }), { initialProps: inicial });
  return { aplicar, ...r };
}

describe('P94 — useConferenciaDosFiltros', () => {
  it('H1/H2 só confere depois que as opções do cliente carregaram; o inexistente volta ao padrão com o aviso', () => {
    const filtros = { ...PADRAO, contaOrigem: 'elo', fornecedorFiltro: 'forn-do-nj' };
    const { aplicar, rerender } = montar({ pronto: null, filtros, opcoes: { ...OPCOES, fornecedores: [] } });
    expect(aplicar).not.toHaveBeenCalled();
    rerender({ pronto: 'cli-a', filtros, opcoes: OPCOES });
    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(aplicar).toHaveBeenCalledWith({ trocas: { fornecedorFiltro: TODOS }, avisos: [fraseDoRemovido('fornecedorFiltro')] });
  });
  it('H3 uma vez só: outro render com o mesmo cliente não confere de novo', () => {
    const filtros = { ...PADRAO, fazendaId: 'faz-do-nj' };
    const { aplicar, rerender } = montar({ pronto: 'cli-a', filtros, opcoes: OPCOES });
    rerender({ pronto: 'cli-a', filtros: { ...filtros }, opcoes: OPCOES });
    expect(aplicar).toHaveBeenCalledTimes(1);
  });
  it('H4 trocou de cliente: pede, e confere com as opções do NOVO cliente quando elas chegam', () => {
    const { aplicar, rerender, result } = montar({ pronto: 'cli-a', filtros: PADRAO, opcoes: OPCOES });
    expect(aplicar).not.toHaveBeenCalled();
    result.current.pedir();
    rerender({ pronto: null, filtros: { ...PADRAO, fazendaId: 'faz-a' }, opcoes: OPCOES });
    expect(aplicar).not.toHaveBeenCalled();
    rerender({ pronto: 'cli-b', filtros: { ...PADRAO, fazendaId: 'faz-a' }, opcoes: { ...OPCOES, fazendas: ['faz-b'] } });
    expect(aplicar).toHaveBeenCalledWith({ trocas: { fazendaId: TODOS }, avisos: [fraseDoRemovido('fazendaId')] });
  });
  it('H5 tudo existe: nada a aplicar', () => {
    const { aplicar } = montar({ pronto: 'cli-a', filtros: { ...PADRAO, fazendaId: 'faz-a', fornecedorFiltro: 'f-a' }, opcoes: OPCOES });
    expect(aplicar).not.toHaveBeenCalled();
  });
});
