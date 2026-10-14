/**
 * ABATE-PROJETADO-01c item 4 — o recebimento do abate SO' PROJETADO nasce PREVISTO no banco (`oc_lancar_pelo_modal`) e o extrato
 * (`oc_conta_corrente`) devolve status 'previsto'. A TELA SO' LE^: o leitor aceita o status, o extrato escreve "previsto" na cor
 * do dono (`STATUS_PALETA`) no lugar do banco (o nome do banco vai no `title`), e o dinheiro em aberto (programado OU previsto)
 * se parcela e se cancela igual. Programado e realizado: como antes.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AbaContaCorrenteOC, acoesDaLinha } from './AbaContaCorrenteOC';
import { dinheiroEmAberto, lerContaCorrente, ROTULO_STATUS, type ContaCorrente } from '@/lib/oc/contaCorrente';
import { STATUS_PALETA } from '@/lib/financeiro/statusFinanceiro';
import type { OcContaCorrenteApi } from '@/hooks/useOcContaCorrente';

function cc(status: string, banco: string | null): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 4, valor_acordado: 107174.97, entregue: 0, cab_entregue: 0,
    recebido: 0, programado: 107174.97, devolvido: 0, saldo: 0, explicado: 0, saldo_a_explicar: 0,
    falta_explicar: 0, situacao: 'aguardando_saida', a_entregar: 107174.97, ultima_entrega: null,
    recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0,
    linhas: [
      { tipo: 'recebimento', data: '2031-05-10', parte_id: 'r1', lancamento_id: 'l1', conta_ordem: 1010, conta: 'Abates de Fêmeas',
        banco, mov_recebido: 107174.97, status, no_saldo: false, saldo: 0 },
    ],
    explicacoes: [],
  });
  if (!r) throw new Error('fixture');
  return r;
}

function api(c: ContaCorrente): OcContaCorrenteApi {
  return {
    contaCorrente: c, loading: false, erro: null, ocupado: false, recarregar: vi.fn(async () => {}),
    sincronizarEntregas: vi.fn(async () => null), listarVinculaveis: vi.fn(async () => ({ erro: null, itens: [] })),
    vincularRecebimento: vi.fn(async () => null), explicarSaldo: vi.fn(async () => null),
    desfazerExplicacao: vi.fn(async () => null), simularExplicacao: vi.fn(async () => ({ previa: null, erro: null })),
    lerRolCancelamento: vi.fn(async () => ({ rol: null, erro: null })), listarLotes: vi.fn(async () => []),
    listarContas: vi.fn(async () => []),
  };
}

const celulaBanco = () => {
  const linha = within(screen.getByTestId('conta-corrente-tabela')).getAllByRole('row').find(r => r.getAttribute('data-tipo') === 'recebimento');
  if (!linha) throw new Error('sem linha de recebimento');
  const td = linha.querySelector('[data-celula="banco"]');
  if (!td) throw new Error('sem celula do banco');
  return { linha, td };
};

describe('ABATE-PROJETADO-01c — o recebimento previsto, como o banco devolve', () => {
  it('o leitor guarda o status previsto (antes caia em realizado)', () => {
    expect(cc('previsto', 'Sicredi').linhas[0].status).toBe('previsto');
    expect(cc('qualquer_outro', 'Sicredi').linhas[0].status).toBe('realizado');
  });

  it('dinheiro em aberto = programado ou previsto, e so\' eles', () => {
    expect(dinheiroEmAberto('previsto')).toBe(true);
    expect(dinheiroEmAberto('programado')).toBe(true);
    expect(dinheiroEmAberto('realizado')).toBe(false);
    expect(dinheiroEmAberto('conciliado')).toBe(false);
    expect(dinheiroEmAberto('sem_conta_bancaria')).toBe(false);
  });

  it('o extrato escreve "previsto" na cor do dono, com o banco no title', () => {
    render(<AbaContaCorrenteOC api={api(cc('previsto', 'Sicredi'))} somenteLeitura={false} lado="abate" />);
    const { linha, td } = celulaBanco();
    expect(linha.getAttribute('data-status')).toBe('previsto');
    expect(td.textContent).toBe(ROTULO_STATUS.previsto);
    expect(td.className).toContain(STATUS_PALETA.previsto.texto);
    expect(td.getAttribute('title')).toContain('Sicredi');
    expect(td.getAttribute('title')).toContain('vira programado quando o gado sair');
  });

  it('o programado com banco segue mostrando o banco, sem a cor do previsto', () => {
    render(<AbaContaCorrenteOC api={api(cc('programado', 'Sicredi'))} somenteLeitura={false} lado="abate" />);
    const { td } = celulaBanco();
    expect(td.textContent).toBe('Sicredi');
    expect(td.className).not.toContain(STATUS_PALETA.previsto.texto);
  });

  it('o previsto se parcela e se cancela como o programado (mesmos motivos)', () => {
    const prev = cc('previsto', 'Sicredi').linhas[0];
    const prog = cc('programado', 'Sicredi').linhas[0];
    const motivos = (l: typeof prev) => acoesDaLinha(l, 'abate', false, true)
      .filter(a => a.chave === 'cancelar_programado' || a.chave === 'parcelar').map(a => [a.chave, a.motivo]);
    expect(motivos(prev)).toEqual(motivos(prog));
    expect(acoesDaLinha(prev, 'abate', false, true).find(a => a.chave === 'cancelar_programado')?.motivo).toBeNull();
  });
});
