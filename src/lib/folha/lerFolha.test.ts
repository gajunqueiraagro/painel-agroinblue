/**
 * lerFolha — linhas INVENTADAS na forma dos layouts (nomes, códigos, CEI e valores fictícios). ⚠ Holerite real nunca entra aqui.
 */
import { describe, it, expect } from 'vitest';
import { lerFolha, valorDoRecibo, FRASE_NAO_E_FOLHA, fraseViasDiferentes } from './lerFolha';

/* uma via do layout 'nj' */
const viaNj = (cei: string, codigo: string, nome: string, liquido: string, tipo = '13o. | Adiantamento', mes = 'Novembro') => [
  'EMPREGADOR FICTICIO',
  `CEI: | ${cei} | CC: | GERAL | ${tipo}`,
  `Mensalista | ${mes} | de | 2026`,
  'Código | Nome do Funcionário | CBO | Departamento | Filial',
  `${codigo} | ${nome} | 621005 | 1 | 1`,
  'Código | Descrição | Referência | Vencimentos | Descontos',
  `13 | 13 SALARIO ADIANTADO | 50,00 | ${liquido}`,
  'Total de Vencimentos | Total de Descontos',
  `Valor Líquido | ${liquido}`,
];
/* uma via do layout 'sci' */
const viaSci = (codigo: string, nome: string, liquido: string, referencia = 'Adiantamento 13o.Salário Novembro/2026') => [
  '0001 - EMPREGADORA FICTICIA | RECIBO DE PAGAMENTO DE SALÁRIO',
  `CEI: 111.222.333-44 | ${referencia}`,
  'Código | Nome do funcionário | C.C:',
  `${codigo} | ${nome} | CBO : 6210-05 | 1 GERAL`,
  'CÓDIGO | DESCRIÇÕES | REFERÊNCIAS | PROVENTOS | DESCONTOS',
  `0001 | Adiantamento 13° Salário | 6,00 | ${liquido}`,
  `SALÁRIO LÍQUIDO | R$ | ${liquido}`,
];

describe('lerFolha — layout NJ', () => {
  it('2 vias por página contam UMA vez; as páginas de cada pessoa; 2 CEI no mesmo arquivo; tipo e competência; total', () => {
    const r = lerFolha([
      [...viaNj('111111111111', '7', 'FULANO DE TAL', '1.234,56'), ...viaNj('111111111111', '7', 'FULANO DE TAL', '1.234,56')],
      [...viaNj('222222222222', '7', 'BELTRANO SILVA', '800,00'), ...viaNj('222222222222', '7', 'BELTRANO SILVA', '800,00')],
    ]);
    expect(r).toEqual({
      ok: true,
      folha: {
        layout: 'nj', tipo: '13_1', competencia: '2026-11', empregadores: ['111111111111', '222222222222'], total: 2034.56,
        pessoas: [
          { codigo: '7', nome: 'FULANO DE TAL', cei: '111111111111', paginas: [1], valor: 1234.56 },
          { codigo: '7', nome: 'BELTRANO SILVA', cei: '222222222222', paginas: [2], valor: 800 },
        ],
      },
    });
  });
  it('as duas vias com líquidos diferentes: não fecha (nunca escolhe uma)', () => {
    const r = lerFolha([[...viaNj('111111111111', '7', 'FULANO', '100,00'), ...viaNj('111111111111', '7', 'FULANO', '100,01')]]);
    expect(r).toEqual({ ok: false, motivo: 'nao_fecha', frase: fraseViasDiferentes('7') });
  });
});

describe('lerFolha — layout SCI', () => {
  it('13º 1ª parcela: CEI no formato de CPF vira dígitos; a competência pelo "Novembro/2026"', () => {
    const r = lerFolha([[...viaSci('1', 'CICLANO SOUZA', '730,00'), ...viaSci('1', 'CICLANO SOUZA', '730,00')], viaSci('2', 'OUTRO NOME', '1.750,00')]);
    expect('folha' in r && r.folha).toMatchObject({ layout: 'sci', tipo: '13_1', competencia: '2026-11', empregadores: ['11122233344'], total: 2480 });
    expect('folha' in r && r.folha.pessoas.map((p) => [p.codigo, p.paginas])).toEqual([['1', [1]], ['2', [2]]]);
  });
  it('o recibo do mês ("Referente ao mês de Outubro/2026") é mensal 2026-10', () => {
    const r = lerFolha([viaSci('1', 'CICLANO', '2.000,00', 'Referente ao mês de Outubro/2026')]);
    expect('folha' in r && [r.folha.tipo, r.folha.competencia]).toEqual(['mensal', '2026-10']);
  });
});

describe('lerFolha — nunca chuta', () => {
  it('o que não é recibo (guia, previsão de férias, boleto) é "nao_sei"', () => {
    expect(lerFolha([['GUIA DO FGTS DIGITAL', 'Competência 10/2026', 'Valor a recolher | 999,99']])).toEqual({ ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_FOLHA });
    expect(lerFolha([])).toEqual({ ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_FOLHA });
  });
  it('cabeçalho sem tipo conhecido, ou dois tipos/competências no mesmo arquivo, é "nao_sei"', () => {
    expect(lerFolha([viaNj('111111111111', '7', 'FULANO', '100,00', '13o. | Gratificação')]).ok).toBe(false);
    expect(lerFolha([viaNj('111111111111', '7', 'FULANO', '100,00'), viaNj('111111111111', '8', 'OUTRO', '100,00', '13o. | Adiantamento', 'Dezembro')]).ok).toBe(false);
  });
  it('valorDoRecibo: o formato brasileiro com 2 casas, mais nada', () => {
    expect(valorDoRecibo('1.234,56')).toBe(1234.56);
    expect(valorDoRecibo('730,00')).toBe(730);
    expect(valorDoRecibo('1234,5')).toBeNull();
    expect(valorDoRecibo('R$ 10,00')).toBeNull();
  });
});
