/**
 * FIN-PIX-CADASTRO-MODAL-01 — "Dados para pagamento" no modal do lançamento: o cadastro do fornecedor manda enquanto não pago.
 *
 * ⚠ O CASO DO GABRIEL (Vera, 04/10): a "Folha de Pagamento" do Agnaldo da Cruz Cunegundes nasce da recorrência com forma PIX e
 *   `dados_pagamento` nulo. O modal abria com o campo VAZIO — a chave só aparecia trocando a forma para "Nenhuma" e voltando.
 * ⚠ O DIALOG É MONTADO DE VERDADE (o mesmo arnês do `safraGravadaModal`): o que se prova é o que a aba Pagamento mostra e o
 *   PAYLOAD do `onSave`. O `FornecedorFormDialog` é um dublê — o que interessa aqui é QUANDO o modal o abre, com QUAL
 *   fornecedor, e o que ele faz depois que o cadastro salva (relê aquele fornecedor e usa por cima da prop).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

/* o que a releitura do fornecedor devolve (`.from('financeiro_fornecedores')…maybeSingle()`), e por qual id foi pedida */
const banco = vi.hoisted(() => ({ relido: null as Record<string, unknown> | null, pedidos: [] as string[] }));
vi.mock('@/integrations/supabase/client', () => {
  const construtor = (tabela: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    let id = '';
    for (const m of ['select', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains']) b[m] = () => b;
    b.eq = (col: string, v: string) => { if (col === 'id') id = v; return b; };
    b.maybeSingle = () => {
      if (tabela === 'financeiro_fornecedores') { banco.pedidos.push(id); return Promise.resolve({ data: banco.relido, error: null }); }
      return Promise.resolve({ data: null, error: null });
    };
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => construtor(t),
      rpc: () => Promise.resolve({ data: null, error: null }),
      storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'vera', nome: 'Vera' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('@/components/financeiro-v2/FornecedorFormDialog', () => ({
  FornecedorFormDialog: (p: { open: boolean; editing: { id: string; nome: string } | null; onSaved: () => void; onClose: () => void }) =>
    p.open ? (
      <div data-testid="cadastro-fornecedor" data-editando={p.editing?.id}>
        cadastro de {p.editing?.nome}
        <button type="button" onClick={() => { p.onClose(); p.onSaved(); }}>salvar cadastro</button>
      </div>
    ) : null,
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { esquecerAtividade } from '@/lib/financeiro/ultimaAtividade';

const FAZENDAS = [{ id: 'bg', nome: 'Faz Baia Grande' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{
  id: 'itau', nome_conta: 'Itaú Personalite', banco: 'Itaú', fazenda_id: 'bg', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Itaú Personalite', agencia: null, numero_conta: null, conta_digito: null,
}];
const forn = (x: Partial<FornecedorV2>): FornecedorV2 => ({
  id: 'x', nome: 'x', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null, pix_tipo_chave: null, pix_chave: null,
  banco: null, agencia: null, conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null, observacao_pagamento: null, ...x,
});
const AGNALDO = forn({ id: 'agn', nome: 'Agnaldo da Cruz Cunegundes', tipo_recebimento: 'PIX', pix_tipo_chave: 'Telefone',
  pix_chave: '67999990000', nome_favorecido: 'Agnaldo da Cruz Cunegundes' });
const PANTANAL = forn({ id: 'pan', nome: 'Comercial Pantanal de Rio Verde Ltda' });                    // sem nada no cadastro
const OFICINA = forn({ id: 'ofi', nome: 'Oficina do Zé', tipo_recebimento: 'Transferência Bancária', banco: 'Sicredi',
  agencia: '0903', conta: '12345-6', tipo_conta: 'Corrente' });
const FORNECEDORES = [AGNALDO, PANTANAL, OFICINA];
const TEXTO_AGNALDO = 'PIX | Tipo: Telefone\nChave: 67999990000\nFavorecido: Agnaldo da Cruz Cunegundes';
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-sal', subcentro: 'Salários e Encargos Pecuária', centro_custo: 'Mão de Obra', grupo_custo: 'Custo Fixo Pecuária',
    macro_custo: 'Custeio Produção', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-dev', subcentro: 'Venda de Machos Adultos', centro_custo: 'Venda de Bovinos', grupo_custo: 'Receita Pecuária',
    macro_custo: 'Receita Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'pecuaria' },
];
const SAFRAS: Safra[] = [{ id: 'p2627', nome: 'Safra 26/27 Pecuária', codigo: '26/27-Pec', escopo_negocio: 'pecuaria', ativa: true }] as Safra[];

const FOLHA: LancamentoV2 = {
  id: '5c281f67-ebe3-4bdc-a7da-413d40f76792', cliente_id: 'vera', fazenda_id: 'bg', conta_bancaria_id: 'itau',
  conta_destino_id: null, data_competencia: '2026-10-01', data_vencimento: '2026-11-05', data_pagamento: null,
  ano_mes: '2026-10', valor: 3192, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'previsto',
  descricao: 'Folha de Pagamento', macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo Pecuária',
  centro_custo: 'Mão de Obra', subcentro: 'Salários e Encargos Pecuária', escopo_negocio: 'pecuaria', observacao: null,
  numero_documento: null, tipo_documento: null, favorecido_id: 'agn', forma_pagamento: 'PIX', dados_pagamento: null,
  origem_lancamento: 'recorrencia', recorrencia_id: null, plano_conta_id: 'pl-sal', safra_id: 'p2627',
  cultura: null, fase: null, cancelado: false, editado_manual: false,
} as LancamentoV2;

const copiado: string[] = [];
beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  esquecerAtividade();
  banco.relido = null; banco.pedidos.length = 0; copiado.length = 0;
  toastMock.success.mockClear();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => { copiado.push(t); return Promise.resolve(); } } });
});

type Props = Partial<React.ComponentProps<typeof LancamentoV2Dialog>>;
const assentar = () => new Promise((r) => setTimeout(r, 30));
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;

/** Monta fechado, abre com o lançamento (como a tela faz) e vai à aba Pagamento. */
async function abrirNoPagamento(lanc: LancamentoV2, extra: Props = {}) {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string) => true);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: Props) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open={false} onClose={() => {}} onSave={onSave} lancamento={null}
          fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
          onCriarFornecedor={async () => null} {...p} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree({}));
  r.rerender(tree({ open: true, lancamento: lanc, ...extra }));
  await screen.findByDisplayValue(lanc.descricao ?? '');
  await assentar();
  const aba = screen.getByRole('tab', { name: /Pagamento/ });
  fireEvent.mouseDown(aba); fireEvent.click(aba);
  await screen.findByText('Dados para pagamento');
  return { onSave };
}
/* `formatMoeda` separa o R$ com espaço duro: o espaço se normaliza, o número não. */
const linhasDoBloco = () => screen.getAllByTestId('pgto-linha')
  .map(l => [l.children[0].textContent, (l.children[1].textContent ?? '').replace(/\s/g, ' ')]);
const formaNoSelect = () => {
  const rotulo = screen.getAllByText('Forma de Pagamento').find(el => el.tagName === 'LABEL');
  return within(rotulo!.parentElement as HTMLElement).getByRole('combobox');
};
async function trocarForma(para: string) {
  const gatilho = formaNoSelect();
  fireEvent.keyDown(gatilho, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: para }));
  await assentar();
}
async function salvar(onSave: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
  fireEvent.click(botaoSalvar());
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return onSave.mock.calls[0][0] as LancamentoV2Form;
}

describe('(a) R2 — previsto com forma PIX e dados nulos: o bloco do cadastro, sem clique', () => {
  it('a chave do cadastro aparece ao abrir; salvar grava dados nulos e a forma como estava', async () => {
    const { onSave } = await abrirNoPagamento(FOLHA);
    expect(screen.getByTestId('pgto-cabecalho').textContent).toBe('PIX · do cadastro do fornecedor');
    expect(linhasDoBloco()).toEqual([
      ['Tipo da chave', 'Telefone'], ['Chave', '67999990000'], ['Favorecido', 'Agnaldo da Cruz Cunegundes'], ['Valor', 'R$ 3.192,00'],
    ]);
    expect(screen.queryByTestId('pgto-proprio')).toBeNull();
    const form = await salvar(onSave);
    expect(form.dados_pagamento).toBeNull();
    expect(form.forma_pagamento).toBe('PIX');
  });
});

describe('(b) R2 — cópia gravada IGUAL ao que o cadastro monta: segue o cadastro e salva nulo', () => {
  it('modo cadastro; o payload leva null, não a cópia', async () => {
    const { onSave } = await abrirNoPagamento({ ...FOLHA, dados_pagamento: TEXTO_AGNALDO });
    expect(screen.getByTestId('pgto-bloco')).toBeInTheDocument();
    expect(screen.queryByTestId('pgto-proprio')).toBeNull();
    expect((await salvar(onSave)).dados_pagamento).toBeNull();
  });
});

describe('(c) R3 — cópia gravada DIFERENTE: dados próprios, texto intacto e inteiro', () => {
  const PROPRIO = 'PIX | Tipo: CPF\nChave: 111.222.333-44\nFavorecido: Esposa do Agnaldo\nconta da esposa neste mês';
  it('campo com o texto inteiro, uma linha de campo por linha de texto, sem o bloco; salva o texto', async () => {
    const { onSave } = await abrirNoPagamento({ ...FOLHA, dados_pagamento: PROPRIO });
    const proprio = screen.getByTestId('pgto-proprio');
    expect(within(proprio).getByText('Dados próprios deste lançamento')).toBeInTheDocument();
    const campo = within(proprio).getByRole('textbox') as HTMLTextAreaElement;
    expect(campo.value).toBe(PROPRIO);
    expect(campo.rows).toBe(4);                                            // todas as linhas visíveis (era rows=1)
    expect(campo.className).toContain('overflow-hidden');                  // sem rolagem interna
    expect(screen.queryByTestId('pgto-bloco')).toBeNull();
    expect((await salvar(onSave)).dados_pagamento).toBe(PROPRIO);
  });
  it('"voltar a usar o cadastro" limpa o texto e mostra o bloco; "usar outros dados" abre o campo vazio', async () => {
    const { onSave } = await abrirNoPagamento({ ...FOLHA, dados_pagamento: PROPRIO });
    fireEvent.click(screen.getByText('voltar a usar o cadastro'));
    expect(screen.getByTestId('pgto-bloco')).toBeInTheDocument();
    fireEvent.click(screen.getByText('usar outros dados só neste lançamento'));
    const campo = within(screen.getByTestId('pgto-proprio')).getByRole('textbox') as HTMLTextAreaElement;
    expect(campo.value).toBe('');
    fireEvent.change(campo, { target: { value: 'pagar em dinheiro na fazenda' } });
    expect((await salvar(onSave)).dados_pagamento).toBe('pagar em dinheiro na fazenda');
  });
});

describe('(d) R4 — trocar a forma não escreve nem apaga texto', () => {
  it('modo próprio: o texto digitado sobrevive à troca de forma (antes era sobrescrito pelo cadastro)', async () => {
    const PROPRIO = 'chave da esposa: 111.222.333-44';
    const { onSave } = await abrirNoPagamento({ ...FOLHA, dados_pagamento: PROPRIO });
    await trocarForma('Boleto');
    await trocarForma('PIX');
    expect((within(screen.getByTestId('pgto-proprio')).getByRole('textbox') as HTMLTextAreaElement).value).toBe(PROPRIO);
    expect((await salvar(onSave)).dados_pagamento).toBe(PROPRIO);
  });
  it('modo cadastro: a troca só re-renderiza o bloco e NÃO vira "próprio" por causa da cópia igual que veio gravada', async () => {
    const { onSave } = await abrirNoPagamento({ ...FOLHA, dados_pagamento: TEXTO_AGNALDO });
    await trocarForma('Boleto');
    expect(screen.queryByTestId('pgto-proprio')).toBeNull();               // a cópia de PIX ≠ texto de Boleto, e mesmo assim não aparece
    expect(screen.getByTestId('pgto-nada')).toBeInTheDocument();
    await trocarForma('PIX');
    expect(linhasDoBloco()[1]).toEqual(['Chave', '67999990000']);
    const form = await salvar(onSave);
    expect(form.dados_pagamento).toBeNull();
  });
});

describe('(e) R5 — fornecedor sem Pix: aviso com o atalho para o cadastro, nunca o campo vazio em silêncio', () => {
  it('aviso âmbar; o botão abre o cadastro DAQUELE fornecedor; depois de salvar, o bloco mostra a chave sem reabrir', async () => {
    await abrirNoPagamento({ ...FOLHA, favorecido_id: 'pan' });
    const falta = screen.getByTestId('pgto-falta');
    expect(within(falta).getByText('Comercial Pantanal de Rio Verde Ltda não tem Pix cadastrado.')).toBeInTheDocument();
    expect(screen.queryByTestId('pgto-bloco')).toBeNull();
    expect(screen.queryByTestId('cadastro-fornecedor')).toBeNull();
    fireEvent.click(within(falta).getByText('+ Cadastrar Pix do fornecedor'));
    expect(screen.getByTestId('cadastro-fornecedor').getAttribute('data-editando')).toBe('pan');
    /* o cadastro salva: o modal relê AQUELE fornecedor e usa a leitura por cima da prop (que continua sem a chave) */
    banco.relido = { ...PANTANAL, tipo_recebimento: 'PIX', pix_tipo_chave: 'CNPJ', pix_chave: '09.248.179/0001-75' };
    fireEvent.click(screen.getByText('salvar cadastro'));
    await waitFor(() => expect(screen.getByTestId('pgto-bloco')).toBeInTheDocument());
    expect(banco.pedidos).toEqual(['pan']);
    expect(linhasDoBloco().slice(0, 3)).toEqual([
      ['Tipo da chave', 'CNPJ'], ['Chave', '09.248.179/0001-75'], ['Favorecido', 'Comercial Pantanal de Rio Verde Ltda'],
    ]);
    expect(screen.queryByTestId('pgto-falta')).toBeNull();
  });
  it('Transferência sem banco: "não tem dados bancários cadastrados."; forma sem dado de cadastro: só o link, sem aviso', async () => {
    await abrirNoPagamento({ ...FOLHA, favorecido_id: 'pan', forma_pagamento: 'Transferência' });
    expect(screen.getByText('Comercial Pantanal de Rio Verde Ltda não tem dados bancários cadastrados.')).toBeInTheDocument();
    await trocarForma('Boleto');
    expect(screen.queryByTestId('pgto-falta')).toBeNull();
    expect(within(screen.getByTestId('pgto-nada')).getByText('informar dados só neste lançamento')).toBeInTheDocument();
  });
  it('"editar cadastro" do bloco abre o mesmo cadastro', async () => {
    await abrirNoPagamento(FOLHA);
    fireEvent.click(screen.getByText('editar cadastro'));
    expect(screen.getByTestId('cadastro-fornecedor').getAttribute('data-editando')).toBe('agn');
  });
});

describe('(f) R1 — lançamento SEM forma: mostra pela preferida do cadastro e NÃO grava a forma', () => {
  it('bloco PIX pela preferida, select em "Nenhuma", payload com forma nula', async () => {
    const { onSave } = await abrirNoPagamento({ ...FOLHA, forma_pagamento: null });
    expect(formaNoSelect().textContent).toBe('Nenhuma');
    expect(screen.getByTestId('pgto-cabecalho').textContent).toBe('PIX · do cadastro do fornecedor');
    const form = await salvar(onSave);
    expect(form.forma_pagamento).toBeNull();
    expect(form.dados_pagamento).toBeNull();
  });
  it('"Transferência Bancária" do cadastro vira o bloco de Transferência', async () => {
    await abrirNoPagamento({ ...FOLHA, favorecido_id: 'ofi', forma_pagamento: null });
    expect(screen.getByTestId('pgto-cabecalho').textContent).toBe('Transferência · do cadastro do fornecedor');
    expect(linhasDoBloco().slice(0, 2)).toEqual([['Banco', 'Sicredi'], ['Agência / Conta', '0903 / 12345-6 · Corrente']]);
  });
});

describe('(g) R6 — realizado', () => {
  const PAGO = { ...FOLHA, status_transacao: 'realizado', data_pagamento: '2026-11-05' } as LancamentoV2;
  it('com texto gravado mostra o GRAVADO (mesmo igual ao cadastro), sem "voltar a usar o cadastro", e o salva de volta', async () => {
    const { onSave } = await abrirNoPagamento({ ...PAGO, dados_pagamento: TEXTO_AGNALDO });
    const proprio = screen.getByTestId('pgto-proprio');
    expect(within(proprio).getByText('Dados gravados neste lançamento')).toBeInTheDocument();
    expect((within(proprio).getByRole('textbox') as HTMLTextAreaElement).value).toBe(TEXTO_AGNALDO);
    expect(screen.queryByText('voltar a usar o cadastro')).toBeNull();
    expect((await salvar(onSave)).dados_pagamento).toBe(TEXTO_AGNALDO);
  });
  it('sem texto gravado mostra o cadastro com o cabeçalho "cadastro atual"', async () => {
    await abrirNoPagamento(PAGO);
    expect(screen.getByTestId('pgto-cabecalho').textContent).toBe('PIX · cadastro atual');
  });
});

describe('(h) copiar', () => {
  it('a chave vai inteira; o valor vai sem R$ e sem ponto de milhar; cada um com o seu aviso', async () => {
    await abrirNoPagamento(FOLHA);
    fireEvent.click(screen.getByText('Copiar chave'));
    const [, , favorecido, valor] = screen.getAllByTestId('pgto-linha');
    fireEvent.click(within(valor).getByText('Copiar'));
    fireEvent.click(within(favorecido).getByText('Copiar'));
    expect(copiado).toEqual(['67999990000', '3192,00', 'Agnaldo da Cruz Cunegundes']);
    expect(toastMock.success.mock.calls.map(c => c[0])).toEqual(['Chave PIX copiada', 'Copiado', 'Copiado']);
    /* "Tipo da chave" não tem botão */
    expect(within(screen.getAllByTestId('pgto-linha')[0]).queryByRole('button')).toBeNull();
  });
});

describe('(i) novo lançamento com prefill (duplicar, criar a partir do extrato)', () => {
  async function abrirNovo(prefill: NonNullable<Props['prefill']>) {
    const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string) => true);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (p: Props) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <LancamentoV2Dialog open={false} onClose={() => {}} onSave={onSave} lancamento={null}
            fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
            onCriarFornecedor={async () => null} {...p} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const r = render(tree({}));
    r.rerender(tree({ open: true, prefill }));
    await screen.findByDisplayValue(prefill.descricao ?? '');
    await assentar();
    const aba = screen.getByRole('tab', { name: /Pagamento/ });
    fireEvent.mouseDown(aba); fireEvent.click(aba);
    await screen.findByText('Dados para pagamento');
  }
  it('sem fornecedor (a linha do extrato): só o link, sem aviso e sem bloco', async () => {
    await abrirNovo({ descricao: 'PIX ENVIADO 02/09', valor: 500, tipo_operacao: '2-Saídas', fazenda_id: 'bg', conta_bancaria_id: 'itau' });
    expect(within(screen.getByTestId('pgto-nada')).getByText('informar dados só neste lançamento')).toBeInTheDocument();
    expect(screen.queryByTestId('pgto-falta')).toBeNull();
    expect(screen.queryByTestId('pgto-bloco')).toBeNull();
  });
  it('com fornecedor e forma já preenchidos (duplicar): o bloco do cadastro sem clique; a cópia igual não vira texto próprio', async () => {
    await abrirNovo({ descricao: 'Folha de Pagamento', valor: 3192, tipo_operacao: '2-Saídas', fazenda_id: 'bg', conta_bancaria_id: 'itau',
      favorecido_id: 'agn', forma_pagamento: 'PIX', dados_pagamento: TEXTO_AGNALDO });
    expect(linhasDoBloco()[1]).toEqual(['Chave', '67999990000']);
    expect(screen.queryByTestId('pgto-proprio')).toBeNull();
  });
});

describe('(j) o bloco do cadastro é só para SAÍDAS', () => {
  const ENTRADA = { ...FOLHA, tipo_operacao: '1-Entradas', sinal: 1, conta_bancaria_id: null, conta_destino_id: 'itau',
    descricao: 'Boitel 110 G - Adiant. devolvido', plano_conta_id: 'pl-dev', subcentro: 'Venda de Machos Adultos',
    centro_custo: 'Venda de Bovinos', grupo_custo: 'Receita Pecuária', macro_custo: 'Receita Operacional' } as LancamentoV2;
  it('entrada de fornecedor SEM Pix: sem aviso, só o link (o caso do Boitel Sta. Clara)', async () => {
    await abrirNoPagamento({ ...ENTRADA, favorecido_id: 'pan' });
    expect(screen.queryByTestId('pgto-falta')).toBeNull();
    expect(screen.queryByText(/não tem Pix cadastrado/)).toBeNull();
    expect(within(screen.getByTestId('pgto-nada')).getByText('informar dados só neste lançamento')).toBeInTheDocument();
  });
  it('entrada de fornecedor COM Pix: sem bloco, só o link; salvar não grava dados nem mexe na forma', async () => {
    const { onSave } = await abrirNoPagamento(ENTRADA);
    expect(screen.queryByTestId('pgto-bloco')).toBeNull();
    expect(screen.getByTestId('pgto-nada')).toBeInTheDocument();
    const form = await salvar(onSave);
    expect(form.dados_pagamento).toBeNull();
    expect(form.forma_pagamento).toBe('PIX');
  });
  it('entrada com texto gravado (mesmo igual ao cadastro): o campo próprio, sem "voltar a usar o cadastro", e o texto volta no salvar', async () => {
    const { onSave } = await abrirNoPagamento({ ...ENTRADA, dados_pagamento: TEXTO_AGNALDO });
    const proprio = screen.getByTestId('pgto-proprio');
    expect((within(proprio).getByRole('textbox') as HTMLTextAreaElement).value).toBe(TEXTO_AGNALDO);
    expect(screen.queryByText('voltar a usar o cadastro')).toBeNull();
    expect(screen.queryByTestId('pgto-bloco')).toBeNull();
    expect((await salvar(onSave)).dados_pagamento).toBe(TEXTO_AGNALDO);
  });
  it('transferência: sem bloco e sem aviso', async () => {
    await abrirNoPagamento({ ...FOLHA, tipo_operacao: '3-Transferências', conta_destino_id: 'itau2', descricao: 'Transferência entre contas' } as LancamentoV2);
    expect(screen.queryByTestId('pgto-bloco')).toBeNull();
    expect(screen.queryByTestId('pgto-falta')).toBeNull();
    expect(screen.getByTestId('pgto-nada')).toBeInTheDocument();
  });
  it('saída: inalterado — o bloco do cadastro (a busca sabe achar)', async () => {
    await abrirNoPagamento(FOLHA);
    expect(screen.getByTestId('pgto-bloco')).toBeInTheDocument();
  });
});
