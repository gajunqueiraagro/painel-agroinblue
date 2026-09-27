/**
 * OC-RECLASSIFICAR-ITEM-01 — a venda e o abate abrem na aba que a URL pede (`?oc_aba`), como a compra ja' abria.
 *
 * ⚠ NASCE DA VOLTA DO DRILL: abrir o titulo pela aba Financeiro da OC, fechar o modal do Financeiro e voltar a' OC
 *   caia na aba de identificacao — a URL dizia `oc_aba=financeiro` e so' o `CompraModalShell` a lia. Medido no preview
 *   na 77d963be (RRCC, venda boitel) em 27/09/2026.
 * ⚠ OS DOIS LADOS: com a aba pedida, a identificacao NAO aparece; sem ela (ou com uma aba que o shell nao tem), aparece
 *   — um teste so' de "abriu na financeiro" passaria verde num shell que ignorasse a aba e nunca mostrasse a identificacao.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';

vi.mock('@/hooks/useStatusPilares', () => ({
  useStatusPilares: () => ({ status: { p1_mapa_pastos: { status: 'aberto' } }, loading: false, error: null, refetch: async () => {} }),
}));
vi.mock('@/hooks/useOcCompromissos', () => ({
  useOcCompromissos: () => ({ resumoOperacao: null, compromissos: [], loading: false, recarregar: async () => {} }),
}));

import { VendaModalShell } from '@/components/venda/VendaModalShell';
import { AbateModalShell } from '@/components/abate/AbateModalShell';

const FAZ = [{ id: 'faz-ursa', nome: 'Faz. Ursa Maior' }];
const CP = [{ id: 'ricardo', nome: 'Ricardo Goulart' }];

const venda = (over: Partial<ComponentProps<typeof VendaModalShell>> = {}) => render(
  <VendaModalShell
    data="2023-07-05" setData={() => {}} compradorId="ricardo" setCompradorId={() => {}} contrapartes={CP}
    onNovoComprador={() => {}} vendaFazendaId="faz-ursa" setVendaFazendaId={() => {}} fazendasOC={FAZ}
    propriedadeDestino="" setPropriedadeDestino={() => {}} vendaTipoVenda="" setVendaTipoVenda={() => {}}
    observacao="" setObservacao={() => {}} ocOperacaoId="77d963be" ocStatusComercial="fechada"
    categoria="" categoriasDisponiveis={[]} quantidadeNum={0} pesoKgNum={0} submitting={false}
    onSalvarOperacao={async () => true} onSalvarNegociacao={async () => {}} onFechar={() => {}}
    {...over} />,
);
const abate = (over: Partial<ComponentProps<typeof AbateModalShell>> = {}) => render(
  <AbateModalShell
    data="2023-07-05" setData={() => {}} frigorificoId="ricardo" setFrigorificoId={() => {}} contrapartes={CP}
    onNovoFrigorifico={() => {}} abateFazendaId="faz-ursa" setAbateFazendaId={() => {}} fazendasOC={FAZ}
    observacao="" setObservacao={() => {}} numeroDocumento={null} ocOperacaoId="op-abate" ocStatusComercial="fechada"
    categoria="" categoriasDisponiveis={[]} quantidadeNum={0} pesoKgNum={0} submitting={false}
    onSalvarOperacao={async () => true} onSalvarNegociacao={async () => {}} onFechar={() => {}}
    {...over} />,
);

describe('a aba inicial da OC pela URL', () => {
  it('venda: oc_aba=financeiro abre na Financeiro; sem ela, na identificacao', () => {
    const { unmount } = venda({ abaInicial: 'financeiro' });
    expect(screen.queryByText('Identificação da venda')).toBeNull();
    unmount();
    venda();
    expect(screen.getByText('Identificação da venda')).toBeTruthy();
  });

  it('abate: oc_aba=financeiro abre na Financeiro; aba que o shell nao tem cai na identificacao', () => {
    const { unmount } = abate({ abaInicial: 'financeiro' });
    expect(screen.queryByText('Identificação do abate')).toBeNull();
    unmount();
    abate({ abaInicial: 'recebimento' });
    expect(screen.getByText('Identificação do abate')).toBeTruthy();
  });
});
