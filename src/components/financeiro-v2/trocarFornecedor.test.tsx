/**
 * FORN-TROCAR-LOTE-01 — o "Trocar fornecedor" da lista de Lancamentos (o modal) e a barra da selecao (pela fonte da pagina).
 * O banco e' falso: a simulacao devolve o resumo; o que se prova e' o que a tela mostra e o que ela manda gravar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => banco.rpc(...a), from: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { TrocarFornecedorDialog } from './TrocarFornecedorDialog';
import { lerResumoDaTroca } from '@/lib/financeiro/trocarFornecedor';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';

const RESUMO = {
  ok: true, simulado: true, lancamentos: 176, soma: 11313.24, operacao_id: null, ja_no_destino: 0, cancelados: 0, ligados_a_oc: 0,
  origens: [{ id: 'rs', nome: 'Agro Industria Sintetica', lancamentos: 170, soma: 11000 }, { id: null, nome: 'Sem fornecedor', lancamentos: 6, soma: 313.24 }],
  meses_fechados: [{ fazenda: 'Faz. Exemplo', ano_mes: '2024-03' }], meses_fechados_lancamentos: 4, conciliados: 12,
};
const IDS = ['l1', 'l2', 'l3'];

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  banco.rpc.mockReset();
  banco.rpc.mockImplementation(async (_fn: string, a: { p_fornecedor: string | null; p_simular: boolean }) => ({
    data: a.p_simular ? { ...RESUMO, sem_destino: a.p_fornecedor === null } : { ...RESUMO, simulado: false, operacao_id: 'op-1' }, error: null }));
  definirFornecedoresDoLeitor([{ id: 'iagro', nome: 'Iagro Sintetica', cpf_cnpj: '11.222.333/0001-81' }, { id: 'rs', nome: 'Agro Industria Sintetica' }]);
});

describe('TrocarFornecedorDialog', () => {
  it('abre com o resumo SEM destino (N · R$ · de onde saem) e os avisos; o botao so\' acende com destino e motivo', async () => {
    render(<TrocarFornecedorDialog clienteId="cli" ids={IDS} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('trocar-resumo').textContent).toContain('176 lançamentos'));
    expect(screen.getByTestId('trocar-resumo').textContent).toContain('R$ 11.313,24');
    expect(screen.getAllByTestId('trocar-origem').map((o) => o.firstElementChild?.textContent)).toEqual(['Agro Industria Sintetica', 'Sem fornecedor']);
    expect(banco.rpc.mock.calls[0][1]).toMatchObject({ p_cliente: 'cli', p_ids: IDS, p_fornecedor: null, p_simular: true });
    expect(screen.getByTestId('trocar-avisos').textContent).toContain('12 conciliados');
    expect(screen.getByTestId('trocar-avisos').textContent).toContain('4 em mês fechado: Faz. Exemplo 03/2024');
    expect(screen.getByTestId('trocar-confirmar')).toBeDisabled();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Iagro Sintetica'));
    await waitFor(() => expect(banco.rpc.mock.calls.some((c) => c[1].p_fornecedor === 'iagro' && c[1].p_simular)).toBe(true));
    await waitFor(() => expect(screen.getByTestId('trocar-confirmar').textContent).toBe('Trocar 176 lançamentos'));
    expect(screen.getByTestId('trocar-confirmar')).toBeDisabled();   // falta o motivo
    fireEvent.change(screen.getByTestId('trocar-motivo'), { target: { value: 'GTA e\' Iagro (planilha original)' } });
    expect(screen.getByTestId('trocar-confirmar')).toBeEnabled();
  });
  it('Trocar: manda os ids, o destino e o motivo (simular=false); avisa e fecha', async () => {
    const onClose = vi.fn(); const onTrocado = vi.fn();
    render(<TrocarFornecedorDialog clienteId="cli" ids={IDS} onClose={onClose} onTrocado={onTrocado} />);
    await screen.findByText('176 lançamentos');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Iagro Sintetica'));
    fireEvent.change(screen.getByTestId('trocar-motivo'), { target: { value: 'legado' } });
    await waitFor(() => expect(screen.getByTestId('trocar-confirmar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('trocar-confirmar'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(banco.rpc.mock.calls.find((c) => c[1].p_simular === false)?.[1]).toEqual({ p_cliente: 'cli', p_ids: IDS, p_fornecedor: 'iagro', p_motivo: 'legado', p_simular: false });
    expect(onTrocado).toHaveBeenCalled();
  });
  it('a recusa do banco (destino inativo) aparece e o botao fica apagado', async () => {
    banco.rpc.mockImplementation(async (_fn: string, a: { p_fornecedor: string | null }) => ({
      data: a.p_fornecedor ? { ok: false, simulado: true, recusa: { motivo: 'destino_inativo', frase: '"Iagro Sintetica" está fora de uso.' } } : RESUMO, error: null }));
    render(<TrocarFornecedorDialog clienteId="cli" ids={IDS} onClose={() => {}} />);
    await screen.findByText('176 lançamentos');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Iagro Sintetica'));
    fireEvent.change(screen.getByTestId('trocar-motivo'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByTestId('trocar-avisos').textContent).toContain('está fora de uso'));
    expect(screen.getByTestId('trocar-confirmar')).toBeDisabled();
  });
  it('lerResumoDaTroca: le^ o formato do banco e descarta o resto', () => {
    expect(lerResumoDaTroca(null)).toBeNull();
    expect(lerResumoDaTroca(RESUMO)).toMatchObject({ lancamentos: 176, soma: 11313.24, conciliados: 12, mesesFechados: [{ fazenda: 'Faz. Exemplo', anoMes: '2024-03' }] });
  });
});

describe('a barra da selecao na lista (pela fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
  it('"…" -> "Trocar fornecedor…"; "Marcar todos os N do filtro" pela MESMA RPC da grade, ate\' 20.000', () => {
    expect(tela).toContain('data-testid="lote-trocar-fornecedor">Trocar fornecedor…</DropdownMenuItem>');
    expect(tela).toContain("p_cliente: cli, p_filtros: filtrosV2, p_ordem: { ...ordemV2, so_linhas: true }, p_pagina: pagina, p_por_pagina: por });");
    expect(tela).toContain('const todas = await lerListaInteira(pedir, { teto: 20000 });');
    expect(tela).toContain('`Marcar todos os ${totalLancamentosFiltrados.toLocaleString(\'pt-BR\')} do filtro`');
  });
  it('com "todos do filtro", Excluir e Marcar realizado ficam apagados (sao da pagina); trocar o recorte desmarca', () => {
    expect(tela).toContain("disabled={realizarInfo.elegiveis.length === 0 || todosDoFiltro}");
    expect(tela).toMatch(/variant="destructive" className="h-6 text-\[10px\] gap-1 px-2" disabled=\{todosDoFiltro\}/);
    expect(tela).toContain('useEffect(() => { if (todosDoFiltroRef.current) { setSelectedIds(new Set()); setTodosDoFiltro(false); } }, [chaveDoRecorte, paginaV2]);');
  });
});
