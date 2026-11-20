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
    /* UI-FONTE-GATE-01 (Gabriel 12/11): a faixa e o rodapé na régua — 28px, 10; o valor 11 em negrito */
    expect(within(faixa).getByTestId('sugestoes-extrato-valor').className).toMatch(/text-\[11px\] font-bold/);
    expect(faixa.className).toMatch(/\bh-\[28px\].*\btext-\[10px\]/);
    expect(within(modal).getByTestId('sugestoes-rodape').className).toContain('text-[10px]');
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
    /* UI-FONTE-GATE-01 (Chat 12/11 15:22): sem fazenda nem NF nas sugestões, Faz. e NF saem e a largura vai para Descrição/Fornecedor */
    expect([...t.querySelectorAll('col')].map((x) => (x instanceof HTMLElement ? x.style.width : '?')))
      .toEqual(['28px', '46px', '46px', '46px', '', '', '94px', '80px', '38px', '60px', '110px', '62px']);
    expect([...t.querySelectorAll('th')].map((x) => (x.textContent ?? '').replace(/⇅/g, ''))).toEqual(['', 'Comp.', 'Venc.', 'Pgto.', 'Descrição', 'Fornecedor', 'Valor', 'Δ valor', 'Δ dias', 'Status', 'Motivo', '']);
    /* UI-FONTE-GATE-01: o cabeçalho alinha como a coluna (texto à esquerda, número à direita), nunca tudo no centro */
    expect([...t.querySelectorAll('th')].map((x) => (/\btext-left\b/.test(x.className) ? 'E' : /\btext-right\b/.test(x.className) ? 'D' : 'C')))
      .toEqual(['C', 'C', 'C', 'C', 'E', 'E', 'D', 'D', 'D', 'C', 'E', 'C']);
    const linhas = within(modal).getAllByTestId('sugestao');
    expect(linhas.length).toBeGreaterThan(0);
    for (const tr of linhas) {
      expect(tr.className).toContain('linha-da-lista');
      expect(tr.querySelectorAll('td.celula-data')).toHaveLength(3);
      expect(tr.querySelector('td.celula-valor')).not.toBeNull();
      expect(tr.querySelector('td.celula-doc')).toBeNull(); // sem NF na lista, a coluna sai (UI-FONTE-GATE-01)
      expect(tr.querySelector('td.celula-status')).not.toBeNull();
    }
  });

  /* uma linha por lançamento (a soma: k/N em cada uma); o motivo curto, o inteiro no title */
  it('uma linha por LANÇAMENTO, SEM repetir (homologação Edson 11:40, D1): o mesmo lançamento em 2 sugestões fica UMA vez, com o motivo mais forte', () => {
    const { modal } = abrir();
    const linhas = within(modal).getAllByTestId('sugestao');
    const selos = linhas.map((l) => within(l).getByTestId('sugestao-motivo'));
    /* os dois da soma também vinham de novo como "nome · valor ≠": agora ficam só na soma (a 1ª, a mais forte) */
    expect(selos.map((x) => x.textContent)).toEqual(['mesmo valor', '1/2 · soma de 2', '2/2 · soma de 2']);
    expect(selos.map((x) => x.getAttribute('title'))).toEqual(['mesmo valor', '1/2 · soma de 2 — soma de 2 · 26 dias · vencido ago', '2/2 · soma de 2 — soma de 2 · 26 dias · vencido ago']);
    expect(selos[0].className).toContain('border-dashed');
    /* cada lançamento com o SEU valor, na coluna Valor */
    expect(linhas.map((l) => (l.querySelector('td.celula-valor')!.textContent ?? '').replace(/\s/g, ' '))).toEqual(['-R$ 26.127,18', '-R$ 22.719,29', '-R$ 3.407,89']);
    /* UI-FONTE-GATE-01 (Chat 12/11 14:12): a ação é "Casar", a mesma grafia do Procurar no histórico */
    expect(within(modal).getAllByTestId('sugestao-casar').map((b) => b.textContent)).toEqual(Array(3).fill('Casar'));
  });

  it('D2: marcar/desmarcar cada linha mexe SÓ nela (sem a linha repetida, o mesmo id não marca duas)', () => {
    const { modal } = abrir();
    const caixas = () => within(modal).getAllByTestId('sugestao').map((l) => l.querySelector('[role="checkbox"]'));
    const marcadas = () => caixas().map((c) => c?.getAttribute('aria-checked') === 'true');
    fireEvent.click(caixas()[1]!);
    expect(marcadas()).toEqual([false, true, false]);
    fireEvent.click(caixas()[2]!);
    expect(marcadas()).toEqual([false, true, true]);
    fireEvent.click(caixas()[1]!);
    expect(marcadas()).toEqual([false, false, true]);
  });

  it('D3: TODAS as colunas ordenam pelo cabeçalho (regra 29/10): Valor, Δ valor e Motivo; clicar de novo inverte', () => {
    const { modal } = abrir();
    /* 12:02: a seta ⇅ aparece (apagada) em TODA coluna que ordena, antes de clicar */
    expect(within(modal).getByTestId('sugestoes-ordenar-descricao').textContent).toContain('⇅');
    const valores = () => within(modal).getAllByTestId('sugestao').map((l) => (l.querySelector('td.celula-valor')!.textContent ?? '').replace(/\s/g, ' '));
    /* o valor COM SINAL, o mesmo critério do Procurar no histórico (1º clique desce; o 2º inverte) */
    fireEvent.click(within(modal).getByTestId('sugestoes-ordenar-valor'));
    expect(valores()).toEqual(['-R$ 3.407,89', '-R$ 22.719,29', '-R$ 26.127,18']);
    fireEvent.click(within(modal).getByTestId('sugestoes-ordenar-valor'));
    expect(valores()).toEqual(['-R$ 26.127,18', '-R$ 22.719,29', '-R$ 3.407,89']);
    for (const c of ['comp', 'venc', 'pgto', 'descricao', 'fornecedor', 'valor', 'dvalor', 'ddias', 'status', 'motivo']) {
      expect(within(modal).getByTestId(`sugestoes-ordenar-${c}`)).toBeTruthy();
    }
    fireEvent.click(within(modal).getByTestId('sugestoes-ordenar-motivo'));
    expect(within(modal).getAllByTestId('sugestao-motivo').map((x) => x.textContent)).toEqual(['1/2 · soma de 2', '2/2 · soma de 2', 'mesmo valor']);
  });

  /* A REGRA DE CORTE (21/10): uma linha; texto com "…" e o inteiro no title; data dd/mm/aaaa nas três colunas */
  /* UI-FONTE-GATE-01 (regra do Gabriel, Chat 12/11 15:22): nome NUNCA corta — Descrição e Fornecedor quebram na célula (a linha cresce);
     data, valor e status seguem numa linha */
  it('CONC-CRIAR-COM-NOTA-02 D-g: LINHA ÚNICA — nada quebra (descrição e fornecedor com "…" e o inteiro no title); Δ valor e Δ dias com cor; datas dd/mm/aaaa', () => {
    const { modal } = abrir();
    for (const tr of within(modal).getAllByTestId('sugestao')) {
      expect([...tr.querySelectorAll('td')].filter((td) => td.className.includes('whitespace-normal'))).toHaveLength(0);
      expect(within(tr).getByTestId('sugestao-delta-valor').textContent).toMatch(/^(0,00|[+−][\d.]+,\d{2})$/);
      expect(within(tr).getByTestId('sugestao-delta-dias').textContent).toMatch(/^(0|[+−]\d+|—)$/);
      for (const d of tr.querySelectorAll('td.celula-data')) expect(d.textContent).toMatch(/^(\d{2}\/\d{2}\/\d{4}|-)$/);
    }
  });

  it('valor diferente: selo âmbar cheio ("mesmo forn. · valor ≠", o motivo inteiro no title)', () => {
    const { modal } = abrir(vi.fn(), [
      c({ lancamento_id: 'amanda', valor_assinado: -3085, fornecedor: 'Amanda Montes Camargo' }),
    ], { data: '2026-09-04', historico: 'Pix - Agendamento - 04/09 05:35 CAMARGO PROMOCAO DE VENDA', valor: -5665 });
    const selo = within(modal).getByTestId('sugestao-motivo');
    expect(selo.textContent).toBe('mesmo forn. · valor ≠');
    expect(selo.getAttribute('title')).toBe('mesmo forn. · valor ≠ — mesmo fornecedor · valor difere: previsto 3.085,00');
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
  /* CONC-CASAR-1X1-TABELA-01: o 1:1 é a tabela do Casar N — o valor antigo fica na coluna Valor (o "era" virou coluna), o Fica diz "a mais" e o
     ⇆ (Corrigir o valor do lançamento) fica desabilitado enquanto o campo já tem o valor do banco */
  it('o campo nasce com 5.665,00, a coluna Valor diz 3.085,00 e o Fica "a mais"; o Conciliar manda esse valor à mesma RPC', async () => {
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXT} contaBancariaId="bb" nomeConta="Banco do Brasil" onConciliado={() => {}}
      iniciais={[{ lancamento_id: 'amanda', descricao: 'Folha de Pagamento', fornecedor: 'Amanda Montes Camargo', valor_assinado: -3085, usarValorDoBanco: true }]} />);
    const campo = screen.getByLabelText('Valor de Folha de Pagamento') as HTMLInputElement;
    expect(campo.value).toBe('5.665,00');
    expect(screen.getByTestId('levado-linha').querySelectorAll('td')[8].textContent).toBe('-3.085,00');
    expect(screen.getByTestId('levado-linha-fica').textContent).toBe('a mais 2.580,00');
    expect(screen.getByTestId('usar-valor-banco')).toBeDisabled();
    await waitFor(() => expect(RPC.chamadas.length).toBeGreaterThan(0));
    expect(RPC.chamadas[0]).toMatchObject({ fn: 'fn_espelho_casar', args: { p_simular: true, p_itens: [{ lancamento_id: 'amanda', valor: 5665 }] } });
    /* voltar o campo ao valor antigo: inteira, e o ⇆ volta a valer */
    fireEvent.change(campo, { target: { value: '3.085,00' } });
    expect(screen.getByTestId('levado-linha-fica').textContent).toBe('inteira');
    expect(screen.getByTestId('usar-valor-banco')).not.toBeDisabled();
  });
  it('sem a marca (o caminho de sempre), o campo nasce com o valor do lançamento (inteira)', () => {
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXT} contaBancariaId="bb" onConciliado={() => {}}
      iniciais={[{ lancamento_id: 'amanda', descricao: 'Folha de Pagamento', valor_assinado: -3085 }]} />);
    expect((screen.getByLabelText('Valor de Folha de Pagamento') as HTMLInputElement).value).toBe('3.085,00');
    expect(screen.getByTestId('levado-linha-fica').textContent).toBe('inteira');
    expect(screen.getByTestId('usar-valor-banco')).not.toBeDisabled();
  });
});
