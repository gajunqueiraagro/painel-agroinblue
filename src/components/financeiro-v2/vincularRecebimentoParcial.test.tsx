/**
 * OC-VINCULAR-RECEBIMENTO-PARCIAL-01 — o que a TELA faz com a resposta do banco quando o recebimento é MENOR que a parcela.
 *
 * ⚠ A REGRA É DO BANCO (`oc_vincular_lancamento` / `oc_desvincular_lancamento`, migration 20261027193300, provada em
 *   `supabase/tests/oc_vincular_recebimento_parcial_01_test.sql`): o compromisso mantém o valor, o saldo segue numa parcela
 *   seguinte, e o desvincular devolve o valor ao saldo. Aqui se trava que a tela SÓ ESCREVE o que veio — não subtrai, não
 *   arredonda, não esconde diferença de tamanho nenhum (R$ 35,00 conta).
 * ⚠ A RPC É MOCKADA com os envelopes do ensaio revertido no cliente Teste (05/10/2026).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VincularOperacaoDialog } from '@/components/financeiro-v2/VincularOperacaoDialog';
import {
  fraseDoParcial, fraseDaParcela, resumoDoVinculo, textoDoAviso,
  type OperacaoCandidata, type RespostaCandidatas, type VinculoFeito,
} from '@/lib/oc/vincularLancamento';
import { resumoDoDesvinculo, type DesvinculoFeito } from '@/lib/oc/desvincularLancamento';
import { posicaoEntreVivas } from '@/components/compra/AbaCompromissosOC';

const LANC = 'l1';
const OC = 'oc-ensaio';
const semDuro = (t: string | null | undefined) => (t ?? '').replace(/[ ⁠]/g, ' ');

const candidata: OperacaoCandidata = {
  operacao_id: OC, tipo_operacao: 'venda', numero_documento: null, status_comercial: 'fechada', versao: 1,
  data_operacao: '2026-08-25', data_referencia: '2026-08-25', distancia_dias: 6, fazenda_id: 'f1', fazenda_nome: 'Fazenda',
  mesma_fazenda: true, contraparte_id: 'c1', contraparte_nome: 'Comprador', valor_acordado: 294595,
  compromissos: [], acao_prevista: 'criar', tem_titulo_vivo_do_componente: true,
  valor_exato: false, competencia_nova: '2026-08-25', competencia_muda_de_mes: false, movimento_duplicado: null,
};
const candidatas: RespostaCandidatas = {
  elegivel: true,
  lancamento: { id: LANC, descricao: 'PIX 1', valor: 200000, tipo_operacao: '1-Entradas',
    subcentro: 'Venda de Machos Adultos', data_competencia: '2026-09-01', data_pagamento: '2026-09-01',
    status_transacao: 'realizado', fazenda_nome: 'Fazenda', favorecido_nome: 'Comprador', conciliado: true,
    origem_lancamento: 'extrato', importado: false, movimentacao_rebanho_id: null },
  regra: { natureza: 'principal', componentes: ['principal'], tipos_oc: ['venda'] },
  componente_sugerido: null,
  candidatas: [candidata],
};
/** V1 do ensaio: 200.000 num compromisso de 294.595. */
const parcialVenda = (o: Partial<VinculoFeito> = {}): VinculoFeito => ({
  ok: true, acao: 'simulado', simulado: true, operacao_versao: 1, titulos_vivos_do_compromisso: 2, conciliado: true,
  compromisso: { id: 'c', acao: 'mantido', valor_anterior: 294595, valor_total: 294595 },
  parcela: { id: 'p', acao: 'parcial' },
  titulo_substituido: null,
  lancamento: { id: LANC, competencia_anterior: '2026-09-01', competencia_nova: '2026-08-25', hash_preservado: true, movimentacao_rebanho_id_solto: null },
  avisos: [],
  parte: { sequencia: 1, quantidade: 2, parcela_seguinte: false, descricao: 'Venda 055 B' },
  principal: { acordado: 294595, vinculado: 294595, recebido: 200000 },
  parcial: { lado: 'receber', recebido: 200000, de: 294595, saldo: 94595,
    parcela_saldo: { id: 'p2', sequencia: 2, quantidade: 2, vencimento: '2026-10-09', titulo_id: 't', titulo_valor_antes: 294595 } },
  ...o,
});
/** C1 do ensaio: os R$ 35,00. */
const parcialCompra = (): VinculoFeito => parcialVenda({
  compromisso: { id: 'c', acao: 'mantido', valor_anterior: 17435, valor_total: 17435 },
  principal: { acordado: 17435, vinculado: 17435, recebido: 17400 },
  parcial: { lado: 'pagar', recebido: 17400, de: 17435, saldo: 35,
    parcela_saldo: { id: 'p2', sequencia: 2, quantidade: 2, vencimento: '2026-10-09', titulo_id: 't', titulo_valor_antes: 17435 } },
});

function responder(sim: VinculoFeito) {
  rpc.mockImplementation(async (nome: string) => {
    if (nome === 'oc_candidatas_vinculo') return { data: candidatas, error: null };
    if (nome === 'oc_vincular_lancamento') return { data: sim, error: null };
    return { data: null, error: null };
  });
}
async function montar() {
  render(<VincularOperacaoDialog open lancamentoId={LANC} clienteId="teste" onClose={vi.fn()} onVinculado={vi.fn()} />);
  await waitFor(() => expect(document.querySelector(`tr[data-oc="${OC}"]`)).not.toBeNull());
  const linha = document.querySelector(`tr[data-oc="${OC}"]`);
  if (!(linha instanceof HTMLElement)) throw new Error('linha da OC nao achada');
  fireEvent.click(linha);
}

beforeEach(() => { rpc.mockReset(); });

describe('a frase do recebimento parcial vem inteira do banco', () => {
  it('venda: "Recebido 200.000 de 294.595. Fica saldo a receber de 94.595 nesta OC."', () => {
    expect(semDuro(fraseDoParcial(parcialVenda())))
      .toBe('Recebido R$ 200.000,00 de R$ 294.595,00. Fica saldo a receber de R$ 94.595,00 nesta OC.');
  });
  it('compra, os R$ 35,00: "Pago 17.400 de 17.435. Fica saldo a pagar de R$ 35,00" — a diferença pequena aparece inteira', () => {
    expect(semDuro(fraseDoParcial(parcialCompra())))
      .toBe('Pago R$ 17.400,00 de R$ 17.435,00. Fica saldo a pagar de R$ 35,00 nesta OC.');
  });
  it('o saldo escrito é o do banco, nunca uma conta da tela (a prova de que a busca sabe achar: saldo que não é de − recebido)', () => {
    const s = parcialVenda();
    if (!s.parcial) throw new Error('fixture sem parcial');
    const torto = { ...s, parcial: { ...s.parcial, saldo: 94000 } };
    expect(semDuro(fraseDoParcial(torto))).toContain('saldo a receber de R$ 94.000,00');
  });
  it('fora do parcial (ou com a função antiga), nenhuma frase', () => {
    expect(fraseDoParcial(parcialVenda({ parcial: null }))).toBeNull();
    expect(fraseDoParcial(parcialVenda({ parcial: undefined }))).toBeNull();
  });
});

describe('o resumo do vínculo parcial', () => {
  it('o compromisso é MANTIDO no valor cheio e o título FICA, reduzido ao saldo, com o vencimento', () => {
    const linhas = resumoDoVinculo(parcialVenda()).map(l => `${l.rotulo}: ${semDuro(l.valor)}`);
    expect(linhas[0]).toBe('Compromisso: mantido · R$ 294.595,00');
    expect(linhas[1]).toBe('Título da OC: fica · R$ 294.595,00 → R$ 94.595,00 · vence 09/10/2026');
    expect(linhas.join('|')).not.toMatch(/cancelad/);
  });
  it('parcela ainda sem título: o saldo é dito, sem inventar título', () => {
    const s = parcialVenda();
    if (!s.parcial) throw new Error('fixture sem parcial');
    const semTitulo = { ...s, parcial: { ...s.parcial, parcela_saldo: { ...s.parcial.parcela_saldo, titulo_id: null, titulo_valor_antes: null } } };
    expect(semDuro(resumoDoVinculo(semTitulo)[1].valor)).toBe('R$ 94.595,00 · parcela 2, sem título');
  });
});

describe('nada some em silêncio: os avisos novos', () => {
  it('recebido ACIMA do saldo: diz quanto a mais, o saldo e o que acontece com o compromisso — em vermelho', () => {
    const a = textoDoAviso({ codigo: 'recebido_acima_do_saldo', lado: 'receber', recebido: 300000, saldo: 204595, diferenca: 95405,
      compromisso_de: 294595, compromisso_para: 390000 });
    expect(a.tom).toBe('vermelho');
    expect(semDuro(a.texto)).toBe('Recebido R$ 95.405,00 a mais que o saldo (R$ 204.595,00). O compromisso passa de R$ 294.595,00 para R$ 390.000,00. '
      + 'A diferença não é ajustada sozinha: decida na OC o que ela é.');
  });
  it('na compra o verbo é "Pago"', () => {
    expect(textoDoAviso({ codigo: 'recebido_acima_do_saldo', lado: 'pagar', recebido: 10, saldo: 5, diferenca: 5, compromisso_de: 5, compromisso_para: 10 }).texto)
      .toMatch(/^Pago /);
  });
  it('compromisso reduzido (o caminho que sobra) também é dito', () => {
    expect(semDuro(textoDoAviso({ codigo: 'compromisso_reduzido', lado: 'pagar', diferenca: 35, compromisso_de: 17435, compromisso_para: 17400 }).texto))
      .toBe('O compromisso passa de R$ 17.435,00 para R$ 17.400,00 (diferença R$ 35,00). Confira antes de confirmar.');
  });
  it('mês fechado AVISA e diz que fica na auditoria — não bloqueia', () => {
    const a = textoDoAviso({ codigo: 'mes_fechado', mes: '2026-08' });
    expect(a.tom).toBe('ambar');
    expect(a.texto).toBe('O mês 08/2026 do rebanho está fechado. O vínculo não é bloqueado: fica registrado na auditoria da OC.');
  });
});

describe('o painel "O que vai acontecer"', () => {
  it('no parcial, a manchete é a frase do saldo (e não a da parcela), e o botão de confirmar existe', async () => {
    responder(parcialVenda());
    await montar();
    await waitFor(() => expect(screen.queryByTestId('vinc-parcial')).not.toBeNull());
    expect(semDuro(screen.getByTestId('vinc-parcial').textContent))
      .toBe('Recebido R$ 200.000,00 de R$ 294.595,00. Fica saldo a receber de R$ 94.595,00 nesta OC.');
    expect(screen.queryByTestId('vinc-parcela')).toBeNull();
  });
  it('fora do parcial, a frase da parcela continua (prova de que a troca é só no parcial)', async () => {
    responder(parcialVenda({ parcial: null, parte: { sequencia: 2, quantidade: 2, parcela_seguinte: true, descricao: 'Venda 055 B' },
      principal: { acordado: 294595, vinculado: 294595, recebido: 294595 } }));
    await montar();
    await waitFor(() => expect(screen.queryByTestId('vinc-parcela')).not.toBeNull());
    expect(screen.queryByTestId('vinc-parcial')).toBeNull();
    expect(fraseDaParcela(parcialVenda({ parcial: null }))).not.toBeNull();
  });
  it('o aviso de recebido a mais aparece no painel', async () => {
    responder(parcialVenda({ parcial: null, compromisso: { id: 'c', acao: 'ajustado', valor_anterior: 294595, valor_total: 390000 },
      avisos: [{ codigo: 'recebido_acima_do_saldo', lado: 'receber', recebido: 300000, saldo: 204595, diferenca: 95405, compromisso_de: 294595, compromisso_para: 390000 }] }));
    await montar();
    await waitFor(() => expect(document.body.textContent ?? '').toContain('a mais que o saldo'));
  });
});

describe('o gesto contrário: o resumo do desvincular', () => {
  const base: DesvinculoFeito = {
    ok: true, acao: 'simulado', simulado: true, operacao_id: OC, operacao_versao: 2, parte_id: 'pt',
    compromisso: { id: 'c', acao: 'mantido', componente: 'principal', descricao: 'Venda 055 B', valor_anterior: 294595, valor_total: 294595 },
    recebido: { de: 200000, para: 0 }, compromissos_total: { de: 294595, para: 294595 }, liquidacoes_estornadas: ['q'],
    lancamento: { id: LANC, valor: 200000, data_pagamento: '2026-09-01', status_transacao: 'realizado', conta_bancaria_id: null,
      origem_de: 'extrato', origem_para: 'extrato', era_da_oc: false, intacto: true },
    conciliacao: { vinculos_antes: 1, vinculos_depois: 1 },
    classificacao: { mudou: false,
      de: { plano_conta_id: 'x', subcentro: 'Venda de Machos Adultos', centro_custo: null, grupo_custo: null, macro_custo: null, escopo_negocio: null, fazenda_id: 'f1', fazenda_nome: 'Fazenda', safra_id: null, compoe_dre: true },
      para: { plano_conta_id: 'x', subcentro: 'Venda de Machos Adultos', centro_custo: null, grupo_custo: null, macro_custo: null, escopo_negocio: null, fazenda_id: 'f1', fazenda_nome: 'Fazenda', safra_id: null, compoe_dre: true } },
    devolucao_ao_saldo: { modo: 'restaurado', valor: 200000, saldo_de: 94595, saldo_para: 294595, titulo_id: 't' },
    parcelas_do_grupo: 1, lado: 'receber',
  };
  const linhas = (s: DesvinculoFeito) => resumoDoDesvinculo(s, 'OC de 25/08/2026').map(l => `${l.rotulo}: ${semDuro(l.valor)}`);

  it('vínculo parcial: o compromisso é MANTIDO e o valor volta ao saldo a receber', () => {
    const l = linhas(base);
    expect(l).toContain('Compromisso: Venda 055 B · R$ 294.595,00 — mantido');
    expect(l).toContain('Saldo a receber: R$ 94.595,00 → R$ 294.595,00');
    expect(l.join('|')).not.toMatch(/cancelado|→ R\$ 0,00\b.*Compromisso/);
  });
  it('compra: "Saldo a pagar"; sem título em aberto, diz "sem título"', () => {
    const l = linhas({ ...base, lado: 'pagar', devolucao_ao_saldo: { modo: 'volta_a_prevista', valor: 17400, saldo_de: 0, saldo_para: 17400, titulo_id: null } });
    expect(l).toContain('Saldo a pagar: R$ 0,00 → R$ 17.400,00 · sem título');
  });
  it('vínculo comum que tinha substituído o título: o título volta a ficar a receber e o compromisso é mantido', () => {
    const l = linhas({ ...base, devolucao_ao_saldo: { modo: 'titulo_restaurado', valor: 294595, saldo_de: 0, saldo_para: 294595, titulo_id: 't' } });
    expect(l).toContain('Compromisso: Venda 055 B · R$ 294.595,00 — mantido');
    expect(l).toContain('Título da OC: R$ 294.595,00 — volta a ficar a receber');
  });
  it('vínculo a mais desfeito: o compromisso VOLTA ao valor de antes (e a frase diz de quanto para quanto)', () => {
    const l = linhas({ ...base, lado: 'pagar', compromisso: { ...base.compromisso, acao: 'restaurado', valor_anterior: 18000, valor_total: 17435 },
      devolucao_ao_saldo: { modo: 'titulo_restaurado', valor: 17435, saldo_de: 0, saldo_para: 17435, titulo_id: 't' } });
    expect(l).toContain('Compromisso: Venda 055 B · R$ 18.000,00 → R$ 17.435,00 — volta ao valor de antes');
    expect(l).toContain('Título da OC: R$ 17.435,00 — volta a ficar a pagar');
  });
  it('compromisso em aberto: a parcela sai com o vínculo e o compromisso FICA (nunca "cancelado")', () => {
    const l = linhas({ ...base, devolucao_ao_saldo: { modo: 'parcela_removida', valor: 200000, saldo_de: null, saldo_para: null, titulo_id: null } });
    expect(l).toContain('Parcela: R$ 200.000,00 — sai com o vínculo; o compromisso fica em aberto');
    expect(l.join('|')).not.toContain('cancelado');
  });
  it('fora do parcial (função antiga ou vínculo comum) nada muda: cancelado e reduzido como sempre, sem linha de saldo', () => {
    const cancel = linhas({ ...base, devolucao_ao_saldo: null, compromisso: { ...base.compromisso, acao: 'cancelado', valor_total: 0 } });
    expect(cancel).toContain('Compromisso: Venda 055 B · R$ 294.595,00 — cancelado');
    expect(cancel.join('|')).not.toContain('Saldo a');
    const red = linhas({ ...base, devolucao_ao_saldo: undefined, compromisso: { ...base.compromisso, acao: 'reduzido', valor_total: 50000 } });
    expect(red).toContain('Compromisso: Venda 055 B · R$ 294.595,00 → R$ 50.000,00');
  });
});

describe('a aba Financeiro da OC só desenha o que a view e o banco dizem (lido da FONTE: a aba não se monta em teste)', () => {
  const aba = readFileSync(resolve(__dirname, '../compra/AbaCompromissosOC.tsx'), 'utf8');
  const financeiro = readFileSync(resolve(__dirname, '../compra/AbaFinanceiroOC.tsx'), 'utf8');
  const cartoes = aba.slice(aba.indexOf('data-testid="cartoes-do-lado"'), aba.indexOf('data-testid="cartoes-do-lado"') + 2600);

  it('a prova de que a busca sabe achar: o bloco dos cartões existe e a aba recebe a linha da view', () => {
    expect(cartoes.length).toBeGreaterThan(1000);
    expect(financeiro).toContain('liquidacao={api.resumo}');
  });
  it('Negociado, Recebido e A receber são COLUNAS DA VIEW — nenhuma subtração no bloco', () => {
    expect(cartoes).toContain('liquidacao.base');
    expect(cartoes).toContain('liquidacao.totalLiquidadoValido');
    expect(cartoes).toContain('liquidacao.saldoOperacao');
    expect(cartoes).not.toMatch(/liquidacao\.\w+\s*-\s*liquidacao\.\w+/);
    expect(cartoes).not.toMatch(/entradaObrigacao\s*-\s*/);
  });
  it('"confere" só sai do estado \'quitada\' da view; com saldo, "falta receber" / "falta pagar"', () => {
    const sit = aba.slice(aba.indexOf('const situacaoDoLado'), aba.indexOf('const parcelasDoLado'));
    expect(sit).toMatch(/e === 'quitada'\) return \{ texto: 'confere'/);
    expect(sit.match(/'confere'/g)?.length).toBe(1);
    expect(sit).toMatch(/'parcial' \|\| e === 'nao_liquidada'\) return \{ texto: temEntradas \? 'falta receber' : 'falta pagar'/);
  });
  it('a linha do saldo (previsto ou programado) oferece "Vincular recebimento/pagamento", pela MESMA busca e pelo MESMO vincular', () => {
    expect(aba).toMatch(/est\.label === 'Previsto' \|\| est\.label === 'Programado'\) && \(\(\) => \{/);
    expect(aba).toContain("{lado === 'receber' ? 'Vincular recebimento' : 'Vincular pagamento'}");
    expect(aba).toMatch(/<BuscarDespesaOCDialog[^>]*subcentros=\{buscarSaldo\.subcentros\}[\s\S]{0,200}onEscolher=\{id => \{ setBuscarSaldo\(null\); setVincularDespesaId\(id\); \}\}/);
    expect(aba.match(/<VincularOperacaoDialog /g)?.length).toBe(1);
  });
  it('a tabela diz a POSIÇÃO entre as vivas ("1/2, 2/2"), não a sequência gravada ("2/3, 3/3")', () => {
    const comBuraco = [
      { parcelaId: 'a', sequencia: 1, status: 'cancelada' }, { parcelaId: 'b', sequencia: 2, status: 'materializada' },
      { parcelaId: 'c', sequencia: 3, status: 'prevista' },
    ];
    expect(posicaoEntreVivas(comBuraco, comBuraco[1])).toBe('1/2');
    expect(posicaoEntreVivas(comBuraco, comBuraco[2])).toBe('2/2');
    const semBuraco = [{ parcelaId: 'a', sequencia: 1, status: 'paga' }, { parcelaId: 'b', sequencia: 2, status: 'materializada' }];
    expect(semBuraco.map(p => posicaoEntreVivas(semBuraco, p))).toEqual(['1/2', '2/2']);
    expect(aba).toContain("{p.status === 'cancelada' ? p.sequencia : posicaoEntreVivas(parcelasDoComp, p)}");
  });
  it('o resumo lateral não chama de "Saldo" o líquido do nível (venda) nem o que falta pagar (compra)', () => {
    const venda = readFileSync(resolve(__dirname, '../venda/VendaModalShell.tsx'), 'utf8');
    const compra = readFileSync(resolve(__dirname, '../compra/ResumoLateralOC.tsx'), 'utf8');
    expect(venda).toContain("rotulo={finNivel ? `Líquido ${finNivel}` : 'Líquido'}");
    expect(venda).not.toContain('<LinhaResumo rotulo="Saldo"');
    expect(compra).toContain('<LinhaResumo rotulo="A pagar"');
    expect(compra).not.toContain('<LinhaResumo rotulo="Saldo"');
  });
});
