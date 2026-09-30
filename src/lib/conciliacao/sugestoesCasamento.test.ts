/**
 * PR-CONC-SUGESTOES-CASAR-01 — o motor de sugestões, com os CASOS REAIS do NJ · Banco do Brasil · set/26.
 *
 * ⚠ OS HISTÓRICOS SÃO OS DO `extrato_bancario_v2` (lidos no proto em 30/09), e os fornecedores e valores os do
 *   briefing e do `financeiro_lancamentos_v2`: Amanda Montes Camargo -3.085,00 (folha, venc 05/09), Receita Federal
 *   (ITR), Rabobank. O Receita do banco hoje tem 4 × 7.000 + 13.750; o caso do briefing (10.000 + 13.750) fica como
 *   foi pedido, e o real entra num caso à parte — as duas formas dão "nome · soma diferente".
 */
import { describe, it, expect } from 'vitest';
import {
  forcaDoNome, palavrasDoFornecedor, palavrasDoHistorico, sugerirCasamentos, type CandidatoSugestao,
} from './sugestoesCasamento';

let seq = 0;
function cand(p: Partial<CandidatoSugestao> & { valor_assinado: number }): CandidatoSugestao {
  seq += 1;
  return {
    lancamento_id: p.lancamento_id ?? `l${seq}`, data_vencimento: p.data_vencimento ?? '2026-09-05',
    competencia: p.competencia ?? '2026-09-01', descricao: p.descricao ?? 'Folha de Pagamento',
    fornecedor: p.fornecedor ?? null, favorecido_id: p.favorecido_id ?? null,
    status_transacao: p.status_transacao ?? 'previsto', ja_conciliado: p.ja_conciliado ?? false,
    valor_assinado: p.valor_assinado,
  };
}
const PIX = (nome: string, dia = '04') => `Pix - Agendamento - ${dia}/09 05:35 ${nome}`;

describe('o nome no histórico do banco', () => {
  it('tira o ruído do banco: Pix, Agendamento, data, hora', () => {
    expect(palavrasDoHistorico(PIX('JONATAS BARBOSA BATISTA'))).toEqual(['JONATAS', 'BARBOSA', 'BATISTA']);
    expect(palavrasDoHistorico('Pagamento de Boleto - BANCO RABOBANK INTERNATIONAL BRASIL S/'))
      .toEqual(['DE', 'BANCO', 'RABOBANK', 'INTERNATIONAL', 'BRASIL', 'S']);
  });
  it('o fornecedor perde o que vem depois do ";" e as palavras de ligação', () => {
    expect(palavrasDoFornecedor('Fernando Henrique Zandonadi; Gasto Recorrente Folha')).toEqual(['FERNANDO', 'HENRIQUE', 'ZANDONADI']);
    expect(palavrasDoFornecedor('Camargo Promoção de Vendas Ltda')).toEqual(['CAMARGO', 'PROMOCAO', 'VENDAS']);
    expect(palavrasDoFornecedor('Banco Rabobank S/A')).toEqual(['BANCO', 'RABOBANK']);
  });
  it('"FERNANDO HENRIQUE ZANDONA" casa com "Fernando Henrique Zandonadi; Gasto Recorrente..." — o banco cortou o sobrenome', () => {
    expect(forcaDoNome(PIX('FERNANDO HENRIQUE ZANDONA'), 'Fernando Henrique Zandonadi; Gasto Recorrente')).toBe(3);
    /* o prefixo só vale na ÚLTIMA palavra: no meio, "ZANDONA" não é começo de nada que o banco cortou */
    expect(forcaDoNome('Pix ZANDONA FERNANDO', 'Zandonadi')).toBe(0);
  });
  it('"CAMARGO PROMOCAO DE VENDA" casa com "Amanda Montes Camargo" por uma palavra distintiva (5+ letras)', () => {
    expect(forcaDoNome(PIX('CAMARGO PROMOCAO DE VENDA'), 'Amanda Montes Camargo')).toBe(1);
  });
  it('uma palavra curta sozinha não casa; duas palavras de 3+ letras casam', () => {
    expect(forcaDoNome('Pix ANA', 'Ana Lima')).toBe(0);
    expect(forcaDoNome('Pix ANA LUZ', 'Ana Luz')).toBe(2);
  });
});

describe('sugerirCasamentos — os casos do NJ', () => {
  it('Jonatas: mesmo valor a 1 dia, com o nome → "mesmo valor · nome", azul', () => {
    const r = sugerirCasamentos({ data: '2026-09-04', historico: PIX('JONATAS BARBOSA BATISTA'), valor: -5913.24 }, [
      cand({ valor_assinado: -5913.24, fornecedor: 'Jonatas Barbosa Batista', data_vencimento: '2026-09-05' }),
      cand({ valor_assinado: -1200, fornecedor: 'Outro' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'mesmo_valor_nome', motivo: 'mesmo valor · nome', diasDiff: 1, valorDiferente: false, vencido: false });
  });

  it('Gustavo: dois de mesmo valor — o do nome que casa mais (Maia Pinheiro) vem antes do outro Gustavo', () => {
    const fernando = cand({ lancamento_id: 'fernando', valor_assinado: -3504.38, fornecedor: 'Gustavo Fernando Silva Merces' });
    const maia = cand({ lancamento_id: 'maia', valor_assinado: -3504.38, fornecedor: 'Gustavo Maia Pinheiro' });
    const r = sugerirCasamentos({ data: '2026-09-04', historico: PIX('GUSTAVO MAIA PINHEIRO'), valor: -3504.38 }, [fernando, maia]);
    expect(r.map((s) => s.lancamentos[0].lancamento_id)).toEqual(['maia', 'fernando']);
    /* e sem nome nenhum, o mesmo valor ainda aparece — depois de quem tem nome */
    const semNome = cand({ lancamento_id: 'semNome', valor_assinado: -3504.38, fornecedor: 'Posto Trevo', data_vencimento: '2026-09-04' });
    const r2 = sugerirCasamentos({ data: '2026-09-04', historico: PIX('GUSTAVO MAIA PINHEIRO'), valor: -3504.38 }, [semNome, fernando, maia]);
    expect(r2.map((s) => [s.lancamentos[0].lancamento_id, s.motivo])).toEqual([
      ['maia', 'mesmo valor · nome'], ['fernando', 'mesmo valor · nome'], ['semNome', 'mesmo valor'],
    ]);
  });

  it('Amanda: "CAMARGO PROMOCAO DE VENDA" -5.665,00 x Amanda Montes Camargo -3.085,00 → "nome · valor diferente", âmbar', () => {
    const r = sugerirCasamentos({ data: '2026-09-04', historico: PIX('CAMARGO PROMOCAO DE VENDA'), valor: -5665 }, [
      cand({ valor_assinado: -3085, fornecedor: 'Amanda Montes Camargo', data_vencimento: '2026-09-05', competencia: '2026-08-01' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'nome_valor', motivo: 'nome · valor diferente', valorDiferente: true, vencido: false });
  });

  it('financiamento: -26.127,18 = 22.719,29 + 3.407,89 a 14 dias → "soma de 2 · 14 dias", azul', () => {
    const r = sugerirCasamentos(
      { data: '2026-09-15', historico: 'Pagamento de Boleto - BANCO RABOBANK INTERNATIONAL BRASIL S/', valor: -26127.18 }, [
        cand({ lancamento_id: 'princ', valor_assinado: -22719.29, fornecedor: 'Rabobank', favorecido_id: 'rabo', data_vencimento: '2026-09-01', descricao: 'Financiamento - principal' }),
        cand({ lancamento_id: 'juros', valor_assinado: -3407.89, fornecedor: 'Rabobank', favorecido_id: 'rabo', data_vencimento: '2026-09-01', descricao: 'Financiamento - juros' }),
        cand({ valor_assinado: -900, fornecedor: 'Posto Trevo', data_vencimento: '2026-09-14' }),
        cand({ valor_assinado: -1200, fornecedor: 'Casa Agro', data_vencimento: '2026-09-15' }),
      ]);
    const soma = r.find((s) => s.tipo === 'soma')!;
    expect(soma.motivo).toBe('soma de 2 · 14 dias');
    expect(soma.lancamentos.map((c) => c.lancamento_id).sort()).toEqual(['juros', 'princ']);
    expect(soma.valorDiferente).toBe(false);
  });

  it('Receita: -22.187,46 x 10.000 + 13.750 da Receita Federal → "nome · soma diferente" (e cada um "nome · valor diferente")', () => {
    const r = sugerirCasamentos({ data: '2026-09-18', historico: PIX('RECEITA FEDERAL', '18'), valor: -22187.46 }, [
      cand({ lancamento_id: 'a', valor_assinado: -10000, fornecedor: 'Receita Federal', favorecido_id: 'rf', data_vencimento: '2026-09-30' }),
      cand({ lancamento_id: 'b', valor_assinado: -13750, fornecedor: 'Receita Federal', favorecido_id: 'rf', data_vencimento: '2026-09-30' }),
    ]);
    const soma = r.find((s) => s.tipo === 'nome_soma')!;
    expect(soma.motivo).toBe('nome · soma diferente');
    expect(soma.lancamentos.map((c) => c.lancamento_id).sort()).toEqual(['a', 'b']);
    expect(soma.valorDiferente).toBe(true);
    expect(r.filter((s) => s.tipo === 'nome_valor')).toHaveLength(2);
  });

  it('Receita com os dados do banco hoje (4 × 7.000 + 13.750): também "nome · soma diferente", com os cinco', () => {
    const itens = [7000, 7000, 7000, 7000, 13750].map((v) =>
      cand({ valor_assinado: -v, fornecedor: 'Receita Federal', favorecido_id: 'rf', data_vencimento: '2026-09-30' }));
    const r = sugerirCasamentos({ data: '2026-09-18', historico: PIX('RECEITA FEDERAL', '18'), valor: -22187.46 }, itens);
    expect(r.find((s) => s.tipo === 'nome_soma')?.lancamentos).toHaveLength(5);
  });

  it('vencido de agosto: o selo leva "vencido ago"; do próprio mês, não', () => {
    const r = sugerirCasamentos({ data: '2026-09-04', historico: PIX('JONATAS BARBOSA BATISTA'), valor: -5913.24 }, [
      cand({ valor_assinado: -5913.24, fornecedor: 'Jonatas Barbosa Batista', data_vencimento: '2026-08-05' }),
    ]);
    expect(r[0]).toMatchObject({ motivo: 'mesmo valor · nome · vencido ago', vencido: true });
  });

  it('só o que pode casar: sinal trocado e já conciliado ficam fora', () => {
    const r = sugerirCasamentos({ data: '2026-09-04', historico: PIX('JONATAS BARBOSA BATISTA'), valor: -5913.24 }, [
      cand({ valor_assinado: 5913.24, fornecedor: 'Jonatas Barbosa Batista' }),
      cand({ valor_assinado: -5913.24, fornecedor: 'Jonatas Barbosa Batista', ja_conciliado: true }),
    ]);
    expect(r).toEqual([]);
  });

  it('ordem por tipo (mesmo valor · nome > mesmo valor > soma > nome) e teto de 10', () => {
    const muitos = Array.from({ length: 14 }, (_, i) => cand({ valor_assinado: -500, fornecedor: `Fulano ${i}`, data_vencimento: `2026-09-${String(10 + i).padStart(2, '0')}` }));
    const r = sugerirCasamentos({ data: '2026-09-04', historico: PIX('JONATAS BARBOSA BATISTA'), valor: -500 }, [
      ...muitos, cand({ lancamento_id: 'nome', valor_assinado: -500, fornecedor: 'Jonatas Barbosa Batista', data_vencimento: '2026-09-30' }),
    ]);
    expect(r).toHaveLength(10);
    expect(r[0].lancamentos[0].lancamento_id).toBe('nome');
    /* dentro do mesmo tipo, o mais perto da data primeiro */
    const d = r.slice(1).map((s) => s.diasDiff);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });
});

describe('decisões do Gabriel de 30/09 — soma entre fornecedores e palavras genéricas', () => {
  /* ⚠ O CAMARGO REAL DO NJ: −5.665,00 "fechava" com 6 lançamentos de fornecedores diferentes (seguros, consórcio,
     monitoramento, tarifa), em azul, acima da Amanda. Os valores abaixo são os da tela de 30/09. */
  const SEIS = [
    ['Porto Seguro Companhia de Seguros Gerais', -532.09], ['Khronos Monitoramento Eletronico Ltda', -195.83],
    ['Ademicon Administradora de Consorcios S/A', -4174.24], ['Allianz Seguros S/A', -504.49],
    ['Mapfre Seguros Gerais S.A.', -159.35], ['Banco do Brasil S.A. (001)', -99],
  ] as const;
  const camargo = () => sugerirCasamentos({ data: '2026-09-04', historico: PIX('CAMARGO PROMOCAO DE VENDA'), valor: -5665 }, [
    cand({ lancamento_id: 'amanda', valor_assinado: -3085, fornecedor: 'Amanda Montes Camargo', favorecido_id: 'am', data_vencimento: '2026-09-05' }),
    ...SEIS.map(([f, v], i) => cand({ valor_assinado: v, fornecedor: f, favorecido_id: `f${i}`, data_vencimento: `2026-09-${String(7 + i).padStart(2, '0')}` })),
  ]);

  it('Camargo: não há soma de 6 em azul; a Amanda vem primeiro', () => {
    const r = camargo();
    expect(r[0].lancamentos[0].lancamento_id).toBe('amanda');
    expect(r.some((s) => s.tipo === 'soma')).toBe(false);
    expect(r.every((s) => s.lancamentos.length <= 3 || s.tipo === 'nome_soma')).toBe(true);
  });

  it('soma de fornecedores diferentes: no máximo 3, âmbar, "fornecedores diferentes", depois das pistas de nome', () => {
    const r = sugerirCasamentos({ data: '2026-09-04', historico: PIX('CAMARGO PROMOCAO DE VENDA'), valor: -1000 }, [
      cand({ lancamento_id: 'am', valor_assinado: -300, fornecedor: 'Amanda Montes Camargo', favorecido_id: 'am' }),
      cand({ lancamento_id: 'x', valor_assinado: -600, fornecedor: 'Posto Trevo', favorecido_id: 'x' }),
      cand({ lancamento_id: 'y', valor_assinado: -100, fornecedor: 'Casa Agro', favorecido_id: 'y' }),
    ]);
    expect(r.map((s) => s.tipo)).toEqual(['nome_valor', 'soma_mista']);
    const mista = r[1];
    expect(mista).toMatchObject({ motivo: 'soma de 3 · fornecedores diferentes', valorDiferente: true });
    /* 4 fornecedores diferentes que somam o valor não viram sugestão */
    const quatro = sugerirCasamentos({ data: '2026-09-04', historico: 'Pix Enviado XPTO', valor: -1000 }, [
      cand({ valor_assinado: -250, fornecedor: 'A Um', favorecido_id: 'a' }), cand({ valor_assinado: -250, fornecedor: 'B Dois', favorecido_id: 'b' }),
      cand({ valor_assinado: -250, fornecedor: 'C Tres', favorecido_id: 'c' }), cand({ valor_assinado: -250, fornecedor: 'D Quatro', favorecido_id: 'd' }),
    ]);
    expect(quatro).toEqual([]);
  });

  it('mesmo fornecedor continua 2..8 e azul', () => {
    const r = sugerirCasamentos({ data: '2026-09-15', historico: 'Pagamento de Boleto - XPTO', valor: -1000 },
      [200, 200, 200, 200, 200].map((v) => cand({ valor_assinado: -v, fornecedor: 'Receita Federal', favorecido_id: 'rf' })));
    expect(r[0]).toMatchObject({ tipo: 'soma', valorDiferente: false });
    expect(r[0].lancamentos).toHaveLength(5);
  });

  it('palavra genérica sozinha não casa o nome; com mais uma distintiva, casa', () => {
    expect(forcaDoNome('Pix Enviado JOAO DA SILVA', 'Maria Silva')).toBe(0);
    expect(forcaDoNome('Pagamento de Boleto - BANCO DO BRASIL S/A', 'Banco do Brasil S.A. (001)')).toBe(0);
    expect(forcaDoNome('Pix SEGUROS', 'Allianz Seguros S/A')).toBe(0);
    expect(forcaDoNome('Pagamento de Boleto - BANCO RABOBANK INTERNATIONAL BRASIL S/', 'Banco Rabobank S/A')).toBe(2);
    expect(forcaDoNome(PIX('GUSTAVO F SILVA MERCES'), 'Gustavo Fernando da Silva Merces')).toBe(3);
    /* o pedaço cortado pelo banco também não pode ser genérico (caso real do NJ) */
    expect(forcaDoNome('Pagamento de Boleto - ALVORADA COM DE PROD AGRO', 'Agroinblue - G.F.de Rezende Junqueira')).toBe(0);
    /* e a sugestão some junto */
    expect(sugerirCasamentos({ data: '2026-09-04', historico: 'Pix Enviado JOAO DA SILVA', valor: -500 },
      [cand({ valor_assinado: -120, fornecedor: 'Maria Silva' })])).toEqual([]);
  });
});
