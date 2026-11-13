/**
 * FIN-FINANC-LAYOUT-03 — a RÉGUA ÚNICA das tabelas de financiamento (lista + contrato): a escolha do Gabriel (16:58, célula 11 · cabeçalho
 * 10) mora em DOIS lugares que andam juntos — `REGUA_ESCOLHIDA` e o `:root` do CSS —, as larguras vão em `em` da célula, a coluna de texto
 * tem a largura do maior texto (inteiro numa linha) e o "A liberar" é contratado − liberado do saldo do banco.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { REGUA_ESCOLHIDA, REGUA_FIN, ThOrdenavel, emDaRegua, larguraDoMaior } from './reguaDoFinanciamento';
import { aLiberarDoContrato } from '@/lib/financiamentos/contratoDeCredito';

const CSS = readFileSync(resolve(__dirname, 'reguaDoFinanciamento.css'), 'utf8');
const bloco = (seletor: string) => {
  const i = CSS.indexOf(`${seletor} {`); if (i < 0) throw new Error(`sem ${seletor}`);
  return CSS.slice(i, CSS.indexOf('}', i));
};
const px = (b: string, v: string) => Number(new RegExp(`--${v}: ([\\d.]+)px;`).exec(b)?.[1]);

describe('a régua única', () => {
  it('a escolhida (11) é o :root do CSS: célula 11, cabeçalho 10 (1px menor), data 10,5, linha 22', () => {
    expect(REGUA_ESCOLHIDA).toBe(11);
    const raiz = bloco(':root');
    expect([px(raiz, 'fin-td'), px(raiz, 'fin-th'), px(raiz, 'fin-data'), px(raiz, 'fin-linha')]).toEqual([11, 10, 10.5, 22]);
    expect(raiz.replace(':root', '')).toBe(bloco(`.regua-fin-${REGUA_ESCOLHIDA}`).replace(`.regua-fin-${REGUA_ESCOLHIDA}`, ''));
  });
  it('as fontes de tabela são as variáveis da régua (nenhum número solto)', () => {
    expect(REGUA_FIN.td).toBe('text-[length:var(--fin-td)]');
    expect(REGUA_FIN.th).toBe('text-[length:var(--fin-th)]');
    expect(REGUA_FIN.linha).toBe('h-[var(--fin-linha)]');
    /* "sem quebrar" (16:58): texto de célula inteiro numa linha, sem "…" */
    expect(REGUA_FIN.inteiro).toBe('block whitespace-nowrap');
  });
  it('largura em em da célula: 11px = 1em', () => {
    expect(emDaRegua(110)).toBe('10em');
    expect(emDaRegua(84)).toBe('7.636em');
  });
  it('a coluna de texto tem a largura do MAIOR texto + o padding, nunca menos que o piso, e sem teto', () => {
    expect(larguraDoMaior(['ab', 'abcdef'], { piso: 10, folga: 18 })).toBe(Math.ceil(6 * 6.6) + 18);
    expect(larguraDoMaior(['a'], { piso: 90 })).toBe(90);
    expect(larguraDoMaior(['x'.repeat(200)], { piso: 10 })).toBeGreaterThan(1300);
  });
  it('o cabeçalho que ordena: botão no th e aria-sort', () => {
    render(<table><thead><tr><ThOrdenavel col="data" ordem={{ col: 'data', dir: 'desc' }} aoOrdenar={() => undefined}>Data</ThOrdenavel>
      <ThOrdenavel col="valor" ordem={{ col: 'data', dir: 'desc' }} aoOrdenar={() => undefined} direita>Valor</ThOrdenavel></tr></thead></table>);
    const [data, valor] = screen.getAllByRole('columnheader');
    expect(data.getAttribute('aria-sort')).toBe('descending');
    expect(valor.getAttribute('aria-sort')).toBe('none');
    expect(valor.className).toContain('text-right');
    expect(data.querySelector('button')?.textContent).toBe('Data');
  });
});

describe('o cartão "A liberar" = contratado − liberado (saldo do banco)', () => {
  it('PR-78.179 (proto, 12/11): 7.200.000 − 7.188.000 = 12.000,00; em centavos (sem resto de ponto flutuante)', () => {
    expect(aLiberarDoContrato({ contratado: 7200000, liberado: 7188000 })).toBe(12000);
    expect(aLiberarDoContrato({ contratado: 0.3, liberado: 0.1 })).toBe(0.2);
  });
  it('sem contratado ou sem liberação: nulo (nunca deduzido); liberado acima do contratado: 0 (a pendência já diz)', () => {
    expect(aLiberarDoContrato({ contratado: 100, liberado: null })).toBeNull();
    expect(aLiberarDoContrato({ contratado: null, liberado: 10 })).toBeNull();
    expect(aLiberarDoContrato(null)).toBeNull();
    expect(aLiberarDoContrato({ contratado: 100, liberado: 150 })).toBe(0);
  });
});

describe('o Cronograma do crédito ordena (fonte da página: o jsdom não monta o detalhe inteiro)', () => {
  const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
  it('o cabeçalho é o ThOrdenavel da régua, padrão pelo vencimento; as linhas desenhadas são as ordenadas; o Total fica no tfoot', () => {
    expect(fonte).toContain("useState<Ordem<ChaveDaColuna>>({ col: 'vencimento', dir: 'asc' })");
    expect(fonte).toContain('<ThOrdenavel key={c.chave} col={c.chave} ordem={ordemDoCronograma} aoOrdenar={ordenarCronograma}');
    expect(fonte).toContain('const linhasDoCronograma = ehParcelamento ? linhas : ordenarPor(linhas, ordemDoCronograma, valorNoCronograma);');
    expect(fonte).toContain('{linhasDoCronograma.map(p => {');
    expect(fonte).toContain('<tfoot data-testid="rodape-das-parcelas">');
  });
  it('o saldo após é por parcela (na ordem do cronograma), e a ordem só reordena a exibição', () => {
    expect(fonte).toContain("c === 'saldoApos' ? saldoApos?.get(p.id) ?? null");
    expect(fonte).toContain('const saldoApos = ehParcelamento ? null : saldoAposDasParcelas(contratadoDoCredito, linhas);');
  });
});
