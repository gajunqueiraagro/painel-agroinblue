/**
 * BOITEL-ABATE-PRODUTOR-01 — a previsao de caixa da venda boitel nas DUAS modalidades.
 *
 * ⚠ A: a previsao de sempre, IDENTICA — o corpo saiu do `VendaModalShell` sem mudanca de comportamento, e o
 *   quem-abate so' muda alguma coisa quando e' 'produtor'.
 * ⚠ B: dois titulos reais — o frigorifico paga o produtor (principal, 1150) e o produtor paga o boleto do boitel
 *   (acerto_boitel, 1155) —, o acerto ANTES do principal (a guarda do banco so' aceita o principal bruto depois
 *   do acerto), e nada de "a receber do boitel". Os numeros sao os da 77d963be (RRCC, 193 garrotes): abate
 *   965.835,14; diarias 306.102,83 + notas 2.775,14 no boitel = 308.877,97; liquido 656.957,17.
 */
import { describe, it, expect } from 'vitest';
import {
  linhasPrevisaoBoitel, valoresDoProdutor, avisoBoitelProdutor, linhasResumoProdutor, SUBCENTRO_ACERTO_BOITEL,
  type EntradaPrevisaoBoitel,
} from '@/components/venda/previsaoBoitel';
import { boitelVazio } from '@/components/venda/BoitelBlocosModais';
import { valorDaVendaBoitel, derivadosBoitel, type BoitelEdicao } from '@/components/venda/BoitelNegociacaoDerivado';

const BOITEL = 'boitel-ricardo';
const JBS = 'frigorifico-jbs';
const LOTE = 'b0781eb6-e92c-44ca-aa45-d40fe043e8f1';

const PROJETADO: BoitelEdicao = {
  ...boitelVazio(),
  qtdCabecas: 193, pesoInicial: 393.97, dias: 110, gmd: 1.5, rendimentoEntrada: 50, rendimento: 55,
  custoDiaria: 15.11, precoVendaArroba: 240,
};
const REALIZADO: BoitelEdicao = {
  ...PROJETADO, dias: 105, qtdAbatida: 193, pesoVivoTotalAbate: 106150, arrobasTotaisAbate: 3892.81,
  valorTotalAbate: 965835.14, valorTotalDiarias: 306102.83, custoNotasEnvio: 2775.14, notasEnvioNoBoitel: true,
  dataAbate: '2023-10-18',
};
const LIQUIDO = 656957.17;

function entrada(quem: 'boitel' | 'produtor', slot: number, frigorificoId = JBS): EntradaPrevisaoBoitel {
  const projetado = { ...PROJETADO, quemAbate: quem, frigorificoId };
  const realizado = { ...REALIZADO, quemAbate: quem, frigorificoId };
  return {
    boitelData: projetado, boitelRealSalvo: realizado, compradorId: BOITEL, data: '2023-07-05',
    lotes: [{ id: LOTE, categoria: 'garrotes', quantidade: '193' }],
    vendaBoitel: valorDaVendaBoitel({ slot, realizado, projetado }),
  };
}

describe('modalidade A (boitel abate) — a previsao de sempre', () => {
  it('um principal do slot, ligado ao lote, favorecido = boitel; sem acerto_boitel', () => {
    const l = linhasPrevisaoBoitel(entrada('boitel', LIQUIDO)) ?? [];
    const principal = l.find(x => x.natureza === 'principal');
    expect(principal).toMatchObject({ componente: 'principal', subcentro: 'Venda em Boitel', valor: LIQUIDO,
      favorecidoId: BOITEL, loteId: LOTE, rotulo: 'Recebimento ref. operação' });
    expect(l.some(x => x.componente === 'acerto_boitel')).toBe(false);
  });

  it('o frigorifico gravado NAO muda nada na A — so' + "'" + ' o quem-abate decide', () => {
    expect(linhasPrevisaoBoitel(entrada('boitel', LIQUIDO, JBS))).toEqual(linhasPrevisaoBoitel(entrada('boitel', LIQUIDO, '')));
  });
});

describe('modalidade B (abate em nome do produtor) — dois titulos reais', () => {
  it('acerto_boitel (boitel, 1155) ANTES do principal (frigorifico, 1150), com os numeros do motor', () => {
    const l = (linhasPrevisaoBoitel(entrada('produtor', LIQUIDO)) ?? []).filter(x => !x.zerada);
    expect(l.map(x => x.componente)).toEqual(['acerto_boitel', 'principal']);
    expect(l[0]).toMatchObject({ natureza: 'obrigacao', subcentro: SUBCENTRO_ACERTO_BOITEL, valor: 308877.97, favorecidoId: BOITEL });
    expect(l[1]).toMatchObject({ natureza: 'principal', subcentro: 'Venda em Boitel', valor: 965835.14, favorecidoId: JBS, loteId: LOTE,
      rotulo: 'Recebimento do frigorífico' });
    /* a conta fecha no slot, sem tolerancia */
    expect(Math.round((l[1].valor - l[0].valor) * 100)).toBe(Math.round(LIQUIDO * 100));
  });

  it('sem "a receber do boitel" nem adiantamento', () => {
    const l = linhasPrevisaoBoitel(entrada('produtor', LIQUIDO)) ?? [];
    expect(l.some(x => x.componente === 'adiantamento' || x.componente === 'adiantamento_devolvido')).toBe(false);
    expect(l.some(x => x.rotulo === 'Recebimento ref. operação')).toBe(false);
  });

  it('um centavo de diferenca entre o slot e recebido - pago: o principal NAO sai e o botao diz por que', () => {
    const e = entrada('produtor', LIQUIDO - 0.01);
    const l = linhasPrevisaoBoitel(e) ?? [];
    expect(l.some(x => x.natureza === 'principal')).toBe(false);
    expect(valoresDoProdutor(e.boitelRealSalvo!, e.vendaBoitel).divergencia).toEqual({ slot: LIQUIDO - 0.01, liquido: LIQUIDO });
    expect(avisoBoitelProdutor(e)).toMatch(/Recebido do frigorífico R\$\s965\.835,14 − pago ao boitel R\$\s308\.877,97/);
    /* e na conta certa nao ha aviso — a busca sabe NAO achar */
    expect(avisoBoitelProdutor(entrada('produtor', LIQUIDO))).toBeNull();
    expect(avisoBoitelProdutor(entrada('boitel', LIQUIDO - 0.01))).toBeNull();
  });
});

describe('resumo lateral da B', () => {
  it('(+) Recebido do frigorifico · (−) Pago ao boitel · (=) Liquido — os numeros do motor', () => {
    const r = linhasResumoProdutor(derivadosBoitel({ ...REALIZADO, quemAbate: 'produtor' }));
    /* em centavos: 306.102,83 + 2.775,14 e' 308.877,97000000003 em ponto flutuante — a tela formata em centavos */
    expect(r.linhas.map(l => [l.rotulo, Math.round(l.valor * 100) / 100, l.sinal])).toEqual([
      ['(+) Recebido do frigorífico', 965835.14, '+'],
      ['(−) Pago ao boitel', 308877.97, '−'],
    ]);
    expect(Math.round(r.liquido * 100)).toBe(Math.round(LIQUIDO * 100));
  });
});
