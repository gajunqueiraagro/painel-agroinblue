/**
 * UI-SELECT-ALINHAMENTO-01 — o texto do gatilho do Select fica à ESQUERDA e corta na BORDA, em todo o sistema.
 *
 * ⚠ O DEFEITO (print do Gabriel, 02/10 06:43, Mesa do Enriquecer, "Documento · tipo"): o gatilho é um <button>
 *   (text-align: center do navegador) e o texto um <span> com `line-clamp-1`. Com o texto que NÃO cabe, o span ocupa a
 *   largura toda e herda o centralizado — "Folha de..." com um vazio à esquerda — e a quebra por palavra inteira cortava
 *   antes do necessário. O conserto é no componente (três classes no span), nunca por tela.
 * ⚠ O jsdom NÃO MEDE LAYOUT: aqui se prova o CONTRATO das classes; a posição renderizada vai nos prints do relatório.
 * ⚠ `flex-1` NÃO entra no span de propósito: o gatilho com `justify-center` (o ano do Fechamento, 56px) segue centralizado
 *   porque o span com texto curto continua do tamanho do texto.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

function montar(classe?: string) {
  render(
    <Select value="folha">
      <SelectTrigger data-testid="gatilho" className={classe}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="folha">Folha de Pagamento</SelectItem>
      </SelectContent>
    </Select>,
  );
  return screen.getByTestId('gatilho');
}

describe('Select — o texto do gatilho à esquerda, cortado na borda', () => {
  it('o gatilho leva as três classes do span e mantém o line-clamp e o justify-between', () => {
    const g = montar();
    const classes = g.className.split(/\s+/);
    for (const c of ['[&>span]:min-w-0', '[&>span]:text-left', '[&>span]:break-all', '[&>span]:line-clamp-1', 'justify-between']) {
      expect(classes).toContain(c);
    }
    /* o span que as classes miram é o filho direto com o valor selecionado */
    const span = g.querySelector(':scope > span');
    expect(span).toHaveTextContent('Folha de Pagamento');
  });

  it('o span NÃO ganha flex-1: o gatilho centralizado da tela continua centralizado', () => {
    const g = montar('h-6 w-[56px] justify-center');
    expect(g.className).not.toMatch(/\[&>span\]:flex-1/);
    /* o `cn` deixa o justify da tela vencer o do componente */
    expect(g.className.split(/\s+/)).toContain('justify-center');
    expect(g.className.split(/\s+/)).not.toContain('justify-between');
  });
});
