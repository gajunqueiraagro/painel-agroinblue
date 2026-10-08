/**
 * FORN-SELETOR-PADRAO-01 fatia 2b — o EMITENTE do documento da OC pelo dono do seletor de fornecedor.
 * Vazio = "é a própria contraparte" (os três campos do emitente vão NULOS); escolher grava id, nome e documento do cadastro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { DocumentoFormOC, FORM_VAZIO } from './DocumentoFormOC';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';

const registrar = vi.fn(async (_p: unknown) => 'doc-1');
const api = (): DocumentosApi => ({
  documentos: [], lotes: [], loading: false, saving: false,
  registrar, anexarArquivo: vi.fn(async () => true), urlAssinada: vi.fn(async () => null),
  editar: vi.fn(async () => true), cancelar: vi.fn(async () => true), carregarDetalhe: vi.fn(async () => null),
});
const CONTRAPARTE = [{ id: 'cp', nome: 'Contraparte Da Operação', cpfCnpj: null }];
const montar = (extra: Partial<React.ComponentProps<typeof DocumentoFormOC>> = {}) => render(
  <DocumentoFormOC api={api()} initialForm={FORM_VAZIO} fornecedores={CONTRAPARTE} contraparteId="cp" clienteId="cli"
    onCriarFornecedor={async () => null} onSaved={() => {}} onCancel={() => {}} {...extra} />);
const emitenteDoPayload = () => {
  const p = registrar.mock.calls.at(-1)?.[0] as { emitenteId: unknown; emitenteNome: unknown; emitenteDocumento: unknown };
  return [p.emitenteId, p.emitenteNome, p.emitenteDocumento];
};
const seletor = () => screen.getAllByRole('combobox').find((c) => /Mesmo da operação|Beta|Velho/.test(c.textContent ?? ''));

beforeEach(() => {
  registrar.mockClear();
  definirFornecedoresDoLeitor([
    { id: 'a', nome: 'Alfa Agro' }, { id: 'b', nome: 'Beta Boi', cpf_cnpj: '12345678000190' },
    { id: 'm', nome: 'Projeção [META]' }, { id: 'v', nome: 'Velho Ltda', ativo: false },
  ]);
  Element.prototype.scrollIntoView = () => {};
});

describe('emitente do documento da OC', () => {
  it('vazio diz QUEM é ("Mesmo da operação — nome") e grava os três campos do emitente NULOS', async () => {
    montar();
    expect(seletor()?.textContent).toContain('Mesmo da operação — Contraparte Da Operação');
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(emitenteDoPayload()).toEqual([null, null, null]);
  });
  it('a lista é a do leitor (ativos, sem "[META]"); escolher grava id, nome e o documento do cadastro; esvaziar volta à contraparte', async () => {
    montar();
    fireEvent.click(seletor() as HTMLElement);
    expect(screen.getAllByTestId('favorecido-opcao').map((e) => e.textContent?.replace(/\d.*$/, ''))).toEqual(['Alfa Agro', 'Beta Boi']);
    fireEvent.click(screen.getByText('Beta Boi'));
    expect(seletor()?.textContent).toContain('Beta Boi');
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(emitenteDoPayload()).toEqual(['b', 'Beta Boi', '12345678000190']);
    /* o item que esvazia diz o que o vazio significa */
    fireEvent.click(seletor() as HTMLElement);
    fireEvent.click(screen.getAllByText('Mesmo da operação — Contraparte Da Operação').at(-1) as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(2));
    expect(emitenteDoPayload()).toEqual([null, null, null]);
  });
  it('emitente gravado hoje INATIVO: o campo abre com o nome e a marca, nunca vazio', () => {
    montar({ initialForm: { ...FORM_VAZIO, emitenteId: 'v', emitenteNome: 'Velho Ltda' } });
    expect(seletor()?.textContent).toContain('Velho Ltda');
    expect(screen.getByTestId('favorecido-inativo')).toBeTruthy();
  });
  it('o "+" é "Cadastrar emitente"; em somente leitura ele some e o campo trava; sem cliente (o documento por lote) a lista fica vazia', () => {
    const { unmount } = montar();
    expect(screen.getByRole('button', { name: 'Cadastrar emitente' })).toBeTruthy();
    unmount();
    const leitura = montar({ somenteLeitura: true });
    expect(screen.queryByRole('button', { name: 'Cadastrar emitente' })).toBeNull();
    expect(seletor()?.hasAttribute('disabled')).toBe(true);
    leitura.unmount();
    montar({ clienteId: undefined });
    fireEvent.click(seletor() as HTMLElement);
    expect(screen.queryAllByTestId('favorecido-opcao')).toHaveLength(0);
  });
});
