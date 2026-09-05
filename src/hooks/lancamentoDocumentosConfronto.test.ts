/**
 * O que este teste trava — o confronto é LIDO do banco, nunca somado na tela.
 *
 * ⚠ A PERGUNTA "QUANTO ESTÁ DOCUMENTADO" TEM UMA RESPOSTA SÓ, e ela mora em
 * `fin_documento_confronto`: soma `valor_documento` dos documentos não cancelados, compara
 * com o valor do lançamento e devolve `confere` com tolerância de R$ 0,01, exigindo ao
 * menos um documento COM valor. Se o front somasse por conta própria, a primeira
 * divergência (documento sem valor, cancelado no mesmo instante, arredondamento) deixaria
 * duas respostas na tela sem dizer qual vale — o defeito que já apareceu no `perContaSaldos`
 * e no selo do mês.
 *
 * ⚠ E AUSENTE NÃO É ZERO: sem envelope, `daConfronto` devolve `null` e o topo mostra "—".
 * Zero afirmaria que se conferiu e não há nada; `null` diz que ainda não se perguntou.
 */
import { describe, it, expect } from 'vitest';
import { daConfronto } from '@/hooks/useLancamentoDocumentos';

describe('daConfronto — o envelope do banco vira o topo da aba', () => {
  it('lê os seis campos como o banco os nomeia', () => {
    const c = daConfronto({
      valor_lancamento: 701428.17, valor_documentado: 701428.17,
      docs_ativos: 1, docs_com_valor: 1, diferenca: 0, confere: true,
    });
    expect(c).toEqual({
      valorLancamento: 701428.17, valorDocumentado: 701428.17,
      docsAtivos: 1, docsComValor: 1, diferenca: 0, confere: true,
    });
  });

  it('sem envelope devolve null — o topo dirá "—", não zero', () => {
    expect(daConfronto(null)).toBeNull();
    expect(daConfronto(undefined)).toBeNull();
  });

  it('`confere` só é verdadeiro quando o banco disse que é', () => {
    /* ⚠ NÃO SE INFERE `confere` DA DIFERENÇA. O banco também exige `docs_com_valor > 0`:
       um documento sem valor informado deixa a diferença em zero por acidente, e dizer
       "confere" ali afirmaria uma conferência que ninguém fez. */
    const semValor = daConfronto({
      valor_lancamento: 0, valor_documentado: 0,
      docs_ativos: 1, docs_com_valor: 0, diferenca: 0, confere: false,
    });
    expect(semValor!.diferenca).toBe(0);
    expect(semValor!.confere).toBe(false);
  });

  it('a diferença chega com sinal — "a mais" e "a menos" saem dele', () => {
    const aMais = daConfronto({
      valor_lancamento: 100, valor_documentado: 130,
      docs_ativos: 2, docs_com_valor: 2, diferenca: 30, confere: false,
    });
    const aMenos = daConfronto({
      valor_lancamento: 100, valor_documentado: 70,
      docs_ativos: 1, docs_com_valor: 1, diferenca: -30, confere: false,
    });
    expect(aMais!.diferenca).toBeGreaterThan(0);
    expect(aMenos!.diferenca).toBeLessThan(0);
  });

  it('campos ausentes viram zero, e `confere` só com o booleano verdadeiro', () => {
    /* Envelope incompleto não deve explodir a tela; mas também não vira "confere". */
    const c = daConfronto({ valor_lancamento: 10 });
    expect(c!.valorDocumentado).toBe(0);
    expect(c!.confere).toBe(false);
  });
});
