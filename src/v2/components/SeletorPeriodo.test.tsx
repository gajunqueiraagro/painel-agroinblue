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
import { CARA, SeletorPeriodo } from './SeletorPeriodo';
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

  it('NÃO existe toggle "Mês | Período" — clicar num mês é sempre um mês', () => {
    /* ⚠ O toggle pedia a INTENÇÃO antes do gesto e cobrava esse preço em toda interação
       para servir à minoria delas. Faixa se faz pelo "Personalizado…". */
    const { onPeriodoChange } = montar(mesUnico(2026, 3));
    expect(screen.queryByText('Período')).toBeNull();
    expect(screen.queryByText('Mês')).toBeNull();
    fireEvent.click(screen.getByText('Fev'));
    expect(onPeriodoChange).toHaveBeenCalledWith(mesUnico(2026, 2));
  });

  it('clicar o fim antes do início devolve o intervalo em ordem (pelo shift)', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 3));
    fireEvent.click(screen.getByText('Set'), { shiftKey: true });
    fireEvent.click(screen.getByText('Mar'), { shiftKey: true });
    expect(onPeriodoChange).toHaveBeenCalledWith({ de: { ano: 2026, mes: 3 }, ate: { ano: 2026, mes: 9 } });
  });

  it('shift+clique é o atalho escondido: dois cliques fazem o período sem sair do modo Mês', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 3));
    fireEvent.click(screen.getByText('Fev'), { shiftKey: true });
    expect(onPeriodoChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Mai'), { shiftKey: true });
    expect(onPeriodoChange).toHaveBeenCalledWith({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 5 } });
  });

  it('em modoUnico não há "Ano" nem "Personalizado…", e o shift não abre exceção', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 3), { modoUnico: true });
    expect(screen.queryByText('Ano')).toBeNull();
    expect(screen.queryByText('Personalizado…')).toBeNull();
    fireEvent.click(screen.getByText('Jul'), { shiftKey: true });
    expect(onPeriodoChange).toHaveBeenCalledWith(mesUnico(2026, 7));
  });
});

describe('a frase', () => {
  it('no mês único não há TEXTO, mas a linha continua lá', () => {
    /* ⚠ A distinção é o adendo inteiro: o texto some, o espaço não. */
    const { container } = render(
      <SeletorPeriodo periodo={mesUnico(2026, 8)} onPeriodoChange={() => {}} />);
    expect(screen.queryByText(/Mostrando/)).toBeNull();
    const linha = container.querySelector('[style*="min-height: 18px"]');
    expect(linha).toBeTruthy();
  });

  it('intervalo traz a contagem, num chip verde de 18px', () => {
    /* ⚠ Em texto escuro sobre o fundo da tela a frase não se lia. Branco sobre branco não
       existe, então o branco trouxe o fundo junto — e o verde é o MESMO da seleção. */
    montar({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
    /* ⚠ A COR NÃO SE LÊ AQUI — o jsdom descarta `hsl(var(...))` ao parsear, e o valor não
       chega nem ao atributo. Prende-se a GEOMETRIA, que ele guarda, e a cor fica provada no
       harness de navegador (medida: #28AF60 sobre branco). */
    const chip = screen.getByText(/Mostrando fev → abr\/2026/);
    expect(chip.style.height).toBe('18px');
    expect(chip.style.borderRadius).toBe('8px');
    expect(chip.style.padding).toBe('0px 8px');
    expect(chip.style.display).toBe('inline-flex');
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

describe('cores por estado — A24 corrigida', () => {
  /* ⚠ O PAPEL, NÃO O CSS. Medido: o jsdom DESCARTA `background: hsl(var(--primary))` ao
     parsear, e o valor nunca chega ao DOM — um teste que lesse `style.background` compararia
     `''` com `'hsl(...)'`, e a versão negativa (`.not.toBe`) passaria sem olhar nada. Prende-se
     a regra (`data-papel`) e, à parte, a tabela que a traduz em cor. */
  const papel = (rotulo: string) => screen.getByText(rotulo).getAttribute('data-papel');

  it('a tabela traduz papel em cor: quanto mais escolhido, mais escuro', () => {
    /* ⚠ VERDE, não azul: azul é a cor da barra e da lateral, e o mês escolhido dizia a
       mesma coisa que o topo da tela. Verde é a cor que só a escolha usa. */
    expect(CARA.extremo.background).toBe('hsl(var(--success))');
    expect(CARA.extremo.color).toBe('hsl(var(--success-foreground))');
    expect(CARA.meio.background).toBe('#dff3e7');
    expect(CARA.meio.color).toBe('#1a7540');
    expect(CARA.fora.background).toBe('#eef0f3');
    /* O defeito que o operador viu era exatamente estes dois trocados. */
    expect(CARA.extremo.background).not.toBe(CARA.fora.background);
    expect(CARA.meio.background).not.toBe(CARA.fora.background);
  });

  it('mês único: só o escolhido é extremo; o resto fica fora', () => {
    montar(mesUnico(2026, 4));
    expect(papel('Abr')).toBe('extremo');
    expect(papel('Mai')).toBe('fora');
    /* A cor em si não se lê no jsdom (ele descarta `hsl(var(...))`); quem a prende é o
       teste da tabela acima. Aqui vale o papel. */
  });

  it('faixa: extremos nos dois cantos, meio no miolo, fora no resto', () => {
    montar({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
    expect(papel('Fev')).toBe('extremo');
    expect(papel('Abr')).toBe('extremo');
    expect(papel('Mar')).toBe('meio');
    expect(papel('Jan')).toBe('fora');
    expect(papel('Mai')).toBe('fora');
  });

  it('NENHUM mês da faixa fica "fora" — é o defeito que o operador viu', () => {
    montar({ de: { ano: 2026, mes: 1 }, ate: { ano: 2026, mes: 5 } });
    for (const r of ['Jan', 'Fev', 'Mar', 'Abr', 'Mai']) {
      expect(papel(r)).not.toBe('fora');
    }
  });
});

describe('"Ano" — o recorte que não tem extremos', () => {
  it('existe, e um clique devolve janeiro a dezembro', () => {
    const { onPeriodoChange } = montar(mesUnico(2026, 4));
    fireEvent.click(screen.getByText('Ano'));
    expect(onPeriodoChange).toHaveBeenCalledWith({ de: { ano: 2026, mes: 1 }, ate: { ano: 2026, mes: 12 } });
  });

  it('com o ano inteiro, os DOZE são "meio" e quem fica "extremo" é o botão "Ano"', () => {
    /* ⚠ Pela regra geral, Jan e Dez seriam extremos — sugerindo que alguém escolheu janeiro
       e dezembro. Ninguém escolheu: escolheu-se o ano. */
    montar({ de: { ano: 2026, mes: 1 }, ate: { ano: 2026, mes: 12 } });
    for (const r of ['Jan', 'Jun', 'Dez']) {
      expect(screen.getByText(r).getAttribute('data-papel')).toBe('meio');
    }
    const botaoAno = screen.getByText('Ano');
    expect(botaoAno.getAttribute('data-papel')).toBe('extremo');
    expect(botaoAno.getAttribute('aria-pressed')).toBe('true');
  });

  it('fora do ano inteiro, o "Ano" fica "fora"', () => {
    montar(mesUnico(2026, 4));
    expect(screen.getByText('Ano').getAttribute('data-papel')).toBe('fora');
    expect(screen.getByText('Ano').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('nada por cima de nada — item C', () => {
  /* ⚠ `getBoundingClientRect` devolve zero no jsdom: comparar retângulos ali provaria que
     0 não sobrepõe 0. O que de fato garante a ausência de sobreposição é a ESTRUTURA — dois
     itens flex irmãos não têm como se cobrir —, e é isso que se prende aqui. O teste de
     retângulos no navegador confirma; não é ele que garante. */
  it('"Ano" e "Personalizado…" ficam FORA do scrollport da fita', () => {
    const { container } = render(
      <SeletorPeriodo periodo={mesUnico(2026, 4)} onPeriodoChange={() => {}} />);
    const fita = container.querySelector('.overflow-x-auto');
    expect(fita).toBeTruthy();
    expect(fita!.contains(screen.getByText('Jan'))).toBe(true);
    expect(fita!.contains(screen.getByText('Ano'))).toBe(false);
    expect(fita!.contains(screen.getByText('Personalizado…'))).toBe(false);
  });

  it('nenhum controle é posicionado absoluto — não há como um cobrir o outro', () => {
    const { container } = render(
      <SeletorPeriodo periodo={mesUnico(2026, 4)} onPeriodoChange={() => {}} />);
    for (const el of Array.from(container.querySelectorAll('button, div'))) {
      const pos = (el as HTMLElement).style.position;
      expect(pos === '' || pos === 'relative' || pos === 'static').toBe(true);
    }
  });

  it('a linha oferece os 15 controles: ano, os doze meses, Ano e Personalizado', () => {
    const { container } = render(
      <SeletorPeriodo periodo={mesUnico(2026, 4)} onPeriodoChange={() => {}} />);
    expect(container.querySelectorAll('button').length).toBe(15);
  });

  it('altura 28px, e ela não muda ao selecionar', () => {
    const { rerender } = montar(mesUnico(2026, 3));
    const antes = screen.getByText('Abr').style.height;
    rerender(mesUnico(2026, 4));
    const depois = screen.getByText('Abr').style.height;
    expect(antes).toBe('28px');
    expect(depois).toBe('28px');
    expect(screen.getByText('Ano').style.height).toBe('28px');
  });
});

describe('A23 ampliada — nada abaixo do seletor se desloca', () => {
  /* ⚠ `getBoundingClientRect` devolve zero no jsdom, então comparar `.top` do que vem
     depois provaria que 0 === 0 — e passaria mesmo com a linha sumindo. O que de fato
     garante o não-deslocamento é a linha da frase EXISTIR sempre, com altura declarada; é
     isso que se prende aqui, e é isso que o navegador confirma na homologação. */
  function montarComVizinho(periodo: Periodo) {
    const r = render(
      <div>
        <SeletorPeriodo periodo={periodo} onPeriodoChange={() => {}} />
        <table data-testid="tabela"><tbody><tr><td>linha</td></tr></tbody></table>
      </div>,
    );
    return {
      rerender: (p: Periodo) => r.rerender(
        <div>
          <SeletorPeriodo periodo={p} onPeriodoChange={() => {}} />
          <table data-testid="tabela"><tbody><tr><td>linha</td></tr></tbody></table>
        </div>,
      ),
      container: r.container,
    };
  }

  const alturaDaLinha = (c: HTMLElement) => {
    const el = c.querySelector('[style*="min-height: 18px"]') as HTMLElement | null;
    return el ? `${el.style.minHeight}|${el.style.lineHeight}` : null;
  };

  it('a linha da frase mede o mesmo com mês único, com faixa e com o ano inteiro', () => {
    const { rerender, container } = montarComVizinho(mesUnico(2026, 4));
    const comMes = alturaDaLinha(container);
    rerender({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
    const comFaixa = alturaDaLinha(container);
    rerender({ de: { ano: 2026, mes: 1 }, ate: { ano: 2026, mes: 12 } });
    const comAno = alturaDaLinha(container);
    expect(comMes).toBe('18px|18px');
    expect(comFaixa).toBe(comMes);
    expect(comAno).toBe(comMes);
  });

  it('o número de elementos entre o seletor e a tabela não muda', () => {
    /* Um irmão a mais ou a menos acima da tabela é exatamente o que a empurra. */
    const contar = (c: HTMLElement) => c.firstElementChild!.children.length;
    const { rerender, container } = montarComVizinho(mesUnico(2026, 4));
    const antes = contar(container);
    rerender({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
    expect(contar(container)).toBe(antes);
    rerender({ de: { ano: 2026, mes: 1 }, ate: { ano: 2026, mes: 12 } });
    expect(contar(container)).toBe(antes);
  });
});

