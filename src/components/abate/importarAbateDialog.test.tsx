/**
 * IMPORTAR-ABATE-01 — a tela de importar com os PDFs REAIS do SM-LT06 (linhas dos fixtures) e o banco de mentira:
 * NADA GRAVA SEM A PRÉVIA NA TELA; o centavo do acerto e a NF de produtor de pauta aparecem (nunca ajustados); "Criar" só depois da prévia.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ACERTO_SM_LT06_REAL, NF_SM_LT06_REAL, ROMANEIO_SM_LT06_REAL } from '@/lib/oc/leitura/__fixtures__/linhasSmLt06Real';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/lib/oc/leitura/linhasDoPdf', () => ({
  extrairLinhasPdf: async (f: File) => {
    const l = f.name.startsWith('NF') ? NF_SM_LT06_REAL : f.name.startsWith('ACERTO') ? ACERTO_SM_LT06_REAL : ROMANEIO_SM_LT06_REAL;
    return { linhas: [...l], paginas: 1, temTexto: true };
  },
}));
const rpc = vi.hoisted(() => vi.fn());
/* a consulta da "OC parecida" (zoo_operacoes_comerciais): a cadeia do supabase, respondendo `parecidas` */
const banco = vi.hoisted(() => ({ parecidas: [] as unknown[], lotes: [] as unknown[], partes: [] as unknown[], nfs: [] as unknown[] }));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'in', 'not']) c[m] = () => c;
    const dados = () => (tabela === 'zoo_operacao_lotes' ? banco.lotes : tabela === 'zoo_operacao_partes' ? banco.partes
      : tabela === 'zoo_operacao_documentos' ? banco.nfs : banco.parecidas);
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: dados(), error: null }).then(ok);
    return c;
  };
  return { supabase: { rpc, from: cadeia } };
});
vi.mock('@/components/financeiro-v2/NovoDeXmlDialog', () => ({
  fazendasComIEDoCliente: async () => [{ id: 'faz-sm', nome: 'Faz. Teste', ie: '000000000000' }],
}));
vi.mock('@/hooks/useOperacaoDocumentos', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useOperacaoDocumentos')>()),
  useOperacaoDocumentos: () => ({ documentos: [], loading: true, anexarArquivo: vi.fn() }),
}));

import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { ImportarAbateDialog } from './ImportarAbateDialog';

const PREVIA = { ok: true, ja_existe: false, simulado: true, resumo: {
  data: '2026-11-10', recebimento: { valor: 119531.53, vencimento: '2026-11-12' }, documentos: ['acerto:', 'nf_principal:45854', 'romaneio:'], diferenca_acerto: 0.01,
  lotes: [{ ordem: 1, cab: 10, peso_carcaca_kg: 2748, preco_arroba: 380, valor_liquido: 69476.77, senar: 139.23, funrural: 0 }],
} };
const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });

beforeEach(() => {
  banco.parecidas = []; banco.lotes = []; banco.partes = []; banco.nfs = [];
  rpc.mockReset();
  rpc.mockResolvedValue({ data: PREVIA, error: null });
  definirFornecedoresDoLeitor([{ id: 'minerva-jb', nome: 'Minerva S.A.', cpf_cnpj: '67.620.377/0003-86' }]);
});

/* o peso GERAL pelo rótulo da dúvida (depois dele vêm os campos de peso por lote, 117539) */
function campoDoPesoGeral() {
  const rotulo = document.getElementById('importar-duvida-peso');
  if (!rotulo) throw new Error('sem a dúvida do peso');
  return within(rotulo).getByRole('textbox');
}

async function abrirComOsPdfs(fazendaInicialId: string | null = 'faz-sm') {
  render(<ImportarAbateDialog open onOpenChange={() => {}} clienteId="cli" fazendas={[{ id: 'faz-sm', nome: 'Faz. Exemplo', codigo: 'SM' }]}
    fazendaInicialId={fazendaInicialId} onAbrirOperacao={() => {}} />);
  const input = screen.getByTestId('importar-area').querySelector('input[type="file"]');
  if (!input) throw new Error('sem input de arquivo');
  fireEvent.change(input, { target: { files: [pdf('ROMANEIO.pdf'), pdf('ACERTO.pdf'), pdf('NF.pdf')] } });
  await waitFor(() => expect(screen.getByTestId('importar-documentos').textContent).toContain('Romaneio'));
}

describe('importar abate — a tela', () => {
  it('os 3 PDFs lidos, as diferenças à mostra (o centavo e a pauta), e nada vai ao banco com dúvida em aberto', async () => {
    await abrirComOsPdfs();
    const docs = screen.getByTestId('importar-documentos').textContent ?? '';
    expect(docs).toContain('NF do frigorífico');
    expect(docs).toContain('Acerto do abate');
    const dif = screen.getByTestId('importar-diferencas').textContent ?? '';
    expect(dif).toContain('119.771,06');
    expect(dif).toContain('119.771,07');
    expect(dif).toContain('valor de pauta');
    expect(dif).toContain('diferença do acerto');
    expect(screen.getByTestId('importar-motivo').textContent).toContain('Responda as dúvidas');
    expect(screen.getByTestId('importar-criar').hasAttribute('disabled')).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    /* ajuste 5: cada dúvida do rodapé leva ao campo dela */
    fireEvent.click(screen.getByTestId('importar-ir-categoria'));
    expect(document.activeElement?.closest('#importar-duvida-categoria')).not.toBeNull();
  });

  it('respondidas as dúvidas: "Criar" só acende DEPOIS da prévia (p_simular = true primeiro)', async () => {
    await abrirComOsPdfs();
    /* o comprador veio sozinho pelo CNPJ lido; falta categoria e peso vivo */
    await waitFor(() => expect(screen.getByTestId('importar-duvidas').textContent).toContain('Minerva S.A.'));
    const gatilho = within(screen.getByTestId('importar-duvidas')).getAllByRole('button').find(b => b.textContent === 'Escolha a categoria');
    if (!gatilho) throw new Error('sem o seletor de categoria');
    fireEvent.click(gatilho);
    fireEvent.click(await screen.findByText('Bois'));
    const peso = campoDoPesoGeral();
    if (!peso) throw new Error('sem campo de peso');
    fireEvent.change(peso, { target: { value: '520' } });
    fireEvent.blur(peso);
    await waitFor(() => expect(screen.getByTestId('importar-motivo').textContent).toBe('Veja a prévia antes de criar'));
    expect(screen.getByTestId('importar-criar').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByText('Ver prévia'));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_simular: true });
    expect(rpc.mock.calls[0][1].p_pacote.diferenca_acerto.valor).toBe(0.01);
    await waitFor(() => expect(screen.getByTestId('importar-criar').hasAttribute('disabled')).toBe(false));
    expect(screen.getByTestId('importar-previa').textContent).toContain('119.531,53');
    /* ajuste 1: o TOTAL (o líquido + a diferença = o a receber) e "O que será criado"; ajuste 2: os documentos pelo nome */
    expect(screen.getByTestId('importar-total').textContent).toContain('69.476,78');
    const cria = screen.getByTestId('importar-o-que-cria').textContent ?? '';
    expect(cria).toContain('Baixa no rebanho: 10 cab · Bois');
    expect(cria).toContain('Lançamento a receber: R$ 119.531,53 · vence 12/11/2026');
    expect(cria).toContain('Documentos anexados: Acerto · NF 45854 · Romaneio');
    expect(cria).not.toContain('nf_principal');
  });

  async function responderCategoriaEPeso() {
    await waitFor(() => expect(screen.getByTestId('importar-duvidas').textContent).toContain('Minerva S.A.'));
    const gatilho = within(screen.getByTestId('importar-duvidas')).getAllByRole('button').find(b => b.textContent === 'Escolha a categoria');
    if (!gatilho) throw new Error('sem o seletor de categoria');
    fireEvent.click(gatilho);
    fireEvent.click(await screen.findByText('Bois'));
    const peso = campoDoPesoGeral();
    fireEvent.change(peso, { target: { value: '520' } });
    fireEvent.blur(peso);
  }

  it('OUTRO abate do mesmo dia (OC com NF de outra chave, Chat 13/11 10:10): não vira anexar; o Criar segue e a outra OC fica dita', async () => {
    banco.parecidas = [{ id: 'oc-novilhas', data_operacao: '2026-11-10', status_comercial: 'fechada', valor_acordado: 125648.87, numero_documento: null }];
    banco.nfs = [{ operacao_id: 'oc-novilhas', chave_acesso: '50261152168923000231550020000092321000451807', numero: '9232' }];
    await abrirComOsPdfs();
    await responderCategoriaEPeso();
    await waitFor(() => expect(screen.getByTestId('importar-outro-abate').textContent).toContain('NF 9232'));
    expect(screen.queryByTestId('importar-oc-repetida')).toBeNull();
    expect(screen.queryByTestId('importar-anexar')).toBeNull();
    expect(screen.getByTestId('importar-criar')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('importar-motivo').textContent).toBe('Veja a prévia antes de criar'));
  });

  it('o MESMO abate já lançado à mão: não cria — ANEXA à OC existente (lado a lado; o centavo já no líquido não entra 2×)', async () => {
    banco.parecidas = [{ id: 'oc-manual', data_operacao: '2026-11-10', status_comercial: 'fechada', valor_acordado: 119531.53, numero_documento: null }];
    banco.lotes = [{ id: 'lote-manual', ordem: 1, qtd_negociada: 17, zoo_operacao_abate: [{ cenario: 'realizado', peso_carcaca_kg: 4834, preco_arroba: 380,
      valor_liquido: 119531.53, senar_valor: null, funrural_valor: 239.54 }] }];
    banco.partes = [{ valor: 119531.53, data_vencimento: '2026-11-12' }];
    rpc.mockResolvedValue({ data: { documento_id: 'd' }, error: null });
    await abrirComOsPdfs();
    await responderCategoriaEPeso();
    await waitFor(() => expect(screen.getByTestId('importar-oc-repetida').textContent).toContain('Este abate já está lançado'));
    await waitFor(() => expect(screen.getByTestId('importar-docs-x-oc').textContent).toContain('SENAR'));
    expect(screen.queryByTestId('importar-criar')).toBeNull();
    expect(screen.getByTestId('importar-o-que-anexa').textContent).toContain('NÃO é registrada');
    await waitFor(() => expect(screen.getByTestId('importar-anexar').hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByTestId('importar-anexar'));
    await waitFor(() => expect(rpc.mock.calls.filter(c => c[0] === 'oc_documento_registrar').length).toBe(3));
    const chamadas = rpc.mock.calls.filter(c => c[0] === 'oc_documento_registrar');
    expect(chamadas.every(c => c[1].p_operacao_id === 'oc-manual' && JSON.stringify(c[1].p_payload.lotes) === '["lote-manual"]')).toBe(true);
    expect(JSON.stringify(chamadas.map(c => c[1].p_payload))).not.toContain('diferenca_acerto');
    expect(rpc.mock.calls.some(c => c[0] === 'oc_importar_abate')).toBe(false);
  });

  it('a fazenda escolhida PELA TELA (pela NF) pede o toque do operador antes do Criar', async () => {
    await abrirComOsPdfs(null);
    await waitFor(() => expect(screen.getByTestId('importar-fazenda-sugerida').textContent).toContain('Sugerida'));
    await responderCategoriaEPeso();
    await waitFor(() => expect(screen.getByTestId('importar-motivo').textContent).toBe('Confirme a fazenda (sugerida pela NF)'));
    fireEvent.click(screen.getByTestId('importar-confirmar-fazenda'));
    await waitFor(() => expect(screen.getByTestId('importar-motivo').textContent).toBe('Veja a prévia antes de criar'));
  });
});
