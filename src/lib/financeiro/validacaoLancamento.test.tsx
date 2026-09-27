/**
 * BOITEL-ABATE-PRODUTOR-01d — a direcao do lancamento se confere contra a CONTA DO PLANO, nao contra a macro.
 *
 * ⚠ NASCE DA cd4c54b0 (RRCC, 27/09/2026): a despesa "Boitel 169 G - Acerto boitel", Saidas, R$ 228.481,96, no 1155
 *   "Acerto de Boitel (despesas)" nao salvava — "Inconsistencia entre tipo de operacao e macro". O 1155 e' 2-Saidas sob a
 *   macro Receita Operacional (opcao C do B-01), a UNICA conta do plano assim.
 * ⚠ OS COMBOS ABAIXO SAO O PLANO MEDIDO em 27/09/2026 (226 linhas ativas, `select macro_custo, tipo_operacao, count(*)`):
 *   220 com macro checada, 219 com o tipo da conta igual ao sentido da macro, 1 diferente (o 1155); 6 sem checagem
 *   (Tributos 5, Transferencias 1). O caso "demais identicos" varre os onze combos contra a regra ANTIGA copiada aqui.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassificacaoLancamento, type ClassificacaoValor } from '@/components/shared/ClassificacaoLancamento';
import { validarLancamento, erroDeDirecao, tipoDaContaNoPlano } from '@/lib/financeiro/validacaoLancamento';

/* A regra 3 de ANTES, copiada de 519dccd8 (validacaoLancamento.ts:44-60) so' para comparar. */
const ENTRADA_ANTIGA = new Set(['Receita Operacional', 'Entrada Financeira']);
const SAIDA_ANTIGA = new Set(['Custeio Produção', 'Saída Financeira', 'Dividendos', 'Investimento na Fazenda',
  'Deduções de Receitas', 'Investimento em Bovinos']);
const recusavaAntes = (macro: string, tipo: string) =>
  (ENTRADA_ANTIGA.has(macro) && tipo !== '1-Entradas') || (SAIDA_ANTIGA.has(macro) && tipo !== '2-Saídas');

/* O plano medido: [macro, tipo da conta, linhas]. */
const PLANO: ReadonlyArray<[string, string, number]> = [
  ['Custeio Produção', '2-Saídas', 117], ['Deduções de Receitas', '2-Saídas', 8], ['Dividendos', '2-Saídas', 23],
  ['Entrada Financeira', '1-Entradas', 8], ['Investimento em Bovinos', '2-Saídas', 3],
  ['Investimento na Fazenda', '2-Saídas', 23], ['Receita Operacional', '1-Entradas', 31],
  ['Receita Operacional', '2-Saídas', 1], ['Saída Financeira', '2-Saídas', 6],
  ['Transferências', '3-Transferências', 1], ['Tributos', '2-Saídas', 5],
];
const TIPOS = ['1-Entradas', '2-Saídas', '3-Transferências'];

const CLASSIF = [
  { id: 'p1155', subcentro: 'Acerto de Boitel (despesas)', tipo_operacao: '2-Saídas', macro_custo: 'Receita Operacional' },
  { id: 'p1150', subcentro: 'Venda em Boitel', tipo_operacao: '1-Entradas', macro_custo: 'Receita Operacional' },
  { id: 'pmo', subcentro: 'Mão de Obra', tipo_operacao: '2-Saídas', macro_custo: 'Custeio Produção' },
  { id: 'ptr', subcentro: 'Transferência entre Contas', tipo_operacao: '3-Transferências', macro_custo: 'Transferências' },
  /* combinacao legada: sem id, com o tipo do LANCAMENTO */
  { subcentro: 'Frete Legado', tipo_operacao: '1-Entradas', macro_custo: 'Custeio Produção' },
];

describe('a direcao contra a conta do plano', () => {
  it('saida no 1155 passa — o caso da cd4c54b0', () => {
    const tipo_plano = tipoDaContaNoPlano(CLASSIF, 'p1155', 'Acerto de Boitel (despesas)');
    expect(tipo_plano).toBe('2-Saídas');
    expect(validarLancamento({ tipo_operacao: '2-Saídas', macro_custo: 'Receita Operacional',
      subcentro: 'Acerto de Boitel (despesas)', status_transacao: 'realizado', tipo_plano })).toEqual([]);
    /* e a busca sabe achar: sem o tipo do plano, a macro recusa como antes */
    expect(validarLancamento({ tipo_operacao: '2-Saídas', macro_custo: 'Receita Operacional',
      subcentro: 'Acerto de Boitel (despesas)', status_transacao: 'realizado' })).toHaveLength(1);
  });

  it('entrada no 1155 recusa, no campo Subcentro, dizendo o que esta errado', () => {
    const erros = validarLancamento({ tipo_operacao: '1-Entradas', macro_custo: 'Receita Operacional',
      subcentro: 'Acerto de Boitel (despesas)', tipo_plano: '2-Saídas' });
    expect(erros).toEqual([{ campo: 'subcentro',
      mensagem: '"Acerto de Boitel (despesas)" é conta de saída, e o lançamento está como Entrada. Troque o Tipo ou o Subcentro.' }]);
  });

  it('receita no 1150 e custo na Mao de Obra seguem como antes, nos dois sentidos', () => {
    expect(erroDeDirecao({ tipo_operacao: '1-Entradas', macro_custo: 'Receita Operacional', subcentro: 'Venda em Boitel', tipo_plano: '1-Entradas' })).toBeNull();
    expect(erroDeDirecao({ tipo_operacao: '2-Saídas', macro_custo: 'Receita Operacional', subcentro: 'Venda em Boitel', tipo_plano: '1-Entradas' })).not.toBeNull();
    expect(erroDeDirecao({ tipo_operacao: '2-Saídas', macro_custo: 'Custeio Produção', subcentro: 'Mão de Obra', tipo_plano: '2-Saídas' })).toBeNull();
    expect(erroDeDirecao({ tipo_operacao: '1-Entradas', macro_custo: 'Custeio Produção', subcentro: 'Mão de Obra', tipo_plano: '2-Saídas' })).not.toBeNull();
  });

  it('demais identicos: em todo combo do plano a decisao nova e a antiga, e so o 1155 muda', () => {
    let comparados = 0;
    const mudaram: string[] = [];
    for (const [macro, tipoConta, linhas] of PLANO) {
      for (const tipo of TIPOS) {
        const novo = erroDeDirecao({ tipo_operacao: tipo, macro_custo: macro, subcentro: 'x', tipo_plano: tipoConta }) !== null;
        comparados += linhas;
        if (novo !== recusavaAntes(macro, tipo)) mudaram.push(`${macro}|${tipoConta}|${tipo}`);
      }
    }
    /* 226 linhas x 3 tipos: o conjunto comparado nao e' vazio */
    expect(comparados).toBe(226 * 3);
    expect(mudaram).toEqual([
      'Receita Operacional|2-Saídas|1-Entradas',
      'Receita Operacional|2-Saídas|2-Saídas',
    ]);
  });

  it('o tipo do plano: a chave ganha do texto, legado sem id e transferencia nao respondem', () => {
    expect(tipoDaContaNoPlano(CLASSIF, 'p1150', 'Acerto de Boitel (despesas)')).toBe('1-Entradas');
    expect(tipoDaContaNoPlano(CLASSIF, null, ' acerto de boitel (despesas) ')).toBe('2-Saídas');
    expect(tipoDaContaNoPlano(CLASSIF, null, 'Frete Legado')).toBeNull();
    expect(tipoDaContaNoPlano(CLASSIF, 'ptr', 'Transferência entre Contas')).toBeNull();
    expect(tipoDaContaNoPlano(CLASSIF, null, '')).toBeNull();
    /* legado: sem tipo do plano, a macro decide como antes */
    expect(erroDeDirecao({ tipo_operacao: '1-Entradas', macro_custo: 'Custeio Produção', subcentro: 'Frete Legado', tipo_plano: null })).not.toBeNull();
  });
});

describe('a recusa mora embaixo do Subcentro (UX-TOAST-01)', () => {
  const VALOR: ClassificacaoValor = {
    atividade: 'pecuaria', safra_id: '', cultura: '', fase: '', subcentro: 'Acerto de Boitel (despesas)',
    macro_custo: 'Receita Operacional', grupo_custo: 'Receita Pecuária', centro_custo: 'Venda Peso Vivo',
    escopo_negocio: 'pecuaria', plano_conta_id: 'p1155',
  };
  const montar = (erroSubcentro: string | null) => render(
    <ClassificacaoLancamento value={VALOR} onChange={() => {}} classificacoes={[]} dataCompetencia="2024-06-17"
      tipoOperacao="1-Entradas" erroSubcentro={erroSubcentro} />);

  it('com a recusa, a frase aparece como alerta; sem ela, nada', () => {
    const texto = erroDeDirecao({ tipo_operacao: '1-Entradas', macro_custo: 'Receita Operacional',
      subcentro: 'Acerto de Boitel (despesas)', tipo_plano: '2-Saídas' });
    const { unmount } = montar(texto);
    expect(screen.getByRole('alert').textContent).toBe(texto);
    unmount();
    montar(null);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
