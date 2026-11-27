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
 *   R9 a aba Funcionários: coluna opcional só entra se o Nome mantém o lugar dele (FOLHA-REGUA-01; só pela largura, nunca pelo dado)
 *   R10 FOLHA-REGUA-01: a vigência repetida da atuação aparece uma vez; o "O que falta" curto; os botões das pendências sem "…"; os próximos pagamentos
 */
import { describe, expect, it } from 'vitest';
import {
  acoesDaPendencia, aAtualizarDepois, avisoDoVencimento, chipsQueCabem, contagemDoFiltroTipo, doFiltroTipo, fichaDoBanco, filtrarFuncionarios,
  FORM_VAZIO, formDoCadastro, fraseDaPreviaLigar, listaDoBanco, pedidoDoFuncionario, pendenciasDoBanco, problemaDaAtuacao, rotuloSituacao,
  type FuncionarioDaLista,
} from './folhaTela';
import { colunasParaALargura, NOME_MINIMO } from '@/components/folha/AbaFuncionarios';
import { vigenciasDaAtuacao } from './admissao';
import { faltaCurta } from './folhaMes';

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
  it('FOLHA-REGUA-01: nenhuma coluna opcional enquanto o Nome não tem o lugar dele; elas entram por ordem (Vínculo, A atualizar, Registro)', () => {
    const fixas = ['nome', 'cargo', 'fazenda', 'admissao', 'salario', 'situacao'];
    /* 1126 com a ficha: 608px de tabela — só as fixas, e o Nome fica com o NOME_MINIMO ou mais */
    expect(colunasParaALargura(608).map(c => c.coluna)).toEqual(fixas);
    expect(608 - colunasParaALargura(608).reduce((s, c) => s + (c.largura ?? 0), 0)).toBeGreaterThanOrEqual(NOME_MINIMO);
    /* 1280: 762px — entra o Vínculo; o "A atualizar" (150) ainda não cabe sem tirar o lugar do Nome */
    expect(colunasParaALargura(762).map(c => c.coluna)).toEqual(['nome', 'cargo', 'vinculo', 'fazenda', 'admissao', 'salario', 'situacao']);
    expect(colunasParaALargura(906).map(c => c.coluna)).toEqual(['nome', 'cargo', 'vinculo', 'fazenda', 'admissao', 'salario', 'situacao', 'a_atualizar']);
    for (const l of [608, 700, 762, 906, 1100, 1400]) {
      expect(l - 16 - colunasParaALargura(l).reduce((s, c) => s + (c.largura ?? 0), 0)).toBeGreaterThanOrEqual(NOME_MINIMO);
    }
    expect(colunasParaALargura(1400)).toHaveLength(9);
    expect(colunasParaALargura(0)).toHaveLength(9);
  });
});

describe('R10 FOLHA-REGUA-01', () => {
  const a = (desde: string, fazenda_id: string, atividade: string, pct: number) => ({ desde, fazenda_id, fazenda: fazenda_id, atividade, pct });
  it('a vigência que repete a anterior não aparece de novo (vale a data da mais antiga); a que muda aparece', () => {
    /* o caso do proto: a carga (01/07) e a tela (28/07) gravaram a MESMA atuação */
    expect(vigenciasDaAtuacao([a('2026-07-28', 'z1', 'pecuaria', 100), a('2026-07-01', 'z1', 'pecuaria', 100)]))
      .toEqual([{ desde: '2026-07-01', itens: [a('2026-07-01', 'z1', 'pecuaria', 100)] }]);
    /* troca de fazenda no meio, e a volta igual a uma ANTERIOR não-vizinha continua aparecendo */
    const v = vigenciasDaAtuacao([a('2026-01-01', 'z1', 'pecuaria', 100), a('2026-05-01', 'z2', 'pecuaria', 60), a('2026-05-01', 'z1', 'agricultura', 40),
      a('2026-08-01', 'z2', 'pecuaria', 60), a('2026-08-01', 'z1', 'agricultura', 40), a('2026-10-01', 'z1', 'pecuaria', 100)]);
    expect(v.map(x => x.desde)).toEqual(['2026-10-01', '2026-05-01', '2026-01-01']);
    expect(v[1].itens.map(i => i.pct)).toEqual([60, 40]);
    expect(vigenciasDaAtuacao([])).toEqual([]);
  });
  it('o "O que falta" em palavra curta; o "ligar" fica de fora (é o botão)', () => {
    expect(faltaCurta(['ligar', 'recibo', 'pagamento', 'vinculo'])).toBe('recibo · pagar · vínculo');
    expect(faltaCurta(['lancamento', 'recibo'])).toBe('previsto · recibo');
    expect(faltaCurta(['ligar'])).toBe('');
    expect(faltaCurta(['novo'])).toBe('novo');
  });
  it('nenhum botão de pendência termina em "…"', () => {
    const base = { favorecido_id: 'f', favorecido: 'F', n: 3, total: 1, desde: null, ate: null, ids: [], tem_rescisao: false, lancamento_id: null, descricao: null,
      valor: null, data: null, funcionario_id: null, funcionario: null, documento_id: null, especie: null, nome: null, vencimento: null, dias: null, chave: 'k' };
    const sug = { funcionario_id: 'x', funcionario: 'X' };
    const tipos = ['favorecido_sem_funcionario', 'rescisao_a_conferir', 'sugestao_descricao', 'sem_recibo', 'documento_vence'] as const;
    const rotulos = tipos.flatMap(tipo => [null, sug].flatMap(sugestao => acoesDaPendencia({ ...base, tipo, sugestao }).map(x => x.rotulo)));
    expect(rotulos.length).toBeGreaterThan(15);
    expect(rotulos.filter(r => r.endsWith('…'))).toEqual([]);
    expect(rotulos).toContain('É de alguém');
  });
  it('a ficha lê os próximos pagamentos; o banco sem a chave nova (antes do lote) dá lista vazia', () => {
    const u = { lancamento_id: 'l1', descricao: 'Folha', valor: '10', status: 'previsto', data: '2026-12-05', competencia: '2026-12' };
    expect(fichaDoBanco({ funcionario: { id: 'x', nome: 'B' }, proximos_pagamentos: [u] })?.proximos_pagamentos).toEqual([{ ...u, valor: 10 }]);
    expect(fichaDoBanco({ funcionario: { id: 'x', nome: 'B' } })?.proximos_pagamentos).toEqual([]);
  });
});
