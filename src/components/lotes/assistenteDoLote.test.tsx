/** LOTES-03 F1 — o assistente "+ Novo lote" na tela: os 5 passos até gravar, o "Cadastrar nova…" com Desfazer, a validação no campo
 *  (nunca no banco) e a edição na mesma combinação (o número fica, nada vai ao banco sem mudança). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  cadastros: [] as Record<string, unknown>[],
  rpc: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const dado = nome === 'categorias_rebanho'
      ? [{ id: 'r-desf', nome: 'Desmama F', codigo: 'desmama_f' }, { id: 'r-mamf', nome: 'Mamotes F', codigo: 'mamotes_f' }]
      : banco.cadastros;
    const b: Record<string, unknown> = {};
    const eu = () => b;
    Object.assign(b, { select: eu, eq: eu, order: eu, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: dado, error: null }).then(ok) });
    return b;
  };
  return { supabase: { from: tabela, rpc: (...a: unknown[]) => banco.rpc(...a) } };
});
const notificar = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useLotesDaFazenda', () => ({ notificarLotesMudaram: notificar }));

import { AssistenteDoLote } from './AssistenteDoLote';
import type { LoteDaLista } from '@/lib/lotes/tipos';

const c = (id: string, tipo: string, sigla: string | null, nome: string, categorias_rebanho: string[] = []) =>
  ({ id, tipo, sigla, nome, categorias_rebanho, ordem: 10, ativo: true });

beforeEach(() => {
  banco.cadastros = [c('df', 'categoria', 'DF', 'Desmama fêmea', ['r-desf']), c('ne', 'raca', 'NE', 'Nelore'), c('rc', 'atividade', 'RC', 'Recria'),
    c('conf', 'sistema', null, 'Confinamento')];
  banco.rpc.mockReset();
  notificar.mockReset();
  banco.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'fn_lote_proximo_numero') return { data: 5, error: null };
    if (fn === 'fn_lote_salvar') return { data: { id: 'novo', codigo: 'DF-NE-RC-05', codigo_antigo: null }, error: null };
    if (fn === 'fn_lote_cadastro_salvar') return { data: { id: 'an' }, error: null };
    return { data: null, error: null };
  });
});

const montar = (mais: Partial<Parameters<typeof AssistenteDoLote>[0]> = {}) => {
  const onPronto = vi.fn(); const onFechar = vi.fn();
  render(<AssistenteDoLote open clienteId="cli" fazendaId="faz" fazendaRotulo="PUR" lotesDaFazenda={[]} onPronto={onPronto} onFechar={onFechar} {...mais} />);
  return { onPronto, onFechar };
};
const cartao = async (sigla: string) => {
  const t = await screen.findByText(sigla, { selector: 'span' });
  return t.closest('[data-testid="assistente-cartao"]')!;
};
const avancar = () => fireEvent.click(screen.getByTestId('assistente-avancar'));

describe('AssistenteDoLote', () => {
  it('criar: categoria → raça → atividade → nº do banco → perfil; o código monta no trilho e vai ao banco pela fn_lote_salvar', async () => {
    const { onPronto } = montar();
    expect(screen.getByTestId('assistente-avancar')).toBeDisabled();
    fireEvent.click(await cartao('DF'));
    expect(screen.getByTestId('assistente-codigo').textContent).toBe('DF-__-__-__');
    avancar();
    fireEvent.click(await cartao('NE')); avancar();
    fireEvent.dblClick(await cartao('RC'));
    await waitFor(() => expect(screen.getByTestId('assistente-codigo').textContent).toBe('DF-NE-RC-05'));
    expect(banco.rpc).toHaveBeenCalledWith('fn_lote_proximo_numero', { p_fazenda: 'faz', p_categoria: 'df', p_raca: 'ne', p_atividade: 'rc' });
    expect(screen.getByTestId('assistente-numero-info').textContent).toContain('Primeiro lote DF-NE-RC na PUR');
    fireEvent.change(screen.getByTestId('assistente-nome-campeiro'), { target: { value: 'L05 - DF Nel. SP' } });
    avancar();
    fireEvent.click(within(screen.getByTestId('assistente-opcoes-sistema')).getByText('Confinamento'));
    expect(screen.getByTestId('assistente-avancar').textContent).toBe('Criar lote');
    avancar();
    await waitFor(() => expect(onPronto).toHaveBeenCalledWith({ id: 'novo', codigo: 'DF-NE-RC-05', codigoAntigo: null }));
    const salvar = banco.rpc.mock.calls.find(x => x[0] === 'fn_lote_salvar')!;
    expect(salvar[1]).toMatchObject({ p_id: null, p_fazenda: 'faz', p_versao: null, p_simular: false,
      p_campos: { categoria_id: 'df', raca_id: 'ne', atividade_id: 'rc', nome_campeiro: 'L05 - DF Nel. SP', sistema_id: 'conf' } });
    expect(notificar).toHaveBeenCalledWith('faz');
  });

  it('cadastrar nova raça: valida no campo sem ir ao banco; grava, escolhe e o Desfazer tira da lista (ativo false)', async () => {
    montar();
    fireEvent.click(await cartao('DF')); avancar();
    fireEvent.click(await screen.findByTestId('assistente-cadastrar-nova'));
    fireEvent.click(screen.getByTestId('assistente-form-ok'));
    expect(screen.getByTestId('assistente-form').textContent).toContain('A sigla precisa de 2 ou 3 letras ou números.');
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.anything());
    fireEvent.change(screen.getByTestId('assistente-form-sigla'), { target: { value: 'an' } });
    fireEvent.change(screen.getByTestId('assistente-form-nome'), { target: { value: 'Angus' } });
    banco.cadastros = [...banco.cadastros, c('an', 'raca', 'AN', 'Angus')];
    fireEvent.click(screen.getByTestId('assistente-form-ok'));
    await waitFor(() => expect(screen.getByTestId('assistente-aviso').textContent).toContain('Raça AN cadastrada e escolhida'));
    expect(banco.rpc).toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_tipo: 'raca', p_id: null, p_sigla: 'AN', p_nome: 'Angus', p_ativo: true, p_simular: false }));
    await waitFor(() => expect(screen.getByTestId('assistente-codigo').textContent).toBe('DF-AN-__-__'));
    fireEvent.click(screen.getByTestId('assistente-desfazer'));
    await waitFor(() => expect(banco.rpc).toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_id: 'an', p_ativo: false })));
    await waitFor(() => expect(screen.getByTestId('assistente-codigo').textContent).toBe('DF-__-__-__'));
  });

  it('editar na mesma combinação: o número é o dele (sem ler o próximo) e sem mudança nada vai ao banco', async () => {
    const editar: LoteDaLista = { id: 'l5', codigo: 'DF-NE-RC-05', codigosAntigos: [], nomeCampeiro: 'L05', situacao: 'ativo', formadoEm: '2026-09-30',
      encerradoEm: null, categoriaId: 'df', racaId: 'ne', atividadeId: 'rc', numero: 5, sistemaId: null, programaId: null, destinoId: null, safra: null,
      carimbo: null, idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 3, anoMesDado: null, cabecas: 80,
      pesoMedioKg: 320, gmdKg: null, pastos: ['CONF.01'], lancamentos: 1, conferir: null };
    const { onPronto } = montar({ editar, lotesDaFazenda: [editar] });
    await waitFor(() => expect(screen.getByTestId('assistente-codigo').textContent).toBe('DF-NE-RC-05'));
    fireEvent.click(screen.getByTestId('assistente-passo-4'));
    expect(screen.getByTestId('assistente-avancar').textContent).toBe('Salvar');
    avancar();
    await waitFor(() => expect(onPronto).toHaveBeenCalledWith({ id: 'l5', codigo: 'DF-NE-RC-05', codigoAntigo: null }));
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_proximo_numero', expect.anything());
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_salvar', expect.anything());
  });

  it('a recusa do banco aparece no aviso do modal (nunca em toast) e o lote não fecha', async () => {
    banco.rpc.mockImplementation(async (fn: string) => (fn === 'fn_lote_proximo_numero' ? { data: 1, error: null }
      : { data: null, error: { code: 'P0001', message: 'Já existe o lote DF-NE-RC-01 nesta fazenda.' } }));
    const { onPronto } = montar();
    fireEvent.click(await cartao('DF')); avancar(); fireEvent.click(await cartao('NE')); avancar(); fireEvent.click(await cartao('RC')); avancar();
    await waitFor(() => expect(screen.getByTestId('assistente-avancar')).not.toBeDisabled());
    avancar(); avancar();
    await waitFor(() => expect(screen.getByTestId('assistente-aviso').textContent).toContain('Já existe o lote DF-NE-RC-01 nesta fazenda.'));
    expect(onPronto).not.toHaveBeenCalled();
  });
});
