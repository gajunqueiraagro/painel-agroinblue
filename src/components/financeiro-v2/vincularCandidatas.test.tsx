/**
 * OC-VINCULAR-CANDIDATAS-01 — nada some da lista de candidatas sem motivo.
 *
 * ⚠ O BANCO DECIDE o que aparece, em que ordem e com que marca (`oc_candidatas_vinculo`, migration 20261027193400, provada em
 *   `supabase/tests/oc_vincular_candidatas_01_test.sql`). Aqui se trava o que a TELA faz com o retorno: desenha o selo, apaga o
 *   rascunho, recolhe as de fora da janela, escreve os números que vieram — e não filtra nada por conta própria.
 * ⚠ A RPC É MOCKADA com a forma do retorno novo (os campos medidos no ensaio do Agnaldo: 65723b49 × a2df4ec1).
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
  blocosDeCandidatas, candidataInicial, situacaoDaCandidata, textoDoAviso, fraseDoInelegivel, FRASE_DO_INELEGIVEL, FRASES_DO_BANCO,
  mensagemDeErro, fraseDaJanela, rotuloMostrarFora, fraseForaDoLimite, fraseOutroTipo, avisoForaDaJanela, seloOutraFazenda,
  podeOferecerVinculo, MOTIVO_RASCUNHO, seloDaDiferenca, motivoDaDiferenca,
  type OperacaoCandidata, type RespostaCandidatas, type VinculoFeito,
} from '@/lib/oc/vincularLancamento';

const LANC = '65723b49';
const oc = (id: string, o: Partial<OperacaoCandidata> = {}): OperacaoCandidata => ({
  operacao_id: id, tipo_operacao: 'compra', numero_documento: null, status_comercial: 'fechada', versao: 17,
  data_operacao: '2026-09-09', data_referencia: '2026-09-09', distancia_dias: 0, fazenda_id: 'f-tereza', fazenda_nome: 'Faz. Sta. Tereza',
  mesma_fazenda: true, contraparte_id: 'c1', contraparte_nome: 'Fornecedor', valor_acordado: 315000,
  compromissos: [], acao_prevista: 'criar', tem_titulo_vivo_do_componente: false,
  valor_exato: false, competencia_nova: '2026-09-09', competencia_muda_de_mes: false, movimento_duplicado: null,
  outra_fazenda: false, fora_da_janela: false, rascunho: false,
  ...o,
});
const MESMA = oc('mesma', { distancia_dias: 40 });
const OUTRA = oc('outra', { fazenda_id: 'f-maria', fazenda_nome: 'Faz. Sta. Maria', mesma_fazenda: false, outra_fazenda: true });
const RASC = oc('rasc', { rascunho: true });
const LONGE = oc('longe', { fora_da_janela: true, distancia_dias: 74 });
const resposta = (cands: OperacaoCandidata[], o: Partial<RespostaCandidatas> = {}): RespostaCandidatas => ({
  elegivel: true,
  lancamento: { id: LANC, descricao: 'Compra 110 DM-2/2', valor: 248000, tipo_operacao: '2-Saídas',
    subcentro: 'Investimento Compra Bovinos Machos', data_competencia: '2026-09-23', data_pagamento: '2026-09-23',
    status_transacao: 'realizado', fazenda_nome: 'Faz. Sta. Tereza', favorecido_nome: 'Fornecedor', conciliado: true,
    origem_lancamento: 'extrato', importado: false, movimentacao_rebanho_id: null },
  regra: { natureza: 'principal', componentes: ['principal'], tipos_oc: ['compra'] },
  componente_sugerido: null, candidatas: cands,
  janela_dias: 60, limite_dias: 180, fora_do_limite: 0, outro_tipo: { qtd: 0, tipos: [] },
  ...o,
});
const simulacao: VinculoFeito = {
  ok: true, acao: 'simulado', simulado: true, operacao_versao: 17, titulos_vivos_do_compromisso: 2, conciliado: true,
  compromisso: { id: 'c', acao: 'mantido', valor_anterior: 315000, valor_total: 315000 },
  parcela: { id: 'p', acao: 'parcial' }, titulo_substituido: null,
  lancamento: { id: LANC, competencia_anterior: '2026-09-23', competencia_nova: '2026-09-09', hash_preservado: true, movimentacao_rebanho_id_solto: null },
  avisos: [{ codigo: 'fazenda_diferente', operacao_fazenda: 'Faz. Sta. Maria', lancamento_fazenda: 'Faz. Sta. Tereza' }],
  parte: { sequencia: 2, quantidade: 3, parcela_seguinte: false, descricao: 'Compra 110 DM' },
  principal: { acordado: 315000, vinculado: 315000, recebido: 298000 },
  parcial: { lado: 'pagar', recebido: 248000, de: 265000, saldo: 17000,
    parcela_saldo: { id: 'p3', sequencia: 3, quantidade: 3, vencimento: '2026-09-23', titulo_id: 't', titulo_valor_antes: 265000 } },
};
function responder(r: RespostaCandidatas) {
  rpc.mockImplementation(async (nome: string) => {
    if (nome === 'oc_candidatas_vinculo') return { data: r, error: null };
    if (nome === 'oc_vincular_lancamento') return { data: simulacao, error: null };
    return { data: null, error: null };
  });
}
async function montar(r: RespostaCandidatas) {
  responder(r);
  render(<VincularOperacaoDialog open lancamentoId={LANC} clienteId="agnaldo" onClose={vi.fn()} onVinculado={vi.fn()} />);
  await waitFor(() => expect(screen.queryByTestId('vinc-secao-candidatas')).not.toBeNull());
}
const linhas = () => Array.from(document.querySelectorAll('tr[data-oc]')).map(t => t.getAttribute('data-oc'));
const semDuro = (t: string | null | undefined) => (t ?? '').replace(/[ ⁠]/g, ' ');

beforeEach(() => { rpc.mockReset(); });

describe('E1 — OC de outra fazenda aparece, com o selo, e pode ser escolhida', () => {
  it('a linha traz "outra fazenda: <nome>", na ORDEM que o banco mandou (depois da mesma fazenda)', async () => {
    await montar(resposta([MESMA, OUTRA]));
    expect(linhas()).toEqual(['mesma', 'outra']);
    const selos = Array.from(document.querySelectorAll('[data-testid=vinc-outra-fazenda]'));
    expect(selos.map(s => s.textContent)).toEqual(['outra fazenda: Faz. Sta. Maria']);
    expect(selos[0].closest('tr')?.getAttribute('data-oc')).toBe('outra');
    expect(document.querySelector('tr[data-oc="outra"]')?.getAttribute('data-selecionavel')).toBe('sim');
  });
  it('escolhida, o painel mostra a frase do parcial e o aviso de fazenda que o BANCO devolveu', async () => {
    await montar(resposta([MESMA, OUTRA]));
    const l = document.querySelector('tr[data-oc="outra"]');
    if (!(l instanceof HTMLElement)) throw new Error('linha nao achada');
    fireEvent.click(l);
    await waitFor(() => expect(screen.queryByTestId('vinc-parcial')).not.toBeNull());
    expect(semDuro(screen.getByTestId('vinc-parcial').textContent)).toBe('Pago R$ 248.000,00 de R$ 265.000,00. Fica saldo a pagar de R$ 17.000,00 nesta OC.');
    const aviso = document.querySelector('[data-aviso="fazenda_diferente"]');
    expect(aviso?.textContent).toBe('A OC é da Faz. Sta. Maria. O lançamento continua em Faz. Sta. Tereza; o vínculo não muda a fazenda.');
  });
  it('o aviso é âmbar e diz as duas fazendas; sem os nomes, não inventa', () => {
    const a = textoDoAviso({ codigo: 'fazenda_diferente', operacao_fazenda: 'Faz. A', lancamento_fazenda: 'Faz. B' });
    expect(a.tom).toBe('ambar');
    expect(a.texto).toBe('A OC é da Faz. A. O lançamento continua em Faz. B; o vínculo não muda a fazenda.');
    expect(seloOutraFazenda(MESMA)).toBeNull();
  });
  it('NUNCA vai pré-escolhida: nem outra fazenda, nem fora da janela, nem rascunho, mesmo com o valor exato', () => {
    expect(candidataInicial([{ ...MESMA, valor_exato: true }], 'principal', 1)).toBe('mesma');   // a busca sabe achar
    expect(candidataInicial([{ ...OUTRA, valor_exato: true }], 'principal', 1)).toBeNull();
    expect(candidataInicial([{ ...LONGE, valor_exato: true }], 'principal', 1)).toBeNull();
    expect(candidataInicial([{ ...RASC, valor_exato: true }], 'principal', 1)).toBeNull();
  });
});

describe('E2 — fora da janela fica sob o "mostrar", com os números do banco', () => {
  it('fechado por padrão: a de 74 dias não é desenhada, e o botão diz quantas são e qual é a janela', async () => {
    await montar(resposta([MESMA, LONGE]));
    expect(linhas()).toEqual(['mesma']);
    expect(screen.getByTestId('vinc-mostrar-fora').textContent).toBe('Mostrar 1 fora da janela de 60 dias');
    expect(screen.getByTestId('vinc-contagem').textContent).toBe('1 na janela de 60 dias');
  });
  it('aberto: a linha traz "a 74 dias" e pode ser escolhida; o painel avisa em âmbar', async () => {
    await montar(resposta([MESMA, LONGE]));
    fireEvent.click(screen.getByTestId('vinc-mostrar-fora'));
    expect(linhas()).toEqual(['mesma', 'longe']);
    expect(screen.getByTestId('vinc-mostrar-fora').textContent).toBe('Ocultar 1 fora da janela de 60 dias');
    const l = document.querySelector('tr[data-oc="longe"]');
    if (!(l instanceof HTMLElement)) throw new Error('linha nao achada');
    expect(l.querySelector('[data-testid=vinc-dist]')?.textContent).toBe('a 74 dias');
    expect(l.getAttribute('data-selecionavel')).toBe('sim');
    fireEvent.click(l);
    await waitFor(() => expect(screen.queryByTestId('vinc-aviso-janela')).not.toBeNull());
    expect(screen.getByTestId('vinc-aviso-janela').textContent).toBe('Esta operação está a 74 dias do lançamento, fora da janela de 60 dias. Confira se é mesmo ela.');
  });
  it('a janela e o limite são os do RETORNO — outro número no retorno, outro número na tela', async () => {
    await montar(resposta([MESMA, LONGE], { janela_dias: 45, limite_dias: 120, fora_do_limite: 3 }));
    expect(screen.getByTestId('vinc-contagem').textContent).toBe('1 na janela de 45 dias');
    expect(screen.getByTestId('vinc-mostrar-fora').textContent).toBe('Mostrar 1 fora da janela de 45 dias');
    expect(Array.from(document.querySelectorAll('[data-testid=vinc-rodape-lista]')).map(p => p.textContent))
      .toEqual(['3 operações do mesmo tipo a mais de 120 dias ficam fora da lista.']);
  });
  it('a tela NÃO escreve 60 nem 180: os números não existem na fonte do diálogo', () => {
    const fonte = readFileSync(resolve(__dirname, 'VincularOperacaoDialog.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(fonte).not.toMatch(/\b60 dias\b|\b180\b|janela de \d/);
    expect(fraseDaJanela(resposta([], { janela_dias: undefined }), 2)).toBe('2 candidatas');   // função antiga: sem número inventado
    expect(rotuloMostrarFora(resposta([], { janela_dias: undefined }), 1, false)).toBe('Mostrar 1 fora da janela');
    expect(avisoForaDaJanela(MESMA, resposta([]))).toBeNull();
    expect(fraseForaDoLimite(resposta([], { fora_do_limite: 0 }))).toBeNull();
  });
  it('só fora da janela: a lista diz "Nenhuma dentro da janela." e o mostrar continua oferecido', async () => {
    await montar(resposta([LONGE]));
    expect(linhas()).toEqual([]);
    expect(screen.queryByTestId('vinc-so-fora')).not.toBeNull();
    expect(screen.queryByTestId('vinc-mostrar-fora')).not.toBeNull();
  });
});

describe('E4 — rascunho aparece apagada, com o motivo, e não se escolhe', () => {
  it('a linha existe, não é selecionável e o selo diz por quê', async () => {
    await montar(resposta([MESMA, RASC]));
    const l = document.querySelector('tr[data-oc="rasc"]');
    if (!(l instanceof HTMLElement)) throw new Error('linha nao achada');
    expect(l.getAttribute('data-selecionavel')).toBe('nao');
    expect(l.className).toContain('opacity-60');
    expect(l.textContent).toContain(MOTIVO_RASCUNHO);
    fireEvent.click(l);
    expect(l.querySelector('[role=radio]')?.getAttribute('aria-checked')).toBe('false');
    expect(rpc.mock.calls.filter(c => c[0] === 'oc_vincular_lancamento').length).toBe(0);
  });
  it('quem decide é o dono do selo', () => {
    expect(situacaoDaCandidata(RASC, 'principal', 1).selecionavel).toBe(false);
    expect(situacaoDaCandidata(RASC, 'principal', 1).rotulo).toBe('em rascunho — conclua a negociação');
    expect(situacaoDaCandidata(MESMA, 'principal', 1).selecionavel).toBe(true);
  });
});

describe('todas as parcelas pagas e o compromisso ≠ a soma delas — nunca "liquidado", com o valor do banco', () => {
  const comp = (dif: number) => ({ id: 'k', componente: 'principal', descricao: 'Compra', valor_total: 27062.5, status: 'programado', lote_id: null,
    parcelas: [], diferenca: 0, valor_exato: false, acao_prevista: 'recusar' as const, diferenca_parcelas: dif, pagas_com_diferenca: dif !== 0 });
  const FALTA = oc('falta', { compromissos: [comp(0.5)], pagas_com_diferenca: true, diferenca_parcelas: 0.5, todos_liquidados: false });
  const SOBRA = oc('sobra', { compromissos: [comp(-0.5)], pagas_com_diferenca: true, diferenca_parcelas: -0.5, todos_liquidados: false });
  const ZERO = oc('zero', { compromissos: [comp(0)], pagas_com_diferenca: false, diferenca_parcelas: 0, todos_liquidados: true });
  it('o selo traz o valor inteiro e diz o lado; um centavo já conta; com zero não há selo', () => {
    expect(semDuro(seloDaDiferenca(FALTA))).toBe('parcelas pagas · falta R$ 0,50');
    expect(semDuro(seloDaDiferenca(SOBRA))).toBe('parcelas pagas · sobra R$ 0,50');
    expect(semDuro(seloDaDiferenca({ pagas_com_diferenca: true, diferenca_parcelas: 0.01 }))).toBe('parcelas pagas · falta R$ 0,01');
    expect(semDuro(seloDaDiferenca({ pagas_com_diferenca: true, diferenca_parcelas: 1234567.89 }))).toContain('R$ 1.234.567,89');
    expect(seloDaDiferenca(ZERO)).toBeNull();
    expect(motivoDaDiferenca(ZERO)).toBeNull();
    expect(semDuro(motivoDaDiferenca(FALTA))).toBe('Todas as parcelas deste compromisso estão pagas. Sobra uma diferença de R$ 0,50 entre o combinado e o pago (pago a menos); ela se resolve na OC.');
  });
  it('a marca é a do BANCO: a tela não a deduz de todos_liquidados nem do compromisso', () => {
    expect(situacaoDaCandidata(oc('x', { compromissos: [comp(0.5)], todos_liquidados: true }), 'principal', 1).selecionavel).toBe(true);
    expect(situacaoDaCandidata(FALTA, 'principal', 1)).toMatchObject({ selecionavel: false, tom: 'ambar' });
    expect(situacaoDaCandidata(ZERO, 'principal', 1)).toMatchObject({ selecionavel: true, rotulo: 'criar item' });
    expect(candidataInicial([oc('e', { valor_exato: true, pagas_com_diferenca: true, diferenca_parcelas: 0.5 })], 'principal', 1)).toBeNull();
  });
  it('no diálogo: linha apagada com o selo inteiro, não se escolhe, e o clique escreve o motivo no painel', async () => {
    await montar(resposta([MESMA, FALTA]));
    const l = document.querySelector('tr[data-oc="falta"]');
    if (!(l instanceof HTMLElement)) throw new Error('linha nao achada');
    expect(l.getAttribute('data-selecionavel')).toBe('nao');
    expect(semDuro(l.textContent)).toContain('parcelas pagas · falta R$ 0,50');
    expect(screen.queryByTestId('vinc-motivo-da-linha')).toBeNull();
    fireEvent.click(l);
    expect(l.querySelector('[role=radio]')?.getAttribute('aria-checked')).toBe('false');
    expect(semDuro(screen.getByTestId('vinc-motivo-da-linha').textContent)).toContain('Sobra uma diferença de R$ 0,50 entre o combinado e o pago');
    expect(rpc.mock.calls.filter(c => c[0] === 'oc_vincular_lancamento').length).toBe(0);
    const outra = document.querySelector('tr[data-oc="mesma"]');
    if (!(outra instanceof HTMLElement)) throw new Error('linha nao achada');
    fireEvent.click(outra);
    await waitFor(() => expect(screen.queryByTestId('vinc-motivo-da-linha')).toBeNull());
  });
});

describe('E3 e o que continua fora — dito em uma linha, com o número do banco', () => {
  it('outro tipo: "N operações de outro tipo (abate) perto destas datas — o subcentro deste lançamento é de venda."', () => {
    const r = resposta([], { regra: { natureza: 'principal', componentes: ['principal'], tipos_oc: ['venda'] }, outro_tipo: { qtd: 3, tipos: ['abate'] } });
    expect(fraseOutroTipo(r)).toBe('3 operações de outro tipo (abate) perto destas datas — o subcentro deste lançamento é de venda.');
    expect(fraseOutroTipo(resposta([], { outro_tipo: { qtd: 1, tipos: ['abate'] }, regra: { natureza: 'principal', componentes: ['principal'], tipos_oc: ['venda'] } })))
      .toBe('1 operação de outro tipo (abate) perto destas datas — o subcentro deste lançamento é de venda.');
    expect(fraseOutroTipo(resposta([], { outro_tipo: { qtd: 0, tipos: [] } }))).toBeNull();
    expect(fraseOutroTipo(resposta([], { outro_tipo: undefined }))).toBeNull();
  });
  it('o diálogo desenha as duas linhas do rodapé — acima do limite e outro tipo —, cada uma inteira no title', async () => {
    await montar(resposta([MESMA], { fora_do_limite: 12, regra: { natureza: 'principal', componentes: ['principal'], tipos_oc: ['venda'] }, outro_tipo: { qtd: 3, tipos: ['abate'] } }));
    const linhas = Array.from(document.querySelectorAll('[data-testid=vinc-rodape-lista]'));
    expect(linhas.map(p => p.textContent)).toEqual([
      '12 operações do mesmo tipo a mais de 180 dias ficam fora da lista.',
      '3 operações de outro tipo (abate) perto destas datas — o subcentro deste lançamento é de venda.',
    ]);
    expect(linhas.every(p => p.getAttribute('title') === p.textContent)).toBe(true);
  });
  it('a tela só REPARTE o retorno pela marca; cancelada não vem do banco e a tela não tem como trazê-la', () => {
    const b = blocosDeCandidatas([MESMA, OUTRA, RASC, LONGE]);
    expect(b.naJanela.map(c => c.operacao_id)).toEqual(['mesma', 'outra', 'rasc']);
    expect(b.foraDaJanela.map(c => c.operacao_id)).toEqual(['longe']);
    const fonte = readFileSync(resolve(__dirname, 'VincularOperacaoDialog.tsx'), 'utf8');
    expect(fonte).not.toMatch(/candidatas\.filter\(/);            // nenhum filtro novo no diálogo
    expect(fonte).not.toMatch(/status_comercial\s*[!=]==/);
  });
  it('lista vazia: a frase não culpa mais a fazenda', async () => {
    await montar(resposta([]));
    expect(screen.getByTestId('vinc-sem-candidatas').textContent).toBe('Nenhuma operação deste tipo perto destas datas.');
  });
});

describe('recusas — toda recusa chega em frase, por um mapa só', () => {
  it('lançamento inelegível: nenhum código cru na tela (e a busca sabe achar: os oito motivos têm frase)', async () => {
    expect(Object.keys(FRASE_DO_INELEGIVEL).sort()).toEqual(['cancelado', 'direcao_diverge_do_subcentro', 'financiamento_ou_transferencia',
      'ja_vinculado', 'lancamento_nao_encontrado', 'meta', 'sem_valor', 'subcentro_sem_regra']);
    for (const [codigo, frase] of Object.entries(FRASE_DO_INELEGIVEL)) {
      expect(frase, codigo).not.toContain('_');                     // nenhum codigo de maquina
      expect(frase.endsWith('.'), codigo).toBe(true);
    }
    expect(fraseDoInelegivel('codigo_que_nao_existe')).toBe('Este lançamento não pode ser vinculado a uma operação.');
    rpc.mockImplementation(async () => ({ data: { elegivel: false, motivo: 'subcentro_sem_regra' }, error: null }));
    render(<VincularOperacaoDialog open lancamentoId={LANC} clienteId="x" onClose={vi.fn()} onVinculado={vi.fn()} />);
    await waitFor(() => expect(screen.queryByTestId('vinc-inelegivel')).not.toBeNull());
    expect(screen.getByTestId('vinc-inelegivel').textContent).toBe('Este subcentro não se liga a operação comercial.');
    expect(document.body.textContent ?? '').not.toContain('subcentro_sem_regra');
  });
  it('o texto do banco (vincular, conta corrente, desvincular) vira frase: nada de "fora do modelo vivo" nem de texto sem acento', () => {
    const DO_BANCO = [
      'Vincular lancamento exige motivo', 'Operacao 123 nao encontrada', 'Sem permissao nesta operacao (acesso ao cliente exigido)',
      'Conflito de versao (esperada 1, atual 2)', 'Operacao em rascunho nao aceita vinculo de lancamento', 'Operacao em rascunho',
      'Operacao cancelada nao aceita vinculo de lancamento', 'Operacao cancelada; recupere-a antes (oc_reabrir_para_estorno)',
      'Lancamento abc nao encontrado neste cliente', 'Lancamento cancelado nao pode ser vinculado', 'Lancamento cancelado: use o Desfazer compromisso da OC',
      'Lancamento de meta nao se vincula a operacao', 'Lancamento de financiamento ou transferencia nao se vincula a operacao',
      'Lancamento sem valor positivo', 'Lancamento ja esta ligado a uma operacao (parte abc)', 'Lancamento ja esta ligado a uma operacao',
      'Subcentro "Energia" nao se vincula a operacao comercial', 'Lancamento de "Venda X" nao cabe numa operacao de compra',
      'Direcao do lancamento (1-Entradas) nao confere com o subcentro (2-Saídas)', 'Direcao do compromisso (2-Saídas) nao confere com a do lancamento (1-Entradas)',
      'Compromisso abc nao encontrado nesta operacao', 'Compromisso cancelado nao recebe vinculo', 'Compromisso principal/principal nao cabe no subcentro "X"',
      'Componente informado (frete) diverge do compromisso escolhido (comissao)', 'Informe o componente (frete, comissao)',
      'Componente frete nao cabe no subcentro "X"', 'Componente obrigacao/frete inexistente ou inativo no catalogo',
      'Parcela abc nao pertence a programacao ativa do compromisso', 'Vincular mudaria o hash de importacao do lancamento abc (de x para y); abortado',
      'Recebimento ou pagamento de conta corrente so em venda ou compra no modelo conta corrente', 'Pagamento tem de ser uma saida',
      'Recebimento tem de ser uma entrada', 'Lancamento sem movimentacao de caixa nao e recebimento',
      'Vincular recebimento nao muda o lancamento; valor, datas, conta do plano ou conta bancaria mudariam',
      'Competencia pela saida mudaria valor, pagamento, conta ou hash do lancamento abc; abortado',
      'Parte abc sem parcela de programacao: fora do modelo vivo, nao se desvincula por aqui',
      'O titulo tem liquidacao MANUAL ativa na OC; estorne-a antes de desvincular', 'Desvincular lancamento exige motivo',
      'Conta do plano abc inexistente ou inativa', 'Conta do plano de outro cliente', 'Direcao da conta (2-Saídas) nao confere com o lancamento (1-Entradas)',
      'duplicate key value violates unique constraint "zoo_x"',
    ];
    for (const m of DO_BANCO) {
      const frase = mensagemDeErro({ message: m });
      expect(frase, m).not.toBe(m);                                 // nenhum passa cru
      expect(frase, m).not.toMatch(/modelo vivo|nao |Lancamento|Operacao|abortado|oc_reabrir|duplicate key/);
      expect(frase.endsWith('.'), m).toBe(true);
    }
    expect(mensagemDeErro({ message: 'Parte abc sem parcela de programacao: fora do modelo vivo, nao se desvincula por aqui' }))
      .toBe('Recebimento ou pagamento de operação em conta corrente ainda não se desvincula por aqui.');
    expect(FRASES_DO_BANCO.length).toBeGreaterThan(30);
  });
  it('os três diálogos passam pelo MESMO dono (lido da fonte)', () => {
    for (const arq of ['VincularOperacaoDialog.tsx', 'DesvincularOperacaoDialog.tsx', 'ReclassificarItemDialog.tsx']) {
      expect(readFileSync(resolve(__dirname, arq), 'utf8'), arq).toMatch(/mensagemDeErro/);
    }
    expect(readFileSync(resolve(__dirname, 'VincularOperacaoDialog.tsx'), 'utf8')).not.toContain('({resp.motivo})');
  });
});

describe('E8 — o botão "Vincular à operação" (decisão do Gabriel, 05/10: fora do mapa o botão NÃO aparece, como antes)', () => {
  const mapa = new Set(['Venda de Machos Adultos']);
  it('no mapa: oferecido; fora do mapa, não salvo, cancelado, já com parte, sem subcentro ou sem o mapa lido: não', () => {
    expect(podeOferecerVinculo({ lancamentoId: 'l', subcentro: 'Venda de Machos Adultos', cancelado: false, temParte: false, subcentros: mapa })).toBe(true);
    expect(podeOferecerVinculo({ lancamentoId: 'l', subcentro: 'Energia', cancelado: false, temParte: false, subcentros: mapa })).toBe(false);
    expect(podeOferecerVinculo({ lancamentoId: null, subcentro: 'Venda de Machos Adultos', cancelado: false, temParte: false, subcentros: mapa })).toBe(false);
    expect(podeOferecerVinculo({ lancamentoId: 'l', subcentro: 'Venda de Machos Adultos', cancelado: true, temParte: false, subcentros: mapa })).toBe(false);
    expect(podeOferecerVinculo({ lancamentoId: 'l', subcentro: 'Venda de Machos Adultos', cancelado: false, temParte: true, subcentros: mapa })).toBe(false);
    expect(podeOferecerVinculo({ lancamentoId: 'l', subcentro: 'Venda de Machos Adultos', cancelado: false, temParte: false, subcentros: null })).toBe(false);
  });
  it('o modal do lançamento não desenha botão apagado para subcentro fora do mapa (lido da fonte), e a frase segue no mapa de recusas', () => {
    const modal = readFileSync(resolve(__dirname, 'LancamentoV2Dialog.tsx'), 'utf8');
    expect(modal).toContain('setVinculoDisponivel(podeOferecerVinculo({');
    expect(modal).not.toContain('vinculoApagadoMotivo');
    expect(FRASE_DO_INELEGIVEL.subcentro_sem_regra).toBe('Este subcentro não se liga a operação comercial.');
    expect(mensagemDeErro({ message: 'Subcentro "Energia" nao se vincula a operacao comercial' })).toBe('Este subcentro não se liga a operação comercial.');
  });
});

describe('o modal não cresce: só a LISTA rola, com o cabeçalho fixo (contrato lido da fonte; a medida vai no relatório)', () => {
  const fonte = readFileSync(resolve(__dirname, 'VincularOperacaoDialog.tsx'), 'utf8');
  it('o corpo não tem rolagem própria; a lista é o único scrollport e o thead é sticky nela', () => {
    expect(fonte).toContain('<div className="flex min-h-0 flex-col gap-3 overflow-hidden px-4 py-3">');
    expect(fonte).toMatch(/className="min-h-\[52px\] flex-1 overflow-y-auto rounded border" data-testid="vinc-lista"/);
    expect(fonte).toContain('<thead className="sticky top-0 z-10 bg-card">');
    expect(fonte.match(/overflow-y-auto/g)?.length).toBe(2);   // a lista e o painel "O que vai acontecer"
  });
});
