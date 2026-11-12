/**
 * PASTO-CADASTRO-GEO-01 (2) e (4) — a ficha do pasto (Cadastros › Pastos › lápis):
 *   (4) UM Salvar no rodapé que acende com mudança em QUALQUER aba (a sombra da Infraestrutura também) e mostra a prévia ali mesmo;
 *       trocar de aba não perde nada (a avaliação em aberto sobrevive); fechar com mudança pergunta antes;
 *   (2) o "a partir de" fica travado de propósito até a área mudar, e o diz no lugar do campo.
 * Banco de mentira: a `api` é injetada; nada sai daqui.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }) },
}));

import { FichaDoPasto } from './FichaDoPasto';
import { API_FICHA_DO_PASTO, FORM_VAZIO, type ApiFichaDoPasto, type FichaLida } from '@/lib/pastos/fichaDoPasto';

const LIDA: FichaLida = {
  form: { ...FORM_VAZIO, nome: 'CONF.01', tipoUso: 'engorda', area: 0.2, areaDesde: '2026-11' },
  versao: 3, areaOficial: 0.2, areaMapa: 0.21, difPct: 5, nPoligonos: 1, travaDaArea: null, anoMes: '2026-11',
  resumo: { forrageira: null, reforma: null, avaliacao: null, suporte: null, epoca: null },
};

function abrir() {
  const salvar = vi.fn(async () => ({ ok: true as const, dados: { muda: [{ campo: 'sombra_cobertura', antes: null, depois: 'suficiente' }] } }));
  const api: ApiFichaDoPasto = {
    ...API_FICHA_DO_PASTO,
    ler: async () => ({ ok: true, dados: LIDA }),
    salvar,
    infra: async () => ({ ok: true, dados: [] }),
    avaliacoes: async () => ({ ok: true, dados: [] }),
  };
  const aoFechar = vi.fn();
  render(<FichaDoPasto pastoId="p1" fazendaId="f1" fazendaNome="PUR · Faz. Pureza" clienteId="c1" mesDeHoje="2026-11" hoje="2026-11-11"
    podeEditar aoFechar={aoFechar} aoGravar={vi.fn()} api={api} />);
  return { salvar, aoFechar };
}

describe('ficha do pasto — um Salvar para o modal inteiro (4)', () => {
  it('mudar a sombra na Infraestrutura acende o Salvar e a prévia aparece na própria aba', async () => {
    const { salvar } = abrir();
    await screen.findByDisplayValue('CONF.01');
    expect(screen.getByTestId('ficha-salvar')).toBeDisabled();
    fireEvent.click(screen.getByTestId('ficha-aba-infra'));
    fireEvent.click(await screen.findByRole('button', { name: 'Suficiente' }));
    expect(screen.getByTestId('ficha-salvar')).toBeEnabled();
    expect(screen.getByTestId('ficha-frase').textContent).toMatch(/mudança não salva/);
    fireEvent.click(screen.getByTestId('ficha-salvar'));
    await screen.findByTestId('ficha-previa');
    expect(salvar).toHaveBeenCalledWith('p1', 3, { sombra_cobertura: 'suficiente' }, null, true);
  });

  it('trocar de aba não perde a mudança; fechar com mudança pergunta, e "Continuar editando" mantém tudo', async () => {
    const { aoFechar } = abrir();
    await screen.findByDisplayValue('CONF.01');
    fireEvent.click(screen.getByTestId('ficha-aba-infra'));
    fireEvent.click(await screen.findByRole('button', { name: 'Suficiente' }));
    fireEvent.click(screen.getByTestId('ficha-aba-cadastro'));
    fireEvent.click(screen.getByTestId('ficha-aba-infra'));
    expect(screen.getByTestId('ficha-salvar')).toBeEnabled();
    expect(screen.getByTestId('ficha-frase').textContent).toMatch(/mudança não salva/);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(await screen.findByTestId('ficha-perguntar-fechar')).toBeInTheDocument();
    expect(aoFechar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByTestId('ficha-perguntar-fechar')).toBeNull());
    expect(screen.getByTestId('ficha-salvar')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(await screen.findByTestId('ficha-sair-sem-salvar'));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('sem mudança, fechar não pergunta', async () => {
    const { aoFechar } = abrir();
    await screen.findByDisplayValue('CONF.01');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('ficha-perguntar-fechar')).toBeNull();
  });

  it('a avaliação em aberto sobrevive à troca de aba e o fechar pergunta por ela', async () => {
    const { aoFechar } = abrir();
    await screen.findByDisplayValue('CONF.01');
    fireEvent.click(screen.getByTestId('ficha-aba-avaliacoes'));
    fireEvent.click(await screen.findByTestId('ficha-nova-avaliacao'));
    fireEvent.click(screen.getByTestId('ficha-aba-cadastro'));
    fireEvent.click(screen.getByTestId('ficha-aba-avaliacoes'));
    expect(screen.getByTestId('ficha-avaliacao-form')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect((await screen.findByTestId('ficha-perguntar-fechar')).textContent).toMatch(/avaliação em aberto/);
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe('ficha do pasto — o "a partir de" (2)', () => {
  it('travado até a área mudar, com a nota no lugar', async () => {
    abrir();
    await screen.findByDisplayValue('CONF.01');
    expect(screen.getByText('mude a área para escolher')).toBeInTheDocument();
  });
});
