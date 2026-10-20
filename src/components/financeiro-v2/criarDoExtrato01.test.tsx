/**
 * CRIAR-DO-EXTRATO-01 — o caso da Vera (Itaú Personalite, 05/09/2025, "REND PAGO APLIC AUT MAIS" +1,09): o "Criar lançamento pela
 * diferença" abria com um bloco de 5 linhas que fazia o modal rolar, e com o vencimento VAZIO.
 *
 *   M1  a faixa da referência é UMA linha (22px, `uma-linha-que-rola`, nunca "…"), dd/mm/aaaa, sem emoji, "Do extrato:" /
 *       "Da planilha:" / "Da referência:"; o ⓘ tem a observação, data e valor originais e a frase de uso.
 *   M2  vencimento obrigatório em todo Novo/Editar: vazio NÃO salva; o rótulo "Data vencimento *" e a borda acendem em vermelho
 *       e "Informe o vencimento." sai ao lado do Salvar.
 *   M3  criar do extrato: o modal abre com vencimento = data do pagamento, e salva com ele.
 *   M4  todo gerador da tela grava vencimento (a varredura nomeia o que faltar).
 * A altura do modal com a faixa de 300 caracteres é do gate (`check:ui-cortes`, cenários `criar-do-extrato-*`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

vi.mock('@/integrations/supabase/client', () => {
  const vazio = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: () => vazio(),
      rpc: () => Promise.resolve({ data: null, error: null }),
      storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente Exemplo' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { FaixaDaReferencia, textoDaFaixa, detalheDaFaixa, FRASE_DE_USO, type ReferenciaOperacionalInfo } from './FaixaDaReferencia';

const FAZENDAS = [{ id: 'f1', nome: 'Faz. Exemplo' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{
  id: 'itau', nome_conta: 'Itaú Personalite', banco: 'Itaú', fazenda_id: 'f1', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Itaú Personalite', agencia: null, numero_conta: null, conta_digito: null,
}];
const FORNECEDORES = [{ id: 'banco', nome: 'Banco Exemplo', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-rend', subcentro: 'Rendimento de Aplicação', centro_custo: 'Receitas Financeiras', grupo_custo: 'Receitas Financeiras',
    macro_custo: 'Receita Não Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'pecuaria' },
];

const EXTRATO: ReferenciaOperacionalInfo = {
  origem: 'extrato', conta_nome: 'Itaú Personalite', produto_texto: 'REND PAGO APLIC AUT MAIS', valor: 1.09,
  data_referencia: '2025-09-05', observacao: 'Movimento do extrato bancário',
};
/* O lançamento salvo SEM vencimento (o defeito: realizado, com pagamento, vencimento nulo). */
const SEM_VENCIMENTO: LancamentoV2 = {
  id: 'l-sem-venc', cliente_id: 'cli', fazenda_id: 'f1', conta_bancaria_id: null, conta_destino_id: 'itau',
  data_competencia: '2025-09-05', data_vencimento: null, data_pagamento: '2025-09-05', ano_mes: '2025-09', valor: 1.09, sinal: 1,
  tipo_operacao: '1-Entradas', status_transacao: 'realizado', descricao: 'REND PAGO APLIC AUT MAIS', macro_custo: 'Receita Não Operacional',
  grupo_custo: 'Receitas Financeiras', centro_custo: 'Receitas Financeiras', subcentro: 'Rendimento de Aplicação', escopo_negocio: 'pecuaria',
  observacao: null, numero_documento: null, tipo_documento: null, favorecido_id: 'banco', forma_pagamento: null, dados_pagamento: null,
  origem_lancamento: 'conciliacao', recorrencia_id: null, plano_conta_id: 'pl-rend', safra_id: null, cultura: null, fase: null,
  cancelado: false, editado_manual: false,
} as LancamentoV2;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

type Props = Partial<React.ComponentProps<typeof LancamentoV2Dialog>>;
function montar(p: Props) {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string) => true);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (q: Props) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open={false} onClose={() => {}} onSave={onSave} lancamento={null}
          fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={[]}
          onCriarFornecedor={async () => null} {...q} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree({}));
  r.rerender(tree({ open: true, ...p }));
  return { onSave };
}
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
const assentar = () => new Promise((r) => setTimeout(r, 30));

describe('M1 — a faixa da referência, uma linha', () => {
  it('"Do extrato: histórico · dd/mm/aaaa · R$ valor · conta", sem emoji e sem "…"', () => {
    const t = textoDaFaixa(EXTRATO);
    expect(t).toMatch(/^Do extrato: REND PAGO APLIC AUT MAIS · 05\/09\/2025 · R\$\s?1,09 · Itaú Personalite$/);
    expect(t).not.toMatch(/…|\.\.\.|📋/u);
    expect(textoDaFaixa({ ...EXTRATO, origem: 'planilha' })).toMatch(/^Da planilha: /);
    expect(textoDaFaixa({ ...EXTRATO, origem: undefined })).toMatch(/^Da referência: /);
  });
  it('o ⓘ leva a observação, a data e o valor originais e a frase de uso', () => {
    const d = detalheDaFaixa({ ...EXTRATO, origem: 'planilha', fornecedor_texto: 'Fornecedor do Excel' });
    expect(d).toContain('Observação (planilha): Movimento do extrato bancário');
    expect(d).toContain('Fornecedor (planilha): Fornecedor do Excel');
    expect(d).toContain('Data original: 05/09/2025');
    expect(d).toMatch(/Valor original: R\$\s?1,09/);
    expect(d.endsWith(FRASE_DE_USO)).toBe(true);
    expect(FRASE_DE_USO).toBe('Use como referência; fornecedor, fazenda e classificação são escolhidos por você.');
  });
  it('22px, texto que rola na própria linha (nunca truncate), mesmo com 300 caracteres', () => {
    render(<FaixaDaReferencia referencia={{ ...EXTRATO, produto_texto: 'X'.repeat(300) }} />);
    const faixa = screen.getByTestId('faixa-da-referencia');
    expect(faixa.className).toContain('h-[22px]');
    expect(faixa.className).toContain('text-[11px]');
    const texto = screen.getByTestId('faixa-da-referencia-texto');
    expect(texto.className).toContain('uma-linha-que-rola');
    expect(texto.className).not.toContain('truncate');
    expect(screen.getByTestId('faixa-da-referencia-info').getAttribute('title')).toContain(FRASE_DE_USO);
  });
  it('no modal, o bloco antigo de 5 linhas sumiu: só a faixa', async () => {
    montar({ prefill: { data_pagamento: '2025-09-05', data_competencia: '2025-09-05', data_vencimento: '2025-09-05' } as Props['prefill'],
      referenciaOperacionalInfo: EXTRATO });
    await assentar();
    expect(screen.getAllByTestId('faixa-da-referencia')).toHaveLength(1);
    expect(screen.queryByText(/Referência operacional usada/)).toBeNull();
  });
});

describe('M2 — vencimento obrigatório', () => {
  it('editar sem vencimento NÃO salva, e o campo diz por quê', async () => {
    const { onSave } = montar({ lancamento: SEM_VENCIMENTO });
    await screen.findByDisplayValue('REND PAGO APLIC AUT MAIS');
    await assentar();
    await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
    fireEvent.click(botaoSalvar());
    await assentar();
    expect(onSave).not.toHaveBeenCalled();
    const rotulo = screen.getByTestId('rotulo-vencimento');
    expect(rotulo.textContent).toBe('Data vencimento *');
    expect(rotulo.className).toContain('text-destructive');
    expect(screen.getByTestId('erro-antes-de-salvar').textContent).toBe('Informe o vencimento.');
  });
  it('com vencimento, salva (o controle do caso acima)', async () => {
    const { onSave } = montar({ lancamento: { ...SEM_VENCIMENTO, data_vencimento: '2025-09-05' } as LancamentoV2 });
    await screen.findByDisplayValue('REND PAGO APLIC AUT MAIS');
    await assentar();
    expect(screen.getByTestId('rotulo-vencimento').textContent).toBe('Data vencimento *');
    await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].data_vencimento).toBe('2025-09-05');
  });
});

describe('M3 — criar do extrato abre com vencimento = pagamento', () => {
  it('o Criar pela linha monta o prefill com data_vencimento = data do movimento', () => {
    const fonte = readFileSync(resolve(__dirname, '../conciliacao/CriarLancamentoDaLinha.tsx'), 'utf8');
    expect(fonte).toMatch(/data_pagamento: dataMov,\s*data_competencia: dataMov,[\s\S]{0,200}data_vencimento: dataMov,/);
    expect(fonte).toContain("origem: 'extrato'");
  });
  it('com esse prefill o modal salva o vencimento sem o operador tocar no campo', async () => {
    const { onSave } = montar({ lancamento: null, referenciaOperacionalInfo: EXTRATO,
      prefill: { fazenda_id: 'f1', conta_destino_id: 'itau', data_pagamento: '2025-09-05', data_competencia: '2025-09-05',
        data_vencimento: '2025-09-05', valor: 1.09, tipo_operacao: '1-Entradas', status_transacao: 'realizado',
        descricao: 'REND PAGO APLIC AUT MAIS', subcentro: 'Rendimento de Aplicação', plano_conta_id: 'pl-rend', favorecido_id: 'banco' } as Props['prefill'] });
    await assentar();
    expect(screen.getByTestId('rotulo-vencimento').textContent).toBe('Data vencimento *');
    await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].data_vencimento).toBe('2025-09-05');
  });
});

describe('M4 — todo gerador da tela grava vencimento', () => {
  /* Cada `data_pagamento: X,` de um objeto que vai ao INSERT tem o `data_vencimento` logo abaixo. */
  const GERADORES = [
    'src/components/consumo/gerarFinanceiroConsumo.ts', 'src/components/compra/gerarFinanceiroCompra.ts',
    'src/components/AbateFinanceiroPanel.tsx', 'src/components/CompraFinanceiroPanel.tsx', 'src/components/VendaFinanceiroPanel.tsx',
    'src/pages/ContaBoitelTab.tsx',
  ];
  it.each(GERADORES)('%s', (arq) => {
    const linhas = readFileSync(resolve(__dirname, '../../..', arq), 'utf8').split('\n');
    const semVencimento = linhas.flatMap((l, i) => /^\s*data_pagamento: [^,]+,/.test(l)
      && !linhas.slice(i + 1, i + 4).some((p) => /data_vencimento:/.test(p)) ? [`${arq}:${i + 1}`] : []);
    expect(semVencimento).toEqual([]);
    expect(linhas.some((l) => /data_vencimento:/.test(l))).toBe(true);
  });
  it('o importador, o boitel, a captação do financiamento e o writer comum caem no pagamento / competência', () => {
    const f = (a: string) => readFileSync(resolve(__dirname, '../../..', a), 'utf8');
    expect(f('src/hooks/useFinanceiro.ts')).toContain("data_vencimento: l.dataPagamento || l.anoMes + '-01',");
    expect(f('src/hooks/useBoitelOperacoes.ts')).toContain('data_vencimento: ins.data_vencimento ?? ins.data_pagamento ?? ins.data_competencia');
    expect(f('src/hooks/useFinanciamentoCadastro.ts').match(/data_vencimento: form\.data_contrato,/g)).toHaveLength(2);
    expect(f('src/hooks/useFinanceiroV2.ts').match(/data_vencimento: form\.data_vencimento \|\| form\.data_pagamento \|\| form\.data_competencia \|\| null,/g))
      .toHaveLength(2);
  });
});
