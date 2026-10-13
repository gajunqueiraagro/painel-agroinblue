/**
 * OC-CC-PADRAO-NOVAS-01b — o que a tela diz da OC que nasceu em conta corrente e ainda não teve saída:
 * "Aguardando saída" (nunca "quitado"), "Atualizar entregas" apagado em rascunho com o motivo, e "Explicar diferença" só com entrega.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { AbaContaCorrenteOC } from './AbaContaCorrenteOC';
import { ResumoLateralOC } from '@/components/compra/ResumoLateralOC';
import {
  lerContaCorrente, rotuloDoSaldo, ROTULO_AGUARDANDO_SAIDA, MOTIVO_ATUALIZAR_EM_RASCUNHO, type ContaCorrente,
} from '@/lib/oc/contaCorrente';
import type { OcContaCorrenteApi } from '@/hooks/useOcContaCorrente';

function cc(extra: Record<string, unknown> = {}): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 2, valor_acordado: 10000, entregue: 0, cab_entregue: 0, recebido: 0, programado: 0, devolvido: 0,
    saldo: 0, explicado: 0, saldo_a_explicar: 0, falta_explicar: 0, situacao: 'aguardando_saida', a_entregar: 10, ultima_entrega: null,
    recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0, linhas: [], explicacoes: [], ...extra,
  });
  if (!r) throw new Error('fixture');
  return r;
}
function api(c: ContaCorrente): OcContaCorrenteApi {
  return {
    contaCorrente: c, loading: false, erro: null, ocupado: false, recarregar: vi.fn(async () => {}),
    sincronizarEntregas: vi.fn(async () => null), listarVinculaveis: vi.fn(async () => ({ erro: null, itens: [] })),
    vincularRecebimento: vi.fn(async () => null), explicarSaldo: vi.fn(async () => null), desfazerExplicacao: vi.fn(async () => null),
    simularExplicacao: vi.fn(async () => ({ previa: null, erro: null })),
    lerRolCancelamento: vi.fn(async () => ({ rol: null, erro: null })), listarLotes: vi.fn(async () => []), listarContas: vi.fn(async () => []),
  };
}
const ENTREGA = { tipo: 'entrega', data: '2031-03-11', parte_id: 'e1', lote_ordem: 1, cab: 10, categoria: 'desmama_m', conta_ordem: 1120,
  conta: 'Venda de Desmama Machos', mov_entrega: -10000, status: 'sem_caixa', no_saldo: true, saldo: -10000 };

describe('"Aguardando saída" — um dicionário só', () => {
  it('o leitor conhece a situação (não a rebaixa a "quitado") e o rótulo vem do dono, nos dois lados', () => {
    expect(cc().situacao).toBe('aguardando_saida');
    expect(rotuloDoSaldo(0, 'venda', 'aguardando_saida')).toBe(ROTULO_AGUARDANDO_SAIDA);
    expect(rotuloDoSaldo(0, 'compra', 'aguardando_saida')).toBe(ROTULO_AGUARDANDO_SAIDA);
    expect(ROTULO_AGUARDANDO_SAIDA).toBe('Aguardando saída');
    /* sem a situação (ou com outra), o rótulo é o do sinal, como sempre */
    expect(rotuloDoSaldo(0, 'venda')).toBe('Saldo · quitado');
    expect(rotuloDoSaldo(0, 'venda', 'quitado')).toBe('Saldo · quitado');
    expect(rotuloDoSaldo(-5, 'venda', 'falta_receber')).toBe('Saldo · falta receber');
  });
  it('o card do saldo da aba diz "Aguardando saída"; com entrega volta ao rótulo do sinal', () => {
    const { unmount } = render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    expect(screen.getByTestId('card-saldo').textContent).toContain('Aguardando saída');
    expect(screen.getByTestId('card-saldo').textContent).not.toContain('quitado');
    unmount();
    render(<AbaContaCorrenteOC api={api(cc({ situacao: 'falta_receber', entregue: 10000, saldo: -10000, falta_explicar: -10000, a_entregar: 0, linhas: [ENTREGA] }))} somenteLeitura={false} />);
    expect(screen.getByTestId('card-saldo').textContent).toContain('Saldo · falta receber');
  });
  it('resumo lateral: o da compra lê o dono com a situação; o da venda usa a MESMA constante (lido da fonte)', () => {
    const compra = readFileSync('src/components/compra/ResumoLateralOC.tsx', 'utf8');
    expect(compra).toContain("rotuloDoSaldo(contaCorrente.saldo, 'compra', contaCorrente.situacao)");
    const venda = readFileSync('src/components/venda/VendaModalShell.tsx', 'utf8');
    expect(venda).toContain("cc.situacao === 'aguardando_saida' ? ROTULO_AGUARDANDO_SAIDA :");
    /* nenhum segundo dicionário: a frase só está escrita no dono */
    for (const fonte of [compra, venda, readFileSync('src/components/venda/AbaContaCorrenteOC.tsx', 'utf8')]) expect(fonte).not.toContain('Aguardando saída');
    expect(typeof ResumoLateralOC).toBe('function');
  });
});

describe('"Atualizar entregas" em rascunho', () => {
  it('com saída pendente e o motivo do rascunho: botão apagado, motivo escrito e no title', () => {
    render(<AbaContaCorrenteOC api={api(cc({ saidas_sem_entrega: 1 }))} somenteLeitura={false} motivoAtualizarEntregas={MOTIVO_ATUALIZAR_EM_RASCUNHO} />);
    expect(screen.getByTestId('atualizar-entregas-motivo').textContent).toBe('Conclua a negociação antes');
    const botao = screen.getByRole('button', { name: /Atualizar/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe('Conclua a negociação antes');
  });
  it('fora de rascunho continua: botão aceso, sem motivo', () => {
    render(<AbaContaCorrenteOC api={api(cc({ saidas_sem_entrega: 1 }))} somenteLeitura={false} />);
    expect(screen.queryByTestId('atualizar-entregas-motivo')).toBeNull();
    expect((screen.getByRole('button', { name: /Atualizar/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('os dois shells entregam o motivo do rascunho ANTES do motivo de acesso (lido da fonte)', () => {
    expect(readFileSync('src/components/venda/VendaModalShell.tsx', 'utf8'))
      .toContain('motivoAtualizarEntregas={ocRascunho ? MOTIVO_ATUALIZAR_EM_RASCUNHO : acessoOC.atualizar_entregas ? null : MOTIVO_SEM_CAPACIDADE}');
    expect(readFileSync('src/components/compra/CompraModalShell.tsx', 'utf8'))
      .toContain('motivoAtualizarEntregas={api.ocRascunho ? MOTIVO_ATUALIZAR_EM_RASCUNHO : acessoOC.atualizar_entregas ? null : MOTIVO_SEM_CAPACIDADE}');
    expect(readFileSync('src/pages/LancamentosTab.tsx', 'utf8')).toMatch(/<VendaModalShell[\s\S]{0,900}ocRascunho=\{ocRascunho\}/);
  });
});

describe('"Explicar diferença" só com entrega viva', () => {
  it('sem entrega (venda e compra, mesmo com recebimento e saldo): o botão não é oferecido', () => {
    const adiantado = { situacao: 'adiantado', recebido: 700, saldo: 700, falta_explicar: 700,
      linhas: [{ tipo: 'recebimento', data: '2031-03-12', parte_id: 'r1', conta_ordem: 1120, conta: 'Venda de Desmama Machos', mov_recebido: 700, status: 'realizado', no_saldo: true, saldo: 700 }] };
    for (const lado of ['venda', 'compra'] as const) {
      for (const extra of [{}, adiantado]) {
        const { unmount } = render(<AbaContaCorrenteOC api={api(cc(extra))} somenteLeitura={false} lado={lado} />);
        expect(screen.queryByRole('button', { name: 'Explicar diferença' })).toBeNull();
        unmount();
      }
    }
  });
  it('o detector sabe achar: com entrega e saldo, o botão aparece', () => {
    render(<AbaContaCorrenteOC api={api(cc({ situacao: 'falta_receber', entregue: 10000, saldo: -10000, saldo_a_explicar: -10000, falta_explicar: -10000, a_entregar: 0, linhas: [ENTREGA] }))} somenteLeitura={false} />);
    expect(screen.getByRole('button', { name: 'Explicar diferença' })).toBeTruthy();
  });
});
