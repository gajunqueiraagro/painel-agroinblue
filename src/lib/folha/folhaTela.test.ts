/**
 * FOLHA-01 · PR B (telas) — as regras da tela, com dado SINTÉTICO (nunca nome, CPF ou salário real):
 *   R1 os leitores do jsonb: o que não é do tipo vira nulo/vazio; tipo de pendência desconhecido fica FORA (nunca vira outro)
 *   R2 os filtros (D2: "A confirmar" é filtro) e a busca por nome (sem acento) ou pelos dígitos do CPF
 *   R3 os chips "a atualizar" que cabem inteiros em 142px e o "+N"
 *   R4 o aviso do vencimento: ≤ 30 âmbar, < 0 vermelho, longe/sem vencimento nada
 *   R5 o filtro do Histórico pelo `tipo` do banco (Salário leva Adiantamento; Rescisão leva a multa) e a contagem
 *   R6 o pedido do gravador: o registro INTEIRO, com o `recorrencia_origem_id` que veio; o "a atualizar" perde o que foi preenchido
 *   R7 a atuação soma 100 (a recusa do banco dita antes)
 *   R8 as ações de cada pendência e a frase da prévia do ligar
 *   R9 a aba Funcionários abaixo de 1000px tira Registro e Atuação (só pela largura, nunca pelo dado)
 */
import { describe, expect, it } from 'vitest';
import {
  acoesDaPendencia, aAtualizarDepois, avisoDoVencimento, chipsQueCabem, contagemDoFiltroTipo, doFiltroTipo, fichaDoBanco, filtrarFuncionarios,
  FORM_VAZIO, formDoCadastro, fraseDaPreviaLigar, listaDoBanco, pedidoDoFuncionario, pendenciasDoBanco, problemaDaAtuacao, rotuloSituacao,
  type FuncionarioDaLista,
} from './folhaTela';
import { colunasParaALargura } from '@/components/folha/AbaFuncionarios';

const func = (p: Partial<FuncionarioDaLista>): FuncionarioDaLista => ({
  id: 'f1', nome: 'Antônio Exemplo', cpf: null, cargo: null, vinculo: 'clt', empregador_registro: null, codigo_contador: null, admissao: null,
  situacao: 'ativo', desligamento: null, a_atualizar: [], a_confirmar: false, favorecido_id: null, favorecido: null, salario: null, salario_desde: null,
  atuacao: [], lancamentos: 0, ultimo_pagamento: null, documentos: 0, documentos_vencendo: 0, ...p,
});

describe('R1 os leitores do jsonb', () => {
  it('a lista: número em texto vira número; lixo vira nulo; a contagem vem do banco', () => {
    const l = listaDoBanco({ funcionarios: [{ id: 'a', nome: 'Ana Teste', salario: '2430.5', a_atualizar: ['cpf', 7], atuacao: [{ fazenda: 'Sede', pct: 100 }], situacao: 'xyz' }, 'lixo'],
      contagem: { ativos: 1, desligados: 0, a_confirmar: 1, todos: 1 } });
    expect(l.funcionarios).toHaveLength(1);
    expect(l.funcionarios[0]).toMatchObject({ salario: 2430.5, a_atualizar: ['cpf'], situacao: 'ativo', cargo: null });
    expect(l.funcionarios[0].atuacao[0]).toEqual({ fazenda_id: null, fazenda: 'Sede', atividade: null, pct: 100 });
    expect(l.contagem).toEqual({ ativos: 1, desligados: 0, a_confirmar: 1, todos: 1 });
    expect(listaDoBanco(null)).toEqual({ funcionarios: [], contagem: { ativos: 0, desligados: 0, a_confirmar: 0, todos: 0 } });
  });
  it('a ficha sem funcionário é nula; com ele, lê o recorrencia_origem_id', () => {
    expect(fichaDoBanco({ pagamento: null })).toBeNull();
    const f = fichaDoBanco({ funcionario: { id: 'x', nome: 'B', recorrencia_origem_id: 'rec-1', a_atualizar: ['salario'] }, documentos: [{ id: 'd', dias: '-3' }] });
    expect(f?.funcionario.recorrencia_origem_id).toBe('rec-1');
    expect(f?.documentos[0].dias).toBe(-3);
    expect(f?.pagamento).toBeNull();
  });
  it('pendência de tipo que a tela não conhece fica fora', () => {
    const p = pendenciasDoBanco({ itens: [{ tipo: 'novo_tipo', chave: 'k1' }, { tipo: 'sem_recibo', chave: 'recibo:1', valor: 10 }], descartadas: 2 });
    expect(p.itens.map(i => i.tipo)).toEqual(['sem_recibo']);
    expect(p.descartadas).toBe(2);
  });
});

describe('R2 os filtros da aba Funcionários', () => {
  const lista = [
    func({ id: 'a', nome: 'José Exemplo', cpf: '12345678901' }),
    func({ id: 'b', nome: 'Maria Teste', situacao: 'desligado', desligamento: '2026-10-30', a_confirmar: true }),
    func({ id: 'c', nome: 'Pedro Modelo', situacao: 'afastado', a_confirmar: true }),
  ];
  it('Ativos = tudo menos desligado; Desligados; A confirmar; Todos', () => {
    expect(filtrarFuncionarios(lista, 'ativos', '').map(f => f.id)).toEqual(['a', 'c']);
    expect(filtrarFuncionarios(lista, 'desligados', '').map(f => f.id)).toEqual(['b']);
    expect(filtrarFuncionarios(lista, 'a_confirmar', '').map(f => f.id)).toEqual(['b', 'c']);
    expect(filtrarFuncionarios(lista, 'todos', '').map(f => f.id)).toEqual(['a', 'b', 'c']);
  });
  it('a busca ignora acento e caixa; pelo CPF, só com 3 dígitos ou mais (formatado ou não)', () => {
    expect(filtrarFuncionarios(lista, 'todos', 'jose').map(f => f.id)).toEqual(['a']);
    expect(filtrarFuncionarios(lista, 'todos', '456.789').map(f => f.id)).toEqual(['a']);
    expect(filtrarFuncionarios(lista, 'todos', '12').map(f => f.id)).toEqual([]);
  });
  it('a situação do desligado leva a data dd/mm/aaaa', () => {
    expect(rotuloSituacao({ situacao: 'desligado', desligamento: '2026-10-30' })).toBe('Desligado 30/10/2026');
    expect(rotuloSituacao({ situacao: 'ativo', desligamento: null })).toBe('Ativo');
  });
});

describe('R3 os chips "a atualizar" (uma linha, 142px)', () => {
  it('cabem todos: nenhum "+N"', () => {
    expect(chipsQueCabem(['CPF', 'cargo'], 142)).toEqual({ vistos: ['CPF', 'cargo'], escondidos: 0 });
  });
  it('não cabem: os que cabem INTEIROS com o "+N" reservado', () => {
    const r = chipsQueCabem(['salário', 'admissão', 'cargo', 'CPF', 'desligamento'], 142);
    expect(r.vistos.length + r.escondidos).toBe(5);
    expect(r.escondidos).toBeGreaterThan(0);
    expect(r.vistos).toEqual(['salário', 'admissão']);
  });
});

describe('R4 o aviso do vencimento do documento', () => {
  it('≤ 30 dias âmbar; 0 = vence hoje; < 0 vermelho; > 30 ou sem vencimento = nada', () => {
    expect(avisoDoVencimento(12)).toEqual({ tom: 'ambar', texto: 'vence em 12 dias' });
    expect(avisoDoVencimento(30)).toEqual({ tom: 'ambar', texto: 'vence em 30 dias' });
    expect(avisoDoVencimento(31)).toBeNull();
    expect(avisoDoVencimento(0)).toEqual({ tom: 'ambar', texto: 'vence hoje' });
    expect(avisoDoVencimento(-1)).toEqual({ tom: 'vermelho', texto: 'vencido há 1 dia' });
    expect(avisoDoVencimento(null)).toBeNull();
  });
});

describe('R5 o filtro do Histórico pelo tipo do banco', () => {
  it('Salário leva o Adiantamento; Rescisão leva a multa; Outro só em Tudo', () => {
    expect(doFiltroTipo('Adiantamento', 'salario')).toBe(true);
    expect(doFiltroTipo('Multa rescisória', 'rescisao')).toBe(true);
    expect(doFiltroTipo('Outro', 'beneficios')).toBe(false);
    expect(doFiltroTipo('Outro', 'tudo')).toBe(true);
  });
  it('a contagem de cada botão soma os tipos dele (o `por_tipo` do banco)', () => {
    const pt = { Salário: 271, Adiantamento: 11, Rescisão: 23, Benefício: 20, Outro: 13 };
    expect(contagemDoFiltroTipo(pt, 'salario')).toBe(282);
    expect(contagemDoFiltroTipo(pt, 'tudo')).toBe(338);
    expect(contagemDoFiltroTipo(pt, '13')).toBe(0);
  });
});

describe('R6 o pedido do gravador do funcionário', () => {
  const antes = fichaDoBanco({ funcionario: { id: 'f9', nome: 'Carla Modelo', vinculo: 'domestico', recorrencia_origem_id: 'rec-7', a_atualizar: ['cpf', 'salario', 'cargo'], pis: '12345678901' } });
  it('edição: leva o id e o recorrencia_origem_id de antes (o gravador apagaria)', () => {
    if (!antes) throw new Error('sem ficha');
    const pedido = pedidoDoFuncionario(formDoCadastro(antes.funcionario), antes.funcionario);
    expect(pedido).toMatchObject({ id: 'f9', recorrencia_origem_id: 'rec-7', nome: 'Carla Modelo', vinculo: 'domestico', pis: '12345678901' });
  });
  it('novo: sem id nem recorrência; CPF só dígitos; vazio vira nulo', () => {
    const pedido = pedidoDoFuncionario({ ...FORM_VAZIO, nome: ' Novo Teste ', cpf: '123.456.789-01' }, null);
    expect(pedido).not.toHaveProperty('id');
    expect(pedido).not.toHaveProperty('recorrencia_origem_id');
    expect(pedido).toMatchObject({ nome: 'Novo Teste', cpf: '12345678901', cargo: null, admissao: null, vinculo: 'clt' });
  });
  it('o "a atualizar" perde a marca do que foi preenchido e mantém o resto', () => {
    expect(aAtualizarDepois(['cpf', 'salario', 'cargo'], { ...FORM_VAZIO, cpf: '12345678901', cargo: '' })).toEqual(['salario', 'cargo']);
  });
});

describe('R7 a atuação', () => {
  it('soma 100 com fazenda, atividade e % em cada linha', () => {
    expect(problemaDaAtuacao([{ fazenda_id: 'a', atividade: 'pecuaria', pct: 60 }, { fazenda_id: 'b', atividade: 'agricultura', pct: 40 }])).toBeNull();
    expect(problemaDaAtuacao([{ fazenda_id: 'a', atividade: 'pecuaria', pct: 60 }])).toBe('A atuação soma 60% (tem de dar 100%).');
    expect(problemaDaAtuacao([{ fazenda_id: '', atividade: 'pecuaria', pct: 100 }])).toBe('Cada linha precisa de fazenda, atividade e %.');
    expect(problemaDaAtuacao([])).toBe('Inclua ao menos uma fazenda.');
  });
});

describe('R8 as pendências', () => {
  const base = pendenciasDoBanco({ itens: [
    { tipo: 'favorecido_sem_funcionario', chave: 'fav:1', n: 35, ids: ['l1', 'l2'], sugestao: { funcionario_id: 'f1', funcionario: 'João Exemplo' } },
    { tipo: 'favorecido_sem_funcionario', chave: 'fav:2', n: 3, ids: ['l3'] },
    { tipo: 'rescisao_a_conferir', chave: 'fav:3', n: 4, ids: ['l4'] },
    { tipo: 'sem_recibo', chave: 'recibo:1', lancamento_id: 'l5', funcionario_id: 'f2' },
  ] }).itens;
  it('com sugestão: "É o mesmo · ligar N" primeiro; sem: "Cadastrar"; rescisão: desligado primeiro', () => {
    expect(acoesDaPendencia(base[0]).map(a => a.acao)).toEqual(['ligar_sugestao', 'cadastrar', 'descartar', 'outro']);
    expect(acoesDaPendencia(base[0])[0].rotulo).toBe('É o mesmo · ligar 35');
    expect(acoesDaPendencia(base[1])[0].acao).toBe('cadastrar');
    expect(acoesDaPendencia(base[2]).map(a => a.acao).slice(0, 2)).toEqual(['cadastrar_desligado', 'cadastrar']);
    expect(acoesDaPendencia(base[3]).map(a => a.acao)).toEqual(['recibo', 'descartar']);
  });
  it('a frase da prévia do ligar', () => {
    expect(fraseDaPreviaLigar({ lancamentos: 35, mudam: 35, funcionario: 'João Exemplo' })).toBe('Liga 35 lançamentos a João Exemplo.');
    expect(fraseDaPreviaLigar({ lancamentos: 3, mudam: 1, funcionario: 'João Exemplo' })).toBe('Liga 1 lançamento a João Exemplo (2 já estavam).');
    expect(fraseDaPreviaLigar({ lancamentos: 2, mudam: 0, funcionario: 'João Exemplo' })).toBe('Nenhum dos 2 muda: já estão com João Exemplo.');
  });
});

describe('R9 as colunas da aba Funcionários pela largura', () => {
  it('abaixo de 1000px saem Registro e Atuação; de 1000 em diante, as 9 do contrato; sem medida (0), as 9', () => {
    expect(colunasParaALargura(800).map(c => c.coluna)).toEqual(['nome', 'cargo', 'vinculo', 'admissao', 'salario', 'situacao', 'a_atualizar']);
    /* gate 24/11: a 1126 com a ficha (tabela ~610px) o Nome ficava com 22px — abaixo de 760 sai também o "A atualizar" */
    expect(colunasParaALargura(756).map(c => c.coluna)).toEqual(['nome', 'cargo', 'vinculo', 'admissao', 'salario', 'situacao']);
    expect(colunasParaALargura(610).reduce((s, c) => s + (c.largura ?? 0), 0)).toBeLessThanOrEqual(610 - 140);
    expect(colunasParaALargura(1000)).toHaveLength(9);
    expect(colunasParaALargura(0)).toHaveLength(9);
  });
});
