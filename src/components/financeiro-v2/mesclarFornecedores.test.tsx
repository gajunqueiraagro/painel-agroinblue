/**
 * FORN-MESCLAR-01 — o leitor da mesclagem (peça torta = nulo) e o diálogo montado com o banco simulado: a sugestão preenche
 * "fica" e "absorver", a prévia mostra o que o banco devolve por módulo, gravar pede confirmação, a recusa fica ESCRITA, e
 * desfazer pede motivo. Nenhuma conta na tela (lido da fonte).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lerGruposRepetidos, lerMesclagens, lerPreviaDaMesclagem } from '@/lib/fornecedores/mesclarFornecedores';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
const banco = vi.hoisted(() => ({ chamadas: [] as Array<[string, Record<string, unknown>]>, recusar: false }));
vi.mock('@/integrations/supabase/client', () => {
  const previa = (simulado: boolean) => ({ simulado, recusa: null, mesclagem_id: simulado ? null : 'log-1', total: 21,
    mantido: { id: 'm', nome: 'Banco Fica S.A. (001)', cpf_cnpj: null, ativo: true },
    absorvidos: [{ id: 'a1', nome: 'Banco Fica', cpf_cnpj: null, ativo: false }, { id: 'a2', nome: 'BANCO FICA', cpf_cnpj: null, ativo: false }],
    por_modulo: { Financiamentos: 16, Financeiro: 5 }, apelidos: ['Banco Fica'] });
  const lista = (dados: unknown) => { const p: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'order', 'limit']) p[k] = () => p; p.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(ok); return p; };
  return { supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      banco.chamadas.push([fn, args]);
      if (fn === 'fn_fornecedor_repetidos') return Promise.resolve({ data: [{ motivo: 'nome', chave: 'banco fica', fornecedores: [
        { id: 'm', nome: 'Banco Fica S.A. (001)', cpf_cnpj: null, ativo: true }, { id: 'a1', nome: 'Banco Fica', cpf_cnpj: null, ativo: false },
        { id: 'a2', nome: 'BANCO FICA', cpf_cnpj: null, ativo: false }] }], error: null });
      if (fn === 'fn_fornecedor_mesclar') {
        if (banco.recusar) return Promise.resolve({ data: { simulado: true, recusa: { motivo: 'cnpj_diferente', frase: 'CPF/CNPJ diferentes: X e Y. Fornecedores com documentos diferentes não se mesclam.' } }, error: null });
        return Promise.resolve({ data: previa(args.p_simular === true), error: null });
      }
      if (fn === 'fn_fornecedor_mesclagem_desfazer') return Promise.resolve({ data: { voltaram: 21, ficaram: 0 }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => lista([{ id: 'log-9', mantido_id: 'm', absorvidos: ['a1'], criado_em: '2026-10-17T12:00:00Z', resumo: { total: 3 },
      antes: { absorvidos: [{ nome: 'Banco Fica' }] }, desfeito_em: null, desfeito_motivo: null }]),
  } };
});
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { MesclarFornecedoresDialog } from './MesclarFornecedoresDialog';

beforeEach(() => { banco.chamadas.length = 0; banco.recusar = false; definirFornecedoresDoLeitor([{ id: 'm', nome: 'Banco Fica S.A. (001)', ativo: true }]); });

describe('o leitor', () => {
  it('peça torta = nulo; a recusa vem como recusa; módulos na ordem da casa', () => {
    expect(lerPreviaDaMesclagem({ simulado: true, recusa: { motivo: 'x' } })).toBeNull();
    expect(lerPreviaDaMesclagem({ simulado: true, recusa: { motivo: 'cnpj_diferente', frase: 'F' } })?.recusa?.frase).toBe('F');
    const p = lerPreviaDaMesclagem({ simulado: true, recusa: null, total: 2, mantido: { id: 'm', nome: 'M' }, absorvidos: [{ id: 'a', nome: 'A' }],
      por_modulo: { Rebanho: 1, Financeiro: 1 }, apelidos: ['A'] });
    expect(p?.porModulo.map((x) => x.modulo)).toEqual(['Financeiro', 'Rebanho']);
    expect(lerGruposRepetidos([{ motivo: 'outro', chave: 'x', fornecedores: [] }])).toBeNull();
    expect(lerMesclagens([{ id: 'l', mantido_id: 'm', absorvidos: ['a'], criado_em: 't', resumo: { total: 3 } }])?.[0].total).toBe(3);
  });
});

describe('o diálogo', () => {
  it('a sugestão preenche; a prévia é a do banco; Mesclar pede confirmação e grava com p_simular false', async () => {
    render(<MesclarFornecedoresDialog aberto aoFechar={vi.fn()} clienteId="cli" />);
    fireEvent.click(await screen.findByTestId('sugestao-de-repetido'));
    await waitFor(() => expect(screen.getByTestId('previa-total').textContent).toBe('21'), { timeout: 2000 });
    expect(screen.getByTestId('previa-Financiamentos').textContent).toBe('16');
    expect(banco.chamadas.find(([f, a]) => f === 'fn_fornecedor_mesclar' && a.p_simular === true)?.[1]).toMatchObject({ p_manter: 'm', p_absorver: ['a1', 'a2'] });
    fireEvent.click(screen.getByTestId('mesclar'));
    expect(banco.chamadas.some(([f, a]) => f === 'fn_fornecedor_mesclar' && a.p_simular === false)).toBe(false);
    fireEvent.click(screen.getByTestId('confirmar-mesclagem'));
    await waitFor(() => expect(screen.getByTestId('recado-da-mesclagem').textContent).toContain('2 cadastros absorvidos · 21 referências movidas'));
  });
  it('a recusa do banco fica escrita e o Mesclar apagado', async () => {
    banco.recusar = true;
    render(<MesclarFornecedoresDialog aberto aoFechar={vi.fn()} clienteId="cli" />);
    fireEvent.click(await screen.findByTestId('sugestao-de-repetido'));
    await waitFor(() => expect(screen.getByTestId('recado-da-mesclagem').textContent).toContain('CPF/CNPJ diferentes'), { timeout: 2000 });
    expect(screen.getByTestId('mesclar')).toBeDisabled();
  });
  it('desfazer pede motivo e grava com ele', async () => {
    render(<MesclarFornecedoresDialog aberto aoFechar={vi.fn()} clienteId="cli" />);
    fireEvent.click(screen.getByText(/Mesclagens recentes/));
    fireEvent.click(await screen.findByTestId('desfazer-mesclagem'));
    fireEvent.click(screen.getByTestId('confirmar-desfazer'));
    expect(screen.getByTestId('recado-da-mesclagem').textContent).toBe('Informe o motivo para desfazer.');
    fireEvent.change(screen.getByTestId('motivo-desfazer'), { target: { value: 'errado' } });
    fireEvent.click(screen.getByTestId('confirmar-desfazer'));
    await waitFor(() => expect(banco.chamadas.find(([f]) => f === 'fn_fornecedor_mesclagem_desfazer')?.[1]).toMatchObject({ p_mesclagem_id: 'log-9', p_motivo: 'errado', p_simular: false }));
  });
  it('fonte: tamanho fixo, nenhuma soma, as três RPCs', () => {
    const f = readFileSync(resolve(__dirname, 'MesclarFornecedoresDialog.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(f).toMatch(/h-\[min\(520px,calc\(100vh-16px\)\)\] w-\[min\(900px,calc\(100vw-16px\)\)\]/);
    expect(f).not.toMatch(/\.reduce\(|\+=/);
    for (const rpc of ['fn_fornecedor_mesclar', 'fn_fornecedor_mesclagem_desfazer', 'fn_fornecedor_repetidos']) expect(f).toContain(`'${rpc}'`);
  });
});
