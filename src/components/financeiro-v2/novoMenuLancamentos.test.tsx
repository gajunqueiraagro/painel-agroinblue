/**
 * "+ Novo ▾" (Gabriel 15/11; mock novo-menu-v1 aprovado 07:48, D1 selo = "na caixa" + "sem par", D2 sem "Da planilha").
 * ⚠ O menu montado (Radix abre pelo teclado no jsdom) e o lugar na tela de Lançamentos: UM botão na célula do Novo, a célula do
 *   antigo "Da nota" reservada, o mesmo diálogo da nota pelo mesmo estado (`setXmlAberto`).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NovoMenuLancamentos, textoDoSelo } from './NovoMenuLancamentos';

const abrir = () => {
  const b = screen.getByTestId('btn-novo');
  fireEvent.keyDown(b, { key: 'Enter' });
};

describe('o botão "+ Novo ▾"', () => {
  it('o selo: vazio sem número ou com zero; "99+" acima de 99', () => {
    expect([textoDoSelo(null), textoDoSelo(0), textoDoSelo(3), textoDoSelo(99), textoDoSelo(140)]).toEqual(['', '', '3', '99', '99+']);
  });

  it('o lugar do selo é RESERVADO: com e sem pendência, a mesma reserva "99+" (nada desloca)', () => {
    const { rerender } = render(<NovoMenuLancamentos boletosPedemAcao={null} onEmBranco={vi.fn()} onDaNota={vi.fn()} onDosBoletos={vi.fn()} />);
    const sem = screen.getByTestId('selo-boletos');
    expect(sem.getAttribute('data-reserva')).toBe('99+');
    expect(sem.classList.contains('invisible')).toBe(true);
    rerender(<NovoMenuLancamentos boletosPedemAcao={3} onEmBranco={vi.fn()} onDaNota={vi.fn()} onDosBoletos={vi.fn()} />);
    const com = screen.getByTestId('selo-boletos');
    expect(com.getAttribute('data-reserva')).toBe('99+');
    expect(com.classList.contains('invisible')).toBe(false);
    expect(com.textContent).toBe('3');
  });

  it('o menu tem as 3 entradas, cada uma com a sua linha curta, e chama o gesto certo; "Da planilha" não está (D2)', async () => {
    const emBranco = vi.fn(); const daNota = vi.fn(); const dosBoletos = vi.fn();
    render(<NovoMenuLancamentos boletosPedemAcao={3} onEmBranco={emBranco} onDaNota={daNota} onDosBoletos={dosBoletos} />);
    abrir();
    const menu = await screen.findByTestId('menu-novo');
    expect(menu.textContent).toContain('Lançamento em brancopreencher tudo à mão');
    expect(menu.textContent).toContain('Da nota fiscalXML ou PDF: a nota preenche');
    expect(menu.textContent).toContain('3 pedem ação');
    expect(menu.textContent).not.toMatch(/planilha/i);
    fireEvent.click(screen.getByTestId('novo-dos-boletos'));
    expect(dosBoletos).toHaveBeenCalledTimes(1);
    abrir();
    fireEvent.click(await screen.findByTestId('btn-novo-de-xml'));
    expect(daNota).toHaveBeenCalledTimes(1);
    abrir();
    fireEvent.click(await screen.findByTestId('novo-em-branco'));
    await waitFor(() => expect(emBranco).toHaveBeenCalledTimes(1));
  });
});

describe('o lugar na tela de Lançamentos', () => {
  const fonte = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
  const bloco = fonte.slice(fonte.indexOf('const blocoDeAcoesDesktop = ('), fonte.indexOf('const actionButtons = ('));
  it('a grade 2×3: o menu na célula do Novo, a do antigo "Da nota" vazia e reservada; nenhum botão "Da nota" solto', () => {
    expect(bloco).toMatch(/grid w-\[190px\] shrink-0 grid-cols-2[\s\S]*?\{menuNovo\('w-full'\)\}[\s\S]*?<FinanceiroV2ExportMenu[\s\S]*?data-testid="celula-reservada"/);
    expect(fonte).not.toMatch(/<Plus className="h-3 w-3" \/> Da nota/);
    expect(fonte).not.toMatch(/title="Novo Lançamento"/);
  });
  it('"Da nota fiscal" abre o MESMO diálogo de hoje (o estado do NovoDeXmlDialog); "Da caixa de entrada" abre a caixa', () => {
    expect(fonte).toMatch(/onDaNota=\{\(\) => setXmlAberto\(true\)\}/);
    expect(fonte).toMatch(/onDosBoletos=\{\(\) => setCaixaAberta\(true\)\}/);
    expect(fonte).toMatch(/<NovoDeXmlDialog\s+open=\{xmlAberto && !dialogOpen && !notaAberta\}/);
    expect(fonte).toMatch(/\{caixaAberta && clienteAtual\?\.id && \(\s*<CaixaDeBoletosDialog/);
  });
});
