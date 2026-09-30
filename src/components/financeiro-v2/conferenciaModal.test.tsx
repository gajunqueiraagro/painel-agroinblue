/**
 * PR-CONC-CONFERENCIA-MODAL-01 — a Conferência abre num modal largo, com uma régua só (9,5px desde o fix1, 18px, uma
 * linha), uma informação por coluna, e o resumo do corpo vira tabela.
 * fix1 — a coluna de ações vira ALÇA + "⋯" (o `DropdownMenu` da casa), com as mesmas ações de antes no menu.
 *
 * ⚠ OS NÚMEROS SÃO OS DO PRINT DO GABRIEL (NJ · Banco do Brasil · set/26): o fechamento "diferença -134.613,84" saía
 *   "-134…", e o candidato "Folha de Pagamento · Jonatas…" perdia o nome do funcionário. O banco falso devolve um dia com
 *   esse extrato sem par (o sistema do dia fica em zero, e a diferença é o valor inteiro) e esse candidato programado.
 * ⚠ jsdom NÃO FAZ LAYOUT: "nada cortado" foi medido na tela (tabela 1.060px no modal de 1.090, 280 linhas de 18px, 5.936
 *   células a 10px, zero corte em valor/data/status/ações). Aqui se prova a ESTRUTURA que garante isso — o texto inteiro no
 *   DOM, `whitespace-nowrap` sem `text-ellipsis` onde não pode cortar, 11 colunas em toda linha, a altura única.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EspelhadosReais } from './EspelhoConciliacaoTab';

const fixture = vi.hoisted(() => ({ espelho: null as unknown }));

vi.mock('@/integrations/supabase/client', () => {
  const vazio = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in']) b[m] = () => b;
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string) => Promise.resolve(fn === 'fn_extratos_espelhados' ? { data: fixture.espelho, error: null } : { data: null, error: null }),
      from: () => vazio(),
    },
  };
});
const FIN = vi.hoisted(() => {
  const noop = async () => undefined;
  return {
    loadContas: noop, loadClassificacoes: noop, loadFornecedores: noop, loadSafras: noop,
    contasBancarias: [], fornecedores: [], safras: [], classificacoes: [],
    buscarLancamentoPorId: async () => null, criarFornecedor: noop, editarLancamento: noop, criarLancamento: noop, excluirLancamento: noop,
  };
});
vi.mock('@/hooks/useFinanceiroV2', () => ({ useFinanceiroV2: () => FIN }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
const INTERNAS = vi.hoisted(() => ({
  contasInternas: new Set<string>(), lancamentosInternos: new Set<string>(),
  saldoInicialConsolidado: null, saldoInformadoConsolidado: null,
}));
vi.mock('@/hooks/useEspelhoInternas', () => ({ useEspelhoInternas: () => INTERNAS }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({ LancamentoV2Dialog: () => null }));
vi.mock('@/components/financeiro-v2/DecisaoDerivadosDialog', () => ({ DecisaoDerivadosDialog: () => null }));
vi.mock('@/components/financeiro-v2/CasarComBancoModal', () => ({ CasarComBancoModal: () => null, CasarN1Modal: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EspelhoConciliacaoTab } from './EspelhoConciliacaoTab';

const ESPELHO: EspelhadosReais = {
  escopo: { cliente_id: 'nj', conta_id: 'bb', ano_mes: '2026-09', nome_conta: 'Banco do Brasil' },
  saldos: { inicial: 177290.71, final_oficial: null, periodo_ini: '2026-09-01', periodo_fim: '2026-09-30', extrato_ini: null, extrato_fim: null },
  ofx_completo: [{
    extrato_id: 'e1', data: '2026-09-05', historico: 'TED Transf.Eletr.Dispon - 237 2372 5216892300015', documento: null,
    valor: -134613.84, status: 'sem_vinculo', flag_dup: false, flag_investimento: false,
  }, {
    /* Uma linha CASADA num dia à parte (04/09), para o menu "Abrir · Desconciliar" e sem mexer no fechamento de 05/09. */
    extrato_id: 'e2', data: '2026-09-04', historico: 'Pix - Agendamento - 04/09 05:35 ANTONIO PERES NETO', documento: null,
    valor: -6648.5, status: 'conciliado', flag_dup: false, flag_investimento: false,
  }],
  sistema_completo: [{
    lancamento_id: 's1', data: '2026-09-04', descricao: 'Folha de Pagamento', centro: 'Mão de Obra', subcentro: 'Salários',
    valor_assinado: -6648.5, sinal: '-1', status: 'conciliado', fornecedor: 'Antonio Peres Neto',
  }],
  vinculos: [{ extrato_id: 'e2', lancamento_id: 's1', valor_aplicado: 6648.5, tipo_aprovacao: 'manual', grupo_id: null }],
  sistema_candidatos: [{
    lancamento_id: 'c1', data_vencimento: '2026-09-05', competencia: '2026-09-01', valor: 3407.89, valor_assinado: -3407.89,
    sinal: '-1', descricao: 'Folha de Pagamento', centro: 'Mão de Obra', subcentro: 'Salários e Encargos',
    status_transacao: 'programado', cenario: 'realizado', cultura: null, numero_documento: null, tipo_documento: null,
    favorecido_id: 'f1', fornecedor: 'Jonatas Barbosa Batista', safra_codigo: null, safra_descricao: null,
    vencido: false, ja_conciliado: false, sem_conta: false,
  }],
  versao: 't', gerado_em: 'agora',
};

beforeEach(() => {
  fixture.espelho = ESPELHO;
  Element.prototype.scrollIntoView = () => {};
});

function montar(props: Partial<React.ComponentProps<typeof EspelhoConciliacaoTab>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}>
      <EspelhoConciliacaoTab clienteId="nj" contaId="bb" ano="2026" mes="09" {...props} />
    </QueryClientProvider>,
  );
  return { ...r, qc };
}

const botaoSubAba = (nome: string) => screen.getByRole('button', { name: nome });
const ativa = (nome: string) => botaoSubAba(nome).className.includes('border-primary');

async function abrirConferencia() {
  montar();
  await screen.findByTestId('resumo-espelho');
  fireEvent.click(botaoSubAba('Conferência'));
  return screen.findByTestId('modal-conferencia');
}
const tabelaDaMesa = (modal: HTMLElement) =>
  [...modal.querySelectorAll('table')].find((t) => t.textContent?.includes('Banco (OFX)'))!;

describe('a sub-aba inicial e o modal', () => {
  it('nasce em "Extrato (banco)", sem modal; clicar "Conferência" abre o Dialog com conta e mês', async () => {
    montar();
    await screen.findByTestId('resumo-espelho');
    expect(ativa('Extrato (banco)')).toBe(true);
    expect(screen.queryByTestId('modal-conferencia')).toBeNull();
    fireEvent.click(botaoSubAba('Conferência'));
    const modal = await screen.findByTestId('modal-conferencia');
    expect(within(modal).getByText('Conferência · Banco do Brasil · set/2026')).toBeInTheDocument();
  });

  it('fechar volta para a sub-aba que estava antes', async () => {
    montar();
    await screen.findByTestId('resumo-espelho');
    fireEvent.click(botaoSubAba('Sistema'));
    fireEvent.click(botaoSubAba('Conferência'));
    const modal = await screen.findByTestId('modal-conferencia');
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByTestId('modal-conferencia')).toBeNull());
    expect(ativa('Sistema')).toBe(true);
  });

  it('controlado de fora: fechar devolve ao pai a sub-aba anterior', async () => {
    const onAbaChange = vi.fn();
    const { rerender, qc } = montar({ aba: 'evolucao', onAbaChange });
    await screen.findByTestId('resumo-espelho');
    rerender(
      <QueryClientProvider client={qc}>
        <EspelhoConciliacaoTab clienteId="nj" contaId="bb" ano="2026" mes="09" aba="conferencia" onAbaChange={onAbaChange} />
      </QueryClientProvider>,
    );
    const modal = await screen.findByTestId('modal-conferencia');
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }));
    expect(onAbaChange).toHaveBeenCalledWith('evolucao');
  });
});

describe('a mesa dentro do modal — uma régua só', () => {
  it('o fechamento mostra "diferença -134.613,84" INTEIRA, em descrição + status + ações (colSpan 3), numa célula que não corta', async () => {
    const modal = await abrirConferencia();
    const dif = within(modal).getByText('diferença -134.613,84');
    const td = dif.closest('td')!;
    expect(td.colSpan).toBe(3);
    expect(td.className).toContain('whitespace-nowrap');
    expect(td.className).not.toContain('text-ellipsis');
  });

  it('toda linha tem 18px, 11 colunas e a tabela inteira a 9,5px, sem célula de 10px ou mais', async () => {
    const modal = await abrirConferencia();
    const linhas = [...tabelaDaMesa(modal).querySelectorAll('tr')];
    expect(linhas.length).toBeGreaterThanOrEqual(5); // cabeçalho, dia, extrato, candidato, fechamento
    for (const tr of linhas) {
      expect(tr.className).toContain('h-[18px]');
      expect([...tr.children].reduce((a, c) => a + ((c as HTMLTableCellElement).colSpan || 1), 0)).toBe(11);
    }
    /* Toda célula, span e rótulo com texto; o gatilho do "⋯" é o `Button` da casa (que carrega `text-[12px]`) e só tem
       ícone — por isso ele fica fora da varredura e se prova à parte que não tem texto. */
    const comTexto = [...tabelaDaMesa(modal).querySelectorAll('th, td, span, label')];
    expect(comTexto.filter((el) => /text-\[1[0-9]px\]/.test(String(el.className)))).toEqual([]);
    /* abaixo de 9,5 SÓ o selo de status (exceção do fix2): nenhuma outra célula ou span leva fonte menor */
    const abaixoDoPiso = comTexto.filter((el) => /text-\[(?:[0-8]|9)(?:\.[0-4])?px\]/.test(String(el.className)));
    expect(abaixoDoPiso.every((el) => el.closest('td[data-status]'))).toBe(true);
    expect(tabelaDaMesa(modal).className).toContain('text-[9.5px]');
    for (const b of within(tabelaDaMesa(modal)).getAllByRole('button', { name: 'Ações da linha' })) expect(b.textContent).toBe('');
  });

  it('o candidato: vencimento e status em colunas próprias; o texto guarda descrição · fornecedor · subcentro', async () => {
    const modal = await abrirConferencia();
    const status = modal.querySelector('td[data-status="programado"]')!;
    expect(status.textContent).toBe('Programado');
    /* programado é SÓ TEXTO na paleta: nada de fundo */
    expect(status.innerHTML).not.toMatch(/\bbg-/);
    const linha = status.closest('tr')!;
    const celulas = [...linha.children];
    const texto = celulas[8];
    expect(texto.textContent).toContain('Folha de Pagamento');
    expect(texto.textContent).toContain('Jonatas Barbosa Batista');
    expect(texto.textContent).toContain('Salários e Encargos');
    expect(texto.textContent).not.toContain('Programado');
    expect(texto.textContent).not.toContain('05/09');
    expect(celulas[7].textContent).toBe('05/09');
    expect(celulas[7].getAttribute('title')).toBe('vencimento');
  });
});

describe('o resumo do corpo vira tabela', () => {
  it('Banco (OFX) | Sistema | Diferença com divisores, e o "Sem par" com Qtde e Valor', async () => {
    montar();
    const resumo = await screen.findByTestId('resumo-espelho');
    const [tot, semPar] = [...resumo.querySelectorAll('table')];
    expect([...tot.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['', 'Banco (OFX)', 'Sistema', 'Diferença']);
    expect(tot.querySelector('thead tr')!.className).toContain('bg-primary');
    expect([...tot.querySelectorAll('tbody td')].filter((td) => td.className.includes('border-r')).length).toBe(6);
    expect(within(tot).getByText('-141.262,34')).toBeInTheDocument(); // saídas do banco (sem par + casado)
    expect(within(tot).getByText('-134.613,84')).toBeInTheDocument(); // a diferença
    expect([...semPar.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Sem par', 'Qtde', 'Valor']);
    expect(within(semPar).getByText('Extratos').closest('tr')!.textContent).toBe('Extratos1—');
  });
});

describe('fix1 — a coluna de ações é a alça + "⋯"', () => {
  const abrirMenu = async (linha: HTMLElement) => {
    const gatilho = within(linha).getByRole('button', { name: 'Ações da linha' });
    fireEvent.keyDown(gatilho, { key: 'Enter' });
    return screen.findByRole('menu');
  };
  const itens = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((i) => ({
    texto: i.textContent, desabilitado: i.hasAttribute('data-disabled'),
  }));

  it('toda linha de registro tem a célula de ações com o "⋯"; o extrato sem par tem também a alça', async () => {
    const modal = await abrirConferencia();
    const acoes = [...tabelaDaMesa(modal).querySelectorAll('[data-testid="acoes-da-linha"]')];
    expect(acoes.length).toBe(3); // extrato sem par, casado, candidato
    for (const td of acoes) expect(within(td as HTMLElement).getByRole('button', { name: 'Ações da linha' })).toBeInTheDocument();
    const semPar = within(modal).getByText('— nenhum lançamento vinculado').closest('tr')!;
    expect(within(semPar).getByLabelText('Arrastar lançamento')).toBeInTheDocument();
    /* nenhum link por extenso sobrou na mesa */
    expect(within(tabelaDaMesa(modal)).queryByText('criar')).toBeNull();
    expect(within(tabelaDaMesa(modal)).queryByText('desconciliar')).toBeNull();
  });

  /* PR-CONC-SUGESTOES-CASAR-01: o menu ganhou "Ver sugestões (N)". Aqui o banco pagou -134.613,84 e o único candidato é
     a folha de -3.407,89 do Jonatas — nem valor, nem soma, nem nome: N = 0, desabilitado e dizendo por quê. */
  it('extrato sem par: o menu tem Ver sugestões (0) desabilitado com o motivo, Criar e Ignorar', async () => {
    const modal = await abrirConferencia();
    const semPar = within(modal).getByText('— nenhum lançamento vinculado').closest('tr')!;
    expect(itens(await abrirMenu(semPar))).toEqual([
      { texto: 'Ver sugestões (0)nenhuma sugestão para este movimento', desabilitado: true },
      { texto: 'Criar', desabilitado: false }, { texto: 'Ignorar', desabilitado: false },
    ]);
  });

  it('com um candidato de mesmo valor: "Ver sugestões (1)" habilitado abre o modal POR CIMA da Conferência', async () => {
    fixture.espelho = { ...ESPELHO, sistema_candidatos: [...ESPELHO.sistema_candidatos!, {
      ...ESPELHO.sistema_candidatos![0], lancamento_id: 'c2', valor: 134613.84, valor_assinado: -134613.84,
      descricao: 'Compra de gado', fornecedor: 'Fazenda Boa Vista',
    }] };
    const modal = await abrirConferencia();
    const semPar = within(modal).getByText('— nenhum lançamento vinculado').closest('tr')!;
    const menu = await abrirMenu(semPar);
    expect(itens(menu)[0]).toEqual({ texto: 'Ver sugestões (1)', desabilitado: false });
    fireEvent.click(within(menu).getByText('Ver sugestões (1)'));
    const sug = await screen.findByTestId('sugestoes-casar');
    expect(within(sug).getByText('Compra de gado')).toBeInTheDocument();
    /* a Conferência continua aberta embaixo */
    expect(screen.getByTestId('modal-conferencia')).toBeInTheDocument();
  });

  it('linha casada: o menu tem Abrir e Desconciliar', async () => {
    const modal = await abrirConferencia();
    const casada = within(modal).getByText('Pix - Agendamento - 04/09 05:35 ANTONIO PERES NETO').closest('tr')!;
    expect(itens(await abrirMenu(casada))).toEqual([
      { texto: 'Abrir', desabilitado: false }, { texto: 'Desconciliar', desabilitado: false },
    ]);
  });

  it('candidato: o menu tem Abrir', async () => {
    const modal = await abrirConferencia();
    const cand = modal.querySelector('td[data-status="programado"]')!.closest('tr')! as HTMLElement;
    expect(itens(await abrirMenu(cand))).toEqual([{ texto: 'Abrir', desabilitado: false }]);
  });
});

describe('fix1 — a sub-aba Sistema ganha a coluna Fornecedor', () => {
  it('cabeçalho Data · Descrição · Fornecedor · Centro/Subcentro · Valor · Saldo · Status, e o fornecedor preenchido', async () => {
    montar();
    await screen.findByTestId('resumo-espelho');
    fireEvent.click(botaoSubAba('Sistema'));
    const cab = await screen.findByText('Fornecedor');
    expect([...cab.parentElement!.children].map((s) => s.textContent))
      .toEqual(['Data', 'Descrição', 'Fornecedor', 'Centro/Subcentro', 'Valor', 'Saldo', 'Status']);
    const fornecedores = screen.getAllByTestId('sistema-fornecedor');
    expect(fornecedores.map((s) => s.textContent)).toEqual(['Antonio Peres Neto']);
    expect(fornecedores[0].getAttribute('title')).toBe('Antonio Peres Neto');
    expect(fornecedores[0].className).toContain('truncate');
  });
});

describe('fix2 — o selo de status da Conferência é uma referência pequena, à direita', () => {
  it('selo a 8px, 12px de altura, 4px de padding lateral, encostado à direita da coluna', async () => {
    const modal = await abrirConferencia();
    const conc = modal.querySelector('td[data-status="conciliado"]')!;
    expect(conc.className).toContain('text-right');
    const selo = conc.firstElementChild!;
    for (const c of ['text-[8px]', 'h-[12px]', 'px-[4px]', 'border']) expect(selo.className).toContain(c);
    expect(selo.className).not.toMatch(/\bpy-/);
    expect(selo.className).toContain('bg-[#166534]'); // a paleta única, conciliado com fundo
    const prog = modal.querySelector('td[data-status="programado"]')!;
    expect(prog.className).toContain('text-right');
    expect(prog.firstElementChild!.className).toContain('text-[8px]');
    expect(prog.firstElementChild!.className).not.toMatch(/\bbg-/); // programado segue só texto
  });
});

describe('PR-CONC-SUGESTOES-CASAR-01 — "Só não conciliados", fundo verde nas casadas e N estável', () => {
  const casada = (modal: HTMLElement) => within(modal).queryByText('Pix - Agendamento - 04/09 05:35 ANTONIO PERES NETO');

  it('em "Todos", a linha casada tem o fundo verde leve; a não casada, não', async () => {
    const modal = await abrirConferencia();
    const tr = casada(modal)!.closest('tr')!;
    expect(tr.hasAttribute('data-conciliada')).toBe(true);
    expect(tr.className).toContain('bg-success/[0.06]');
    const semPar = within(modal).getByText('— nenhum lançamento vinculado').closest('tr')!;
    expect(semPar.className).not.toContain('bg-success');
    /* a busca sabe achar: há exatamente uma linha casada nesta mesa */
    expect(modal.querySelectorAll('tr[data-conciliada]')).toHaveLength(1);
  });

  it('ligado: esconde a casada e o dia que só tinha ela; o dia que fica mantém o fechamento inteiro', async () => {
    const modal = await abrirConferencia();
    expect(within(modal).getByText('fechamento 04/09')).toBeInTheDocument();
    const fech05 = () => within(modal).getByText('fechamento 05/09').closest('tr')!.textContent;
    const antes = fech05();
    fireEvent.click(screen.getByTestId('so-nao-conciliados'));
    await waitFor(() => expect(casada(modal)).toBeNull());
    expect(within(modal).queryByText('fechamento 04/09')).toBeNull(); // 04/09 só tinha a casada: some inteiro
    expect(modal.querySelectorAll('tr[data-conciliada]')).toHaveLength(0);
    expect(within(modal).getByText('— nenhum lançamento vinculado')).toBeInTheDocument();
    expect(fech05()).toBe(antes); // o fechamento não é recalculado
    fireEvent.click(screen.getByTestId('so-nao-conciliados'));
    await waitFor(() => expect(casada(modal)).not.toBeNull());
  });

  it('ligado, num dia que tem casada E sem par: o dia fica, só a casada some (dos dois lados)', async () => {
    fixture.espelho = { ...ESPELHO,
      ofx_completo: ESPELHO.ofx_completo.map((e) => (e.extrato_id === 'e2' ? { ...e, data: '2026-09-05' } : e)),
      sistema_completo: ESPELHO.sistema_completo.map((s) => ({ ...s, data: '2026-09-05' })) };
    const modal = await abrirConferencia();
    expect(casada(modal)).not.toBeNull();
    expect(within(modal).queryByText(/Antonio Peres Neto/)).not.toBeNull(); // o lado do sistema da casada
    fireEvent.click(screen.getByTestId('so-nao-conciliados'));
    await waitFor(() => expect(casada(modal)).toBeNull());
    expect(within(modal).queryByText(/Antonio Peres Neto/)).toBeNull();
    expect(within(modal).getByText('fechamento 05/09')).toBeInTheDocument();
    expect(within(modal).getByText('— nenhum lançamento vinculado')).toBeInTheDocument();
  });

  it('o estado vive só enquanto o modal está aberto: fechar e reabrir volta a mostrar tudo', async () => {
    const modal = await abrirConferencia();
    fireEvent.click(screen.getByTestId('so-nao-conciliados'));
    await waitFor(() => expect(casada(modal)).toBeNull());
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByTestId('modal-conferencia')).toBeNull());
    fireEvent.click(botaoSubAba('Conferência'));
    const modal2 = await screen.findByTestId('modal-conferencia');
    expect(casada(modal2)).not.toBeNull();
    expect(screen.getByTestId('so-nao-conciliados').getAttribute('data-state')).toBe('unchecked');
  });

  it('N do menu = linhas do modal, e abrir duas vezes dá o mesmo N (a mesma lista, calculada uma vez)', async () => {
    fixture.espelho = { ...ESPELHO, sistema_candidatos: [...ESPELHO.sistema_candidatos!, {
      ...ESPELHO.sistema_candidatos![0], lancamento_id: 'c2', valor: 134613.84, valor_assinado: -134613.84,
      descricao: 'Compra de gado', fornecedor: 'Fazenda Boa Vista',
    }] };
    const modal = await abrirConferencia();
    const semPar = () => within(modal).getByText('— nenhum lançamento vinculado').closest('tr')!;
    for (let vez = 0; vez < 2; vez++) {
      fireEvent.keyDown(within(semPar()).getByRole('button', { name: 'Ações da linha' }), { key: 'Enter' });
      const menu = await screen.findByRole('menu');
      const item = within(menu).getAllByRole('menuitem')[0];
      const n = Number(/\((\d+)\)/.exec(item.textContent ?? '')![1]);
      fireEvent.click(item);
      const sug = await screen.findByTestId('sugestoes-casar');
      expect(within(sug).getAllByTestId('sugestao')).toHaveLength(n);
      expect(n).toBe(1);
      fireEvent.click(within(sug).getByText('Fechar')); // o do rodapé (o X também se chama Fechar)
      await waitFor(() => expect(screen.queryByTestId('sugestoes-casar')).toBeNull());
    }
  });
});
