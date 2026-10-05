/**
 * OC-VINCULAR-PARCELA-SEGUINTE-01 — o "O que vai acontecer" do Vincular diz a PARCELA e o que a OC passa a ter recebido.
 *
 * ⚠ O CASO DO AGNALDO (05/10/2026): OC f74f95e5, venda de 294.595,00 paga em duas vezes. O segundo recebimento (84b11037,
 *   94.595,00) caía em "criar item", a parte nascia "1 de 1" e batia no índice — a SIMULAÇÃO estourava igual, e o painel
 *   ficava VAZIO com o erro cru do Postgres. A regra foi consertada no banco (migration 20261027193200, provada em
 *   `supabase/tests/oc_vincular_parcela_seguinte_01_test.sql`); aqui se trava o que a TELA faz com a resposta.
 * ⚠ A RPC É MOCKADA com o envelope que a simulação devolveu no ensaio revertido sobre o Agnaldo. A tela NÃO CONTA parcela nem
 *   soma recebido: só escreve o que vem em `parte` e `principal`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VincularOperacaoDialog } from '@/components/financeiro-v2/VincularOperacaoDialog';
import {
  fraseDaParcela, mensagemDeErro, textoDoAviso, FRASE_COLISAO_DE_UNICIDADE,
  type OperacaoCandidata, type RespostaCandidatas, type VinculoFeito,
} from '@/lib/oc/vincularLancamento';

const LANC = '84b11037-0e2a-4007-bf84-00397826cff4';
const OC = 'f74f95e5';
const semDuro = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');

/** A OC do Agnaldo depois do primeiro vínculo: o compromisso de 200.000 já está liquidado — o segundo recebimento cria item. */
const candidata: OperacaoCandidata = {
  operacao_id: OC, tipo_operacao: 'venda', numero_documento: null, status_comercial: 'fechada', versao: 14,
  data_operacao: '2026-08-25', data_referencia: '2026-08-25', distancia_dias: 6, fazenda_id: 'f1', fazenda_nome: 'Fazenda',
  mesma_fazenda: true, contraparte_id: 'c1', contraparte_nome: 'Comprador', valor_acordado: 294595,
  compromissos: [], acao_prevista: 'criar', tem_titulo_vivo_do_componente: true,
  valor_exato: false, competencia_nova: '2026-08-25', competencia_muda_de_mes: false, movimento_duplicado: null,
};
const candidatas: RespostaCandidatas = {
  elegivel: true,
  lancamento: { id: LANC, descricao: 'Venda 015 cabeças', valor: 94595, tipo_operacao: '1-Entradas',
    subcentro: 'Venda de Machos Adultos', data_competencia: '2026-08-31', data_pagamento: '2026-09-01',
    status_transacao: 'realizado', fazenda_nome: 'Fazenda', favorecido_nome: 'Comprador', conciliado: true,
    origem_lancamento: 'extrato', importado: false, movimentacao_rebanho_id: null },
  regra: { natureza: 'principal', componentes: ['principal'], tipos_oc: ['venda'] },
  componente_sugerido: null,
  candidatas: [candidata],
};
/** O envelope da simulação com a função nova (ensaio revertido no Agnaldo, 05/10). */
const simulacao = (o: Partial<VinculoFeito> = {}): VinculoFeito => ({
  ok: true, acao: 'simulado', simulado: true, operacao_versao: 14, titulos_vivos_do_compromisso: 1, conciliado: true,
  compromisso: { id: 'novo', acao: 'criado', valor_anterior: null, valor_total: 94595 },
  parcela: { id: 'p', acao: 'criada' },
  titulo_substituido: null,
  lancamento: { id: LANC, competencia_anterior: '2026-08-31', competencia_nova: '2026-08-25', hash_preservado: true, movimentacao_rebanho_id_solto: null },
  avisos: [],
  parte: { sequencia: 2, quantidade: 2, parcela_seguinte: true, descricao: 'Venda 055 B' },
  principal: { acordado: 294595, vinculado: 294595, recebido: 294595 },
  ...o,
});
function responder(simular: () => { data: unknown; error: unknown }) {
  rpc.mockImplementation(async (nome: string) => {
    if (nome === 'oc_candidatas_vinculo') return { data: candidatas, error: null };
    if (nome === 'oc_vincular_lancamento') return simular();
    return { data: null, error: null };
  });
}
/** Abre o modal e ESCOLHE a operação (a candidata não tem valor idêntico: não vem pré-selecionada). */
async function montar() {
  render(<VincularOperacaoDialog open lancamentoId={LANC} clienteId="agnaldo" onClose={vi.fn()} onVinculado={vi.fn()} />);
  await waitFor(() => expect(document.querySelector(`tr[data-oc="${OC}"]`)).not.toBeNull());
  const linha = document.querySelector(`tr[data-oc="${OC}"]`);
  if (!(linha instanceof HTMLElement)) throw new Error('linha da OC nao achada');
  fireEvent.click(linha);
}

beforeEach(() => { rpc.mockReset(); });

describe('a frase vem inteira da simulação', () => {
  it('o caso do Agnaldo: parcela 2 de 2 da Venda 055 B, e a OC com 294.595,00 recebidos de 294.595,00 acordados', () => {
    expect(semDuro(fraseDaParcela(simulacao())))
      .toBe('Entra como parcela 2 de 2 da Venda 055 B. A OC passa a ter R$ 294.595,00 recebidos de R$ 294.595,00 acordados.');
  });
  it('primeiro item do grupo (não é parcela seguinte): só a frase do principal', () => {
    const s = simulacao({ parte: { sequencia: 1, quantidade: 1, parcela_seguinte: false, descricao: 'Venda 055 B' },
      principal: { acordado: 294595, vinculado: 200000, recebido: 200000 } });
    expect(semDuro(fraseDaParcela(s))).toBe('A OC passa a ter R$ 200.000,00 recebidos de R$ 294.595,00 acordados.');
  });
  it('parte do principal ainda não recebida (título programado): diz o ligado e o já recebido', () => {
    const s = simulacao({ principal: { acordado: 294595, vinculado: 294595, recebido: 200000 } });
    expect(semDuro(fraseDaParcela(s)))
      .toBe('Entra como parcela 2 de 2 da Venda 055 B. A OC passa a ter R$ 294.595,00 ligados ao principal (R$ 200.000,00 já recebidos) de R$ 294.595,00 acordados.');
  });
  it('despesa (sem `principal`) que não é parcela seguinte, e a função ANTIGA (sem os campos): nenhuma frase', () => {
    expect(fraseDaParcela(simulacao({ parte: { sequencia: 1, quantidade: 1, parcela_seguinte: false, descricao: 'Frete' }, principal: null }))).toBeNull();
    expect(fraseDaParcela(simulacao({ parte: undefined, principal: undefined }))).toBeNull();
  });
  it('acima do acordado: o aviso diz quanto passa e que nada é bloqueado nem ajustado', () => {
    const a = textoDoAviso({ codigo: 'principal_excede_acordado', acordado: 294595, vinculado: 295595, excedente: 1000 });
    expect(a.tom).toBe('ambar');
    expect(semDuro(a.texto)).toBe('Com este lançamento a OC passa a ter R$ 295.595,00 ligados ao principal, R$ 1.000,00 acima dos R$ 294.595,00 acordados. '
      + 'O vínculo não é bloqueado nem ajustado: confira antes de confirmar.');
  });
});

describe('o painel "O que vai acontecer"', () => {
  it('com a simulação da função nova: a frase da parcela aparece, antes das linhas', async () => {
    responder(() => ({ data: simulacao(), error: null }));
    await montar();
    const frase = await screen.findByTestId('vinc-parcela');
    expect(semDuro(frase.textContent)).toBe('Entra como parcela 2 de 2 da Venda 055 B. A OC passa a ter R$ 294.595,00 recebidos de R$ 294.595,00 acordados.');
    const painel = screen.getByTestId('vinc-resumo');
    expect(painel.contains(frase)).toBe(true);
    /* as linhas de sempre continuam lá */
    expect(semDuro(painel.textContent)).toContain('criado · R$ 94.595,00');
    expect(screen.queryByTestId('vinc-resumo-erro')).toBeNull();
    /* a simulação foi pedida SEM compromisso: não há nenhum livre, e o banco cria o item */
    const chamada = rpc.mock.calls.find(c => c[0] === 'oc_vincular_lancamento');
    expect(chamada?.[1]).toMatchObject({ p_simular: true, p_compromisso_id: null, p_lancamento_id: LANC });
  });
  it('acima do acordado: o aviso aparece no painel e o botão de confirmar NÃO é bloqueado por ele', async () => {
    responder(() => ({ data: simulacao({
      parte: { sequencia: 3, quantidade: 3, parcela_seguinte: true, descricao: 'Venda 055 B' },
      principal: { acordado: 294595, vinculado: 295595, recebido: 295595 },
      avisos: [{ codigo: 'principal_excede_acordado', acordado: 294595, vinculado: 295595, excedente: 1000 }] }), error: null }));
    await montar();
    await screen.findByTestId('vinc-parcela');
    expect(document.querySelector('[data-aviso="principal_excede_acordado"]')).not.toBeNull();
  });
  it('se a simulação falhar, o painel NÃO fica vazio, e a colisão de unicidade nunca aparece crua', async () => {
    responder(() => ({ data: null, error: { message: 'duplicate key value violates unique constraint "zoo_operacao_partes_identidade_lote"' } }));
    await montar();
    const erro = await screen.findByTestId('vinc-resumo-erro');
    expect(erro.textContent).toBe(`Não foi possível calcular: ${FRASE_COLISAO_DE_UNICIDADE}`);
    expect(document.body.textContent).not.toContain('duplicate key');
    expect(document.body.textContent).not.toContain('zoo_operacao_partes_identidade_lote');
    expect(screen.queryByTestId('vinc-parcela')).toBeNull();
  });
  it('a frase em português que a função nova devolve na colisão chega inteira', async () => {
    const FRASE = 'A operação já tem um item ativo com o mesmo lote, componente e número de parcela. Nada foi gravado.';
    responder(() => ({ data: null, error: { message: FRASE } }));
    await montar();
    await waitFor(() => expect(screen.getByTestId('vinc-resumo-erro').textContent).toBe(`Não foi possível calcular: ${FRASE}`));
  });
});

describe('mensagemDeErro', () => {
  it('unicidade vira frase; o resto passa como veio; conflito de versão segue com a frase dele', () => {
    expect(mensagemDeErro({ message: 'duplicate key value violates unique constraint "x"' })).toBe(FRASE_COLISAO_DE_UNICIDADE);
    expect(mensagemDeErro({ message: 'Operacao cancelada nao aceita vinculo de lancamento' })).toBe('Operacao cancelada nao aceita vinculo de lancamento');
    expect(mensagemDeErro({ message: 'Conflito de versao (esperada 1, atual 2)' })).toContain('A operação mudou');
  });
});
