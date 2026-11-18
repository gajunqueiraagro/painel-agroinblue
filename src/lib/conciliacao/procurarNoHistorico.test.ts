
describe('CONC-CRIAR-COM-NOTA-02 (homologação Edson 11:40, D3) — o Procurar ordena também por NF, Δ valor, Δ dias e Motivo', () => {
  it('as colunas da tela ordenam pelo valor que a linha mostra (o `extra`); sem ele, a ordem de chegada', async () => {
    const { ordenarAchados } = await import('./procurarNoHistorico');
    const base = { lancamentoId: 'x', dataPagamento: null, dataVencimento: '2031-10-10', dataCompetencia: '2031-10-01', status: 'programado', conciliado: false,
      banco: null, descricao: 'd', fornecedorId: null, fornecedor: 'f', planoContaId: null, centro: null, subcentro: null, fazendaId: null, fazenda: null,
      fazendaCodigo: null, contaBancariaId: null, conta: null, valor: -1, onde: [] };
    const lista = [{ ...base, lancamentoId: 'a' }, { ...base, lancamentoId: 'b' }, { ...base, lancamentoId: 'c' }];
    const nf: Record<string, number> = { a: 402, b: 288, c: 405 };
    const ids = (o: 'asc' | 'desc') => ordenarAchados(lista, { coluna: 'nf', sentido: o }, (a) => nf[a.lancamentoId]).map((a) => a.lancamentoId);
    expect(ids('asc')).toEqual(['b', 'a', 'c']);
    expect(ids('desc')).toEqual(['c', 'a', 'b']);
    expect(ordenarAchados(lista, { coluna: 'motivo', sentido: 'asc' }).map((a) => a.lancamentoId)).toEqual(['a', 'b', 'c']);
  });
});
