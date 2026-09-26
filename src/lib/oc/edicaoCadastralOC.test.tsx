/**
 * OC-EDITAR-CADASTRAL-01 — com a OC fechada o cadastral grava sem reabrir, e o operacional ja' nasce travado.
 *
 * ⚠ NASCE DA da0b8577 (RRCC, venda boitel, 29/07/2025, julho/25 fechado no P1): trocar o comprador foi recusado com o
 *   toast "Negociacao fechada; reabra para editar (oc_reabrir)". O caminho existia desde 30/08
 *   (`oc_editar_dados_operacao`) e so' a compra o usava.
 * ⚠ A REGRA DE BANCO (lista branca sem a data; favorecido dos compromissos sem titulo acompanhando a troca) esta'
 *   provada em rollback no cabecalho da migration 20261027155000. Aqui fica o que a TELA faz.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { caminhoDoSalvarOC, soCadastrais, CAMPOS_CADASTRAIS_OC } from '@/lib/oc/edicaoCadastralOC';

/* O mes da data: oficial (fechado no P1) ou nao — cada caso decide. */
const p1 = vi.hoisted(() => ({ status: 'aberto' }));
vi.mock('@/hooks/useStatusPilares', () => ({
  useStatusPilares: () => ({ status: { p1_mapa_pastos: { status: p1.status } }, loading: false, error: null, refetch: async () => {} }),
}));
vi.mock('@/hooks/useOcCompromissos', () => ({
  useOcCompromissos: () => ({ resumoOperacao: null, compromissos: [], loading: false, recarregar: async () => {} }),
}));

import { VendaModalShell } from '@/components/venda/VendaModalShell';
import { AbateModalShell } from '@/components/abate/AbateModalShell';
import { BoitelBlocosModais, boitelVazio } from '@/components/venda/BoitelBlocosModais';

const FAZ = [{ id: 'faz-ursa', nome: 'Faz. Ursa Maior' }];
const CP = [{ id: 'ricardo', nome: 'Ricardo Goulart' }, { id: 'boitel-ricardo', nome: 'Boitel Ricardo Goulart' }];

function venda(over: Partial<ComponentProps<typeof VendaModalShell>> = {}) {
  const onSalvarOperacao = vi.fn(async () => true);
  render(
    <VendaModalShell
      data="2025-07-29" setData={() => {}} compradorId="ricardo" setCompradorId={() => {}} contrapartes={CP}
      onNovoComprador={() => {}} vendaFazendaId="faz-ursa" setVendaFazendaId={() => {}} fazendasOC={FAZ}
      propriedadeDestino="" setPropriedadeDestino={() => {}} vendaTipoVenda="" setVendaTipoVenda={() => {}}
      observacao="" setObservacao={() => {}} ocOperacaoId="da0b8577" ocStatusComercial="fechada"
      categoria="" categoriasDisponiveis={[]} quantidadeNum={0} pesoKgNum={0} submitting={false}
      onSalvarOperacao={onSalvarOperacao} onSalvarNegociacao={async () => {}} onFechar={() => {}}
      {...over} />,
  );
  return { onSalvarOperacao };
}

function abate(over: Partial<ComponentProps<typeof AbateModalShell>> = {}) {
  const onSalvarOperacao = vi.fn(async () => true);
  render(
    <AbateModalShell
      data="2025-07-29" setData={() => {}} frigorificoId="ricardo" setFrigorificoId={() => {}} contrapartes={CP}
      onNovoFrigorifico={() => {}} abateFazendaId="faz-ursa" setAbateFazendaId={() => {}} fazendasOC={FAZ}
      observacao="" setObservacao={() => {}} numeroDocumento={null} ocOperacaoId="op-abate" ocStatusComercial="fechada"
      categoria="" categoriasDisponiveis={[]} quantidadeNum={0} pesoKgNum={0} submitting={false}
      onSalvarOperacao={onSalvarOperacao} onSalvarNegociacao={async () => {}} onFechar={() => {}}
      {...over} />,
  );
  return { onSalvarOperacao };
}

const campoData = () => screen.getByPlaceholderText('dd/mm/aaaa');
/* O gatilho do seletor de fazenda — o nome aparece tambem no resumo lateral. */
const seletorFazenda = () => screen.getAllByText('Faz. Ursa Maior').map(e => e.closest('button')).find(b => !!b);
const salvar = () => screen.getByRole('button', { name: /Salvar alterações/ });

describe('o caminho do Salvar e o que ele leva', () => {
  it('fechada -> editar_dados; aberta e rascunho -> salvar_rascunho; cancelada -> nada', () => {
    expect(caminhoDoSalvarOC('fechada')).toBe('editar_dados');
    expect(caminhoDoSalvarOC('programada')).toBe('salvar_rascunho');
    expect(caminhoDoSalvarOC(null)).toBe('salvar_rascunho');
    expect(caminhoDoSalvarOC('cancelada')).toBe('nenhum');
  });

  it('so os cadastrais vao — data e fazenda ficam de fora mesmo sujas', () => {
    expect(CAMPOS_CADASTRAIS_OC).toEqual(['contraparte_id', 'observacoes', 'numero_documento']);
    expect(soCadastrais({ contraparte_id: 'ricardo', data_operacao: '2025-07-30', observacoes: 'x', fazenda_id: 'f' }))
      .toEqual({ contraparte_id: 'ricardo', observacoes: 'x' });
    /* e a busca sabe achar: sem nada cadastral, sai vazio */
    expect(soCadastrais({ data_operacao: '2025-07-30' })).toEqual({});
  });
});

describe('venda fechada', () => {
  it('data, fazenda e tipo de venda travados com cadeado; comprador e observacao livres; o selo diz por que', () => {
    venda({ semAlteracoes: false });
    expect(screen.getByText('Operação fechada · reabra para editar')).toBeTruthy();
    expect(campoData().hasAttribute('disabled')).toBe(true);
    const combos = screen.getAllByRole('combobox');
    const tipo = combos.find(c => c.textContent?.includes('Selecione...'));
    expect(tipo?.hasAttribute('disabled')).toBe(true);
    expect(seletorFazenda()?.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText('Ricardo Goulart').map(e => e.closest('button')).find(b => !!b)?.hasAttribute('disabled')).toBe(false);
    expect(screen.getAllByPlaceholderText('Opcional').every(i => !i.hasAttribute('disabled'))).toBe(true);
  });

  it('o Salvar grava o cadastral (sem tipo de venda) e o mes fechado NAO o trava; o erro vem ao lado', () => {
    p1.status = 'oficial';
    const { onSalvarOperacao } = venda({ semAlteracoes: false, erroSalvar: 'Selecione o comprador.' });
    expect(salvar().hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/reabra o período para lançar/)).toBeNull();
    fireEvent.click(salvar());
    expect(onSalvarOperacao).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Selecione o comprador.')).toBeTruthy();
    p1.status = 'aberto';
  });

  it('ABERTA como hoje: tudo editavel, e o motivo do mes fechado continua escrito ao lado do Salvar', () => {
    p1.status = 'oficial';
    venda({ ocStatusComercial: 'programada', vendaTipoVenda: 'gado_adulto', semAlteracoes: false });
    expect(screen.queryByText('Operação fechada · reabra para editar')).toBeNull();
    expect(campoData().hasAttribute('disabled')).toBe(false);
    expect(seletorFazenda()?.hasAttribute('disabled')).toBe(false);
    /* a busca sabe achar: e' a mesma frase que some na OC fechada */
    expect(screen.getByText(/reabra o período para lançar/)).toBeTruthy();
    p1.status = 'aberto';
  });
});

describe('abate fechado', () => {
  it('data e fazenda travadas; comprador e observacao livres; Salvar grava e o P1 nao trava', () => {
    p1.status = 'oficial';
    const { onSalvarOperacao } = abate({ semAlteracoes: false });
    expect(screen.getByText('Operação fechada · reabra para editar')).toBeTruthy();
    expect(campoData().hasAttribute('disabled')).toBe(true);
    expect(seletorFazenda()?.hasAttribute('disabled')).toBe(true);
    expect(screen.getByPlaceholderText('Opcional').hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/reabra o período para lançar/)).toBeNull();
    const botao = screen.getByRole('button', { name: 'Salvar abate' });
    expect(botao.hasAttribute('disabled')).toBe(false);
    fireEvent.click(botao);
    expect(onSalvarOperacao).toHaveBeenCalledTimes(1);
    p1.status = 'aberto';
  });

  it('ABERTO como hoje: data editavel e sem selo', () => {
    abate({ ocStatusComercial: 'programada' });
    expect(screen.queryByText('Operação fechada · reabra para editar')).toBeNull();
    expect(campoData().hasAttribute('disabled')).toBe(false);
  });
});

describe('boitel com a OC fechada — "Lancar realizado" continua', () => {
  it('blocos travados, mas o botao aparece e chama o iniciar (que reabre antes de abrir)', async () => {
    const iniciar = vi.fn(async () => true);
    render(<BoitelBlocosModais valor={boitelVazio()} onChange={() => {}} somenteLeitura podeLancarRealizado
      motivoTravado="Operação fechada · reabra para editar" onIniciarRealizado={iniciar} onChangeRealizado={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lançar realizado do abate' }));
    await vi.waitFor(() => expect(iniciar).toHaveBeenCalledTimes(1));
  });

  it('sem a excecao, somenteLeitura esconde o botao como antes (cancelada)', () => {
    render(<BoitelBlocosModais valor={boitelVazio()} onChange={() => {}} somenteLeitura onIniciarRealizado={async () => true} />);
    expect(screen.queryByRole('button', { name: 'Lançar realizado do abate' })).toBeNull();
  });
});
