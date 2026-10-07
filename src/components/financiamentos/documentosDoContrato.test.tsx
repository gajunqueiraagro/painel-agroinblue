/**
 * PARC-LIVRES-01 passo 6 — documentos no CONTRATO do parcelamento: a mesma NF ligada às N parcelas, o boleto de cada parcela,
 * e o XML que CONFERE sem sobrescrever. O XML é sintético (montado aqui): nenhum arquivo de cliente entra no repositório.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { montarNFe, EMITENTE_CNPJ } from '@/lib/financeiro/nfe/__fixtures__/notas';

const banco = vi.hoisted(() => ({
  rpcs: [] as { nome: string; args: Record<string, unknown> }[],
  gravar: [] as { parcelas: unknown; pendentes: { parcela: number | null; payload: { especie?: string; numero?: string | null }; arquivo: File | null }[] }[],
  cancelados: [] as { id: string; motivo: string }[],
  registrados: [] as unknown[],
  boletos: [] as Record<string, unknown>[],
  credor: null as Record<string, unknown> | null,
  docs: [] as Record<string, unknown>[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const consulta = (tabela: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: tabela === 'financeiro_fornecedores' ? banco.credor : null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: tabela === 'vw_lancamento_documentos' ? banco.boletos : [], error: null }).then(ok);
    return b;
  };
  return { supabase: {
    from: (t: string) => consulta(t),
    rpc: (nome: string, args: Record<string, unknown>) => { banco.rpcs.push({ nome, args }); return Promise.resolve({ data: null, error: null }); },
  } };
});
vi.mock('@/hooks/useSituacaoDoContrato', () => ({
  useSituacaoDoContrato: () => ({ data: {
    parcelas: [1, 2, 3].map((n) => ({ numero: n, dataVencimento: `2026-1${n - 1}-10`.replace('2026-10', '2026-10').replace('2026-11', '2026-11').replace('2026-12', '2026-12'),
      valorPrincipal: 100, valorJuros: 0, valorTotal: 100, situacao: n === 1 ? 'paga' : 'pendente', pagoEm: n === 1 ? '2026-10-10' : null, valorPago: n === 1 ? 100 : 0,
      lancamentoId: `lanc-${n}`, lancamentoJurosId: null, fonte: 'lancamento', diverge: false })),
    cartoes: { valorContrato: 300, pago: 100, aVencer: 200, vencido: 0, pagas: 1, parcelas: 3, jurosPrevistos: 0, somaPrincipal: 300, somaTotal: 300, divergentes: 0 },
  } }),
}));
vi.mock('@/hooks/useLancamentoDocumentos', async (orig) => {
  const real = await orig<typeof import('@/hooks/useLancamentoDocumentos')>();
  return { ...real, useLancamentoDocumentos: (lancamentoId: string | null) => ({
    documentos: banco.docs, confronto: { qualquer: 'coisa' }, loading: false, saving: false, operacaoId: null, operacaoTipo: null, lancamentoId,
    registrar: async (p: unknown) => { banco.registrados.push(p); return { id: 'doc-novo', origem: 'lancamento', operacaoId: null }; },
    editar: async () => true, anexar: async () => true, recarregar: async () => {}, urlAssinada: async () => 'https://exemplo/boleto.pdf',
    cancelar: async (id: string, motivo: string) => { banco.cancelados.push({ id, motivo }); return true; },
  }) };
});
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn(), inscreverEmLancamentos: () => () => {} }));
vi.mock('@/lib/financeiro/documentosPendentes', async (orig) => {
  const real = await orig<typeof import('@/lib/financeiro/documentosPendentes')>();
  return { ...real, gravarDocumentosDoParcelamento: async (_c: string, parcelas: unknown, pendentes: never[]) => {
    banco.gravar.push({ parcelas, pendentes });
    return (pendentes as { parcela: number | null }[]).map((p) => ({ ...p, gravado: true, erro: null }));
  } };
});
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({
  AbaDocumentosLancamento: ({ api, semBoleto }: { api: { documentos: { especie: string; numero: string }[]; confronto: unknown; registrar: (p: unknown) => Promise<unknown> }; semBoleto?: boolean }) => (
    <div data-testid="lista-da-compra" data-sem-boleto={String(!!semBoleto)} data-confronto={String(api.confronto)}>
      {api.documentos.map((d, i) => <span key={i} data-testid="doc-da-lista">{d.especie}:{d.numero}</span>)}
      <button type="button" data-testid="registrar-pela-lista" onClick={() => void api.registrar({ especie: 'nf', numero: '900' })}>registrar</button>
    </div>
  ),
}));
vi.mock('@/components/financeiro-v2/AnexarBoletosDialog', () => ({
  AnexarBoletosDialog: ({ parcelas, onConfirmar }: { parcelas: { numero: number; temBoleto: boolean }[]; onConfirmar: (i: unknown[]) => Promise<string | null> }) => (
    <div data-testid="anexar-varios-dialogo">{parcelas.map((p) => `${p.numero}:${p.temBoleto ? 'com' : 'sem'}`).join(' ')}
      <button type="button" data-testid="confirmar-varios" onClick={() => void onConfirmar([{ arquivo: pdf('b1.pdf'), parcela: 1, leitura: null }, { arquivo: pdf('b3.pdf'), parcela: 3, leitura: null }])}>ok</button>
    </div>
  ),
}));

import { DocumentosDoContrato, MOTIVO_TIRAR_BOLETO } from './DocumentosDoContrato';

const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });
/* ⚠ O dono do aceite DEVOLVE OUTRO File (o mesmo conteúdo com o tipo preenchido), então não adianta pendurar `arrayBuffer` no
   arquivo do teste: o jsdom não o implementa, e o que se lê é o arquivo devolvido. O texto vai guardado pelo NOME. */
const textoDoXml = new Map<string, string>();
{
  Object.defineProperty(Blob.prototype, 'arrayBuffer', { configurable: true, value: async function (this: File) {
    return new TextEncoder().encode(textoDoXml.get(this.name) ?? '').buffer;
  } });
}
function xml(texto: string, nome = `nota-${textoDoXml.size + 1}.xml`) {
  textoDoXml.set(nome, texto);
  return new File([texto], nome, { type: '' });
}
const usar = vi.fn();
function montar(props: Partial<React.ComponentProps<typeof DocumentosDoContrato>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>
    <DocumentosDoContrato financiamentoId="fin-1" clienteId="cli-1" hoje="2026-10-06" credorId="forn-1" valorDoContrato={300} onUsarDuplicatas={usar} {...props} />
  </MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  banco.rpcs = []; banco.gravar = []; banco.cancelados = []; banco.registrados = []; usar.mockClear();
  banco.credor = { id: 'forn-1', nome: 'Fornecedor SA', cpf_cnpj: EMITENTE_CNPJ, ativo: true };
  banco.docs = [{ id: 'd-nf', especie: 'nf', numero: '518', cancelado: false, valorDocumento: 300, origem: 'lancamento' },
    { id: 'd-b1', especie: 'boleto', numero: 'B1', cancelado: false, valorDocumento: null, origem: 'lancamento' }];
  banco.boletos = [{ documento_id: 'd-b2', lancamento_id: 'lanc-2', nome: 'boleto-2.pdf', numero: null, url: 'cli-1/lanc-2/x.pdf', origem: 'lancamento' }];
});

describe('documentos da compra', () => {
  it('a lista é a dos documentos da 1ª parcela SEM o boleto, sem o confronto de uma parcela só, e o formulário não oferece Boleto', async () => {
    montar();
    const lista = await screen.findByTestId('lista-da-compra');
    expect(screen.getAllByTestId('doc-da-lista').map((e) => e.textContent)).toEqual(['nf:518']);
    expect(lista.getAttribute('data-sem-boleto')).toBe('true');
    expect(lista.getAttribute('data-confronto')).toBe('null');
  });
  it('a NF contra a COMPRA INTEIRA: os dois números lado a lado e "confere" só com os centavos iguais', async () => {
    const { unmount } = montar();
    expect((await screen.findByTestId('nota-x-compra')).textContent).toContain('Nota R$ 300,00 · compra (soma das parcelas) R$ 300,00 · confere ✓');
    unmount();
    banco.docs = [{ id: 'd-nf', especie: 'nf', numero: '518', cancelado: false, valorDocumento: 300.01, origem: 'lancamento' }];
    montar();
    expect((await screen.findByTestId('nota-x-compra')).textContent).toContain('não confere');
  });
  it('documento registrado pela lista é LIGADO às N parcelas pela mesma RPC do nascimento (uma NF, N vínculos)', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('registrar-pela-lista'));
    await waitFor(() => expect(banco.rpcs.some((r) => r.nome === 'fin_documento_vincular')).toBe(true));
    expect(banco.registrados).toHaveLength(1);
    expect(banco.rpcs.find((r) => r.nome === 'fin_documento_vincular')?.args).toEqual({ p_documento: 'doc-novo', p_cliente: 'cli-1', p_lancamentos: ['lanc-1', 'lanc-2', 'lanc-3'] });
  });
});

describe('o boleto de cada parcela', () => {
  it('três linhas (a paga inclusive); a 2ª mostra o boleto gravado, que abre; as outras oferecem "+ Boleto"', async () => {
    montar();
    await screen.findByTestId('ver-boleto-2');
    expect(screen.getAllByTestId('linha-parcela')).toHaveLength(3);
    expect(screen.getByTestId('ver-boleto-2').textContent).toContain('boleto-2.pdf');
    expect(screen.getByTestId('mais-boleto-1')).toBeTruthy();   // parcela PAGA também recebe boleto
    expect(screen.getByTestId('mais-boleto-3')).toBeTruthy();
    expect(screen.queryByTestId('mais-boleto-2')).toBeNull();
    expect(screen.getByTestId('com-boleto').textContent).toBe('1 de 3 com boleto');
  });
  it('"+ Boleto" grava NA HORA, na parcela certa, pelo dono (`gravarDocumentosDoParcelamento`) com as 3 parcelas vivas', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('mais-boleto-3'));
    fireEvent.change(screen.getByTestId('input-boleto-linha'), { target: { files: [pdf('b3.pdf')] } });
    await waitFor(() => expect(banco.gravar).toHaveLength(1));
    expect(banco.gravar[0].parcelas).toEqual([{ numero: 1, lancamentoId: 'lanc-1' }, { numero: 2, lancamentoId: 'lanc-2' }, { numero: 3, lancamentoId: 'lanc-3' }]);
    expect(banco.gravar[0].pendentes.map((p) => [p.parcela, p.payload.especie, p.arquivo?.name])).toEqual([[3, 'boleto', 'b3.pdf']]);
  });
  it('✕ pergunta no lugar fixo e, com o Sim, cancela o documento pelo dono, com o motivo', async () => {
    montar();
    await screen.findByTestId('ver-boleto-2');
    fireEvent.click(screen.getByLabelText('Tirar boleto da parcela 2'));
    expect(screen.getByTestId('docs-contrato-recado').textContent).toContain('Tirar o boleto da parcela 2?');
    expect(banco.cancelados).toHaveLength(0);
    fireEvent.click(screen.getByTestId('tirar-boleto-sim'));
    await waitFor(() => expect(banco.cancelados).toEqual([{ id: 'd-b2', motivo: MOTIVO_TIRAR_BOLETO }]));
  });
  it('"Anexar vários boletos" recebe as parcelas com quem já tem boleto e grava cada arquivo na parcela escolhida', async () => {
    montar();
    await screen.findByTestId('ver-boleto-2');
    fireEvent.click(screen.getByTestId('abrir-anexar-varios'));
    expect(screen.getByTestId('anexar-varios-dialogo').textContent).toContain('1:sem 2:com 3:sem');
    fireEvent.click(screen.getByTestId('confirmar-varios'));
    await waitFor(() => expect(banco.gravar).toHaveLength(1));
    expect(banco.gravar[0].pendentes.map((p) => [p.parcela, p.arquivo?.name])).toEqual([[1, 'b1.pdf'], [3, 'b3.pdf']]);
  });
});

describe('importar XML — confere, não sobrescreve', () => {
  const NOTA = montarNFe({ numero: '777', vNF: '300.00', duplicatas: [['001', '2026-10-10', '100.00'], ['002', '2026-11-08', '120.00'], ['003', '2026-12-05', '80.00']] });
  it('a tabela contrato × nota: fornecedor e valor conferem, as duplicatas diferem; NADA é gravado ao importar', async () => {
    montar();
    await screen.findByTestId('ver-boleto-2');
    fireEvent.change(screen.getByTestId('contrato-xml-input'), { target: { files: [xml(NOTA)] } });
    await screen.findByTestId('conferencia-do-xml');
    expect(screen.getByTestId('conf-fornecedor').textContent).toContain('confere ✓');
    expect(screen.getByTestId('conf-valor').textContent).toContain('R$ 300,00R$ 300,00confere ✓');
    expect(screen.getByTestId('conf-parcelas').textContent).toContain('3 parcelas3 duplicatasdifere');
    expect(banco.gravar).toHaveLength(0);
    expect(banco.rpcs).toHaveLength(0);
  });
  it('"Usar as duplicatas da nota" entrega a nota a quem cuida da aba Parcelas — e também não grava', async () => {
    montar();
    await screen.findByTestId('ver-boleto-2');
    fireEvent.change(screen.getByTestId('contrato-xml-input'), { target: { files: [xml(NOTA)] } });
    fireEvent.click(await screen.findByTestId('usar-duplicatas'));
    expect(usar).toHaveBeenCalledTimes(1);
    expect(usar.mock.calls[0][0].duplicatas).toEqual([{ vencimento: '2026-10-10', valorCent: 10000 }, { vencimento: '2026-11-08', valorCent: 12000 }, { vencimento: '2026-12-05', valorCent: 8000 }]);
    expect(banco.gravar).toHaveLength(0);
  });
  it('duplicatas iguais às parcelas: o gesto fica APAGADO com o motivo (não some)', async () => {
    montar();
    await screen.findByTestId('ver-boleto-2');
    const iguais = montarNFe({ numero: '778', vNF: '300.00', duplicatas: [['001', '2026-10-10', '100.00'], ['002', '2026-11-10', '100.00'], ['003', '2026-12-10', '100.00']] });
    fireEvent.change(screen.getByTestId('contrato-xml-input'), { target: { files: [xml(iguais)] } });
    const b = await screen.findByTestId('usar-duplicatas') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('As duplicatas da nota são iguais às parcelas.');
  });
  it('"Gravar esta nota no contrato" registra UMA NF com o XML como arquivo, para as N parcelas (parcela nula = da compra)', async () => {
    montar();
    await screen.findByTestId('ver-boleto-2');
    fireEvent.change(screen.getByTestId('contrato-xml-input'), { target: { files: [xml(NOTA)] } });
    fireEvent.click(await screen.findByTestId('registrar-nota-do-xml'));
    await waitFor(() => expect(banco.gravar).toHaveLength(1));
    const [p] = banco.gravar[0].pendentes;
    expect([p.parcela, p.payload.especie, p.payload.numero, p.arquivo?.name.endsWith('.xml')]).toEqual([null, 'nf', '777', true]);
    expect((banco.gravar[0].parcelas as unknown[]).length).toBe(3);
  });
  it('arquivo que não é nota: a recusa do leitor fica escrita na área, e nenhuma tabela aparece', async () => {
    montar();
    await screen.findByTestId('ver-boleto-2');
    fireEvent.change(screen.getByTestId('contrato-xml-input'), { target: { files: [xml('<a>não é nota</a>')] } });
    await waitFor(() => expect(screen.getByTestId('contrato-xml-area').textContent).not.toContain('Importar XML da nota'));
    expect(screen.queryByTestId('conferencia-do-xml')).toBeNull();
  });
});
