/**
 * UI-MODAL-BLOCOS-01 passo 0 — a primitiva do formulário em blocos: o bloco branco com título pequeno em sentence case, o corpo cinza,
 * o rótulo de uma linha com o texto no `title`. O contrato e o cadastro a importam (o bloco não tem segunda cópia).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlocoFormulario, CorpoFormulario, REGUA_CAMPO, Rotulo } from './bloco-formulario';

describe('a primitiva do formulário em blocos', () => {
  it('bloco branco de borda fina, título 11px/600 sem caixa alta; corpo cinza; rótulo 10px de uma linha', () => {
    render(<CorpoFormulario testId="corpo"><BlocoFormulario titulo="Identificação" dica="quem e o quê" testId="b"><Rotulo texto="Descrição" obrig /></BlocoFormulario></CorpoFormulario>);
    expect(screen.getByTestId('corpo').className).toMatch(/\bbg-muted\b/);
    const b = screen.getByTestId('b');
    expect(b.className).toMatch(/rounded-lg border bg-card/);
    const h = b.querySelector('h3')!;
    expect(h.textContent).toBe('Identificação');
    expect(h.className).toMatch(/text-\[11px\] font-semibold/);
    expect(b.querySelectorAll('[class*="uppercase"], [class*="tracking-"]')).toHaveLength(0);
    const r = screen.getByTitle('Descrição');
    expect(r.textContent).toBe('Descrição *');
    expect(r.className).toMatch(/truncate text-\[10px\]/);
    expect(REGUA_CAMPO).toBe('h-7 text-[11px]');
  });
  it('CORREÇÃO 18/10 — o título fica DENTRO do bloco: linha de 18px com linha fina embaixo, ação na mesma linha; nada absoluto', () => {
    render(<BlocoFormulario titulo="Liberações" acao={<button>+ liberação</button>} testId="b"><Rotulo texto="Data" /></BlocoFormulario>);
    const b = screen.getByTestId('b');
    expect(b.className).toMatch(/\bpx-3 pb-2 pt-1\.5\b/);
    const linha = b.querySelector('[data-titulo-do-bloco]')!;
    expect(linha.parentElement).toBe(b);
    expect(linha.className).toMatch(/min-h-\[18px\]/);
    expect(linha.className).toMatch(/border-b/);
    expect(linha.contains(screen.getByText('+ liberação'))).toBe(true);
    expect(b.querySelectorAll('[class*="absolute"], [class*="bg-muted"]')).toHaveLength(0);
  });
  it('o contrato e o cadastro importam o bloco daqui (sem segunda cópia)', () => {
    const contrato = readFileSync(resolve(__dirname, '../financiamentos/ContratoDeCredito.tsx'), 'utf8');
    const cadastro = readFileSync(resolve(__dirname, '../financiamentos/CadastroDeContratoDialog.tsx'), 'utf8');
    for (const f of [contrato, cadastro]) expect(f).toMatch(/from '@\/components\/ui\/bloco-formulario'/);
    expect(contrato).not.toMatch(/export function Titulo|export const BLOCO_DO_CONTRATO/);
  });
});
