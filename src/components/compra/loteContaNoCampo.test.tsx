/**
 * LOTE-PESO-CALC-01 — a conta nos campos do lote (Quantidade, Peso medio, Valor), pelo dono `resolverCampoDoLote` em cima do
 * `contaNoCampo`. O `LoteDialog` e' montado de verdade: resolve ao sair do campo e no Enter; recusada, o campo volta e a frase fica
 * no lugar reservado; o Aplicar nunca deixa sair conta nao resolvida.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LoteDialog, type SaidaDoLote } from '@/components/compra/AbaNegociacaoLotes';
import { resolverCampoDoLote, textoComOperador, lerQuantidadeDoLote, FRASE_QUANTIDADE_INTEIRA } from '@/lib/oc/numeroDoLote';
import { FRASE_DA_CONTA } from '@/lib/calculos/contaNoCampo';
import type { LoteForm } from '@/hooks/useCompraLotes';

const PESO_CONTA = '(36*461,72+18*456,61)/54';

describe('o dono: resolverCampoDoLote', () => {
  it('peso: a media ponderada dos dois lotes do frigorifico da 460,02', () => {
    expect(resolverCampoDoLote(PESO_CONTA, 'peso')).toEqual({ ok: true, texto: '460,02' });
  });
  it('quantidade: 36+18 = 54', () => {
    expect(resolverCampoDoLote('36+18', 'quantidade')).toEqual({ ok: true, texto: '54' });
  });
  it('conta invalida e' + "' recusada com a frase do dono", () => {
    expect(resolverCampoDoLote('36++', 'quantidade')).toEqual({ ok: false, frase: FRASE_DA_CONTA.invalida });
    expect(resolverCampoDoLote('10/0', 'peso')).toEqual({ ok: false, frase: FRASE_DA_CONTA.divisao_por_zero });
  });
  it('quantidade: conta que nao da inteiro e "54,5" direto sao recusados com a mesma frase', () => {
    expect(resolverCampoDoLote('55/2', 'quantidade')).toEqual({ ok: false, frase: FRASE_QUANTIDADE_INTEIRA });
    expect(resolverCampoDoLote('54,5', 'quantidade')).toEqual({ ok: false, frase: FRASE_QUANTIDADE_INTEIRA });
  });
  it('valor: 10000*2+500 = 20.500,00', () => {
    expect(resolverCampoDoLote('10000*2+500', 'valor')).toEqual({ ok: true, texto: '20.500,00' });
  });
  it('numero simples segue o leitor do lote: o texto de maquina do banco nao vira milhar', () => {
    expect(resolverCampoDoLote('481.780', 'peso')).toEqual({ ok: true, texto: '481,78' });
    expect(resolverCampoDoLote('', 'peso')).toEqual({ ok: true, texto: '' });
  });
  it('o detector de operador sabe achar (auto-teste) e nao acusa numero', () => {
    for (const t of ['36+18', '10*2', '(1)', '5-3', '6/2', '3×2']) expect(textoComOperador(t)).toBe(true);
    for (const t of ['54', '481.780', '1.234,56', '', '-5']) expect(textoComOperador(t)).toBe(false);
  });
});

const LOTE: LoteForm = {
  idLocal: 'loc-1', id: 'l1', ordem: 1, categoria: 'vacas', quantidade: '18', pesoMedioKg: '481.780',
  criterioValor: 'total', valorInformado: '', observacao: '',
};
const CATS = [{ value: 'vacas', label: 'Vacas' }];
function montar(over: Partial<Parameters<typeof LoteDialog>[0]> = {}) {
  const onAplicar = vi.fn();
  render(<LoteDialog lote={LOTE} categoriasDisponiveis={CATS} fisicoRO={false} somenteLeitura={false} rotuloCategoria={() => 'Vacas'}
    onAplicar={onAplicar} onAplicarEAdicionar={vi.fn()} onFechar={vi.fn()} comObservacao {...over} />);
  return { onAplicar };
}
const qtd = () => screen.getByTestId('lote-quantidade') as HTMLInputElement;
const peso = () => screen.getByTestId('lote-peso') as HTMLInputElement;
const valor = () => {
  const l = Array.from(document.querySelectorAll('label')).find(x => /^Valor/.test(x.textContent ?? ''));
  const el = l?.parentElement?.querySelector('input');
  if (!el) throw new Error('sem o campo Valor');
  return el as HTMLInputElement;
};
const slot = () => screen.getByTestId('lote-recusa-conta');
const digitar = (el: HTMLInputElement, v: string) => { fireEvent.focus(el); fireEvent.change(el, { target: { value: v } }); };

describe('o LoteDialog resolve a conta (ao sair e no Enter)', () => {
  it('Quantidade: 36+18 vira 54 ao sair do campo', () => {
    montar();
    digitar(qtd(), '36+18'); fireEvent.blur(qtd());
    expect(qtd().value).toBe('54');
    expect(slot().textContent).toBe('');
  });
  it('Peso: a conta vira 460,02 no Enter', () => {
    montar();
    digitar(peso(), PESO_CONTA); fireEvent.keyDown(peso(), { key: 'Enter' });
    expect(peso().value).toBe('460,02');
  });
  it('conta invalida: o campo volta ao que tinha e a frase fica no lugar reservado', () => {
    montar();
    digitar(peso(), '36++'); fireEvent.blur(peso());
    expect(peso().value).toBe('481.780');
    expect(slot().textContent).toBe(`Peso médio: ${FRASE_DA_CONTA.invalida}`);
    fireEvent.focus(peso()); fireEvent.blur(peso());
    expect(slot().textContent).toBe(`Peso médio: ${FRASE_DA_CONTA.invalida}`);
  });
  it('Quantidade "54,5" e conta com resultado nao inteiro sao recusadas (sem truncar)', () => {
    montar();
    digitar(qtd(), '54,5'); fireEvent.blur(qtd());
    expect(qtd().value).toBe('18');
    expect(slot().textContent).toBe(`Quantidade: ${FRASE_QUANTIDADE_INTEIRA}`);
    digitar(qtd(), '55/2'); fireEvent.blur(qtd());
    expect(qtd().value).toBe('18');
  });
  it('Valor do lote: 10000*2+500 vira 20.500,00 (o campo mostra R$ 20.500,00 fora do foco)', () => {
    const { onAplicar } = montar();
    digitar(valor(), '10000*2+500'); fireEvent.blur(valor());
    expect(valor().value.replace(/\s/g, ' ')).toBe('R$ 20.500,00');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ valorInformado: '20.500,00' });
  });
  it('o lugar reservado existe sempre, com altura fixa', () => {
    montar();
    expect(slot().className).toContain('h-[14px]');
    expect(slot().textContent).toBe('');
  });
  it('o abate (semValor) nao tem campo de Valor', () => {
    montar({ semValor: true });
    expect(Array.from(document.querySelectorAll('label')).some(x => /^Valor/.test(x.textContent ?? ''))).toBe(false);
  });
});

describe('o Aplicar nunca deixa sair conta nao resolvida', () => {
  it('conta digitada e Aplicar direto (sem sair do campo): resolve e aplica o numero', () => {
    const { onAplicar } = montar();
    fireEvent.change(qtd(), { target: { value: '36+18' } });
    fireEvent.change(peso(), { target: { value: PESO_CONTA } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ quantidade: '54', pesoMedioKg: '460,02' });
  });
  it('conta invalida no Aplicar: nao aplica, o campo volta e a frase aparece', () => {
    const { onAplicar } = montar();
    fireEvent.change(qtd(), { target: { value: '36+' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onAplicar).not.toHaveBeenCalled();
    expect(qtd().value).toBe('18');
    expect(slot().textContent).toBe(`Quantidade: ${FRASE_DA_CONTA.invalida}`);
  });
  it('sem mexer, o texto de maquina do banco sai como veio (nao passa pelo dono)', () => {
    const { onAplicar } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ quantidade: '18', pesoMedioKg: '481.780' });
  });
  it('o aviso pos-saida dispara com o valor CALCULADO', () => {
    const saida: SaidaDoLote = { loteId: 'l1', data: '2026-09-01', quantidade: 18, pesoMedio: 481.78, cancelado: false };
    const { onAplicar } = montar({ saidas: [saida], semValor: true });
    fireEvent.change(qtd(), { target: { value: '36+18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const aviso = screen.getByTestId('aviso-saida-atualizada');
    const linhas = Array.from(within(aviso).getByTestId('aviso-antes-depois').querySelectorAll('tbody tr')).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => (td.textContent ?? '').replace(/ /g, ' ')));
    expect(linhas[0]).toEqual(['Quantidade', '18 cab', '54 cab']);
    expect(onAplicar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('aviso-aplicar'));
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ quantidade: '54' });
  });
});

/* Ajuste antes do commit (Gabriel, 14/10): (A) valor simples com as casas digitadas; (B) ponto de milhar na quantidade. */
describe('ajuste: casas do valor e milhar da quantidade', () => {
  it('(A) valor simples "14,125" sai com as tres casas; a conta "14,125*2" sai a duas (28,25)', () => {
    expect(resolverCampoDoLote('14,125', 'valor')).toEqual({ ok: true, texto: '14,125' });
    expect(resolverCampoDoLote('14,125*2', 'valor')).toEqual({ ok: true, texto: '28,25' });
    expect(resolverCampoDoLote('20500', 'valor')).toEqual({ ok: true, texto: '20.500,00' });
  });
  it('(A) o peso medio segue a duas casas', () => {
    expect(resolverCampoDoLote('460,016', 'peso')).toEqual({ ok: true, texto: '460,02' });
  });
  it('(B) "1.200" e "12.000" sao milhar; "1.200,5" e "54,5" seguem recusados', () => {
    expect(resolverCampoDoLote('1.200', 'quantidade')).toEqual({ ok: true, texto: '1200' });
    expect(resolverCampoDoLote('12.000', 'quantidade')).toEqual({ ok: true, texto: '12000' });
    expect(resolverCampoDoLote('1.200,5', 'quantidade')).toEqual({ ok: false, frase: FRASE_QUANTIDADE_INTEIRA });
    expect(resolverCampoDoLote('54,5', 'quantidade')).toEqual({ ok: false, frase: FRASE_QUANTIDADE_INTEIRA });
    expect(lerQuantidadeDoLote('1200')).toBe(1200);
    expect(lerQuantidadeDoLote('1.20')).toBe(1.2);
  });
  it('(B) lote de 1200 cab do banco: abre mostrando "1200" e, sem tocar, aplica como veio', () => {
    const { onAplicar } = montar({ lote: { ...LOTE, quantidade: '1200' } });
    expect(qtd().value).toBe('1200');
    fireEvent.focus(qtd()); fireEvent.blur(qtd());
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ quantidade: '1200' });
    expect(slot().textContent).toBe('');
  });
  it('(B) "1.200" digitado na Quantidade vira 1200; "1.200,5" e' + "'" + ' recusado', () => {
    montar();
    digitar(qtd(), '1.200'); fireEvent.blur(qtd());
    expect(qtd().value).toBe('1200');
    digitar(qtd(), '1.200,5'); fireEvent.blur(qtd());
    expect(qtd().value).toBe('1200');
    expect(slot().textContent).toBe(`Quantidade: ${FRASE_QUANTIDADE_INTEIRA}`);
  });
});
