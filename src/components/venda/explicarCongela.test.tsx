/**
 * OC-CC-EXPLICAR-CONGELA-01 — "Explicar diferença": a versão se cura depois da recusa, a espera fala, e a prévia só refaz com o
 * que muda a resposta. O HOOK É O DE VERDADE (`useOcContaCorrente`); o banco é falso e CONTA cada chamada, com a versão pedida.
 */
import React, { useCallback, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

type Recusa = { code: string; message: string };
const banco = vi.hoisted(() => ({
  versao: 34, chamadas: [] as string[], erroDoReal: null as { code: string; message: string } | null, esperaDoReal: 20,
}));
vi.mock('@/integrations/supabase/client', () => {
  const RAW = {
    modelo: 'conta_corrente', valor_acordado: 64440, entregue: 64440, cab_entregue: 40, recebido: 63440, programado: 0, devolvido: 0,
    saldo: 1000, explicado: 0, saldo_a_explicar: 1000, falta_explicar: 1000, situacao: 'falta_pagar', a_entregar: 0,
    ultima_entrega: '2026-08-13', recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0, linhas: [], explicacoes: [],
  };
  const from = (t: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) b[m] = () => b;
    b.then = (ok: (x: unknown) => unknown) => Promise.resolve({
      data: t === 'zoo_operacao_lotes' ? [
        { id: 'l1', ordem: 1, categoria_negociada: 'bezerros', qtd_negociada: 20, peso_medio_negociado_kg: 180, criterio_valor: 'total', valor_informado: 29440 },
        { id: 'l2', ordem: 2, categoria_negociada: 'garrotes', qtd_negociada: 20, peso_medio_negociado_kg: 290, criterio_valor: 'total', valor_informado: 35000 },
      ] : [],
      error: null,
    }).then(ok);
    return b;
  };
  const rpc = async (nome: string, args: Record<string, unknown>) => {
    if (nome === 'oc_conta_corrente') { banco.chamadas.push('cc'); return { data: { ...RAW, versao: banco.versao }, error: null }; }
    if (nome !== 'oc_explicar_saldo') return { data: null, error: null };
    if (args.p_simular) {
      banco.chamadas.push(`previa@${args.p_versao_esperada}`);
      return { data: { ok: true, previa: { criterio: 'todos_por_kg' }, operacao_versao: banco.versao }, error: null };
    }
    banco.chamadas.push(`gravar@${args.p_versao_esperada}`);
    await new Promise(r => setTimeout(r, banco.esperaDoReal));
    if (banco.erroDoReal) return { data: null, error: banco.erroDoReal };
    /* o contrato da RPC: versao velha e' RAISE 40001, nunca ok:false */
    if (args.p_versao_esperada !== banco.versao) return { data: null, error: { code: '40001', message: `Conflito de versao (esperada ${args.p_versao_esperada}, atual ${banco.versao})` } };
    banco.versao += 3;
    return { data: { ok: true, operacao_versao: banco.versao }, error: null };
  };
  return { supabase: { from, rpc } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { useOcContaCorrente, fraseDoErroAoExplicar, FRASE_BANCO_OCUPADO } from '@/hooks/useOcContaCorrente';
import { DialogoExplicarDiferenca } from './AbaContaCorrenteOC';

const FRASE_VERSAO = 'A operação mudou enquanto você trabalhava. Recarregue e tente de novo.';
/** O hospedeiro em miniatura: dono da versão (o papel do `ocVersao`), e `aoMudarLotes` relê os lotes como o `useCompraLotes`. */
function Host({ versaoDaTela, fechado }: { versaoDaTela: number; fechado: () => void }) {
  const [versao, setVersao] = useState<number | null>(versaoDaTela);
  const [, setLotes] = useState<object[]>([]);
  const recarregarLotes = useCallback(async () => { setLotes([{}, {}]); }, []);
  const api = useOcContaCorrente({ operacaoId: 'op', enabled: true, versao, onVersaoChange: setVersao, aoMudarLotes: recarregarLotes });
  if (!api.contaCorrente) return null;
  return <><span data-testid="versao-da-tela">{versao}</span><DialogoExplicarDiferenca api={api} somenteLeitura={false} lado="compra" onFechar={fechado} /></>;
}
const espera = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const previas = () => banco.chamadas.filter(c => c.startsWith('previa')).length;
const gravacoes = () => banco.chamadas.filter(c => c.startsWith('gravar'));
const dlg = () => screen.getByTestId('dialogo-explicar');
const motivo = () => within(dlg()).getByLabelText('Motivo *');
const botaoSalvar = () => within(dlg()).getByRole('button', { name: /Salvar explicação|Salvando\.\.\./ }) as HTMLButtonElement;
async function abrirComAjuste(versaoDaTela: number) {
  const fechado = vi.fn();
  render(<Host versaoDaTela={versaoDaTela} fechado={fechado} />);
  await screen.findByTestId('dialogo-explicar');
  await espera(60);
  fireEvent.click(within(dlg()).getByRole('button', { name: '+ Ajuste de preço' }));
  await espera(500);
  return fechado;
}

beforeEach(() => {
  banco.versao = 34; banco.chamadas = []; banco.erroDoReal = null; banco.esperaDoReal = 20;
  Element.prototype.scrollIntoView = () => {}; Element.prototype.hasPointerCapture = () => false; Element.prototype.releasePointerCapture = () => {};
});

describe('item 1 — a versão se cura depois da recusa', () => {
  it('tela na 33, banco na 34: 1 recusa com a frase e o diálogo aberto; o SEGUNDO Salvar grava com a 34', async () => {
    const fechado = await abrirComAjuste(33);
    fireEvent.change(motivo(), { target: { value: 'ajuste combinado' } });
    fireEvent.click(botaoSalvar());
    await espera(300);
    expect(gravacoes()).toEqual(['gravar@33']);
    expect(screen.getByTestId('erro-explicar').textContent).toBe(FRASE_VERSAO);
    expect(fechado).not.toHaveBeenCalled();
    /* a versão relida subiu pelo canal de sempre: o dono é quem recebe `onVersaoChange` */
    expect(screen.getByTestId('versao-da-tela').textContent).toBe('34');
    fireEvent.click(botaoSalvar());
    await espera(300);
    expect(gravacoes()).toEqual(['gravar@33', 'gravar@34']);
    expect(fechado).toHaveBeenCalledTimes(1);
  }, 15000);
  it('versão em dia: UMA gravação por clique, e o diálogo fecha', async () => {
    const fechado = await abrirComAjuste(34);
    fireEvent.change(motivo(), { target: { value: 'ajuste combinado' } });
    fireEvent.click(botaoSalvar());
    await espera(2000);
    expect(gravacoes()).toEqual(['gravar@34']);
    expect(fechado).toHaveBeenCalledTimes(1);
  }, 15000);
});

describe('item 2 — a espera fala, e erro que não é do produto não aparece cru', () => {
  it('"Salvando..." enquanto grava, com o botão apagado', async () => {
    banco.esperaDoReal = 400;
    await abrirComAjuste(34);
    fireEvent.change(motivo(), { target: { value: 'ajuste combinado' } });
    expect(botaoSalvar().textContent).toBe('Salvar explicação');
    fireEvent.click(botaoSalvar());
    await espera(100);
    expect(botaoSalvar().textContent).toBe('Salvando...');
    expect(botaoSalvar().disabled).toBe(true);
    await espera(600);
  }, 15000);
  it.each([
    ['55P03', 'canceling statement due to lock timeout'],
    ['57014', 'canceling statement due to statement timeout'],
    ['XX000', 'FetchError: something raw'],
  ])('erro %s: a frase do banco ocupado, em uma linha, e o diálogo fica aberto com o digitado', async (code, message) => {
    banco.erroDoReal = { code, message } satisfies Recusa;
    const fechado = await abrirComAjuste(34);
    fireEvent.change(motivo(), { target: { value: 'ajuste combinado' } });
    fireEvent.click(botaoSalvar());
    await espera(300);
    const erro = screen.getByTestId('erro-explicar');
    expect(erro.textContent).toBe(FRASE_BANCO_OCUPADO);
    expect(erro.getAttribute('title')).toBe(FRASE_BANCO_OCUPADO);
    expect(erro.className).toContain('truncate');
    expect(erro.className).toContain('text-destructive');
    expect(fechado).not.toHaveBeenCalled();
    expect(motivo()).toHaveProperty('value', 'ajuste combinado');
    expect(botaoSalvar().textContent).toBe('Salvar explicação');
  }, 15000);
  it('a regra de negócio do banco (P0001) continua com a frase dela', async () => {
    banco.erroDoReal = { code: 'P0001', message: 'Lote 2 sem entrega no financeiro' };
    await abrirComAjuste(34);
    fireEvent.change(motivo(), { target: { value: 'ajuste combinado' } });
    fireEvent.click(botaoSalvar());
    await espera(300);
    expect(screen.getByTestId('erro-explicar').textContent).toBe('Lote 2 sem entrega no financeiro');
  }, 15000);
  it('o dono da frase: só os códigos do produto passam', () => {
    expect(fraseDoErroAoExplicar({ code: '40001', message: 'x' })).toBe(FRASE_VERSAO);
    expect(fraseDoErroAoExplicar({ code: 'P0001', message: 'Informe o motivo da explicacao' })).toBe('Informe o motivo da explicacao');
    expect(fraseDoErroAoExplicar({ code: '42501', message: 'x' })).toBe('Sem permissão para esta operação.');
    for (const code of ['55P03', '57014', 'PGRST301', '', null, undefined]) expect(fraseDoErroAoExplicar({ code, message: 'cru' })).toBe(FRASE_BANCO_OCUPADO);
    expect(fraseDoErroAoExplicar(null)).toBe(FRASE_BANCO_OCUPADO);
    expect(fraseDoErroAoExplicar({ code: 'P0001', message: '' })).toBe(FRASE_BANCO_OCUPADO);
  });
});

describe('item 3 — a prévia só refaz com o que muda a resposta', () => {
  it('escolher o ajuste dispara UMA prévia; digitar o motivo letra a letra (10 letras, 120 ms) dispara ZERO', async () => {
    await abrirComAjuste(34);
    expect(previas()).toBe(1);
    const texto = 'ajuste dez';
    for (let i = 1; i <= texto.length; i++) { fireEvent.change(motivo(), { target: { value: texto.slice(0, i) } }); await espera(120); }
    await espera(600);
    expect(previas()).toBe(1);
  }, 15000);
  it('mudar o VALOR refaz (uma, depois dos 350 ms); o motivo digitado depois não', async () => {
    await abrirComAjuste(34);
    expect(previas()).toBe(1);
    fireEvent.change(within(dlg()).getByLabelText('Valor'), { target: { value: '900,00' } });
    await espera(100);
    expect(previas()).toBe(1);
    await espera(500);
    expect(previas()).toBe(2);
    /* a prévia leva o valor NOVO e o motivo que estiver na linha naquele momento */
    fireEvent.change(motivo(), { target: { value: 'combinado' } });
    await espera(500);
    expect(previas()).toBe(2);
  }, 15000);
});
