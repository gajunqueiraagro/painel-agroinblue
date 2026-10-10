import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * FORN-SELETOR-PADRAO-01 fatia 2c (commit 1b) — Financiamentos usam o seletor DONO de fornecedor, pelo leitor único.
 *
 * Aqui: a DESTINAÇÃO (montada de verdade) e a FONTE dos três pontos. O credor do contrato, montado, está em
 * `obrigacaoEdicao.test.tsx` (inativo gravado, id gravado = escolhido, o "+" e a falha do criar).
 */
vi.mock('@/integrations/supabase/client', () => {
  const p: unknown = new Proxy(() => undefined, {
    get: (_a, nome) => (nome === 'then'
      ? (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
      : () => p),
  });
  return { supabase: { from: () => p } };
});
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { DestinacoesForm, type DestinacaoItem } from './DestinacoesForm';
import { definirFornecedoresDoLeitor, pedidosAoLeitor } from '@/test/leitorDeFornecedoresFake';

const ITEM = (o: Partial<DestinacaoItem> = {}): DestinacaoItem => ({
  id: 'd-1', descricao: 'Construção', tipo: 'pagamento_fornecedor', valor: 1000, fornecedor_id: '', conta_bancaria_id: '',
  plano_conta_id: '', gerar_lancamento: true, observacao: '', ...o,
});
/** 1.200 ativos: mais do que a página de 1.000 em que a consulta própria da destinação cortava. */
const MUITOS = Array.from({ length: 1200 }, (_, i) => ({
  id: `f-${i + 1}`, nome: `Fornecedor ${String(i + 1).padStart(4, '0')}`, ativo: true, cpf_cnpj: i === 1149 ? '12345678000199' : null,
}));
const montar = (itens: DestinacaoItem[], onChange: (i: DestinacaoItem[]) => void) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DestinacoesForm clienteId="cli" valorContrato={1000} destinacoes={itens} onChange={onChange} />
  </QueryClientProvider>,
);
const campoFornecedor = () => {
  const c = screen.getAllByRole('combobox').find((b) => /Selecionar fornecedor|Fornecedor \d{4}|Velho/.test(b.textContent ?? ''));
  if (!c) throw new Error('campo do fornecedor não encontrado');
  return c;
};
const opcoes = () => screen.getAllByTestId('favorecido-opcao');
const digitar = (q: string) => fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { target: { value: q } });

beforeEach(() => {
  cleanup();
  definirFornecedoresDoLeitor(MUITOS);
  pedidosAoLeitor.length = 0;
  Element.prototype.scrollIntoView = () => {};
});

describe('fatia 2c — o fornecedor da destinação', () => {
  it('cliente com MAIS DE 1.000 ativos: a lista desenha 100, o rodapé diz o total, e a busca acha o 1.150º — pelo nome e pelo CNPJ', () => {
    montar([ITEM()], () => {});
    expect(pedidosAoLeitor).toContain('cli');
    fireEvent.click(campoFornecedor());
    expect(opcoes()).toHaveLength(100);
    expect(screen.getByTestId('favorecido-rodape').textContent).toBe('Mostrando 100 de 1.200 — digite para refinar');
    digitar('fornecedor 1150');
    expect(opcoes().map((o) => o.textContent)).toEqual(['Fornecedor 115012.345.678/0001-99']);
    digitar('12.345.678/0001-99');
    expect(opcoes()).toHaveLength(1);
    expect(opcoes()[0].textContent).toContain('Fornecedor 1150');
    digitar('fornecedor 1200');
    expect(opcoes().map((o) => o.textContent)).toEqual(['Fornecedor 1200']);
  });

  it('o id gravado na destinação é o do fornecedor ESCOLHIDO, e só o campo dele muda', () => {
    const mudancas: DestinacaoItem[][] = [];
    montar([ITEM(), ITEM({ id: 'd-2', descricao: 'Outra', tipo: 'conta_propria' })], (i) => mudancas.push(i));
    fireEvent.click(campoFornecedor());
    digitar('fornecedor 1150');
    fireEvent.click(opcoes()[0]);
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0][0]).toEqual({ ...ITEM(), fornecedor_id: 'f-1150' });
    expect(mudancas[0][1]).toEqual(ITEM({ id: 'd-2', descricao: 'Outra', tipo: 'conta_propria' }));
  });

  it('o gravado aparece com o nome — também o INATIVO, com a marca; uma linha, o documento no title, sem "+"', () => {
    definirFornecedoresDoLeitor([...MUITOS, { id: 'f-velho', nome: 'Velho Fornecedor Ltda', ativo: false, cpf_cnpj: '55444333000122' }]);
    montar([ITEM({ fornecedor_id: 'f-velho' })], () => {});
    const campo = campoFornecedor();
    expect(campo.textContent).toBe('Velho Fornecedor Ltdainativo');
    expect(campo.getAttribute('title')).toBe('Velho Fornecedor Ltda · 55.444.333/0001-22 · inativo');
    expect(campo.className).toContain('h-7');
    /* campo denso: sem a linha fixa do documento e sem o "+" (não havia cadastro neste ponto) */
    expect(screen.queryByTestId('favorecido-documento')).toBeNull();
    expect(screen.queryByTitle('Novo Fornecedor')).toBeNull();
  });

  it('só a destinação de pagamento a fornecedor tem o campo', () => {
    montar([ITEM({ tipo: 'conta_propria' })], () => {});
    expect(screen.getAllByRole('combobox').some((b) => /Selecionar fornecedor/.test(b.textContent ?? ''))).toBe(false);
  });
});

/* ── A FONTE ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const ler = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
/** cada uso do dono: do `<FavorecidoSelect` até o `/>` que o fecha */
const usosDoDono = (fonte: string): string[] => fonte.match(/<FavorecidoSelect\b[\s\S]*?\n\s*\/>/g) ?? [];
/** consulta direta ao cadastro de fornecedores (as três aspas, com quebra de linha) */
const consultas = (fonte: string): number => (fonte.match(/\.from\(\s*['"`]financeiro_fornecedores['"`]\s*\)/g) ?? []).length;

describe('fatia 2c — a fonte dos três pontos', () => {
  it('AUTO-TESTE: os detectores sabem achar', () => {
    expect(consultas("supabase.from('financeiro_fornecedores').select('id')")).toBe(1);
    expect(consultas('supabase\n  .from(\n    "financeiro_fornecedores"\n  )')).toBe(1);
    expect(consultas('(supabase as any).from(`financeiro_fornecedores`)')).toBe(1);
    expect(consultas("supabase.from('financeiro_fornecedores_x')")).toBe(0);
    const uso = '<FavorecidoSelect\n  value={a}\n  fornecedores={lista}\n/>';
    expect(usosDoDono(uso)).toHaveLength(1);
    expect(/\bfornecedores=\{/.test(usosDoDono(uso)[0])).toBe(true);
  });

  it('credor do contrato e fornecedor da destinação: o DONO, com o cliente e SEM lista do hospedeiro; o hook lê do leitor único', () => {
    for (const arquivo of ['src/components/financiamentos/ObrigacaoDialog.tsx', 'src/components/financiamentos/DestinacoesForm.tsx']) {
      const usos = usosDoDono(ler(arquivo));
      expect(usos, arquivo).toHaveLength(1);
      expect(/\bclienteId=\{clienteId\}/.test(usos[0]), arquivo).toBe(true);
      expect(/\bfornecedores=\{/.test(usos[0]), arquivo).toBe(false);
    }
    const hook = semComentario(ler('src/hooks/useFinanciamentoCadastro.ts'));
    expect(hook).toContain('const { fornecedores } = useFornecedoresDoCliente(clienteId);');
    expect(hook).toMatch(/\n\s+fornecedores, contas,/);
    /* o credor: o gesto grava o id que o seletor entrega, e o "+" tem um cadastro de verdade atrás */
    const dialogo = semComentario(ler('src/components/financiamentos/ObrigacaoDialog.tsx'));
    expect(dialogo).toContain("onChange={(id) => set('credor_id', id)}");
    expect(dialogo).toContain('onCriarNovo={() => setNovoCredorAberto(true)}');
    expect(dialogo).toContain('<NovoFornecedorDialog');
    expect(dialogo).toContain('useFornecedoresDoCliente(clienteId, form.credor_id || null)');
  });

  it('nenhum arquivo de Financiamentos consulta `financeiro_fornecedores` por conta própria; o seletor antigo saiu do repositório', () => {
    const pasta = resolve(process.cwd(), 'src/components/financiamentos');
    const arquivos = readdirSync(pasta).filter((n) => /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n)).map((n) => join(pasta, n));
    expect(arquivos.length).toBeGreaterThan(10);
    const outros = ['src/hooks/useFinanciamentoCadastro.ts', 'src/hooks/useFinanciamentosPainel.ts', 'src/pages/FinanciamentoDetalhe.tsx',
      'src/pages/FinanciamentosListaPage.tsx', 'src/pages/FinanciamentosPainelTab.tsx'].map((r) => resolve(process.cwd(), r));
    const comConsulta = [...arquivos, ...outros].filter((c) => consultas(readFileSync(c, 'utf8')) > 0).map((c) => c.split('/src/')[1]);
    expect(comConsulta).toEqual([]);
    expect(arquivos.some((c) => c.endsWith('CredorAutocomplete.tsx'))).toBe(false);
    /* e ninguém em `src` ainda o cita, nem as chaves de cache que morreram com ele */
    const varrer = (dir: string, achados: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const c = join(dir, e.name);
        if (e.isDirectory()) varrer(c, achados);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) achados.push(c);
      }
      return achados;
    };
    const citam = varrer(resolve(process.cwd(), 'src'))
      .filter((c) => /CredorAutocomplete|'credor-por-id'|'dest-fornecedores'|'fin-fornecedores'|'contrato-credor-documento'/.test(readFileSync(c, 'utf8')))
      .map((c) => c.split('/src/')[1]);
    expect(citam).toEqual([]);
  });
});
