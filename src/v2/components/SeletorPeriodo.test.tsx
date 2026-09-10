/**
 * O que este arquivo protege — PR-SELETOR-PERIODO-02.
 *
 * ⚠ A A23 SE PROVA POR ESTRUTURA, NÃO POR PIXEL. `getBoundingClientRect` devolve zero no
 * jsdom: medir largura ali provaria que 0 === 0. O que de fato se quer garantir é que
 * NENHUMA propriedade de geometria mude entre selecionado e não-selecionado — e isso se lê
 * no estilo. É a garantia mais forte das duas: um pixel igual pode esconder duas
 * propriedades que se cancelam; um conjunto de propriedades idêntico não pode.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeletorPeriodo } from './SeletorPeriodo';
import { mesUnico, type Periodo } from '@/v2/lib/periodo';

/** As propriedades que MOVEM as coisas. Cor não está aqui, de propósito. */
const GEOMETRIA = ['flex', 'height', 'padding', 'fontSize', 'fontWeight', 'borderRadius', 'borderWidth', 'lineHeight', 'transform', 'outline'] as const;

function geometriaDe(el: HTMLElement) {
  const s = el.style;
  return Object.fromEntries(GEOMETRIA.map((k) => [k, s[k as never] as string]));
}

function montar(periodo: Periodo, extra: Partial<React.ComponentProps<typeof SeletorPeriodo>> = {}) {
  const onPeriodoChange = vi.fn();
  const r = render(<SeletorPeriodo periodo={periodo} onPeriodoChange={onPeriodoChange} {...extra} />);
  return { onPeriodoChange, rerender: (p: Periodo) => r.rerender(
    <SeletorPeriodo periodo={p} onPeriodoChange={onPeriodoChange} {...extra} />) };
}

describe('A23 — nada muda de tamanho ao selecionar', () => {
  it('o mesmo botão tem geometria idêntica selecionado e não-selecionado', () => {
    const { rerender } = montar(mesUnico(2026, 3));
    const naoSelecionado = geometriaDe(screen.getByText('Abr'));
    rerender(mesUnico(2026, 4));
    const selecionado = geometriaDe(screen.getByText('Abr'));
    expect(selecionado).toEqual(naoSelecionado);
  });

  it('nenhum botão usa scale nem outline — os dois empurram os vizinhos', () => {
    montar({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
    for (const r of ['Jan', 'Fev', 'Mar', 'Abr', 'Dez']) {
      const b = screen.getByText(r);
      expect(b.style.transform).toBe('');
      expect(b.style.outline).toBe('');
      expect(b.style.fontWeight).toBe('500');
    }
  });

  it('o extremo muda de COR, e é assim que se sabe qual é', () => {
    const { rerender } = montar(mesUnico(2026, 3));
    expect(screen.getByText('Abr').getAttribute('aria-pressed')).toBe('false');
    rerender(mesUnico(2026, 4));
    expect(screen.getByText('Abr').getAttribute('aria-pressed')).toBe('true');
  });

  it('com tomPorMes a cor da situação fica, e a seleção vira anel INTERNO', () => {
    const tom = { bg: 'rgb(1, 2, 3)', border: 'rgb(4, 5, 6)', txt: 'rgb(7, 8, 9)' };
    montar(mesUnico(2026, 5), { tomPorMes: { 5: tom, 6: tom } });
    const ativo = screen.getByText('Mai');
    const outro = screen.getByText('Jun');
    expect(ativo.style.backgroundColor).toBe(tom.bg);          // a situação não é apagada
    expect(ativo.style.boxShadow).toContain('inset');          // marca sem ocupar espaço fora
    expect(outro.style.boxShadow).toBe('');
    expect(geometriaDe(ativo)).toEqual(geometriaDe(outro));
  });
});

describe('seleção', () => {
  it('no modo Mês, um clique é um mês', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 3));
    fireEvent.click(screen.getByText('Ago'));
    expect(onPeriodoChange).toHaveBeenCalledWith(mesUnico(2026, 8));
  });

  it('no modo Período, o primeiro clique não muda nada e o segundo fecha', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 3));
    fireEvent.click(screen.getByText('Período'));
    fireEvent.click(screen.getByText('Fev'));
    expect(onPeriodoChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Início fev\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByText('Abr'));
    expect(onPeriodoChange).toHaveBeenCalledWith({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
  });

  it('clicar o fim antes do início devolve o intervalo em ordem', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 3));
    fireEvent.click(screen.getByText('Período'));
    fireEvent.click(screen.getByText('Set'));
    fireEvent.click(screen.getByText('Mar'));
    expect(onPeriodoChange).toHaveBeenCalledWith({ de: { ano: 2026, mes: 3 }, ate: { ano: 2026, mes: 9 } });
  });

  it('shift+clique é o atalho escondido: dois cliques fazem o período sem sair do modo Mês', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 3));
    fireEvent.click(screen.getByText('Fev'), { shiftKey: true });
    expect(onPeriodoChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Mai'), { shiftKey: true });
    expect(onPeriodoChange).toHaveBeenCalledWith({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 5 } });
  });

  it('em modoUnico não há toggle, e o shift não abre exceção', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 3), { modoUnico: true });
    expect(screen.queryByText('Período')).toBeNull();
    expect(screen.queryByText('Personalizado…')).toBeNull();
    fireEvent.click(screen.getByText('Jul'), { shiftKey: true });
    expect(onPeriodoChange).toHaveBeenCalledWith(mesUnico(2026, 7));
  });
});

describe('a frase', () => {
  it('mês único se escreve por extenso', () => {
    montar(mesUnico(2026, 8));
    expect(screen.getByText('Mostrando agosto/2026')).toBeTruthy();
  });

  it('intervalo no ano traz a contagem', () => {
    montar({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
    expect(screen.getByText('Mostrando fev → abr/2026 · 3 meses')).toBeTruthy();
  });

  it('intervalo entre anos mostra os dois anos e desabilita a fita', () => {
    montar({ de: { ano: 2024, mes: 1 }, ate: { ano: 2025, mes: 12 } });
    expect(screen.getByText('Mostrando jan/2024 → dez/2025 · 24 meses')).toBeTruthy();
    expect(screen.getByText('2024–2025')).toBeTruthy();
    expect(screen.getByText('Jan').closest('div')!.style.opacity).toBe('0.45');
  });

  it('o × só existe quando há o que limpar', () => {
    const { rerender } = montar(mesUnico(2026, 8));
    expect(screen.queryByLabelText('Voltar ao mês corrente')).toBeNull();
    rerender({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
    expect(screen.getByLabelText('Voltar ao mês corrente')).toBeTruthy();
  });
});
