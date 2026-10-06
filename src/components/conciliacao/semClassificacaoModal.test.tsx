/**
 * CONC-SEM-CLASSIFICACAO-01 — o modal "Sem classificação": lê a lista do dono, grava pelo ESCRITOR DO MODAL DO LANÇAMENTO
 * (`editarLancamento`), e todo gesto tem o contrário ("desfazer" regrava o form de antes).
 * ⚠ O jsdom não mede: aqui se prova o CONTRATO do layout (um scrollport, cabeçalho preso nele, régua única, rodapé fora da
 *   rolagem); as medidas a 1.126 estão no relatório do PR.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClassificacaoItem, LancamentoV2, LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { lerListaSemClassificacao, formDoLancamento, type ListaSemClassificacao } from '@/lib/conciliacao/semClassificacao';

interface Estado {
  lista: ListaSemClassificacao | null;
  erroLista: Error | null;
  editar: Array<{ id: string; form: LancamentoV2Form; opts: unknown }>;
  recusar: string | null;
  avisos: string[];
  banco: Record<string, LancamentoV2>;
  pedidosLista: Array<[string, string, string | null, boolean]>;
  abertos: Array<string | null>;
}
const B = vi.hoisted((): Estado => ({ lista: null, erroLista: null, editar: [], recusar: null, avisos: [], banco: {}, pedidosLista: [], abertos: [] }));

const PLANOS: ClassificacaoItem[] = [
  { id: 'p9', subcentro: 'Combustível', centro_custo: 'Máquinas', grupo_custo: 'Custeio', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'p3', subcentro: 'Rendimentos', centro_custo: 'Financeiras', grupo_custo: 'Receitas', macro_custo: 'Receitas', tipo_operacao: '1-Entradas', escopo_negocio: 'administrativo' },
  { id: 'dividendo-x', subcentro: 'Dividendos Dependentes', centro_custo: 'Dividendos', grupo_custo: 'Dividendos', macro_custo: 'Dividendos', tipo_operacao: '2-Saídas', escopo_negocio: 'administrativo' },
];

vi.mock('@/hooks/useFinanceiroV2', () => ({
  inscreverEmLancamentos: () => () => {},
  notificarLancamentosMudaram: (c: string) => { B.avisos.push(c); },
  useFinanceiroV2: () => ({
    loadContas: async () => {}, loadClassificacoes: async () => {}, loadFornecedores: async () => {}, loadSafras: async () => {},
    contasBancarias: [{ id: 'conta-1' }], safras: [{ id: 's1' }], classificacoes: PLANOS,
    fornecedores: [{ id: 'f1', nome: 'Zeta Ltda', ativo: true }, { id: 'f-novo', nome: 'Posto Novo', ativo: true }],
    criarFornecedor: async () => null,
    buscarLancamentoPorId: async (id: string) => B.banco[id] ?? null,
    editarLancamento: async (id: string, form: LancamentoV2Form, opts: { onErro?: (m: string) => void }) => {
      B.editar.push({ id, form, opts });
      if (B.recusar) { opts?.onErro?.(B.recusar); return false; }
      return true;
    },
  }),
}));
vi.mock('@/hooks/useSemClassificacao', () => ({
  useListaSemClassificacao: (c: string, m: string, conta: string | null, ligado: boolean) => {
    B.pedidosLista.push([c, m, conta, ligado]);
    return { data: B.lista ?? undefined, isLoading: false, isError: !!B.erroLista, error: B.erroLista };
  },
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({
  LancamentoV2Dialog: (p: { open: boolean; lancamento?: { id: string } | null }) => {
    B.abertos.push(p.open ? p.lancamento?.id ?? null : null);
    return p.open ? <div data-testid="modal-do-lancamento" data-id={p.lancamento?.id} /> : null;
  },
}));
/* os seletores da casa têm teste próprio; aqui eles são o que entregam: um valor */
vi.mock('@/components/shared/FavorecidoSelect', () => ({
  FavorecidoSelect: (p: { value: string; onChange: (id: string) => void; disabled?: boolean }) => (
    <button type="button" data-testid="sel-fornecedor" data-valor={p.value} disabled={p.disabled} onClick={() => p.onChange('f-novo')}>{p.value || 'escolher…'}</button>
  ),
}));
vi.mock('@/components/shared/PlanoSubcentroSelect', () => ({
  PlanoSubcentroSelect: (p: { value: string; onChange: (s: string) => void; classificacoes: ClassificacaoItem[]; tipoOperacao: string; disabled?: boolean }) => (
    <button type="button" data-testid="sel-subcentro" data-valor={p.value} data-opcoes={p.classificacoes.map((c) => c.subcentro).join('|')}
            disabled={p.disabled} onClick={() => p.onChange(p.tipoOperacao.startsWith('1') ? 'Rendimentos' : 'Combustível')}>{p.value || 'Selecione'}</button>
  ),
}));

import { SemClassificacaoModal, REGUA_SEM_CLASSIFICACAO } from './SemClassificacaoModal';

const LANC: LancamentoV2 = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/semClassificacao.fixture.json'), 'utf8')).lancamento;
const linha = (x: Record<string, unknown>) => ({
  id: 'l1', data: '2026-09-02', conta_id: 'conta-1', conta_nome: 'Sicredi Pessoal', historico_banco: 'RENDIMENTOS REND PAGO APLIC AUT MAIS', descricao: 'RENDIMENTOS',
  tipo_operacao: '1-Entradas', valor: 38.27, favorecido_id: null, favorecido_nome: null, subcentro_texto: null,
  falta: { subcentro: true, fornecedor: true, centro: true }, aguarda_conta: false, sugestao: null, ...x,
});
const DADO = {
  resumo: { qtde: 3, valor_entradas: 38.27, valor_saidas: 833.5, com_sugestao: 1, sem_sugestao: 2, aguarda_conta: 1 },
  linhas: [
    linha({ id: 'l2', data: '2026-09-16', tipo_operacao: '2-Saídas', valor: 233.5, favorecido_id: 'f1', favorecido_nome: 'Zeta Ltda', historico_banco: 'COMPRA DEBITO MASTER POSTO',
      falta: { subcentro: true, fornecedor: false, centro: true },
      sugestao: { plano_conta_id: 'p9', subcentro: 'Combustível', centro_custo: 'Máquinas', origem: 'alias' } }),
    linha({ id: 'l3', data: '2026-09-08', tipo_operacao: '2-Saídas', valor: 600, favorecido_id: 'f1', favorecido_nome: 'Zeta Ltda', historico_banco: 'PAGAMENTO PIX',
      subcentro_texto: 'Dividendos Dependentes', falta: { subcentro: true, fornecedor: false, centro: false }, aguarda_conta: true }),
    linha({}),
  ],
};

beforeEach(() => {
  B.lista = lerListaSemClassificacao(DADO); B.erroLista = null; B.editar = []; B.recusar = null; B.avisos = []; B.pedidosLista = []; B.abertos = [];
  B.banco = {
    l1: { ...LANC, id: 'l1', tipo_operacao: '1-Entradas', valor: 38.27, favorecido_id: null, subcentro: null, macro_custo: null, centro_custo: null },
    l2: { ...LANC, id: 'l2', valor: 233.5, favorecido_id: 'f1', subcentro: null, macro_custo: null, centro_custo: null },
    l3: { ...LANC, id: 'l3', favorecido_id: 'f1' },
  };
});

const montar = (contaId: string | null = 'conta-1') => render(
  <SemClassificacaoModal aberto aoFechar={() => {}} clienteId="cli" clienteNome="Cliente Teste" anoMes="2026-09" contaId={contaId}
    contaNome={contaId ? 'Sicredi Pessoal' : 'Todas as contas'} />,
);
const n = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');
const linhaDe = (id: string) => [...screen.getAllByTestId('linha-sem-classificacao'), ...screen.queryAllByTestId('linha-classificada')].find((r) => r.getAttribute('data-id') === id)!;

describe('o que o modal mostra é o que o dono devolveu', () => {
  it('título, os quatro cartões e o rodapé de totais: números do resumo do banco, com sinal; a sessão começa em zero', () => {
    montar();
    expect(screen.getByRole('heading').textContent).toBe('Sem classificação · Cliente Teste · Sicredi Pessoal · set/2026');
    expect(B.pedidosLista.at(-1)).toEqual(['cli', '2026-09', 'conta-1', true]);
    expect(n(screen.getByTestId('cartao-sem-classificacao').textContent)).toBe('Sem classificação3▲ 38,27▼ 833,50');
    expect(screen.getByTestId('cartao-com-sugestao').textContent).toBe('Com sugestão1');
    expect(screen.getByTestId('cartao-sem-sugestao').textContent).toBe('Sem sugestão2');
    expect(screen.getByTestId('cartao-sessao').textContent).toBe('Classificados nesta sessão0');
    const rod = screen.getByTestId('rodape-sem-classificacao');
    expect(within(rod).getByTestId('rodape-qtde').textContent).toBe('3 sem classificação');
    expect(within(rod).getByTestId('rodape-andamento').textContent).toBe('0 classificados · 3 faltam');
    expect(within(rod).getByTestId('rodape-frase').textContent).toBe('nada é gravado sem você aceitar');
    expect(n(rod.textContent)).toContain('▲ 38,27');
    expect(n(rod.textContent)).toContain('▼ 833,50');
  });

  it('padrão: valor do maior para o menor; o cabeçalho ordena; os filtros recortam', () => {
    montar();
    const ids = () => screen.getAllByTestId('linha-sem-classificacao').map((r) => r.getAttribute('data-id'));
    expect(ids()).toEqual(['l3', 'l2', 'l1']);
    fireEvent.click(screen.getByTestId('ordenar-valor'));
    expect(ids()).toEqual(['l1', 'l2', 'l3']);
    fireEvent.click(screen.getByTestId('ordenar-data'));
    expect(ids()).toEqual(['l2', 'l3', 'l1']);
    fireEvent.click(screen.getByRole('button', { name: 'Com sugestão' }));
    expect(ids()).toEqual(['l2']);
    fireEvent.click(screen.getByRole('button', { name: 'Sem sugestão' }));
    expect(ids().sort()).toEqual(['l1', 'l3']);
  });

  it('a linha: valor com seta e cor pelo tipo, as letras do que falta, histórico inteiro no title', () => {
    montar();
    const saida = linhaDe('l2'); const entrada = linhaDe('l1');
    expect(n(within(saida).getByTestId('cel-valor').textContent)).toBe('▼ 233,50');
    expect(within(saida).getByTestId('cel-valor').querySelector('[data-sinal]')?.getAttribute('data-sinal')).toBe('saida');
    expect(n(within(entrada).getByTestId('cel-valor').textContent)).toBe('▲ 38,27');
    expect(within(entrada).getByTestId('cel-historico').getAttribute('title')).toBe('RENDIMENTOS REND PAGO APLIC AUT MAIS');
    const letras = (tr: HTMLElement) => [...tr.querySelectorAll('[data-letra]')].map((e) => `${e.getAttribute('data-letra')}:${e.getAttribute('data-falta')}`);
    expect(letras(entrada)).toEqual(['S:sim', 'F:sim', 'C:sim']);
    expect(letras(saida)).toEqual(['S:sim', 'F:nao', 'C:sim']);
    expect(letras(linhaDe('l3'))).toEqual(['S:sim', 'F:nao', 'C:nao']);
  });

  it('com sugestão: seletor preenchido, origem no title, ação "aceitar"; sem sugestão: vazio e "escolher" apagado', () => {
    montar();
    const com = linhaDe('l2'); const sem = linhaDe('l1');
    expect(within(com).getByTestId('sel-subcentro').getAttribute('data-valor')).toBe('Combustível');
    expect(within(com).getByTestId('cel-subcentro').getAttribute('title')).toBe('sugestão: apelido do subcentro');
    expect(within(com).getByTestId('acao-linha').textContent).toBe('aceitar');
    expect(within(com).getByTestId('acao-linha')).not.toBeDisabled();
    expect(within(sem).getByTestId('sel-subcentro').getAttribute('data-valor')).toBe('');
    expect(within(sem).getByTestId('acao-linha').textContent).toBe('escolher');
    expect(within(sem).getByTestId('acao-linha')).toBeDisabled();
    expect(within(sem).getByTestId('acao-linha').getAttribute('title')).toBe('escolha o subcentro');
  });

  it('Dividendos por texto sem conta no plano: a linha APARECE, seletor vazio, title "aguarda conta no plano"; o seletor só oferece conta do plano', () => {
    montar();
    const div = linhaDe('l3');
    expect(div.getAttribute('data-aguarda-conta')).toBe('sim');
    expect(within(div).getByTestId('sel-subcentro').getAttribute('data-valor')).toBe('');
    expect(within(div).getByTestId('cel-subcentro').getAttribute('title')).toContain('aguarda conta no plano (CONC-DIVIDENDOS-PLANO-01)');
    expect(within(div).getByTestId('cel-subcentro').getAttribute('title')).toContain('Dividendos Dependentes');
    expect(within(div).getByTestId('sel-subcentro').getAttribute('data-opcoes')).toBe('Combustível|Rendimentos');
  });

  it('erro de leitura fica escrito na lista; lista vazia diz que não há', () => {
    B.lista = null; B.erroLista = new Error('sem acesso a este registro');
    const { unmount } = montar();
    expect(screen.getByTestId('erro-lista').textContent).toBe('Não foi possível ler a lista: sem acesso a este registro');
    unmount();
    B.erroLista = null; B.lista = lerListaSemClassificacao({ resumo: { qtde: 0, valor_entradas: 0, valor_saidas: 0, com_sugestao: 0, sem_sugestao: 0, aguarda_conta: 0 }, linhas: [] });
    montar();
    expect(screen.getByTestId('lista-vazia').textContent).toBe('Nenhum lançamento sem classificação neste mês.');
  });
});

describe('o gesto grava pelo escritor do modal do lançamento, e tem o contrário', () => {
  it('aceitar a sugestão: UMA chamada de editarLancamento com o lançamento inteiro + a chave do plano; avisa o canal; a linha vira classificada', async () => {
    montar();
    fireEvent.click(within(linhaDe('l2')).getByTestId('acao-linha'));
    await waitFor(() => expect(screen.getByTestId('linha-classificada')).toBeInTheDocument());
    expect(B.editar).toHaveLength(1);
    expect(B.editar[0].id).toBe('l2');
    expect(B.editar[0].opts).toMatchObject({ silent: true });
    expect(B.editar[0].form).toEqual({
      ...formDoLancamento(B.banco.l2), plano_conta_id: 'p9', subcentro: 'Combustível', centro_custo: 'Máquinas', grupo_custo: 'Custeio',
      macro_custo: 'Custeio Produtivo', escopo_negocio: 'pecuaria',
    });
    expect(B.avisos).toEqual(['cli']);
    const feita = screen.getByTestId('linha-classificada');
    expect(feita.getAttribute('data-id')).toBe('l2');
    expect(n(feita.textContent)).toContain('✓ Combustível');
    expect(screen.getByTestId('cartao-sessao').textContent).toBe('Classificados nesta sessão1');
    expect(screen.getByTestId('rodape-andamento').textContent).toBe('1 classificados · 3 faltam');   // "faltam" é do dono: muda quando ele reler
  });

  it('DESFAZER regrava o form de ANTES (chave nula, texto e fornecedor de antes) e a linha volta a pendente', async () => {
    montar();
    fireEvent.click(within(linhaDe('l2')).getByTestId('sel-fornecedor'));     // troca o fornecedor também
    fireEvent.click(within(linhaDe('l2')).getByTestId('acao-linha'));
    await waitFor(() => expect(screen.getByTestId('linha-classificada')).toBeInTheDocument());
    expect(B.editar[0].form.favorecido_id).toBe('f-novo');
    fireEvent.click(screen.getByTestId('desfazer-linha'));
    await waitFor(() => expect(screen.queryByTestId('linha-classificada')).toBeNull());
    expect(B.editar).toHaveLength(2);
    expect(B.editar[1].id).toBe('l2');
    expect(B.editar[1].form).toEqual(formDoLancamento(B.banco.l2));
    expect(B.editar[1].form.plano_conta_id).toBeNull();
    expect(B.editar[1].form.favorecido_id).toBe('f1');
    expect(B.avisos).toEqual(['cli', 'cli']);
    expect(screen.getByTestId('cartao-sessao').textContent).toBe('Classificados nesta sessão0');
    expect(linhaDe('l2').getAttribute('data-testid')).toBe('linha-sem-classificacao');
  });

  it('escolher à mão numa linha sem sugestão: a ação acende e grava a conta do TIPO do lançamento', async () => {
    montar();
    const l1 = linhaDe('l1');
    fireEvent.click(within(l1).getByTestId('sel-subcentro'));
    expect(within(linhaDe('l1')).getByTestId('acao-linha').textContent).toBe('aceitar');
    fireEvent.click(within(linhaDe('l1')).getByTestId('acao-linha'));
    await waitFor(() => expect(B.editar).toHaveLength(1));
    expect([B.editar[0].id, B.editar[0].form.plano_conta_id, B.editar[0].form.subcentro, B.editar[0].form.favorecido_id]).toEqual(['l1', 'p3', 'Rendimentos', null]);
  });

  it('a recusa do escritor fica ESCRITA (na ação e no rodapé), sem toast, e nada vira classificado nem avisa o canal', async () => {
    B.recusar = 'Mês fechado: reabra para alterar.';
    montar();
    fireEvent.click(within(linhaDe('l2')).getByTestId('acao-linha'));
    await waitFor(() => expect(within(linhaDe('l2')).getByTestId('acao-linha').getAttribute('data-erro')).toBe('sim'));
    expect(within(linhaDe('l2')).getByTestId('acao-linha').getAttribute('title')).toBe('Mês fechado: reabra para alterar.');
    expect(screen.getByTestId('rodape-frase').textContent).toBe('16/09/26 · 233,50: Mês fechado: reabra para alterar.');
    expect(screen.queryByTestId('linha-classificada')).toBeNull();
    expect(B.avisos).toEqual([]);
    expect(B.editar[0].opts).toMatchObject({ silent: true });
  });

  it('"Aceitar as N sugestões": N = as pendentes com a sugestão intacta; grava só elas; sem nenhuma fica apagado com o motivo', async () => {
    montar();
    expect(screen.getByTestId('aceitar-todas').textContent).toBe('Aceitar as 1 sugestões');
    fireEvent.click(screen.getByTestId('aceitar-todas'));
    await waitFor(() => expect(screen.getByTestId('linha-classificada')).toBeInTheDocument());
    expect(B.editar.map((e) => e.id)).toEqual(['l2']);
    expect(B.avisos).toEqual(['cli']);
    await waitFor(() => expect(screen.getByTestId('aceitar-todas')).toBeDisabled());
    expect(screen.getByTestId('aceitar-todas-motivo').textContent).toBe('nenhuma sugestão para aceitar');
  });

  it('clicar na linha (fora dos seletores e da ação) abre o modal do lançamento que já existe; clicar no seletor não', async () => {
    montar();
    fireEvent.click(within(linhaDe('l2')).getByTestId('sel-fornecedor'));
    fireEvent.click(within(linhaDe('l2')).getByTestId('cel-subcentro'));
    await new Promise((r) => setTimeout(r, 30));   // abrir é assíncrono (lê o lançamento): sem esperar, o "não abriu" não provaria nada
    expect(screen.queryByTestId('modal-do-lancamento')).toBeNull();
    fireEvent.click(within(linhaDe('l2')).getByTestId('cel-historico'));
    await waitFor(() => expect(screen.getByTestId('modal-do-lancamento').getAttribute('data-id')).toBe('l2'));
    expect(B.editar).toHaveLength(0);
  });
});

describe('contrato do layout fixo (o jsdom não mede) e da fonte', () => {
  it('um scrollport só — a lista —, com o cabeçalho preso NELA; cartões e rodapé fora da rolagem; régua única', () => {
    montar();
    const modal = screen.getByTestId('modal-sem-classificacao');
    const lista = screen.getByTestId('lista-sem-classificacao');
    expect(modal.className).toContain('overflow-hidden');
    expect(modal.className).toContain('h-[calc(100vh-32px)]');
    expect(lista.className).toContain('overflow-y-auto');
    expect(modal.querySelectorAll('.overflow-y-auto, .overflow-auto')).toHaveLength(1);
    expect(lista.contains(screen.getByTestId('cartoes-sem-classificacao'))).toBe(false);
    expect(lista.contains(screen.getByTestId('rodape-sem-classificacao'))).toBe(false);
    const ths = [...lista.querySelectorAll('thead th')];
    expect(ths).toHaveLength(7);
    expect(ths.every((th) => th.className.includes('sticky') && th.className.includes('top-0') && th.className.includes('bg-primary'))).toBe(true);
    const cols = [...lista.querySelectorAll('colgroup col')].map((c) => (c as HTMLElement).style.width);
    expect(cols).toEqual([`${REGUA_SEM_CLASSIFICACAO.data}px`, '', `${REGUA_SEM_CLASSIFICACAO.valor}px`, `${REGUA_SEM_CLASSIFICACAO.falta}px`,
      `${REGUA_SEM_CLASSIFICACAO.fornecedor}px`, `${REGUA_SEM_CLASSIFICACAO.subcentro}px`, `${REGUA_SEM_CLASSIFICACAO.acao}px`]);
    expect((lista.querySelector('table') as HTMLElement).style.tableLayout).toBe('fixed');
    /* data e valor NUNCA cortam; o histórico corta com title */
    const tr = linhaDe('l2');
    expect(tr.children[0].className).toContain('whitespace-nowrap');
    expect(tr.children[0].className).not.toContain('text-ellipsis');
    expect(within(tr).getByTestId('cel-valor').querySelector('span')?.className).toContain('whitespace-nowrap');
    expect(within(tr).getByTestId('cel-historico').className).toContain('text-ellipsis');
  });

  it('a tela não conta, não soma e não grava por conta própria: sem reduce/+=, sem toast, sem UPDATE direto', () => {
    const fonte = readFileSync(resolve(process.cwd(), 'src/components/conciliacao/SemClassificacaoModal.tsx'), 'utf8');
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/\.reduce\(|\+=/);
    expect(codigo).not.toMatch(/toast\b|from 'sonner'/);
    expect(codigo).not.toMatch(/supabase|\.update\(|\.rpc\(/);
    expect(codigo).not.toMatch(/<select\b|type="date"/);
    expect(codigo).toMatch(/fin\.editarLancamento\(/);
    /* a busca sabe achar */
    expect('const t = xs.reduce((a, b) => a + b, 0); toast.error("x"); supabase.from("t").update({})').toMatch(/\.reduce\(|\+=/);
    expect('toast.error("x")').toMatch(/toast\b/);
  });
});
