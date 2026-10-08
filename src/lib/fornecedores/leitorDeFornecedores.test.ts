/**
 * FORN-SELETOR-PADRAO-01 passo 1a — o leitor único de fornecedores por cliente (parte pura).
 * Fornecedores SINTÉTICOS: nenhum dado de cliente real.
 */
import { describe, it, expect } from 'vitest';
import {
  criarLeitorDeFornecedores, lerTodosOsAtivos, type FonteDeFornecedores, type FornecedorLido,
} from '@/lib/fornecedores/leitorDeFornecedores';

const forn = (id: string, extra: Partial<FornecedorLido> = {}): FornecedorLido => ({
  id, nome: `Fornecedor ${id}`, cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null, pix_tipo_chave: null,
  pix_chave: null, banco: null, agencia: null, conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null,
  observacao_pagamento: null, ...extra,
});
const varios = (prefixo: string, n: number) => Array.from({ length: n }, (_v, i) => forn(`${prefixo}${String(i).padStart(5, '0')}`));

/** Um banco de mentira: por cliente, todos os cadastros (ativos e inativos). Conta as idas. */
function banco(dados: Record<string, FornecedorLido[]>, opcoes: { semTotal?: boolean } = {}) {
  const idas = { paginas: [] as string[], porId: [] as string[] };
  let falhar: string | null = null;
  const fonte: FonteDeFornecedores = {
    lerPagina: async (clienteId, de, ate, contar) => {
      idas.paginas.push(`${clienteId}:${de}-${ate}`);
      if (falhar) throw new Error(falhar);
      const ativos = (dados[clienteId] ?? []).filter((f) => f.ativo).sort((a, b) => a.nome.localeCompare(b.nome) || a.id.localeCompare(b.id));
      return { linhas: ativos.slice(de, ate + 1), total: contar && !opcoes.semTotal ? ativos.length : null };
    },
    lerPorId: async (clienteId, id) => {
      idas.porId.push(`${clienteId}:${id}`);
      if (falhar) throw new Error(falhar);
      return (dados[clienteId] ?? []).find((f) => f.id === id) ?? null;
    },
  };
  return { fonte, idas, dados, falharCom: (m: string | null) => { falhar = m; } };
}

describe('paginação até o fim', () => {
  it('2.594 ativos com página de 1.000: três idas, nenhuma linha perdida nem repetida (o corte em 1.000 não acontece)', async () => {
    const b = banco({ X: varios('a', 2594) });
    const lista = await lerTodosOsAtivos(b.fonte, 'X', 1000);
    expect(lista).toHaveLength(2594);
    expect(new Set(lista.map((f) => f.id)).size).toBe(2594);
    expect(b.idas.paginas).toEqual(['X:0-999', 'X:1000-1999', 'X:2000-2999']);
  });
  it('exatamente 1.000 e exatamente 2.000: nem página a menos, nem ida inútil', async () => {
    const mil = banco({ X: varios('a', 1000) });
    expect(await lerTodosOsAtivos(mil.fonte, 'X', 1000)).toHaveLength(1000);
    expect(mil.idas.paginas).toHaveLength(1);
    const dois = banco({ X: varios('a', 2000) });
    expect(await lerTodosOsAtivos(dois.fonte, 'X', 1000)).toHaveLength(2000);
    expect(dois.idas.paginas).toHaveLength(2);
  });
  it('SEM o total o leitor não adivinha: vai em série até a página curta e traz todos', async () => {
    const b = banco({ X: varios('a', 2594) }, { semTotal: true });
    expect(await lerTodosOsAtivos(b.fonte, 'X', 1000)).toHaveLength(2594);
    expect(b.idas.paginas).toEqual(['X:0-999', 'X:1000-1999', 'X:2000-2999']);
  });
  it('cliente sem fornecedor: lista vazia, uma ida', async () => {
    const b = banco({});
    expect(await lerTodosOsAtivos(b.fonte, 'X')).toEqual([]);
    expect(b.idas.paginas).toHaveLength(1);
  });
});

describe('só ativos; o gravado inativo vem por id', () => {
  const dados = { X: [forn('a1'), forn('a2'), forn('i1', { ativo: false, nome: 'Inativo sintético' })] };
  it('a lista só tem ativos (a busca prova que o inativo existe no banco)', async () => {
    const b = banco(dados);
    const leitor = criarLeitorDeFornecedores(b.fonte);
    expect(dados.X.some((f) => !f.ativo)).toBe(true);
    expect((await leitor.ler('X')).map((f) => f.id)).toEqual(['a1', 'a2']);
  });
  it('o gravado inativo é lido por id, com `ativo` falso, e uma vez só', async () => {
    const b = banco(dados);
    const leitor = criarLeitorDeFornecedores(b.fonte);
    await leitor.ler('X');
    const f = await leitor.lerPorId('X', 'i1');
    expect(f?.nome).toBe('Inativo sintético');
    expect(f?.ativo).toBe(false);
    await leitor.lerPorId('X', 'i1');
    expect(b.idas.porId).toEqual(['X:i1']);
  });
  it('o gravado que ESTÁ entre os ativos sai da lista em cache, sem ida ao banco', async () => {
    const b = banco(dados);
    const leitor = criarLeitorDeFornecedores(b.fonte);
    await leitor.ler('X');
    expect((await leitor.lerPorId('X', 'a2'))?.id).toBe('a2');
    expect(b.idas.porId).toEqual([]);
  });
  it('id de OUTRO cliente não é achado (a fonte recebe o cliente de quem pede)', async () => {
    const b = banco({ X: [forn('a1')], Y: [forn('y1')] });
    const leitor = criarLeitorDeFornecedores(b.fonte);
    expect(await leitor.lerPorId('X', 'y1')).toBeNull();
    expect(b.idas.porId).toEqual(['X:y1']);
  });
});

describe('cache por cliente', () => {
  it('a segunda leitura do mesmo cliente não vai ao banco; leituras simultâneas são UMA ida', async () => {
    const b = banco({ X: varios('a', 3) });
    const leitor = criarLeitorDeFornecedores(b.fonte);
    const [p, q] = await Promise.all([leitor.ler('X'), leitor.ler('X')]);
    expect(p).toBe(q);
    await leitor.ler('X');
    expect(b.idas.paginas).toHaveLength(1);
  });
  it('NÃO VAZA entre clientes: cada um tem a sua lista, e o cache de um nunca responde pelo outro', async () => {
    const b = banco({ X: [forn('x1'), forn('x2')], Y: [forn('y1')] });
    const leitor = criarLeitorDeFornecedores(b.fonte);
    expect(leitor.doCache('Y')).toBeNull();
    const x = await leitor.ler('X');
    expect(leitor.doCache('Y')).toBeNull();          /* X lido não põe nada em Y */
    const y = await leitor.ler('Y');
    expect(x.map((f) => f.id)).toEqual(['x1', 'x2']);
    expect(y.map((f) => f.id)).toEqual(['y1']);
    expect(leitor.doCache('X')?.some((f) => f.id === 'y1')).toBe(false);
    expect(leitor.doCache('Y')?.some((f) => f.id.startsWith('x'))).toBe(false);
  });
  it('a falha NÃO fica em cache: a leitura seguinte tenta de novo e traz a lista', async () => {
    const b = banco({ X: [forn('a1')] });
    const leitor = criarLeitorDeFornecedores(b.fonte);
    b.falharCom('rede fora');
    await expect(leitor.ler('X')).rejects.toThrow('rede fora');
    expect(leitor.doCache('X')).toBeNull();
    b.falharCom(null);
    expect(await leitor.ler('X')).toHaveLength(1);
  });
});

describe('releitura quando o cadastro muda', () => {
  it('o aviso esvazia o cache DAQUELE cliente, chama quem ouve, e a leitura seguinte vê o cadastro novo', async () => {
    const b = banco({ X: [forn('a1')], Y: [forn('y1')] });
    const leitor = criarLeitorDeFornecedores(b.fonte);
    await leitor.ler('X'); await leitor.ler('Y');
    let ouviuX = 0; let ouviuY = 0;
    const sair = leitor.inscrever('X', () => { ouviuX += 1; });
    leitor.inscrever('Y', () => { ouviuY += 1; });
    b.dados.X.push(forn('a2'));                       /* criado */
    b.dados.X[0] = { ...b.dados.X[0], ativo: false }; /* inativado */
    leitor.notificarMudou('X');
    expect([ouviuX, ouviuY]).toEqual([1, 0]);
    expect(leitor.doCache('X')).toBeNull();
    expect(leitor.doCache('Y')).not.toBeNull();       /* o de Y fica */
    expect((await leitor.ler('X')).map((f) => f.id)).toEqual(['a2']);
    sair();
    leitor.notificarMudou('X');
    expect(ouviuX).toBe(1);                           /* quem saiu não ouve mais */
  });
  it('o gravado lido por id também é esquecido no aviso (o inativo reativado volta a valer)', async () => {
    const b = banco({ X: [forn('i1', { ativo: false })] });
    const leitor = criarLeitorDeFornecedores(b.fonte);
    expect((await leitor.lerPorId('X', 'i1'))?.ativo).toBe(false);
    b.dados.X[0] = { ...b.dados.X[0], ativo: true };
    leitor.notificarMudou('X');
    expect((await leitor.lerPorId('X', 'i1'))?.ativo).toBe(true);
  });
  it('aviso NO MEIO de uma leitura: a resposta velha não entra no cache — quem pediu recebe a lista nova', async () => {
    const dados = { X: [forn('a1')] };
    let soltar: () => void = () => {};
    let primeira = true;
    const fonte: FonteDeFornecedores = {
      lerPagina: async (c, de, ate, contar) => {
        const foto = dados.X.filter((f) => f.ativo);
        if (primeira) { primeira = false; await new Promise<void>((r) => { soltar = r; }); }
        return { linhas: foto.slice(de, ate + 1), total: contar ? foto.length : null };
      },
      lerPorId: async () => null,
    };
    const leitor = criarLeitorDeFornecedores(fonte);
    const lendo = leitor.ler('X');
    dados.X.push(forn('a2'));
    leitor.notificarMudou('X');
    soltar();
    expect((await lendo).map((f) => f.id)).toEqual(['a1', 'a2']);
    expect(leitor.doCache('X')?.map((f) => f.id)).toEqual(['a1', 'a2']);
  });
});
