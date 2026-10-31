import { describe, expect, it } from 'vitest';
import { ordenarPorColuna } from '@/hooks/useOrdenacaoTabela';
import {
  abasDoBem, chipsDeCategoria, COLUNAS_ORDENAVEIS, custoPorPasto, dataBR, filtrarBens, fraseDoErro, mesBR, n2, NOME_CURTO_CATEGORIA, nomeCurtoDaCategoria, rotuloOrigem,
  rotuloSemDepreciacao, rotuloVida, totaisDaLista, type BemDaLista, type CategoriaBem,
} from './patrimonio';

const bem = (p: Partial<BemDaLista>): BemDaLista => ({
  bem_id: 'b', fazenda_id: 'f', fazenda_codigo: 'PUR', categoria_id: 'c', categoria_codigo: 'maquinas', categoria_nome: 'Máquinas',
  deprecia: true, tem_mercado: true, tem_pastos: false, descricao: 'Trator', marca: null, modelo: null, identificacao: null,
  situacao: 'em_uso', em_uso_desde: '2022-03-01', baixado_em: null, atividade: 'pecuaria', origem_valor: 'lancamentos',
  valor_extra: 0, valor_lancamentos: 388400, aquisicao: 388400, a_realizar: 0, n_lancamentos: 2, n_a_realizar: 0, n_a_conferir: 0,
  n_selo: 0, n_repetidas: 0, primeira_data: '2022-03-10', vida_util_meses: 120, residual_pct: 20, depreciacao_acumulada: 145002.67,
  depreciacao_no_ano: 25893.3, valor_contabil: 243397.33, mercado_valor: null, mercado_data: null, mercado_base: null,
  area_pastos_ha: null, versao: 1, ...p,
});

describe('formatos', () => {
  it('2 casas pt-BR, datas dd/mm/aaaa e o mês', () => {
    expect(n2(145002.67)).toBe('145.002,67');
    expect(n2(0)).toBe('0,00');
    expect(dataBR('2026-10-31')).toBe('31/10/2026');
    expect(dataBR(null)).toBe('—');
    expect(mesBR('2022-03-01')).toBe('03/2022');
  });
  it('vida útil em anos quando fecha, senão em meses; terra "—"', () => {
    expect(rotuloVida(120)).toBe('10 a');
    expect(rotuloVida(18)).toBe('18 m');
    expect(rotuloVida(null)).toBe('—');
  });
  it('depreciado sem número: terra e em formação; em uso tem número', () => {
    expect(rotuloSemDepreciacao({ deprecia: false, situacao: 'em_uso' })).toBe('não deprecia');
    expect(rotuloSemDepreciacao({ deprecia: true, situacao: 'em_formacao' })).toBe('começa no uso');
    expect(rotuloSemDepreciacao({ deprecia: true, situacao: 'em_uso' })).toBeNull();
  });
  it('origem: lançamentos, sem lançamento, estimativa e os dois juntos', () => {
    expect(rotuloOrigem({ n_lancamentos: 3, origem_valor: 'lancamentos' })).toBe('3 lanç.');
    expect(rotuloOrigem({ n_lancamentos: 0, origem_valor: 'sem_lancamento' })).toBe('sem lançamento');
    expect(rotuloOrigem({ n_lancamentos: 0, origem_valor: 'estimativa' })).toBe('estimativa');
    expect(rotuloOrigem({ n_lancamentos: 2, origem_valor: 'sem_lancamento' })).toBe('2 lanç. + valor');
  });
});

describe('a lista', () => {
  const trator = bem({ bem_id: 't', descricao: 'Trator Valtra', identificacao: 'A950P22', primeira_data: '2022-03-10' });
  const terra = bem({ bem_id: 'r', descricao: 'Terra nua 850 ha', categoria_codigo: 'terra', categoria_nome: 'Terra', deprecia: false,
    vida_util_meses: null, aquisicao: 6800000, depreciacao_acumulada: 0, valor_contabil: 6800000, mercado_valor: 24650000,
    primeira_data: null, em_uso_desde: '2019-06-01', n_lancamentos: 0, origem_valor: 'sem_lancamento', fazenda_codigo: 'RET' });
  const cerca = bem({ bem_id: 'c', descricao: 'Cerca divisa', categoria_codigo: 'cercas', categoria_nome: 'Cercas', situacao: 'em_formacao',
    depreciacao_acumulada: 0, aquisicao: 67200, valor_contabil: 67200, primeira_data: null, em_uso_desde: null });

  it('toda coluna ordena (11) e a ausência vai para o fim nos dois sentidos', () => {
    expect(COLUNAS_ORDENAVEIS.map(c => c.coluna)).toEqual(
      ['data', 'bem', 'categoria', 'fazenda', 'situacao', 'vida', 'aquisicao', 'depreciado', 'contabil', 'mercado', 'origem']);
    const porData = COLUNAS_ORDENAVEIS.find(c => c.coluna === 'data');
    expect(ordenarPorColuna([cerca, trator, terra], porData, 'asc').map(b => b.bem_id)).toEqual(['r', 't', 'c']);
    expect(ordenarPorColuna([cerca, trator, terra], porData, 'desc').map(b => b.bem_id)).toEqual(['t', 'r', 'c']);
    const porMercado = COLUNAS_ORDENAVEIS.find(c => c.coluna === 'mercado');
    expect(ordenarPorColuna([trator, terra], porMercado, 'asc').map(b => b.bem_id)).toEqual(['r', 't']);
    /* "não deprecia" e "começa no uso" não são zero: vão para o fim */
    const porDepreciado = COLUNAS_ORDENAVEIS.find(c => c.coluna === 'depreciado');
    expect(ordenarPorColuna([terra, cerca, trator], porDepreciado, 'asc').map(b => b.bem_id)[0]).toBe('t');
  });
  it('filtra pelo chip e pela busca (sem acento, placa/série, fazenda)', () => {
    expect(filtrarBens([trator, terra, cerca], 'terra', '').map(b => b.bem_id)).toEqual(['r']);
    expect(filtrarBens([trator, terra, cerca], '', 'a950').map(b => b.bem_id)).toEqual(['t']);
    expect(filtrarBens([trator, terra, cerca], '', 'ret').map(b => b.bem_id)).toEqual(['r']);
    expect(filtrarBens([trator, terra, cerca], '', '').length).toBe(3);
  });
  it('os totais: mercado sem avaliação entra pelo contábil', () => {
    const t = totaisDaLista([trator, terra]);
    expect(t.n).toBe(2);
    expect(t.aquisicao).toBe(7188400);
    expect(t.contabil).toBeCloseTo(7043397.33, 2);
    expect(t.mercado).toBeCloseTo(24650000 + 243397.33, 2);
  });
  it('os chips: a categoria do cliente vence a global de mesmo código; inativa sai', () => {
    const c = (p: Partial<CategoriaBem>): CategoriaBem => ({ id: 'x', cliente_id: null, codigo: 'maquinas', nome: 'Máquinas', vida_util_anos: 10,
      residual_pct: 20, deprecia: true, tem_mercado: true, base_mercado: 'bem', tem_pastos: false, ordem: 10, ativo: true, ...p });
    expect(chipsDeCategoria([c({ codigo: 'terra', nome: 'Terra', ordem: 130 }), c({}), c({ cliente_id: 'k', nome: 'Máquinas pesadas' }),
      c({ codigo: 'cercas', nome: 'Cercas', ordem: 80, ativo: false })])).toEqual([
      { codigo: 'maquinas', nome: 'Máquinas pesadas' }, { codigo: 'terra', nome: 'Terra' }]);
  });
});

describe('o modal', () => {
  it('as seis abas sempre no mesmo lugar; apagadas com motivo pela categoria e antes do 1º Salvar', () => {
    const terra = abasDoBem({ deprecia: false, tem_mercado: true, tem_pastos: false }, true);
    expect(terra.map(a => a.aba)).toEqual(['dados', 'lancamentos', 'pastos', 'depreciacao', 'mercado', 'documentos']);
    expect(terra.filter(a => a.apagada).map(a => a.aba)).toEqual(['pastos', 'depreciacao']);
    const pasto = abasDoBem({ deprecia: true, tem_mercado: false, tem_pastos: true }, true);
    expect(pasto.filter(a => a.apagada).map(a => a.aba)).toEqual(['mercado']);
    const novo = abasDoBem({ deprecia: true, tem_mercado: true, tem_pastos: false }, false);
    expect(novo.filter(a => !a.apagada).map(a => a.aba)).toEqual(['dados', 'lancamentos']);
    expect(novo.find(a => a.aba === 'documentos')?.motivo).toBe('salve o bem antes');
  });
  it('o custo da pastagem pela área: 6 pastos, 120 ha, R$ 156.000 = R$ 1.300/ha; a soma fecha', () => {
    const ps = [22.5, 18, 21.3, 19.7, 20.5, 18].map((a, i) => ({ pasto_id: `p${i}`, nome: `Piquete ${i}`, fazenda_codigo: 'RET', area_ha: a }));
    const r = custoPorPasto(ps, 156000, 140400);
    expect(r.areaTotal).toBe(120);
    expect(r.porHa).toBe(1300);
    expect(r.linhas[0].custo).toBe(29250);
    expect(r.linhas.reduce((t, l) => t + l.custo, 0)).toBeCloseTo(156000, 2);
    expect(r.linhas.reduce((t, l) => t + l.contabil, 0)).toBeCloseTo(140400, 2);
    expect(custoPorPasto([], 1000, 1000).porHa).toBeNull();
  });
  it('erro do banco: a frase pronta vai; o resto vira frase genérica', () => {
    expect(fraseDoErro({ code: 'P0001', message: 'Informe o motivo.' })).toBe('Informe o motivo.');
    expect(fraseDoErro({ code: '42501', message: 'sem acesso a este registro' })).toBe('Sem acesso a este registro.');
    const original = console.error; console.error = () => {};
    expect(fraseDoErro({ code: '23505', message: 'duplicate key' })).toBe('Não consegui gravar. Tente de novo.');
    console.error = original;
  });
});

describe('o modal — contas de exibição', () => {
  it('ano a ano: agrupa a série mensal do banco (meses, soma, acumulada e contábil do fim)', async () => {
    const { anoAAno } = await import('./patrimonio');
    const serie = [
      { periodo: '2025-11', quota: 1000, acumulada: 1000, contabil: 99000 },
      { periodo: '2025-12', quota: 1000, acumulada: 2000, contabil: 98000 },
      { periodo: '2026-01', quota: 1000.01, acumulada: 3000.01, contabil: 96999.99 },
    ];
    expect(anoAAno(serie)).toEqual([
      { ano: '2025', meses: 2, depreciacao: 2000, acumulada: 2000, contabil: 98000 },
      { ano: '2026', meses: 1, depreciacao: 1000.01, acumulada: 3000.01, contabil: 96999.99 },
    ]);
  });
  it('tamanho do arquivo e "já deprecia" (o critério do banco)', async () => {
    const { tamanhoDoArquivo, jaDeprecia } = await import('./patrimonio');
    expect(tamanhoDoArquivo(184320)).toBe('180 KB');
    expect(tamanhoDoArquivo(1258291)).toBe('1,2 MB');
    expect(tamanhoDoArquivo(null)).toBe('—');
    expect(jaDeprecia({ deprecia: true, situacao: 'em_uso', em_uso_desde: '2022-03-01' }, '2026-10-30')).toBe(true);
    expect(jaDeprecia({ deprecia: true, situacao: 'em_uso', em_uso_desde: '2026-10-01' }, '2026-10-30')).toBe(false);
    expect(jaDeprecia({ deprecia: false, situacao: 'em_uso', em_uso_desde: '2019-01-01' }, '2026-10-30')).toBe(false);
    expect(jaDeprecia({ deprecia: true, situacao: 'em_formacao', em_uso_desde: null }, '2026-10-30')).toBe(false);
  });

describe('o nome curto da categoria na tabela (Gabriel 31/10: Categoria não corta a 1170)', () => {
  it('os 13 códigos do cadastro global têm nome curto; o do cliente mostra o nome dele', () => {
    const CODIGOS = ['maquinas', 'implementos', 'veiculos', 'equipamentos_informatica', 'benfeitorias', 'instalacoes', 'rede_agua', 'cercas',
      'estradas_aceiros', 'pastagens', 'formacao_area', 'correcao_solo', 'terra'];
    expect(Object.keys(NOME_CURTO_CATEGORIA).sort()).toEqual([...CODIGOS].sort());
    expect(nomeCurtoDaCategoria({ categoria_codigo: 'equipamentos_informatica', categoria_nome: 'Equipamentos e informática' })).toBe('Informática');
    expect(nomeCurtoDaCategoria({ categoria_codigo: 'rede_agua', categoria_nome: 'Rede de água e bebedouros' })).toBe('Rede de água');
    expect(nomeCurtoDaCategoria({ categoria_codigo: 'silos_do_cliente', categoria_nome: 'Silos' })).toBe('Silos');
    /* nenhum passa de 16 letras (o que cabe nos 100 px da coluna a 10 px, medido no gate) */
    expect(Math.max(...Object.values(NOME_CURTO_CATEGORIA).map(n => n.length))).toBeLessThanOrEqual(16);
  });
  it('a coluna ordena pelo nome que se vê', () => {
    const porCategoria = COLUNAS_ORDENAVEIS.find(c => c.coluna === 'categoria');
    const v = ordenarPorColuna([bem({ bem_id: 'eq', categoria_codigo: 'equipamentos_informatica', categoria_nome: 'Equipamentos e informática' }),
      bem({ bem_id: 'es', categoria_codigo: 'estradas_aceiros', categoria_nome: 'Estradas e aceiros' })], porCategoria, 'asc');
    expect(v.map(b => b.bem_id)).toEqual(['es', 'eq']);   /* Estradas < Informática (pelo nome completo seria Equipamentos < Estradas) */
  });
});
});
