/**
 * P128b — o PEDIDO da prévia campo a campo (o que vai à `fn_nota_completar`) e a leitura da resposta. Molde da Casa da Cerca (5 soltas, a 5ª
 * programada) com valores SINTÉTICOS.
 */
import { describe, it, expect } from 'vitest';
import {
  baseDaDescricao, chaveDaCelula, chaveDaGrade, descricaoPadronizada, descricaoSemInformacao, fraseDoEfeitoNoDre, lerResultadoCompletar, pedidoDaGrade, pedidoDeCompletar,
  type AlvoDaPrevia, type ColunaCompletar, type ValoresParaTodas,
} from './notaCompletar';

/* a nota tem valor e vencimento para TODAS as parcelas; só a 5ª ainda não foi paga */
const ALVOS: AlvoDaPrevia[] = [1, 2, 3, 4, 5].map((k) => ({ id: `l${k}`, programada: k === 5, notaValorCent: 63200, notaVencimento: `2031-${String(5 + k).padStart(2, '0')}-20` }));
const TODAS: ValoresParaTodas = { descricaoBase: 'Cercas sintetico - 2/5', favorecidoId: 'f1', fazendaId: 'faz1', contaId: 'c1', planoContaId: 'p2',
  numeroDocumento: 'NF 000.004.875', competencia: '2031-06-02', safraId: null };
const TODAS_AS_COLUNAS = new Set<ColunaCompletar>(['descricao', 'favorecido', 'fazenda', 'conta', 'subcentro', 'documento', 'competencia', 'safra']);

describe('P128b — o pedido', () => {
  it('a descrição base vira "<base> i/N" (o "k/N" que veio na base sai)', () => {
    expect(descricaoPadronizada('Cercas sintetico - 2/5', 3, 5)).toBe('Cercas sintetico 3/5');
    expect(descricaoPadronizada('Cercas', 1, 1)).toBe('Cercas');
    // a base do "Para todas" nasce sem o k/N da parcela aberta
    expect(baseDaDescricao('Cercas sintetico - 2/5')).toBe('Cercas sintetico');
    expect(baseDaDescricao('Cercas sintetico')).toBe('Cercas sintetico');
  });
  it('todas as colunas marcadas: os campos em todas; a conta SÓ na programada (nas pagas ela nunca muda); a safra fica com o banco', () => {
    const p = pedidoDeCompletar(ALVOS, TODAS, TODAS_AS_COLUNAS, new Set(), false);
    expect(p[0]).toEqual({ id: 'l1', descricao: 'Cercas sintetico 1/5', favorecido_id: 'f1', fazenda_id: 'faz1', plano_conta_id: 'p2',
      numero_documento: 'NF 000.004.875', tipo_documento: 'Nota Fiscal', data_competencia: '2031-06-02' });
    expect(p[4]).toMatchObject({ id: 'l5', descricao: 'Cercas sintetico 5/5', conta_bancaria_id: 'c1' });
    expect('valor' in p[4]).toBe(false);
  });
  it('caminho 2 ("Completar e atualizar as não pagas"): a programada leva valor e vencimento da nota; as pagas não', () => {
    const p = pedidoDeCompletar(ALVOS, TODAS, TODAS_AS_COLUNAS, new Set(), true);
    expect([p[4].valor, p[4].data_vencimento]).toEqual([632, '2031-10-20']);
    expect(p.slice(0, 4).every((x) => !('valor' in x) && !('data_vencimento' in x))).toBe(true);
    expect('valor' in p[0] || 'data_vencimento' in p[0]).toBe(false);
  });
  it('coluna desmarcada não entra; a célula mantida (✎) só naquela parcela', () => {
    const p = pedidoDeCompletar(ALVOS, TODAS, new Set<ColunaCompletar>(['descricao', 'documento']), new Set([chaveDaCelula('l2', 'documento')]), false);
    expect(p[0]).toEqual({ id: 'l1', descricao: 'Cercas sintetico 1/5', numero_documento: 'NF 000.004.875', tipo_documento: 'Nota Fiscal' });
    expect(p[1]).toEqual({ id: 'l2', descricao: 'Cercas sintetico 2/5' });
  });
  /* URGENTE 29/10 (o caso do Azulão, texto sintético) — a Descrição desmarcada NUNCA troca o texto do usuário */
  it('Descrição desmarcada: a de hoje fica e ganha só o "i/N"; a mantida (✎) e a que já tem o "i/N" não vão', () => {
    const alvos: AlvoDaPrevia[] = [{ ...ALVOS[0], descricaoHoje: 'Reforma sintetica' }, { ...ALVOS[1], descricaoHoje: 'Parcela 2 - F2 - REFORMA SINTETICA' }];
    const p = pedidoDeCompletar(alvos, TODAS, new Set<ColunaCompletar>(['documento']), new Set(), false);
    expect(p.map((x) => x.descricao)).toEqual(['Reforma sintetica 1/2', 'Parcela 2 - F2 - REFORMA SINTETICA 2/2']);
    expect(p.some((x) => String(x.descricao).includes('Cercas'))).toBe(false);
    const mantida = pedidoDeCompletar(alvos, TODAS, new Set<ColunaCompletar>(), new Set([chaveDaCelula('l1', 'descricao')]), false);
    expect(['descricao' in mantida[0], mantida[1].descricao]).toEqual([false, 'Parcela 2 - F2 - REFORMA SINTETICA 2/2']);
    const jaNumerada = pedidoDeCompletar([{ ...ALVOS[0], descricaoHoje: 'Reforma sintetica 1/2' }, { ...ALVOS[1], descricaoHoje: 'Reforma sintetica 2/2' }],
      TODAS, new Set<ColunaCompletar>(), new Set(), false);
    expect(jaNumerada.every((x) => !('descricao' in x))).toBe(true);
    expect(pedidoDeCompletar(alvos.slice(0, 1), TODAS, new Set<ColunaCompletar>(), new Set(), false)[0]).toEqual({ id: 'l1' });   // 1 parcela: nada
  });
  it('P163 v4 — a grade: Descrição desmarcada fica com a de hoje + "i/N"; a célula editada vale o escrito; marcada, a base', () => {
    const alvos: AlvoDaPrevia[] = [{ ...ALVOS[0], descricaoHoje: 'Reforma sintetica' }, { ...ALVOS[1], descricaoHoje: 'Parcela 2 - F2 - REFORMA SINTETICA' }];
    const vazio = new Map<string, string | number>();
    expect(pedidoDaGrade(alvos, TODAS, new Set<ColunaCompletar>(['documento']), vazio, false).map((x) => x.descricao))
      .toEqual(['Reforma sintetica 1/2', 'Parcela 2 - F2 - REFORMA SINTETICA 2/2']);
    const editada = new Map<string, string | number>([[chaveDaGrade('l2', 'descricao'), 'Mourões sinteticos']]);
    expect(pedidoDaGrade(alvos, TODAS, new Set<ColunaCompletar>(), editada, false).map((x) => x.descricao)).toEqual(['Reforma sintetica 1/2', 'Mourões sinteticos']);
    expect(pedidoDaGrade(alvos, TODAS, new Set<ColunaCompletar>(['descricao']), vazio, false).map((x) => x.descricao))
      .toEqual(['Cercas sintetico 1/2', 'Cercas sintetico 2/2']);
  });
  /* Gabriel 29/10 08:26 — a descrição SEM INFORMAÇÃO (o LR/Excel) é a única que vem trocada pela da nota com a coluna desmarcada */
  it('sem informação: vazia, "-", "Parcela 3 - None", "Parcela 3"; com informação: "Parcela 4 - hilux sintetica", "Parcela 2 - F2 - REFORMA"', () => {
    expect(['', '-', 'Parcela 3 - None', 'parcela 3 - none', 'Parcela 3', 'Parcela 3/5 - None', null].map(descricaoSemInformacao)).toEqual([true, true, true, true, true, true, true]);
    expect(['Parcela 4 - hilux sintetica', 'Parcela 2 - F2 - REFORMA SINTETICA', 'Reforma sintetica', 'Oleos sinteticos'].map(descricaoSemInformacao))
      .toEqual([false, false, false, false]);
  });
  it('a grade (e o pedido antigo): a sem informação leva a base da nota; a com informação fica + "i/N"; a editada vale o escrito', () => {
    const alvos: AlvoDaPrevia[] = [{ ...ALVOS[0], descricaoHoje: 'Parcela 1 - None' }, { ...ALVOS[1], descricaoHoje: 'Parcela 2 - hilux sintetica' }];
    const vazio = new Map<string, string | number>();
    expect(pedidoDaGrade(alvos, TODAS, new Set<ColunaCompletar>(), vazio, false).map((x) => x.descricao))
      .toEqual(['Cercas sintetico 1/2', 'Parcela 2 - hilux sintetica 2/2']);
    const editada = new Map<string, string | number>([[chaveDaGrade('l1', 'descricao'), 'Mourões sinteticos']]);
    expect(pedidoDaGrade(alvos, TODAS, new Set<ColunaCompletar>(), editada, false)[0].descricao).toBe('Mourões sinteticos');
    expect(pedidoDeCompletar(alvos, TODAS, new Set<ColunaCompletar>(), new Set(), false).map((x) => x.descricao))
      .toEqual(['Cercas sintetico 1/2', 'Parcela 2 - hilux sintetica 2/2']);
    /* o ✎ na sem informação também a mantém */
    expect('descricao' in pedidoDeCompletar(alvos, TODAS, new Set<ColunaCompletar>(), new Set([chaveDaCelula('l1', 'descricao')]), false)[0]).toBe(false);
  });
  /* Caso 3 (o cartão) — o "k/N" sai da POSIÇÃO na nota (6/10), nunca da ordem das achadas (1/3); o "1/3" que o completar pôs sai */
  it('com a posição: a escrita fica + "6/10" (o "1/3" velho sai); a sem informação leva a base + "8/10"; uma achada só também numera', () => {
    const alvos: AlvoDaPrevia[] = [{ ...ALVOS[0], descricaoHoje: 'Manutencao sintetica 1/3', posicao: { k: 6, n: 10 } },
      { ...ALVOS[1], descricaoHoje: 'Parcela 8 - None 3/3', posicao: { k: 8, n: 10 } }];
    expect(pedidoDaGrade(alvos, TODAS, new Set<ColunaCompletar>(), new Map(), false).map((x) => x.descricao)).toEqual(['Manutencao sintetica 6/10', 'Cercas sintetico 8/10']);
    expect(pedidoDaGrade(alvos.slice(0, 1), TODAS, new Set<ColunaCompletar>(), new Map(), false)[0].descricao).toBe('Manutencao sintetica 6/10');
  });
  it('safra escolhida vai; descrição/nº vazios não vão', () => {
    const p = pedidoDeCompletar(ALVOS.slice(0, 1), { ...TODAS, descricaoBase: ' ', numeroDocumento: '', safraId: 's1' }, TODAS_AS_COLUNAS, new Set(), false);
    expect(p[0]).toEqual({ id: 'l1', favorecido_id: 'f1', fazenda_id: 'faz1', plano_conta_id: 'p2', data_competencia: '2031-06-02', safra_id: 's1' });
  });
});

describe('P128b — a resposta do banco', () => {
  it('lê linhas, campos (hoje → fica, cadeado), recusas e o efeito no DRE; a frase do DRE', () => {
    const r = lerResultadoCompletar({ ok: true, operacao: 'op1', financiamento_id: 'fin1',
      recusas: [{ frase: 'O mês 06/2031 está fechado.' }],
      linhas: [{ id: 'l1', descricao: 'Parcela 1', situacao: 'conciliada', parcela_n: null, campos: {
        conta_bancaria_id: { hoje: 'c0', fica: 'c0', muda: false, hoje_nome: 'BB', fica_nome: 'BB', cadeado: 'conciliada: conta, valor e vencimento não mudam' },
        plano_conta_id: { hoje: 'p1', fica: 'p2', muda: true, hoje_nome: 'Manutenção', fica_nome: 'Investimento', cadeado: null } } }],
      efeito_dre: [{ mes_de: '2031-06', subcentro_de: 'Manutenção', mes_para: '2031-06', subcentro_para: 'Investimento', valor: 3160, lancamentos: 5 }] });
    expect([r.ok, r.operacao, r.financiamentoId, r.recusas]).toEqual([true, 'op1', 'fin1', ['O mês 06/2031 está fechado.']]);
    expect(r.linhas[0].campos.plano_conta_id).toEqual({ hoje: 'p1', fica: 'p2', muda: true, hojeNome: 'Manutenção', ficaNome: 'Investimento', cadeado: null });
    expect(r.linhas[0].campos.conta_bancaria_id?.cadeado).toContain('conciliada');
    expect(fraseDoEfeitoNoDre(r.efeitoDre)).toBe('DRE: R$ 3.160,00 saem de "Manutenção" (06/2031) e vão para "Investimento" (06/2031)');
    expect(fraseDoEfeitoNoDre([])).toBeNull();
  });
  it('resposta torta não quebra: vazia e sem ok', () => {
    expect(lerResultadoCompletar(null)).toEqual({ ok: false, recusas: [], linhas: [], efeitoDre: [], operacao: null, financiamentoId: null });
  });
});

/* P163-1 (o print 1126 do Gabriel, 29/10) — com o Subcentro desmarcado, a classificação não muda: só o MÊS. A frase não diz que o valor "sai de
   X e vai para X"; diz que ele muda de mês no mesmo subcentro. Subcentro diferente segue a frase de sempre. */
describe('P163-1 — o efeito no DRE quando só o mês muda', () => {
  it('mesmo subcentro: "DRE: R$ … passam de 05/2031 para 06/2031" (o mock v4)', () => {
    expect(fraseDoEfeitoNoDre([{ mesDe: '2031-05', subcentroDe: 'Manutenção de Cercas', mesPara: '2031-06', subcentroPara: 'Manutenção de Cercas', valor: 3160, lancamentos: 5 }]))
      .toBe('DRE: R$ 3.160,00 passam de 05/2031 para 06/2031');
  });
  it('subcentro diferente: a frase de sempre', () => {
    expect(fraseDoEfeitoNoDre([{ mesDe: '2031-05', subcentroDe: 'A', mesPara: '2031-05', subcentroPara: 'B', valor: 10, lancamentos: 1 }]))
      .toBe('DRE: R$ 10,00 saem de "A" (05/2031) e vão para "B" (05/2031)');
  });
});
