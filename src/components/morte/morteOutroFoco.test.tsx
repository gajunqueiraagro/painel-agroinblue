/**
 * MORTE-OUTRO-FOCO-01 (Chat 10/11 08:32, Santa Rita · Lançar › Morte) — 'Outro (digitar)' com 'Não mamou' gravou 'Parto distócico', e a
 * observação ficou vazia. A trilha do proto mostra o lançamento criado com o motivo da lista e a observação nula (corrigido depois pela
 * edição). CAUSA: escolhido o "Outro", o Select devolvia o foco ao próprio gatilho, e o que se digitava ia para a busca por letra do
 * Select (o "P" escolhe "Parto distócico"); nada chegava ao campo do motivo nem à observação.
 *   F1 escolhido o "Outro", o foco está no "Digite o motivo"; o que se digita fica nele e o motivo segue "Outro"
 *   F2 escolhido um motivo da lista, o de sempre: sem o campo do "Outro" e o motivo gravado é o da lista
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useState } from 'react';

vi.mock('@/hooks/useStatusPilares', () => ({
  useStatusPilares: () => ({ status: { p1_mapa_pastos: { status: 'pendente' } }, loading: false, error: null, refetch: async () => {} }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: null, error: null }) } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ isAdmin: true, clienteAtual: { id: 'c1', perfil: 'admin_agroinblue' } }) }));
vi.mock('@/hooks/useOcCompromissos', () => ({
  useOcCompromissos: () => ({ resumoOperacao: null, compromissos: [], loading: false, recarregar: async () => {} }),
}));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { MorteModalShell } from './MorteModalShell';

/* o Select do Radix usa estes do navegador; o jsdom não os tem */
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

const mascara = { displayValue: '', onChange: () => {}, onBlur: () => {}, onFocus: () => {} };
const estado = { motivo: '', outro: '' };

function Modal() {
  const [motivo, setMotivo] = useState('');
  const [outro, setOutro] = useState('');
  const [obs, setObs] = useState('');
  estado.motivo = motivo; estado.outro = outro;
  return (
    <MorteModalShell modo="criacao" data="2026-10-27" setData={() => {}} qtdInput={mascara} pesoInput={mascara}
      categoria="" setCategoria={() => {}} categoriasDisponiveis={[]} observacao={obs} setObservacao={setObs}
      morteFazendaId="f" setMorteFazendaId={() => {}} fazendasOC={[{ id: 'f', nome: 'Faz. Exemplo' }]} morteFazendaNome="Faz. Exemplo" morteFazendaFalta={false}
      motivoMorte={motivo} setMotivoMorte={setMotivo} motivoMorteCustom={outro} setMotivoMorteCustom={setOutro}
      motivosDisponiveis={['Raio', 'Parto distócico', 'Causa desconhecida']}
      valorMorte={null} setValorMorte={() => {}} morteQtd={1} mortePeso={30} submitting={false}
      handleRequestRegister={() => {}} fecharModalOCComAutosave={() => {}} />
  );
}

const gatilho = () => screen.getAllByRole('combobox').find((b) => b.textContent?.includes('Selecione o motivo') || b.textContent?.includes('Outro')
  || b.textContent?.includes('Raio'));

async function escolher(rotulo: string) {
  const g = gatilho();
  if (!g) throw new Error('sem o gatilho do motivo');
  g.focus();
  fireEvent.keyDown(g, { key: 'Enter' });
  await act(async () => {});
  const opcao = screen.getByRole('option', { name: rotulo });
  fireEvent.keyDown(opcao, { key: 'Enter' });
  await act(async () => {});
}

describe('MORTE-OUTRO-FOCO-01 — o "Outro (digitar)" leva o foco ao campo do motivo', () => {
  it('F1 o foco no "Digite o motivo"; o "P" digitado não troca o motivo; o texto fica no campo', async () => {
    render(<Modal />);
    await act(async () => {});
    await escolher('Outro (digitar)');
    const campo = screen.getByTestId('morte-motivo-outro');
    expect(estado.motivo).toBe('__custom__');
    expect(document.activeElement).toBe(campo);
    fireEvent.keyDown(document.activeElement ?? campo, { key: 'P' });
    fireEvent.change(campo, { target: { value: 'Não mamou' } });
    await act(async () => {});
    expect([estado.motivo, estado.outro]).toEqual(['__custom__', 'Não mamou']);
  });
  it('F2 um motivo da lista: sem o campo do "Outro"; e trocar do "Outro" para a lista não leva o foco a lugar nenhum novo', async () => {
    render(<Modal />);
    await act(async () => {});
    await escolher('Outro (digitar)');
    await escolher('Raio');
    expect(estado.motivo).toBe('Raio');
    expect(screen.queryByTestId('morte-motivo-outro')).toBeNull();
    expect(document.activeElement?.tagName).not.toBe('INPUT');
  });
});
