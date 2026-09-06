/**
 * O que este teste trava — que uma decomposição que não explica o líquido seja DETECTÁVEL.
 *
 * ⚠ ESTA É A CONTA DA FAIXA DO MODAL, e ela existe por causa de um caso real. Na OC
 * 9b2b5e6b os quatro lotes foram gravados certos às 15:28 (375,00/@ nos dois primeiros) e
 * reescritos às 17:04 com 362,00/@ em três deles. O líquido caiu junto — e às 17:48 foi
 * restaurado à mão, com R$ 13,00/@ lançados como "bônus lista/trace", que a NF não tem.
 * O total voltou a fechar; a decomposição passou a mentir.
 *
 * ⚠ NENHUM CÓDIGO FEZ ISSO. Verificado no modal: ele copia a linha e não a ajusta, o campo
 * de bônus só emite ao digitar, e a mescla banco+rascunho é fiel. Quem "fez bater" foi
 * gente — e conseguiu porque a tela não dizia que o número tinha deixado de bater. Por isso
 * a saída é acusar a diferença, e não impedir a digitação: quem conhece a nota decide.
 */
import { describe, it, expect } from 'vitest';
import { buildAbateCalculation } from '@/lib/calculos/abate';
import { paraCalculo, linhaVazia, type LoteAbate } from './calculoDoLote';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';

const LOTE: LoteAbate = {
  id: 'l', ordem: 1, categoria: 'garrotes', categoriaLabel: 'Garrotes',
  quantidade: 41, pesoMedioKg: 540.22,
};

/** O lote 7914 como a NF o descreve; `precoArroba` e `valorLiquido` variam por caso. */
const linhaDoLote = (precoArroba: number, valorLiquido: number): LinhaAbate => ({
  ...linhaVazia('l'),
  pesoCarcacaKg: 12260.80, pesoCarcacaFonte: 'total',
  precoArroba, precoFonte: 'arroba',
  bonusPrecoce: { valor: 8409.85, fonte: 'reais' },
  bonusQualidade: { valor: 600, fonte: 'reais' },
  funrural: { valor: 614.24, fonte: 'reais' },
  valorLiquido,
});

/** A mesma conta da faixa: gravado − o que os campos produzem. */
const divergencia = (l: LinhaAbate): number | null => {
  if (l.valorLiquido == null) return null;
  const dif = l.valorLiquido - buildAbateCalculation(paraCalculo(l, LOTE)).valorLiquido;
  return Math.abs(dif) > 0.015 ? dif : null;
};

describe('divergência entre o líquido gravado e os campos', () => {
  it('decomposição fiel à NF não acusa nada', () => {
    expect(divergencia(linhaDoLote(375, 314915.61))).toBeNull();
  });

  it('preço trocado para 362 com o líquido da NF acusa os R$ 13,00/@', () => {
    /* Exatamente o estado de 17:48: preço 362 e líquido 314.915,61 mantido. A diferença é
       (375 − 362) × 817,39 @ = R$ 10.626,07 — o tamanho do bônus que foi inventado para
       fechar. É esse número que a faixa mostra. */
    const dif = divergencia(linhaDoLote(362, 314915.61));
    expect(dif).not.toBeNull();
    if (dif == null) return;                       // narrowing: o repo não usa cast
    expect(dif).toBeCloseTo((375 - 362) * (12260.80 / 15), 2);
  });

  it('um centavo não vira alarme — a tolerância é 0,01', () => {
    expect(divergencia(linhaDoLote(375, 314915.62))).toBeNull();
  });

  it('lote sem líquido gravado não acusa: ausência não é divergência', () => {
    const semLiquido: LinhaAbate = { ...linhaDoLote(375, 0), valorLiquido: null };
    expect(divergencia(semLiquido)).toBeNull();
  });

  it('⚠ o acerto manual precisou de DOIS erros para fechar, não de um', () => {
    /* O estado de 17:48, reproduzido: preço 362, lista/trace de R$ 10.645,33 — e a carcaça
       gravada como 12.260,00 kg, quando a NF diz 12.260,80. Só com os dois o líquido volta
       a fechar e a faixa se cala.
       ⚠ COM A CARCAÇA CERTA, O ACERTO NÃO FECHA: sobram R$ 19,30 — a lib arredonda a base
       e a conta direta (0,80 kg ÷ 15 × 362) daria 19,31. Foram os "R$ 20 que faltavam"
       do curativo. Ou seja, fazer a conta
       bater à mão exigiu mexer também no peso — e é isso que um bônus de fechamento
       cobra: ele arrasta outro campo junto, e nenhum dos dois volta a ser verdade. */
    const comoEstavaNoBanco: LinhaAbate = {
      ...linhaDoLote(362, 314915.61),
      pesoCarcacaKg: 12260.00,
      bonusListaTrace: { valor: 10645.33, fonte: 'reais' },
    };
    expect(divergencia(comoEstavaNoBanco)).toBeNull();

    const comACarcacaDaNota: LinhaAbate = {
      ...comoEstavaNoBanco,
      pesoCarcacaKg: 12260.80,
    };
    const sobra = divergencia(comACarcacaDaNota);
    expect(sobra).not.toBeNull();
    if (sobra == null) return;
    expect(sobra).toBeCloseTo(-19.30, 2);
  });
});
