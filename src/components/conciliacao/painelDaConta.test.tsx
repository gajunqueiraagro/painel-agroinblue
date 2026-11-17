/**
 * CONC-PAINEL-CONTA-01 (fatia 1; decisão do Gabriel 17/11 09:57) — o painel lateral da conta. Dado SINTÉTICO.
 * Prova: os 4 passos saem do DONO (nada recalculado); a fonte é derivada; a coluna Conta tem a largura do maior nome; o painel LEVA às
 * peças de hoje (Importar banco, o modal Conferência, o SaldoRealDialog); a faixa do topo é a única que escurece.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contaNaTela, fonteDaConta, larguraDaConta, passosDaConta, PISO_DA_CONTA, RESUMO_MINIMO, TETO_DA_CONTA } from '@/lib/conciliacao/painelDaConta';
import type { LinhaResumo, StatusDono } from '@/lib/conciliacao/resumoDoDono';

const NIVEL_CONTA: LinhaResumo['nivel'] = 'conta';
const NAO_CONCILIADO: StatusDono = 'nao_conciliado';

const banco = vi.hoisted(() => { const importacoes: Record<string, unknown>[] = []; return { ligada: false, importacoes }; });
vi.mock('@/integrations/supabase/client', () => {
  const consulta = (dados: () => unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
    q.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: dados(), error: null }).then(ok);
    return q;
  };
  return { supabase: { from: (t: string) => consulta(() => (t === 'openfinance_contas_permitidas' ? (banco.ligada ? [{ id: 'p1' }] : []) : banco.importacoes)) } };
});
import { PainelDaConta } from './PainelDaConta';

const LINHA = (o: { tem: boolean; banco: number; sistema: number; extrato: number | null; dif: number | null }) => ({
  nivel: NIVEL_CONTA, conta_id: 'c1', conta_nome: 'Banco Exemplo', tipo_conta: 'cc', consolida_em_conta_id: null, tem_extrato: o.tem,
  saldo_inicial: 0, saldo_inicial_origem: null, entradas: 0, saidas: 0, entradas_terceiros: 0, entradas_transferencias: 0, saidas_terceiros: 0,
  saidas_transferencias: 0, saldo_sistema: 1000, saldo_extrato: o.extrato, saldo_extrato_data: '2026-11-13', diferenca: o.dif,
  diferenca_entradas: 0, diferenca_saidas: 0, banco: { entradas: 0, saidas: 0 }, extratos_sem_par: { qtde: o.banco, valor: 0 },
  lancamentos_sem_par: { qtde: o.sistema, valor: 0 }, retido_em_depositos: { qtde: 0, valor: 0 }, status: NAO_CONCILIADO,
  motivos: [], avisos: [], posicao: null, sem_conta: null, linhas_sistema: null, internas: [], par_conta_id: null, par_status: null,
  /* a conta lê os números PRÓPRIOS (`saldosDaLinha` → `proprio`) */
  proprio: { saldo_inicial: 0, entradas: 0, saidas: 0, saldo_sistema: 1000, saldo_extrato: o.extrato, diferenca: o.dif,
    entradas_terceiros: 0, entradas_transferencias: 0, saidas_terceiros: 0, saidas_transferencias: 0 },
});

describe('as regras (puras)', () => {
  const saldos = (extrato: number | null, dif: number | null) => ({ saldo_extrato: extrato, saldo_sistema: 1000, diferenca: dif });
  it('os 4 passos pelo DONO: extrato, sem par (banco/sistema), casar com N, saldo confere', () => {
    const p = passosDaConta(LINHA({ tem: true, banco: 3, sistema: 1, extrato: 998.5, dif: -1.5 }), saldos(998.5, -1.5), fonteDaConta(false, null));
    expect(p.map((x) => x.estado)).toEqual(['ok', 'pendente', 'pendente', 'pendente']);
    expect(p[1].frase).toBe('3 só no banco · 1 só no sistema');
    expect(p[2].titulo).toBe('Casar lançamentos (4)');
    expect(p[0].frase).toBe('extrato do mês até 13/11/2026');
  });
  it('tudo em dia = 4 verdes; sem extrato = 2 e 3 esperam', () => {
    expect(passosDaConta(LINHA({ tem: true, banco: 0, sistema: 0, extrato: 1000, dif: 0 }), saldos(1000, 0), fonteDaConta(true, null)).map((x) => x.estado))
      .toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(passosDaConta(LINHA({ tem: false, banco: 0, sistema: 0, extrato: null, dif: null }), saldos(null, null), fonteDaConta(false, null)).map((x) => x.estado))
      .toEqual(['pendente', 'espera', 'espera', 'pendente']);
  });
  it('só o SISTEMA sem par (0 no banco) também deixa o conferir pendente', () => {
    const p = passosDaConta(LINHA({ tem: true, banco: 0, sistema: 2, extrato: 1000, dif: 0 }), saldos(1000, 0), fonteDaConta(false, null));
    expect([p[1].estado, p[2].estado]).toEqual(['pendente', 'pendente']);
  });
  it('a fonte derivada: Open Finance ligada > último arquivo > sem extrato', () => {
    expect(fonteDaConta(true, { tipo_arquivo: 'OFX', saldo_declarado_data: '2026-11-13', data_importacao: null }).rotulo).toBe('Open Finance');
    expect(fonteDaConta(false, { tipo_arquivo: 'ofx', saldo_declarado_data: '2026-11-13', data_importacao: null }).rotulo).toBe('OFX até 13/11/2026');
    expect(fonteDaConta(false, null).tipo).toBe('sem_extrato');
    expect(fonteDaConta(false, { tipo_arquivo: null, saldo_declarado_data: null, data_importacao: null }).rotulo).toBe('Arquivo');
  });
  it('a Conta na tela nunca empurra o Resumo (piso 260) para fora; com espaço, a do nome', () => {
    const regua = 378;
    expect(contaNaTela(219, 1400, regua)).toBe(219);
    const apertado = contaNaTela(219, 840, regua, 15);
    expect(apertado).toBe(840 - 24 - 8 - RESUMO_MINIMO - regua - 2 - 15);
    expect(24 + apertado + regua + 2 + 15 + 8 + RESUMO_MINIMO).toBeLessThanOrEqual(840);
    /* sem barra de rolagem, nada se reserva para ela */
    expect(contaNaTela(219, 840, regua)).toBe(840 - 24 - 8 - RESUMO_MINIMO - regua - 2);
    expect(contaNaTela(219, 500, regua)).toBe(PISO_DA_CONTA);
    expect(contaNaTela(219, null, regua)).toBe(219);
    expect(contaNaTela(219, 0, regua)).toBe(219);
  });
  it('a coluna Conta = o maior nome + a folga, entre o piso e o teto', () => {
    const medir = (t: string) => t.length * 6;
    expect(larguraDaConta(['Total', 'Conta corrente', 'Banco Exemplo'], medir)).toBe(Math.max(PISO_DA_CONTA, 14 * 6 + 26));
    expect(larguraDaConta(['x'.repeat(80)], medir)).toBe(TETO_DA_CONTA);
    expect(larguraDaConta(['Ab'], medir)).toBe(PISO_DA_CONTA);
  });
});

describe('o painel (componente)', () => {
  const montar = (cb: Partial<Record<'aoImportar' | 'aoCasar' | 'aoInformarSaldo', (id: string) => void>> = {}) => render(
    <PainelDaConta aberto aoFechar={() => {}} clienteId="cli" conta={{ id: 'c1', nome: 'Banco Exemplo' }} anoMes="2026-11"
      linha={LINHA({ tem: true, banco: 3, sistema: 1, extrato: 998.5, dif: -1.5 })}
      aoImportar={cb.aoImportar ?? vi.fn()} aoCasar={cb.aoCasar ?? vi.fn()} aoInformarSaldo={cb.aoInformarSaldo ?? vi.fn()} />);
  it('os passos com os números do dono e os botões que LEVAM às peças de hoje', async () => {
    const aoImportar = vi.fn(); const aoCasar = vi.fn(); const aoInformarSaldo = vi.fn();
    montar({ aoImportar, aoCasar, aoInformarSaldo });
    expect((await screen.findByTestId('painel-passo-2')).textContent).toContain('3 só no banco · 1 só no sistema');
    expect(screen.getByTestId('painel-saldo-Diferença').textContent).toBe('-1,50');
    fireEvent.click(screen.getByTestId('painel-casar'));
    expect(aoCasar).toHaveBeenCalledWith('c1');
    fireEvent.click(screen.getByTestId('painel-informar-saldo'));
    expect(aoInformarSaldo).toHaveBeenCalledWith('c1');
    fireEvent.click(screen.getByTestId('painel-importar'));
    expect(aoImportar).toHaveBeenCalledWith('c1');
  });
  it('nada sem par: o passo 3 fica verde e SEM o botão de casar', async () => {
    render(<PainelDaConta aberto aoFechar={() => {}} clienteId="cli" conta={{ id: 'c1', nome: 'Banco Exemplo' }} anoMes="2026-11"
      linha={LINHA({ tem: true, banco: 0, sistema: 0, extrato: 1000, dif: 0 })} aoImportar={vi.fn()} aoCasar={vi.fn()} aoInformarSaldo={vi.fn()} />);
    expect((await screen.findByTestId('painel-passo-3')).getAttribute('data-estado')).toBe('ok');
    expect(screen.queryByTestId('painel-casar')).toBeNull();
  });
  it('conta ligada ao Open Finance: o botão diz "Buscar do banco" e o cabeçalho diz a fonte', async () => {
    banco.ligada = true;
    montar();
    await waitFor(() => expect(screen.getByTestId('painel-importar').textContent).toBe('Buscar do banco'));
    expect(screen.getByTestId('painel-fonte').textContent).toContain('Open Finance');
    banco.ligada = false;
  });
  it('a aba Importações lista os arquivos vivos (a cancelada fica de fora) e o desfazer é o caminho de hoje', async () => {
    banco.importacoes = [
      { id: 'i1', nome_arquivo: 'extrato-nov.ofx', tipo_arquivo: 'OFX', data_importacao: '2026-11-14T10:00:00Z', total_validas: 31, saldo_declarado_data: '2026-11-13' },
      { id: 'i2', nome_arquivo: 'cancelado.ofx', tipo_arquivo: 'OFX', data_importacao: '2026-11-10T10:00:00Z', total_validas: 9, saldo_declarado_data: null, cancelado_em: '2026-11-11' },
    ];
    montar();
    fireEvent.click(screen.getByTestId('painel-aba-importacoes'));
    await waitFor(() => expect(screen.getAllByTestId('painel-importacao').length).toBe(1));
    expect(screen.getByTestId('painel-importacao').textContent).toContain('extrato-nov.ofx');
    expect(screen.getByTestId('painel-ver-importacoes').textContent).toContain('Importar banco');
    banco.importacoes = [];
  });
});

describe('a ligação na Conciliação (fonte)', () => {
  const F = readFileSync(resolve(process.cwd(), 'src/pages/ConciliacaoBancariaTab.tsx'), 'utf8');
  it('o ✎ da conta abre o painel (não mais o SaldoRealDialog direto)', () => {
    expect(F).toContain('onEdit={()=>setPainelContaId(s.conta.id)}');
  });
  it('"Casar lançamentos" abre o MODAL Conferência existente (aba Casar + sub-aba conferência), nada novo', () => {
    expect(F).toContain("aoCasar={(id) => { setPainelContaId(null); setSelectedConta(id); setVistaExtrato('enriquecer_sistema'); setAbaEspelho('conferencia'); }}");
  });
  it('só a faixa do topo escurece (#162931); as pílulas seguem com as cores de estado (`tomPorMes`)', () => {
    expect(F).toContain('style={{ background: FUNDO_ESCURO }} data-testid="faixa-conciliacao"');
    expect(F).not.toContain('bg-[hsl(var(--header))]');
    expect(F).toContain('tomPorMes={tomDosMeses}');
  });
});
