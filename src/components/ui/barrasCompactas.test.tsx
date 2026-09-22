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
