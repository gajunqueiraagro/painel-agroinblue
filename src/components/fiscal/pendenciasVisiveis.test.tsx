/**
 * PROD-PENDENCIAS-VISIVEIS-01 (Gabriel 14/11 17:11) — o "cadastro incompleto" diz O QUE falta e ONDE. API injetada: nada fala com o banco.
 *   V1 o mapa conhece EXATAMENTE os textos do banco (`_fn_fiscal_titular_pendencias`, lido da migration): texto novo no banco derruba aqui
 *   V2 texto desconhecido aparece na lista, sem atalho (nunca some); a contagem por aba e a frase por campo saem da mesma lista
 *   V3 o selo vira botão: abre a lista (uma por linha); clicar leva à aba certa e a frase do banco aparece sob o campo
 *   V4 cada aba com pendência mostra "● N"; sem pendência, o lugar fica vazio (V4b: abaixo de 1200px o nº só no title)
 *   V5 na LISTA da esquerda o CPF vai mascarado (texto e title); inteiro só no campo da ficha
 *   V6 PROD-FICHA-CADASTRO-01: "Emitir ficha de cadastro" — os pendentes contados pela pendência do banco; "Deste produtor" salva o PDF
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => import('../../../scripts/ui-cortes/mocks/supabase'));
vi.mock('@/contexts/ClienteContext', () => import('../../../scripts/ui-cortes/mocks/cliente'));
vi.mock('@/contexts/AuthContext', () => import('../../../scripts/ui-cortes/mocks/auth'));
vi.mock('@/contexts/FazendaContext', () => import('../../../scripts/ui-cortes/mocks/fazenda'));
vi.mock('@/lib/pdf/pdfChassi', async (orig) => ({ ...(await orig<typeof import('@/lib/pdf/pdfChassi')>()), carregarLogoBase64: () => Promise.reject(new Error('sem imagem no teste')) }));
const baixar = vi.fn((..._a: unknown[]): string[] => []);
vi.mock('@/lib/fiscal/fichaDeCadastro', async (orig) => ({ ...(await orig<typeof import('@/lib/fiscal/fichaDeCadastro')>()), baixarFichas: (...a: unknown[]) => baixar(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { ProdutoresTela } from './ProdutoresTela';
import { ProdutoresApiProvider } from '@/hooks/useProdutores';
import { titularDaLinha, type Titular } from '@/lib/fiscal/produtores';
import type { ProdutoresApi, Resultado } from '@/lib/fiscal/produtoresApi';
import { ONDE_RESOLVER, frasesPorCampo, pendenciasDaFicha, pendenciasPorAba } from '@/lib/fiscal/pendenciasDoProdutor';

const PENDENTE = titularDaLinha({
  id: 't-p', nome: 'Produtora Sintética', documento: '52998224725', documento_formatado: '529.982.247-25', tipo: 'PF', papel: 'produtor',
  email_fiscal: null, uf: 'MS', regime_ir: null, ativo: true, ies: [{ uf: 'MS', ie: '281234567', fazenda_id: 'f1' }],
  fazendas: [], condicao_ibs: { condicao: 'contribuinte_pelo_limite', desde: '2026-01-01', motivo: 'acima do limite' }, grupo: [], contas: [], acordos: 0,
  pendencias: ['Sem e-mail fiscal', 'Sem regime do IR', 'Sem fazenda'],
});
const COMPLETO = titularDaLinha({
  id: 't-c', nome: 'Empresa Sintética', documento: '11222333000181', documento_formatado: '11.222.333/0001-81', tipo: 'PJ', papel: 'produtor',
  email_fiscal: 'a@b.com.br', ativo: true, ies: [], fazendas: [], grupo: [], contas: [], acordos: 0, pendencias: [],
});

function api(titulares: Titular[]): ProdutoresApi {
  const ok = <T,>(dados: T): Promise<Resultado<T>> => Promise.resolve({ ok: true, dados });
  return {
    lista: () => ok([...titulares]), acordos: () => ok([]), historicoDaCondicao: () => ok([]), imoveis: () => ok([]), contas: () => ok([]),
    gravarTitular: () => ok({}), gravarComposicao: () => ok({ frase: '', antes: [], depois: [], avisos: [] }),
    gravarCondicao: () => ok({}), gravarGrupo: () => ok({}), gravarContaTitular: () => ok({}), gravarAcordo: () => ok({}),
  };
}
function montar(titulares: Titular[] = [PENDENTE, COMPLETO], largura = 1440) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: largura });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ProdutoresApiProvider api={api(titulares)}><ProdutoresTela /></ProdutoresApiProvider></QueryClientProvider>);
}

describe('PROD-PENDENCIAS-VISIVEIS-01', () => {
  it('V1 o mapa conhece exatamente os textos da função do banco', () => {
    const sql = readFileSync('supabase/migrations/20261028117290_cadastro_produtor_01.sql', 'utf8');
    const i = sql.indexOf('function public._fn_fiscal_titular_pendencias');
    expect(i).toBeGreaterThan(0);
    const corpo = sql.slice(i, sql.indexOf('$$;', i));
    const textos = [...corpo.matchAll(/then '([^']+)' end/g)].map(m => m[1]);
    expect(textos.length).toBe(7);
    expect([...textos].sort()).toEqual(Object.keys(ONDE_RESOLVER).sort());
  });

  it('V2 desconhecido fica na lista sem atalho; contagem por aba e frase por campo', () => {
    const l = pendenciasDaFicha(['Sem fazenda', 'Texto novo do banco', 'Sem e-mail fiscal']);
    expect(l.map(p => [p.texto, p.aba])).toEqual([['Sem fazenda', 'fazendas'], ['Texto novo do banco', null], ['Sem e-mail fiscal', 'identificacao']]);
    expect(pendenciasPorAba(['Sem e-mail fiscal', 'Sem data de nascimento', 'Sem regime do IR'])).toEqual({ identificacao: 2, fiscal: 1 });
    expect(frasesPorCampo(['Endereço fiscal incompleto'])).toEqual({ endereco: 'Endereço fiscal incompleto' });
  });

  it('V3 o selo abre a lista e o atalho leva à aba com a frase sob o campo', async () => {
    montar();
    const botao = await screen.findByTestId('produtor-pendencias-botao');
    expect(botao.textContent).toContain('3');
    fireEvent.click(botao);
    const lista = await screen.findByTestId('produtor-pendencias-lista');
    const itens = within(lista).getAllByTestId('produtor-pendencia');
    expect(itens.map(i => i.textContent)).toEqual(['Sem e-mail fiscalIdentificação', 'Sem regime do IRFiscal', 'Sem fazendaFazendas']);
    expect(screen.getByTestId('produtor-frase-email').textContent).toBe('Sem e-mail fiscal');
    fireEvent.click(itens[1]);
    await waitFor(() => expect(screen.getByTestId('produtor-aba-fiscal-miolo')).toBeTruthy());
    expect(screen.getByTestId('produtor-frase-regime').textContent).toBe('Sem regime do IR');
    expect(screen.getByTestId('produtor-frase-condicao').textContent).toBe('');
  });

  it('V4 o ponto âmbar com o número por aba', async () => {
    montar();
    await screen.findByTestId('produtor-pendencias-botao');
    expect(screen.getByTestId('produtor-guia-identificacao').textContent).toContain('● 1');
    expect(screen.getByTestId('produtor-guia-fiscal').textContent).toContain('● 1');
    expect(screen.getByTestId('produtor-guia-fazendas').textContent).toContain('● 1');
    expect(screen.getByTestId('produtor-guia-contas').textContent).not.toContain('●');
  });

  it('V4b abaixo de 1200px o número da aba vai só no title (as seis abas cabem a 750px)', async () => {
    montar([PENDENTE, COMPLETO], 918);
    await screen.findByTestId('produtor-pendencias-botao');
    const guia = screen.getByTestId('produtor-guia-fiscal');
    expect(guia.textContent).not.toContain('●');
    expect(guia.closest('button')?.getAttribute('title')).toBe('Fiscal e Reforma · 1 pendência(s)');
    expect(screen.getByTestId('produtor-guia-contas').closest('button')?.getAttribute('title')).toBe('Contas bancárias');
  });

  it('V5 a lista mostra o CPF mascarado; o CNPJ inteiro', async () => {
    montar();
    const itens = await screen.findAllByTestId('produtores-item');
    const pf = itens[0].closest('td');
    expect(itens[0].textContent).toContain('CPF ***.982.247-**');
    expect(itens[0].textContent).not.toContain('529.982.247-25');
    expect(pf?.getAttribute('title') ?? '').not.toContain('529.982.247-25');
    expect(itens[1].textContent).toContain('CNPJ 11.222.333/0001-81');
  });

  it('V6 emitir a ficha de cadastro', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('produtor-ficha-cadastro'));
    const menu = await screen.findByTestId('produtor-ficha-cadastro-menu');
    expect(within(menu).getByTestId('produtor-ficha-pendentes').textContent).toBe('Todos os pendentes do cliente1');
    fireEvent.click(within(menu).getByTestId('produtor-ficha-este'));
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    const [fichas, arquivo] = baixar.mock.calls[0];
    expect(arquivo).toBe('ficha-de-cadastro-produtora-sintetica.pdf');
    expect(Array.isArray(fichas) ? fichas.length : -1).toBe(1);
  });
});
