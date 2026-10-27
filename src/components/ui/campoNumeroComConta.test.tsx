/**
 * P91 — a conta no campo de NÚMERO (kg, @, %, cab, dias). O gesto é o do `CampoMoeda` (o mesmo hook, `useContaNoCampo`): operador →
 * balão com o resultado; Enter/sair aplica; Esc cancela sem fechar o modal; conta que não fecha não grava e deixa a frase. O hospedeiro
 * só recebe o RESULTADO, nas casas do campo.
 */
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CampoNumeroComConta } from './campo-numero-com-conta';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';

const comoInput = (el: Element | null | undefined): HTMLInputElement => { if (!(el instanceof HTMLInputElement)) throw new Error('não é input'); return el; };

type Props = Partial<Parameters<typeof CampoNumeroComConta>[0]> & { inicial?: number | null };
function Hospedeiro({ onChange, inicial = null, ...props }: Props & { onChange: (n: number | null) => void }) {
  const [v, setV] = useState<number | null>(inicial);
  return (<>
    <CampoNumeroComConta {...props} valor={v} onChange={(n) => { setV(n); onChange(n); }} />
    <output data-testid="hospedeiro">{v == null ? 'nulo' : String(v)}</output>
  </>);
}
const montar = (props: Props = {}) => {
  const onChange = vi.fn();
  render(<Hospedeiro onChange={onChange} {...props} />);
  const input = comoInput(screen.getByRole('textbox'));
  return { onChange, input, hospedeiro: () => screen.getByTestId('hospedeiro').textContent, balao: () => screen.queryByTestId('conta-do-campo') };
};
const digitar = (input: HTMLInputElement, ...textos: string[]) => { for (const t of textos) fireEvent.change(input, { target: { value: t } }); };

describe('o número sem conta', () => {
  it('lido pelo parseMoeda (o leitor dos operandos), escrito nas casas do campo ao sair; vazio é vazio', () => {
    const { input, hospedeiro } = montar();
    fireEvent.focus(input);
    digitar(input, '12.260,8');
    expect(hospedeiro()).toBe('12260.8');
    fireEvent.blur(input);
    expect(input.value).toBe('12.260,80');
    fireEvent.focus(input); digitar(input, ''); fireEvent.blur(input);
    expect(input.value).toBe('');
    expect(hospedeiro()).toBe('nulo');
  });

  it('casas 0 arredonda (cabeça)', () => {
    const a = montar({ casas: 0 });
    fireEvent.focus(a.input); digitar(a.input, '54,5'); fireEvent.blur(a.input);
    expect(a.input.value).toBe('55');
    expect(a.hospedeiro()).toBe('55');
  });

  it('percentual: o "%" digitado é a unidade, não o operador', () => {
    const { input, hospedeiro, balao } = montar({ percentual: true });
    fireEvent.focus(input);
    digitar(input, '1,5%');
    expect(balao()).toBeNull();
    fireEvent.blur(input);
    expect(input.value).toBe('1,50');
    expect(hospedeiro()).toBe('1.5');
  });
});

describe('a conta no campo de número', () => {
  it('caso do Gabriel: "445,97*0,50" na carcaça → 222,99; durante a conta o hospedeiro fica com o último número', () => {
    const { input, hospedeiro, balao, onChange } = montar();
    fireEvent.focus(input);
    digitar(input, '445,97', '445,97*', '445,97*0,50');
    expect(balao()?.textContent).toBe('= 222,99');
    expect(hospedeiro()).toBe('445.97');
    onChange.mockClear();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(hospedeiro()).toBe('222.99');
    expect(input.value).toBe('222,99');
    expect(balao()).toBeNull();
  });

  it('cabeças: "36+18" = 54 (casas 0), aplicado no Enter', () => {
    const a = montar({ casas: 0 });
    fireEvent.focus(a.input); digitar(a.input, '36+18');
    expect(a.balao()?.textContent).toBe('= 54');
    fireEvent.keyDown(a.input, { key: 'Enter' });
    expect(a.hospedeiro()).toBe('54');
  });

  it('5 casas no resultado (a média do boitel): "2251,67/109" = 20,65752', () => {
    const { input, hospedeiro } = montar({ casas: 5 });
    fireEvent.focus(input); digitar(input, '2251,67/109'); fireEvent.blur(input);
    expect(input.value).toBe('20,65752');
    expect(hospedeiro()).toBe('20.65752');
  });

  it('soAoSair: o hospedeiro não recebe nada enquanto digita; Enter ou sair entrega (com e sem conta)', () => {
    const { input, onChange, hospedeiro } = montar({ soAoSair: true });
    fireEvent.focus(input);
    digitar(input, '2', '25', '250');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(hospedeiro()).toBe('250');
    digitar(input, '250*2');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(hospedeiro()).toBe('500');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('conta que não fecha: sair não grava, volta ao valor do foco e a frase fica no balão', () => {
    const { input, hospedeiro, balao } = montar({ inicial: 260, soAoSair: true });
    fireEvent.focus(input);
    digitar(input, '52/0');
    fireEvent.blur(input);
    expect(hospedeiro()).toBe('260');
    expect(input.value).toBe('260,00');
    expect(balao()?.getAttribute('data-erro')).toBe('sim');
    fireEvent.focus(input);
    expect(balao()).toBeNull();
  });

  it('negativo é recusa (peso, arroba e cabeça não têm negativo)', () => {
    const { input, hospedeiro } = montar();
    fireEvent.focus(input); digitar(input, '10-20'); fireEvent.blur(input);
    expect(hospedeiro()).toBe('nulo');
  });

  it('desabilitado não entra em modo conta', () => {
    const { input, balao } = montar({ disabled: true });
    digitar(input, '1+1');
    expect(balao()).toBeNull();
  });
});

describe('Esc com a conta aberta dentro de um modal Radix', () => {
  function NoModal({ aoFechar }: { aoFechar: () => void }) {
    const [v, setV] = useState<number | null>(445.97);
    return (
      <Dialog open onOpenChange={(o) => { if (!o) aoFechar(); }}>
        <DialogContent>
          <DialogTitle>t</DialogTitle><DialogDescription>d</DialogDescription>
          <CampoNumeroComConta valor={v} onChange={setV} soAoSair />
        </DialogContent>
      </Dialog>
    );
  }
  it('cancela a conta, volta ao valor do foco e o modal NÃO fecha', () => {
    const aoFechar = vi.fn();
    render(<NoModal aoFechar={aoFechar} />);
    const input = comoInput(screen.getByRole('textbox'));
    fireEvent.focus(input);
    digitar(input, '445,97*0,5');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(aoFechar).not.toHaveBeenCalled();
    expect(input.value).toBe('445,97');
    expect(screen.queryByTestId('conta-do-campo')).toBeNull();
  });
});

describe('a fonte — um gesto só', () => {
  it('o campo de número usa o hook do campo de dinheiro; nenhum parser novo', () => {
    const fonte = readFileSync(resolve(__dirname, 'campo-numero-com-conta.tsx'), 'utf8');
    expect(fonte).toContain("import { useContaNoCampo, BalaoDaConta } from '@/components/ui/conta-no-campo';");
    expect(fonte).toContain('const ler = (t: string): number | null => parseMoeda(t);');
    expect(/\beval\s*\(|new Function\b|parseFloat|parseNumericValue/.test(fonte)).toBe(false);
  });
});
