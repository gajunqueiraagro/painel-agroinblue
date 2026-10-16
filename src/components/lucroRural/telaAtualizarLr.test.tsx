/**
 * FIN-LR-SYNC-01 passo b — a tela "Atualizar do Lucro Rural" e o histórico, montados com um envelope SINTÉTICO do comparar
 * (`fn_lr_sync_comparar`). Prova: contagens por situação nos cartões, o ▾ troca a ação, "decidir" e nova sem classificação
 * travam o Gravar, o contador "sem safra", a simulação mostra as recusas com o motivo, e o desfazer só na última.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select data-testid="acao-da-linha" value={value ?? ''} onChange={e => onValueChange(e.target.value)}>
      <option value="">—</option>{children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock('@/components/shared/PlanoSubcentroSelect', () => ({ PlanoSubcentroSelect: () => null }));
vi.mock('@/components/shared/FazendaSelect', () => ({ FazendaSelect: () => null }));
vi.mock('@/components/shared/FavorecidoSelect', () => ({ FavorecidoSelect: () => null }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
const desfazerLr = vi.fn();
vi.mock('@/v2/hooks/useLrSyncAplicar', () => ({ desfazerLr: (...a: unknown[]) => desfazerLr(...a) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { TelaAtualizarLr } from './TelaAtualizarLr';
import { HistoricoLucroRural, desfazivel, type AplicacaoLr } from './HistoricoLucroRural';
import { lerEnvelopeLr, type EnvelopeLr } from '@/v2/lib/lucroRural/telaLr';

const linha = (chave: string, situacao: string, acao: string, extra: Record<string, unknown> = {}) => ({
  chave, ordem: 1, tipo: 'p', situacao, acao_padrao: acao, motivo: null, lancamento_id: situacao === 'nova' ? null : `l-${chave}`,
  lr: { numero: '1', valor_c: 10000, vencimento: '2026-10-20', contraparte: `F ${chave}`, tipo_contas: 'Despesa X' },
  resolvido: { fornecedor_id: 'f1', fazenda_id: 'z1', plano_conta_id: 'p1', subcentro: 'Sub 1', safra_id: 's-pec' },
  lancamento: situacao === 'nova' ? null : { valor_c: 10000, vencimento: '2026-10-20', status: 'programado' },
  diferencas: [], ...extra,
});

function envelope(over: { semDecidir?: boolean; semNovaCrua?: boolean } = {}): EnvelopeLr {
  const linhas = [
    linha('n1', 'nova', 'criar_programada'),
    linha('n2', 'nova', 'criar_programada', { resolvido: { fornecedor_id: 'f1', fazenda_id: 'z1', plano_conta_id: 'p1', subcentro: 'Sub 1', safra_id: null } }),
    ...(over.semNovaCrua ? [] : [linha('n3', 'nova', 'criar_programada', { motivo: 'falta_classificar', resolvido: { fornecedor_id: 'f1', fazenda_id: null, plano_conta_id: null, subcentro: null, safra_id: null } })]),
    linha('m1', 'mudou', 'atualizar', { diferencas: [{ campo: 'valor' }] }),
    linha('p1', 'pago_no_lr', 'aguardar_extrato'),
    ...(over.semDecidir ? [] : [linha('d1', 'decidir', 'decidir_centavos', { lancamento: { valor_c: 10001 } })]),
    linha('s1', 'sem_mudanca', 'nada'),
  ];
  const env = lerEnvelopeLr({
    sessao: 'sess-1', linhas, so_no_sistema: [{ lancamento_id: 'x1', descricao: 'Só aqui', tipo: '2-Saídas', valor_c: 500, vencimento: '2026-10-05' }],
    resumo: { nova: { qtde: 3, valor_c: 30000 }, mudou: { qtde: 1, valor_c: 10000 }, pago_no_lr: { qtde: 1, valor_c: 10000 },
      decidir: { qtde: 1, valor_c: 10000 }, sem_mudanca: { qtde: 1, valor_c: 10000 }, so_no_sistema: { qtde: 1, valor_c: 500 }, da_oc: { qtde: 2, valor_c: 0 } },
  });
  if (!env) throw new Error('envelope sintético torto');
  return env;
}

const escopoDoPlano = (id: string) => (id === 'p1' ? 'pecuaria' : null);
const escopoDaSafra = (id: string) => (id === 's-pec' ? 'pecuaria' : 'agricultura');

function montar(env: EnvelopeLr, simular = vi.fn(), gravar = vi.fn()) {
  render(<TelaAtualizarLr envelope={env} clienteNome="Teste" clienteId="c1" arquivos={[{ tipo: 'pagar', nome: 'p.xlsx', data: '15/10/26', linhas: 7 }]}
    classificacoes={[]} fazendas={[]} escopoDoPlano={escopoDoPlano} escopoDaSafra={escopoDaSafra} onTrocarArquivos={() => undefined}
    historicoQtde={2} onAbrirHistorico={() => undefined} simular={simular} gravar={gravar} onCancelar={() => undefined} />);
  return { simular, gravar };
}
const selectDa = (chave: string) => {
  const tr = document.querySelector(`tr[data-chave="${chave}"]`);
  if (!tr) throw new Error(`sem linha ${chave}`);
  return within(tr as HTMLElement).getByTestId('acao-da-linha') as HTMLSelectElement;
};

describe('tela 1 — cartões, ações e pendências', () => {
  it('os cartões mostram a quantidade do resumo do banco, por situação; toda linha diz a situação', () => {
    montar(envelope());
    expect(screen.getByTestId('cartao-nova-qtde').textContent).toBe('3');
    expect(screen.getByTestId('cartao-mudou-qtde').textContent).toBe('1');
    expect(screen.getByTestId('cartao-decidir-qtde').textContent).toBe('1');
    expect(screen.getByTestId('cartao-so_no_sistema-qtde').textContent).toBe('1');
    expect(screen.getByTestId('cartao-da_oc-qtde').textContent).toBe('2');
    const situacoes = screen.getAllByTestId('linha-lr').map(tr => tr.getAttribute('data-situacao'));
    expect(situacoes).toEqual(['nova', 'nova', 'nova', 'mudou', 'pago_no_lr', 'decidir', 'sem_mudanca']);
    fireEvent.click(screen.getByTestId('cartao-mudou'));
    expect(screen.getAllByTestId('linha-lr').map(tr => tr.getAttribute('data-chave'))).toEqual(['m1']);
    fireEvent.click(screen.getByTestId('cartao-so_no_sistema'));
    expect(screen.queryAllByTestId('linha-lr')).toHaveLength(0);
    expect(screen.getAllByTestId('linha-so-no-sistema')).toHaveLength(1);
  });

  it('o padrão é a ação do banco; decidir nasce sem ação; o ▾ troca a ação e o Gravar descreve', () => {
    montar(envelope({ semDecidir: true, semNovaCrua: true }));
    expect(selectDa('m1').value).toBe('atualizar');
    expect(selectDa('p1').value).toBe('aguardar_extrato');
    expect(screen.getByTestId('botao-gravar').textContent).toBe('Gravar · 2 novas · 1 atualizam · 0 vínculos · 1 aguardam extrato');
    fireEvent.change(selectDa('m1'), { target: { value: 'manter' } });
    expect(selectDa('m1').value).toBe('manter');
    expect(screen.getByTestId('botao-gravar').textContent).toBe('Gravar · 2 novas · 0 atualizam · 1 vínculos · 1 aguardam extrato');
    expect((screen.getByTestId('botao-gravar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('"decidir" sem escolha trava o Gravar e diz quantas faltam', () => {
    montar(envelope({ semNovaCrua: true }));
    expect(selectDa('d1').value).toBe('');
    expect(screen.getByTestId('pendencias').textContent).toBe('Faltam 1 decisão e 0 classificações');
    expect((screen.getByTestId('botao-gravar') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(selectDa('d1'), { target: { value: 'ignorar' } });
    expect((screen.getByTestId('botao-gravar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('nova sem classificação trava o Gravar até classificar (ou ignorar)', () => {
    montar(envelope({ semDecidir: true }));
    expect(screen.getByTestId('pendencias').textContent).toBe('Faltam 0 decisões e 1 classificação');
    expect((screen.getByTestId('botao-gravar') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(selectDa('n3'), { target: { value: 'ignorar' } });
    expect(screen.getByTestId('pendencias').textContent).toBe('Tudo decidido.');
    expect((screen.getByTestId('botao-gravar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('o contador "sem safra" conta as novas que nascem sem safra, e a linha leva a marca', () => {
    montar(envelope({ semDecidir: true }));
    /* n1: safra de pecuária num plano de pecuária = tem safra; n2 e n3: o LR não diz a safra */
    expect(screen.getByTestId('aviso-sem-safra').textContent).toContain('2 novas nascem sem safra');
    const marcadas = screen.getAllByTestId('marca-sem-safra').map(m => m.closest('tr')?.getAttribute('data-chave'));
    expect(marcadas).toEqual(['n2', 'n3']);
    fireEvent.change(selectDa('n2'), { target: { value: 'ignorar' } });
    expect(screen.getByTestId('aviso-sem-safra').textContent).toContain('1 nova nasce sem safra');
  });
});

describe('simular e gravar', () => {
  it('simular mostra as recusas com o motivo, em português; nada é gravado', async () => {
    const simular = vi.fn().mockResolvedValue({ ok: true, envelope: { resumo: { aplicadas: 4 }, itens: [
      { chave: 'm1', acao: 'atualizar', status: 'recusado', motivo: 'parcela_de_contrato' },
      { chave: 'n1', acao: 'criar_programada', status: 'aplicado', motivo: null },
    ] } });
    const { gravar } = montar(envelope({ semDecidir: true, semNovaCrua: true }), simular);
    fireEvent.click(screen.getByTestId('botao-simular'));
    await waitFor(() => expect(screen.getByTestId('resultado-lr')).toBeTruthy());
    const recusas = screen.getAllByTestId('recusa-lr');
    expect(recusas).toHaveLength(1);
    expect(recusas[0].textContent).toContain('F m1');
    expect(recusas[0].textContent).toContain('parcela de contrato: altere pelo contrato');
    expect(gravar).not.toHaveBeenCalled();
  });

  it('gravar simula antes e só grava na confirmação', async () => {
    const env = { ok: true, envelope: { resumo: { aplicadas: 4 }, itens: [] } };
    const simular = vi.fn().mockResolvedValue(env);
    const gravar = vi.fn().mockResolvedValue(env);
    montar(envelope({ semDecidir: true, semNovaCrua: true }), simular, gravar);
    fireEvent.click(screen.getByTestId('botao-gravar'));
    await waitFor(() => expect(screen.getByTestId('confirmar-gravar')).toBeTruthy());
    expect(simular).toHaveBeenCalledTimes(1);
    expect(gravar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirmar-gravar'));
    await waitFor(() => expect(gravar).toHaveBeenCalledTimes(1));
    expect(gravar.mock.calls[0][0].map((d: { chave: string }) => d.chave)).toEqual(['n1', 'n2', 'm1', 'p1']);
  });
});

describe('histórico — desfazer só a última', () => {
  const ap = (id: string, quando: string, desfeita: string | null = null): AplicacaoLr => ({
    id, aplicadaEm: quando, aplicadaPor: null, quem: null, desfeitaEm: desfeita, arquivos: 'pagar + receber',
    novas: 1, atualizadas: 0, vinculos: 0, aguardam: 0,
  });

  it('a regra: a primeira não desfeita da lista (a mais nova)', () => {
    const lista = [ap('a3', '2026-10-16T10:00:00Z', '2026-10-16T11:00:00Z'), ap('a2', '2026-10-15T10:00:00Z'), ap('a1', '2026-10-14T10:00:00Z')];
    expect(desfazivel(lista, 'a2')).toBe(true);
    expect(desfazivel(lista, 'a1')).toBe(false);
    expect(desfazivel(lista, 'a3')).toBe(false);
  });

  it('só a última tem o botão; ele simula antes e mostra o que não volta', async () => {
    desfazerLr.mockReset();
    desfazerLr.mockResolvedValue({ ok: true, envelope: { resumo: { desfeitas: 3 }, itens: [{ chave: 'k9', acao: 'atualizar', status: 'nao_desfeito', motivo: 'editado_depois' }] } });
    const carregar = vi.fn().mockResolvedValue([ap('a2', '2026-10-15T10:00:00Z'), ap('a1', '2026-10-14T10:00:00Z')]);
    render(<HistoricoLucroRural clienteId="c1" clienteNome="Teste" onVoltar={() => undefined} carregar={carregar} />);
    await waitFor(() => expect(screen.getAllByTestId('aplicacao-lr')).toHaveLength(2));
    expect(screen.getAllByTestId('desfazer-lr')).toHaveLength(1);
    expect(screen.getAllByTestId('so-a-ultima')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('desfazer-lr'));
    await waitFor(() => expect(screen.getByTestId('previa-desfazer')).toBeTruthy());
    expect(desfazerLr).toHaveBeenCalledWith('c1', 'a2', true);
    expect(screen.getByTestId('previa-desfazer').textContent).toContain('editado depois da atualização');
    fireEvent.click(screen.getByTestId('confirmar-desfazer'));
    await waitFor(() => expect(desfazerLr).toHaveBeenCalledWith('c1', 'a2', false));
  });
});

describe('o encaixe', () => {
  it('a entrada mora em Conciliação › Importar Banco; Lançamentos Financeiros não muda', () => {
    const imp = readFileSync('src/components/conciliacao/ImportarBancoInline.tsx', 'utf8');
    expect(imp).toContain('data-testid="abrir-atualizar-lr"');
    expect(imp).toContain('{lrAberto && <AtualizarLucroRuralDialog open onOpenChange={setLrAberto} />}');
    expect(readFileSync('src/pages/FinanceiroV2Tab.tsx', 'utf8')).not.toContain('AtualizarLucroRural');
  });
});
