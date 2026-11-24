/**
 * CPR-LARGURA-01 (Gabriel 03/11 19:50) — a lista da Contas a Pagar e Receber cabe na tela: a régua das colunas, o valor em degraus e o
 * contrato da tela (Descrição, Fornecedor e Subcentro dividem a sobra), lido da FONTE como nos testes irmãos (`cprColunas.p152.test.tsx`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  degrauDosAlgarismos, larguraDoValorCpr, larguraDosValoresCpr, larguraMinimaCpr, maiorValorCpr, reguaDaCpr,
} from '@/lib/financeiro/cprLargura';

/** A lista a 1.280px de janela (barra lateral e margens fora), medida na bancada: 1.094px. */
const LISTA_A_1280 = 1094;

describe('CPR-LAYOUT-03 — UMA coluna Valor e a Saldo, 118px (o mock), crescendo só acima de 8 algarismos', () => {
  it('a largura a 12px negrito cobre "+99.999.999,99" (~103px) dentro dos 118 do mock', () => {
    expect(larguraDoValorCpr(8)).toBeLessThanOrEqual(118);
    expect(larguraDoValorCpr(8)).toBeGreaterThanOrEqual(103);
    /* cresce com o número: 9 e 10 algarismos */
    expect(larguraDoValorCpr(9)).toBeGreaterThan(larguraDoValorCpr(8));
    expect(larguraDoValorCpr(10)).toBeGreaterThan(larguraDoValorCpr(9));
  });

  it('em degraus: até 999.999,99 · até 99.999.999,99 · acima, o próprio número; o piso é 118', () => {
    expect([1, 5, 6, 7, 8, 9, 10].map(degrauDosAlgarismos)).toEqual([6, 6, 6, 8, 8, 9, 10]);
    expect(larguraDosValoresCpr(0)).toEqual({ valor: 118, saldo: 118 });
    expect(larguraDosValoresCpr(113386.53)).toEqual({ valor: 118, saldo: 118 });
    expect(larguraDosValoresCpr(-99999999.99)).toEqual({ valor: 118, saldo: 118 });
    expect(larguraDosValoresCpr(999999999.99)).toEqual({ valor: Math.max(118, larguraDoValorCpr(9)), saldo: Math.max(118, larguraDoValorCpr(9)) });
    /* só um número de 11 algarismos passa dos 118 */
    const w = larguraDoValorCpr(11);
    expect(w).toBeGreaterThan(118);
    expect(larguraDosValoresCpr(99999999999.99)).toEqual({ valor: w, saldo: w });
  });
});

describe('a lista cabe a 1.280px', () => {
  it('normal e ampliado, até 99.999.999,99, com Descrição, Fornecedor e Subcentro no mínimo', () => {
    for (const ampliado of [false, true]) for (const v of [0, 113386.53, 99999999.99]) {
      expect(larguraMinimaCpr(reguaDaCpr(ampliado, v)), `${ampliado ? 'ampliado' : 'normal'} ${v}`).toBeLessThanOrEqual(LISTA_A_1280);
    }
    /* CPR-LAYOUT-04 — a conta: 27 de moldura + as colunas (Comp. 46 + Banco 70 + NF 72 + Status 70 + 118 + 118; Venc. saiu) + 3 × 95 +
       4px por vão (6 colunas + as 3 de texto = 8 vãos) */
    expect(larguraMinimaCpr(reguaDaCpr(false, 0))).toBe(27 + (46 + 70 + 72 + 70 + 118 + 118) + 3 * 95 + 4 * 8);
    expect(reguaDaCpr(false, 0)).toMatchObject({ comp: 46, venc: 0, banco: 70 });
  });
});

describe('o maior valor do período', () => {
  it('varre linhas, série e rodapé (aninhados), em módulo', () => {
    const serie = { inicial: { saldo: 5000 }, dias: [{ pagar: { valor: 10, contas: 1 }, saldo: -113386.53 }], fim: null };
    expect(maiorValorCpr([{ valor: 435.75 }, { valor: 990 }], serie, { totalPagar: 2000 })).toBe(113386.53);
    expect(maiorValorCpr()).toBe(0);
  });
});

describe('a tela (lida da fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  const cab = tela.slice(tela.indexOf('data-testid="cpr-cabecalho"'), tela.indexOf('{/* CAIXA INICIAL'));
  const linha = tela.slice(tela.indexOf('            key={chaveDaLinhaCpr(l)}'), tela.indexOf('{/* CPR-AJUSTES-20-10 — a ÚLTIMA linha do dia'));

  it('CPR-LAYOUT-03 (ponto 8): a Descrição fica com a sobra (o dobro), Fornecedor e Subcentro param no tamanho do mock (200 / 170)', () => {
    expect(tela).toContain("const ESTICA_DESCRICAO: CSSProperties = { flex: '2 1 0', minWidth: 0 };");
    expect(tela).toContain("const ESTICA_FORNECEDOR: CSSProperties = { flex: '1 1 0', minWidth: 0, maxWidth: FORNECEDOR_MAXIMO_CPR };");
    expect(tela).toContain("const ESTICA_SUBCENTRO: CSSProperties = { flex: '1 1 0', minWidth: 0, maxWidth: SUBCENTRO_MAXIMO_CPR };");
    expect(cab).toContain("cabecalhoOrdenavel('fornecedor', ESTICA_FORNECEDOR)");
    expect(cab).toContain("cabecalhoOrdenavel('subcentro', ESTICA_SUBCENTRO)");
    expect(linha).toContain('<span style={ESTICA_FORNECEDOR} className="truncate text-foreground" title={fornecedor}');
    expect(linha).toContain("<span style={ESTICA_SUBCENTRO} className=\"truncate text-foreground\" title={l.subcentro || '—'}");
  });

  it('a régua vem do maior valor do período (recorte e série) e a largura mínima é a dela; o teto só cresce no mesmo cliente/período/conta', () => {
    expect(tela).toContain('const regua = useMemo(() => reguaDaCpr(ampliado, maiorValor, aprovacao.ligado), [ampliado, maiorValor, aprovacao.ligado]);');
    expect(tela).toContain('const agora = maiorValorCpr(recorte, serie);');
    /* as pílulas filtram na consulta: desligar uma nunca estreita a régua */
    expect(tela).toContain('const valor = tetoDoValor.current.chave === chave ? Math.max(tetoDoValor.current.valor, agora) : agora;');
    expect(tela).toContain("const chave = `${clienteId ?? ''}|${periodo.de}|${periodo.ate}|${contaSel ?? ''}`;");
    expect(tela).toContain('style={{ minWidth: larguraMinimaCpr(regua) }}');
    expect(tela).not.toContain('LARGURA_MINIMA_NORMAL');
  });
});
