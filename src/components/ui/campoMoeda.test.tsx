/**
 * UI-CAMPO-MOEDA-01 — todo campo de valor mostra "R$" (fixo, dentro do campo, à esquerda) e "0,00" quando vazio; o texto é só o número.
 * A trava: o prefixo existe sempre (sem prop que o desligue) e nenhum uso do campo escreve um segundo "R$" no placeholder.
 */
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CampoMoeda, separarClasses } from './campo-moeda';

/* o hospedeiro guarda o valor, como os modais fazem */
function Hospedeiro({ onChange, inicial = null, ...props }: Partial<Parameters<typeof CampoMoeda>[0]> & { inicial?: number | null; onChange: (n: number | null) => void }) {
  const [v, setV] = useState<number | null>(inicial);
  return <CampoMoeda {...props} valor={v} onChange={(n) => { setV(n); onChange(n); }} />;
}
const montar = (props: Partial<Parameters<typeof CampoMoeda>[0]> & { inicial?: number | null } = {}) => {
  const onChange = vi.fn();
  render(<Hospedeiro onChange={onChange} {...props} />);
  return { onChange, campo: screen.getByTestId('campo-moeda'), input: screen.getByRole('textbox') };
};

describe('o campo de valor', () => {
  it('vazio: o "R$" dentro do campo e o placeholder "0,00"', () => {
    const { campo, input } = montar();
    expect(screen.getByTestId('prefixo-rs').textContent).toBe('R$');
    expect(input.getAttribute('placeholder')).toBe('0,00');
    expect(input.className).toContain('text-right');
    expect(input.className).toContain('pl-6');
    expect(campo.textContent).toBe('R$');
  });
  it('digitado "197607,98": mostra "R$ 197.607,98" e devolve 197607.98', () => {
    const { campo, input, onChange } = montar();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '197607,98' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(197607.98);
    expect((input as HTMLInputElement).value).toBe('197.607,98');
    expect(`${screen.getByTestId('prefixo-rs').textContent} ${(input as HTMLInputElement).value}`).toBe('R$ 197.607,98');
    expect(campo.textContent).toBe('R$');
  });
  it('negativo: "R$ −1.234,56", e o sinal volta como número', () => {
    const { input, onChange } = montar({ aceitaNegativo: true });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-1234,56' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(-1234.56);
    expect((input as HTMLInputElement).value).toBe('−1.234,56');
  });
  it('4 casas mantêm o "R$"; placeholder próprio continua valendo', () => {
    const { input } = montar({ casas: 4, inicial: 97.8532, placeholder: 'o saldo devedor' });
    expect(screen.getByTestId('prefixo-rs').textContent).toBe('R$');
    expect((input as HTMLInputElement).value).toBe('97,8532');
    expect(input.getAttribute('placeholder')).toBe('o saldo devedor');
  });
  it('as classes de lugar vão ao invólucro, as do campo ficam no input', () => {
    expect(separarClasses('h-7 mt-0.5 flex-1 w-[120px] text-[11px] col-span-2')).toEqual({ fora: 'mt-0.5 flex-1 w-[120px] col-span-2', dentro: 'h-7 text-[11px]' });
    const { campo, input } = montar({ className: 'h-6 mt-0.5 text-[11px]' });
    expect(campo.className).toContain('mt-0.5');
    expect(input.className).not.toContain('mt-0.5');
    expect(input.className).toContain('h-6');
  });
});

describe('a trava', () => {
  const fonte = readFileSync(resolve(__dirname, 'campo-moeda.tsx'), 'utf8');
  it('o prefixo é fixo: sem prop que o desligue', () => {
    expect(fonte).toContain('data-testid="prefixo-rs">R$</span>');
    expect(/semPrefixo|prefixo\?:|comPrefixo/.test(fonte)).toBe(false);
  });
  it('nenhum uso do campo escreve um segundo "R$" no placeholder (o detector sabe achar)', () => {
    const DUPLICADO = /<CampoMoeda[^>]*placeholder="R\$/s;
    expect(DUPLICADO.test('<CampoMoeda valor={v}\n  placeholder="R$ 0,00" />')).toBe(true);
    const arquivos: string[] = [];
    const andar = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) andar(p); else if (/\.tsx$/.test(n) && !/\.test\./.test(n)) arquivos.push(p); } };
    andar(resolve(__dirname, '../..'));
    const com = arquivos.filter((p) => {
      const s = readFileSync(p, 'utf8');
      return [...s.matchAll(/<CampoMoeda\b[^>]*?\/>/gs)].some((m) => /placeholder="R\$/.test(m[0]));
    });
    expect(com).toEqual([]);
  });
});
