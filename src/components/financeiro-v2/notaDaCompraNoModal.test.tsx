/**
 * PARC-LIVRES-01 passo 3 — a parcela de uma compra parcelada mostra a NOTA DA COMPRA no resumo lateral e no topo da aba
 * Documentos, lida do DOCUMENTO ligado a ela pelo dono `docDaLinha` (o mesmo da coluna Doc. da lista).
 *
 * ⚠ O DEFEITO (NJ, 06/10): a parcela não tem `numero_documento` próprio (o cadastro do parcelamento não o grava); a nota
 *   está no documento ligado. O resumo e o "Tipo / Nº Documento" liam só a coluna do lançamento e ficavam vazios.
 * ⚠ SÓ LEITURA: os dois campos continuam sendo as colunas do lançamento — nada é escrito neles (o Nº fica vazio).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
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
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'vera', nome: 'Vera' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
const docs = vi.hoisted(() => ({ lista: [] as Array<{ id: string; especie: string; numero: string | null; cancelado: boolean }> }));
vi.mock('@/hooks/useLancamentoDocumentos', async (orig) => {
  const real = await orig<typeof import('@/hooks/useLancamentoDocumentos')>();
  return {
    ...real,
    useLancamentoDocumentos: () => ({
      documentos: docs.lista, confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
      registrar: async () => null, editar: async () => true, cancelar: async () => true, recarregar: async () => {},
      anexar: async () => true, removerArquivo: async () => true, abrirArquivo: async () => null,
    }),
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { esquecerAtividade } from '@/lib/financeiro/ultimaAtividade';

const FAZENDAS = [{ id: 'bg', nome: 'Faz Baia Grande' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{
  id: 'itau', nome_conta: 'Itaú Personalite', banco: 'Itaú', fazenda_id: 'bg', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Itaú Personalite', agencia: null, numero_conta: null, conta_digito: null,
}];
const FORNECEDORES = [{ id: 'agn', nome: 'Agnaldo da Cruz Cunegundes', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-sal', subcentro: 'Salários e Encargos Pecuária', centro_custo: 'Mão de Obra', grupo_custo: 'Custo Fixo Pecuária',
    macro_custo: 'Custeio Produção', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
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

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  esquecerAtividade();
  docs.lista = [];
});

async function abrir(lanc: LancamentoV2) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open={false} onClose={() => {}} onSave={async () => true} lancamento={null}
          fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
          onCriarFornecedor={async () => null} {...p} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree({}));
  r.rerender(tree({ open: true, lancamento: lanc }));
  await screen.findByDisplayValue('Folha de Pagamento');
  await new Promise((ok) => setTimeout(ok, 30));
}
/** As linhas (rótulo, valor) do bloco "Documento" do resumo lateral. */
const linhasDocumento = () => {
  const titulo = [...document.querySelectorAll('aside *')].find(e => e.children.length === 0 && e.textContent === 'Documento');
  if (!titulo) throw new Error('sem a seção Documento no resumo');
  let no: Element | null = titulo; while (no && !no.nextElementSibling) no = no.parentElement;
  const bloco = no?.nextElementSibling; if (!bloco) throw new Error('sem o bloco da seção Documento');
  return [...bloco.children].map(l => l.textContent ?? '');
};
const abaDocumentos = () => fireEvent.mouseDown(screen.getByRole('tab', { name: /Documentos/ }), { button: 0 });
const NF = { id: 'd1', especie: 'nf', numero: '518', cancelado: false };

describe('a nota da compra no resumo e no topo da aba Documentos', () => {
  it('parcela SEM número próprio e com a NF ligada: resumo "Nota Fiscal · da compra" + "NF 000.000.518"; o campo Nº segue vazio', async () => {
    docs.lista = [NF];
    await abrir(FOLHA);
    expect(linhasDocumento()).toEqual(['TipoNota Fiscal · da compra', 'NúmeroNF 000.000.518']);
    abaDocumentos();
    const marca = await screen.findByTestId('doc-da-compra');
    expect(marca.textContent).toBe('nota da compra: NF 000.000.518');
    expect(marca.title).toContain('NF 000.000.518');
    expect((screen.getByPlaceholderText('Número') as HTMLInputElement).value).toBe('');
  });
  it('sem documento nenhum: resumo "—" e nenhuma marca (a busca sabe achar: o caso de cima acha)', async () => {
    await abrir(FOLHA);
    expect(linhasDocumento()).toEqual(['Tipo—', 'Número—']);
    abaDocumentos();
    await screen.findByTestId('bloco-documentos-topo');
    expect(screen.queryByTestId('doc-da-compra')).toBeNull();
  });
  it('o número PRÓPRIO do lançamento vence a nota ligada, e a marca não aparece', async () => {
    docs.lista = [NF];
    await abrir({ ...FOLHA, tipo_documento: 'Nota Fiscal', numero_documento: '77' });
    expect(linhasDocumento()).toEqual(['TipoNota Fiscal', 'Número000.000.077']);
    abaDocumentos();
    await screen.findByTestId('bloco-documentos-topo');
    expect(screen.queryByTestId('doc-da-compra')).toBeNull();
  });
  it('nota CANCELADA não conta; documento que não é nota entra como "documento ligado"', async () => {
    docs.lista = [{ ...NF, cancelado: true }];
    await abrir(FOLHA);
    expect(linhasDocumento()).toEqual(['Tipo—', 'Número—']);
  });
  it('só um recibo ligado: "Documento ligado" + "Rec. 12"', async () => {
    docs.lista = [{ id: 'd2', especie: 'recibo', numero: '12', cancelado: false }];
    await abrir(FOLHA);
    expect(linhasDocumento()).toEqual(['TipoDocumento ligado', 'NúmeroRec. 12']);
    abaDocumentos();
    expect((await screen.findByTestId('doc-da-compra')).textContent).toBe('documento ligado: Rec. 12');
  });
});
