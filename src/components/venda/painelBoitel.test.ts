/**
 * PR-OC-BOITEL-PAINEL-01 — o painel lateral da venda em boitel e' UMA conta, termo a termo do motor.
 * Caso real: OC b58bf556 (Vera, Faz. 3 Muchachas, Boitel Sta. Clara), realizado gravado em 31/08/2026; o papel do boitel e
 * o Pix de 28/09 dizem 688.383,46.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { boitelDeLinha } from '@/components/venda/BoitelBlocosModais';
import { derivadosBoitel, bolsoDaVendaBoitel } from '@/components/venda/BoitelNegociacaoDerivado';
import {
  linhasPainelBoitel, residuoDaConta, entregaEmUmaLinha, linhaIdentificacaoBoitel, classeDaCorPainel,
  TITLE_GASTOS_DIRETOS, titleDoFinanceiro, type TermosDoMotor,
} from '@/components/venda/painelBoitel';
import { linhasResumoProdutor } from '@/components/venda/previsaoBoitel';
import { COR_SINAL } from '@/lib/oc/contaCorrente';

/* A linha `realizado` da b58bf556 como o banco a guarda (so' as colunas que o motor le'). */
const LINHA_B58 = {
  quem_abate: 'boitel', modalidade_custo: 'diaria', dias: 104, gmd: 1.503, custo_diaria: 18.76, custo_sanidade: 1526,
  despesas_abate: 4514.57, despesas_abate_no_boitel: true, outros_no_boitel: true, custo_frete: 7983.6, custo_frete_no_boitel: false,
  custo_notas_envio: 3923.84, notas_envio_no_boitel: false, valor_total_abate: 813771.01, valor_total_diarias: 214590.48,
  qtd_abatida: 109, morte_quantidade: 1, possui_adiantamento: true, valor_adiantamento_diarias: 95243.5,
  preco_venda_arroba: 361.41, arrobas_totais_abate: 2251.67, peso_vivo_total_abate: 62075.5, rendimento_saida_pct: 54.41,
  rendimento_entrada_pct: 50, quebra_viagem_pct: 3, custo_oportunidade: 12, peso_saida_fazenda_kg: 408, acerto_papel: 688383.46,
  data_abate: '2026-08-25', data_adiantamento: '2026-05-20',
};

function motorDaB58() {
  const b = boitelDeLinha(LINHA_B58);
  if (!b) throw new Error('linha nao hidratou');
  const d = { ...b, qtdCabecas: 110, pesoInicial: 408 };
  return { termos: derivadosBoitel(d), bolso: bolsoDaVendaBoitel(d) };
}

const TERMOS: TermosDoMotor = {
  fba: 813771.01, dAcertoAbate: 4514.57, dAcertoDiarias: 214590.48, dAcertoSanidade: 1526, dAcertoOutros: 0,
  dAcertoFrete: 0, dAcertoNotas: 0, descontoDoAcerto: 220631.05, valorTotalAntecipadoCalc: 95243.5,
  saldoReceberBase: 688383.46, custosDoProdutor: 11907.44, pParte: 0,
};
const visiveis = (r: ReturnType<typeof linhasPainelBoitel>) => r.linhas.filter(l => l.visivel);
const porChave = (r: ReturnType<typeof linhasPainelBoitel>, k: string) => r.linhas.find(l => l.chave === k);

describe('painel de boitel — modalidade A, realizado', () => {
  it('a b58bf556 pelo MOTOR: a escada fecha ao centavo e diz os numeros do papel', () => {
    const { termos, bolso } = motorDaB58();
    expect(residuoDaConta(termos, bolso, 'boitel')).toBe(0);
    const r = linhasPainelBoitel({ termos, bolso, modalidade: 'boitel', realizado: true, noFinanceiro: 95243.5 });
    expect(r.titulo).toBe('Acerto com o boitel');
    expect(visiveis(r).map(l => [l.rotulo, l.texto])).toEqual([
      ['Faturamento do abate', '813.771,01'],
      ['Despesas do abate', '−4.514,57'],
      ['Diárias · nutrição', '−214.590,48'],
      ['Sanidade', '−1.526,00'],
      ['Saldo do acerto', '593.139,96'],
      ['Adiantamento devolvido', '+95.243,50'],
      ['A RECEBER DO BOITEL', '688.383,46'],
      ['Adiantamento (já era seu)', '−95.243,50'],
      ['Gastos diretos (frete, taxas)', '−11.907,44'],
      ['LÍQUIDO NO BOLSO', '581.232,52'],
      ['Financeiro', '95.243,50'],
    ]);
    expect(porChave(r, 'financeiro')?.diferenca?.texto).toBe('faltam 593.139,96');
  });

  it('mutacao: tirar a sanidade do desconto quebra a escada (a prova mede o que diz)', () => {
    const { termos, bolso } = motorDaB58();
    expect(residuoDaConta({ ...termos, saldoReceberBase: termos.saldoReceberBase + 1526 }, bolso, 'boitel')).toBe(-152600);
  });

  it('cor e sinal: positivo verde, desconto vermelho, totais pelo sinal, Financeiro neutro', () => {
    const r = linhasPainelBoitel({ termos: TERMOS, bolso: 581232.52, modalidade: 'boitel', realizado: true, noFinanceiro: 95243.5 });
    const cores = Object.fromEntries(visiveis(r).map(l => [l.chave, l.cor]));
    expect(cores).toEqual({
      faturamento: 'pos', abate: 'neg', diarias: 'neg', sanidade: 'neg', saldo: 'pos', devolvido: 'pos', receber: 'pos',
      'ja-seu': 'neg', gastos: 'neg', bolso: 'pos', financeiro: 'neutra',
    });
    expect(visiveis(r).filter(l => l.destaque).map(l => l.chave)).toEqual(['receber', 'bolso']);
    expect(visiveis(r).filter(l => l.separador).map(l => l.chave)).toEqual(['saldo', 'receber', 'bolso']);
    /* o "−" e' o tipografico (U+2212), colado ao numero; nunca "-R$" */
    for (const l of visiveis(r)) expect(l.texto).not.toMatch(/R\$|-/);
    expect(porChave(r, 'gastos')?.title).toBe(TITLE_GASTOS_DIRETOS);
    expect(porChave(r, 'financeiro')?.title).toBe('soma das entradas da OC no financeiro: R$ 95.243,50 · faltam R$ 593.139,96 para o a receber do boitel');
  });

  it('a diferenca: "faltam" quando negativa, "sobram" quando positiva, some com zero; sem financeiro e\' "—"', () => {
    const fin = (n: number | null) => porChave(linhasPainelBoitel({ termos: TERMOS, bolso: 581232.52, modalidade: 'boitel', realizado: true, noFinanceiro: n }), 'financeiro');
    expect(fin(304269.5)?.diferenca?.texto).toBe('faltam 384.113,96');
    expect(fin(688383.46)?.diferenca).toBeNull();
    expect(fin(688383.47)?.diferenca?.texto).toBe('sobram 0,01');
    expect(fin(null)?.texto).toBe('—');
    expect(fin(null)?.diferenca).toBeNull();
    expect(fin(688383.47)?.title).toBe('soma das entradas da OC no financeiro: R$ 688.383,47 · sobram R$ 0,01 para o a receber do boitel');
    expect(fin(688383.46)?.title).toBe('soma das entradas da OC no financeiro: R$ 688.383,46');
    expect(titleDoFinanceiro(null, null)).toBe('soma das entradas da OC no financeiro: sem compromissos');
    /* a 7f7de76f: 261.853,50 + 42.416,00 no financeiro contra o papel de 305.371,67 */
    const r7 = linhasPainelBoitel({ termos: { ...TERMOS, saldoReceberBase: 305371.67 }, bolso: 0, modalidade: 'boitel', realizado: true, noFinanceiro: 304269.5 });
    expect(porChave(r7, 'financeiro')?.diferenca?.texto).toBe('faltam 1.102,17');
  });

  it('sem adiantamento as duas linhas dele somem; zero de desconto nao entra', () => {
    const r = linhasPainelBoitel({ termos: { ...TERMOS, valorTotalAntecipadoCalc: 0, saldoReceberBase: 593139.96 }, bolso: 581232.52, modalidade: 'boitel', realizado: true, noFinanceiro: null });
    expect(porChave(r, 'devolvido')?.visivel).toBe(false);
    expect(porChave(r, 'ja-seu')?.visivel).toBe(false);
    expect(porChave(r, 'outros')?.visivel).toBe(false);
    expect(porChave(r, 'frete-boitel')?.visivel).toBe(false);
  });

  it('desconto que o contrato pos no boitel (frete) vira linha propria', () => {
    const r = linhasPainelBoitel({ termos: { ...TERMOS, dAcertoFrete: 7983.6 }, bolso: 1, modalidade: 'boitel', realizado: true, noFinanceiro: null });
    expect(porChave(r, 'frete-boitel')).toMatchObject({ visivel: true, texto: '−7.983,60', cor: 'neg' });
  });

  it('parte do parceiro diferente de zero vira linha, e a escada a conta', () => {
    const r = linhasPainelBoitel({ termos: { ...TERMOS, pParte: 1000 }, bolso: 580232.52, modalidade: 'boitel', realizado: true, noFinanceiro: null });
    expect(porChave(r, 'parceiro')).toMatchObject({ visivel: true, texto: '−1.000,00', cor: 'neg' });
    expect(porChave(linhasPainelBoitel({ termos: TERMOS, bolso: 1, modalidade: 'boitel', realizado: true, noFinanceiro: null }), 'parceiro')?.visivel).toBe(false);
    expect(residuoDaConta({ ...TERMOS, pParte: 1000 }, 580232.52, 'boitel')).toBe(0);
  });

  it('bolso sem dado e\' "—", nunca zero', () => {
    const r = linhasPainelBoitel({ termos: TERMOS, bolso: null, modalidade: 'boitel', realizado: true, noFinanceiro: null });
    expect(porChave(r, 'bolso')).toMatchObject({ texto: '—', cor: 'neutra' });
    expect(residuoDaConta(TERMOS, null, 'boitel')).toBeNull();
  });
});

describe('painel de boitel — projecao e modalidade B', () => {
  it('projecao: tudo ambar, "Financeiro" neutro e SEM a diferenca', () => {
    const r = linhasPainelBoitel({ termos: TERMOS, bolso: 581232.52, modalidade: 'boitel', realizado: false, noFinanceiro: 95243.5 });
    const fin = porChave(r, 'financeiro');
    expect(fin?.diferenca).toBeNull();
    expect(fin?.cor).toBe('neutra');
    expect(visiveis(r).filter(l => l.chave !== 'financeiro').every(l => l.cor === 'projecao')).toBe(true);
  });

  it('B: as tres linhas de sempre com os MESMOS numeros, a cauda comum, e nada de "Financeiro"', () => {
    const t = { ...TERMOS, fba: 965835.14, descontoDoAcerto: 308877.97, custosDoProdutor: 0, valorTotalAntecipadoCalc: 0 };
    const r = linhasPainelBoitel({ termos: t, bolso: 656957.17, modalidade: 'produtor', realizado: true, noFinanceiro: 965835.15 });
    const hoje = linhasResumoProdutor(t);
    expect(r.titulo).toBe('Abate em nome do produtor');
    expect(visiveis(r).map(l => [l.rotulo, l.valor])).toEqual([
      [hoje.linhas[0].rotulo, hoje.linhas[0].valor],
      [hoje.linhas[1].rotulo, -hoje.linhas[1].valor],
      ['(=) Líquido', Math.round(hoje.liquido * 100) / 100],
      ['Gastos diretos (frete, taxas)', 0],
      ['LÍQUIDO NO BOLSO', 656957.17],
    ]);
    expect(r.linhas.some(l => l.chave === 'financeiro')).toBe(false);
    expect(residuoDaConta(t, 656957.17, 'produtor')).toBe(0);
  });
});

describe('peças do painel', () => {
  it('Entrega em uma linha so\' com nada a entregar', () => {
    expect(entregaEmUmaLinha(0)).toBe(true);
    expect(entregaEmUmaLinha(3)).toBe(true);
    expect(entregaEmUmaLinha(-5)).toBe(false);
    expect(entregaEmUmaLinha(null)).toBe(false);
  });

  it('Identificacao: "Data · Fazenda · Tipo" sem os vazios', () => {
    expect(linhaIdentificacaoBoitel('13/05/2026', 'Faz. 3 Muchachas', 'Boitel')).toBe('13/05/2026 · Faz. 3 Muchachas · Boitel');
    expect(linhaIdentificacaoBoitel(null, ' ', 'Boitel')).toBe('Boitel');
    expect(linhaIdentificacaoBoitel(null, null, null)).toBe('—');
  });

  it('a cor tem um dono so\': o sinal vem de COR_SINAL (os mesmos hex da conta corrente) e a projecao, da tela', () => {
    expect(COR_SINAL).toEqual({ neg: 'text-[#b91c1c]', pos: 'text-[#15803d]' });
    expect(classeDaCorPainel('neg', 'ambar')).toBe(COR_SINAL.neg);
    expect(classeDaCorPainel('pos', 'ambar')).toBe(COR_SINAL.pos);
    expect(classeDaCorPainel('projecao', 'ambar')).toBe('ambar');
    expect(classeDaCorPainel('neutra', 'ambar')).toBeUndefined();
  });
});
