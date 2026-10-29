/**
 * PR-CONC-CONFERENCIA-MODAL-01 — a Conferência abre num modal largo, com uma régua só, uma informação por coluna.
 * P159a (CONC-TELAS-01, mock `mock-conferencia-v1.html` aprovado 28/10): a régua passou a 8 colunas fixas (Banco · histórico ·
 * Valor · ✓ · Sistema · Descrição · Favorecido · Subcentro · ⋯), 10,5px e linha de 19px; o "Só não conciliados" virou os chips do
 * cabeçalho; o resumo do corpo virou UMA faixa de uma linha; o histórico do banco aparece limpo (hora na frente).
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

const fixture = vi.hoisted(() => ({
  espelho: null as unknown,
  /* PR-CONC-SALDO-UMA-REGUA-02: o quadro do topo e a aba Sistema leem o DONO (`fn_conciliacao_resumo_mes` da conta). */
  resumo: null as unknown,
  /* CONC-BLOCOS-TELA-01: as linhas que o `from(tabela)` devolve (blocos vivos, aplicado vivo) e as RPCs chamadas. */
  tabelas: {} as Record<string, unknown[]>,
  chamadas: [] as Array<{ fn: string; args: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const vazio = (tabela: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in']) b[m] = () => b;
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: fixture.tabelas[tabela] ?? [], error: null }).then(ok);
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string, args: unknown) => {
        fixture.chamadas.push({ fn, args });
        if (fn === 'fn_conciliacao_resumo_mes') return Promise.resolve({ data: fixture.resumo, error: null });
        return Promise.resolve(fn === 'fn_extratos_espelhados' ? { data: fixture.espelho, error: null } : { data: null, error: null });
      },
      from: (tabela: string) => vazio(tabela),
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
/* CONC-SEM-F5-01: o Espelho ouve e avisa o canal de lançamentos — o mock leva as duas pontas dele, e elas FUNCIONAM (um
   canal de verdade, por cliente), para o caso do Gabriel ser provado de ponta a ponta: gesto -> aviso -> o dono relê. */
const CANAL = vi.hoisted(() => ({ ouvintes: new Map<string, Set<() => void>>(), avisos: [] as string[] }));
vi.mock('@/hooks/useFinanceiroV2', () => ({
  useFinanceiroV2: () => FIN,
  inscreverEmLancamentos: (cliente: string, cb: () => void) => {
    const set = CANAL.ouvintes.get(cliente) ?? new Set<() => void>();
    CANAL.ouvintes.set(cliente, set); set.add(cb);
    return () => { set.delete(cb); };
  },
  notificarLancamentosMudaram: (cliente: string) => {
    CANAL.avisos.push(cliente);
    for (const cb of [...(CANAL.ouvintes.get(cliente) ?? [])]) cb();
  },
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
const INTERNAS = vi.hoisted(() => ({
  contasInternas: new Set<string>(), lancamentosInternos: new Set<string>(),
  saldoInicialConsolidado: null, saldoInformadoConsolidado: null,
}));
vi.mock('@/hooks/useEspelhoInternas', () => ({ useEspelhoInternas: () => INTERNAS }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({ LancamentoV2Dialog: () => null }));
vi.mock('@/components/financeiro-v2/DecisaoDerivadosDialog', () => ({ DecisaoDerivadosDialog: () => null }));
vi.mock('@/components/financeiro-v2/CasarComBancoModal', () => ({
  CasarComBancoModal: () => null, CasarN1Modal: () => null, CasarBlocoModal: () => null,
  fraseDaRecusa: (m: string) => m.replace(/^[a-z_]+:\s*/, ''),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EspelhoConciliacaoTab } from './EspelhoConciliacaoTab';
import { useStatusAno } from '@/hooks/useResumoConciliacao';

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

/* A linha do dono para o mesmo mês: os números do print (saídas do banco −141.262,34, diferença −134.613,84, o extrato
   sem par) e a lista do sistema com o saldo corrido do dono. */
const RESUMO = [{
  nivel: 'conta', conta_id: 'bb', conta_nome: 'Banco do Brasil', tipo_conta: 'cc', consolida_em_conta_id: null, tem_extrato: true,
  saldo_inicial: 177290.71, saldo_inicial_origem: 'informado', entradas: 0, saidas: -6648.5,
  entradas_terceiros: 0, entradas_transferencias: 0, saidas_terceiros: -6648.5, saidas_transferencias: 0,
  saldo_sistema: 170642.21, saldo_extrato: null, saldo_extrato_data: null, diferenca: null,
  diferenca_entradas: 0, diferenca_saidas: -134613.84, banco: { entradas: 0, saidas: -141262.34, extrato_nao_fecha: null },
  extratos_sem_par: { qtde: 1, valor: -134613.84 }, lancamentos_sem_par: { qtde: 0, valor: 0 },
  retido_em_depositos: { qtde: 0, valor: 0 }, status: 'pendente', motivos: [{ motivo: 'saldo_nao_informado' }],
  posicao: null, sem_conta: null,
  linhas_sistema: [{
    tipo: 'vinculo', data: '2026-09-04', valor: -6648.5, lancamento_id: 's1', extrato_id: 'e2', descricao: 'Folha de Pagamento',
    fornecedor: 'Antonio Peres Neto', centro: 'Mão de Obra', subcentro: 'Salários', status_exibicao: 'conciliado', saldo_apos: 170642.21,
  }],
}];

beforeEach(() => {
  fixture.espelho = ESPELHO;
  fixture.resumo = RESUMO;
  fixture.tabelas = {};
  fixture.chamadas = [];
  CANAL.avisos = [];
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
/* P159a: a fileira é o `Segmentado` da casa — a escolhida em navy */
const ativa = (nome: string) => botaoSubAba(nome).className.includes('bg-primary text-primary-foreground');

async function abrirConferencia() {
  montar();
  await screen.findByTestId('resumo-espelho');
  fireEvent.click(botaoSubAba('Conferência'));
  return screen.findByTestId('modal-conferencia');
}
const tabelaDaMesa = (modal: HTMLElement) =>
  [...modal.querySelectorAll('table')].find((t) => t.textContent?.includes('Nome do extrato'))!;
/* o histórico do banco aparece LIMPO (`historicoDoBanco`): "Pix - Agendamento - 04/09 05:35 NOME" de 04/09 → "Pix Agendamento · NOME" */
const CASADA = 'Pix Agendamento · ANTONIO PERES NETO';
const linhaSemPar = (modal: HTMLElement) => modal.querySelector<HTMLElement>('tr[data-extrato-sem-par]')!;
const linhaDoCandidatoOuNada = (modal: HTMLElement) => modal.querySelector('[data-status="programado"]')?.closest('tr') ?? null;
const linhaDoCandidato = (modal: HTMLElement): HTMLElement => {
  const tr = modal.querySelector('[data-status="programado"]')?.closest('tr');
  if (!(tr instanceof HTMLElement)) throw new Error('linha do candidato não encontrada');
  return tr;
};

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
  it('o fechamento: "diferença -134.613,84 (1 sem par)" INTEIRA, nas 4 colunas do sistema, numa célula que não corta; o saldo do banco no fim do dia', async () => {
    const modal = await abrirConferencia();
    const dif = within(modal).getByText('diferença -134.613,84 (1 sem par)');
    const td = dif.closest('td')!;
    expect(td.colSpan).toBe(4);
    expect(td.className).toContain('whitespace-nowrap');
    expect(td.className).not.toContain('text-ellipsis');
    /* 05/09: inicial 177.290,71 − 6.648,50 (04/09) − 134.613,84 = 36.028,37 — lido da Evolução do saldo, nada somado aqui */
    const fech = [...modal.querySelectorAll<HTMLElement>('tr[data-fechamento]')].map((tr) => within(tr).getByTestId('fechamento-saldo-banco').textContent);
    expect(fech).toEqual(['170.642,21', '36.028,37']);
  });

  /* P159e (Gabriel 29/10): a régua PADRÃO — toda linha 19px (o dia e o fechamento também; eram 20), corpo 10px (era 10,5); o EXTRATO é a
     coluna que fica com o resto e o sistema cede (Descrição 180 · Favorecido 140 · Subcentro 140) */
  it('8 colunas em toda linha, linha de 18px (o dia e o fechamento 22, negrito), 10px; o extrato com o resto; abaixo de 9,5 só o selo', async () => {
    const modal = await abrirConferencia();
    const tabela = tabelaDaMesa(modal);
    expect([...tabela.querySelectorAll('col')].map((c) => c.style.width)).toEqual(['', '96px', '20px', '96px', '180px', '140px', '140px', '22px']);
    expect(tabela.style.minWidth).toBe('944px');
    expect(tabela.className).toContain('text-[10px]');
    expect(tabela.querySelector('thead th')?.textContent).toBe('Nome do extrato');
    const linhas = [...tabela.querySelectorAll('tbody tr')];
    expect(linhas.length).toBeGreaterThanOrEqual(6); // 2 dias + fechamentos, extrato sem par, casada, candidato
    for (const tr of linhas) {
      expect([...tr.children].reduce((a, c) => a + (c instanceof HTMLTableCellElement ? c.colSpan || 1 : 1), 0)).toBe(8);
      const destaque = tr.hasAttribute('data-dia') || tr.hasAttribute('data-fechamento');
      for (const td of [...tr.children]) expect(String(td.className)).toMatch(destaque ? /h-\[22px\]/ : /h-\[18px\]/);
    }
    const comTexto = [...tabela.querySelectorAll('td, span, label')];
    /* nada acima de 10px no corpo (o 10,5 do P159a saiu) */
    expect(comTexto.filter((el) => /text-\[(10\.[1-9]|1[1-9]|[2-9]\d)(\.\d)?px\]/.test(String(el.className)))).toEqual([]);
    /* abaixo de 9,5 SÓ o selo de status (exceção do fix2, `data-status`) */
    const abaixoDoPiso = comTexto.filter((el) => /text-\[(?:[0-8]|9)(?:\.[0-4])?px\]/.test(String(el.className)));
    expect(abaixoDoPiso.every((el) => el.closest('[data-status]'))).toBe(true);
    for (const b of within(tabela).getAllByRole('button', { name: 'Ações da linha' })) expect(b.textContent).toBe('');
  });

  it('o candidato: Descrição · Favorecido · Subcentro em colunas; o status é um selo no fim do Subcentro (só no não conciliado)', async () => {
    const modal = await abrirConferencia();
    const selo = modal.querySelector('[data-status="programado"]')!;
    expect(selo.textContent).toBe('Programado');
    expect(selo.innerHTML).not.toMatch(/\bbg-/); // programado é SÓ TEXTO na paleta
    const linha = linhaDoCandidato(modal);
    /* a Descrição do candidato começa pela marcação e a alça (o lugar fixo de 24px); o texto é o `truncate` */
    expect(within(linha).getByTestId('conf-descricao').querySelector('.truncate')!.textContent).toBe('Folha de Pagamento');
    expect(within(linha).getByLabelText('Marcar candidato')).toBeInTheDocument();
    expect(within(linha).getByTestId('conf-favorecido').textContent).toBe('Jonatas Barbosa Batista');
    expect(within(linha).getByTestId('conf-subcentro').textContent).toBe('Salários e Encargos');
    expect(selo.closest('td')).toBe(within(linha).getByTestId('conf-subcentro').closest('td'));
    /* a casada não leva selo: o ✓ do meio diz */
    const casada = within(modal).getByText(CASADA).closest('tr')!;
    expect(casada.querySelector('[data-status]')).toBeNull();
    expect(within(casada).getByTestId('sinal-do-extrato').textContent).toBe('✓');
  });

  it('o histórico do banco limpo: a hora na frente, sem o "dd/mm" do dia; o texto inteiro do banco no title', async () => {
    const modal = await abrirConferencia();
    const span = within(modal).getByText(CASADA);
    const td = span.closest('td')!;
    expect(within(td).getByTestId('conf-hora').textContent).toBe('05:35');
    expect(td.getAttribute('title')).toBe(`${CASADA}\nPix - Agendamento - 04/09 05:35 ANTONIO PERES NETO`);
  });
});

describe('P159a — o resumo do corpo vira UMA faixa de uma linha', () => {
  it('Banco · Sistema · Diferença (saídas · entradas) e o Sem par com quantidade e valor, os números do dono', async () => {
    montar();
    const faixa = await screen.findByTestId('resumo-espelho');
    expect(faixa.querySelector('table')).toBeNull();
    expect(faixa.className).toContain('whitespace-nowrap');
    expect(within(faixa).getByTestId('topo-saidas-banco').textContent).toBe('-141.262,34'); // saídas do banco, do dono
    expect(within(faixa).getByTestId('topo-dif-saidas').textContent).toBe('-134.613,84'); // a diferença por lado, do dono
    expect(within(faixa).getByTestId('topo-sem-par-extratos-qtde').textContent).toBe('1');
    expect(within(faixa).getByTestId('topo-sem-par-extratos-valor').textContent).toBe('-134.613,84');
    expect(within(faixa).getByTestId('topo-retido').textContent).toBe('—');
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

  /* P159d (Gabriel 29/10) — as cores: o dia é a faixa cinza-azulada, o fechamento cinza bem claro com filete em cima e embaixo; o filete e o
     respiro são sombras internas (não ocupam lugar). P159e: as duas linhas na régua padrão (19px) */
  it('P159d: as cores do dia e do fechamento; as duas a 22px em negrito (P159e, o mock)', async () => {
    const modal = await abrirConferencia();
    const mesa = tabelaDaMesa(modal);
    const dia = mesa.querySelector('tr[data-dia]');
    const fech = mesa.querySelector('tr[data-fechamento]');
    if (!(dia instanceof HTMLElement) || !(fech instanceof HTMLElement)) throw new Error('sem o dia ou o fechamento');
    expect(dia.className).toContain('bg-[#e4e9f0]');
    const tdDia = dia.querySelector('td');
    expect(tdDia?.className).toContain('h-[22px]');
    expect(tdDia?.className).toContain('font-bold');
    expect(tdDia?.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(tdDia?.className).toContain('text-[10px]');
    expect(tdDia?.className).toContain('shadow-[inset_0_2px_0_hsl(var(--background))]');
    expect(fech.className).toContain('bg-[#f3f5f8]');
    expect(fech.className).toContain('[&>td]:shadow-[inset_0_1px_0_#cfd6df,inset_0_-1px_0_#cfd6df]');
    expect(fech.className).toContain('border-b border-border');
    for (const td of fech.querySelectorAll('td')) expect(td.className).toContain('h-[22px]');
  });

  /* P159e — SEM RECUO: a caixinha e a alça coladas à esquerda; sem caixinha, nenhum lugar vazio; a hora só existe quando o banco a trouxe */
  it('P159e: o nome do extrato sem recuo — nenhum lugar vazio de 24/28px antes do texto', async () => {
    const modal = await abrirConferencia();
    const mesa = tabelaDaMesa(modal);
    expect(mesa.querySelectorAll('.w-\\[24px\\], .w-\\[28px\\]')).toHaveLength(0);
    for (const h of mesa.querySelectorAll('[data-testid="conf-hora"]')) expect(h.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('toda linha de registro tem a célula de ações com o "⋯"; o extrato sem par tem também a alça', async () => {
    const modal = await abrirConferencia();
    const acoes = [...tabelaDaMesa(modal).querySelectorAll('[data-testid="acoes-da-linha"]')];
    expect(acoes.length).toBe(3); // extrato sem par, casado, candidato
    for (const td of acoes) expect(within(td as HTMLElement).getByRole('button', { name: 'Ações da linha' })).toBeInTheDocument();
    const semPar = linhaSemPar(modal);
    expect(within(semPar).getByLabelText('Arrastar lançamento')).toBeInTheDocument();
    /* P159a: o sem par em destaque, com os dois botões na própria linha. P159d (só cor): o destaque é o traço âmbar à esquerda,
       a linha é branca (sem o fundo amarelo) e o "sem lançamento" é âmbar */
    expect(semPar.className).not.toContain('bg-amber-50');
    expect(semPar.className).toContain('bg-background');
    expect(semPar.className).toContain('[&>td:first-child]:shadow-[inset_3px_0_0_#d97706]');
    expect(within(semPar).getByTestId('conf-sem-lancamento').className).toContain('text-[#d97706]');
    expect(within(semPar).getByTestId('conf-sem-lancamento').textContent).toBe('sem lançamento ·SugestõesCriar');
    expect(within(semPar).getByTestId('sem-par-sugestoes')).toBeDisabled();
    /* nenhum link por extenso sobrou na mesa */
    expect(within(tabelaDaMesa(modal)).queryByText('criar')).toBeNull();
    expect(within(tabelaDaMesa(modal)).queryByText('desconciliar')).toBeNull();
  });

  /* PR-CONC-SUGESTOES-CASAR-01: o menu ganhou "Ver sugestões (N)". Aqui o banco pagou -134.613,84 e o único candidato é
     a folha de -3.407,89 do Jonatas — nem valor, nem soma, nem nome: N = 0, desabilitado e dizendo por quê. */
  it('extrato sem par: o menu tem Ver sugestões (0) desabilitado com o motivo, Criar, Criar transferência (P139) e Ignorar', async () => {
    const modal = await abrirConferencia();
    const semPar = linhaSemPar(modal);
    expect(itens(await abrirMenu(semPar))).toEqual([
      { texto: 'Ver sugestões (0)nenhuma sugestão para este movimento', desabilitado: true },
      { texto: 'Criar', desabilitado: false }, { texto: 'Criar transferência', desabilitado: false }, { texto: 'Ignorar', desabilitado: false },
    ]);
  });

  it('P139: "Criar transferência" abre o diálogo por cima e pede a prévia à porta do banco; marcar só o sem par oferece o lote', async () => {
    fixture.chamadas.length = 0;
    const modal = await abrirConferencia();
    const semPar = linhaSemPar(modal);
    fireEvent.click(within(await abrirMenu(semPar)).getByText('Criar transferência'));
    expect(await screen.findByTestId('modal-criar-transferencia')).toBeInTheDocument();
    await waitFor(() => expect(fixture.chamadas.some((c) => c.fn === 'fn_transferencia_do_extrato')).toBe(true));
    expect(screen.getByTestId('modal-conferencia')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(within(semPar).getByRole('checkbox', { name: 'Marcar movimento do banco' }));
    expect(await screen.findByTestId('barra-criar-transferencias')).toHaveTextContent('Criar transferências (1)');
  });

  it('com um candidato de mesmo valor: "Ver sugestões (1)" habilitado abre o modal POR CIMA da Conferência', async () => {
    fixture.espelho = { ...ESPELHO, sistema_candidatos: [...ESPELHO.sistema_candidatos!, {
      ...ESPELHO.sistema_candidatos![0], lancamento_id: 'c2', valor: 134613.84, valor_assinado: -134613.84,
      descricao: 'Compra de gado', fornecedor: 'Fazenda Boa Vista',
    }] };
    const modal = await abrirConferencia();
    const semPar = linhaSemPar(modal);
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
    const casada = within(modal).getByText(CASADA).closest('tr')!;
    expect(itens(await abrirMenu(casada))).toEqual([
      { texto: 'Abrir', desabilitado: false }, { texto: 'Desconciliar', desabilitado: false },
    ]);
  });

  it('candidato: o menu tem Abrir', async () => {
    const modal = await abrirConferencia();
    const cand = linhaDoCandidato(modal);
    expect(itens(await abrirMenu(cand))).toEqual([{ texto: 'Abrir', desabilitado: false }]);
  });
});

describe('fix1 — a sub-aba Sistema ganha a coluna Fornecedor', () => {
  it('cabeçalho Data · Descrição · Fornecedor · Centro · Subcentro · Entradas · Saídas · Saldo, e o fornecedor preenchido', async () => {
    montar();
    await screen.findByTestId('resumo-espelho');
    fireEvent.click(botaoSubAba('Sistema'));
    const cab = await screen.findByText('Fornecedor');
    expect([...cab.parentElement!.children].map((s) => s.textContent))
      /* P141: o rótulo do mock aprovado, "Centro / Subcentro" (a aba e o modal grande são o mesmo componente) */
      /* P159b (mock): "Centro · Subcentro" e, no lugar do Status, a coluna de 22px do sinal (✓ / ○ / ⇄) */
      /* P159e: o dinheiro em três colunas (Entradas · Saídas · Saldo) */
      .toEqual(['Data', 'Descrição', 'Fornecedor', 'Centro · Subcentro', 'Entradas', 'Saídas', 'Saldo', '']);
    const fornecedores = screen.getAllByTestId('sistema-fornecedor');
    expect(fornecedores.map((s) => s.textContent)).toEqual(['Antonio Peres Neto']);
    expect(fornecedores[0].getAttribute('title')).toBe('Antonio Peres Neto');
    expect(fornecedores[0].className).toContain('truncate');
  });
});

describe('fix2 — o selo de status da Conferência é uma referência pequena', () => {
  it('selo a 8px, só texto no programado; a casada não tem selo', async () => {
    const modal = await abrirConferencia();
    const prog = modal.querySelector('[data-status="programado"]')!;
    expect(prog.firstElementChild!.className).toContain('text-[8px]');
    expect(prog.firstElementChild!.className).not.toMatch(/\bbg-/);
    expect(modal.querySelector('[data-status="conciliado"]')).toBeNull();
  });
});

describe('PR-CONC-SUGESTOES-CASAR-01 / P159a — os chips (Todos · Sem par · Casados), fundo verde nas casadas e N estável', () => {
  const casada = (modal: HTMLElement) => within(modal).queryByText(CASADA);
  const fechamento = (modal: HTMLElement, dia: string) =>
    [...modal.querySelectorAll('tr[data-fechamento]')].find((tr) => tr.textContent?.startsWith(`Fechamento ${dia}`)) ?? null;

  it('os chips contam a MESMA mesa: Todos 2 · Sem par 1 · Casados 1; Vencidos 0 desabilitado', async () => {
    await abrirConferencia();
    expect(screen.getByTestId('chip-todos').textContent).toBe('Todos 2');
    expect(screen.getByTestId('chip-sem_par').textContent).toBe('Sem par 1');
    expect(screen.getByTestId('chip-casados').textContent).toBe('Casados 1');
    expect(screen.getByTestId('chip-vencidos')).toBeDisabled();
    expect(screen.getByTestId('chip-todos').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('so-nao-conciliados')).toBeNull();
  });

  it('Casados: só a casada; o dia que só tinha sem par some; o candidato (não casado) também', async () => {
    const modal = await abrirConferencia();
    fireEvent.click(screen.getByTestId('chip-casados'));
    await waitFor(() => expect(modal.querySelector('tr[data-extrato-sem-par]')).toBeNull());
    expect(casada(modal)).not.toBeNull();
    expect(fechamento(modal, '05/09')).toBeNull();
    expect(linhaDoCandidatoOuNada(modal)).toBeNull();
  });
  it('em "Todos", a linha casada tem o fundo verde leve; a não casada, não', async () => {
    const modal = await abrirConferencia();
    const tr = casada(modal)!.closest('tr')!;
    expect(tr.hasAttribute('data-conciliada')).toBe(true);
    expect(tr.className).toContain('bg-success/[0.06]');
    expect(linhaSemPar(modal).className).not.toContain('bg-success');
    /* a busca sabe achar: há exatamente uma linha casada nesta mesa */
    expect(modal.querySelectorAll('tr[data-conciliada]')).toHaveLength(1);
  });

  it('Sem par: esconde a casada e o dia que só tinha ela; o dia que fica mantém o fechamento inteiro', async () => {
    const modal = await abrirConferencia();
    expect(fechamento(modal, '04/09')).not.toBeNull();
    const fech05 = () => fechamento(modal, '05/09')!.textContent;
    const antes = fech05();
    fireEvent.click(screen.getByTestId('chip-sem_par'));
    await waitFor(() => expect(casada(modal)).toBeNull());
    expect(fechamento(modal, '04/09')).toBeNull(); // 04/09 só tinha a casada: some inteiro
    expect(modal.querySelectorAll('tr[data-conciliada]')).toHaveLength(0);
    expect(linhaSemPar(modal)).not.toBeNull();
    expect(fech05()).toBe(antes); // o fechamento não é recalculado
    fireEvent.click(screen.getByTestId('chip-todos'));
    await waitFor(() => expect(casada(modal)).not.toBeNull());
  });

  it('Sem par, num dia que tem casada E sem par: o dia fica, só a casada some (dos dois lados)', async () => {
    /* a casada mudou para 05/09: o "04/09" do agendamento já não é o dia, e FICA no texto limpo (`historicoDoBanco`) */
    const casada = (modal: HTMLElement) => within(modal).queryByText('Pix Agendamento 04/09 · ANTONIO PERES NETO');
    fixture.espelho = { ...ESPELHO,
      ofx_completo: ESPELHO.ofx_completo.map((e) => (e.extrato_id === 'e2' ? { ...e, data: '2026-09-05' } : e)),
      sistema_completo: ESPELHO.sistema_completo.map((s) => ({ ...s, data: '2026-09-05' })) };
    const modal = await abrirConferencia();
    expect(casada(modal)).not.toBeNull();
    expect(within(modal).queryByText(/Antonio Peres Neto/)).not.toBeNull(); // o lado do sistema da casada
    fireEvent.click(screen.getByTestId('chip-sem_par'));
    await waitFor(() => expect(casada(modal)).toBeNull());
    expect(within(modal).queryByText(/Antonio Peres Neto/)).toBeNull();
    expect(fechamento(modal, '05/09')).not.toBeNull();
    expect(linhaSemPar(modal)).not.toBeNull();
  });

  it('o estado vive só enquanto o modal está aberto: fechar e reabrir volta a mostrar tudo', async () => {
    const modal = await abrirConferencia();
    fireEvent.click(screen.getByTestId('chip-sem_par'));
    await waitFor(() => expect(casada(modal)).toBeNull());
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByTestId('modal-conferencia')).toBeNull());
    fireEvent.click(botaoSubAba('Conferência'));
    const modal2 = await screen.findByTestId('modal-conferencia');
    expect(casada(modal2)).not.toBeNull();
    expect(screen.getByTestId('chip-todos').getAttribute('aria-pressed')).toBe('true');
  });

  it('N do menu = linhas do modal, e abrir duas vezes dá o mesmo N (a mesma lista, calculada uma vez)', async () => {
    fixture.espelho = { ...ESPELHO, sistema_candidatos: [...ESPELHO.sistema_candidatos!, {
      ...ESPELHO.sistema_candidatos![0], lancamento_id: 'c2', valor: 134613.84, valor_assinado: -134613.84,
      descricao: 'Compra de gado', fornecedor: 'Fazenda Boa Vista',
    }] };
    const modal = await abrirConferencia();
    const semPar = () => linhaSemPar(modal);
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

/* CONC-BLOCOS-TELA-01 — o bloco na Conferência: "Desfazer bloco" no "⋯" da linha agrupada de um bloco, com motivo
   obrigatório num passo inline (sem `confirm()`), e o lançamento PARCIAL que continua candidato com "Parcial — falta". */
describe('CONC-BLOCOS-TELA-01 — desfazer bloco e o parcial', () => {
  const abrirMenu = async (linha: HTMLElement) => {
    fireEvent.keyDown(within(linha).getByRole('button', { name: 'Ações da linha' }), { key: 'Enter' });
    return screen.findByRole('menu');
  };
  const COM_BLOCO: EspelhadosReais = {
    ...ESPELHO,
    vinculos: [{ extrato_id: 'e2', lancamento_id: 's1', valor_aplicado: 6648.5, tipo_aprovacao: 'agrupamento_manual', grupo_id: 'b1' }],
  };

  it('linha de bloco: o menu troca "Desconciliar grupo" por "Desfazer bloco"; o passo exige motivo', async () => {
    fixture.espelho = COM_BLOCO;
    fixture.tabelas = { conciliacao_blocos: [{ id: 'b1' }] };
    const modal = await abrirConferencia();
    const casada = within(modal).getByText(CASADA).closest('tr')!;
    const menu = await abrirMenu(casada);
    await waitFor(() => expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toContain('Desfazer bloco'));
    expect(within(menu).queryByText('Desconciliar grupo')).toBeNull();
    fireEvent.click(within(menu).getByText('Desfazer bloco'));
    const passo = await screen.findByTestId('passo-desfazer-bloco');
    /* sem motivo: não chama a RPC e diz por quê, ali mesmo */
    fireEvent.click(within(passo).getByRole('button', { name: 'Desfazer' }));
    expect(within(passo).getByTestId('erro-desfazer-bloco').textContent).toBe('Diga por que o bloco está sendo desfeito.');
    expect(fixture.chamadas.some((c) => c.fn === 'fn_desfazer_bloco')).toBe(false);
    /* com motivo: chama o gesto contrário do banco */
    fireEvent.change(within(passo).getByLabelText('Motivo do desfazer'), { target: { value: 'Pix errado' } });
    fireEvent.click(within(passo).getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(fixture.chamadas.find((c) => c.fn === 'fn_desfazer_bloco')?.args)
      .toEqual({ p_bloco: 'b1', p_motivo: 'Pix errado' }));
  });

  it('grupo que NÃO é bloco continua com "Desconciliar grupo"', async () => {
    fixture.espelho = COM_BLOCO;
    const modal = await abrirConferencia();
    const casada = within(modal).getByText(CASADA).closest('tr')!;
    const menu = await abrirMenu(casada);
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toContain('Desconciliar grupo');
  });

  it('candidato vinculado PARCIAL: chip "Parcial — falta R$ X" e checkbox (continua casável)', async () => {
    fixture.espelho = { ...ESPELHO, sistema_candidatos: [{ ...ESPELHO.sistema_candidatos![0], ja_conciliado: true }] };
    fixture.tabelas = { conciliacao_bancaria_itens: [{ lancamento_id: 'c1', valor_aplicado: 3060 }] };
    const modal = await abrirConferencia();
    const cand = () => linhaDoCandidato(modal);
    await waitFor(() => expect(within(cand()).getByTestId('chip-parcial').textContent).toBe('Parcial — falta R$ 347,89'));
    expect(within(cand()).getByLabelText('Marcar candidato')).toBeInTheDocument();
    expect(within(cand()).queryByText('já vinculado')).toBeNull();
  });

  it('candidato vinculado INTEIRO continua "já vinculado", sem checkbox', async () => {
    fixture.espelho = { ...ESPELHO, sistema_candidatos: [{ ...ESPELHO.sistema_candidatos![0], ja_conciliado: true }] };
    fixture.tabelas = { conciliacao_bancaria_itens: [{ lancamento_id: 'c1', valor_aplicado: 3407.89 }] };
    const modal = await abrirConferencia();
    const cand = linhaDoCandidato(modal);
    await waitFor(() => expect(within(cand).getByText('já vinculado')).toBeInTheDocument());
    expect(within(cand).queryByLabelText('Marcar candidato')).toBeNull();
    expect(within(cand).queryByTestId('chip-parcial')).toBeNull();
  });
});

/* CONC-N1-DESCONCILIAR-01 — o N:1 SEM grupo (o caso 1b46c5de: 3 vínculos criados um a um, sem `grupo_id`) não tinha
   caminho para desfazer. Cada extrato filho ganha "Desconciliar" pela RPC unitária; com grupo, continua pela linha mãe. */
describe('CONC-N1-DESCONCILIAR-01 — N:1 sem grupo desconcilia por extrato', () => {
  const abrirMenu = async (linha: HTMLElement) => {
    fireEvent.keyDown(within(linha).getByRole('button', { name: 'Ações da linha' }), { key: 'Enter' });
    return screen.findByRole('menu');
  };
  const N1 = (grupo: string | null): EspelhadosReais => ({
    ...ESPELHO,
    ofx_completo: [
      ...ESPELHO.ofx_completo,
      { extrato_id: 'e3', data: '2026-09-06', historico: 'TED ENVIADA ITAU 1', documento: null, valor: -100000, status: 'conciliado', flag_dup: false, flag_investimento: false },
      { extrato_id: 'e4', data: '2026-09-06', historico: 'TED ENVIADA ITAU 2', documento: null, valor: -100000, status: 'conciliado', flag_dup: false, flag_investimento: false },
    ],
    sistema_completo: [
      ...ESPELHO.sistema_completo,
      { lancamento_id: 's9', data: '2026-09-06', descricao: 'Transferência Itau -> Sicredi', centro: 'Transferências', subcentro: 'Entre contas',
        valor_assinado: -100000, sinal: '-1', status: 'conciliado', fornecedor: null },
    ],
    vinculos: [
      ...ESPELHO.vinculos,
      { extrato_id: 'e3', lancamento_id: 's9', valor_aplicado: 100000, tipo_aprovacao: 'manual', grupo_id: grupo },
      { extrato_id: 'e4', lancamento_id: 's9', valor_aplicado: 100000, tipo_aprovacao: 'manual', grupo_id: grupo },
    ],
  });
  const linhaDe = (modal: HTMLElement, texto: string | RegExp): HTMLElement => {
    const tr = within(modal).getByText(texto).closest('tr');
    if (!(tr instanceof HTMLElement)) throw new Error(`linha de "${texto}" não encontrada`);
    return tr;
  };
  const item = (menu: HTMLElement, rotulo: string) =>
    within(menu).getAllByRole('menuitem').find((i) => i.textContent?.startsWith(rotulo))!;

  it('filha SEM grupo: "Desconciliar" habilitado chama fn_desfazer_vinculo_extrato com o extrato DELA', async () => {
    fixture.espelho = N1(null);
    const modal = await abrirConferencia();
    const menu = await abrirMenu(linhaDe(modal, 'TED ENVIADA ITAU 2'));
    const d = item(menu, 'Desconciliar');
    expect(d.hasAttribute('data-disabled')).toBe(false);
    fireEvent.click(d);
    await waitFor(() => expect(fixture.chamadas.find((c) => c.fn === 'fn_desfazer_vinculo_extrato')?.args)
      .toEqual({ p_extrato_id: 'e4', p_motivo: 'desfeito_no_espelho' }));
    expect(fixture.chamadas.filter((c) => c.fn === 'fn_desfazer_vinculo_extrato')).toHaveLength(1);
  });

  /* CONC-SEM-F5-01 — O CASO DO GABRIEL (04/10): conciliava/desconciliava no Casar, voltava à aba Conciliação e o mês seguia com o
     número de antes até o F5. Todo gesto da Conferência cai no `onMudou` do Espelho, que agora AVISA o canal — e o dono (o resumo
     E a régua do ano) é relido. Aqui a régua está montada ao lado, como na tela (a aba Conciliação fica montada atrás do Casar). */
  it('CONC-SEM-F5-01: o gesto da Conferência avisa o canal, e o resumo E a régua são relidos sem F5', async () => {
    fixture.espelho = N1(null);
    function ReguaDoAno() { useStatusAno('nj', 2026); return null; }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ReguaDoAno />
        <EspelhoConciliacaoTab clienteId="nj" contaId="bb" ano="2026" mes="09" />
      </QueryClientProvider>,
    );
    await screen.findByTestId('resumo-espelho');
    fireEvent.click(botaoSubAba('Conferência'));
    const modal = await screen.findByTestId('modal-conferencia');
    const chamadas = (fn: string) => fixture.chamadas.filter((c) => c.fn === fn).length;
    await waitFor(() => expect(chamadas('fn_conciliacao_status_ano')).toBe(1));
    const [resumoAntes, reguaAntes] = [chamadas('fn_conciliacao_resumo_mes'), chamadas('fn_conciliacao_status_ano')];
    expect(resumoAntes).toBe(1);
    expect(CANAL.avisos).toEqual([]);

    fireEvent.click(item(await abrirMenu(linhaDe(modal, 'TED ENVIADA ITAU 2')), 'Desconciliar'));

    await waitFor(() => expect(CANAL.avisos).toEqual(['nj']));
    await waitFor(() => expect(chamadas('fn_conciliacao_resumo_mes')).toBe(resumoAntes + 1));
    await waitFor(() => expect(chamadas('fn_conciliacao_status_ano')).toBe(reguaAntes + 1));
    /* o número de antes fica na tela enquanto o novo não chega: o quadro do topo não some */
    expect(screen.getByTestId('resumo-espelho')).toBeInTheDocument();
  });

  it('a mãe sem grupo diz onde desconciliar', async () => {
    fixture.espelho = N1(null);
    const modal = await abrirConferencia();
    const mae = linhaDe(modal, /2 extratos/);
    const g = item(await abrirMenu(mae), 'Desconciliar grupo');
    expect(g.hasAttribute('data-disabled')).toBe(true);
    expect(g.textContent).toContain('sem grupo: desconcilie cada extrato nas linhas abaixo');
  });

  it('filha COM grupo: "Desconciliar" continua desabilitado (desfaz pela mãe) e nada é chamado', async () => {
    fixture.espelho = N1('g1');
    const modal = await abrirConferencia();
    const menu = await abrirMenu(linhaDe(modal, 'TED ENVIADA ITAU 1'));
    const d = item(menu, 'Desconciliar');
    expect(d.hasAttribute('data-disabled')).toBe(true);
    expect(d.textContent).toContain('desconcilie pela linha do lançamento, acima');
    fireEvent.click(d);
    expect(fixture.chamadas.some((c) => c.fn === 'fn_desfazer_vinculo_extrato')).toBe(false);
  });
});

/* CONC-MESA-SINAL-01 — o desenho da filha usa o sinal do LANÇAMENTO: a dedução aparece NEGATIVA dentro do depósito, e a
   soma da mãe é o líquido (o mesmo valor do extrato). Caso real NJ Sicredi Lavoura 06/04/2026. */
describe('CONC-MESA-SINAL-01 — a dedução aparece negativa no depósito', () => {
  const DEP: EspelhadosReais = {
    ...ESPELHO,
    ofx_completo: [...ESPELHO.ofx_completo,
      { extrato_id: 'dep', data: '2026-09-07', historico: 'DEPOSITO VENDA GRAO', documento: null, valor: 402395.07, status: 'conciliado', flag_dup: false, flag_investimento: false }],
    sistema_completo: [...ESPELHO.sistema_completo,
      { lancamento_id: 'venda', data: '2026-09-07', descricao: 'Venda Soja', centro: null, subcentro: null, valor_assinado: 428386.4, sinal: '1', status: 'conciliado', fornecedor: null },
      { lancamento_id: 'senar', data: '2026-09-07', descricao: 'Senar retido', centro: null, subcentro: null, valor_assinado: -856.76, sinal: '-1', status: 'conciliado', fornecedor: null },
      { lancamento_id: 'desc', data: '2026-09-07', descricao: 'Descontos classificacao', centro: null, subcentro: null, valor_assinado: -25134.57, sinal: '-1', status: 'conciliado', fornecedor: null }],
    vinculos: [...ESPELHO.vinculos,
      { extrato_id: 'dep', lancamento_id: 'venda', valor_aplicado: 428386.4, tipo_aprovacao: 'agrupamento_manual', grupo_id: 'g9' },
      { extrato_id: 'dep', lancamento_id: 'senar', valor_aplicado: 856.76, tipo_aprovacao: 'agrupamento_manual', grupo_id: 'g9' },
      { extrato_id: 'dep', lancamento_id: 'desc', valor_aplicado: 25134.57, tipo_aprovacao: 'agrupamento_manual', grupo_id: 'g9' }],
  };

  it('filhas: venda positiva, Senar e descontos negativos; a mãe soma o líquido; o dia confere', async () => {
    fixture.espelho = DEP;
    const modal = await abrirConferencia();
    const mae = within(modal).getByText('DEPOSITO VENDA GRAO').closest('tr');
    if (!(mae instanceof HTMLElement)) throw new Error('mãe não encontrada');
    expect(mae.textContent).toContain('402.395,07');
    expect(mae.textContent).not.toContain('454.377,73');   // a soma errada (bruto + deduções)
    const filhas: string[] = [];
    let tr = mae.nextElementSibling;
    while (tr && tr.textContent?.includes('↳')) { filhas.push(tr.textContent ?? ''); tr = tr.nextElementSibling; }
    expect(filhas).toHaveLength(3);
    expect(filhas.some((t) => t.includes('-856,76'))).toBe(true);
    expect(filhas.some((t) => t.includes('-25.134,57'))).toBe(true);
    expect(filhas.some((t) => t.includes('428.386,40') && !t.includes('-428.386,40'))).toBe(true);
    const fechamento = [...modal.querySelectorAll('tr')].find((r) => r.textContent?.startsWith('Fechamento 07/09'));
    expect(fechamento?.textContent).toContain('confere');
  });
});

/* P159b — "ver o dia na Conferência" (a Evolução do saldo): com quem monta, pede o dia a ele (o `irParaConferencia` da tela); sozinho, o
   próprio Espelho abre a Conferência rolada no dia. No fixture o 05/09 tem o extrato sem par: a diferença muda ali. */
describe('P159b — a Evolução abre a Conferência no dia', () => {
  it('com quem monta: o dia vai para ele', async () => {
    const onVerDiaNaConferencia = vi.fn();
    montar({ aba: 'evolucao', onAbaChange: () => {}, onVerDiaNaConferencia });
    fireEvent.click(await screen.findByTestId('evolucao-ver-dia'));
    expect(onVerDiaNaConferencia).toHaveBeenCalledWith('2026-09-05');
  });
  it('sozinho: abre a própria Conferência e rola até o dia', async () => {
    const rolados: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { rolados.push(this.getAttribute('data-dia') ?? ''); };
    montar();
    await screen.findByTestId('resumo-espelho');
    fireEvent.click(botaoSubAba('Evolução do saldo'));
    fireEvent.click(await screen.findByTestId('evolucao-ver-dia'));
    await screen.findByTestId('modal-conferencia');
    await waitFor(() => expect(rolados).toContain('2026-09-05'));
  });
});
