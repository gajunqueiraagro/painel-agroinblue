import { describe, it, expect } from 'vitest';
import { realizadoAplicadoNoLote } from '@/components/venda/BoitelNegociacaoDerivado';
import { boitelVazio } from '@/components/venda/BoitelBlocosModais';

/* OC-BOITEL-VALOR-01 A2 — quando o valor do lote deixa de ser da projecao.
   O predicado e' o de `oc_salvar_lotes` (migration 20261027145000): linha `realizado` com
   `qtd_abatida` E `valor_total_abate`. Se ele divergir do banco, a tela mostra um valor
   editavel que o banco ignora — ou regrava a projecao por cima do acerto, que foi o defeito
   da OC 8b211cae (882.608,62 desfeito pelo Confirmar 15 s depois). */
describe('realizadoAplicadoNoLote', () => {
  it('sem linha realizado, a projecao continua mandando', () => {
    expect(realizadoAplicadoNoLote(null)).toBe(false);
  });

  it('o rascunho do realizado (copia da projecao) NAO conta', () => {
    // `iniciarRealizadoBoitel` semeia uma copia do projetado: tem dias, GMD e preco, e
    // nao tem os dois fatos do papel. Contar isto como realizado travaria o lote no
    // valor da projecao sem o operador ter lancado nada.
    const rascunho = { ...boitelVazio(), dias: 132, gmd: 1.2, precoVendaArroba: 300, custoDiaria: 18 };
    expect(realizadoAplicadoNoLote(rascunho)).toBe(false);
  });

  it('um dos dois fatos sozinho nao basta — o banco exige os dois', () => {
    expect(realizadoAplicadoNoLote({ ...boitelVazio(), qtdAbatida: 209 })).toBe(false);
    expect(realizadoAplicadoNoLote({ ...boitelVazio(), valorTotalAbate: 1379192.62 })).toBe(false);
  });

  it('com os dois fatos o lote e do acerto — e zero e valor, nao ausencia', () => {
    expect(realizadoAplicadoNoLote({ ...boitelVazio(), qtdAbatida: 209, valorTotalAbate: 1379192.62 })).toBe(true);
    // `boitelDeLinha` traduz NULL do banco para `undefined` e 0 para 0 (`zeroEValor`). O
    // banco testa IS NOT NULL, entao 0 conta como preenchido nos dois lados.
    expect(realizadoAplicadoNoLote({ ...boitelVazio(), qtdAbatida: 0, valorTotalAbate: 0 })).toBe(true);
  });
});
