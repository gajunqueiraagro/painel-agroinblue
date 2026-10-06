/**
 * CONC-SEM-CLASSIFICACAO-01 — o leitor da lista, o filtro, a ordem e o FORM do gesto.
 * As linhas do fixture têm a forma que `fn_conciliacao_sem_classificacao_lista` devolve (NJ set/26, lida do proto em
 * 06/10/2026; ids e textos trocados por sintéticos).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClassificacaoItem, LancamentoV2 } from '@/hooks/useFinanceiroV2';
import {
  ORDEM_PADRAO, contasDoPlano, filtrarLinhas, formDoLancamento, formParaClassificar, historicoDaLinha, lerDreSemClassificacao,
  lerListaSemClassificacao, motivoNaoGrava, ordenarLinhas, origemDaSugestao, proximaOrdem,
} from './semClassificacao';

const linha = (x: Record<string, unknown>) => ({
  id: 'l1', data: '2026-09-02', conta_id: 'c1', conta_nome: 'Itau BBA', historico_banco: 'TED RECEBIDA 001', descricao: 'TED RECEBIDA 001',
  tipo_operacao: '1-Entradas', valor: 500000, favorecido_id: null, favorecido_nome: null, subcentro_texto: null,
  falta: { subcentro: true, fornecedor: true, centro: true }, aguarda_conta: false, sugestao: null, ...x,
});
const RESUMO = { qtde: 3, valor_entradas: 500000, valor_saidas: 833.5, com_sugestao: 1, sem_sugestao: 2, aguarda_conta: 1 };
const DADO = {
  resumo: RESUMO,
  linhas: [
    linha({}),
    linha({ id: 'l2', data: '2026-09-16', tipo_operacao: '2-Saídas', valor: '233.50', favorecido_id: 'f1', favorecido_nome: 'Zeta Ltda',
      historico_banco: null, descricao: 'COMPRA DEBITO', falta: { subcentro: true, fornecedor: false, centro: true },
      sugestao: { plano_conta_id: 'p9', subcentro: 'Combustível', centro_custo: 'Máquinas', origem: 'alias', regra_id: null, alias_id: 'a1' } }),
    linha({ id: 'l3', data: '2026-09-08', tipo_operacao: '2-Saídas', valor: 600, favorecido_id: 'f2', favorecido_nome: 'Alfa',
      subcentro_texto: 'Dividendos Dependentes', falta: { subcentro: true, fornecedor: false, centro: false }, aguarda_conta: true }),
  ],
};

describe('o leitor da lista — sem cast, e meio retorno é nenhum', () => {
  it('lê resumo e linhas; numeric em texto vira número; sem histórico do banco cai na descrição', () => {
    const l = lerListaSemClassificacao(DADO);
    expect(l?.resumo).toEqual({ qtde: 3, valorEntradas: 500000, valorSaidas: 833.5, comSugestao: 1, semSugestao: 2, aguardaConta: 1 });
    expect(l?.linhas.map((x) => [x.id, x.valor, x.falta.fornecedor, x.aguardaConta])).toEqual([['l1', 500000, true, false], ['l2', 233.5, false, false], ['l3', 600, false, true]]);
    expect(l?.linhas[1].sugestao).toEqual({ planoContaId: 'p9', subcentro: 'Combustível', centroCusto: 'Máquinas', origem: 'alias' });
    expect(historicoDaLinha(l!.linhas[0])).toBe('TED RECEBIDA 001');
    expect(historicoDaLinha(l!.linhas[1])).toBe('COMPRA DEBITO');
  });

  it('retorno torto devolve NULO inteiro (a tela diz que não leu), nunca uma lista pela metade', () => {
    expect(lerListaSemClassificacao(null)).toBeNull();
    expect(lerListaSemClassificacao({ resumo: RESUMO })).toBeNull();
    expect(lerListaSemClassificacao({ resumo: { ...RESUMO, qtde: undefined }, linhas: [] })).toBeNull();
    expect(lerListaSemClassificacao({ resumo: RESUMO, linhas: [linha({ valor: 'x' })] })).toBeNull();
    expect(lerListaSemClassificacao({ resumo: RESUMO, linhas: [linha({ id: null })] })).toBeNull();
    expect(lerListaSemClassificacao({ resumo: { ...RESUMO, qtde: 0 }, linhas: [] })?.linhas).toEqual([]);
  });

  it('o DRE: {qtde, valor_entradas, valor_saidas}; zero é zero, ausente é nulo', () => {
    expect(lerDreSemClassificacao({ qtde: 137, valor_entradas: 761379.7, valor_saidas: '246434.49' })).toEqual({ qtde: 137, valorEntradas: 761379.7, valorSaidas: 246434.49 });
    expect(lerDreSemClassificacao({ qtde: 0, valor_entradas: 0, valor_saidas: 0 })).toEqual({ qtde: 0, valorEntradas: 0, valorSaidas: 0 });
    expect(lerDreSemClassificacao({ qtde: 1 })).toBeNull();
    expect(lerDreSemClassificacao(undefined)).toBeNull();
  });
});

describe('filtro e ordem — só o recorte e a ordem do que o banco devolveu', () => {
  const linhas = lerListaSemClassificacao(DADO)!.linhas;
  it('Todos · Com sugestão · Sem sugestão', () => {
    expect(filtrarLinhas(linhas, 'todos').map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(filtrarLinhas(linhas, 'com_sugestao').map((l) => l.id)).toEqual(['l2']);
    expect(filtrarLinhas(linhas, 'sem_sugestao').map((l) => l.id)).toEqual(['l1', 'l3']);
  });
  it('o padrão é valor do maior para o menor; toda coluna ordena; não muda a lista recebida', () => {
    expect(ORDEM_PADRAO).toEqual({ coluna: 'valor', sentido: 'desc' });
    expect(ordenarLinhas(linhas, ORDEM_PADRAO).map((l) => l.id)).toEqual(['l1', 'l3', 'l2']);
    expect(ordenarLinhas(linhas, { coluna: 'valor', sentido: 'asc' }).map((l) => l.id)).toEqual(['l2', 'l3', 'l1']);
    expect(ordenarLinhas(linhas, { coluna: 'data', sentido: 'asc' }).map((l) => l.id)).toEqual(['l1', 'l3', 'l2']);
    expect(ordenarLinhas(linhas, { coluna: 'fornecedor', sentido: 'asc' }).map((l) => l.id)).toEqual(['l1', 'l3', 'l2']);
    expect(ordenarLinhas(linhas, { coluna: 'subcentro', sentido: 'desc' }).map((l) => l.id)).toEqual(['l3', 'l2', 'l1']);
    expect(ordenarLinhas(linhas, { coluna: 'falta', sentido: 'desc' }).map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(ordenarLinhas(linhas, { coluna: 'historico', sentido: 'asc' }).map((l) => l.id)).toEqual(['l2', 'l1', 'l3']);
    expect(linhas.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
  });
  it('clicar na mesma coluna inverte; coluna nova de número começa do maior, de texto de A a Z', () => {
    expect(proximaOrdem(ORDEM_PADRAO, 'valor')).toEqual({ coluna: 'valor', sentido: 'asc' });
    expect(proximaOrdem(ORDEM_PADRAO, 'data')).toEqual({ coluna: 'data', sentido: 'desc' });
    expect(proximaOrdem(ORDEM_PADRAO, 'fornecedor')).toEqual({ coluna: 'fornecedor', sentido: 'asc' });
  });
});

describe('subcentro só oferece conta do plano', () => {
  const item = (x: Partial<ClassificacaoItem>): ClassificacaoItem => ({
    subcentro: 'X', centro_custo: 'C', grupo_custo: 'G', macro_custo: 'M', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria', ...x,
  });
  it('fora: os Dividendos sintetizados (id dividendo-<uuid>) e as combinações legadas (sem id)', () => {
    const lista = [item({ id: 'p1', subcentro: 'Combustível' }), item({ id: 'dividendo-abc', subcentro: 'Dividendos Dependentes' }), item({ subcentro: 'Legado' }), item({ id: '', subcentro: 'Vazio' })];
    expect(contasDoPlano(lista).map((c) => c.subcentro)).toEqual(['Combustível']);
  });
  it('o motivo de não gravar: sem conta, conta que não é do plano, conta de outro tipo; com tudo certo, nulo', () => {
    expect(motivoNaoGrava({ conta: null, favorecidoId: null }, '2-Saídas')).toBe('escolha o subcentro');
    expect(motivoNaoGrava({ conta: item({}), favorecidoId: null }, '2-Saídas')).toBe('esta conta não é do plano');
    expect(motivoNaoGrava({ conta: item({ id: 'p1', tipo_operacao: '1-Entradas' }), favorecidoId: null }, '2-Saídas')).toBe('conta de outro tipo (entrada × saída)');
    expect(motivoNaoGrava({ conta: item({ id: 'p1' }), favorecidoId: null }, '2-Saídas')).toBeNull();
  });
  it('a origem da sugestão vai por extenso; a desconhecida, como veio', () => {
    expect(origemDaSugestao('alias')).toBe('sugestão: apelido do subcentro');
    expect(origemDaSugestao('regra')).toBe('sugestão: regra de classificação');
    expect(origemDaSugestao('motor_novo')).toBe('sugestão: motor_novo');
  });
});

describe('o FORM do gesto — o lançamento inteiro, e só a classificação muda', () => {
  const FIX: { lancamento: LancamentoV2 } = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/semClassificacao.fixture.json'), 'utf8'));
  const l = FIX.lancamento;
  const conta: ClassificacaoItem = { id: 'p9', subcentro: 'Combustível', centro_custo: 'Máquinas', grupo_custo: 'Custeio', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' };

  it('o form de ANTES (o do desfazer) devolve cada coluna que o escritor regrava ao valor do lançamento, com a chave NULA', () => {
    const f = formDoLancamento(l);
    expect(f).toEqual({
      fazenda_id: l.fazenda_id, conta_bancaria_id: l.conta_bancaria_id, conta_destino_id: l.conta_destino_id,
      data_competencia: l.data_competencia, data_pagamento: l.data_pagamento, data_vencimento: l.data_vencimento,
      valor: l.valor, tipo_operacao: l.tipo_operacao, status_transacao: 'realizado', descricao: l.descricao,
      macro_custo: 'Dividendos', grupo_custo: undefined, centro_custo: 'Dividendos', subcentro: 'Dividendos Dependentes',
      escopo_negocio: undefined, plano_conta_id: null, observacao: 'obs do operador', numero_documento: 'NF 123',
      tipo_documento: 'Nota Fiscal', favorecido_id: l.favorecido_id, forma_pagamento: 'PIX', dados_pagamento: null, safra_id: 's1',
    });
    /* cultura e fase NÃO viajam: `undefined` faz o UPDATE omitir a coluna (ela fica como está) */
    expect('cultura' in f).toBe(false);
    expect('fase' in f).toBe(false);
  });

  it('classificar troca SÓ a chave, as cópias dela e (se escolhido) o fornecedor; o resto é o lançamento', () => {
    const f = formParaClassificar(l, { conta, favorecidoId: 'f-novo' })!;
    const antes = formDoLancamento(l);
    const mudou = (Object.keys(antes) as Array<keyof typeof antes>).filter((k) => f[k] !== antes[k]);
    expect(mudou.sort()).toEqual(['centro_custo', 'escopo_negocio', 'favorecido_id', 'grupo_custo', 'macro_custo', 'plano_conta_id', 'subcentro']);
    expect([f.plano_conta_id, f.subcentro, f.centro_custo, f.grupo_custo, f.macro_custo, f.escopo_negocio, f.favorecido_id])
      .toEqual(['p9', 'Combustível', 'Máquinas', 'Custeio', 'Custeio Produtivo', 'pecuaria', 'f-novo']);
  });

  it('sem fornecedor escolhido o do lançamento FICA (o gesto nunca apaga fornecedor); sem conta do plano não há form', () => {
    expect(formParaClassificar(l, { conta, favorecidoId: null })?.favorecido_id).toBe(l.favorecido_id);
    expect(formParaClassificar(l, { conta: null, favorecidoId: 'f' })).toBeNull();
    expect(formParaClassificar(l, { conta: { ...conta, id: undefined }, favorecidoId: 'f' })).toBeNull();
  });
});
