/**
 * A LEI DO GRÁFICO — a razão entre as alturas é a razão entre os números.
 *
 * ⚠ ESTE É O PRIMEIRO TESTE DO COMPONENTE, e ele nasce tarde de propósito registrado: a lei está
 * escrita no cabeçalho de `barras-compactas.tsx` desde o PR-PAINEL-SAFRA-C ("as barras altas
 * comprimiam e as baixas não, e a razão entre elas deixava de ser a razão entre os números"), e
 * nunca houve nada que a travasse. Um gráfico que mente sobre proporção mente calado: nenhum gate
 * — nem TSC, nem build, nem madge — vê altura de barra.
 * ⚠ O QUE ELE LÊ É O `style.height` EM PORCENTAGEM, que é onde a proporção mora. Comparar pixels
 * exigiria layout, e o jsdom não faz layout: ele devolveria 0 para todas e o teste passaria verde
 * sem medir nada.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BarrasCompactas, type BarraCompacta } from '@/components/ui/barras-compactas';

/** As alturas declaradas, na ordem das barras — só as que têm valor. */
const alturas = () => [...document.querySelectorAll<HTMLElement>('[style*="height"]')]
  .map(e => e.style.height)
  .filter(h => h.endsWith('%'))
  .map(h => Number(h.replace('%', '')));

describe('a lei do gráfico compacto', () => {
  /* ⚠ OS NÚMEROS SÃO DESIGUAIS DE PROPÓSITO — 800, 400 e 200. Com valores próximos, uma barra
     achatada passaria despercebida; com o dobro exato entre vizinhas, qualquer compressão aparece. */
  const BARRAS: BarraCompacta[] = [
    { rotulo: '23/24', valor: 800, texto: '800' },
    { rotulo: '24/25', valor: 400, texto: '400' },
    { rotulo: '25/26', valor: 200, texto: '200' },
  ];

  it('a razão entre as alturas é a razão entre os dados', () => {
    render(<BarrasCompactas barras={BARRAS} titulo="teste" altura={150} />);
    const h = alturas();
    expect(h).toHaveLength(3);
    /* A maior é 100% da escala; as outras são a fração exata dela. */
    expect(h[0]).toBe(100);
    expect(h[1] / h[0]).toBeCloseTo(400 / 800, 5);
    expect(h[2] / h[0]).toBeCloseTo(200 / 800, 5);
  });

  /* ⚠ E O ZERO NÃO É AUSÊNCIA: zero medido desenha barra rasa, `null` não desenha barra nenhuma —
     são afirmações diferentes sobre o mesmo eixo.
     ⚠ O PISO DE 2% É DO COMPONENTE E FICA MEDIDO AQUI, não corrigido: `Math.max(2, …)` garante que
     um valor pequeno ainda se veja. Ele é a ÚNICA exceção à lei da razão, e vale só embaixo — dois
     por cento de altura sobre uma escala inteira. O teste o afirma para que ninguém o confunda com
     compressão: se o piso subir, é aqui que aparece. */
  it('sem dado não vira barra; zero medido vira barra rasa (o piso de 2%)', () => {
    render(<BarrasCompactas titulo="teste" barras={[
      { rotulo: 'a', valor: 100, texto: '100' },
      { rotulo: 'b', valor: null, texto: '—' },
      { rotulo: 'c', valor: 0, texto: '0' },
    ]} />);
    const h = alturas();
    /* Duas alturas em %: a de 100 e a do zero no piso. A nula não declara altura em porcentagem. */
    expect(h).toEqual([100, 2]);
    expect(document.body.textContent).toContain('—');
  });

  /* ⚠ A ESCALA IGNORA OS NULOS E NUNCA DIVIDE POR ZERO — com tudo sem dado, `max` seria 0 e o CSS
     renderizaria `NaN%` como altura CHEIA: um gráfico cheio sobre um conjunto vazio. */
  it('todas sem dado: nenhuma barra cheia', () => {
    render(<BarrasCompactas titulo="teste" barras={[
      { rotulo: 'a', valor: null, texto: '—' },
      { rotulo: 'b', valor: null, texto: '—' },
    ]} />);
    expect(alturas()).toEqual([]);
  });
});

/* ══════════════ AS TRÊS PROPS NOVAS — DRE-HISTORICO-LINHA-01a ══════════════ */

describe('as props opt-in do histórico', () => {
  const BARRAS: BarraCompacta[] = [
    { rotulo: '24/25', valor: 500, texto: '500', cor: 'bg-red-200', corTexto: 'text-red-600' },
    { rotulo: '25/26', valor: 1000, texto: '1.000', cor: 'bg-red-600', corTexto: 'text-red-600' },
    { rotulo: 'Meta', valor: 900, texto: '900', meta: true, corTexto: 'text-amber-600' },
  ];

  /* ⚠ A META É CONTORNO, NÃO PREENCHIMENTO: pintada, ela competiria com as safras; fora do
     gráfico, sumiria justamente a linha contra a qual as outras se comparam. */
  it('a barra de meta é tracejada âmbar e não tem preenchimento', () => {
    render(<BarrasCompactas barras={BARRAS} titulo="teste" />);
    const meta = [...document.querySelectorAll<HTMLElement>('[style*="height"]')]
      .find(e => e.className.includes('border-dashed') && e.className.includes('border-amber-500'));
    expect(meta).toBeDefined();
    expect(meta?.className).toContain('bg-transparent');
    expect(meta?.className).not.toContain('bg-red');
    /* E ela continua obedecendo a escala: 900 de 1.000 = 90%. */
    expect(meta?.style.height).toBe('90%');
  });

  it('a cor do número vem do consumidor, não do componente', () => {
    render(<BarrasCompactas barras={BARRAS} titulo="teste" />);
    const textos = [...document.querySelectorAll('span')].map(s => s.className);
    expect(textos.some(c => c.includes('text-red-600'))).toBe(true);
    expect(textos.some(c => c.includes('text-amber-600'))).toBe(true);
  });

  /* ⚠ A COLUNA INTEIRA É O ALVO, não o retângulo pintado: a barra de um valor pequeno tem poucos
     pixels de altura, e mirar nela seria trabalho de precisão. */
  it('clicar numa coluna devolve o índice dela', () => {
    const onClickBarra = vi.fn();
    render(<BarrasCompactas barras={BARRAS} titulo="teste" onClickBarra={onClickBarra} />);
    const colunas = [...document.querySelectorAll<HTMLElement>('.cursor-pointer')];
    expect(colunas.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(colunas[2]);
    expect(onClickBarra).toHaveBeenCalledWith(2);
  });

  it('sem a prop, nada fica clicável — o cursor não promete o que não há', () => {
    render(<BarrasCompactas barras={BARRAS} titulo="teste" />);
    expect(document.querySelectorAll('.cursor-pointer')).toHaveLength(0);
  });
});

/* ══════════════ O EIXO ZERO — DRE-HISTORICO-LINHA-01c ══════════════ */

/**
 * ⚠ SEM ELE O COMPONENTE NÃO SABIA NEGATIVO, e não sabia CALADO: a escala é `Math.max(…, 0)` e o
 * piso de 2% transformava um prejuízo numa barrinha para CIMA — desenhava perda como lucro pequeno.
 * Nunca apareceu porque os consumidores até hoje só tinham produção e custo; o resultado do DRE
 * desce de zero.
 */
describe('o eixo zero', () => {
  const alturasDe = () => [...document.querySelectorAll<HTMLElement>('[style*="height"]')]
    .map(e => e.style.height)
    .filter(h => h.endsWith('%') && h !== '0%');

  it('a razão vale nos dois sentidos: a altura é proporcional ao MÓDULO', () => {
    render(<BarrasCompactas titulo="teste" eixoZero altura={150} barras={[
      { rotulo: 'a', valor: 1000, texto: '1,0 k' },
      { rotulo: 'b', valor: -500, texto: '-500' },
      { rotulo: 'c', valor: 500, texto: '500' },
    ]} />);
    /* As metades: a de cima vale 1.000 da faixa de 1.500 (66,7%), a de baixo 500 (33,3%). E DENTRO
       de cada metade a barra é proporcional ao seu extremo: 1.000/1.000, 500/1.000 e 500/500. */
    const h = alturasDe();
    expect(h).toContain('100%');            // o maior positivo enche a metade de cima
    expect(h).toContain('50%');             // 500 é metade de 1.000, no mesmo lado
    expect(h.filter(x => x === '100%')).toHaveLength(2); // e o -500 enche a metade de baixo
  });

  /* ⚠ SEM NEGATIVO, NADA MUDA: a linha do zero cai na base e o desenho é o de sempre. */
  it('sem negativos, a linha do zero fica na base', () => {
    render(<BarrasCompactas titulo="teste" eixoZero barras={[
      { rotulo: 'a', valor: 800, texto: '800' },
      { rotulo: 'b', valor: 400, texto: '400' },
    ]} />);
    const metades = [...document.querySelectorAll<HTMLElement>('[style*="height: 100%"]')];
    expect(metades.length).toBeGreaterThan(0);
    /* A metade de baixo tem altura zero: não há para onde descer. */
    expect([...document.querySelectorAll<HTMLElement>('[style*="height: 0%"]')].length)
      .toBeGreaterThan(0);
  });

  /* ⚠ E O RÓTULO TROCA DE LADO COM O SINAL: em cima da barra positiva, embaixo da negativa. Fixo
     em cima, ele ficaria sobre a linha do zero, longe da barra que representa. */
  it('o rótulo do negativo fica embaixo da barra', () => {
    render(<BarrasCompactas titulo="teste" eixoZero barras={[
      { rotulo: 'a', valor: 100, texto: '100' },
      { rotulo: 'b', valor: -100, texto: '-100' },
    ]} />);
    const rotulo = (t: string) => [...document.querySelectorAll('span')]
      .find(s => s.textContent === t)?.className ?? '';
    expect(rotulo('100')).toContain('bottom-full');
    expect(rotulo('-100')).toContain('top-full');
  });
});
