/**
 * UI-MODAL-BLOCOS-01 · LANCAMENTO COMPACTO (Gabriel 18/10/2026 15:45, print do "Editar Lançamento" do Agnaldo, Milho Grão 102.000):
 * "agora tem que rolar para acessar a Safra; ficou muito grande, compactar".
 *
 * ⚠ O jsdom NÃO MEDE: a Safra visível a 800 (e a 579) está medida na bancada (relatório). Aqui fica o CONTRATO que faz caber —
 *   três blocos no Geral, rótulos em bloco de 13px (eles herdavam a caixa de linha de 24px do `body`), a régua de texto do corpo,
 *   a Atividade numa linha ao lado do Subcentro — e o resumo sem caixa alta, no formato "pares".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LancamentoV2, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

vi.mock('@/integrations/supabase/client', () => {
  const vazio = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return { supabase: { from: () => vazio(), rpc: () => Promise.resolve({ data: null, error: null }),
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) }, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'agn', nome: 'Agnaldo' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { esquecerAtividade } from '@/lib/financeiro/ultimaAtividade';
import { REGUA_ROTULO } from '@/components/ui/bloco-formulario';

const FAZENDAS = [{ id: 'pur', nome: 'Faz. Pureza' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{ id: 'sic', nome_conta: 'Sicredi Lavoura', banco: 'Sicredi', fazenda_id: 'pur', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Sicredi Lavoura', agencia: null, numero_conta: null, conta_digito: null }];
const FORNECEDORES = [{ id: 'cmp', nome: 'Comprador Exemplo', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-milho', subcentro: 'Venda de Milho', centro_custo: 'Vendas Lavoura', grupo_custo: 'Receita Lavoura', macro_custo: 'Receita Operacional',
    tipo_operacao: '1-Entradas', escopo_negocio: 'agricultura' },
];
const SAFRAS: Safra[] = [{ id: 's-mil', nome: 'Safra 25/26 Milho', codigo: '25/26-Lav', escopo_negocio: 'agricultura', ativa: true }] as Safra[];
const MILHO: LancamentoV2 = {
  id: '7c1a2b3c-0000-4000-8000-000000000001', cliente_id: 'agn', fazenda_id: 'pur', conta_bancaria_id: null, conta_destino_id: 'sic',
  data_competencia: '2026-05-10', data_vencimento: '2026-05-20', data_pagamento: '2026-05-20', ano_mes: '2026-05', valor: 102000, sinal: 1,
  tipo_operacao: '1-Entradas', status_transacao: 'realizado', descricao: 'Milho Grão', macro_custo: 'Receita Operacional',
  grupo_custo: 'Receita Lavoura', centro_custo: 'Vendas Lavoura', subcentro: 'Venda de Milho', escopo_negocio: 'agricultura', observacao: null,
  numero_documento: null, tipo_documento: null, favorecido_id: 'cmp', forma_pagamento: 'PIX', dados_pagamento: null, origem_lancamento: 'manual',
  recorrencia_id: null, plano_conta_id: 'pl-milho', safra_id: 's-mil', cultura: 'milho', fase: null, cancelado: false, editado_manual: false,
} as LancamentoV2;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  esquecerAtividade();
});

async function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) => (
    <QueryClientProvider client={qc}><MemoryRouter>
      <LancamentoV2Dialog open={false} onClose={() => {}} onSave={async () => true} lancamento={null}
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
        onCriarFornecedor={async () => null} {...p} />
    </MemoryRouter></QueryClientProvider>
  );
  const r = render(tree({}));
  r.rerender(tree({ open: true, lancamento: MILHO }));
  await screen.findByDisplayValue('Milho Grão');
  await new Promise((ok) => setTimeout(ok, 30));
}
const fonte = (arq: string) => readFileSync(resolve(__dirname, arq), 'utf8');

describe('o Geral: três blocos, "Valores e datas" com duas linhas de grade', () => {
  it('Valores e datas · Identificação · Classificação, nesta ordem; os oito campos de datas/valor/contas num bloco só', async () => {
    await abrir();
    const geral = screen.getByRole('tabpanel');
    const titulos = [...geral.querySelectorAll('section h3')].map(h => h.textContent);
    expect(titulos).toEqual(['Valores e datas', 'Identificação', 'Classificação']);
    const bloco = screen.getByTestId('bloco-valores-datas');
    const grades = [...bloco.children].filter(e => e.className.includes('grid'));
    expect(grades).toHaveLength(2);
    const rotulosDa = (g: Element) => [...g.querySelectorAll('label')].map(l => (l.textContent ?? '').replace(/\s*\*$/, '').trim());
    expect(rotulosDa(grades[0])).toEqual(['Tipo operação', 'Data competência', 'Data vencimento', 'Data pagamento', 'Status']);
    expect(rotulosDa(grades[1])).toEqual(['Valor (R$)', 'Fazenda', 'Conta destino']);
    /* a Safra mora no último bloco, na linha logo abaixo do Subcentro */
    expect(within(screen.getByTestId('bloco-classificacao')).getByText('Safra')).toBeInTheDocument();
  });
  it('a régua: corpo a 11px/13px, rótulos do modal em bloco de 13px, data a 11px — o vão de 8px em cima de cada rótulo saiu', () => {
    const m = fonte('./LancamentoV2Dialog.tsx');
    expect(m).toMatch(/className="min-w-0 flex-1 overflow-y-auto px-4 py-2 space-y-1\.5 bg-muted text-\[11px\] leading-\[13px\]" data-testid="corpo-do-lancamento"/);
    expect(m).not.toContain('<Label className="text-[10px] text-muted-foreground">');
    expect(m).toContain('const dateFieldCls = cn(fieldBg, "h-7 text-[11px]");');
    for (const v of ['geral', 'pagamento', 'documentos']) expect(m).toContain(`<TabsContent value="${v}" className="mt-0 space-y-1.5 focus-visible:outline-none">`);
    expect(REGUA_ROTULO).toMatch(/\bblock\b/);
    expect(REGUA_ROTULO).toMatch(/leading-\[13px\]/);
  });
});

describe('a Atividade numa linha, ao lado do Subcentro', () => {
  it('o segmentado de 28px a 11px com as quatro atividades, vizinho do Subcentro na mesma grade; a escolhida em navy', async () => {
    await abrir();
    const atv = screen.getByTestId('atividade-em-linha');
    const seg = atv.querySelector('div.inline-flex') as HTMLElement;
    expect(seg.style.height).toBe('28px');
    const botoes = [...seg.querySelectorAll('button')];
    expect(botoes.map(b => b.textContent)).toEqual(['Pecuária', 'Lavoura', 'Silvicultura', 'Administrativo']);
    for (const b of botoes) expect(b.style.fontSize).toBe('11px');
    expect(botoes[1].className).toContain('bg-primary');
    const grade = atv.parentElement as HTMLElement;
    expect(grade.className).toContain('grid-cols-[max-content_minmax(0,1fr)]');
    expect(within(grade).getByText('Subcentro *')).toBeInTheDocument();
    /* a grade 2×2 de pílulas de 50px saiu deste modal */
    expect(screen.getByTestId('bloco-classificacao').querySelector('.grid-cols-2')).toBeNull();
  });
});

describe('o resumo lateral: sentence case, faixa de 18px, pares rótulo-valor', () => {
  it('nenhuma caixa alta; títulos 11px/600; o corpo é uma grade de duas colunas (rótulo na largura do maior)', async () => {
    await abrir();
    const aside = screen.getByTestId('resumo-pagamento').closest('aside') as HTMLElement;
    /* a busca sabe achar: há classes no resumo */
    expect(aside.querySelectorAll('[class]').length).toBeGreaterThan(10);
    expect(aside.querySelectorAll('[class*="uppercase"], [class*="tracking-"]')).toHaveLength(0);
    const faixa = aside.firstElementChild as HTMLElement;
    expect(faixa.textContent).toBe('Resumo do lançamento');
    expect(faixa.className).toContain('h-[18px]');
    expect(faixa.className).toContain('text-[11px] font-semibold');
    const secoes = [...aside.querySelectorAll('[data-secao-resumo]')].map(e => e.textContent);
    expect(secoes).toEqual(['Identificação', 'Financeiro', 'Classificação', 'Pagamento', 'Documento']);
    const corpo = faixa.nextElementSibling as HTMLElement;
    expect(corpo.className).toContain('grid-cols-[max-content_minmax(0,1fr)]');
    const linha = aside.querySelector('[data-linha-resumo]') as HTMLElement;
    expect(linha.className).toBe('contents');
    expect(linha.children[0].className).toContain('leading-4');
    expect(within(aside).getByText('Data competência')).toBeInTheDocument();
  });
});
