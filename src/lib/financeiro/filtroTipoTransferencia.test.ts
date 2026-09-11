/**
 * O FILTRO "TIPO = TRANSFERÊNCIAS" — FIN-LISTA-FILTRO-TIPO-01.
 *
 * ⚠ O BANCO TEM DUAS GRAFIAS, e é fato medido, não hipótese: 822 linhas em
 * `'3-Transferências'` e 7 em `'3-Transferência'` (NJ, proto, 11/09/2026). Uma igualdade
 * simples escondia as sete — poucas o bastante para ninguém conferir, que é exatamente o que
 * torna esse tipo de falta cara: some sem deixar rastro.
 * ⚠ ENTRADAS E SAÍDAS CONTINUAM IGUALDADE. Elas não têm legado de grafia, e transformá-las em
 * `in(...)` seria inventar uma variação que não existe.
 */
import { describe, it, expect } from 'vitest';
import { montarPlanoBaseV2, type FiltrosV2 } from './filtrosBaseV2';

const CLI = 'cli-1';
const plano = (f: FiltrosV2) => montarPlanoBaseV2(CLI, f, { relacao: 'tabela' });

describe('Tipo = Transferências', () => {
  it('cobre as duas grafias, e por `in`, não por igualdade', () => {
    const p = plano({ tipo_operacao: '3-Transferências' });
    expect(p.tipoOperacao).toBeUndefined();
    expect(p.orTipoOperacao).toContain('3-Transferências');
    expect(p.orTipoOperacao).toContain('3-Transferência"');
  });

  it('a grafia legada escolhida no filtro também traz as duas', () => {
    /* O Select só emite o plural, mas um filtro restaurado de sessão antiga pode trazer o
       singular — e ele não pode significar "só as sete". */
    expect(plano({ tipo_operacao: '3-Transferência' }).orTipoOperacao)
      .toBe(plano({ tipo_operacao: '3-Transferências' }).orTipoOperacao);
  });
});

describe('os outros valores do filtro Tipo', () => {
  it('Entradas é igualdade exata', () => {
    const p = plano({ tipo_operacao: '1-Entradas' });
    expect(p.tipoOperacao).toBe('1-Entradas');
    expect(p.orTipoOperacao).toBeUndefined();
  });

  it('Saídas é igualdade exata', () => {
    const p = plano({ tipo_operacao: '2-Saídas' });
    expect(p.tipoOperacao).toBe('2-Saídas');
    expect(p.orTipoOperacao).toBeUndefined();
  });

  it('Todos não gera predicado nenhum de tipo', () => {
    const p = plano({});
    expect(p.tipoOperacao).toBeUndefined();
    expect(p.orTipoOperacao).toBeUndefined();
  });

  it('origem E destino juntos ignoram o Tipo — a RPC impõe a transferência', () => {
    /* Regra anterior preservada: com as duas contas o recorte JÁ é a transferência entre
       elas, e mandar o tipo do filtro conflitaria com o que a própria consulta impõe. */
    const p = plano({ tipo_operacao: '2-Saídas', conta_bancaria_id: 'a', conta_destino_id: 'b' });
    expect(p.transferenciaEntreContas).toEqual({ origem: 'a', destino: 'b' });
    expect(p.tipoOperacao).toBeUndefined();
    expect(p.orTipoOperacao).toBeUndefined();
  });
});
