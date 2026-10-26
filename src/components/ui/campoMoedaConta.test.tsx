/**
 * FIN-VALOR-CALC-01b — a conta DENTRO do `CampoMoeda` (todos os campos de valor do sistema).
 * Sem operador, o campo é o de sempre (foto); com operador, o gesto do Valor do lançamento: Enter/blur aplica, Esc cancela sem
 * fechar o modal, conta que não fecha não grava e deixa a frase. O hospedeiro só recebe o RESULTADO.
 */
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CampoMoeda } from './campo-moeda';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';

/** O elemento como input, sem cast: falha alto se não for. */
const comoInput = (el: Element | null | undefined): HTMLInputElement => { if (!(el instanceof HTMLInputElement)) throw new Error('não é input'); return el; };

type Props = Partial<Parameters<typeof CampoMoeda>[0]> & { inicial?: number | null };
function Hospedeiro({ onChange, inicial = null, ...props }: Props & { onChange: (n: number | null) => void }) {
  const [v, setV] = useState<number | null>(inicial);
  return (<>
    <CampoMoeda {...props} valor={v} onChange={(n) => { setV(n); onChange(n); }} />
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

describe('foto — sem operador, o HTML é o do campo antes da 01b', () => {
  const fotos: Record<string, string> = JSON.parse(readFileSync(resolve(__dirname, 'campoMoeda.fotos.json'), 'utf8'));
  const cen: [string, Props, string[]][] = [
    ['vazio', {}, []],
    ['com-valor', { inicial: 976224 }, []],
    ['digitando', {}, ['focus', '976224']],
    ['digitado-blur', {}, ['focus', '197607,98', 'blur']],
    ['negativo', { aceitaNegativo: true }, ['focus', '-1234,56', 'blur']],
    ['sinal-so', { aceitaNegativo: true }, ['focus', '-']],
    ['4-casas', { casas: 4, inicial: 97.8532, placeholder: 'o saldo devedor' }, []],
    ['disabled', { disabled: true, inicial: 10, title: 't' }, []],
    ['classes', { className: 'h-6 mt-0.5 flex-1 text-[11px]', inicial: 1 }, ['focus', '1.000', 'blur']],
  ];
  it('as nove fotos existem (o conjunto comparado não é vazio)', () => {
    expect(Object.keys(fotos).sort()).toEqual(cen.map(c => c[0]).sort());
  });
  it.each(cen)('%s', (nome, props, passos) => {
    function H(p: Props) { const [v, setV] = useState<number | null>(p.inicial ?? null); return <CampoMoeda {...p} valor={v} onChange={setV} />; }
    const { container } = render(<H {...props} />);
    const input = container.querySelector('input')!;
    for (const p of passos) {
      if (p === 'focus') fireEvent.focus(input); else if (p === 'blur') fireEvent.blur(input); else fireEvent.change(input, { target: { value: p } });
    }
    expect(container.innerHTML).toBe(fotos[nome]);
    cleanup();
  });
});

describe('a conta no campo', () => {
  it('caso do Gabriel: "988.224-976.224" no bônus → R$ 12.000,00; durante a conta o hospedeiro fica com o último número', () => {
    const { input, onChange, hospedeiro, balao } = montar();
    fireEvent.focus(input);
    digitar(input, '988.224');
    expect(hospedeiro()).toBe('988224');
    digitar(input, '988.224-', '988.224-976.224');
    expect(input.value).toBe('988.224-976.224');
    expect(balao()?.textContent).toBe('= 12.000,00');
    expect(hospedeiro()).toBe('988224');
    /* nenhum número parcial foi emitido: o parseMoeda leria "988.224-976.224" como 988224976224 */
    expect(onChange.mock.calls.every(([n]) => n === null || n <= 988224)).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(hospedeiro()).toBe('12000');
    expect(input.value).toBe('12.000,00');
    expect(balao()).toBeNull();
  });
  it('"976.224,00+12.000", "1.000.000-976.224", "16.238,00/2": sair do campo aplica', () => {
    for (const [conta, esperado, texto] of [['976.224,00+12.000', '988224', '988.224,00'], ['1.000.000-976.224', '23776', '23.776,00'], ['16.238,00/2', '8119', '8.119,00']]) {
      const { input, hospedeiro } = montar();
      fireEvent.focus(input);
      digitar(input, conta);
      fireEvent.blur(input);
      expect(hospedeiro()).toBe(esperado);
      expect(input.value).toBe(texto);
      cleanup();
    }
  });
  it('"10%" sozinho: dez por cento do valor que o campo tinha ao ganhar o foco', () => {
    const { input, hospedeiro, balao } = montar({ inicial: 976224 });
    fireEvent.focus(input);
    digitar(input, '1', '10');           // o "1" e o "10" chegam ao hospedeiro como número, como sempre
    expect(hospedeiro()).toBe('10');
    digitar(input, '10%');
    expect(balao()?.textContent).toBe('= 97.622,40');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(hospedeiro()).toBe('97622.4');
  });
  it('operador digitado sobre o campo todo selecionado (chega só "+"): o valor que estava é o primeiro operando', () => {
    const { input, hospedeiro, balao } = montar({ inicial: 976224 });
    fireEvent.focus(input);
    digitar(input, '+');
    expect(input.value).toBe('976.224,00+');
    expect(balao()?.textContent).toBe('= …');
    digitar(input, '976.224,00+12.000');
    fireEvent.blur(input);
    expect(hospedeiro()).toBe('988224');
  });
  it('colar um operador sozinho ("/") não é conta sobre o valor: a lib recusa e nada grava', () => {
    const { input, hospedeiro, balao } = montar({ inicial: 100 });
    fireEvent.focus(input);
    fireEvent.paste(input);
    digitar(input, '/');
    expect(input.value).toBe('/');
    fireEvent.blur(input);
    expect(hospedeiro()).toBe('100');
    expect(balao()?.textContent).toBe('conta inválida');
  });
  it('conta inválida: Enter não aplica (fica aberta com a frase); sair volta ao valor do foco e a frase fica até a próxima digitação', () => {
    const { input, hospedeiro, balao } = montar({ inicial: 500 });
    fireEvent.focus(input);
    digitar(input, '7', '7/0');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('7/0');
    expect(balao()?.textContent).toBe('divisão por zero');
    expect(balao()?.getAttribute('data-erro')).toBe('sim');
    fireEvent.blur(input);
    expect(hospedeiro()).toBe('500');
    expect(input.value).toBe('500,00');
    expect(balao()?.textContent).toBe('divisão por zero');
    fireEvent.focus(input);
    expect(balao()).toBeNull();
  });
  it('negativo onde o campo não aceita: frase pronta, não grava', () => {
    const { input, hospedeiro, balao } = montar({ inicial: 5 });
    fireEvent.focus(input);
    digitar(input, '5-10');
    expect(balao()?.textContent).toBe('resultado negativo');
    fireEvent.blur(input);
    expect(hospedeiro()).toBe('5');
  });
  it('aceitaNegativo: o resultado negativo vale e o "-" sozinho continua sendo sinal', () => {
    const { input, hospedeiro } = montar({ aceitaNegativo: true, inicial: -1845.32 });
    expect(input.value).toBe('−1.845,32');
    fireEvent.focus(input);
    digitar(input, '+');
    expect(input.value).toBe('−1.845,32+');
    digitar(input, '−1.845,32+100');
    fireEvent.blur(input);
    expect(hospedeiro()).toBe('-1745.32');
    expect(input.value).toBe('−1.745,32');
    fireEvent.focus(input);
    digitar(input, '-');
    expect(screen.queryByTestId('conta-do-campo')).toBeNull();
    digitar(input, '-50');
    fireEvent.blur(input);
    expect(hospedeiro()).toBe('-50');
  });
  it('casas: 4 casas no resultado', () => {
    const { input, hospedeiro } = montar({ casas: 4 });
    fireEvent.focus(input);
    digitar(input, '100/3');
    fireEvent.blur(input);
    expect(hospedeiro()).toBe('33.3333');
    expect(input.value).toBe('33,3333');
  });
  it('desabilitado não entra em modo conta', () => {
    const { input, balao } = montar({ disabled: true, inicial: 10 });
    digitar(input, '10+5');
    expect(balao()).toBeNull();
  });
  it('apagar a conta inteira devolve o campo ao de sempre, vazio', () => {
    const { input, hospedeiro } = montar({ inicial: 10 });
    fireEvent.focus(input);
    digitar(input, '10+5', '');
    expect(hospedeiro()).toBe('nulo');
    expect(screen.queryByTestId('conta-do-campo')).toBeNull();
  });
});

describe('Esc com a conta aberta dentro de um modal Radix', () => {
  function Modal({ onOpenChange }: { onOpenChange: (o: boolean) => void }) {
    const [v, setV] = useState<number | null>(976224);
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Negociar lote</DialogTitle>
          <DialogDescription>bônus</DialogDescription>
          <CampoMoeda valor={v} onChange={setV} />
          <output data-testid="hospedeiro">{String(v)}</output>
        </DialogContent>
      </Dialog>
    );
  }
  it('cancela a conta, volta ao valor do foco e o modal NÃO fecha; sem conta, o Esc fecha como sempre', () => {
    const onOpenChange = vi.fn();
    render(<Modal onOpenChange={onOpenChange} />);
    const input = comoInput(screen.getByRole('textbox'));
    fireEvent.focus(input);
    digitar(input, '9', '9+1');
    expect(screen.getByTestId('hospedeiro').textContent).toBe('9');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(input.value).toBe('976.224,00');
    expect(screen.getByTestId('hospedeiro').textContent).toBe('976224');
    expect(screen.queryByTestId('conta-do-campo')).toBeNull();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it('Enter com a conta aberta não chega a quem escuta o teclado no documento (nenhum "salvar" por atalho)', () => {
    const noDocumento = vi.fn();
    document.addEventListener('keydown', noDocumento, true);
    render(<Modal onOpenChange={() => {}} />);
    const input = comoInput(screen.getByRole('textbox'));
    fireEvent.focus(input);
    digitar(input, '976.224,00+1');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(noDocumento).not.toHaveBeenCalled();
    expect(screen.getByTestId('hospedeiro').textContent).toBe('976225');
    fireEvent.keyDown(input, { key: 'Enter' });   // sem conta: o Enter segue o caminho de sempre
    expect(noDocumento).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', noDocumento, true);
  });
});

describe('a fonte — um dono da conta', () => {
  /* P91: o gesto saiu do `CampoMoeda` para o hook `useContaNoCampo` (conta-no-campo.tsx), o mesmo do campo de número. */
  const fonte = readFileSync(resolve(__dirname, 'conta-no-campo.tsx'), 'utf8');
  const campo = readFileSync(resolve(__dirname, 'campo-moeda.tsx'), 'utf8');
  it('o campo chama a lib; não há eval nem Function', () => {
    expect(fonte).toContain("from '@/lib/calculos/contaNoCampo'");
    expect(fonte).toContain('calcularConta(conta, { casas, aceitaNegativo, base: valorNoFoco.current })');
    expect(campo).toContain('useContaNoCampo({ valor, casas, aceitaNegativo, escrever, setTexto, onChange })');
    for (const f of [fonte, campo]) expect(/\beval\s*\(|new Function\b/.test(f)).toBe(false);
  });
});
