/**
 * OC-VINCULO-VALOR (Gabriel 30/10/2026) — "Vincular não pode mudar valor, não pode nada, nada, nada. Cria um novo, se for o caso,
 * dentro da OC". A REGRA É DO BANCO (`oc_vincular_lancamento`, migration 20261028115090, provada em
 * `supabase/tests/oc_vinculo_so_liga_test.sql`). Aqui se trava o que a TELA faz com as respostas novas:
 *   · a parcela de um lançamento que a OC não gerou → a frase do banco + "Criar compromisso novo" (`p_criar_novo`);
 *   · o título PROGRAMADO da OC que o vínculo reduz → "Título da OC" com a frase do banco, e o clique leva `p_aceitar_titulo_oc`;
 *   · sem nada a confirmar, o clique NÃO aceita nada (`p_aceitar_titulo_oc` falso);
 *   · fornecedor diferente → a pergunta, nunca a escolha sozinha.
 * ⚠ A RPC É MOCKADA com os envelopes do ensaio revertido no cliente Teste (30/10/2026).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VincularOperacaoDialog } from '@/components/financeiro-v2/VincularOperacaoDialog';
import {
  resumoDoVinculo, type OperacaoCandidata, type RespostaCandidatas, type VinculoFeito, type VinculoRecusado,
} from '@/lib/oc/vincularLancamento';

const LANC = 'l1';
const OC = 'oc-ensaio';
const semDuro = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');

const candidata: OperacaoCandidata = {
  operacao_id: OC, tipo_operacao: 'abate', numero_documento: null, status_comercial: 'fechada', versao: 14,
  data_operacao: '2026-10-21', data_referencia: '2026-10-21', distancia_dias: 1, fazenda_id: 'f1', fazenda_nome: 'Fazenda',
  mesma_fazenda: true, contraparte_id: 'c1', contraparte_nome: 'Frigorífico', valor_acordado: 1382533.88,
  compromissos: [], acao_prevista: 'criar', tem_titulo_vivo_do_componente: true,
  valor_exato: false, competencia_nova: '2026-10-19', competencia_muda_de_mes: false, movimento_duplicado: null,
};
const candidatas: RespostaCandidatas = {
  elegivel: true,
  lancamento: { id: LANC, descricao: 'Abate 185 bois - Fundersul', valor: 1803.75, tipo_operacao: '2-Saídas',
    subcentro: 'Impostos e Despesas de Abates e Vendas', data_competencia: '2026-10-19', data_pagamento: '2026-10-20',
    status_transacao: 'realizado', fazenda_nome: 'Fazenda', favorecido_nome: 'Órgão Arrecadador', conciliado: true,
    origem_lancamento: 'manual', importado: false, movimentacao_rebanho_id: null },
  regra: { natureza: 'obrigacao', componentes: ['taxas_impostos'], tipos_oc: ['abate'] },
  componente_sugerido: null,
  candidatas: [candidata],
};
/** o caso do Acompanhamento: a parcela do compromisso é de um lançamento manual */
const recusaManual: VinculoRecusado = {
  ok: false, acao: 'recusado', motivo: 'parcela_tem_lancamento', pode_criar_novo: true, compromisso_id: 'c-acomp',
  titulo: { id: 't-acomp', valor: 1850, descricao: 'Abate 185 cab. - Acompanhamento', status_transacao: 'agendado' },
  frase: 'Este compromisso já tem o lançamento Abate 185 cab. - Acompanhamento (R$ 1.850,00). Crie um compromisso novo para este.',
  operacao_versao: 14,
};
const vinculo = (o: Partial<VinculoFeito> = {}): VinculoFeito => ({
  ok: true, acao: 'simulado', simulado: true, operacao_versao: 14, titulos_vivos_do_compromisso: 1, conciliado: true,
  compromisso: { id: 'c-novo', acao: 'criado', valor_anterior: null, valor_total: 1803.75 },
  parcela: { id: 'p', acao: 'criada' },
  titulo_substituido: null,
  lancamento: { id: LANC, competencia_anterior: '2026-10-19', competencia_nova: '2026-10-19', hash_preservado: true, movimentacao_rebanho_id_solto: null },
  avisos: [], confirmar_titulo_oc: null,
  ...o,
});
/** o título PROGRAMADO da OC (gerado por ela) reduzido ao saldo — a regra de 05/10, agora só com o clique */
const comTituloDaOC = (): VinculoFeito => vinculo({
  compromisso: { id: 'c', acao: 'mantido', valor_anterior: 294595, valor_total: 294595 },
  parcela: { id: 'p', acao: 'parcial' },
  confirmar_titulo_oc: { acao: 'reduzir', titulo_id: 't', valor_antes: 294595, valor_depois: 94595,
    frase: 'O título programado da OC de R$ 294.595,00 passa a R$ 94.595,00.' },
});

type Args = Record<string, unknown>;
const chamadasVincular = (): Args[] => rpc.mock.calls.filter(c => c[0] === 'oc_vincular_lancamento').map(c => c[1] as Args);

async function montar() {
  render(<VincularOperacaoDialog open lancamentoId={LANC} clienteId="teste" onClose={vi.fn()} onVinculado={vi.fn()} />);
  await waitFor(() => expect(document.querySelector(`tr[data-oc="${OC}"]`)).not.toBeNull());
  const linha = document.querySelector(`tr[data-oc="${OC}"]`);
  if (!(linha instanceof HTMLElement)) throw new Error('linha da OC nao achada');
  fireEvent.click(linha);
}
function responder(f: (a: Args) => VinculoFeito | VinculoRecusado) {
  rpc.mockImplementation(async (nome: string, a: Args) => {
    if (nome === 'oc_candidatas_vinculo') return { data: candidatas, error: null };
    if (nome === 'oc_vincular_lancamento') return { data: f(a), error: null };
    return { data: null, error: null };
  });
}
async function confirmar() {
  fireEvent.change(screen.getByTestId('vinc-motivo'), { target: { value: 'é desta OC' } });
  const b = screen.getByTestId('vinc-confirmar');
  await waitFor(() => expect(b).not.toBeDisabled());
  fireEvent.click(b);
  await waitFor(() => expect(chamadasVincular().some(a => a.p_simular === false)).toBe(true));
  const gravar = chamadasVincular().find(a => a.p_simular === false);
  if (!gravar) throw new Error('sem a chamada de gravar');
  return gravar;
}

beforeEach(() => { rpc.mockReset(); });

describe('a parcela é de um lançamento que a OC não gerou (o caso do Acompanhamento)', () => {
  it('mostra a frase do banco e o botão "Criar compromisso novo"; o vínculo não fica pronto', async () => {
    responder(() => recusaManual);
    await montar();
    const r = await screen.findByTestId('vinc-recusa');
    expect(r.getAttribute('data-motivo')).toBe('parcela_tem_lancamento');
    expect(semDuro(r.textContent)).toBe('Este compromisso já tem o lançamento Abate 185 cab. - Acompanhamento (R$ 1.850,00). Crie um compromisso novo para este.');
    expect(screen.getByTestId('vinc-criar-novo-recusa').textContent).toBe('Criar compromisso novo');
    expect(screen.getByTestId('vinc-confirmar')).toBeDisabled();
  });
  it('"Criar compromisso novo" simula de novo com `p_criar_novo` e sem compromisso escolhido — o compromisso nasce dentro da OC', async () => {
    responder(a => (a.p_criar_novo === true ? vinculo() : recusaManual));
    await montar();
    fireEvent.click(await screen.findByTestId('vinc-criar-novo-recusa'));
    await waitFor(() => expect(chamadasVincular().some(a => a.p_criar_novo === true)).toBe(true));
    const sim = chamadasVincular().find(a => a.p_criar_novo === true);
    expect(sim?.p_compromisso_id).toBeNull();
    expect(sim?.p_simular).toBe(true);
    const gravar = await confirmar();
    expect(gravar.p_criar_novo).toBe(true);
    expect(gravar.p_aceitar_titulo_oc).toBe(false);
  });
});

describe('o título PROGRAMADO da OC só muda com o clique', () => {
  it('o resumo diz "Título da OC" com a frase do banco (294.595 → 94.595)', () => {
    const linha = resumoDoVinculo(comTituloDaOC()).find(l => l.rotulo === 'Título da OC');
    expect(semDuro(linha?.valor)).toBe('O título programado da OC de R$ 294.595,00 passa a R$ 94.595,00.');
    expect(linha?.tom).toBe('ambar');
  });
  it('o clique em Vincular leva `p_aceitar_titulo_oc` quando a prévia mostrou a mudança do título', async () => {
    responder(() => comTituloDaOC());
    await montar();
    const gravar = await confirmar();
    expect(gravar.p_aceitar_titulo_oc).toBe(true);
  });
  it('sem nada a confirmar, o clique NÃO aceita nada', async () => {
    responder(() => vinculo());
    await montar();
    const gravar = await confirmar();
    expect(gravar.p_aceitar_titulo_oc).toBe(false);
  });
});

describe('fornecedor diferente: o vínculo pergunta, nunca escolhe sozinho', () => {
  it('a frase diz que o único compromisso livre é de outro fornecedor e oferece criar um novo', async () => {
    responder(() => ({ ok: false, acao: 'recusado', motivo: 'escolher_compromisso', fornecedor_diferente: true, pode_criar_novo: true,
      compromissos: [{ id: 'c-acomp', componente: 'taxas_impostos', descricao: 'Abate 185 cab. - Acompanhamento', valor_total: 1850, status: 'programado' }],
      operacao_versao: 14 }));
    await montar();
    const r = await screen.findByTestId('vinc-recusa');
    expect(r.textContent).toBe('O único compromisso livre deste item é de outro fornecedor: escolha-o na lista à esquerda ou crie um novo.');
    expect(screen.getByTestId('vinc-escolha').textContent).toContain('O compromisso deste item é de outro fornecedor — é este mesmo, ou crie um novo?');
    expect(screen.getByTestId('vinc-criar-novo')).toBeInTheDocument();
  });
});
