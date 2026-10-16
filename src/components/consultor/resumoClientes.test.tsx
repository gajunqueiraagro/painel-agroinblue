/**
 * RESUMO-CLIENTES-01 passo a — pendências do consultor: as regras puras, a tabela (Cobrei / Resolvida), "+ nova", o ⚑ do cliente,
 * a entrada virtual do seletor (só admin) e a ligação no shell (nenhuma tela de cliente montada no painel), lida da fonte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }: { value?: string; onValueChange: (v: string) => void; disabled?: boolean; children: ReactNode }) => (
    <select data-testid="select" value={value ?? ''} disabled={disabled} onChange={e => onValueChange(e.target.value)}><option value="">—</option>{children}</select>
  ),
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock('@/components/ui/date-picker', () => ({ DatePicker: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const ctx = { isAdmin: true, resumoClientes: false, setResumoClientes: vi.fn(), setClienteAtual: vi.fn(),
  clienteAtual: { id: 'c1', nome: 'NJ' }, clientes: [{ id: 'c1', nome: 'NJ' }, { id: 'c2', nome: 'Vera' }] };
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ctx }));

import {
  emAberto, faltaNaNova, lerPendencia, ordenarPendencias, rodapePendencias, vencida, type Pendencia,
} from '@/lib/consultor/pendencias';
import type { FontePendencias } from '@/hooks/usePendenciasConsultor';
import { PendenciasTabela } from './PendenciasTabela';
import { NovaPendenciaDialog } from './NovaPendenciaDialog';
import { AvisoPendenciasCliente } from './AvisoPendenciasCliente';
import { ClienteSelector, RESUMO_DOS_CLIENTES } from '@/components/ClienteSelector';

const P = (over: Partial<Pendencia> = {}): Pendencia => ({
  id: 'p1', clienteId: 'c1', prazo: '2026-10-10', cobrarDe: 'Amanda', oQue: 'Acertos dos abates', origemTipo: null, origemRef: null,
  status: 'aberta', ultimaCobrancaEm: null, ultimaCobrancaCanal: null, resolvidaEm: null, ...over,
});
const HOJE = '2026-10-16';

describe('regras', () => {
  it('em aberto, vencida e a ordem de trabalho', () => {
    expect(emAberto(P({ status: 'cobrada' }))).toBe(true);
    expect(emAberto(P({ status: 'resolvida', resolvidaEm: '2026-10-12T10:00:00Z' }))).toBe(false);
    expect(vencida(P(), HOJE)).toBe(true);
    expect(vencida(P({ prazo: '2026-10-17' }), HOJE)).toBe(false);
    expect(vencida(P({ prazo: null }), HOJE)).toBe(false);
    const ord = ordenarPendencias([P({ id: 'r', status: 'resolvida', resolvidaEm: 'x', prazo: '2026-01-01' }), P({ id: 's', prazo: null }), P({ id: 'b', prazo: '2026-10-11' }), P({ id: 'a', prazo: '2026-10-09' })]);
    expect(ord.map(p => p.id)).toEqual(['a', 'b', 's', 'r']);
  });

  it('rodapé: abertas, vencidas, cobradas na semana (segunda a hoje), resolvidas no mês', () => {
    const r = rodapePendencias([
      P({ id: '1' }), P({ id: '2', status: 'cobrada', ultimaCobrancaEm: '2026-10-12', ultimaCobrancaCanal: 'email', prazo: '2026-10-20' }),
      P({ id: '3', status: 'cobrada', ultimaCobrancaEm: '2026-10-11', ultimaCobrancaCanal: 'whatsapp' }),
      P({ id: '4', status: 'resolvida', resolvidaEm: '2026-10-05T15:00:00Z' }), P({ id: '5', status: 'resolvida', resolvidaEm: '2026-09-30T15:00:00Z' }),
    ], HOJE);
    expect(r).toEqual({ abertas: 3, vencidas: 2, cobradasNaSemana: 1, resolvidasNoMes: 1 });
  });

  it('leitor sem cast: torto = nulo; o que falta na nova', () => {
    expect(lerPendencia({ id: 'x' })).toBeNull();
    expect(lerPendencia({ id: 'x', cliente_id: 'c', cobrar_de: 'A', o_que: 'B', status: 'outro' })).toBeNull();
    expect(lerPendencia({ id: 'x', cliente_id: 'c', cobrar_de: 'A', o_que: 'B', status: 'cobrada', ultima_cobranca_canal: 'fax' })?.ultimaCobrancaCanal).toBeNull();
    expect(faltaNaNova({ clienteId: '', prazo: null, cobrarDe: 'A', oQue: 'B', origemTipo: null, origemRef: null })).toBe('Escolha o cliente.');
    expect(faltaNaNova({ clienteId: 'c', prazo: null, cobrarDe: '  ', oQue: 'B', origemTipo: null, origemRef: null })).toBe('Diga de quem cobrar.');
    expect(faltaNaNova({ clienteId: 'c', prazo: null, cobrarDe: 'A', oQue: 'B', origemTipo: null, origemRef: null })).toBeNull();
  });
});

describe('a tabela', () => {
  it('Cobrei abre os canais e grava o escolhido; Resolvida grava na hora; resolvida não tem ação', async () => {
    const onCobrar = vi.fn(async () => null); const onResolver = vi.fn(async () => null);
    render(<PendenciasTabela lista={[P(), P({ id: 'p2', status: 'resolvida', resolvidaEm: 'x' })]} onCobrar={onCobrar} onResolver={onResolver} />);
    expect(screen.getAllByTestId('cobrei')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('cobrei'));
    fireEvent.click(screen.getByTestId('cobrei-whatsapp'));
    await waitFor(() => expect(onCobrar).toHaveBeenCalledWith('p1', 'whatsapp'));
    fireEvent.click(screen.getByTestId('resolvida'));
    await waitFor(() => expect(onResolver).toHaveBeenCalledWith('p1'));
    expect(screen.getByTestId('pendencias-rodape').textContent).toContain('1 aberta');
  });

  it('a recusa do banco fica escrita sobre o rodapé', async () => {
    render(<PendenciasTabela lista={[P()]} onCobrar={async () => null} onResolver={async () => 'permission denied'} />);
    fireEvent.click(screen.getByTestId('resolvida'));
    await waitFor(() => expect(screen.getByTestId('pendencias-recado').textContent).toBe('permission denied'));
  });
});

describe('+ nova', () => {
  it('sem cobrar de não grava e diz por quê; com tudo, grava e fecha', async () => {
    const criar = vi.fn(async () => null); const onOpenChange = vi.fn();
    render(<NovaPendenciaDialog open onOpenChange={onOpenChange} clientes={[{ id: 'c1', nome: 'NJ' }]} clienteFixo="c1" criar={criar} />);
    fireEvent.change(screen.getByTestId('nova-o-que'), { target: { value: 'Nota do frete' } });
    fireEvent.click(screen.getByTestId('nova-gravar'));
    expect(screen.getByTestId('nova-recado').textContent).toBe('Diga de quem cobrar.');
    expect(criar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('nova-cobrar-de'), { target: { value: 'Amanda' } });
    fireEvent.click(screen.getByTestId('nova-gravar'));
    await waitFor(() => expect(criar).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'c1', cobrarDe: 'Amanda', oQue: 'Nota do frete' })));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

const fonte = (lista: Pendencia[]): FontePendencias => ({
  listar: vi.fn(async () => ({ ok: true as const, lista })), criar: vi.fn(async () => null), cobrar: vi.fn(async () => null), resolver: vi.fn(async () => null),
});

describe('o ⚑ dentro do cliente', () => {
  it('âmbar com o número das em aberto; abre o modal com a lista; "Ver no Resumo" chama o painel', async () => {
    const onVer = vi.fn();
    const f = fonte([P(), P({ id: 'p2', status: 'cobrada', ultimaCobrancaEm: '2026-10-12', ultimaCobrancaCanal: 'email' }), P({ id: 'p3', status: 'resolvida', resolvidaEm: 'x' })]);
    render(<AvisoPendenciasCliente cliente={{ id: 'c1', nome: 'NJ' }} onVerNoResumo={onVer} fonte={f} />);
    await waitFor(() => expect(screen.getByTestId('aviso-pendencias-botao').textContent).toBe('⚑ 2'));
    expect(screen.getByTestId('aviso-pendencias-botao').className).toContain('bg-[#fef3c7]');
    expect(f.listar).toHaveBeenCalledWith('c1');
    fireEvent.click(screen.getByTestId('aviso-pendencias-botao'));
    expect(screen.getAllByTestId('pendencia-linha')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('ver-no-resumo'));
    expect(onVer).toHaveBeenCalled();
  });

  it('sem pendência: cinza "⚑ 0"; o lugar tem largura fixa', async () => {
    render(<AvisoPendenciasCliente cliente={{ id: 'c1', nome: 'NJ' }} onVerNoResumo={vi.fn()} fonte={fonte([])} />);
    await waitFor(() => expect(screen.getByTestId('aviso-pendencias-botao').textContent).toBe('⚑ 0'));
    expect(screen.getByTestId('aviso-pendencias-botao').className).not.toContain('bg-[#fef3c7]');
    expect(screen.getByTestId('aviso-pendencias').getAttribute('style')).toContain('width: 40px');
  });
});

describe('a entrada virtual do seletor', () => {
  beforeEach(() => { ctx.isAdmin = true; ctx.setResumoClientes.mockReset(); });
  it('admin vê "Resumo dos clientes"; escolher liga o painel e não troca de cliente', () => {
    render(<ClienteSelector />);
    const sel = screen.getByTestId('select') as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.value)).toContain(RESUMO_DOS_CLIENTES);
    fireEvent.change(sel, { target: { value: RESUMO_DOS_CLIENTES } });
    expect(ctx.setResumoClientes).toHaveBeenCalledWith(true);
    expect(ctx.setClienteAtual).not.toHaveBeenCalled();
  });
  it('quem não é admin não vê a entrada', () => {
    ctx.isAdmin = false;
    render(<ClienteSelector />);
    expect(Array.from((screen.getByTestId('select') as HTMLSelectElement).options).map(o => o.value)).not.toContain(RESUMO_DOS_CLIENTES);
  });
});

describe('a ligação no shell', () => {
  const v2 = readFileSync('src/v2/V2Index.tsx', 'utf8');
  const cc = readFileSync('src/contexts/ClienteContext.tsx', 'utf8');
  it('no painel nenhuma tela de cliente é montada; o ⚑ só para admin; trocar de cliente desliga o modo', () => {
    expect(v2).toContain('const modoResumo = isAdmin && resumoClientes;');
    expect(v2).toContain('{modoResumo ? <ResumoClientesPainel /> : semAcesso ? (');
    expect(v2).toContain('const avisoDoConsultor = isAdmin ? (modoResumo');
    expect(cc).toMatch(/const setClienteAtual = \(c: Cliente\) => \{[\s\S]{0,120}setResumoLigado\(false\);/);
    expect(cc).toContain('resumoClientes: isAdmin && resumoLigado');
    expect(cc).not.toMatch(/localStorage\.setItem\([^)]*resumo/i);
  });
});
