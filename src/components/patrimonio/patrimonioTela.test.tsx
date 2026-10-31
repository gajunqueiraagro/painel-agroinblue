/**
 * PATR-01 · PR B — a tela e o modal com a API INJETADA (a mesma porta da bancada): nada fala com o banco.
 *   P1 a lista: as 11 colunas ordenam (seta em espaço reservado), fazenda pelo código, terra "não deprecia", rodapé = soma das linhas
 *   P2 as três abas que chegam depois mostram só o título
 *   P3 o modal: as seis abas sempre no lugar; terra apaga Pastos e Depreciação; pastagem apaga Valor de mercado; bem novo: Dados e Lançamentos
 *   P4 Salvar com pendência não vai ao banco: o campo fica vermelho e a frase vai ao RODAPÉ (nunca toast)
 *   P5 correção do "em uso" de bem que já deprecia: a prévia mostra a acumulada antes × depois e pede o motivo — nada gravado
 *   P6 a terra num passo: no bem NOVO o valor sem lançamento se informa na aba Lançamentos (o ligar pede o bem gravado); sem valor, o
 *      Salvar não vai ao banco e o campo fica vermelho
 *   P7 B2: a coluna Código antes de Bem; o código no título do modal e no campo só leitura (novo: "gerado ao salvar"); Placa/Renavam só
 *      em Veículos com o lugar reservado (invisível) nas outras; a "Identificação antiga" só leitura quando só há o campo antigo; o
 *      pedido do salvar manda os campos novos e NÃO manda o `identificacao`
 *   P8 o cabeçalho da lista clareia o navy no hover (`hover:brightness-110`), nunca troca o fundo por branco
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => import('../../../scripts/ui-cortes/mocks/supabase'));
vi.mock('@/contexts/ClienteContext', () => import('../../../scripts/ui-cortes/mocks/cliente'));
vi.mock('@/contexts/AuthContext', () => import('../../../scripts/ui-cortes/mocks/auth'));
vi.mock('@/contexts/FazendaContext', () => import('../../../scripts/ui-cortes/mocks/fazenda'));
const toastErro = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastErro(...a), warning: vi.fn() } }));

import { PatrimonioTela } from './PatrimonioTela';
import { PatrimonioApiProvider } from '@/hooks/usePatrimonio';
import { payloadDoBem, type PatrimonioApi, type FormBem } from '@/lib/patrimonio/patrimonioApi';
import type { BemDaLista, CategoriaBem } from '@/lib/patrimonio/patrimonio';

const g = globalThis as unknown as { __fazendaBancada?: unknown };
g.__fazendaBancada = { fazendas: [{ id: 'fPUR', nome: 'Faz. Pureza', codigo: 'PUR', cliente_id: 'cli' }, { id: 'fRET', nome: 'Faz. Retiro', codigo: 'RET', cliente_id: 'cli' }],
  fazendaAtual: null, isGlobal: true, fazendaId: '__global__' };

const cat = (codigo: string, nome: string, p: Partial<CategoriaBem>): CategoriaBem => ({ id: `c-${codigo}`, cliente_id: null, codigo, nome, vida_util_anos: 10, residual_pct: 0,
  deprecia: true, tem_mercado: true, base_mercado: 'bem', tem_pastos: false, ordem: 10, ativo: true, ...p });
const CATS = [cat('maquinas', 'Máquinas', { residual_pct: 20 }), cat('veiculos', 'Veículos', { vida_util_anos: 5, residual_pct: 30, ordem: 30 }), cat('terra', 'Terra', { vida_util_anos: null, deprecia: false, base_mercado: 'terra', ordem: 130 }),
  cat('pastagens', 'Pastagens', { vida_util_anos: 5, tem_mercado: false, base_mercado: null, tem_pastos: true, ordem: 100 })];
const bem = (p: Partial<BemDaLista>): BemDaLista => ({
  bem_id: 'mq', fazenda_id: 'fPUR', fazenda_codigo: 'PUR', categoria_id: 'c-maquinas', categoria_codigo: 'maquinas', categoria_nome: 'Máquinas', deprecia: true,
  tem_mercado: true, tem_pastos: false, codigo: 'MAQ-001', descricao: 'Trator sintético', marca: null, modelo: null, identificacao: null,
  numero_proprio: null, placa: null, chassi: null, numero_serie: null, renavam: null, situacao: 'em_uso', em_uso_desde: '2022-03-01',
  baixado_em: null, atividade: 'pecuaria', origem_valor: 'lancamentos', valor_extra: 0, valor_lancamentos: 388400, aquisicao: 388400, a_realizar: 0, n_lancamentos: 2,
  n_a_realizar: 0, n_a_conferir: 0, n_selo: 0, n_repetidas: 0, primeira_data: '2022-03-10', vida_util_meses: 120, residual_pct: 20, depreciacao_acumulada: 145002.67,
  depreciacao_no_ano: 25893.3, valor_contabil: 243397.33, mercado_valor: null, mercado_data: null, mercado_base: null, area_pastos_ha: null, versao: 1, ...p });
const BENS = [
  bem({}),
  bem({ bem_id: 'terra', codigo: 'TER-001', descricao: 'Terra sintética', categoria_id: 'c-terra', categoria_codigo: 'terra', categoria_nome: 'Terra', deprecia: false, fazenda_id: 'fRET',
    fazenda_codigo: 'RET', vida_util_meses: null, aquisicao: 1000000, depreciacao_acumulada: 0, valor_contabil: 1000000, origem_valor: 'sem_lancamento', n_lancamentos: 0, primeira_data: null }),
  bem({ bem_id: 'past', codigo: 'PAS-001', descricao: 'Reforma sintética', categoria_id: 'c-pastagens', categoria_codigo: 'pastagens', categoria_nome: 'Pastagens', tem_mercado: false, tem_pastos: true,
    aquisicao: 156000, depreciacao_acumulada: 54600, valor_contabil: 101400 }),
  bem({ bem_id: 'hilux', codigo: 'VEI-1000', descricao: 'Caminhonete sintética', categoria_id: 'c-veiculos', categoria_codigo: 'veiculos', categoria_nome: 'Veículos',
    placa: 'EUM1E62', chassi: '8AJDA3CD4R1834700', aquisicao: 0, depreciacao_acumulada: 0, valor_contabil: 0 }),
  bem({ bem_id: 'grade', codigo: 'MAQ-002', descricao: 'Grade antiga sintética', identificacao: 'Baldan série 1610 nº 4471', aquisicao: 0, depreciacao_acumulada: 0, valor_contabil: 0 }),
];
const form = (b: BemDaLista): FormBem => ({ id: b.bem_id, versao: 1, cliente_id: 'cli', fazenda_id: b.fazenda_id, categoria_id: b.categoria_id, codigo: b.codigo,
  descricao: b.descricao, marca: '', modelo: '', ano_fabricacao: null, identificacao: b.identificacao ?? '', observacao: '', numero_proprio: b.numero_proprio ?? '',
  placa: b.placa ?? '', chassi: b.chassi ?? '', numero_serie: b.numero_serie ?? '', renavam: b.renavam ?? '', situacao: b.situacao, em_uso_desde: b.em_uso_desde ?? '', atividade: 'pecuaria', financiamento_id: null,
  origem_valor: b.origem_valor, valor_sem_lancamento: b.origem_valor === 'sem_lancamento' ? b.aquisicao : null, estimativa_rs_ha: null, estimativa_area_ha: null, area_ha: null,
  matricula: '', nirf: '', seguradora: '', apolice: '', seguro_vence_em: '', vida_util_meses: b.vida_util_meses, residual_pct: b.residual_pct });

let salvarBem: ReturnType<typeof vi.fn>;
function api(): PatrimonioApi {
  return {
    categorias: async () => CATS, lista: async () => ({ ok: true, dados: BENS }), semBemResumo: async () => ({ n: 7, valor: 1000 }), itensSemBem: async () => [],
    lancamentosDoBem: async () => [], pastosDaFazenda: async () => [], pastosDoBem: async () => [], serie: async () => [], avaliacoes: async () => [], documentos: async () => [],
    cadastroDoBem: async id => form(BENS.find(b => b.bem_id === id) ?? BENS[0]),
    salvarBem: (...a) => salvarBem(...a), mudarParametros: async () => ({ ok: true, dados: {} }), ligar: async () => ({ ok: false, erro: 'x' }),
    desligar: async () => ({ ok: true, dados: {} }), salvarPastos: async () => ({ ok: true, dados: {} }), salvarAvaliacao: async () => ({ ok: true, dados: {} }),
    cancelarAvaliacao: async () => ({ ok: true, dados: {} }), enviarDocumento: async () => null, removerDocumento: async () => ({ ok: true, dados: {} }), urlDoDocumento: async () => null,
  };
}
function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PatrimonioApiProvider api={api()}><PatrimonioTela /></PatrimonioApiProvider></QueryClientProvider>);
}
const abaDoModal = (rotulo: string) => within(screen.getByTestId('bem-dialog')).getAllByRole('button').find(b => (b.textContent ?? '').startsWith(rotulo));

beforeEach(() => { cleanup(); toastErro.mockReset(); salvarBem = vi.fn(async () => ({ ok: true, dados: { ok: true } })); });

describe('PATR-01 · PR B — a tela de Patrimônio', () => {
  it('P1 a lista: 12 colunas ordenam, fazenda pelo código, terra "não deprecia", rodapé soma', async () => {
    montar();
    await screen.findAllByTestId('patrimonio-linha');
    const ordenaveis = screen.getAllByRole('columnheader').filter(th => th.getAttribute('aria-sort') != null);
    expect(ordenaveis.length).toBe(12);
    expect(screen.getAllByRole('columnheader').find(th => th.textContent === 'Data')?.getAttribute('aria-sort')).toBe('ascending');
    const terra = screen.getAllByTestId('patrimonio-linha').find(tr => tr.textContent?.includes('Terra sintética'));
    expect(terra?.textContent).toContain('RET');
    expect(terra?.textContent).toContain('não deprecia');
    expect(screen.getByTestId('patrimonio-rodape').textContent).toContain('5 bens');
    expect(screen.getByTestId('patrimonio-rodape').textContent).toContain('1.544.400,00');
    /* ordenar por Aquisição: a primeira clicada desce (maior primeiro) */
    fireEvent.click(screen.getAllByRole('columnheader').find(th => th.textContent === 'Aquisição')!);
    expect(screen.getAllByTestId('patrimonio-linha')[0].textContent).toContain('Terra sintética');
  }, 15000);   /* com a máquina carregada (outros gates) a lista passa dos 5 s padrão */

  it('P2 as abas que chegam depois mostram só o título', async () => {
    montar();
    await screen.findAllByTestId('patrimonio-linha');
    fireEvent.click(screen.getByRole('button', { name: /Baixados/ }));
    expect(screen.getByTestId('patrimonio-visao-baixados').textContent).toBe('Baixados / vendidos');
  });

  it('P3 o modal: seis abas sempre no lugar; a categoria apaga a que não vale; bem novo: Dados e Lançamentos', async () => {
    montar();
    fireEvent.click((await screen.findAllByTestId('patrimonio-linha')).find(tr => tr.textContent?.includes('Terra sintética'))!);
    await screen.findByTestId('bem-dialog');
    await waitFor(() => expect((abaDoModal('Lançamentos') as HTMLButtonElement).disabled).toBe(false));
    expect((abaDoModal('Pastos') as HTMLButtonElement).disabled).toBe(true);
    expect((abaDoModal('Depreciação') as HTMLButtonElement).disabled).toBe(true);
    expect((abaDoModal('Valor de mercado') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(screen.getAllByTestId('patrimonio-linha').find(tr => tr.textContent?.includes('Reforma sintética'))!);
    await screen.findByTestId('bem-dialog');
    await waitFor(() => expect((abaDoModal('Pastos') as HTMLButtonElement).disabled).toBe(false));
    expect((abaDoModal('Valor de mercado') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(screen.getByTestId('patrimonio-novo'));
    await screen.findByTestId('bem-dialog');
    expect((abaDoModal('Lançamentos') as HTMLButtonElement).disabled).toBe(false);
    for (const r of ['Pastos', 'Depreciação', 'Valor de mercado', 'Documentos']) expect((abaDoModal(r) as HTMLButtonElement).disabled).toBe(true);
    expect(abaDoModal('Documentos')?.getAttribute('title')).toBe('salve o bem antes');
  }, 15000);   /* abre o modal 3 vezes: com a máquina carregada (outros gates) passa dos 5 s padrão */

  it('P4 Salvar com pendência: nada vai ao banco; o campo fica vermelho e a frase vai ao rodapé (nunca toast)', async () => {
    montar();
    await screen.findAllByTestId('patrimonio-linha');
    fireEvent.click(screen.getByTestId('patrimonio-novo'));
    await screen.findByTestId('bem-dialog');
    fireEvent.click(screen.getByTestId('bem-salvar'));
    expect(salvarBem).not.toHaveBeenCalled();
    expect(screen.getByTestId('bem-rodape').textContent).toBe('Escolha a categoria do bem.');
    expect(screen.getByTestId('bem-descricao').className).toContain('border-destructive');
    expect(toastErro).not.toHaveBeenCalled();
  });

  it('P5 correção do "em uso" de bem que já deprecia: a prévia pede o motivo e nada é gravado', async () => {
    salvarBem = vi.fn(async (_f: FormBem, simular: boolean) => (simular
      ? { ok: true, dados: { ok: true, correcao: { acumulada_antes: 145002.67, acumulada_depois: 137234.67 } } } : { ok: true, dados: { ok: true } }));
    montar();
    fireEvent.click((await screen.findAllByTestId('patrimonio-linha')).find(tr => tr.textContent?.includes('Trator sintético'))!);
    await screen.findByTestId('bem-dialog');
    await waitFor(() => expect((screen.getByTestId('bem-motivo') as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('bem-salvar'));
    await waitFor(() => expect(screen.getByTestId('bem-rodape').textContent).toContain('passa de R$ 145.002,67 para R$ 137.234,67'));
    expect(salvarBem).toHaveBeenCalledTimes(1);
    expect(salvarBem.mock.calls[0][1]).toBe(true);
    expect(screen.getByTestId('bem-motivo').className).toContain('border-destructive');
  });

  it('P6 a terra num passo: o valor sem lançamento entra no bem novo; sem valor, o Salvar não vai ao banco', async () => {
    montar();
    await screen.findAllByTestId('patrimonio-linha');
    fireEvent.click(screen.getByTestId('patrimonio-novo'));
    await screen.findByTestId('bem-dialog');
    fireEvent.click(abaDoModal('Lançamentos')!);
    const ligar = await screen.findByTestId('bem-ligar');
    expect((ligar as HTMLButtonElement).disabled).toBe(true);
    expect(ligar.getAttribute('title')).toBe('salve o bem antes de ligar lançamentos');
    const editor = screen.getByTestId('bem-editor-valor');
    expect(editor.className).not.toContain('invisible');
    fireEvent.click(within(editor).getByRole('button', { name: 'Valor sem lançamento' }));
    fireEvent.click(screen.getByTestId('bem-salvar'));
    expect(salvarBem).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('bem-editor-valor')).getByRole('textbox').className).toContain('border-destructive');
  });

  it('P7 B2: código na lista e no modal; placa/Renavam só em Veículos (lugar reservado); identificação antiga só leitura; o salvar não manda o antigo', async () => {
    montar();
    await screen.findAllByTestId('patrimonio-linha');
    const cab = screen.getAllByRole('columnheader').map(th => th.textContent);
    expect(cab.slice(0, 3)).toEqual(['Data', 'Código', 'Bem']);
    const hilux = screen.getAllByTestId('patrimonio-linha').find(tr => tr.textContent?.includes('Caminhonete sintética'))!;
    expect(within(hilux).getByTestId('patrimonio-codigo').textContent).toBe('VEI-1000');
    /* a busca pela placa acha a caminhonete */
    fireEvent.change(screen.getByTestId('patrimonio-busca'), { target: { value: 'eum1e62' } });
    expect(screen.getAllByTestId('patrimonio-linha').map(tr => within(tr).getByTestId('patrimonio-codigo').textContent)).toEqual(['VEI-1000']);
    fireEvent.change(screen.getByTestId('patrimonio-busca'), { target: { value: '' } });
    /* o veículo: código no título e no campo só leitura; Placa e Renavam à vista */
    fireEvent.click(screen.getAllByTestId('patrimonio-linha').find(tr => tr.textContent?.includes('Caminhonete sintética'))!);
    await screen.findByTestId('bem-dialog');
    await waitFor(() => expect((screen.getByTestId('bem-codigo') as HTMLInputElement).value).toBe('VEI-1000'));
    expect(within(screen.getByTestId('bem-dialog')).getByText('VEI-1000 · Caminhonete sintética')).toBeTruthy();
    expect((screen.getByTestId('bem-codigo') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByTestId('bem-placa').parentElement?.className).not.toContain('invisible');
    expect((screen.getByTestId('bem-placa') as HTMLInputElement).value).toBe('EUM1E62');
    expect(screen.getByTestId('bem-identificacao-antiga').className).toContain('invisible');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    /* a máquina com só o campo antigo: Placa/Renavam com o lugar reservado (invisível); a identificação antiga à vista, só leitura */
    fireEvent.click(screen.getAllByTestId('patrimonio-linha').find(tr => tr.textContent?.includes('Grade antiga sintética'))!);
    await screen.findByTestId('bem-dialog');
    await waitFor(() => expect(screen.getByTestId('bem-identificacao-antiga').className).not.toContain('invisible'));
    const antiga = within(screen.getByTestId('bem-identificacao-antiga')).getByRole('textbox') as HTMLInputElement;
    expect(antiga.value).toBe('Baldan série 1610 nº 4471');
    expect(antiga.readOnly).toBe(true);
    expect(screen.getByTestId('bem-placa').parentElement?.className).toContain('invisible');
    expect(screen.getByTestId('bem-renavam').parentElement?.className).toContain('invisible');
    /* o salvar: os campos novos vão, o antigo NÃO */
    fireEvent.change(screen.getByTestId('bem-chassi'), { target: { value: '9bw zzz' } });
    fireEvent.click(screen.getByTestId('bem-salvar'));
    await waitFor(() => expect(salvarBem).toHaveBeenCalled());
    const enviado = payloadDoBem(salvarBem.mock.calls[0][0]);
    expect('identificacao' in enviado).toBe(false);
    expect(enviado).toMatchObject({ chassi: '9bw zzz', placa: null, renavam: null, numero_serie: null, numero_proprio: null });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    /* o bem novo: "gerado ao salvar" */
    fireEvent.click(screen.getByTestId('patrimonio-novo'));
    await screen.findByTestId('bem-dialog');
    expect((screen.getByTestId('bem-codigo') as HTMLInputElement).placeholder).toBe('gerado ao salvar');
    expect((screen.getByTestId('bem-codigo') as HTMLInputElement).value).toBe('');
  }, 15000);

  it('P8 o cabeçalho da lista clareia o navy no hover, nunca troca o fundo por branco', async () => {
    montar();
    await screen.findAllByTestId('patrimonio-linha');
    for (const th of screen.getAllByRole('columnheader')) {
      expect(th.className).toContain('hover:brightness-110');
      expect(th.className).not.toMatch(/hover:bg-/);
    }
  });
});
