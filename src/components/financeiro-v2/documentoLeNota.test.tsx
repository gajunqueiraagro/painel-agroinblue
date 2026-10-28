/**
 * P127 + P128c (Gabriel 28/10/2026: "essa inteligência é a mais importante agora") — o "Novo documento" do Editar lançamento LÊ A NOTA solta
 * no campo Arquivo, pelo MESMO leitor do "+ Da nota" (`lerNota`, de verdade aqui; a NF-e é a sintética das fixtures).
 * ⚠ O CASO DO PRINT (NF 74974, R$ 408,77): o arquivo solto e NADA lido — chave vazia, campos vindos do lançamento, sem itens, sem irmãos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
const itens = vi.hoisted(() => ({ gravar: vi.fn(async (_c: string, _b: ArrayBuffer): Promise<string | null> => null) }));
vi.mock('@/lib/financeiro/itensDaNotaBanco', async (orig) => ({ ...(await orig<typeof import('@/lib/financeiro/itensDaNotaBanco')>()), gravarItensSemTravar: itens.gravar }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
/* P164 — a gravação do lançamento pela nota (`fn_nota_completar`, falsa): a prévia diz o que muda; gravar devolve a operação */
const banco = vi.hoisted(() => ({
  completarComANota: vi.fn(async (_c: string, pedido: readonly Record<string, unknown>[], o: { juntar: boolean; chave: string | null; simular: boolean })
    : Promise<Consulta<ResultadoCompletar>> => ({ ok: true,
    valor: { ok: true, recusas: [], operacao: o.simular ? null : 'op-1', financiamentoId: null, efeitoDre: [], linhas: pedido.map((x) => ({ id: String(x.id), descricao: null,
      situacao: 'realizada', parcelaN: null, campos: {
        numero_documento: { hoje: '74974', fica: x.numero_documento, muda: true, hojeNome: null, ficaNome: null, cadeado: null },
        tipo_documento: { hoje: null, fica: x.tipo_documento, muda: true, hojeNome: null, ficaNome: null, cadeado: null },
        data_competencia: { hoje: '2026-08-24', fica: x.data_competencia, muda: true, hojeNome: null, ficaNome: null, cadeado: null },
        safra_id: { hoje: null, fica: 'safra-2627', muda: true, hojeNome: null, ficaNome: null, cadeado: null },
      } })) } })),
  desfazerCompletar: vi.fn(async (_op: string): Promise<string | null> => null),
  fornecedorPeloDocumento: vi.fn(async (_c: string, _d: string) => ({ ok: true, valor: { id: 'agro', nome: 'Agropecuaria Exemplo Ltda', ativo: true } })),
}));
vi.mock('@/lib/financeiro/nfeConsultas', async (orig) => ({ ...(await orig<object>()), ...banco }));

import { FormDocumento, type CompletarPelaNota, type SugestaoDocumento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import type { LancDocPayload, LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { EMITENTE_CNPJ, chaveDe, montarNFe, utf8, type OpcoesNota } from '@/lib/financeiro/nfe/__fixtures__/notas';
import { camposDaNota, divergenciasDaNota, FRASE_NOTA_NAO_LIDA } from '@/lib/financeiro/nfe/documentoDaNota';
import { lerNota } from '@/lib/financeiro/nfe/lerNota';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';
import type { ResultadoCompletar } from '@/lib/financeiro/nfe/notaCompletar';

/* o cadastro do emitente COM o CNPJ da nota; e o favorecido que o lançamento tem (outro) */
const FORNECEDORES = [
  { id: 'agro', nome: 'Agropecuaria Exemplo Ltda', cpf_cnpj: '11.222.333/0001-81', ativo: true },
  { id: 'outro', nome: 'Parafusos Sinteticos Ltda', cpf_cnpj: null, ativo: true },
];
/* o molde do print: o lançamento diz nº 74974 escrito sem zeros, outro valor, outra data e outro favorecido */
const SUGESTAO: SugestaoDocumento = { numero: '74974', dataEmissao: '2026-08-24', valor: 400, emitenteId: 'outro' };
const NOTA: OpcoesNota = { numero: '74974', vNF: '408.77', duplicatas: [['001', '2026-09-24', '408.77']], itens: [['PARAFUSO SINTETICO M8', '100.0000', 'UN', '408.77']] };

/* o jsdom não tem `Blob.arrayBuffer` (e o arquivo que chega ao formulário não é o mesmo objeto do teste): lido pelo FileReader */
if (!('arrayBuffer' in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', { value(this: Blob) {
    return new Promise<ArrayBuffer>((ok, erro) => { const r = new FileReader(); r.onload = () => (r.result instanceof ArrayBuffer ? ok(r.result) : erro(new Error('não leu'))); r.onerror = () => erro(r.error); r.readAsArrayBuffer(this); });
  } });
}
function arquivo(nome: string, conteudo: string | Uint8Array): File {
  return new File([typeof conteudo === 'string' ? utf8(conteudo) : conteudo], nome, { type: '' });
}
function monta(p: { onVer?: (a: File) => Promise<string | null>; sugestao?: SugestaoDocumento; completar?: CompletarPelaNota; registrarFalha?: boolean } = {}) {
  const registrar = vi.fn(async (_p: LancDocPayload) => (p.registrarFalha ? null : { id: 'novo', origem: 'lancamento' as const, operacaoId: null }));
  const api: LancamentoDocumentosApi = {
    documentos: [], confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
    registrar, editar: vi.fn(), cancelar: vi.fn(), anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
  };
  render(<FormDocumento api={api} documento={null} clienteId="cli" onFechar={vi.fn()} sugestao={p.sugestao ?? SUGESTAO} onVerOQueANotaMuda={p.onVer}
    completarPelaNota={p.completar} />);
  return { registrar };
}
const soltar = (f: File) => fireEvent.change(screen.getByTestId('doc-arquivo'), { target: { files: [f] } });
const valorDe = (id: string) => (screen.getByTestId(id) as HTMLInputElement).value;

beforeEach(() => {
  definirFornecedoresDoLeitor(FORNECEDORES);
  itens.gravar.mockClear();
  banco.completarComANota.mockClear(); banco.desfazerCompletar.mockClear(); banco.fornecedorPeloDocumento.mockClear();
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('P127 — as regras puras (camposDaNota, divergenciasDaNota)', () => {
  it('os campos da nota e o lado a lado: nº "74974" = "000.074.974" não diverge; valor, emissão e emitente sim', async () => {
    const r = await lerNota(utf8(montarNFe(NOTA)));
    if (r.ok === false) throw new Error(r.frase);
    const c = camposDaNota(r.nota);
    expect([c.numero, c.valor, c.emissao, c.chave, c.muda]).toEqual(['000.074.974', 408.77, '2026-09-30', chaveDe(EMITENTE_CNPJ, '55', '74974'), true]);
    const d = divergenciasDaNota(c, { numero: '74974', dataEmissao: '2026-08-24', valor: 400, emitenteId: 'outro', emitenteNome: 'Parafusos Sinteticos Ltda' }, 'agro');
    expect(d.map((x) => [x.campo, x.nota, x.lancamento])).toEqual([
      ['emissao', '30/09/2026', '24/08/2026'], ['valor', '408,77', '400,00'], ['emitente', 'AGROPECUARIA EXEMPLO LTDA', 'Parafusos Sinteticos Ltda']]);
    /* o lançamento sem o campo não "diverge" */
    expect(divergenciasDaNota(c, { numero: null, dataEmissao: null, valor: null, emitenteId: null, emitenteNome: null }, 'agro')).toEqual([]);
  });
});

describe('P127 — o Novo documento lê a nota solta no campo Arquivo', () => {
  it('o caso do print: preenche nº, série, emissão, valor, emitente (o cadastro pelo CNPJ) e a CHAVE com o que a nota diz, em destaque', async () => {
    monta();
    soltar(arquivo('000.074.974.xml', montarNFe(NOTA)));
    await screen.findByTestId('nota-lida');
    expect([valorDe('doc-numero'), valorDe('doc-serie'), valorDe('doc-chave')]).toEqual(['000.074.974', '1', chaveDe(EMITENTE_CNPJ, '55', '74974')]);
    expect(screen.getByTestId('doc-chave').className).toContain('bg-sky-50');
    expect(screen.queryByTestId('sugestao-do-lancamento')).toBeNull();
    expect(screen.getByTestId('nota-lida').textContent).toContain('Lido da nota 000.074.974 (chave conferida)');
  });
  it('onde a nota e o lançamento divergem, os dois lado a lado; "usar o do lançamento" troca SÓ aquele campo (e volta)', async () => {
    const { registrar } = monta();
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    await screen.findByTestId('nota-lida');
    const divs = screen.getAllByTestId('nota-divergencia');
    expect(divs.map((d) => d.getAttribute('data-campo'))).toEqual(['emissao', 'valor', 'emitente']);
    const valor = divs[1];
    expect(valor.textContent).toContain('nota 408,77');
    expect(valor.textContent).toContain('400,00');
    fireEvent.click(within(valor).getByTestId('nota-divergencia-trocar'));
    expect(within(screen.getAllByTestId('nota-divergencia')[1]).getByTestId('nota-divergencia-trocar').textContent).toBe('usar o da nota');
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    const p = registrar.mock.calls[0][0];
    /* o valor do LANÇAMENTO (escolhido); o resto, o da nota */
    expect([p.valorDocumento, p.numero, p.chaveAcesso, p.dataEmissao, p.emitenteId]).toEqual([400, '000.074.974', chaveDe(EMITENTE_CNPJ, '55', '74974'), '2026-09-30', 'agro']);
    /* a nota lida guarda os itens pela chave (a mesma função do "Criar") */
    await waitFor(() => expect(itens.gravar).toHaveBeenCalledTimes(1));
  });
  it('soltar a nota DE NOVO (ou outro arquivo) não apaga o lado a lado: o "antes" continua sendo o do lançamento', async () => {
    monta();
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    await screen.findByTestId('nota-lida');
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    await waitFor(() => expect(screen.getAllByTestId('nota-divergencia').map((d) => d.getAttribute('data-campo'))).toEqual(['emissao', 'valor', 'emitente']));
    expect(screen.getAllByTestId('nota-divergencia')[1].textContent).toContain('400,00');
  });
  it('nota com itens/duplicatas: o botão "Ver o que a nota muda" aparece (o lugar já era dele) e abre a prévia com o arquivo; registrar segue igual', async () => {
    const onVer = vi.fn(async (_a: File): Promise<string | null> => null);
    monta({ onVer });
    const f = arquivo('n.xml', montarNFe(NOTA));
    soltar(f);
    await screen.findByTestId('nota-lida');
    fireEvent.click(screen.getByTestId('doc-ver-o-que-a-nota-muda'));
    await waitFor(() => expect(onVer).toHaveBeenCalledWith(f));
    expect(screen.getByTestId('doc-registrar').textContent).toBe('Registrar documento');
  });
  it('a prévia não abriu: a frase pronta fica no rodapé do formulário (nunca toast)', async () => {
    monta({ onVer: async () => 'Não consegui verificar se esta nota já foi lançada.' });
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    await screen.findByTestId('nota-lida');
    fireEvent.click(screen.getByTestId('doc-ver-o-que-a-nota-muda'));
    expect((await screen.findByTestId('erro-form-documento')).textContent).toBe('Não consegui verificar se esta nota já foi lançada.');
  });
  it('PDF que não se lê (escaneado): diz "não consegui ler a chave — itens não gravados", os campos ficam do lançamento e registrar segue', async () => {
    const { registrar } = monta({ onVer: async () => null });
    soltar(arquivo('escaneado.pdf', new Uint8Array([1, 2, 3, 4])));
    expect((await screen.findByTestId('nota-nao-lida')).textContent).toBe(FRASE_NOTA_NAO_LIDA);
    /* o lugar do botão fica (nada se desloca), invisível e apagado */
    const ver = screen.getByTestId('doc-ver-o-que-a-nota-muda');
    expect([ver.className.includes('invisible'), ver.hasAttribute('disabled')]).toEqual([true, true]);
    expect(valorDe('doc-chave')).toBe('');
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(itens.gravar).not.toHaveBeenCalled();
  });
  it('imagem não é nota: nada se tenta ler (nem o aviso)', async () => {
    monta();
    soltar(arquivo('foto.png', new Uint8Array([137, 80, 78, 71])));
    await screen.findByTestId('arquivo-escolhido');
    expect(screen.queryByTestId('nota-nao-lida')).toBeNull();
    expect(screen.queryByTestId('nota-lida')).toBeNull();
  });
});

/* P164 (Gabriel 28/10 15:22) — a nota que CONFERE (valor e emitente iguais aos do lançamento) leva ao lançamento o nº "000.000.000", o tipo
   Nota Fiscal e a competência = emissão, pela MESMA gravação do P128b; o lançamento grava ANTES do documento, e o documento que falha desfaz */
describe('P164 — o Registrar documento com a nota que confere', () => {
  const CONFERE: SugestaoDocumento = { numero: '74974', dataEmissao: '2026-08-24', valor: 408.77, emitenteId: 'agro' };
  const completar = () => ({ lancamentoId: 'lanc-1', onCompletado: vi.fn() });
  it('a faixa diz o que o lançamento fica (a prévia do banco); Registrar grava o lançamento ANTES do documento e o modal recebe o que ficou', async () => {
    const c = completar();
    const { registrar } = monta({ sugestao: CONFERE, completar: c });
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    expect((await screen.findByTestId('nota-lancamento-fica')).textContent)
      .toBe('· ao registrar, o lançamento fica com nº 000.074.974, tipo Nota Fiscal, competência 30/09/2026');
    expect(banco.completarComANota.mock.calls[0][1]).toEqual([{ id: 'lanc-1', numero_documento: '000.074.974', tipo_documento: 'Nota Fiscal', data_competencia: '2026-09-30' }]);
    expect(banco.completarComANota.mock.calls.every((x) => x[2].simular)).toBe(true);
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    const gravou = banco.completarComANota.mock.calls.findIndex((x) => x[2].simular === false);
    expect(gravou).toBeGreaterThanOrEqual(0);
    expect(banco.completarComANota.mock.invocationCallOrder[gravou]).toBeLessThan(registrar.mock.invocationCallOrder[0]);
    expect(c.onCompletado).toHaveBeenCalledWith({ numeroDocumento: '000.074.974', tipoDocumento: 'Nota Fiscal', dataCompetencia: '2026-09-30', safraId: 'safra-2627' });
    expect(banco.desfazerCompletar).not.toHaveBeenCalled();
  });
  it('valor ou emitente diferentes: não confere — nada vai ao lançamento (o documento registra como sempre)', async () => {
    const { registrar } = monta({ completar: completar() });
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    await screen.findByTestId('nota-lida');
    expect(screen.queryByTestId('nota-lancamento-fica')).toBeNull();
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(banco.completarComANota).not.toHaveBeenCalled();
  });
  it('o banco recusa a gravação: a frase fica no formulário e NADA é gravado (nem o documento)', async () => {
    const { registrar } = monta({ sugestao: CONFERE, completar: completar() });
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    await screen.findByTestId('nota-lancamento-fica');
    banco.completarComANota.mockImplementationOnce(async () => ({ ok: false, motivo: 'O mês 09/2026 está fechado: reabra antes de mudar «Parafusos». Nada foi gravado.' }));
    fireEvent.click(screen.getByTestId('doc-registrar'));
    expect(await screen.findByText('O mês 09/2026 está fechado: reabra antes de mudar «Parafusos». Nada foi gravado.')).toBeTruthy();
    expect(registrar).not.toHaveBeenCalled();
  });
  it('o documento não nasce depois de o lançamento mudar: a operação é DESFEITA e a frase diz', async () => {
    const c = completar();
    monta({ sugestao: CONFERE, completar: c, registrarFalha: true });
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    await screen.findByTestId('nota-lancamento-fica');
    fireEvent.click(screen.getByTestId('doc-registrar'));
    expect(await screen.findByText('Não foi possível registrar o documento. O lançamento voltou ao que era.')).toBeTruthy();
    expect(banco.desfazerCompletar).toHaveBeenCalledWith('op-1');
    expect(c.onCompletado).not.toHaveBeenCalled();
  });
  it('o emitente sai do CNPJ lido: a lista ainda sem o cadastro → o banco pelo CNPJ, nunca "Outro" calado', async () => {
    definirFornecedoresDoLeitor([{ id: 'outro', nome: 'Parafusos Sinteticos Ltda', cpf_cnpj: null, ativo: true }]);
    const { registrar } = monta();
    soltar(arquivo('n.xml', montarNFe(NOTA)));
    await screen.findByTestId('nota-lida');
    await waitFor(() => expect(banco.fornecedorPeloDocumento).toHaveBeenCalledWith('cli', expect.stringContaining('11222333')));
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(registrar.mock.calls[0][0].emitenteId).toBe('agro');
  });
});
