/**
 * CONC-PAINEL-CONTA-01 (fatia 1) → CONC-PAINEL-02 (mock aprovado 23/11 08:11) — o painel da conta no mês. Dado SINTÉTICO (o VGBL de set/26
 * da FASE 0 com nomes inventados: −661,69 e o previsto sem conta do mesmo valor).
 * Prova: os passos POR TIPO saem do DONO; os ARQUIVOS DO MÊS mostram o comprovante (o chip) e as importações; Ver/Baixar/Desfazer; a
 * diferença procura 1º o lançamento que já existe com o valor exato e "Casar" abre o modal do lançamento JÁ com a conta, o realizado e a
 * data; o rodapé leva à próxima pendente; o fechar devolve a conta mostrada; a largura e as alturas são fixas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  candidatosDaDiferenca, fimDoMes, fonteDaConta, passoInicial, passosDoPainel, seloDosPassos, tipoDoPainel, vizinhasPendentes,
  type LancamentoCandidato,
} from '@/lib/conciliacao/painelDaConta';
import type { LinhaResumo, StatusDono } from '@/lib/conciliacao/resumoDoDono';
import type { ComprovanteDoMes } from '@/lib/conciliacao/arquivosDoMes';

const NIVEL_CONTA: LinhaResumo['nivel'] = 'conta';
const NAO_CONCILIADO: StatusDono = 'nao_conciliado';

const banco = vi.hoisted(() => {
  const importacoes: Record<string, unknown>[] = [];
  const lancamentos: Record<string, unknown>[] = [];
  const movimentos: Record<string, unknown>[] = [];
  const motor = new Map<string, unknown>();
  return { ligada: false, importacoes, lancamentos, movimentos, motor, chamadasDoMotor: 0 };
});
const espias = vi.hoisted(() => ({
  cancelar: vi.fn(async () => ({ ok: true, erro: null })),
  anexar: vi.fn(async () => ({ ok: true, erro: null })),
  obs: vi.fn(async () => null),
  baixar: vi.fn(async () => true),
  buscar: vi.fn(async (id: string) => ({ id, descricao: 'Ajuste previsto', valor: 661.69, conta_bancaria_id: null, status_transacao: 'previsto', data_pagamento: null })),
}));
vi.mock('@/integrations/supabase/client', () => {
  const consulta = (dados: () => unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'is', 'in', 'gte', 'lte', 'lt']) q[m] = () => q;
    q.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: dados(), error: null }).then(ok);
    return q;
  };
  return { supabase: { from: (t: string) => consulta(() => (t === 'openfinance_contas_permitidas' ? (banco.ligada ? [{ id: 'p1' }] : []) : [])) } };
});
vi.mock('@/hooks/useExtratoDaConta', async (orig) => {
  const real = await orig<typeof import('@/hooks/useExtratoDaConta')>();
  return {
    ...real,
    useImportacoesDaConta: () => ({ importacoes: banco.importacoes, loading: false, recarregar: vi.fn() }),
    cancelarSaldoDocumento: espias.cancelar, anexarSaldoDocumento: espias.anexar, urlAssinadaSaldoDocumento: async () => 'blob:foto',
  };
});
vi.mock('@/hooks/useArquivosDoMes', () => ({
  lerLancamentosDeValor: async () => banco.lancamentos,
  lerMovimentosDaImportacao: async () => [{ id: 'm1', data: '2031-09-03', descricao: 'PIX RECEBIDO EXEMPLO', valor: 1500 }, { id: 'm2', data: '2031-09-05', descricao: 'TARIFA', valor: -12.5 }],
  bytesDoComprovante: async () => new ArrayBuffer(8),
  baixarComprovante: espias.baixar,
  gravarObservacaoDoMes: espias.obs,
  lerObservacaoDoMes: async () => null,
}));
vi.mock('@/hooks/useConciliacaoDoMes', () => ({
  useConciliacaoDoMes: () => ({ movimentos: banco.movimentos, loading: false, recarregar: vi.fn() }),
}));
vi.mock('@/lib/conciliacao/loteDeSugestoes', () => ({
  buscarSugestoesDoMes: async (_c: string, ids: string[]) => { banco.chamadasDoMotor += 1; return new Map(ids.map((id) => [id, banco.motor.get(id) ?? { ok: true, sugestao: { balde: 'sem', candidato: null, empate: false } }])); },
}));
vi.mock('@/components/conciliacao/EstacaoConciliar', () => ({ EstacaoConciliar: ({ movimento }: { movimento: { id: string } }) => <div data-testid="stub-estacao">{movimento.id}</div> }));
vi.mock('@/components/conciliacao/PalcoDoMes', () => ({ PalcoDoMes: ({ contaId }: { contaId: string }) => <div data-testid="stub-palco">{contaId}</div> }));
vi.mock('@/components/conciliacao/ExtratoDoSistemaDialog', () => ({ ExtratoDoSistemaDialog: () => <div data-testid="stub-sistema" /> }));
vi.mock('@/components/conciliacao/DesfazerArquivoModal', () => ({
  DesfazerArquivoModal: ({ alvo }: { alvo: { nome_arquivo: string | null } }) => <div data-testid="stub-desfazer-arquivo">{alvo.nome_arquivo}</div> }));
vi.mock('@/components/financeiro-v2/VisualizadorDeDocumento', () => ({
  VisualizadorDeDocumento: ({ nome, embutido }: { nome: string; embutido?: boolean }) => <div data-testid="stub-visualizador" data-embutido={embutido ? 'sim' : 'nao'}>{nome}</div> }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({
  LancamentoV2Dialog: ({ open, lancamento }: { open: boolean; lancamento: Record<string, unknown> | null }) => (open && lancamento
    ? <div data-testid="stub-lancamento">{`${lancamento.id}|${lancamento.conta_bancaria_id}|${lancamento.status_transacao}|${lancamento.data_pagamento}`}</div> : null) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({
  useFinanceiroV2: () => ({ loadContas: vi.fn(), loadClassificacoes: vi.fn(), loadFornecedores: vi.fn(), loadSafras: vi.fn(), buscarLancamentoPorId: espias.buscar,
    contasBancarias: [{ id: 'x' }], classificacoes: [{ id: 'x' }], fornecedores: [], safras: [], criarFornecedor: vi.fn(), editarLancamento: vi.fn() }),
  notificarLancamentosMudaram: vi.fn(),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
import { PainelDaConta, type PainelDaContaProps } from './PainelDaConta';

const LINHA = (o: { tem: boolean; banco: number; sistema: number; extrato: number | null; dif: number | null; tipo?: string; sis?: number }) => {
  const sis = o.sis ?? 1000;
  return {
    nivel: NIVEL_CONTA, conta_id: 'c1', conta_nome: 'Banco Exemplo', tipo_conta: o.tipo ?? 'cc', consolida_em_conta_id: null, tem_extrato: o.tem,
    saldo_inicial: 742262.7, saldo_inicial_origem: null, entradas: 0, saidas: 500072.93, entradas_terceiros: 0, entradas_transferencias: 0, saidas_terceiros: 0,
    saidas_transferencias: 500072.93, saldo_sistema: sis, saldo_extrato: o.extrato, saldo_extrato_data: '2031-09-30', diferenca: o.dif,
    diferenca_entradas: 0, diferenca_saidas: 0, banco: { entradas: 0, saidas: 0 }, extratos_sem_par: { qtde: o.banco, valor: 0 },
    lancamentos_sem_par: { qtde: o.sistema, valor: 0 }, retido_em_depositos: { qtde: 0, valor: 0 }, status: NAO_CONCILIADO,
    motivos: [], avisos: [], posicao: null, sem_conta: null, linhas_sistema: null, internas: [], par_conta_id: null, par_status: null,
    /* a conta lê os números PRÓPRIOS (`saldosDaLinha` → `proprio`) */
    proprio: { saldo_inicial: 742262.7, entradas: 0, saidas: 500072.93, saldo_sistema: sis, saldo_extrato: o.extrato, diferenca: o.dif,
      entradas_terceiros: 0, entradas_transferencias: 0, saidas_terceiros: 0, saidas_transferencias: 500072.93 },
  };
};
const saldos = (extrato: number | null, dif: number | null) => ({ saldo_extrato: extrato, saldo_sistema: 1000, diferenca: dif });
const SEM_OF = fonteDaConta(false, null);

describe('as regras (puras)', () => {
  it('o tipo do cadastro escolhe o jeito de fechar: inv → investimento, cartao → cartão, o resto → corrente', () => {
    expect(['inv', 'Investimento', 'cartao', 'cc', null, 'xyz'].map(tipoDoPainel)).toEqual(['investimento', 'investimento', 'cartao', 'corrente', 'corrente', 'corrente']);
  });
  it('CORRENTE: extrato → casar → saldo, pelo dono', () => {
    const p = passosDoPainel('corrente', LINHA({ tem: true, banco: 3, sistema: 1, extrato: 998.5, dif: -1.5 }), saldos(998.5, -1.5), { arquivos: 2, fonte: SEM_OF });
    expect(p.map((x) => [x.id, x.estado, x.valor])).toEqual([['extrato', 'ok', '2 arquivos'], ['casar', 'pendente', '4'], ['saldo', 'pendente', '998,50']]);
    expect(p[1].frase).toBe('3 só no banco · 1 só no sistema');
    expect(p[0].frase).toBe('extrato do mês até 30/09/2031');
    expect(passoInicial(p)).toBe('casar');
    const semExtrato = passosDoPainel('corrente', LINHA({ tem: false, banco: 0, sistema: 0, extrato: null, dif: null }), saldos(null, null), { arquivos: 0, fonte: SEM_OF });
    expect(semExtrato.map((x) => x.estado)).toEqual(['pendente', 'espera', 'pendente']);
  });
  it('INVESTIMENTO (o VGBL): saldo do banco ✓ → movimentos ✓ → explicar a diferença PENDENTE com −661,69 em vermelho', () => {
    const p = passosDoPainel('investimento', LINHA({ tem: false, banco: 0, sistema: 0, extrato: 241528.08, dif: -661.69, tipo: 'inv' }), saldos(241528.08, -661.69), { arquivos: 1, fonte: SEM_OF });
    expect(p.map((x) => [x.id, x.estado])).toEqual([['saldo', 'ok'], ['movimentos', 'ok'], ['diferenca', 'pendente']]);
    expect([p[2].valor, p[2].negativo, p[2].frase]).toEqual(['-661,69', true, 'rendimento, taxa ou IR do mês?']);
    expect(p[1].valor).toBe('-500.072,93');
    expect(passoInicial(p)).toBe('diferenca');
    expect(seloDosPassos(p)).toEqual({ ok: false, texto: '✕ 1 passo pendente' });
    const fechado = passosDoPainel('investimento', LINHA({ tem: false, banco: 0, sistema: 0, extrato: 1000, dif: 0, tipo: 'inv' }), saldos(1000, 0), { arquivos: 1, fonte: SEM_OF });
    expect(seloDosPassos(fechado)).toEqual({ ok: true, texto: '✓ conciliado' });
    const semSaldo = passosDoPainel('investimento', LINHA({ tem: false, banco: 0, sistema: 0, extrato: null, dif: null, tipo: 'inv' }), saldos(null, null), { arquivos: 0, fonte: SEM_OF });
    expect(semSaldo.map((x) => x.estado)).toEqual(['pendente', 'ok', 'espera']);
  });
  it('CARTÃO: fatura (o arquivo do mês) → compras → pagamento (a diferença)', () => {
    const p = passosDoPainel('cartao', LINHA({ tem: false, banco: 0, sistema: 0, extrato: 0, dif: 0, tipo: 'cartao' }), saldos(0, 0), { arquivos: 1, fonte: SEM_OF });
    expect(p.map((x) => [x.id, x.estado])).toEqual([['fatura', 'ok'], ['compras', 'ok'], ['pagamento', 'ok']]);
    const semFatura = passosDoPainel('cartao', LINHA({ tem: false, banco: 0, sistema: 0, extrato: null, dif: null, tipo: 'cartao' }), saldos(null, null), { arquivos: 0, fonte: SEM_OF });
    expect(semFatura[0].estado).toBe('pendente');
  });
  it('a "Próxima pendente": só as não conciliadas, na ordem da tela, circular; a atual fechada segue para a próxima', () => {
    const ordem = [{ id: 'a', pendente: true }, { id: 'b', pendente: false }, { id: 'c', pendente: true }, { id: 'd', pendente: true }];
    expect(vizinhasPendentes(ordem, 'c')).toEqual({ anterior: 'a', proxima: 'd', posicao: 2, total: 3 });
    expect(vizinhasPendentes(ordem, 'd')).toEqual({ anterior: 'c', proxima: 'a', posicao: 3, total: 3 });
    expect(vizinhasPendentes(ordem, 'b')).toEqual({ anterior: 'a', proxima: 'c', posicao: null, total: 3 });
    expect(vizinhasPendentes([{ id: 'a', pendente: true }], 'a')).toEqual({ anterior: null, proxima: null, posicao: 1, total: 1 });
  });
  it('"Explicar a diferença": o valor EXATO, no sentido certo, sem conta ou nesta conta, e que ainda não conta no saldo do mês', () => {
    const L = (o: Partial<LancamentoCandidato> & { id: string }): LancamentoCandidato => ({ descricao: 'x', valor: 661.69, tipo_operacao: '2-Saídas',
      status_transacao: 'previsto', conta_bancaria_id: null, data_pagamento: null, data_vencimento: '2031-09-30', ...o });
    const linhas = [
      L({ id: 'previsto-sem-conta' }),                                                                       // ✓ o achado do VGBL
      L({ id: 'entrada', tipo_operacao: '1-Entradas' }),                                                     // ✗ sentido
      L({ id: 'outra-conta', conta_bancaria_id: 'cc' }),                                                     // ✗ outra conta
      L({ id: 'ja-conta', conta_bancaria_id: 'vgbl', status_transacao: 'realizado', data_pagamento: '2031-09-30' }), // ✗ já está no sistema
      L({ id: 'depois', conta_bancaria_id: 'vgbl', status_transacao: 'realizado', data_pagamento: '2031-10-05', data_vencimento: '2031-10-05' }), // ✓ pago depois
      L({ id: 'centavo', valor: 661.7 }),                                                                    // ✗ um centavo
      L({ id: 'longe', data_vencimento: '2031-03-01' }),                                                     // ✓ mais longe, vai por último
    ];
    expect(candidatosDaDiferenca(linhas, { diferenca: -661.69, contaId: 'vgbl', anoMes: '2031-09' }).map((x) => x.id)).toEqual(['previsto-sem-conta', 'depois', 'longe']);
    expect(candidatosDaDiferenca(linhas, { diferenca: 661.69, contaId: 'vgbl', anoMes: '2031-09' }).map((x) => x.id)).toEqual(['entrada']);
    expect(candidatosDaDiferenca(linhas, { diferenca: 0.004, contaId: 'vgbl', anoMes: '2031-09' })).toEqual([]);
    expect([fimDoMes('2031-09'), fimDoMes('2032-02'), fimDoMes('2031-12')]).toEqual(['2031-09-30', '2032-02-29', '2031-12-31']);
  });
  it('a fonte derivada: Open Finance ligada > último arquivo > sem extrato', () => {
    expect(fonteDaConta(true, { tipo_arquivo: 'OFX', saldo_declarado_data: '2026-11-13', data_importacao: null }).rotulo).toBe('Open Finance');
    expect(fonteDaConta(false, { tipo_arquivo: 'ofx', saldo_declarado_data: '2026-11-13', data_importacao: null }).rotulo).toBe('OFX até 13/11/2026');
    expect(fonteDaConta(false, null).tipo).toBe('sem_extrato');
  });
});

const COMPROVANTE: ComprovanteDoMes = { id: 'd1', contaId: 'c1', anoMes: '2031-09', nome: 'Saldo Previdência Exemplo 3009.pdf', tipo: 'application/pdf',
  caminho: 'cli/saldos/c1/2031-09/d1.pdf', enviadoEm: '2031-10-10T12:00:00Z' };
const IMPORTACAO = { id: 'i1', nomeArquivo: 'extrato-set.ofx', data: '2031-10-02', importados: 2, comVinculo: 0, crus: 0, substituidos: 0, desfeitaEm: null,
  meses: ['2031-09'], canceladaNoRegistro: false, tipoArquivo: 'OFX', saldoDeclaradoData: '2031-09-30' };

describe('o painel (componente)', () => {
  beforeEach(() => { banco.importacoes = []; banco.lancamentos = []; banco.movimentos = []; banco.motor.clear(); banco.chamadasDoMotor = 0; banco.ligada = false; vi.clearAllMocks(); });
  const montar = (o: Partial<PainelDaContaProps> = {}) => {
    const props: PainelDaContaProps = {
      aberto: true, aoFechar: vi.fn(), clienteId: 'cli', conta: { id: 'c1', nome: 'Previdência Exemplo', tipoConta: 'inv' },
      linha: LINHA({ tem: false, banco: 0, sistema: 0, extrato: 241528.08, dif: -661.69, tipo: 'inv', sis: 242189.77 }), anoMes: '2031-09',
      comprovantes: [COMPROVANTE], aoMudarArquivos: vi.fn(),
      ordem: [{ id: 'c0', nome: 'Banco Exemplo', pendente: true }, { id: 'c1', nome: 'Previdência Exemplo', pendente: true }, { id: 'c2', nome: 'Cartão Exemplo', pendente: true }],
      aoTrocarConta: vi.fn(), aoImportar: vi.fn(), aoCasar: vi.fn(), aoInformarSaldo: vi.fn(), ...o,
    };
    render(<PainelDaConta {...props} />);
    return props;
  };

  it('o bug da FASE 0: conta SEM importação e com o comprovante do mês — o painel MOSTRA o arquivo (era "Nenhum arquivo importado")', async () => {
    montar();
    const arq = await screen.findByTestId('painel-arquivo');
    expect(arq.getAttribute('data-origem')).toBe('comprovante');
    expect(within(arq).getByTestId('painel-arquivo-nome').textContent).toBe('Saldo Previdência Exemplo 3009.pdf');
    expect(screen.queryByTestId('painel-sem-arquivos')).toBeNull();
  });

  it('investimento: os 3 passos do tipo, o selo e a diferença no topo; abre no "Explicar a diferença" com o previsto sem conta de valor exato', async () => {
    banco.lancamentos = [{ id: 'l1', descricao: 'Ajuste previsto', valor: 661.69, tipo_operacao: '2-Saídas', status_transacao: 'previsto', conta_bancaria_id: null,
      data_pagamento: null, data_vencimento: '2031-09-30' }];
    montar();
    expect(screen.getByTestId('painel-da-conta').getAttribute('data-tipo')).toBe('investimento');
    expect(screen.getByTestId('painel-passo-diferenca').getAttribute('data-estado')).toBe('pendente');
    expect(screen.getByTestId('painel-passo-diferenca-valor').textContent).toBe('-661,69');
    expect(screen.getByTestId('painel-selo').textContent).toBe('✕ 1 passo pendente');
    expect(screen.getByTestId('painel-diferenca').textContent).toBe('-661,69');
    expect(screen.getByTestId('painel-trabalho-diferenca')).toBeTruthy();
    const c = await screen.findByTestId('painel-candidato');
    expect(c.textContent).toContain('sem conta');
    /* "Casar" = o modal do lançamento de sempre, JÁ com esta conta, realizado e a data do saldo (nada gravado antes do Salvar dele) */
    fireEvent.click(within(c).getByTestId('painel-candidato-casar'));
    expect((await screen.findByTestId('stub-lancamento')).textContent).toBe('l1|c1|realizado|2031-09-30');
  });

  it('sem lançamento de valor exato: diz que não há; "pendente com observação" grava pela observação do mês', async () => {
    montar();
    expect((await screen.findByTestId('painel-sem-candidato')).textContent).toContain('661,69');
    fireEvent.change(screen.getByTestId('painel-obs'), { target: { value: 'rendimento negativo, conferir o PDF' } });
    fireEvent.click(screen.getByTestId('painel-obs-gravar'));
    await waitFor(() => expect(espias.obs).toHaveBeenCalledWith({ clienteId: 'cli', contaId: 'c1', anoMes: '2031-09', texto: 'rendimento negativo, conferir o PDF' }));
    expect((await screen.findByTestId('painel-obs-frase')).textContent).toBe('Observação gravada.');
  });

  it('Ver o comprovante: o visualizador EMBUTIDO dentro do painel; Desfazer pede o motivo e CANCELA (não apaga)', async () => {
    const p = montar();
    fireEvent.click(await screen.findByTestId('painel-arquivo-ver'));
    expect((await screen.findByTestId('stub-visualizador')).getAttribute('data-embutido')).toBe('sim');
    fireEvent.click(screen.getByTestId('painel-ver-desfazer'));
    const confirmar = await screen.findByTestId('painel-desfazer-confirmar');
    expect(confirmar.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByTestId('painel-desfazer-motivo'), { target: { value: 'anexado na conta errada' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(espias.cancelar).toHaveBeenCalledWith({ documentoId: 'd1', clienteId: 'cli', motivo: 'anexado na conta errada' }));
    await waitFor(() => expect(p.aoMudarArquivos).toHaveBeenCalled());
  });

  it('a importação do mês: Ver = os movimentos que ela trouxe; Baixar apagado (o original não é guardado); Desfazer = o modal de sempre', async () => {
    banco.importacoes = [IMPORTACAO, { ...IMPORTACAO, id: 'i2', nomeArquivo: 'agosto.ofx', meses: ['2031-08'] }];
    montar({ comprovantes: [] });
    const cartoes = await screen.findAllByTestId('painel-arquivo');
    expect(cartoes.map((c) => within(c).getByTestId('painel-arquivo-nome').textContent)).toEqual(['extrato-set.ofx']); // só o do mês
    expect(within(cartoes[0]).getByTestId('painel-arquivo-baixar').hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(cartoes[0]).getByTestId('painel-arquivo-ver'));
    expect((await screen.findByTestId('painel-ver-movimentos')).textContent).toContain('PIX RECEBIDO EXEMPLO');
    expect(within(cartoes[0]).getByTestId('painel-arquivo-baixar').getAttribute('title')).toBe('o arquivo original não foi guardado');
    expect(screen.getByTestId('painel-ver-original').textContent).toContain('O arquivo original não foi guardado.');
    fireEvent.click(within(cartoes[0]).getByTestId('painel-arquivo-desfazer'));
    expect((await screen.findByTestId('stub-desfazer-arquivo')).textContent).toBe('extrato-set.ofx');
  });

  it('a importação NOVA (lote 115620): o original guardado — Baixar aceso e baixa pelo caminho do bucket', async () => {
    banco.importacoes = [{ ...IMPORTACAO, arquivoCaminho: 'cli/importacoes/c1/i1.ofx' }];
    montar({ comprovantes: [] });
    const [c] = await screen.findAllByTestId('painel-arquivo');
    const baixar = within(c).getByTestId('painel-arquivo-baixar');
    expect(baixar.hasAttribute('disabled')).toBe(false);
    fireEvent.click(baixar);
    expect(espias.baixar).toHaveBeenCalledWith('cli/importacoes/c1/i1.ofx', 'extrato-set.ofx');
    fireEvent.click(within(c).getByTestId('painel-arquivo-ver'));
    expect((await screen.findByTestId('painel-ver-original')).textContent).toContain('O original está guardado');
  });

  it('conta corrente: extrato → casar → saldo; "Casar os exatos" abre o lote do mês POR CIMA; "Conferência" leva à de hoje', async () => {
    const p = montar({ conta: { id: 'c1', nome: 'Banco Exemplo', tipoConta: 'cc' }, linha: LINHA({ tem: true, banco: 3, sistema: 1, extrato: 998.5, dif: -1.5 }), comprovantes: [] });
    expect(screen.getByTestId('painel-passo-casar').getAttribute('data-estado')).toBe('pendente');
    expect(screen.getByTestId('painel-trabalho-casar')).toBeTruthy();
    fireEvent.click(screen.getByTestId('painel-casar-exatos'));
    expect((await screen.findByTestId('stub-palco')).textContent).toBe('c1');
    fireEvent.click(screen.getByTestId('painel-casar'));
    expect(p.aoCasar).toHaveBeenCalledWith('c1');
    fireEvent.click(screen.getByTestId('painel-passo-saldo'));
    expect(screen.getByTestId('painel-saldo-Diferença').textContent).toBe('-1,50');
    fireEvent.click(screen.getByTestId('painel-informar-saldo'));
    expect(p.aoInformarSaldo).toHaveBeenCalledWith('c1');
  });

  it('Open Finance ligada: o passo do extrato diz "Buscar do banco"', async () => {
    banco.ligada = true;
    montar({ conta: { id: 'c1', nome: 'Banco Exemplo', tipoConta: 'cc' }, linha: LINHA({ tem: false, banco: 0, sistema: 0, extrato: null, dif: null }), comprovantes: [] });
    await waitFor(() => expect(screen.getByTestId('painel-importar').textContent).toBe('Buscar do banco'));
    expect(screen.getByTestId('painel-fonte').textContent).toContain('Open Finance');
  });

  it('arrastar: o PDF vira comprovante do mês com prévia (nada grava antes do "Anexar"); o OFX vai à prévia do Importar banco', async () => {
    const p = montar();
    const input = screen.getByTestId('painel-arrastar').querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('sem input');
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'saldo-out.pdf', { type: 'application/pdf' })] } });
    await screen.findByTestId('painel-soltou');
    expect(espias.anexar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('painel-soltou-anexar'));
    await waitFor(() => expect(espias.anexar).toHaveBeenCalled());
    await waitFor(() => expect(p.aoMudarArquivos).toHaveBeenCalled());
    fireEvent.change(input, { target: { files: [new File(['OFXHEADER'], 'set.ofx', { type: '' })] } });
    fireEvent.click(await screen.findByTestId('painel-soltou-importar'));
    expect(p.aoImportar).toHaveBeenCalledWith('c1', expect.any(File));
  });

  it('o rodapé: ← anterior · conta i de N · Próxima pendente →; o fechar devolve a conta mostrada (volta à linha)', async () => {
    const p = montar();
    expect(screen.getByTestId('painel-contador').textContent).toBe('conta 2 de 3 pendentes · fechar volta à linha');
    fireEvent.click(screen.getByTestId('painel-proxima'));
    expect(p.aoTrocarConta).toHaveBeenCalledWith('c2');
    fireEvent.click(screen.getByTestId('painel-anterior'));
    expect(p.aoTrocarConta).toHaveBeenCalledWith('c0');
    fireEvent.keyDown(screen.getByTestId('painel-da-conta'), { key: 'Escape' });
    await waitFor(() => expect(p.aoFechar).toHaveBeenCalledWith('c1'));
  });

  /* CONC-PAINEL-02 ajuste (Gabriel 23/11 17:09, print do NJ BB out/26 com 10 arquivos: a faixa virava rolagem lateral infinita) */
  const DEZ = Array.from({ length: 9 }, (_, i) => ({ ...IMPORTACAO, id: `o${i + 1}`, nomeArquivo: `extrato-${String(i + 1).padStart(2, '0')}.ofx`,
    data: `2031-10-${String(i + 2).padStart(2, '0')}`, importados: 10 + i, periodoDe: '2031-09-01', periodoAte: `2031-09-${String(i + 1).padStart(2, '0')}`,
    saldoDeclarado: 1000 - i * 100 }));

  it('A1 até 2 arquivos = os cartões; 3 ou mais = UM cartão de resumo ("10 arquivos · OFX 9 · PDF 1"), NUNCA rolagem lateral', async () => {
    banco.importacoes = DEZ;
    montar();
    expect((await screen.findByTestId('painel-arquivos-resumo-total')).textContent).toBe('10 arquivos');
    expect(screen.getByTestId('painel-arquivos-resumo-formatos').textContent).toBe('OFX 9 · PDF 1');
    expect(screen.queryAllByTestId('painel-arquivo')).toHaveLength(0);
    const faixa = screen.getByTestId('painel-arquivos-faixa');
    expect(faixa.className).toContain('overflow-hidden');
    expect(faixa.className).not.toContain('overflow-x-auto');
  });

  it('A2 o resumo abre a LISTA à direita (investimento: sem passo "Extrato"); colunas fixas; Ver abre no mesmo lado e "← voltar à lista" volta', async () => {
    banco.importacoes = DEZ;
    montar();
    fireEvent.click(await screen.findByTestId('painel-arquivos-resumo'));
    expect(screen.getByTestId('painel-trabalho-lista')).toBeTruthy();
    const linhas = screen.getAllByTestId('painel-lista-linha');
    expect(linhas).toHaveLength(10);
    const o3 = linhas.find((l) => l.getAttribute('data-chave') === 'importacao:o3');
    expect(o3 && within(o3).getByTestId('painel-lista-periodo').textContent).toBe('01–03/09/2031');
    expect(o3 && within(o3).getByTestId('painel-lista-periodo').getAttribute('title')).toBe('01/09/2031 a 03/09/2031');
    expect(o3?.textContent).toContain('800,00');
    const pdf = linhas.find((l) => l.getAttribute('data-chave') === 'comprovante:d1');
    expect(pdf && within(pdf).getByTestId('painel-lista-periodo').textContent).toBe('—');
    if (!o3) throw new Error('sem a linha');
    fireEvent.click(within(o3).getByTestId('painel-lista-ver'));
    expect((await screen.findByTestId('painel-ver-movimentos')).textContent).toContain('PIX RECEBIDO EXEMPLO');
    fireEvent.click(screen.getByTestId('painel-ver-voltar'));
    expect(screen.getAllByTestId('painel-lista-linha')).toHaveLength(10);
  });

  it('A3 conta corrente: o passo "Extrato" É a lista; ordenar pela coluna (de novo = inverte); Baixar/Desfazer pela linha', async () => {
    banco.importacoes = DEZ;
    montar({ conta: { id: 'c1', nome: 'Banco Exemplo', tipoConta: 'cc' }, linha: LINHA({ tem: true, banco: 3, sistema: 1, extrato: 998.5, dif: -1.5 }) });
    fireEvent.click(await screen.findByTestId('painel-passo-extrato'));
    expect(screen.getByTestId('painel-trabalho-extrato')).toBeTruthy();
    const nomes = () => screen.getAllByTestId('painel-lista-nome').map((n) => (n.textContent ?? '').replace('⚠ ', ''));
    fireEvent.click(screen.getByTestId('painel-lista-ordenar-saldo'));
    expect(nomes().slice(0, 2)).toEqual(['extrato-09.ofx', 'extrato-08.ofx']);
    expect(nomes().at(-1)).toBe('Saldo Previdência Exemplo 3009.pdf'); // sem saldo: sempre no fim
    fireEvent.click(screen.getByTestId('painel-lista-ordenar-saldo'));
    expect(nomes()[0]).toBe('extrato-01.ofx');
    expect(screen.getByTestId('painel-lista-ordenar-saldo').textContent).toBe('Saldo final ▼');
    const [primeira] = screen.getAllByTestId('painel-lista-linha');
    fireEvent.click(within(primeira).getByTestId('painel-lista-desfazer'));
    expect((await screen.findByTestId('stub-desfazer-arquivo')).textContent).toBe('extrato-01.ofx');
    /* o resumo também abre a lista: na corrente, é o passo Extrato */
    fireEvent.click(screen.getByTestId('painel-passo-casar'));
    fireEvent.click(screen.getByTestId('painel-arquivos-resumo'));
    expect(screen.getByTestId('painel-passo-extrato').className).toContain('bg-[#eef4ff]');
  });

  it('A4 o aviso de SOBREPOSIÇÃO: dois arquivos nos mesmos dias = a frase com os dois e o período; muitos = os marcados com ⚠', async () => {
    banco.importacoes = [
      { ...IMPORTACAO, id: 'a', nomeArquivo: 'quinzena-1.ofx', periodoDe: '2031-09-01', periodoAte: '2031-09-15' },
      { ...IMPORTACAO, id: 'b', nomeArquivo: 'quinzena-2.ofx', periodoDe: '2031-09-15', periodoAte: '2031-09-30' },
      { ...IMPORTACAO, id: 'c', nomeArquivo: 'outubro.ofx', periodoDe: '2031-10-01', periodoAte: '2031-10-31' }];
    montar();
    fireEvent.click(await screen.findByTestId('painel-arquivos-resumo'));
    expect(screen.getByTestId('painel-lista-sobreposicao').textContent).toBe('⚠ quinzena-1.ofx e quinzena-2.ofx cobrem os mesmos dias (15/09/2031–15/09/2031).');
    expect(screen.getAllByTestId('painel-lista-linha').filter((l) => l.getAttribute('data-sobreposto') === 'sim')).toHaveLength(2);
    banco.importacoes = DEZ;
  });

  it('A5 sem sobreposição, sem aviso; com 2 arquivos a faixa segue nos cartões', async () => {
    banco.importacoes = [{ ...IMPORTACAO, periodoDe: '2031-09-01', periodoAte: '2031-09-30' }];
    montar();
    expect(await screen.findAllByTestId('painel-arquivo')).toHaveLength(2);
    expect(screen.queryByTestId('painel-arquivos-resumo')).toBeNull();
    fireEvent.click(screen.getAllByTestId('painel-arquivo-ver')[1]);
    fireEvent.click(await screen.findByTestId('painel-ver-voltar'));
    expect(screen.getAllByTestId('painel-lista-linha')).toHaveLength(2);
    expect(screen.queryByTestId('painel-lista-sobreposicao')).toBeNull();
  });

  /* CONC-PAINEL-02 entrega 2 (Gabriel 23/11 17:11) — o passo "Casar lançamentos" LISTA as linhas sem par com a sugestão do motor */
  const MOV = (id: string, data: string, descricao: string, valor: number, situacao = 'sem_vinculo') => ({ id, data_movimento: data, descricao, documento: null,
    valor, valorConciliado: 0, valorAberto: valor, situacao, lancamentoId: null, vinculos: 0 });
  const CAND = (o: Record<string, unknown>) => ({ id: 'l', descricao: 'Energia', favorecido: null, numeroDocumento: null, dataReferencia: '2031-09-05', valor: -3118.42,
    status: 'programado', jaConciliado: 0, saldo: -3118.42, deltaValor: 0, deltaDias: 2, score: 92, preMarcado: true, ambiguo: false, indisponivel: false,
    motivoIndisponivel: null, vencimento: '2031-09-05', ...o });
  const CORRENTE = { conta: { id: 'c1', nome: 'Banco Exemplo', tipoConta: 'cc' }, linha: LINHA({ tem: true, banco: 3, sistema: 1, extrato: 998.5, dif: -1.5 }), comprovantes: [] };

  it('E1 as 3 linhas sem par (a conciliada fica fora) com a sugestão do motor: exata ✓ casar · a conferir ≈ casar · sem sugestão = procurar', async () => {
    banco.movimentos = [MOV('m1', '2031-09-03', 'PAG BOLETO ENERGIA EXEMPLO', -3118.42), MOV('m2', '2031-09-05', 'TED RECEBIDA FRIGORIFICO EXEMPLO', 410220),
      MOV('m3', '2031-09-12', 'PIX ENVIADO JOSE EXEMPLO', -1500), MOV('m4', '2031-09-15', 'TARIFA', -89.9, 'conciliado')];
    banco.motor.set('m1', { ok: true, sugestao: { balde: 'exata', candidato: CAND({}), empate: false } });
    banco.motor.set('m2', { ok: true, sugestao: { balde: 'conferir', candidato: CAND({ descricao: 'Venda de bois · OC exemplo', valor: 410220 }), empate: true } });
    montar(CORRENTE);
    await waitFor(() => expect(screen.getAllByTestId('painel-casar-sugestao')[0].textContent).toBe('✓ Energia'));
    const linhas = screen.getAllByTestId('painel-casar-linha');
    expect(linhas.map((l) => [l.getAttribute('data-tom'), within(l).getByTestId('painel-casar-acao').textContent])).toEqual([['exata', 'casar'], ['conferir', 'casar'], ['sem', 'procurar']]);
    expect(linhas[0].textContent).toContain('03/09/2031');
    expect(within(linhas[1]).getByTestId('painel-casar-sugestao').getAttribute('title')).toContain('empate com outro: conferir');
    expect(banco.chamadasDoMotor).toBe(1); // poucas linhas: o motor rodou ao abrir, uma varredura
    /* casar/procurar = a ESTAÇÃO por cima (as travas são dela); embaixo o lote ("Casar os exatos") e a Conferência */
    fireEvent.click(within(linhas[2]).getByTestId('painel-casar-acao'));
    expect((await screen.findByTestId('stub-estacao')).textContent).toBe('m3');
    expect(screen.getByTestId('painel-casar-exatos').textContent).toBe('Casar os exatos (prévia)');
    expect(screen.getByTestId('painel-casar').textContent).toBe('Conferência lado a lado');
  });

  it('E2 muitas linhas sem par: o motor NÃO roda sozinho (P124, buscar é gesto) — "Buscar sugestões (N)" roda', async () => {
    banco.movimentos = Array.from({ length: 13 }, (_, i) => MOV(`m${i}`, '2031-09-10', `PIX ${i}`, -10 - i));
    montar(CORRENTE);
    expect((await screen.findAllByTestId('painel-casar-linha'))).toHaveLength(13);
    expect(banco.chamadasDoMotor).toBe(0);
    expect(screen.getAllByTestId('painel-casar-sugestao')[0].textContent).toBe('—');
    fireEvent.click(screen.getByTestId('painel-casar-buscar'));
    await waitFor(() => expect(banco.chamadasDoMotor).toBe(1));
    await waitFor(() => expect(screen.getAllByTestId('painel-casar-sugestao')[0].textContent).toBe('sem sugestão'));
  });

  it('E3 voltou da aba Importar (escondido → visível): o painel segue no MESMO passo (nada recomeça)', async () => {
    banco.movimentos = [];
    const props: PainelDaContaProps = { aberto: true, aoFechar: vi.fn(), clienteId: 'cli', conta: CORRENTE.conta, linha: CORRENTE.linha, anoMes: '2031-09',
      comprovantes: [], aoMudarArquivos: vi.fn(), ordem: [], aoTrocarConta: vi.fn(), aoImportar: vi.fn(), aoCasar: vi.fn(), aoInformarSaldo: vi.fn() };
    const { rerender } = render(<PainelDaConta {...props} />);
    fireEvent.click(screen.getByTestId('painel-passo-saldo'));
    rerender(<PainelDaConta {...props} escondido />);
    expect(screen.queryByTestId('painel-da-conta')).toBeNull();
    rerender(<PainelDaConta {...props} escondido={false} />);
    expect(await screen.findByTestId('painel-trabalho-saldo')).toBeTruthy();
    expect(props.aoFechar).not.toHaveBeenCalled();
  });

  it('LARGURA E ALTURAS FIXAS (UI-LARGURA-FIXA-01): 980 = 430 | 550; topo 56 · arquivos 72 · rodapé 44 — iguais com 0 ou N arquivos', () => {
    montar({ comprovantes: [] });
    const painel = screen.getByTestId('painel-da-conta');
    expect(painel.classList.contains('w-[980px]')).toBe(true);
    expect(painel.style.gridTemplateRows).toBe('56px 72px minmax(0,1fr) 44px');
    const corpo = screen.getByTestId('painel-trabalho').parentElement;
    expect(corpo?.style.gridTemplateColumns).toBe('430px 550px');
  });
});

describe('a ligação na Conciliação (fonte)', () => {
  const F = readFileSync(resolve(process.cwd(), 'src/pages/ConciliacaoBancariaTab.tsx'), 'utf8');
  const I = readFileSync(resolve(process.cwd(), 'src/components/conciliacao/ImportarBancoInline.tsx'), 'utf8');
  it('o ✎ da conta abre o painel', () => {
    expect(F).toContain('onEdit={()=>painel.abrirPainel(s.conta.id)}');
  });
  it('UMA fonte: o chip "PDF" e o painel leem a MESMA lista de comprovantes (a tela não consulta a tabela por conta própria)', () => {
    expect(F).toContain('temPdf={contasComPdfNoMes.has(s.conta.id)}');
    expect(F).toContain('contasComComprovante(comprovantesDoAno ?? [], anoMesSel)');
    expect(F).toContain('comprovantes={comprovantesDoAno}');
    expect(F).toContain('lerComprovantesDoAno(clienteId, ano)');
    expect(F).not.toContain("from('financeiro_saldo_documentos')");
  });
  it('"Casar lançamentos" segue levando à Conferência de hoje; o arrastado chega ao Importar banco', () => {
    expect(F).toContain('aoCasar={(id) => painel.conferencia(id)}');
    expect(F).toContain('arquivoInicial={arquivoParaImportar}');
  });
  it('D3: o card do Lucro Rural SAIU da linha do Importar banco; a porta é o menu ⋯', () => {
    expect(I).toContain('data-testid="menu-importar-banco"');
    expect(I).toMatch(/<DropdownMenuItem onSelect=\{\(\) => setLrAberto\(true\)\} data-testid="abrir-atualizar-lr">Atualizar do Lucro Rural<\/DropdownMenuItem>/);
    expect(I).not.toMatch(/<Button[^>]*data-testid="abrir-atualizar-lr"/);
  });
  it('só a faixa do topo escurece (UI-MESES-PADRAO-01); o estado dos meses segue no `tomPorMes`', () => {
    expect(F).toContain("style={{ background: 'hsl(var(--navy))' }} data-testid=\"faixa-conciliacao\"");
    expect(F).toContain('tomPorMes={tomDosMeses}');
  });
});
