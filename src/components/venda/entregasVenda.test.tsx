/**
 * OC-ENTREGA-COMPACTA-01 (15/10/2026) — a aba Entrega/Recebimento com UMA tabela, nos tres tipos e nos dois estados.
 * Antes (OC-VENDA-ENTREGAS-01a): a tabela por saida da venda; este arquivo passou ao contrato novo sem afrouxar — o que a
 * tela oferece continua sendo so' o que `oc_saidas_adotaveis` devolve, e a recusa do banco continua fora do toast.
 * Numeros dos casos reais: venda 4520abbd (NJ, 10 lotes), abate 9b2b5e6b (NJ, 4 lotes), compra 339c2e99 (Santa Rita, 8 lotes).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { EntregasVendaTabela, EnviarTodosDialog, COLUNAS_DA_ENTREGA } from './EntregasVendaTabela';
import { AbaRecebimentoLotes } from '@/components/compra/AbaRecebimentoLotes';
import {
  linhasDaEntrega, totaisDaEntrega, precoDoContrato, itensEnviarTodos, datasFaltando, VOCABULARIO_ENTREGA,
} from '@/lib/oc/entregasPorLote';
import type { RecebimentoApi, LoteRecebimento, MovimentacaoOC, SaidaAdotavel } from '@/hooks/useOperacaoRecebimento';
import type { LadoContaCorrente } from '@/lib/oc/contaCorrente';

const lote = (o: Partial<LoteRecebimento>): LoteRecebimento => ({
  loteId: 'l1', ordem: 1, categoria: 'desmama_m', qtdNegociada: 178, qtdRecebida: 0, diferenca: 178,
  estado: 'nao_iniciado', pesoMedioNegociadoKg: 248.21, criterioValor: 'kg', valorInformado: 12.8, ...o,
});
const mov = (o: Partial<MovimentacaoOC>): MovimentacaoOC => ({
  id: 'm1', loteId: 'l1', data: '2025-03-19', categoria: 'desmama_m', quantidade: 178, pesoMedio: 248.21,
  cancelado: false, origem: 'adotada', lancamentoId: 'ef0a8a40-19d1-47f3-aaba-9acc82524e49', valorTotal: 565521.66, ...o,
});
const L1 = lote({ qtdRecebida: 178, diferenca: 0, estado: 'completo' });
const L7 = lote({ loteId: 'l7', ordem: 7, categoria: 'garrotes', qtdNegociada: 11, diferenca: 11, pesoMedioNegociadoKg: 189.82, valorInformado: 12 });
const ADOTAVEIS: SaidaAdotavel[] = [
  { lancamentoId: '81e41593-d0aa-4963-bd01-99670d2c0af2', data: '2025-06-25', categoria: 'garrotes', quantidade: 11,
    pesoMedio: 189.82, valorTotal: 25056.24, origemRegistro: 'importacao_historica', criadoEm: '2026-04-13T10:00:00Z' },
  { lancamentoId: '5293daf3-85bc-4c4c-85fd-751d0dbb197c', data: '2025-05-21', categoria: 'garrotes', quantidade: 6,
    pesoMedio: 234.77, valorTotal: 18031.09, origemRegistro: 'importacao_historica', criadoEm: '2026-04-13T10:00:00Z' },
];
const catLabel = (s: string | null | undefined) => (s === 'desmama_m' ? 'Desmama M' : s === 'garrotes' ? 'Garrotes' : s ?? '—');

function apiFalsa(o: Partial<RecebimentoApi> = {}): RecebimentoApi {
  return {
    lotes: [L1, L7], movimentacoes: [mov({})], loading: false, saving: false,
    concluirNegociacao: vi.fn(), receberTodos: vi.fn(), registrar: vi.fn(), estornar: vi.fn(), encerrar: vi.fn(),
    reabrir: vi.fn(), estornarTudo: vi.fn(), recarregar: vi.fn(),
    listarAdotaveis: vi.fn(async () => ({ saidas: ADOTAVEIS, erro: null })),
    adotar: vi.fn(async () => null), desvincular: vi.fn(async () => null),
    ...o,
  };
}
function montar(api: RecebimentoApi, extra: { onRegistrarNova?: (id: string) => void; onEstornar?: (id: string) => void; onRecusa?: (m: string | null) => void } = {}) {
  return render(<EntregasVendaTabela api={api} catLabel={catLabel} readOnly={false} fazendaNome="Faz. Sta. Rita"
    contraparteNome="Helder Hofig" onRegistrarNova={extra.onRegistrarNova ?? vi.fn()} onEstornar={extra.onEstornar ?? vi.fn()}
    onRecusa={extra.onRecusa} />);
}
/* o menu do Radix abre no jsdom pelo teclado */
const abrirMenu = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });

/* ── os casos reais (lidos do proto em 15/10) ─────────────────────────────────────────────────── */
const real = (dados: [number, string, number, number, number, string, number, number][]) => ({
  lotes: dados.map(([o, cat, neg, pm]) => lote({ loteId: `l${o}`, ordem: o, categoria: cat, qtdNegociada: neg, qtdRecebida: neg, diferenca: 0,
    estado: 'completo', pesoMedioNegociadoKg: pm })),
  movs: dados.map(([o, cat, , , q, data, pm, valor]) => mov({ id: `m${o}`, loteId: `l${o}`, categoria: cat, quantidade: q, data, pesoMedio: pm, valorTotal: valor })),
});
const VENDA_4520 = real([
  [1, 'novilhas', 42, 372.42, 42, '2022-04-22', 372.42, 153287.82], [2, 'vacas', 8, 392.39, 8, '2022-04-22', 392.39, 30763.28],
  [3, 'novilhas', 50, 372.42, 50, '2022-04-22', 372.42, 182485.5], [4, 'novilhas', 50, 372.42, 50, '2022-04-22', 372.42, 182485.5],
  [5, 'novilhas', 50, 372.42, 50, '2022-04-22', 372.42, 182485.5], [6, 'vacas', 48, 392.39, 48, '2022-04-22', 392.39, 184579.68],
  [7, 'vacas', 48, 392.84, 48, '2022-04-22', 392.84, 184790.68], [8, 'vacas', 19, 433.67, 19, '2022-05-17', 433.67, 80749.69],
  [9, 'vacas', 46, 402.99, 46, '2022-05-17', 402.99, 181667.8], [10, 'vacas', 46, 402.99, 46, '2022-05-17', 402.99, 181667.8],
]);
const ABATE_9B2B = real([
  [1, 'garrotes', 41, 540.22, 41, '2026-04-15', 540.22, 314915.61], [2, 'garrotes', 20, 548.6, 20, '2026-04-15', 548.6, 155084.79],
  [3, 'novilhas', 20, 437, 20, '2026-04-15', 437, 113069.41], [4, 'novilhas', 20, 440.8, 20, '2026-04-15', 440.8, 116994.53],
]);

describe('o dono dos numeros (linhasDaEntrega / totaisDaEntrega)', () => {
  it('1 saida por lote: Neg. na linha, Dif. na linha, situacao feita', () => {
    const [ln] = linhasDaEntrega([L1], [mov({})]);
    expect(ln.tipo).toBe('saida');
    expect([ln.negCab, ln.negKg, ln.tipo === 'saida' && ln.dif, ln.situacao]).toEqual([178, 248.21, 0, 'feita']);
  });
  it('2 saidas no mesmo lote: Neg. so na 1a, Dif. so na ultima (na ordem da data)', () => {
    const l = lote({ qtdNegociada: 10, qtdRecebida: 10, diferenca: 0, estado: 'completo' });
    const linhas = linhasDaEntrega([l], [mov({ id: 'b', data: '2025-03-20', quantidade: 4 }), mov({ id: 'a', data: '2025-03-19', quantidade: 6 })]);
    expect(linhas.map(x => (x.tipo === 'saida' ? [x.mov.id, x.negCab, x.dif] : null))).toEqual([['a', 10, null], ['b', null, 0]]);
  });
  it('lote parcial: as saidas dizem "parcial" e ganha a linha que falta, com o saldo; lote sem saida so a linha que falta', () => {
    const parcial = lote({ loteId: 'p', ordem: 7, qtdNegociada: 5, qtdRecebida: 3, diferenca: 2, estado: 'parcial' });
    const nada = lote({ loteId: 'n', ordem: 8, qtdNegociada: 4, qtdRecebida: 0, diferenca: 4 });
    const linhas = linhasDaEntrega([nada, parcial], [mov({ id: 'p1', loteId: 'p', quantidade: 3 })]);
    expect(linhas.map(x => [x.lote.loteId, x.tipo, x.situacao, x.tipo === 'pendente' ? x.falta : x.dif, x.negCab]))
      .toEqual([['p', 'saida', 'parcial', -2, 5], ['p', 'pendente', 'falta', 2, null], ['n', 'pendente', 'falta', 4, 4]]);
  });
  it('o total e a faixa: venda 4520abbd 407/407 · 387,35 kg · 1.544.963,25; abate 9b2b5e6b 101/101 · 501,75 kg · 700.064,34', () => {
    expect(totaisDaEntrega(VENDA_4520.lotes, VENDA_4520.movs)).toMatchObject({ entregue: 407, negociado: 407, saldo: 0, kgMedio: 387.35,
      cab: 407, dif: 0, valor: 1544963.25, ultimaData: '2022-05-17' });
    expect(totaisDaEntrega(ABATE_9B2B.lotes, ABATE_9B2B.movs)).toMatchObject({ entregue: 101, negociado: 101, kgMedio: 501.75, valor: 700064.34 });
  });
  it('kg medio PONDERADO pelas cabecas (nunca media simples das linhas)', () => {
    const l = lote({ qtdNegociada: 11, qtdRecebida: 11 });
    const t = totaisDaEntrega([l], [mov({ id: 'a', quantidade: 10, pesoMedio: 500 }), mov({ id: 'b', quantidade: 1, pesoMedio: 280 })]);
    expect(t.kgMedio).toBe(480); /* (5000 + 280) / 11; a media simples daria 390 */
  });
  it('a estornada nao entra em linha nem no total; o preco do contrato; "enviar todos" so com saldo', () => {
    const linhas = linhasDaEntrega([L7, L1], [mov({}), mov({ id: 'est', loteId: 'l7', cancelado: true, origem: 'registrada' })]);
    expect(linhas.map(l => [l.lote.loteId, l.tipo])).toEqual([['l1', 'saida'], ['l7', 'pendente']]);
    expect(precoDoContrato({ criterioValor: 'kg', valorInformado: 12.8 })).toBe('12,80/kg');
    expect(precoDoContrato({ criterioValor: 'kg', valorInformado: null })).toBe('—');
    expect(itensEnviarTodos([L1, L7], '2025-03-19')).toEqual([{ loteId: 'l7', falta: 11, data: '2025-03-19' }]);
    expect([...datasFaltando([{ loteId: 'l7', data: '' }, { loteId: 'l1', data: '2025-06-25' }])]).toEqual(['l7']);
  });
});

describe('a tabela unica', () => {
  it('uma informacao por coluna, na ordem do mock; o cabecalho alinha como a celula; linha de 22px que nao quebra', () => {
    const { container } = montar(apiFalsa());
    const ths = [...container.querySelectorAll('thead th')];
    expect(ths.map(t => t.textContent)).toEqual(['Lote', 'Categoria', 'Neg. cab', 'Neg. kg', 'Data', 'Cab', 'Kg méd.', 'Dif.', 'Valor R$', 'Situação', 'Ações']);
    const saida = container.querySelector('[data-linha="saida"]') as HTMLElement;
    [...saida.querySelectorAll('td')].forEach((td, i) => {
      const alinha = COLUNAS_DA_ENTREGA[i].alinha === 'dir' ? 'text-right' : COLUNAS_DA_ENTREGA[i].alinha === 'centro' ? 'text-center' : 'text-left';
      if (i !== 1) expect(ths[i].className).toContain(alinha);
      expect(td.className).toContain('whitespace-nowrap');
      expect(td.className).toContain('h-[22px]');
    });
    expect(container.querySelector('table')!.className).toContain('table-fixed');
    expect(within(saida).getByText('19/03/25')).toBeTruthy();
    expect(within(saida).getByText('565.521,66')).toBeTruthy();
  });

  it('linha que falta: amarela, o saldo em Cab negrito ambar, "a entregar" e a acao na propria linha', () => {
    const { container } = montar(apiFalsa());
    const pend = container.querySelector('[data-linha="pendente"]') as HTMLElement;
    expect(pend.className).toContain('bg-amber-50');
    expect(within(pend).getByTestId('saldo-do-lote').textContent).toBe('11');
    expect(within(pend).getByTestId('saldo-do-lote').className).toContain('font-semibold');
    expect(within(pend).getByText('a entregar')).toBeTruthy();
    expect(within(pend).getByTestId('acao-pendente').textContent).toBe('enviar ▾');
  });

  it('venda: saida ADOTADA tem "desvincular" no menu (nunca estornar); a recusa vai ao pai, sem toast', async () => {
    const desvincular = vi.fn(async () => 'Entrega ja encerrada; reabra a entrega para desvincular');
    const onRecusa = vi.fn();
    const { container } = montar(apiFalsa({ desvincular }), { onRecusa });
    abrirMenu(within(container.querySelector('[data-linha="saida"]') as HTMLElement).getByTestId('acoes-saida'));
    expect(screen.queryByText('estornar')).toBeNull();
    fireEvent.click(await screen.findByText('desvincular'));
    await waitFor(() => expect(onRecusa).toHaveBeenLastCalledWith('Entrega ja encerrada; reabra a entrega para desvincular'));
    expect(desvincular).toHaveBeenCalledWith('m1');
  });

  it('venda: saida REGISTRADA tem "estornar" no menu, nunca "desvincular"', async () => {
    const onEstornar = vi.fn();
    const { container } = montar(apiFalsa({ movimentacoes: [mov({ origem: 'registrada', id: 'reg' })] }), { onEstornar });
    abrirMenu(within(container.querySelector('[data-linha="saida"]') as HTMLElement).getByTestId('acoes-saida'));
    expect(screen.queryByText('desvincular')).toBeNull();
    fireEvent.click(await screen.findByText('estornar'));
    expect(onEstornar).toHaveBeenCalledWith('reg');
  });

  it('venda: "enviar ▾" oferece Adotar e Registrar nova; o seletor (por cima) mostra SO o que o banco devolveu', async () => {
    const onRegistrarNova = vi.fn();
    const api = apiFalsa();
    const { container } = montar(api, { onRegistrarNova });
    const acao = within(container.querySelector('[data-linha="pendente"]') as HTMLElement).getByTestId('acao-pendente');
    abrirMenu(acao);
    fireEvent.click(await screen.findByText('Registrar nova saída'));
    expect(onRegistrarNova).toHaveBeenCalledWith('l7');
    abrirMenu(acao);
    fireEvent.click(await screen.findByText('Adotar saída já lançada'));
    await waitFor(() => expect(document.querySelectorAll('[data-adotavel]').length).toBe(2));
    expect(api.listarAdotaveis).toHaveBeenCalledWith('l7');
    expect([...document.querySelectorAll('[data-adotavel]')].map(e => e.getAttribute('data-adotavel'))).toEqual(ADOTAVEIS.map(s => s.lancamentoId));
    expect(document.querySelector('[data-testid="seletor-adocao"] input[type="text"]')).toBeNull();
    expect(screen.getByText('81e41593 · importado 13/04')).toBeTruthy();
    fireEvent.click(screen.getByText('Adotar 0 saídas'));
    expect(screen.getByRole('alert').textContent).toBe('Selecione ao menos uma saída.');
    expect(api.adotar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Selecionar saída de 25/06/2025'));
    fireEvent.click(screen.getByText('Adotar 1 saída'));
    await waitFor(() => expect(api.adotar).toHaveBeenCalledWith('l7', ['81e41593-d0aa-4963-bd01-99670d2c0af2']));
    await waitFor(() => expect(document.querySelector('[data-testid="seletor-adocao"]')).toBeNull());
  });

  it('a recusa da adocao fica no seletor, ao lado do botao', async () => {
    const api = apiFalsa({ adotar: vi.fn(async () => 'Saida nao pode ser adotada: Saida ja pertence a uma operacao comercial') });
    const { container } = montar(api);
    abrirMenu(within(container.querySelector('[data-linha="pendente"]') as HTMLElement).getByTestId('acao-pendente'));
    fireEvent.click(await screen.findByText('Adotar saída já lançada'));
    await waitFor(() => expect(document.querySelectorAll('[data-adotavel]').length).toBe(2));
    fireEvent.click(screen.getByLabelText('Selecionar saída de 21/05/2025'));
    fireEvent.click(screen.getByText('Adotar 1 saída'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('ja pertence a uma operacao comercial'));
    expect(document.querySelector('[data-testid="seletor-adocao"]')).not.toBeNull();
  });

  it('abate (sem adocao): "estornar" e "enviar" diretos, e o 📎 do lote', () => {
    const onEstornar = vi.fn(); const onRegistrarNova = vi.fn(); const onDocumento = vi.fn();
    const { container } = render(<EntregasVendaTabela api={apiFalsa({ movimentacoes: [mov({ origem: 'registrada', id: 'r1' })] })} catLabel={catLabel}
      readOnly={false} lado="abate" comAdocao={false} onRegistrarNova={onRegistrarNova} onEstornar={onEstornar} onDocumento={onDocumento} />);
    fireEvent.click(within(container.querySelector('[data-linha="saida"]') as HTMLElement).getByText('estornar'));
    expect(onEstornar).toHaveBeenCalledWith('r1');
    fireEvent.click(within(container.querySelector('[data-linha="pendente"]') as HTMLElement).getByTestId('acao-pendente'));
    expect(onRegistrarNova).toHaveBeenCalledWith('l7');
    fireEvent.click(within(container.querySelector('[data-linha="pendente"]') as HTMLElement).getByLabelText('Registrar documento do lote'));
    expect(onDocumento).toHaveBeenCalledWith('l7');
  });

  it('linha de Total: Neg. cab, Cab, Kg med. ponderado, Dif. e Valor do dono', () => {
    const api = apiFalsa({ lotes: VENDA_4520.lotes, movimentacoes: VENDA_4520.movs });
    const { container } = montar(api);
    const total = container.querySelector('[data-testid="total-entrega"]') as HTMLElement;
    expect([...total.querySelectorAll('td')].map(t => t.textContent)).toEqual(['Total', '407', '', '', '407', '387,35', '0', '1.544.963,25', '', '']);
  });

  it('com a entrega encerrada (leitura) nenhuma acao de gado aparece', () => {
    const { container } = render(<EntregasVendaTabela api={apiFalsa()} catLabel={catLabel} readOnly fazendaNome={null} contraparteNome={null}
      onRegistrarNova={vi.fn()} onEstornar={vi.fn()} />);
    expect(container.querySelector('[data-testid="acoes-saida"]')).toBeNull();
    expect(container.querySelector('[data-testid="acao-pendente"]')).toBeNull();
  });
});

describe('o vocabulario, um so', () => {
  const montarAba = (lado: LadoContaCorrente, encerrada: boolean) => render(<AbaRecebimentoLotes
    api={apiFalsa()} operacaoPronta concluida encerrada={encerrada} isCompra={lado === 'compra'} lado={lado}
    categoriasDisponiveis={[]} adocao={lado === 'abate' ? undefined : { fazendaNome: 'Faz', contraparteNome: 'X', lado }} />);
  const textoDaTela = () => {
    const attrs = [...document.querySelectorAll('[title],[aria-label],[placeholder]')]
      .map(e => `${e.getAttribute('title') ?? ''} ${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('placeholder') ?? ''}`);
    return `${document.body.textContent} ${attrs.join(' ')}`;
  };
  for (const lado of ['venda', 'abate', 'compra'] as LadoContaCorrente[]) {
    it(`${lado}: ${lado === 'compra' ? 'sem "entreg"' : 'sem "receb"'} na aba aberta, encerrada e nos dialogos de encerrar e reabrir`, () => {
      const proibido = lado === 'compra' ? /entreg/i : /receb/i;
      const a = montarAba(lado, false);
      fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
      expect(textoDaTela()).not.toMatch(proibido);
      a.unmount();
      const e = montarAba(lado, true);
      fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
      expect(textoDaTela()).not.toMatch(proibido);
      e.unmount();
      expect(JSON.stringify(VOCABULARIO_ENTREGA[lado])).not.toMatch(proibido);
    });
  }
});

describe('"<Verbo> todos" — uma data por linha (D3)', () => {
  it('manda a data de CADA lote; data apagada fica vermelha, com a frase, e nada e' + "' enviado", () => {
    const onConfirmar = vi.fn();
    const L6 = lote({ loteId: 'l6', ordem: 6, categoria: 'garrotes', qtdNegociada: 6, diferenca: 6 });
    render(<EnviarTodosDialog lotes={[L1, L6, L7]} dataPadrao="2025-03-19" catLabel={catLabel}
      saving={false} onConfirmar={onConfirmar} onFechar={vi.fn()} />);
    const linhas = document.querySelectorAll('[data-enviar]');
    expect([...linhas].map(l => l.getAttribute('data-enviar'))).toEqual(['l6', 'l7']);
    const campo = within(linhas[1] as HTMLElement).getByRole('textbox');
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByText('Enviar 2 lotes'));
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText('Informe a data da saída.')).toBeTruthy();
    fireEvent.change(campo, { target: { value: '25/06/2025' } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByText('Enviar 2 lotes'));
    expect(onConfirmar).toHaveBeenCalledWith({ l6: '2025-03-19', l7: '2025-06-25' });
  });
});
