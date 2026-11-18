/**
 * BOLETO D3d — a caixa por e-mail v2 MONTADA (APIs e leitor falsos, injetados pela prop como na bancada do gate). Prende os GESTOS do mock
 * aprovado 18/11 07:50: um grupo por e-mail; a nota XML + DANFE numa linha; "Lançar nota" devolve o XML à tela de Lançamentos (nada grava
 * aqui); "Vincular" da nota já lançada resolve as DUAS entradas com o lançamento; "Vincular" do boleto entra, sobe, liga e resolve; Ignorar
 * pede o motivo (sem motivo nada vai ao banco) e volta pelo "Ignorados"; "Desfazer" do Resolvido. E o endereço (D3c) segue igual.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { EnderecoDeBoletosDialog } from './EnderecoDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { entradaDaLinha, fraseDoErroDaEntrada, respostaDoEndereco, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { passosCom } from '@/lib/financeiro/boleto/entradaEmail';
import type { LerArquivoDaCaixa } from '@/hooks/useCaixaDeBoletos';

const COD = '3'.repeat(44);
const CHAVE = '5'.repeat(44);
const NOTA = { chave: CHAVE, numero: '000122048', emitente: 'Pontero Nutrição Animal', valor: 6300, vencimento: '2026-12-20' };
/* o conteúdo do arquivo falso É o nome: o leitor falso decide por ele */
const LER_PADRAO: LerArquivoDaCaixa = async (bytes) => {
  const nome = new TextDecoder().decode(bytes);
  if (nome.endsWith('.xml') || nome === 'DOC001.pdf') return { k: 'nota', nota: NOTA };
  if (nome === 'boleto.pdf') {
    return { k: 'boletos', boletos: [{ ok: true, codigo_barras: COD, linha: '3'.repeat(47), tipo: 'bancario', banco: '341', valor: 2100, vencimento: '2026-12-20' }],
      beneficiario: { nome: 'Pontero', documento: '04402825000193', confira: false }, pagador: { nome: null, documento: null, confira: false } };
  }
  return { k: 'nada', frase: 'Sem linha digitável nem chave de nota.' };
};
const ler = vi.fn<LerArquivoDaCaixa>(LER_PADRAO);

const email = (id: string, m: Record<string, unknown>) => entradaDaLinha({
  id, mensagem_id: '<m1@x>', remetente: 'Natalino Cavalli Junior ADM <c@hotmail.com>', assunto: 'ENC: Pontero Nutrição Animal - Nota fiscal e Boleto',
  recebido_em: '2026-11-17T19:27:02Z', tipo: 'pdf', tamanho_bytes: 10, storage_path: `cli/entrada/${id}`, estado: 'a_ler', ...m,
});
let todas = [
  email('x', { arquivo_nome: 'chave.xml', tipo: 'xml' }), email('p', { arquivo_nome: 'DOC001.pdf' }), email('b', { arquivo_nome: 'boleto.pdf' }),
];
let notaLancada = false;
let api: { [K in keyof CaixaApi]: Mock<CaixaApi[K]> };
let parcela: { [K in keyof ParcelaApi]: Mock<ParcelaApi[K]> };
let entrada: { [K in keyof EntradaEmailApi]: Mock<EntradaEmailApi[K]> };
beforeEach(() => {
  ler.mockReset(); ler.mockImplementation(LER_PADRAO); notaLancada = false;
  todas = [email('x', { arquivo_nome: 'chave.xml', tipo: 'xml' }), email('p', { arquivo_nome: 'DOC001.pdf' }), email('b', { arquivo_nome: 'boleto.pdf' })];
  api = {
    lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [] }) })),
    entrar: vi.fn<CaixaApi['entrar']>(async (_c, _l, simular) => ({ ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: false, id: simular ? null : 'bol-1', storage_path: simular ? null : 'cli/boletos/bol-1.pdf', avisos: [],
      boleto: { codigo_barras: COD, valor: 2100, vencimento: '2026-12-20', situacao: 'novo' }, situacao: { lancamentos: [], avisos: [] },
      candidatos: [{ tipo: 'exato', soma: 2100, lancamentos: [{ id: 'lanc-1', descricao: 'Adensado 30 bs lote 70259 1/3', valor: 2100, status: 'programado', vencimento: '2026-12-20' }] }],
    }) })),
    subirArquivo: vi.fn<CaixaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: [] })),
    marcar: vi.fn<CaixaApi['marcar']>(async () => ({ ok: true, dados: true })),
    registrarDocumento: vi.fn<CaixaApi['registrarDocumento']>(async () => ({ ok: true, dados: 'gravado' })),
  };
  parcela = {
    entrar: api.entrar, subirArquivo: api.subirArquivo,
    ligar: vi.fn<ParcelaApi['ligar']>(async () => ({ ok: true, dados: { ok: true } })),
    boletoDoLancamento: vi.fn<ParcelaApi['boletoDoLancamento']>(async () => ({ ok: true, dados: null })),
  };
  entrada = {
    endereco: vi.fn<EntradaEmailApi['endereco']>(async () => ({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: null, criadoEm: null } })),
    gerar: vi.fn<EntradaEmailApi['gerar']>(async (_c, _m, simular) => ({ ok: true, dados: respostaDoEndereco({
      simulado: simular, endereco: simular ? 'teste-cliente-…@boletos.agroinblue.com.br' : 'teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br', antigo: null,
    }) })),
    revogar: vi.fn<EntradaEmailApi['revogar']>(async () => ({ ok: false, erro: 'Só o gestor do cliente ou a AgroinBlue revoga o endereço de boletos.' })),
    todas: vi.fn<EntradaEmailApi['todas']>(async () => ({ ok: true, dados: todas })),
    baixar: vi.fn<EntradaEmailApi['baixar']>(async (caminho) => ({ ok: true, dados: new Blob([todas.find((e) => e.storagePath === caminho)?.arquivoNome ?? '']) })),
    ignorar: vi.fn<EntradaEmailApi['ignorar']>(async () => ({ ok: true, dados: true })),
    voltar: vi.fn<EntradaEmailApi['voltar']>(async () => ({ ok: true, dados: true })),
    resolver: vi.fn<EntradaEmailApi['resolver']>(async () => ({ ok: true, dados: true })),
    notasNoSistema: vi.fn<EntradaEmailApi['notasNoSistema']>(async () => ({ ok: true, dados: notaLancada
      ? { [CHAVE]: { lancamentoId: 'lanc-9', descricao: 'Adensado 30 bs lote 70259 1/3', valor: 2100, vencimento: '2026-12-20' } } : {} })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

const montar = (aoLancarNota?: (f: File) => void) => render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="NJ Pecuária" api={api} parcela={parcela} ler={ler}
  entrada={entrada} hoje="2026-11-18" aoLancarNota={aoLancarNota} aoFechar={() => {}} />);
const linhaDe = async (re: RegExp) => {
  const ls = await screen.findAllByTestId('linha-da-caixa');
  const l = ls.find((x) => re.test(x.textContent ?? ''));
  if (!l) throw new Error(`linha ${re} não achada: ${ls.map((x) => x.textContent).join(' | ')}`);
  return l;
};
const esperarPronto = () => waitFor(() => {
  expect(screen.queryAllByTestId('linha-da-caixa').length).toBeGreaterThan(0);
  expect(screen.queryAllByText(/^(procurando|lendo)/)).toHaveLength(0);
});

describe('BOLETO D3d — a caixa por e-mail v2', () => {
  it('um grupo por e-mail; o XML e o DANFE da mesma chave = UMA linha "NF 122.048 · XML + PDF"; o boleto, outra; nada grava ao abrir', async () => {
    montar(vi.fn());
    await esperarPronto();
    expect(screen.getAllByTestId('grupo-da-caixa')).toHaveLength(1);
    expect(screen.getByTestId('grupo-da-caixa').textContent).toMatch(/Natalino Cavalli Junior ADM.*ENC: Pontero/);
    expect(screen.getAllByTestId('linha-da-caixa')).toHaveLength(2);
    expect((await linhaDe(/NF 122\.048 · XML \+ PDF/)).textContent).toMatch(/não lançada/);
    expect((await linhaDe(/boleto\.pdf/)).textContent).toMatch(/exato.*Adensado 30 bs lote 70259 1\/3/);
    expect(api.entrar.mock.calls.every((c) => c[2] === true)).toBe(true);
    expect(entrada.resolver).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^A resolver 2/ })).toBeTruthy();
  });

  it('"Lançar nota" entrega o XML (não o DANFE) à tela de Lançamentos; nada é gravado daqui', async () => {
    const aoLancar = vi.fn();
    montar(aoLancar);
    await esperarPronto();
    fireEvent.click(within(await linhaDe(/NF 122\.048/)).getByTestId('acao-lancar_nota'));
    await waitFor(() => expect(aoLancar).toHaveBeenCalledTimes(1));
    expect(aoLancar.mock.calls[0][0].name).toBe('chave.xml');
    expect(entrada.resolver).not.toHaveBeenCalled();
  });

  it('sem a tela de Lançamentos (a caixa do Editar lançamento) a nota não tem "Lançar nota"', async () => {
    montar(undefined);
    await esperarPronto();
    expect(within(await linhaDe(/NF 122\.048/)).queryByTestId('acao-lancar_nota')).toBeNull();
  });

  it('nota já lançada: "Vincular" resolve AS DUAS entradas (XML e PDF) com o lançamento achado pela chave', async () => {
    notaLancada = true;
    montar(vi.fn());
    await esperarPronto();
    const l = await linhaDe(/NF 122\.048/);
    expect(l.textContent).toMatch(/já lançada.*Adensado/);
    fireEvent.click(within(l).getByTestId('acao-vincular_nota'));
    await waitFor(() => expect(entrada.resolver).toHaveBeenCalledTimes(2));
    expect(entrada.resolver.mock.calls.map((c) => [c[0], c[1], c[3]]).sort()).toEqual([['p', 'nota', 'lanc-9'], ['x', 'nota', 'lanc-9']]);
  });

  it('"Vincular" do boleto: entra (sem simular, origem e-mail + Message-ID) → sobe o PDF → liga ao lançamento → a linha do e-mail vira boleto', async () => {
    montar(vi.fn());
    await esperarPronto();
    fireEvent.click(within(await linhaDe(/boleto\.pdf/)).getByTestId('acao-vincular_boleto'));
    await waitFor(() => expect(entrada.resolver).toHaveBeenCalledWith('b', 'boleto', 'bol-1', null));
    const gravou = api.entrar.mock.calls.find((c) => c[2] === false);
    expect(gravou?.[1]).toMatchObject({ origem: 'email', origem_ref: '<m1@x>', arquivo_nome: 'boleto.pdf' });
    expect(api.subirArquivo).toHaveBeenCalledWith('cli/boletos/bol-1.pdf', expect.any(File));
    expect(parcela.ligar).toHaveBeenCalledWith('bol-1', ['lanc-1'], false);
    expect(api.subirArquivo.mock.invocationCallOrder[0]).toBeLessThan(parcela.ligar.mock.invocationCallOrder[0]);
  });

  /* Gabriel 18/11 14:40 ("no lançamento não aparecem nem o boleto nem o PDF"): vincular = o PDF nos DOCUMENTOS do lançamento */
  it('"Vincular" do boleto põe o PDF que subiu nos documentos do lançamento ligado (espécie boleto), DEPOIS de ligar', async () => {
    montar(vi.fn());
    await esperarPronto();
    fireEvent.click(within(await linhaDe(/boleto\.pdf/)).getByTestId('acao-vincular_boleto'));
    await waitFor(() => expect(api.registrarDocumento).toHaveBeenCalledTimes(1));
    expect(api.registrarDocumento).toHaveBeenCalledWith('cli', 'lanc-1', { especie: 'boleto', nome: 'boleto.pdf', url: 'cli/boletos/bol-1.pdf', tamanhoBytes: null });
    expect(parcela.ligar.mock.invocationCallOrder[0]).toBeLessThan(api.registrarDocumento.mock.invocationCallOrder[0]);
  });

  it('"Vincular" da nota já lançada põe o DANFE (PDF) E o XML nos documentos do lançamento, com a chave e o nº (14:47)', async () => {
    notaLancada = true;
    montar(vi.fn());
    await esperarPronto();
    fireEvent.click(within(await linhaDe(/NF 122\.048/)).getByTestId('acao-vincular_nota'));
    await waitFor(() => expect(api.registrarDocumento).toHaveBeenCalledTimes(2));
    const docs = api.registrarDocumento.mock.calls.map((c) => c[2]).sort((a, b) => a.nome.localeCompare(b.nome));
    expect(docs).toEqual([
      { especie: 'nf', nome: 'chave.xml', url: 'cli/entrada/x', tamanhoBytes: 10, numero: '000.122.048', chaveAcesso: CHAVE, tipo: 'application/xml' },
      { especie: 'nf', nome: 'DOC001.pdf', url: 'cli/entrada/p', tamanhoBytes: 10, numero: '000.122.048', chaveAcesso: CHAVE, tipo: 'application/pdf' },
    ].sort((a, b) => a.nome.localeCompare(b.nome)));
    expect(api.registrarDocumento.mock.calls.every((c) => c[1] === 'lanc-9')).toBe(true);
  });

  it('o PDF não entrou nos documentos: a frase diz e o vínculo fica (nunca desfeito)', async () => {
    api.registrarDocumento.mockResolvedValue({ ok: false, erro: 'Sem acesso a este cliente.' });
    montar(vi.fn());
    await esperarPronto();
    fireEvent.click(within(await linhaDe(/boleto\.pdf/)).getByTestId('acao-vincular_boleto'));
    await waitFor(() => expect(screen.getByTestId('rodape-da-caixa').textContent).toMatch(/Ligado, mas o PDF não entrou nos documentos do lançamento: Sem acesso/));
    expect(parcela.ligar).toHaveBeenCalledTimes(1);
    expect(entrada.resolver).toHaveBeenCalledWith('b', 'boleto', 'bol-1', null);
  });

  it('ligar recusado: a frase diz que o boleto ficou na caixa e a linha do e-mail NÃO é marcada', async () => {
    parcela.ligar.mockResolvedValue({ ok: true, dados: { ok: false, motivo: 'recusa', frase: 'O lançamento está cancelado.', outroBoletoId: null } });
    montar(vi.fn());
    await esperarPronto();
    fireEvent.click(within(await linhaDe(/boleto\.pdf/)).getByTestId('acao-vincular_boleto'));
    await waitFor(() => expect(screen.getByTestId('rodape-da-caixa').textContent).toMatch(/está na caixa, mas não foi ligado: O lançamento está cancelado/));
    expect(entrada.resolver).not.toHaveBeenCalled();
  });

  it('Ignorar pede o MOTIVO: sem ele nada vai ao banco; com ele, as 2 entradas da nota vão juntas', async () => {
    montar(vi.fn());
    await esperarPronto();
    fireEvent.click(within(await linhaDe(/NF 122\.048/)).getByTestId('acao-ignorar'));
    const d = await screen.findByTestId('ignorar-dialog');
    fireEvent.click(within(d).getByTestId('confirmar-ignorar'));
    expect(within(d).getByTestId('dica-do-motivo').textContent).toBe('Escolha o motivo.');
    fireEvent.click(within(d).getByTestId('motivo-outro'));
    fireEvent.click(within(d).getByTestId('confirmar-ignorar'));
    expect(within(d).getByTestId('dica-do-motivo').textContent).toBe('Escreva o motivo.');
    expect(entrada.ignorar).not.toHaveBeenCalled();
    fireEvent.change(within(d).getByTestId('detalhe-do-motivo'), { target: { value: 'nota de teste' } });
    fireEvent.click(within(d).getByTestId('confirmar-ignorar'));
    await waitFor(() => expect(entrada.ignorar).toHaveBeenCalledTimes(1));
    expect([...entrada.ignorar.mock.calls[0][0]].sort()).toEqual(['p', 'x']);
    expect(entrada.ignorar.mock.calls[0].slice(1)).toEqual(['outro', 'nota de teste']);
  });

  it('"Ignorados" mostra o motivo e "Voltar para A resolver" chama o banco; "Resolvidos" tem "Desfazer"', async () => {
    todas = [
      email('i', { arquivo_nome: 'velho.xml', tipo: 'xml', estado: 'dispensado', ignorado_motivo: 'anterior_a_regra', dispensado_em: '2026-11-17T19:35:00Z' }),
      email('r', { arquivo_nome: 'boleto-ok.pdf', estado: 'boleto', boleto_id: 'bol-x', lido_em: '2026-11-18T10:00:00Z' }),
    ];
    montar(vi.fn());
    fireEvent.click(await screen.findByRole('button', { name: /^Ignorados 1/ }));
    expect((await screen.findByTestId('linha-ignorada')).textContent).toMatch(/dispensado antes da regra do motivo.*17\/11\/2026/);
    fireEvent.click(screen.getByTestId('voltar-ignorado'));
    await waitFor(() => expect(entrada.voltar).toHaveBeenCalledWith('i'));
    fireEvent.click(screen.getByRole('button', { name: /^Resolvidos 1/ }));
    fireEvent.click(await screen.findByTestId('desfazer-resolvido'));
    await waitFor(() => expect(entrada.voltar).toHaveBeenCalledWith('r'));
  });

  it('o boleto antigo (2025): selo "antigo · venceu há…" e "Ignorar" é o botão dourado (a 1ª ação)', async () => {
    api.entrar.mockResolvedValue({ ok: true, dados: respostaDeEntrar({ ok: true, simulado: true, ja_existe: false, candidatos: [], avisos: [],
      boleto: { codigo_barras: COD, situacao: 'novo' }, situacao: { lancamentos: [], avisos: [] } }) });
    todas = [email('v', { arquivo_nome: 'NF939-2.pdf' })];
    ler.mockResolvedValue({ k: 'boletos', boletos: [{ ok: true, codigo_barras: COD, linha: '3'.repeat(47), tipo: 'bancario', banco: '341', valor: 3480, vencimento: '2025-04-04' }],
      beneficiario: { nome: 'FIDC Multis', documento: null, confira: false }, pagador: { nome: null, documento: null, confira: false } });
    montar(vi.fn());
    await esperarPronto();
    const l = await linhaDe(/NF939-2\.pdf/);
    expect(l.textContent).toMatch(/antigo.*venceu há 1 ano e 7 meses/);
    const acoes = [...l.querySelectorAll<HTMLElement>('td')].at(-1);
    if (!acoes) throw new Error('sem a coluna "O que fazer"');
    expect(within(acoes).getAllByRole('button')[0].textContent).toBe('Ignorar');
  });
});

/* ═══ O NOME "Caixa de entrada" (Gabriel 18/11, FILA 11:58/12:56): só os rótulos; o endereço @boletos.agroinblue.com.br NÃO muda ═══ */
describe('CAIXA DE ENTRADA — o nome', () => {
  it('o título, o botão "E-mail de entrada" e o diálogo do endereço; o domínio segue @boletos', async () => {
    montar(vi.fn());
    expect(await screen.findByText('Caixa de entrada · NJ Pecuária')).toBeInTheDocument();
    expect(screen.queryByText(/Boletos e notas que chegaram/)).toBeNull();
    fireEvent.click(screen.getByTestId('abrir-endereco-de-boletos'));
    expect(screen.getByTestId('abrir-endereco-de-boletos').textContent).toBe('E-mail de entrada');
    expect(await screen.findByText('E-mail de entrada · NJ Pecuária')).toBeInTheDocument();
    expect(await screen.findByText(/Este cliente ainda não tem e-mail de entrada/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('gerar-endereco'));
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    expect((await screen.findByTestId('frase-do-endereco')).textContent).toMatch(/@boletos\.agroinblue\.com\.br/);
  });
});

/* ═══ VER e BAIXAR em toda linha de arquivo (Gabriel 18/11 11:59: "salvo quando a tela permitir visualizar e salvar") ═══ */
describe('BOLETO D3d — Ver e Baixar em toda linha de arquivo', () => {
  let baixados: string[];
  beforeEach(() => {
    baixados = [];
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { baixados.push(this.download); });
  });

  it('A resolver: a linha da nota (XML + PDF) pergunta QUAL baixar e salva com o nome de origem; o boleto baixa direto', async () => {
    montar(vi.fn());
    await esperarPronto();
    const nota = await linhaDe(/NF 122\.048/);
    expect(within(nota).getByTestId('ver-arquivo')).toBeEnabled();
    fireEvent.keyDown(within(nota).getByTestId('baixar-arquivo'), { key: 'Enter' });
    const opcoes = await screen.findAllByTestId('baixar-opcao');
    expect(opcoes.map((o) => o.textContent)).toEqual(['PDFDOC001.pdf', 'XMLchave.xml']);
    fireEvent.click(opcoes[1]);
    await waitFor(() => expect(baixados).toEqual(['chave.xml']));
    fireEvent.click(within(await linhaDe(/boleto\.pdf/)).getByTestId('baixar-arquivo'));
    await waitFor(() => expect(baixados).toEqual(['chave.xml', 'boleto.pdf']));
    expect(entrada.resolver).not.toHaveBeenCalled();
    expect(entrada.ignorar).not.toHaveBeenCalled();
  });

  it('Resolvidos e Ignorados: Ver e Baixar também; o XML ignorado abre por cima (abaixo de 1366) e diz "use Baixar"', async () => {
    todas = [
      email('i', { arquivo_nome: 'velho.xml', tipo: 'xml', estado: 'dispensado', ignorado_motivo: 'anterior_a_regra', dispensado_em: '2026-11-17T19:35:00Z' }),
      email('r', { arquivo_nome: 'boleto-ok.pdf', estado: 'boleto', boleto_id: 'bol-x', lido_em: '2026-11-18T10:00:00Z' }),
    ];
    montar(vi.fn());
    fireEvent.click(await screen.findByRole('button', { name: /^Resolvidos 1/ }));
    fireEvent.click(within(await screen.findByTestId('linha-resolvida')).getByTestId('baixar-arquivo'));
    await waitFor(() => expect(baixados).toEqual(['boleto-ok.pdf']));
    expect(entrada.baixar).toHaveBeenCalledWith('cli/entrada/r');
    fireEvent.click(screen.getByRole('button', { name: /^Ignorados 1/ }));
    fireEvent.click(within(await screen.findByTestId('linha-ignorada')).getByTestId('ver-arquivo'));
    expect((await screen.findByTestId('painel-por-cima')).textContent).toMatch(/velho\.xml.*use "Baixar"/);
    fireEvent.click(within(screen.getByTestId('painel-por-cima')).getByTestId('painel-baixar'));
    await waitFor(() => expect(baixados).toEqual(['boleto-ok.pdf', 'velho.xml']));
    expect(entrada.voltar).not.toHaveBeenCalled();
  });

  it('o boleto GUARDADO na caixa baixa o PDF dele (o caminho do boleto); sem arquivo guardado, Ver e Baixar ficam apagados', async () => {
    todas = [];
    api.lista.mockResolvedValue({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [
      { id: 'g-1', codigo_barras: COD, linha_digitavel: '3'.repeat(47), valor: 900, vencimento: '2026-12-01', situacao: 'novo',
        arquivo_nome: 'boleto-guardado.pdf', storage_path: 'cli/boletos/g-1.pdf', beneficiario_nome: 'Guardado Ltda' },
      { id: 'g-2', codigo_barras: '4'.repeat(44), linha_digitavel: '4'.repeat(47), valor: 800, vencimento: '2026-12-02', situacao: 'novo',
        arquivo_nome: null, storage_path: null, beneficiario_nome: 'Sem Arquivo Ltda' },
    ] }) });
    entrada.baixar.mockResolvedValue({ ok: true, dados: new Blob(['%PDF']) });
    montar(vi.fn());
    const com = await linhaDe(/boleto-guardado\.pdf/);
    fireEvent.click(within(com).getByTestId('baixar-arquivo'));
    await waitFor(() => expect(baixados).toEqual(['boleto-guardado.pdf']));
    expect(entrada.baixar).toHaveBeenCalledWith('cli/boletos/g-1.pdf');
    const sem = await linhaDe(/Sem Arquivo Ltda/);
    expect(within(sem).getByTestId('ver-arquivo')).toBeDisabled();
    expect(within(sem).getByTestId('baixar-arquivo')).toBeDisabled();
  });
});

describe('BOLETO D3c — o endereço de boletos', () => {
  const abrir = () => render(<EnderecoDeBoletosDialog clienteId="cli" clienteNome="Cliente Teste" api={entrada} aoFechar={() => {}} />);

  it('gerar: a PRÉVIA não grava; só "Confirmar" grava; depois relê o endereço', async () => {
    abrir();
    fireEvent.click(await screen.findByTestId('gerar-endereco'));
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    await waitFor(() => expect(entrada.gerar).toHaveBeenCalledWith('cli', null, true));
    expect((await screen.findByTestId('frase-do-endereco')).textContent).toMatch(/teste-cliente-…@boletos\.agroinblue\.com\.br/);
    expect(entrada.gerar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('confirmar-endereco'));
    await waitFor(() => expect(entrada.gerar).toHaveBeenLastCalledWith('cli', null, false));
    await waitFor(() => expect(entrada.endereco).toHaveBeenCalledTimes(2));
  });

  it('trocar sem motivo: o campo fica vermelho e o banco NÃO é chamado; com motivo, a prévia e o gravar levam o motivo', async () => {
    entrada.endereco.mockResolvedValue({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: 'teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br', criadoEm: '2026-11-16T19:39:00Z' } });
    abrir();
    expect((await screen.findByTestId('endereco-atual')).textContent).toBe('teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br');
    fireEvent.click(screen.getByTestId('trocar-endereco'));
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    expect(screen.getByTestId('motivo-do-endereco').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('frase-do-endereco').textContent).toMatch(/motivo/);
    expect(entrada.gerar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('motivo-do-endereco'), { target: { value: 'endereço divulgado' } });
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    await waitFor(() => expect(entrada.gerar).toHaveBeenCalledWith('cli', 'endereço divulgado', true));
    fireEvent.click(await screen.findByTestId('confirmar-endereco'));
    await waitFor(() => expect(entrada.gerar).toHaveBeenLastCalledWith('cli', 'endereço divulgado', false));
  });

  it('revogar recusado pelo banco: a frase dele aparece e nada mais acontece', async () => {
    entrada.endereco.mockResolvedValue({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: 'teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br', criadoEm: null } });
    abrir();
    fireEvent.click(await screen.findByTestId('revogar-endereco'));
    fireEvent.change(screen.getByTestId('motivo-do-endereco'), { target: { value: 'cliente saiu' } });
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    expect(await screen.findByText('Só o gestor do cliente ou a AgroinBlue revoga o endereço de boletos.')).toBeTruthy();
    expect(screen.queryByTestId('confirmar-endereco')).toBeNull();
    expect(entrada.revogar).toHaveBeenCalledWith('cli', 'cliente saiu', true);
  });

  it('o passo a passo: Gmail, Hotmail/Outlook.com e Microsoft 365, com o endereço do cliente no lugar', async () => {
    entrada.endereco.mockResolvedValue({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: 'nj-abcdefghij@boletos.agroinblue.com.br', criadoEm: null } });
    abrir();
    await screen.findByTestId('endereco-atual');
    expect(screen.getByTestId('passos-do-encaminhamento').textContent).toMatch(/Encaminhamento e POP\/IMAP/);
    fireEvent.click(screen.getByRole('button', { name: 'Hotmail / Outlook.com' }));
    const outlook = screen.getByTestId('passos-do-encaminhamento').textContent ?? '';
    expect(outlook).toMatch(/outlook\.live\.com/);
    expect(outlook).toMatch(/Encaminhar para.*nj-abcdefghij@boletos\.agroinblue\.com\.br/);
    expect(outlook).toMatch(/Não use "Encaminhar como anexo"/);
    fireEvent.click(screen.getByRole('button', { name: 'Microsoft 365 (empresa)' }));
    expect(screen.getByTestId('passos-do-encaminhamento').textContent).toMatch(/5\.7\.520/);
    expect(passosCom('gmail', null).join(' ')).not.toMatch(/\{endereco\}/);
  });
});

describe('BOLETO D3c — a frase do erro', () => {
  it('as frases das fn_entrada_* passam; o 42501 cru do Postgres não', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(fraseDoErroDaEntrada({ code: 'P0001', message: 'Revogar pede o motivo.' })).toBe('Revogar pede o motivo.');
    expect(fraseDoErroDaEntrada({ code: '42501', message: 'Só o gestor do cliente ou a AgroinBlue gera o endereço de boletos.' })).toMatch(/^Só o gestor/);
    expect(fraseDoErroDaEntrada({ code: '42501', message: 'permission denied for function x' })).toBe('Sem acesso a este cliente.');
    expect(fraseDoErroDaEntrada({ code: 'XX000', message: 'boom' })).toBe('Não consegui falar com o banco. Tente de novo.');
    erro.mockRestore();
  });
});
