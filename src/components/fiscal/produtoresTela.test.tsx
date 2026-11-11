/**
 * FISCAL onda 1 (a) — a tela de Produtores com a API INJETADA (a mesma porta da bancada): nada fala com o banco.
 *   T1 a lista mostra os titulares com o selo; abre no primeiro; o "+ Produtor" abre a ficha nova só com a Identificação (as outras apagadas)
 *   T2 Salvar = PRÉVIA ANTES: vai ao banco com simular = true e SÓ o que mudou; "Gravar" repete com false; depois o Desfazer manda o de antes
 *   T3 pendência (sem nome) não vai ao banco: o campo fica vermelho e a frase vai ao RODAPÉ (nunca toast)
 *   T4 Inativar pede a prévia com { ativo: false }; a recusa do banco fica no rodapé
 *   T5 a composição da fazenda: ✎ abre a composição INTEIRA (o terceiro junto); a prévia manda o 1º dia do mês e todos os titulares
 *   T6 "nada muda" na prévia apaga o Gravar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => import('../../../scripts/ui-cortes/mocks/supabase'));
vi.mock('@/contexts/ClienteContext', () => import('../../../scripts/ui-cortes/mocks/cliente'));
vi.mock('@/contexts/AuthContext', () => import('../../../scripts/ui-cortes/mocks/auth'));
vi.mock('@/contexts/FazendaContext', () => import('../../../scripts/ui-cortes/mocks/fazenda'));
const toastErro = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastErro(...a), warning: vi.fn() } }));

import { ProdutoresTela } from './ProdutoresTela';
import { ProdutoresApiProvider } from '@/hooks/useProdutores';
import { titularDaLinha, type Titular } from '@/lib/fiscal/produtores';
import type { ProdutoresApi, Resultado } from '@/lib/fiscal/produtoresApi';

const VERA = titularDaLinha({
  id: 't-vera', nome: 'Produtora Sintética', documento: '52998224725', documento_formatado: '529.982.247-25', tipo: 'PF', papel: 'produtor',
  email_fiscal: 'fiscal@teste.com.br', uf: 'MS', regime_ir: 'pf_atividade_rural', ativo: true, ies: [{ uf: 'MS', ie: '281234567', fazenda_id: 'f1' }],
  fazendas: [{ fazenda_id: 'f1', fazenda: 'Faz. Exemplo', participacao: 50, condicao: 'condomino', registra: 'so_a_parte', desde: '2020-01-01', ate: null }],
  condicao_ibs: { condicao: 'nao_contribuinte', desde: '2026-01-01', motivo: 'abaixo do limite' }, grupo: [], contas: [], acordos: 0, pendencias: [],
});
const HIGINO = titularDaLinha({
  id: 't-hig', nome: 'Terceiro Sintético', documento: '12345678909', documento_formatado: '123.456.789-09', tipo: 'PF', papel: 'terceiro', ativo: true,
  fazendas: [{ fazenda_id: 'f1', fazenda: 'Faz. Exemplo', participacao: 50, condicao: 'condomino', registra: 'total', desde: '2020-01-01', ate: null }],
  ies: [], grupo: [], contas: [], acordos: 0, pendencias: [],
});

let gravarTitular: ReturnType<typeof vi.fn>;
let gravarComposicao: ReturnType<typeof vi.fn>;
let respostaTitular: (dados: Record<string, unknown>, simular: boolean) => Resultado<unknown>;

function api(titulares: Titular[]): ProdutoresApi {
  const ok = <T,>(dados: T): Promise<Resultado<T>> => Promise.resolve({ ok: true, dados });
  return {
    lista: () => ok([...titulares]), acordos: () => ok([]), historicoDaCondicao: () => ok([]), imoveis: () => ok([]), contas: () => ok([]),
    gravarTitular: (c, id, d, s) => {
      gravarTitular(c, id, d, s);
      const r = respostaTitular(d, s);
      /* gravar de verdade muda a lista relida (como o banco) */
      if (!s && r.ok && typeof d.email_fiscal === 'string') { const i = titulares.findIndex(t => t.id === id); if (i >= 0) titulares[i] = { ...titulares[i], email_fiscal: d.email_fiscal }; }
      return Promise.resolve(r);
    },
    gravarComposicao: (f, i, p, s) => { gravarComposicao(f, i, p, s); return ok({ frase: 'Faz. Exemplo: nova composição.', antes: [], depois: [], avisos: [] }); },
    gravarCondicao: () => ok({}), gravarGrupo: () => ok({}), gravarContaTitular: () => ok({}), gravarAcordo: () => ok({}),
  };
}
function montar(titulares: Titular[] = [{ ...VERA }, { ...HIGINO }]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ProdutoresApiProvider api={api(titulares)}><ProdutoresTela /></ProdutoresApiProvider></QueryClientProvider>);
}
const previa = () => screen.getByTestId('produtores-previa');

beforeEach(() => {
  cleanup(); toastErro.mockReset();
  gravarTitular = vi.fn(); gravarComposicao = vi.fn();
  respostaTitular = (d, s) => ({ ok: true, dados: { frase: s ? 'Atualiza Produtora Sintética (CPF 529.982.247-25).' : '', diferencas: Object.keys(d).map(k => ({ campo: k, antes: null, depois: d[k] })), titular_id: 't-vera' } });
});

describe('Cadastros › Produtores', () => {
  it('T1 a lista com o selo; abre no primeiro; o novo só tem a Identificação', async () => {
    montar();
    const itens = await screen.findAllByTestId('produtores-item');
    expect(itens.map(i => i.textContent)).toEqual([expect.stringContaining('não contribuinte'), expect.stringContaining('terceiro')]);
    expect(screen.getByTestId('produtor-nome')).toHaveProperty('value', 'Produtora Sintética');
    fireEvent.click(screen.getByTestId('produtores-novo'));
    await waitFor(() => expect(screen.getByTestId('produtor-nome')).toHaveProperty('value', ''));
    const fazendas = screen.getByRole('button', { name: /Fazendas e participação/ });
    expect(fazendas).toHaveProperty('disabled', true);
    expect(fazendas.getAttribute('title')).toBe('salve o produtor primeiro');
  });

  it('T2 Salvar = prévia antes, só o que mudou; Gravar repete com false; Desfazer manda o de antes', async () => {
    montar();
    const nome = await screen.findByTestId('produtor-nome');
    expect(screen.getByTestId('produtor-salvar')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByDisplayValue('fiscal@teste.com.br'), { target: { value: 'novo@teste.com.br' } });
    fireEvent.click(screen.getByTestId('produtor-salvar'));
    await waitFor(() => expect(gravarTitular).toHaveBeenCalledTimes(1));
    expect(gravarTitular).toHaveBeenLastCalledWith('cli', 't-vera', { email_fiscal: 'novo@teste.com.br' }, true);
    expect(within(previa()).getByTestId('produtores-previa-frase').textContent).toBe('Atualiza Produtora Sintética (CPF 529.982.247-25).');
    fireEvent.click(within(previa()).getByTestId('produtores-previa-gravar'));
    await waitFor(() => expect(gravarTitular).toHaveBeenLastCalledWith('cli', 't-vera', { email_fiscal: 'novo@teste.com.br' }, false));
    expect(nome).toBeTruthy();
    /* a lista relida já traz o e-mail novo; o Desfazer manda o de antes, também com prévia */
    await waitFor(() => expect(screen.getByDisplayValue('novo@teste.com.br')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('produtor-desfazer')).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByTestId('produtor-desfazer'));
    await waitFor(() => expect(gravarTitular).toHaveBeenLastCalledWith('cli', 't-vera', { email_fiscal: 'fiscal@teste.com.br' }, true));
    fireEvent.click(within(await screen.findByTestId('produtores-previa')).getByTestId('produtores-previa-gravar'));
    await waitFor(() => expect(gravarTitular).toHaveBeenLastCalledWith('cli', 't-vera', { email_fiscal: 'fiscal@teste.com.br' }, false));
    await waitFor(() => expect(screen.getByTestId('produtor-desfazer')).toHaveProperty('disabled', true));
  });

  it('T3 sem nome não vai ao banco: vermelho + frase no rodapé, nunca toast', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('produtores-novo'));
    fireEvent.change(screen.getByTestId('produtor-documento'), { target: { value: '111.444.777-35' } });
    fireEvent.click(screen.getByTestId('produtor-salvar'));
    expect(gravarTitular).not.toHaveBeenCalled();
    expect(screen.getByTestId('produtor-rodape').textContent).toBe('Informe o nome do titular.');
    expect(screen.getByTestId('produtor-nome').className).toContain('border-destructive');
    expect(toastErro).not.toHaveBeenCalled();
  });

  it('T4 Inativar pede a prévia com { ativo: false }; a recusa do banco fica no rodapé', async () => {
    respostaTitular = () => ({ ok: false, erro: 'Produtora Sintética tem participação vigente em Faz. Exemplo: encerre a participação antes de inativar.' });
    montar();
    fireEvent.click(await screen.findByTestId('produtor-ativo'));
    await waitFor(() => expect(gravarTitular).toHaveBeenLastCalledWith('cli', 't-vera', { ativo: false }, true));
    await waitFor(() => expect(screen.getByTestId('produtor-rodape').textContent).toBe('Produtora Sintética tem participação vigente em Faz. Exemplo: encerre a participação antes de inativar.'));
    expect(screen.queryByTestId('produtores-previa')).toBeNull();
    expect(toastErro).not.toHaveBeenCalled();
  });

  it('T5 a composição: ✎ abre a fazenda inteira; a prévia manda o 1º dia do mês e todos os titulares', async () => {
    montar();
    await screen.findByTestId('produtor-nome');
    fireEvent.click(screen.getByRole('button', { name: /Fazendas e participação/ }));
    const linha = await screen.findByTestId('produtor-fazenda');
    expect(linha.textContent).toContain('Terceiro Sintético 50%');
    fireEvent.click(within(linha).getByTitle('editar a composição desta fazenda'));
    const dialogo = await screen.findByTestId('produtor-composicao-dialog');
    expect(within(dialogo).getAllByTestId('produtor-composicao-linha')).toHaveLength(2);
    expect(within(dialogo).getByTestId('produtor-composicao-soma').textContent).toBe('soma 100%');
    fireEvent.click(within(dialogo).getByTestId('produtor-composicao-previa'));
    await waitFor(() => expect(gravarComposicao).toHaveBeenCalledTimes(1));
    const [faz, inicio, partes, simular] = gravarComposicao.mock.calls[0];
    expect([faz, inicio, simular]).toEqual(['f1', '2020-01-01', true]);
    expect(partes).toEqual([
      { titular_id: 't-vera', participacao: 50, condicao: 'condomino', registra: 'so_a_parte' },
      { titular_id: 't-hig', participacao: 50, condicao: 'condomino', registra: 'total' },
    ]);
  });

  it('T6 "nada muda" na prévia apaga o Gravar', async () => {
    respostaTitular = () => ({ ok: true, dados: { frase: 'Produtora Sintética: nada muda.', diferencas: [] } });
    montar();
    fireEvent.change(await screen.findByDisplayValue('fiscal@teste.com.br'), { target: { value: 'x@teste.com.br' } });
    fireEvent.click(screen.getByTestId('produtor-salvar'));
    const gravar = await screen.findByTestId('produtores-previa-gravar');
    expect(gravar).toHaveProperty('disabled', true);
    expect(gravar.getAttribute('title')).toBe('nada muda: não há o que gravar');
  });
});
