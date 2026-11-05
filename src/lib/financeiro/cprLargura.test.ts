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

describe('o valor na largura do maior valor (medido na faixa, 11px negrito)', () => {
  it('cobre o texto medido na bancada, de "▼ −R$ 9,99" a "▼ −R$ 999.999.999,99", sem sobrar mais de 1px', () => {
    const medido = [63.2, 70.5, 77.9, 88.5, 95.9, 103.3, 113.9, 121.3, 128.7];
    medido.forEach((px, i) => {
      const w = larguraDoValorCpr(i + 1, true);
      expect(w, `${i + 1} algarismos`).toBeGreaterThanOrEqual(px);
      expect(w - px, `${i + 1} algarismos`).toBeLessThanOrEqual(1);
    });
    /* sem o "−" (A receber, A pagar): "▲ R$ 999.999,99" = 95,9 */
    expect(larguraDoValorCpr(6, false)).toBe(96);
  });

  it('em degraus: até R$ 999.999,99 · até R$ 99.999.999,99 · acima, o próprio número', () => {
    expect([1, 5, 6, 7, 8, 9, 10].map(degrauDosAlgarismos)).toEqual([6, 6, 6, 8, 8, 9, 10]);
    expect(larguraDosValoresCpr(0)).toEqual({ receber: 96, pagar: 96, saldo: 104 });
    expect(larguraDosValoresCpr(113386.53)).toEqual({ receber: 96, pagar: 96, saldo: 104 });
    expect(larguraDosValoresCpr(-999999.99)).toEqual({ receber: 96, pagar: 96, saldo: 104 });
    expect(larguraDosValoresCpr(1000000)).toEqual({ receber: 114, pagar: 114, saldo: 122 });
    expect(larguraDosValoresCpr(999999999.99)).toEqual({ receber: 122, pagar: 122, saldo: 129 });
  });
});

describe('a lista cabe a 1.280px', () => {
  it('normal e ampliado, até R$ 99.999.999,99, com Descrição, Fornecedor e Subcentro no mínimo', () => {
    for (const ampliado of [false, true]) for (const v of [0, 113386.53, 99999999.99]) {
      expect(larguraMinimaCpr(reguaDaCpr(ampliado, v)), `${ampliado ? 'ampliado' : 'normal'} ${v}`).toBeLessThanOrEqual(LISTA_A_1280);
    }
    /* a conta: 27 de moldura + as colunas + 3 × 95 + 4px por vão (normal: 9 colunas + as 3 de texto = 11 vãos) */
    expect(larguraMinimaCpr(reguaDaCpr(false, 0))).toBe(27 + (46 * 3 + 16 + 76 + 58 + 96 + 96 + 104) + 3 * 95 + 4 * 11);
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

  it('Fornecedor e Subcentro esticam como a Descrição (a sobra em três), no cabeçalho e na linha', () => {
    expect(cab).toContain('<span style={ESTICA}>Fornecedor</span>');
    expect(cab).toContain('<span style={ESTICA}>Subcentro</span>');
    expect(linha).toMatch(/<span style=\{ESTICA\} className="truncate text-muted-foreground" title=\{fornecedor\}/);
    expect(linha).toMatch(/<span style=\{ESTICA\} className=\{cn\(FONTE_FINA, 'truncate text-muted-foreground'\)\} title=\{l\.subcentro \|\| '—'\}/);
  });

  it('a régua vem do maior valor do período (recorte e série) e a largura mínima é a dela; o teto só cresce no mesmo cliente/período/conta', () => {
    expect(tela).toContain('const regua = useMemo(() => reguaDaCpr(ampliado, maiorValor), [ampliado, maiorValor]);');
    expect(tela).toContain('const agora = maiorValorCpr(recorte, serie);');
    /* as pílulas filtram na consulta: desligar uma nunca estreita a régua */
    expect(tela).toContain('const valor = tetoDoValor.current.chave === chave ? Math.max(tetoDoValor.current.valor, agora) : agora;');
    expect(tela).toContain("const chave = `${clienteId ?? ''}|${periodo.de}|${periodo.ate}|${contaSel ?? ''}`;");
    expect(tela).toContain('style={{ minWidth: larguraMinimaCpr(regua) }}');
    expect(tela).not.toContain('LARGURA_MINIMA_NORMAL');
  });
});
