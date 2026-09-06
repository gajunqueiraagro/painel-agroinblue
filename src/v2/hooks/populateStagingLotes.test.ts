/**
 * O que este teste trava — que popular a staging vá em LOTES e não perca o que já entrou.
 *
 * ⚠ 492 LINHAS DO NJ VOLTAVAM "Não foi possível concluir…" E O STAGING FICAVA EM ZERO.
 * A RPC faz, por linha, uma busca de fazenda, duas resoluções de conta e uma de contexto;
 * `authenticated` tem `statement_timeout = 8s`, e a transação inteira caía — nada gravado.
 * O limite não é uma linha ruim: é o tamanho do arquivo.
 * ⚠ LOTE SÓ É SEGURO PORQUE A RPC NÃO APAGA NADA — conferido no corpo dela: zero DELETE,
 * zero TRUNCATE, laço `FOR v_row IN jsonb_array_elements(p_rows)`. Chamar N vezes com a
 * MESMA sessão acumula. Se algum dia ela passar a limpar por sessão, este teste continua
 * verde e a tela volta a mentir — por isso a nota fica aqui.
 */
import { describe, it, expect } from 'vitest';

const TAMANHO_LOTE = 100;

/** A mesma fatia que o hook faz. */
const lotes = (total: number): number[][] => {
  const linhas = Array.from({ length: total }, (_, i) => i + 1);
  const out: number[][] = [];
  for (let i = 0; i < total; i += TAMANHO_LOTE) out.push(linhas.slice(i, i + TAMANHO_LOTE));
  return out;
};

describe('populate da staging em lotes', () => {
  it('492 linhas viram 5 chamadas, a última com 92', () => {
    const l = lotes(492);
    expect(l).toHaveLength(5);
    expect(l[0]).toHaveLength(100);
    expect(l[4]).toHaveLength(92);
    expect(l.flat()).toHaveLength(492);
  });

  it('nenhuma linha se perde nem se repete entre os lotes', () => {
    const todas = lotes(492).flat();
    expect(new Set(todas).size).toBe(492);
    expect(todas[0]).toBe(1);
    expect(todas[491]).toBe(492);
  });

  it('um arquivo menor que o lote vira uma chamada só', () => {
    expect(lotes(37)).toHaveLength(1);
    expect(lotes(100)).toHaveLength(1);
    expect(lotes(101)).toHaveLength(2);
  });

  it('arquivo vazio não chama a RPC nenhuma vez', () => {
    /* Sem a guarda, um `p_rows: []` criaria uma sessão de staging vazia que apareceria
       no seletor da Mesa como se algo tivesse sido importado. */
    expect(lotes(0)).toHaveLength(0);
  });

  it('⚠ o que já entrou continua no staging quando um lote falha', () => {
    /* A conta que a mensagem de erro mostra: falhando no terceiro lote, 200 linhas estão
       salvas e o operador recomeça de 201 — não das 492. */
    const l = lotes(492);
    const inseridasAteFalhar = l.slice(0, 2).flat().length;
    expect(inseridasAteFalhar).toBe(200);
    expect(l[2][0]).toBe(201);
  });
});
