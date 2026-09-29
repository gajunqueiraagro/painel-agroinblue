/**
 * OC-CRIAR-DO-LEGADO-01 — as regras de tela da acao "Criar OC a partir deste lancamento". Numeros do caso de prova (Santa Rita,
 * "Venda 315 Desmama M", recebimentos 692f1957 + 4df4ea15 e saidas 8bd25a97 de 200 cab + 9542dccc de 115 cab).
 * A regra que grava (erros primarios, rateio em centavos, cadeia) mora no banco e esta' provada em rollback — ver o bloco no
 * CLAUDE.md. Aqui: quando a acao aparece, as cabecas da descricao, o pre-marcado unico, a ordem das irmas e a leitura do envelope.
 */
import { describe, it, expect } from 'vitest';
import {
  CONTAS_VENDA_GADO, podeCriarOCDoLegado, cabecasDaDescricao, combinacaoUnica, ordenarIrmas, lerResultado, precoPorKg, saidasPreMarcadas,
  ordenarSaidas, fazendaDasMarcadas, confrontoComRecebido, lerSugestoes, pareceComComprador, SEMELHANCA_MINIMA,
  type SaidaCandidata, type RecebimentoResumo,
} from './criarDoLegado';
import { SUBCENTRO_VENDA_BOITEL } from '@/lib/financeiro/subcentroVenda';

const RECEB = { tipo_operacao: '1-Entradas', subcentro: 'Venda de Desmama Machos', cancelado: false, origem_lancamento: 'importacao', sem_movimentacao_caixa: false };

const saida = (id: string, data: string, quantidade: number): SaidaCandidata =>
  ({ id, data, categoria: 'desmama_m', quantidade, peso_medio_kg: 250, valor: 1000, origem_registro: null, fornecedor_id: null });

describe('OC-CRIAR-DO-LEGADO-01b — o modal antigo ja recebido entra', () => {
  const MODAL = { ...RECEB, origem_lancamento: 'movimentacao_rebanho' };

  it('realizado, conciliado ou com data de conciliacao: aparece (o espelho de _oc_legado_motivo_recebimento)', () => {
    expect(podeCriarOCDoLegado({ ...MODAL, status_transacao: 'realizado' }, false)).toBe(true);
    expect(podeCriarOCDoLegado({ ...MODAL, status_transacao: 'conciliado' }, false)).toBe(true);
    expect(podeCriarOCDoLegado({ ...MODAL, status_transacao: 'agendado', conciliado_em: '2026-05-05' }, false)).toBe(true);
  });

  it('programado, agendado ou sem status: nao aparece ("Receba primeiro"); e as outras recusas continuam valendo', () => {
    expect(podeCriarOCDoLegado({ ...MODAL, status_transacao: 'programado' }, false)).toBe(false);
    expect(podeCriarOCDoLegado({ ...MODAL, status_transacao: 'agendado' }, false)).toBe(false);
    expect(podeCriarOCDoLegado(MODAL, false)).toBe(false);
    /* a busca sabe achar: o mesmo realizado some com OC, sem caixa ou fora de 1110-1140 */
    expect(podeCriarOCDoLegado({ ...MODAL, status_transacao: 'realizado' }, true)).toBe(false);
    expect(podeCriarOCDoLegado({ ...MODAL, status_transacao: 'realizado', sem_movimentacao_caixa: true }, false)).toBe(false);
    expect(podeCriarOCDoLegado({ ...MODAL, status_transacao: 'realizado', subcentro: SUBCENTRO_VENDA_BOITEL }, false)).toBe(false);
  });

  it('a saida do proprio lancamento vem marcada, e ela vence a combinacao pelas cabecas', () => {
    const saidas = [saida('a', '2026-05-04', 25), saida('b', '2026-05-04', 15), saida('c', '2026-05-05', 10)];
    /* 25 cabecas fecham com "a" sozinha E com "b" + "c": pelas cabecas a combinacao e' ambigua e nada seria marcado */
    expect(combinacaoUnica(saidas, 25)).toBeNull();
    expect(saidasPreMarcadas(saidas, 'b', 25)).toEqual(['b']);
    expect(saidasPreMarcadas(saidas, 'a', 25)).toEqual(['a']);
  });

  it('saida do lancamento fora das sugestoes (ou nula): volta a combinacao unica de antes', () => {
    const saidas = [saida('a', '2026-05-04', 25), saida('b', '2026-05-04', 15)];
    expect(saidasPreMarcadas(saidas, 'zzz', 25)).toEqual(['a']);
    expect(saidasPreMarcadas(saidas, null, 25)).toEqual(['a']);
    expect(saidasPreMarcadas(saidas, null, null)).toBeNull();
  });
});

describe('quando a acao aparece', () => {
  it('recebimento vivo de venda de gado (1110-1140), sem OC e com caixa: aparece', () => {
    expect(podeCriarOCDoLegado(RECEB, false)).toBe(true);
    expect(CONTAS_VENDA_GADO.has('Venda de Desmama Machos')).toBe(true);
  });
  it('cada recusa do banco tira a acao: com OC, saida, cancelado, sem caixa, modal antigo PROGRAMADO, boitel e conta de fora', () => {
    expect(podeCriarOCDoLegado(RECEB, true)).toBe(false);
    expect(podeCriarOCDoLegado({ ...RECEB, tipo_operacao: '2-Saídas' }, false)).toBe(false);
    expect(podeCriarOCDoLegado({ ...RECEB, cancelado: true }, false)).toBe(false);
    expect(podeCriarOCDoLegado({ ...RECEB, sem_movimentacao_caixa: true }, false)).toBe(false);
    expect(podeCriarOCDoLegado({ ...RECEB, origem_lancamento: 'movimentacao_rebanho', status_transacao: 'programado' }, false)).toBe(false);
    expect(podeCriarOCDoLegado({ ...RECEB, subcentro: SUBCENTRO_VENDA_BOITEL }, false)).toBe(false);
    expect(CONTAS_VENDA_GADO.has(SUBCENTRO_VENDA_BOITEL)).toBe(false);
    expect(podeCriarOCDoLegado({ ...RECEB, subcentro: 'Fertilizantes' }, false)).toBe(false);
    expect(podeCriarOCDoLegado({ ...RECEB, subcentro: null }, false)).toBe(false);
  });
});

describe('cabecas lidas da descricao', () => {
  it('le o numero seguido de palavra, e nao a marca de parcela nem o ano', () => {
    expect(cabecasDaDescricao('Venda 315 Desmama M - 1/2')).toBe(315);
    expect(cabecasDaDescricao('Venda 183 DM')).toBe(183);
    expect(cabecasDaDescricao('Venda de 40 cab')).toBe(40);
    expect(cabecasDaDescricao('Venda gado 2025')).toBeNull();
    expect(cabecasDaDescricao('Recebimento - 1/2')).toBeNull();
    expect(cabecasDaDescricao(null)).toBeNull();
  });
});

describe('pre-marcado das saidas (D4)', () => {
  it('combinacao UNICA que fecha as cabecas: pre-marca (o caso de prova, 200 + 115 = 315)', () => {
    const s = [saida('8bd25a97', '2026-03-26', 200), saida('9542dccc', '2026-03-27', 115), saida('x1', '2026-04-10', 90)];
    expect(combinacaoUnica(s, 315)).toEqual(['8bd25a97', '9542dccc']);
  });
  it('mais de uma combinacao que fecha: nada pre-marcado', () => {
    const s = [saida('a', '2026-03-01', 100), saida('b', '2026-03-02', 100), saida('c', '2026-03-03', 215)];
    expect(combinacaoUnica(s, 315)).toBeNull();
  });
  it('nenhuma combinacao fecha, ou descricao sem cabecas: nada pre-marcado', () => {
    const s = [saida('a', '2026-03-01', 200), saida('b', '2026-03-02', 120)];
    expect(combinacaoUnica(s, 315)).toBeNull();
    expect(combinacaoUnica(s, null)).toBeNull();
  });
});

describe('Somar outro recebimento (D6)', () => {
  it('a parcela irma ("n/m" da mesma venda) vem primeiro; o resto por data', () => {
    const r = (id: string, data: string, descricao: string): RecebimentoResumo => ({ id, data, valor: 1, descricao, conta: null });
    const irmas = [r('outra', '2026-02-01', 'Venda 90 Bezerras'), r('4df4ea15', '2026-04-22', 'Venda 315 Desmama M - 2/2'), r('velha', '2026-01-10', 'Venda 20 Vacas')];
    expect(ordenarIrmas(irmas, 'Venda 315 Desmama M - 1/2').map(x => x.id)).toEqual(['4df4ea15', 'velha', 'outra']);
    /* sem marca de parcela na base: so' a data */
    expect(ordenarIrmas(irmas, 'Venda gado').map(x => x.id)).toEqual(['velha', 'outra', '4df4ea15']);
  });
});

describe('envelope de oc_criar_do_legado', () => {
  it('le lotes e R$/kg com os numeros da prova: o rateio em centavos fecha no total dos recebimentos', () => {
    const r = lerResultado({
      ok: true, simulado: true, operacao_id: null, total: 1182600.75, pendencias: [],
      lotes: [
        { ordem: 1, categoria_negociada: 'desmama_m', qtd_negociada: 200, peso_medio_negociado_kg: 235.92, valor_informado: 707751.47 },
        { ordem: 2, categoria_negociada: 'desmama_m', qtd_negociada: 115, peso_medio_negociado_kg: 275.27826087, valor_informado: 474849.28 },
      ],
      conta_corrente: { modelo: 'conta_corrente', entregue: 1182600.75, recebido: 1182600.75, saldo: 0, situacao: 'quitado', linhas: [] },
    });
    expect(r.ok).toBe(true);
    expect(Math.round(r.lotes.reduce((a, l) => a + l.valor * 100, 0))).toBe(Math.round((r.total ?? 0) * 100));
    expect(precoPorKg(r.lotes[0])).toBe(15);
    expect(precoPorKg({ ...r.lotes[0], peso: null })).toBeNull();
    expect(r.contaCorrente?.situacao).toBe('quitado');
  });
  it('recusa: ok falso com TODAS as pendencias juntas, sem conta corrente', () => {
    const r = lerResultado({ ok: false, pendencias: ['Informe o comprador', 'Marque ao menos uma saida de gado'] });
    expect(r.ok).toBe(false);
    expect(r.pendencias).toEqual(['Informe o comprador', 'Marque ao menos uma saida de gado']);
    expect(r.contaCorrente).toBeNull();
    expect(lerResultado(null).ok).toBe(false);
  });
});

/* OC-CRIAR-DO-LEGADO-01c — destino ordena (nao filtra), a fazenda da OC e' a do gado, e o valor marcado se confronta com o recebido. */
describe('OC-CRIAR-DO-LEGADO-01c', () => {
  const sd = (id: string, data: string, qtd: number, o: Partial<SaidaCandidata> = {}): SaidaCandidata => ({
    id, data, categoria: 'vacas', quantidade: qtd, peso_medio_kg: 400, valor: 1000, origem_registro: null, fornecedor_id: null, ...o });

  it('ordenar: parecidas com o comprador (>= 0,3) primeiro, mesmo mais novas; dentro do grupo, por data', () => {
    const r = ordenarSaidas([sd('velha-outra', '2025-03-01', 1, { semelhanca: 0.02 }), sd('b', '2025-03-28', 51, { semelhanca: 1 }),
      sd('a', '2025-03-20', 52, { semelhanca: 0.3 }), sd('sem-score', '2025-02-01', 3)]);
    expect(r.map(s => s.id)).toEqual(['a', 'b', 'sem-score', 'velha-outra']);
    expect(SEMELHANCA_MINIMA).toBe(0.3);
    expect(pareceComComprador({ semelhanca: 0.29 })).toBe(false);
  });

  it('pre-marcado: a combinacao entre as PARECIDAS vence a combinacao entre todas (que fecharia com o gado de outro comprador)', () => {
    /* 103 cab: parecidas 52 + 51; entre todas, 100 + 3 tambem fecharia — sem a preferencia, seriam 2 combinacoes e nada marcado */
    const saidas = [sd('p52', '2025-03-28', 52, { semelhanca: 1 }), sd('p51', '2025-03-28', 51, { semelhanca: 1 }),
      sd('o100', '2025-03-10', 100, { semelhanca: 0 }), sd('o3', '2025-03-11', 3, { semelhanca: 0 })];
    expect(saidasPreMarcadas(saidas, null, 103)?.sort()).toEqual(['p51', 'p52']);
    /* a busca sabe achar: sem parecidas, a combinacao entre todas (ambigua aqui) nao marca nada */
    expect(saidasPreMarcadas(saidas.map(s => ({ ...s, semelhanca: 0 })), null, 103)).toBeNull();
  });

  it('fazenda das marcadas: nenhuma, uma, ou mistas com os nomes em ordem', () => {
    expect(fazendaDasMarcadas([])).toEqual({ tipo: 'nenhuma' });
    expect(fazendaDasMarcadas([sd('a', '2025-03-28', 52, { fazenda_id: 'se', fazenda_nome: 'Faz. Sto. Expedito' }),
      sd('b', '2025-03-28', 51, { fazenda_id: 'se', fazenda_nome: 'Faz. Sto. Expedito' })]))
      .toEqual({ tipo: 'uma', fazendaId: 'se', fazenda: 'Faz. Sto. Expedito' });
    expect(fazendaDasMarcadas([sd('a', '2025-03-28', 52, { fazenda_id: 'se', fazenda_nome: 'Faz. Sto. Expedito' }),
      sd('c', '2025-04-26', 1, { fazenda_id: 'pz', fazenda_nome: 'Faz. Pureza' })]))
      .toEqual({ tipo: 'mistas', fazendas: ['Faz. Pureza', 'Faz. Sto. Expedito'] });
  });

  it('confronto com o recebido, em centavos: bate, ou a diferenca com sinal', () => {
    expect(confrontoComRecebido(219096.6 + 214883.4, 433980)).toEqual({ bate: true, diferenca: 0 });
    expect(confrontoComRecebido(438282, 433980)).toEqual({ bate: false, diferenca: 4302 });
    expect(confrontoComRecebido(433000, 433980).diferenca).toBe(-980);
  });

  it('o envelope das sugestoes le fazenda, destino e semelhanca', () => {
    const r = lerSugestoes({ saidas: [{ id: 's', data: '2025-03-28', quantidade: 52, fazenda_id: 'se', fazenda_nome: 'Faz. Sto. Expedito',
      destino: 'Fernando Cesar Sanches', semelhanca: 1 }] });
    expect(r.saidas[0]).toMatchObject({ fazenda_id: 'se', fazenda_nome: 'Faz. Sto. Expedito', destino: 'Fernando Cesar Sanches', semelhanca: 1 });
  });
});
