/**
 * OC-LOTE-FISICO-POS-SAIDA-01 — o lote com saida registrada: quantidade e peso EDITAVEIS; mudar um deles AVISA antes de aplicar
 * (modal centrado com Antes · Depois e a linha da saida), e o aviso so' aplica o patch local — quem grava e' o Salvar da negociacao.
 * O `LoteDialog` e' montado de verdade (o mesmo da compra, da venda e do abate).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  LoteDialog, TEXTO_SAIDA_REGISTRADA, FRASE_AVISO_SAIDA, type SaidaDoLote,
} from '@/components/compra/AbaNegociacaoLotes';
import type { LoteForm } from '@/hooks/useCompraLotes';

const LOTE: LoteForm = {
  idLocal: 'loc-1', id: 'l1', ordem: 1, categoria: 'vacas', quantidade: '18', pesoMedioKg: '481,78',
  criterioValor: 'kg', valorInformado: '', observacao: '',
};
const SAIDA: SaidaDoLote = { loteId: 'l1', data: '2026-09-01', quantidade: 18, pesoMedio: 481.78, cancelado: false };
const CATS = [{ value: 'vacas', label: 'Vacas' }];

function montar(over: Partial<Parameters<typeof LoteDialog>[0]> = {}) {
  const onAplicar = vi.fn();
  const onAplicarEAdicionar = vi.fn();
  render(<LoteDialog lote={LOTE} categoriasDisponiveis={CATS} fisicoRO somenteLeitura={false} rotuloCategoria={() => 'Vacas'}
    onAplicar={onAplicar} onAplicarEAdicionar={onAplicarEAdicionar} onFechar={vi.fn()} semValor comObservacao saidas={[SAIDA]} {...over} />);
  return { onAplicar, onAplicarEAdicionar };
}
const campo = (rotulo: RegExp) => {
  const l = screen.getAllByText(rotulo)[0].closest('div');
  const el = l?.querySelector('input, button[role="combobox"]');
  if (!el) throw new Error(`sem o campo ${rotulo}`);
  return el as HTMLInputElement;
};

describe('o lote com saida registrada (D2)', () => {
  it('quantidade e peso HABILITADOS com a saida; o cabecalho diz que a saida acompanha', () => {
    montar();
    expect(campo(/^Quantidade/).disabled).toBe(false);
    expect(campo(/^Peso méd/).disabled).toBe(false);
    expect(campo(/^Quantidade/).getAttribute('title')).toBeNull();
    expect(screen.getByText(TEXTO_SAIDA_REGISTRADA)).toBeTruthy();
    expect(TEXTO_SAIDA_REGISTRADA).toBe('Saída registrada: mudar quantidade ou peso atualiza a saída junto.');
  });
  it('o motivo de ACESSO (sem `negociar_apos_movimento`) ainda apaga os dois, com o motivo no title', () => {
    montar({ acesso: { motivoFisico: 'só quem move o gado altera' } });
    expect(campo(/^Quantidade/).disabled).toBe(true);
    expect(campo(/^Peso méd/).disabled).toBe(true);
    expect(campo(/^Quantidade/).getAttribute('title')).toBe('só quem move o gado altera');
  });
  it('somenteLeitura ainda apaga os dois', () => {
    montar({ somenteLeitura: true });
    expect(campo(/^Quantidade/).disabled).toBe(true);
    expect(campo(/^Peso méd/).disabled).toBe(true);
  });
});

describe('o aviso antes de aplicar (D3)', () => {
  it('Aplicar SEM mudar quantidade nem peso: aplica direto, sem o aviso', () => {
    const { onAplicar } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.queryByTestId('aviso-saida-atualizada')).toBeNull();
    expect(onAplicar).toHaveBeenCalledTimes(1);
  });
  it('mudou o peso: abre o aviso com Antes · Depois, o peso total e a linha da saida; nada aplicado ainda', () => {
    const { onAplicar } = montar();
    fireEvent.change(campo(/^Peso méd/), { target: { value: '471,78' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const aviso = screen.getByTestId('aviso-saida-atualizada');
    expect(within(aviso).getByText('A saída registrada vai ser atualizada')).toBeTruthy();
    const linhas = Array.from(within(aviso).getByTestId('aviso-antes-depois').querySelectorAll('tbody tr')).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => (td.textContent ?? '').replace(/ /g, ' ')));
    expect(linhas).toEqual([
      ['Quantidade', '18 cab', '18 cab'],
      ['Peso médio', '481,78 kg', '471,78 kg'],
      ['Peso total', '8.672,04 kg', '8.492,04 kg'],
    ]);
    expect(within(aviso).getByTestId('aviso-linha-saida').textContent).toBe('Saída de 01/09/26 · 18 cab · 481,78 kg');
    expect(within(aviso).getByText(FRASE_AVISO_SAIDA)).toBeTruthy();
    expect(onAplicar).not.toHaveBeenCalled();
  });
  it('Voltar: nao aplica', () => {
    const { onAplicar } = montar();
    fireEvent.change(campo(/^Quantidade/), { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    fireEvent.click(within(screen.getByTestId('aviso-saida-atualizada')).getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByTestId('aviso-saida-atualizada')).toBeNull();
    expect(onAplicar).not.toHaveBeenCalled();
  });
  it('Aplicar do aviso: aplica o patch local com a quantidade nova (nao grava nada)', () => {
    const { onAplicar } = montar();
    fireEvent.change(campo(/^Quantidade/), { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    fireEvent.click(screen.getByTestId('aviso-aplicar'));
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ quantidade: '17', pesoMedioKg: '481,78', categoria: 'vacas' });
  });
  it('lote sem saida ativa (a saida estornada nao conta): sem aviso, aplica direto', () => {
    const { onAplicar } = montar({ saidas: [{ ...SAIDA, cancelado: true }], fisicoRO: false });
    fireEvent.change(campo(/^Quantidade/), { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.queryByTestId('aviso-saida-atualizada')).toBeNull();
    expect(onAplicar).toHaveBeenCalledTimes(1);
  });
  it('o aviso tem tamanho fixo (520 x 240) e nao rola', () => {
    montar();
    fireEvent.change(campo(/^Quantidade/), { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const cls = screen.getByTestId('aviso-saida-atualizada').className;
    for (const c of ['h-[240px]', 'w-[520px]', 'overflow-hidden']) expect(cls).toContain(c);
  });
});

/* (D4) a recusa ao Salvar vai a um modal centrado nos tres lados: lido da FONTE, com auto-teste do detector. */
describe('a recusa do Salvar da negociacao, nos tres lados (fonte)', () => {
  const SALVAR_SEM_RECUSA = /lotesApi\??\.salvar\((?!\{[^)]*aoRecusar)[^)]*\)/;
  it('o detector sabe achar (auto-teste)', () => {
    expect(SALVAR_SEM_RECUSA.test('await api.lotesApi?.salvar({ silent: true })')).toBe(true);
    expect(SALVAR_SEM_RECUSA.test('onClick={() => api.lotesApi?.salvar()}')).toBe(true);
    expect(SALVAR_SEM_RECUSA.test('await lotesApi.salvar()')).toBe(true);
    expect(SALVAR_SEM_RECUSA.test('await api.lotesApi?.salvar({ silent: true, aoRecusar: setRecusaNegociacao })')).toBe(false);
  });
  it('compra: os tres Salvar passam aoRecusar e o shell monta o modal', () => {
    const f = readFileSync('src/components/compra/CompraModalShell.tsx', 'utf8');
    expect(f.match(/aoRecusar: setRecusaNegociacao\b/g)).toHaveLength(3);
    expect(f).not.toMatch(SALVAR_SEM_RECUSA);
    expect(f).toContain('<RecusaNegociacaoDialog frase={recusaNegociacao}');
  });
  it('venda e abate: o dono do salvar (LancamentosTab) passa aoRecusar nos dois, e os shells montam o modal', () => {
    const l = readFileSync('src/pages/LancamentosTab.tsx', 'utf8');
    const codigo = l.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codigo.match(/aoRecusar: setRecusaNegociacaoOC/g)).toHaveLength(2);
    expect(codigo).not.toMatch(SALVAR_SEM_RECUSA);
    expect(l.match(/recusaNegociacao=\{recusaNegociacaoOC\}/g)).toHaveLength(2);
    for (const s of ['src/components/venda/VendaModalShell.tsx', 'src/components/abate/AbateModalShell.tsx']) {
      expect(readFileSync(s, 'utf8')).toContain('<RecusaNegociacaoDialog frase={recusaNegociacao}');
    }
  });
});
