/**
 * P94 — a conferência dos filtros restaurados (PURO). Cadastros SINTÉTICOS.
 *   C1 tudo existe: nada muda · C2 id de outro cliente volta ao padrão, com a frase · C3 o mesclado vira o destino (cadeia de 2 saltos)
 *   C4 o inativo fica · C5 o plano confere pelo nome em qualquer nível · C6 as sentinelas ("Sem safra", "Sem cultura") e o padrão valem
 *   C7 cadeia quebrada (o destino não está no cadastro) = removido
 */
import { describe, it, expect } from 'vitest';
import { TODOS, camposForaDasOpcoes, conferirFiltrosDaLista, fraseDoMesclado, fraseDoRemovido, type FiltrosDeCadastro, type OpcoesDoCliente } from './conferirFiltrosDaLista';

const PADRAO: FiltrosDeCadastro = {
  fazendaId: TODOS, contaOrigem: TODOS, contaDestino: TODOS, macroFiltro: TODOS, grupoFiltro: TODOS, centroFiltro: TODOS,
  subcentroFiltro: TODOS, fornecedorFiltro: TODOS, safraFiltro: TODOS, culturaFiltro: TODOS, atividadeFiltro: TODOS,
};
const OPCOES: OpcoesDoCliente = {
  fazendas: ['faz-a'], contas: ['elo', 'bb'],
  plano: [{ macro_custo: 'Custeio Produtivo', grupo_custo: 'Insumos', centro_custo: 'Nutrição', subcentro: 'Sal mineral' }],
  fornecedores: [
    { id: 'f-ativo', nome: 'Agro Sintetica' }, { id: 'f-inativo', nome: 'Loja Parada Sintetica' },
    { id: 'f-velho', nome: 'Posto Antigo Sintetico', fundido_em_id: 'f-meio' }, { id: 'f-meio', nome: 'Posto Meio Sintetico', fundido_em_id: 'f-dono' },
    { id: 'f-dono', nome: 'Posto Dono Sintetico' }, { id: 'f-orfao', nome: 'Orfao Sintetico', fundido_em_id: 'nao-carregado' },
  ],
  safras: ['s-pec'], culturas: ['mandioca'], atividades: ['pecuaria'], sentinelas: ['__sem_safra__', '__sem_cultura__'],
};

describe('P94 — conferirFiltrosDaLista', () => {
  it('C1 tudo existe: nenhuma troca, nenhum aviso', () => {
    const f = { ...PADRAO, fazendaId: 'faz-a', contaOrigem: 'elo', fornecedorFiltro: 'f-ativo', safraFiltro: 's-pec', culturaFiltro: 'mandioca', atividadeFiltro: 'pecuaria' };
    expect(conferirFiltrosDaLista(f, OPCOES)).toEqual({ trocas: {}, avisos: [] });
  });
  it('C2 o id de outro cliente volta ao padrão e diz o campo', () => {
    const r = conferirFiltrosDaLista({ ...PADRAO, fazendaId: 'faz-do-nj', contaOrigem: 'elo', fornecedorFiltro: 'forn-do-nj' }, OPCOES);
    expect(r.trocas).toEqual({ fazendaId: TODOS, fornecedorFiltro: TODOS });
    expect(r.avisos).toEqual([fraseDoRemovido('fazendaId'), fraseDoRemovido('fornecedorFiltro')]);
    expect(r.avisos[0]).toBe('Filtro de Fazenda guardado não existe neste cliente — removido.');
  });
  it('C3 o mesclado vira o destino da mescla (fim da cadeia), com a frase', () => {
    const r = conferirFiltrosDaLista({ ...PADRAO, fornecedorFiltro: 'f-velho' }, OPCOES);
    expect(r.trocas).toEqual({ fornecedorFiltro: 'f-dono' });
    expect(r.avisos).toEqual([fraseDoMesclado('Posto Antigo Sintetico', 'Posto Dono Sintetico')]);
    expect(r.avisos[0]).toBe('Fornecedor Posto Antigo Sintetico foi mesclado em Posto Dono Sintetico — filtrando por Posto Dono Sintetico.');
  });
  it('C4 o inativo existe: fica', () => {
    expect(conferirFiltrosDaLista({ ...PADRAO, fornecedorFiltro: 'f-inativo' }, OPCOES).trocas).toEqual({});
  });
  it('C5 o plano confere cada nível pelo nome', () => {
    const r = conferirFiltrosDaLista({ ...PADRAO, macroFiltro: 'Custeio Produtivo', grupoFiltro: 'Grupo do NJ', centroFiltro: 'Nutrição', subcentroFiltro: 'Subcentro do NJ' }, OPCOES);
    expect(r.trocas).toEqual({ grupoFiltro: TODOS, subcentroFiltro: TODOS });
  });
  it('C6 o padrão e as sentinelas nunca são "inexistentes"', () => {
    expect(camposForaDasOpcoes({ ...PADRAO, safraFiltro: '__sem_safra__', culturaFiltro: '__sem_cultura__' }, OPCOES)).toEqual([]);
  });
  it('C7 mesclado com a cadeia quebrada: removido (não há destino a usar)', () => {
    const r = conferirFiltrosDaLista({ ...PADRAO, fornecedorFiltro: 'f-orfao' }, OPCOES);
    expect(r).toEqual({ trocas: { fornecedorFiltro: TODOS }, avisos: [fraseDoRemovido('fornecedorFiltro')] });
  });
});
