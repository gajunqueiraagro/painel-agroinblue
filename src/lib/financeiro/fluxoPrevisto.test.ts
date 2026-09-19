/**
 * O fluxo previsto — PR-CPR-2B.
 *
 * ⚠ OS NÚMEROS SÃO OS DO PROTO EM 19/09/2026, medidos, não inventados: são eles que a
 * homologação confere na tela, e travá-los aqui é o que impede o gráfico de discordar da Lista
 * sem ninguém ver.
 */
import { describe, it, expect } from 'vitest';
import {
  escalaSimetrica, montarFluxoPrevisto, passoRedondo, primeiroNegativo, rotuloDoDia,
  rotuloDoMes, MAX_PONTOS_DIA, type LinhaFluxoPrevisto,
} from './fluxoPrevisto';

const HOJE = '2026-09-19';
/** As séries mensais deste arquivo: a granularidade é a do horizonte "Tudo". */
const MES = { granularidade: 'mes' as const, hoje: HOJE };

const saida = (venc: string | null, valor: number): LinhaFluxoPrevisto =>
  ({ data_vencimento: venc, valor, tipo_operacao: '2-Saídas' });
const entrada = (venc: string | null, valor: number): LinhaFluxoPrevisto =>
  ({ data_vencimento: venc, valor, tipo_operacao: '1-Entradas' });

describe('rotuloDoMes', () => {
  it('encurta para mes/aa', () => {
    expect(rotuloDoMes('2026-09')).toBe('set/26');
    expect(rotuloDoMes('2027-02')).toBe('fev/27');
  });
});

describe('montarFluxoPrevisto — NJ, 90 dias', () => {
  const linhas = [
    saida('2026-09-19', 627301.33), saida('2026-10-05', 820312.53),
    saida('2026-11-10', 121496.42), saida('2026-12-13', 96691.87),
  ];
  const r = montarFluxoPrevisto(linhas, 1832544.83, MES);

  it('abre em "Hoje" com o saldo em caixa, antes de qualquer mês', () => {
    expect(r.pontos[0]).toMatchObject({
      chave: 'inicio', rotulo: 'Hoje', entradas: 0, saidas: 0, saldo: 1832544.83 });
  });

  it('as saídas são negativas — é o que faz a coluna descer do zero', () => {
    expect(r.pontos.map((p) => p.saidas))
      .toEqual([0, -627301.33, -820312.53, -121496.42, -96691.87]);
    expect(r.pontos.every((p) => p.entradas === 0)).toBe(true);
  });

  it('a linha desce até 166.742,68 e NÃO fura o zero', () => {
    expect(r.pontos.map((p) => p.saldo))
      .toEqual([1832544.83, 1205243.50, 384930.97, 263434.55, 166742.68]);
    expect(primeiroNegativo(r.pontos)).toBeNull();
  });
});

describe('montarFluxoPrevisto — Vera, 90 dias (o combo de verdade)', () => {
  const linhas = [
    entrada('2026-09-25', 991126.96), saida('2026-09-30', 1013.23),
    entrada('2026-10-02', 470789.46), saida('2026-10-13', 151014.35),
    saida('2026-11-13', 152286.75), saida('2026-12-13', 150454.23),
  ];
  const r = montarFluxoPrevisto(linhas, 198299.74, MES);

  it('tem entradas E saídas no mesmo mês', () => {
    expect(r.pontos[1]).toMatchObject({ rotulo: 'set/26', entradas: 991126.96, saidas: -1013.23 });
  });

  it('a linha SOBE e passa de 1,4 milhão', () => {
    const saldos = r.pontos.map((p) => p.saldo);
    expect(saldos[0]).toBe(198299.74);
    expect(Math.max(...saldos)).toBeGreaterThan(1_400_000);
    expect(saldos[saldos.length - 1]).toBe(1205447.60);
  });
});

describe('primeiroNegativo', () => {
  /** ⚠ O caso do NJ em "Tudo": a CPR do BBA em fev/27 leva a linha a −2,4 milhões. */
  it('acha o mês em que a linha fura o zero', () => {
    const r = montarFluxoPrevisto([
      saida('2027-01-10', 42065.75), saida('2027-02-15', 2510230.75),
      saida('2027-03-10', 78050.43),
    ], 141938.13, MES);
    const neg = primeiroNegativo(r.pontos);
    expect(neg?.rotulo).toBe('fev/27');
    expect(neg?.saldo).toBe(-2410358.37);
  });

  it('cliente já negativo hoje é apontado no próprio "Hoje"', () => {
    const r = montarFluxoPrevisto([saida('2026-10-01', 10)], -500, MES);
    expect(primeiroNegativo(r.pontos)?.chave).toBe('inicio');
  });
});

describe('o que NÃO entra no gráfico', () => {
  /**
   * ⚠ O CASO QUE JUSTIFICA O CAMPO. Um compromisso sem vencimento não tem posição num eixo de
   * tempo, mas somir com ele em silêncio faria o total do gráfico divergir do da Lista sem
   * explicação. Ele é contado para a tela poder dizer.
   */
  it('lançamento sem vencimento fica fora e é CONTADO', () => {
    const r = montarFluxoPrevisto([saida(null, 999), saida('2026-10-01', 10)], 0, MES);
    expect(r.semVencimento).toBe(1);
    expect(r.pontos).toHaveLength(2);
    expect(r.pontos[1].saldo).toBe(-10);
  });

  it('transferência e tipo desconhecido não viram dinheiro por omissão', () => {
    const r = montarFluxoPrevisto([
      { data_vencimento: '2026-10-01', valor: 5000, tipo_operacao: '3-Transferências' },
      { data_vencimento: '2026-10-01', valor: 5000, tipo_operacao: '9-Sei lá' },
    ], 100, MES);
    expect(r.pontos).toHaveLength(1);
    expect(r.pontos[0].saldo).toBe(100);
  });

  it('sem lançamento nenhum, sobra só o ponto de hoje', () => {
    const r = montarFluxoPrevisto([], 1234.56, MES);
    expect(r.pontos).toHaveLength(1);
    expect(r.pontos[0]).toMatchObject({ chave: 'inicio', rotulo: 'Hoje', saldo: 1234.56 });
  });
});

describe('granularidade diária — PR-CPR-2B.1', () => {
  const DIA = { granularidade: 'dia' as const, hoje: HOJE };

  it('rotuloDoDia encurta para dd/MM', () => {
    expect(rotuloDoDia('2026-09-19')).toBe('19/09');
  });

  /**
   * ⚠ A SÉRIE DIÁRIA É CONTÍNUA, e este é o caso que trava isso. Só os dias COM movimento
   * dariam uma linha que salta de 20/09 para 25/09 com a mesma inclinação de um dia para o
   * outro — o eixo deixaria de ser tempo.
   */
  it('inclui os dias SEM movimento, com saldo estável', () => {
    const r = montarFluxoPrevisto([saida('2026-09-22', 100)], 1000, DIA);
    expect(r.granularidade).toBe('dia');
    /* Hoje + 19, 20, 21, 22 */
    expect(r.pontos.map((p) => p.rotulo)).toEqual(['Hoje', '19/09', '20/09', '21/09', '22/09']);
    expect(r.pontos.map((p) => p.saldo)).toEqual([1000, 1000, 1000, 1000, 900]);
  });

  it('a faixa de baixo é o mês, e marca onde ele vira', () => {
    const r = montarFluxoPrevisto([saida('2026-10-02', 10)], 0, DIA);
    const outubro = r.pontos.filter((p) => p.faixa === 'out/26');
    expect(outubro[0].rotulo).toBe('01/10');
    expect(outubro[0].abreFaixa).toBe(true);
    expect(outubro[1].abreFaixa).toBe(false);
  });

  it('no mensal a faixa é o ANO', () => {
    const r = montarFluxoPrevisto([saida('2026-12-01', 10), saida('2027-02-01', 10)], 0, MES);
    expect(r.pontos.map((p) => p.faixa)).toEqual(['', '2026', '2027']);
    expect(r.pontos[2].abreFaixa).toBe(true);
  });

  /**
   * ⚠ O CASO MEDIDO: "Vencidos" do Agnaldo Cedenho vai até 03/02/2020 — 2.420 dias. Um gráfico
   * com 2.420 colunas não é denso, é ilegível. A série cai para mensal e AVISA.
   */
  it('span grande demais cai para mensal e declara que caiu', () => {
    const r = montarFluxoPrevisto([saida('2020-02-03', 500), saida('2026-09-01', 100)], 0, DIA);
    expect(r.granularidade).toBe('mes');
    expect(r.rebaixada).toBe(true);
    expect(r.pontos.length).toBeLessThan(MAX_PONTOS_DIA);
  });

  it('dentro do teto NÃO rebaixa', () => {
    const r = montarFluxoPrevisto([saida('2026-12-01', 10)], 0, DIA);
    expect(r.granularidade).toBe('dia');
    expect(r.rebaixada).toBe(false);
  });
});

describe('escalaSimetrica — o eixo Y', () => {
  it('passoRedondo só devolve 1·2·2,5·5 × potência de dez', () => {
    expect(passoRedondo(137_000)).toBe(200_000);
    expect(passoRedondo(210_000)).toBe(250_000);
    expect(passoRedondo(260_000)).toBe(500_000);
    expect(passoRedondo(9)).toBe(10);
  });

  /** ⚠ A regra 1: o intervalo é o MESMO acima e abaixo. Duas divisões de tamanhos diferentes
      na mesma grade fazem o olho comparar alturas que não são comparáveis. */
  it('o passo é único — os ticks são equidistantes e passam pelo zero', () => {
    const r = montarFluxoPrevisto([entrada('2026-10-01', 900_000), saida('2026-11-01', 120_000)], 200_000, MES);
    const { ticks, passo } = escalaSimetrica(r.pontos);
    expect(ticks).toContain(0);
    for (let i = 1; i < ticks.length; i++) {
      expect(Math.round(ticks[i] - ticks[i - 1])).toBe(Math.round(passo));
    }
  });

  /**
   * ⚠ O DEFEITO QUE A REGRA 3 CONSERTA. Saída minúscula ao lado de um saldo grande colava o
   * zero na borda de baixo e o gráfico virava deserto branco.
   */
  it('o zero NUNCA cola na borda de baixo, mesmo sem saída relevante', () => {
    const r = montarFluxoPrevisto([saida('2026-10-01', 10)], 1_000_000, MES);
    const { dominio } = escalaSimetrica(r.pontos);
    const altura = dominio[1] - dominio[0];
    expect(-dominio[0] / altura).toBeGreaterThanOrEqual(0.2);
  });

  it('o maior valor não encosta no teto', () => {
    const r = montarFluxoPrevisto([entrada('2026-10-01', 1_000_000)], 0, MES);
    const { dominio } = escalaSimetrica(r.pontos);
    expect(dominio[1]).toBeGreaterThan(1_000_000);
  });

  it('série toda em zero devolve uma escala usável em vez de dividir por zero', () => {
    const { ticks } = escalaSimetrica(montarFluxoPrevisto([], 0, MES).pontos);
    expect(ticks).toContain(0);
    expect(ticks.length).toBeGreaterThan(1);
  });
});
