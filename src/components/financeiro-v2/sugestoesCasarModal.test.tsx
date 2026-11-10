/**
 * PR-CONC-SUGESTOES-CASAR-01 — o modal "Sugestões para casar" e o casar que abre o `CasarComBancoModal` preenchido.
 *
 * ⚠ jsdom NÃO FAZ LAYOUT: "nada cortado", a data numa linha e a largura se medem no gate (`casar-sugestoes*`). Aqui se prova a
 *   ESTRUTURA — CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36): o extrato numa faixa própria (o título), a TABELA DA LISTA DO
 *   FINANCEIRO com as colunas dele, uma linha por lançamento, o motivo curto (o inteiro no title), os selos (azul tracejado = confere;
 *   âmbar = conferir antes), as caixinhas que somam no rodapé e o "Casar selecionados" — e o valor do banco no campo com "era R$ X".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { sugerirCasamentos, type CandidatoSugestao, type Sugestao } from '@/lib/conciliacao/sugestoesCasamento';

const RPC = vi.hoisted(() => {
  const r: { chamadas: { fn: string; args: Record<string, unknown> }[]; tabelas: Record<string, unknown[]> } = { chamadas: [], tabelas: {} };
  return r;
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    /* CONC-SUGESTOES-TABELA-01 — o complemento (pagamento, fazenda, NF) é lido pelos ids: `from(t).select().eq().in()` */
    from: (t: string) => { const q = { select: () => q, eq: () => q, in: () => Promise.resolve({ data: RPC.tabelas[t] ?? [], error: null }) }; return q; },
    rpc: (fn: string, args: Record<string, unknown>) => {
      RPC.chamadas.push({ fn, args });
      return Promise.resolve({ data: { ok: true, no_extrato: 5665, soma: 5665, diferenca: 0 }, error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));

import { SugestoesCasarModal } from './SugestoesCasarModal';
import { CasarComBancoModal } from './CasarComBancoModal';

beforeEach(() => { RPC.chamadas = []; RPC.tabelas = {}; });

const c = (p: Partial<CandidatoSugestao> & { lancamento_id: string; valor_assinado: number }): CandidatoSugestao => ({
  data_vencimento: '2026-09-05', competencia: '2026-09-01', descricao: 'Folha de Pagamento', fornecedor: null,
  favorecido_id: null, status_transacao: 'previsto', ja_conciliado: false, ...p,
});
const EXT_RABO = { data: '2026-09-15', historico: 'Pagamento de Boleto - BANCO RABOBANK INTERNATIONAL BRASIL S/', valor: -26127.18 };
const CANDS: CandidatoSugestao[] = [
  c({ lancamento_id: 'princ', valor_assinado: -22719.29, fornecedor: 'Banco Rabobank International Brasil S/A', favorecido_id: 'rabo', data_vencimento: '2026-09-01', descricao: 'Financiamento - principal', status_transacao: 'programado' }),
  c({ lancamento_id: 'juros', valor_assinado: -3407.89, fornecedor: 'Banco Rabobank International Brasil S/A', favorecido_id: 'rabo', data_vencimento: '2026-08-20', descricao: 'Financiamento - juros' }),
  c({ lancamento_id: 'igual', valor_assinado: -26127.18, fornecedor: 'Posto Trevo', data_vencimento: '2026-09-14' }),
];

function abrir(onCasar = vi.fn(), candidatos = CANDS, extrato = EXT_RABO) {
  /* A lista chega pronta, como a Conferência a entrega: o motor roda fora do modal. */
  const sugestoes = sugerirCasamentos(extrato, candidatos);
  render(<SugestoesCasarModal open onClose={() => {}} extrato={extrato} nomeConta="Banco do Brasil" sugestoes={sugestoes} onCasar={onCasar} />);
  return { modal: screen.getByTestId('sugestoes-casar'), onCasar };
}

describe('o modal "Sugestões para casar"', () => {
  /* P159c (1): o banco vai no TÍTULO; o bloco "banco / histórico" do topo saiu */
  it('cabeçalho navy com "Sugestões para casar · <conta>" (com "…" e o título inteiro no title); sem o bloco do topo', () => {
    const { modal } = abrir();
    const titulo = within(modal).getByText('Sugestões para casar · Banco do Brasil');
    expect(titulo.closest('div')!.className).toContain('bg-primary');
    expect(titulo.getAttribute('title')).toBe('Sugestões para casar · Banco do Brasil');
    expect(titulo.className).toContain('truncate');
    expect(titulo.hasAttribute('data-reticencias-com-title')).toBe(true);
    expect(within(modal).queryByText('banco')).toBeNull();
    expect(within(modal).queryByText('histórico')).toBeNull();
  });

  /* CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36) — o extrato é o TÍTULO, numa faixa própria, fora da tabela */
  it('o lançamento do extrato é uma faixa própria acima das sugestões: rótulo · data · texto do banco · valor (em negrito, maior)', () => {
    const { modal } = abrir();
    const faixa = within(modal).getByTestId('sugestoes-extrato');
    expect(faixa.tagName).toBe('DIV');
    expect(faixa.closest('table')).toBeNull();
    expect(faixa.textContent).toContain('Lançamento do extrato');
    expect(within(faixa).getByTestId('sugestoes-extrato-data').textContent).toBe('15/09/2026');
    const nome = within(faixa).getByTestId('sugestoes-extrato-nome');
    expect(nome.textContent).toBe('Pagamento de Boleto · BANCO RABOBANK INTERNATIONAL BRASIL S/');
    expect(nome.className).toContain('truncate');
    expect(nome.getAttribute('title')).toBe(`Pagamento de Boleto · BANCO RABOBANK INTERNATIONAL BRASIL S/\n${EXT_RABO.historico}`);
    expect(within(faixa).getByTestId('sugestoes-extrato-valor').textContent).toBe('-26.127,18');
    /* CONC-SUGESTOES-FONTE-01: a faixa um degrau menor (28px, 11; o valor 13) */
    expect(within(faixa).getByTestId('sugestoes-extrato-valor').className).toMatch(/text-\[13px\] font-bold/);
    expect(faixa.className).toMatch(/\bh-\[28px\].*\btext-\[11px\]/);
    expect(modal.querySelector('h2')!.className).toContain('text-[11px]');
    /* a tabela só tem os lançamentos */
    expect(modal.querySelector('table tbody')!.textContent).not.toContain('RABOBANK INTERNATIONAL BRASIL S/');
  });

  /* CONC-SUGESTOES-TABELA-01 — a TABELA DA LISTA DO FINANCEIRO (`TabelaDaLista`): as mesmas peças, as larguras e a classe das fontes */
  it('a tabela é a da lista do Financeiro: ☐ · Comp. · Venc. · Pgto. · Descrição · Fornecedor · Faz. · NF · Valor · Status · Motivo · casar', () => {
    const { modal } = abrir();
    const t = modal.querySelector('table')!;
    expect(t.className).toContain('table-financeiro');
    /* CONC-SUGESTOES-FONTE-01 — o tamanho da lista do Financeiro (a variante grande de 04/11 saiu) e as larguras dela */
    expect(t.className).not.toContain('tabela-da-lista-grande');
    expect(t.style.tableLayout).toBe('fixed');
    expect([...t.querySelectorAll('col')].map((x) => (x instanceof HTMLElement ? x.style.width : '?')))
      .toEqual(['28px', '46px', '46px', '46px', '', '', '30px', '78px', '94px', '60px', '120px', '62px']);
    expect([...t.querySelectorAll('th')].map((x) => x.textContent)).toEqual(['', 'Comp.', 'Venc.', 'Pgto.', 'Descrição', 'Fornecedor', 'Faz.', 'NF', 'Valor', 'Status', 'Motivo', '']);
    const linhas = within(modal).getAllByTestId('sugestao');
    expect(linhas.length).toBeGreaterThan(0);
    for (const tr of linhas) {
      expect(tr.className).toContain('linha-da-lista');
      expect(tr.querySelectorAll('td.celula-data')).toHaveLength(3);
      expect(tr.querySelector('td.celula-valor')).not.toBeNull();
      expect(tr.querySelector('td.celula-doc')).not.toBeNull();
      expect(tr.querySelector('td.celula-status')).not.toBeNull();
    }
  });

  /* uma linha por lançamento (a soma: k/N em cada uma); o motivo curto, o inteiro no title */
  it('uma linha por LANÇAMENTO; o motivo curto (o inteiro no title): mesmo valor primeiro, a soma depois, por último as pistas de nome', () => {
    const { modal } = abrir();
    const linhas = within(modal).getAllByTestId('sugestao');
    const selos = linhas.map((l) => within(l).getByTestId('sugestao-motivo'));
    expect(selos.map((x) => x.textContent)).toEqual(['mesmo valor', '1/2 · soma de 2', '2/2 · soma de 2', 'nome · valor ≠', 'nome · valor ≠']);
    expect(selos.map((x) => x.getAttribute('title'))).toEqual([
      'mesmo valor', 'soma de 2 · 26 dias · vencido ago', 'soma de 2 · 26 dias · vencido ago', 'nome · valor diferente', 'nome · valor diferente · vencido ago',
    ]);
    expect(selos[0].className).toContain('border-dashed');
    expect(selos[3].className).toContain('bg-amber-50');
    /* cada lançamento com o SEU valor, na coluna Valor */
    expect(linhas.map((l) => (l.querySelector('td.celula-valor')!.textContent ?? '').replace(/\s/g, ' '))).toEqual(['-R$ 26.127,18', '-R$ 22.719,29', '-R$ 3.407,89', '-R$ 22.719,29', '-R$ 3.407,89']);
    expect(within(modal).getAllByTestId('sugestao-casar')).toHaveLength(5);
  });

  /* A REGRA DE CORTE (21/10): uma linha; texto com "…" e o inteiro no title; data dd/mm/aaaa nas três colunas */
  it('nada quebra: descrição e fornecedor cortam com o texto inteiro no title; as datas são dd/mm/aaaa', () => {
    const { modal } = abrir();
    for (const tr of within(modal).getAllByTestId('sugestao')) {
      const [desc, forn] = [...tr.querySelectorAll('td.truncate')];
      expect(desc.getAttribute('title')).toBe(desc.textContent);
      expect(forn.getAttribute('title') ?? '').toBe(forn.textContent === '-' ? '' : forn.textContent);
      for (const d of tr.querySelectorAll('td.celula-data')) expect(d.textContent).toMatch(/^(\d{2}\/\d{2}\/\d{4}|-)$/);
    }
    expect([...modal.querySelectorAll('td')].filter((td) => td.className.includes('whitespace-normal'))).toEqual([]);
  });

  it('valor diferente: selo âmbar cheio ("mesmo forn. · valor ≠", o motivo inteiro no title)', () => {
    const { modal } = abrir(vi.fn(), [
      c({ lancamento_id: 'amanda', valor_assinado: -3085, fornecedor: 'Amanda Montes Camargo' }),
    ], { data: '2026-09-04', historico: 'Pix - Agendamento - 04/09 05:35 CAMARGO PROMOCAO DE VENDA', valor: -5665 });
    const selo = within(modal).getByTestId('sugestao-motivo');
    expect(selo.textContent).toBe('mesmo forn. · valor ≠');
    expect(selo.getAttribute('title')).toBe('mesmo fornecedor · valor difere: previsto 3.085,00');
    expect(selo.className).toContain('bg-amber-50');
    expect(selo.className).not.toContain('border-dashed');
  });

  /* CONC-SUGESTOES-TABELA-01 — a seleção múltipla: as caixinhas somam no rodapé, e "Casar selecionados" entrega os marcados */
  it('as caixinhas somam no rodapé (N · soma · extrato · diferença) e "Casar selecionados" entrega os marcados ao hospedeiro', () => {
    const onCasarSelecionados = vi.fn();
    render(<SugestoesCasarModal open onClose={() => {}} extrato={EXT_RABO} nomeConta="Banco do Brasil" sugestoes={sugerirCasamentos(EXT_RABO, CANDS)}
      onCasar={() => {}} onCasarSelecionados={onCasarSelecionados} />);
    const modal = screen.getByTestId('sugestoes-casar');
    expect(within(modal).getByTestId('casar-selecionados')).toBeDisabled();
    expect(within(modal).getByTestId('selecionados-n').textContent).toBe('Selecionados 0');
    const linhas = within(modal).getAllByTestId('sugestao');
    fireEvent.click(within(linhas[1]).getByRole('checkbox'));
    fireEvent.click(within(linhas[2]).getByRole('checkbox'));
    expect(within(modal).getByTestId('selecionados-n').textContent).toBe('Selecionados 2');
    expect(within(modal).getByTestId('selecionados-soma').textContent).toBe('-26.127,18');
    expect(within(modal).getByTestId('selecionados-diferenca').textContent).toBe('0,00');
    /* desmarcar tira da soma */
    fireEvent.click(within(linhas[2]).getByRole('checkbox'));
    expect(within(modal).getByTestId('selecionados-soma').textContent).toBe('-22.719,29');
    expect(within(modal).getByTestId('selecionados-diferenca').textContent).toBe('3.407,89');
    fireEvent.click(within(linhas[2]).getByRole('checkbox'));
    fireEvent.click(within(modal).getByTestId('casar-selecionados'));
    expect(onCasarSelecionados).toHaveBeenCalledTimes(1);
    const marcados = onCasarSelecionados.mock.calls[0][0];
    expect(marcados.map((m: { de: string; c: { lancamento_id: string } }) => `${m.de}:${m.c.lancamento_id}`)).toEqual(['sugestao:princ', 'sugestao:juros']);
  });

  /* CONC-SUGESTOES-TABELA-01 — o que a lista do Financeiro mostra e a sugestão não trazia: Pgto., Faz. (o código) e a NF, lidos pelos ids */
  it('Pgto., Faz. e NF vêm da leitura pelos ids das linhas (o rótulo do Doc. é o do dono, "NF 000.123.456")', async () => {
    RPC.tabelas = {
      financeiro_lancamentos_v2: [{ id: 'igual', data_pagamento: '2026-09-14', fazenda_id: 'fz1', tipo_documento: 'Nota Fiscal', numero_documento: '000.123.456' }],
      fazendas: [{ id: 'fz1', nome: 'Fazenda Exemplo Retiro', codigo: 'RET' }],
    };
    render(<SugestoesCasarModal open onClose={() => {}} extrato={EXT_RABO} nomeConta="Banco do Brasil" sugestoes={sugerirCasamentos(EXT_RABO, CANDS)}
      onCasar={() => {}} clienteId="cli" />);
    const igual = within(screen.getByTestId('sugestoes-casar')).getAllByTestId('sugestao')[0];
    await waitFor(() => expect(igual.querySelector('td.celula-doc')!.textContent).toBe('NF 000.123.456'));
    expect(within(igual).getByTitle('Fazenda Exemplo Retiro').textContent).toBe('RET');
    expect(igual.querySelectorAll('td.celula-data')[2].textContent).toBe('14/09/2026');
    /* a busca sabe achar: a linha sem complemento fica com "-" (a ausência da lista do Financeiro) */
    const outra = within(screen.getByTestId('sugestoes-casar')).getAllByTestId('sugestao')[1];
    expect(outra.querySelector('td.celula-doc')!.textContent).toBe('-');
  });

  it('sem sugestão, diz "Nenhuma sugestão automática" (P159f); o rodapé explica as cores', () => {
    const { modal } = abrir(vi.fn(), []);
    expect(within(modal).getByText('Nenhuma sugestão automática')).toBeInTheDocument();
    expect(within(modal).getByText('âmbar = conferir antes de casar')).toBeInTheDocument();
    expect(within(modal).getByText('· mais provável primeiro')).toBeInTheDocument();
  });

  /* P153 — o "Procurar no histórico" fica embaixo das sugestões, no mesmo modal; sem quem receba o "Criar igual", não aparece */
  it('com o cliente e o "Criar igual", o Procurar no histórico aparece embaixo, com o nome do banco no campo', () => {
    const sugestoes = sugerirCasamentos(EXT_RABO, CANDS);
    const { unmount } = render(<SugestoesCasarModal open onClose={() => {}} extrato={EXT_RABO} nomeConta="Banco do Brasil" sugestoes={sugestoes}
      onCasar={() => {}} clienteId="cli" onCriarIgual={() => {}} />);
    const modal = screen.getByTestId('sugestoes-casar');
    expect(within(modal).getByTestId('procurar-historico')).toBeInTheDocument();
    expect(within(modal).getByTestId('procurar-historico-termo')).toHaveValue('BANCO RABOBANK INTERNATIONAL BRASIL S');
    unmount();
    const { modal: semProcurar } = abrir();
    expect(within(semProcurar).queryByTestId('procurar-historico')).toBeNull();
  });

  it('"casar" entrega a sugestão inteira (a soma com os dois lançamentos)', () => {
    const { modal, onCasar } = abrir();
    fireEvent.click(within(within(modal).getAllByTestId('sugestao')[1]).getByTestId('sugestao-casar'));
    const s: Sugestao = onCasar.mock.calls[0][0];
    expect(s.tipo).toBe('soma');
    expect(s.lancamentos.map((x) => x.lancamento_id).sort()).toEqual(['juros', 'princ']);
  });
});

describe('casar com valor diferente abre o CasarComBancoModal com o valor do banco', () => {
  const EXT = { extrato_id: 'e-amanda', data: '2026-09-04', historico: 'Pix - Agendamento - 04/09 05:35 CAMARGO PROMOCAO DE VENDA', valor: -5665 };
  it('o campo nasce com 5665,00 e a linha diz "era R$ 3.085,00"; o Conciliar manda esse valor à mesma RPC', async () => {
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXT} contaBancariaId="bb" nomeConta="Banco do Brasil" onConciliado={() => {}}
      iniciais={[{ lancamento_id: 'amanda', descricao: 'Folha de Pagamento', fornecedor: 'Amanda Montes Camargo', valor_assinado: -3085, usarValorDoBanco: true }]} />);
    const campo = screen.getByLabelText('Valor de Folha de Pagamento') as HTMLInputElement;
    expect(campo.value).toBe('5665,00');
    expect(screen.getByTestId('era-valor').textContent).toBe('era R$ 3.085,00');
    /* o "era" ocupa o lugar do botão: com o campo já no valor do banco, o botão não aparece */
    expect(screen.queryByTestId('usar-valor-banco')).toBeNull();
    await waitFor(() => expect(RPC.chamadas.length).toBeGreaterThan(0));
    expect(RPC.chamadas[0]).toMatchObject({ fn: 'fn_espelho_casar', args: { p_simular: true, p_itens: [{ lancamento_id: 'amanda', valor: 5665 }] } });
    /* voltar o campo ao valor antigo tira o "era" — ele só diz o que mudou */
    fireEvent.change(campo, { target: { value: '3085,00' } });
    expect(screen.queryByTestId('era-valor')).toBeNull();
    /* e o botão volta, para quem quiser o valor do banco de novo */
    expect(screen.getByTestId('usar-valor-banco')).toBeInTheDocument();
  });
  it('sem a marca (o caminho de sempre), o campo nasce com o valor do lançamento e não há "era"', () => {
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXT} contaBancariaId="bb" onConciliado={() => {}}
      iniciais={[{ lancamento_id: 'amanda', descricao: 'Folha de Pagamento', valor_assinado: -3085 }]} />);
    expect((screen.getByLabelText('Valor de Folha de Pagamento') as HTMLInputElement).value).toBe('3085,00');
    expect(screen.queryByTestId('era-valor')).toBeNull();
    expect(screen.getByTestId('usar-valor-banco')).toBeInTheDocument();
  });
});
