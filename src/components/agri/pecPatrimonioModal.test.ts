/**
 * A COLUNA "ARROBAS × R$/@" FECHA NA CALCULADORA — VARIACAO-REBANHO-MODAL-01-fix5.
 *
 * ⚠ ELA PROMETE UMA MULTIPLICAÇÃO, e o operador vai fazê-la. Se o preço de uma linha vier de
 * outra, o produto dá um número que não está na tela ao lado — foi o que aconteceu até o fix5: a
 * linha da Produção usava o R$/@ do início da metade ESQUERDA (245,55, ponderado pelo rebanho do
 * INÍCIO) sobre as arrobas do FIM, e 39.233 × 245,55 dava 9.634.161 contra os 9.680.106 impressos
 * na célula vizinha. Quarenta e cinco mil de diferença numa coluna que existe para ser conferida.
 *
 * ⚠ A TOLERÂNCIA É `0,005 × arrobas`, E O NÚMERO NÃO É ESCOLHIDO: é exatamente o que o
 * arredondamento do preço a DUAS CASAS pode custar — meio centavo por arroba. Pedir menos que isso
 * seria pedir que a tela mostrasse mais casas do que mostra. (O briefing pedia `0,0005 × @`, dez
 * vezes menos, e nenhuma implementação correta passaria.)
 *
 * ⚠ E OS DOIS PREÇOS DO MESMO MÊS SÃO DIFERENTES DE PROPÓSITO: 245,55 é o preço de P0 ponderado
 * pelo rebanho do início; 246,73 é o MESMO preço de P0 ponderado pelo rebanho do FIM. A mistura de
 * categorias mudou no meio do período, então a média muda com ela. Um caso afirma essa diferença
 * para que ninguém a "conserte" igualando os dois.
 */
import { describe, it, expect } from 'vitest';
import { caminhadaDoValor } from '@/components/agri/PecPatrimonioModal';

/** Os números medidos no SR jan-ago/21, cliente inteiro. */
const SR = {
  at0: 35201.84, at1: 39233.20,
  v0: 8643826.74, v1p0: 9680105.46, v1p1: 12031963.06,
  dProd: 1036278.72, dMerc: 2351857.60, dTotal: 3388136.32,
};

/** O que a tela mostra: arrobas sem casas, preço com duas. */
const arred = (v: number, casas: number) => Number(v.toFixed(casas));

describe('caminhadaDoValor', () => {
  it('as quatro linhas, e a última repete o valor do fim', () => {
    const p = caminhadaDoValor(SR);
    expect(p).toHaveLength(4);
    expect(p[0].valor).toBeCloseTo(SR.v0, 2);
    expect(p[1].valor).toBeCloseTo(SR.v1p0, 2);
    expect(p[2].valor).toBeCloseTo(SR.v1p1, 2);
    /* ⚠ A ÚLTIMA LINHA É O MESMO NÚMERO DO "Valor" DO FIM da metade esquerda — é assim que o leigo
       confere que a conta fecha, sem somar nada. */
    expect(p[3].valor).toBeCloseTo(SR.v1p1, 2);
    expect(p[0].variacao).toBeNull();
    expect(p[3].variacao).toBeCloseTo(SR.dTotal, 2);
  });

  it('o produto do que está na tela reproduz o valor, dentro do arredondamento', () => {
    for (const passo of caminhadaDoValor(SR)) {
      const at = arred(passo.arrobas!, 0);
      const pk = arred(passo.preco!, 2);
      const tolerancia = 0.005 * passo.arrobas!;
      expect(Math.abs(at * pk - passo.valor)).toBeLessThanOrEqual(tolerancia);
    }
  });

  it('os preços que a tela imprime são os medidos', () => {
    const p = caminhadaDoValor(SR);
    expect(arred(p[0].preco!, 2)).toBe(245.55);
    expect(arred(p[1].preco!, 2)).toBe(246.73);
    expect(arred(p[2].preco!, 2)).toBe(306.68);
  });

  it('o preço da Produção NÃO é o R$/@ do início — e a diferença é real', () => {
    const p = caminhadaDoValor(SR);
    const pkInicio = SR.v0 / SR.at0;          // o da metade esquerda: ponderado pelo INÍCIO
    const pkProducao = p[1].preco!;            // o da caminhada: o mesmo mês, ponderado pelo FIM
    expect(arred(pkProducao, 2)).not.toBe(arred(pkInicio, 2));

    /* ⚠ E O ESTRAGO DE IGUALÁ-LOS, medido: emprestar o preço da esquerda erra por R$ 45.944 numa
       linha que a tela manda multiplicar. Sem este caso, "consertar" a divergência passaria verde. */
    const errado = arred(SR.at1, 0) * arred(pkInicio, 2);
    expect(Math.abs(errado - SR.v1p0)).toBeGreaterThan(40000);
  });

  it('rebanho zerado no fim não inventa preço', () => {
    const p = caminhadaDoValor({ ...SR, at1: 0, v1p0: 0, v1p1: 0 });
    expect(p[1].arrobas).toBeNull();
    expect(p[1].preco).toBeNull();
    /* ⚠ E A PRIMEIRA LINHA CONTINUA COM NÚMERO: o rebanho acabou, não deixou de ter existido. */
    expect(p[0].preco).toBeCloseTo(245.55, 2);
  });
});
