/**
 * BOLETO D3d — a caixa MONTADA, os arquivos ARRASTADOS (o grupo "Arrastados por você"): soltar só LÊ e pede a PRÉVIA (simular); "Vincular"
 * e "Guardar" gravam pela MESMA RPC sem simular e sobem o PDF; o arquivo que não sobe é DITO; a senha nunca vai ao banco (a sugestão vem dos
 * titulares); o PDF imagem diz por quê; "Ignorar" do arrastado só o tira da lista (nada no banco); os guardados sem lançamento aparecem.
 * ⚠ O leitor e o banco são falsos (injetados pela prop, como a bancada do gate): a leitura em si está nos testes da D1b/D3d e as RPCs
 *   no `boleto_d1_test.sql` / `boleto_d3d_caixa_email_test.sql`.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import type { EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { FRASE_PDF_IMAGEM, type LerArquivoDaCaixa, type LeituraDaCaixa } from '@/hooks/useCaixaDeBoletos';

const parte = (nome: string | null, documento: string | null) => ({ nome, documento, confira: false });
const boletos = (linha: string, valor: number): LeituraDaCaixa => ({
  k: 'boletos', boletos: [{ ok: true, codigo_barras: linha.slice(0, 44), linha, tipo: 'bancario', banco: '341', valor, vencimento: '2026-12-10' }],
  beneficiario: parte('Fornecedor A', '11222333000181'), pagador: parte('Cliente Teste', '11144477735'),
});
const LINHA_A = '3'.repeat(47); const LINHA_B = '4'.repeat(47);
/* o conteúdo do arquivo falso É o nome; "senha.pdf" só abre com 11144 */
const LER_PADRAO: LerArquivoDaCaixa = async (bytes, _tipo, senha) => {
  const nome = new TextDecoder().decode(bytes);
  if (nome === 'senha.pdf') return senha === '11144' ? boletos(LINHA_B, 50) : { k: 'senha', errada: !!senha };
  if (nome === 'imagem.pdf') return { k: 'nada', frase: FRASE_PDF_IMAGEM };
  if (nome === 'sem-par.pdf') return boletos(LINHA_B, 77);
  return boletos(LINHA_A, 964.67);
};
const ler = vi.fn<LerArquivoDaCaixa>(LER_PADRAO);

function respostaDoBanco(linha: string, simular: boolean) {
  const comPar = linha === LINHA_A;
  return respostaDeEntrar({
    ok: true, simulado: simular, ja_existe: false, id: simular ? null : `id-${linha.slice(0, 1)}`,
    storage_path: simular ? null : `cli/boletos/id-${linha.slice(0, 1)}.pdf`, avisos: [],
    boleto: { codigo_barras: linha.slice(0, 44), linha_digitavel: linha, tipo: 'bancario', valor: 964.67, vencimento: '2026-12-10', beneficiario_nome: 'Fornecedor A', situacao: 'novo' },
    situacao: { lancamentos: [], avisos: [] },
    candidatos: comPar ? [{ tipo: 'exato', soma: 964.67, lancamentos: [{ id: 'l1', descricao: 'NF 31.2', valor: 964.67, status: 'previsto', vencimento: '2026-12-10' }] }] : [],
  });
}

let api: { [K in keyof CaixaApi]: Mock<CaixaApi[K]> };
let parcela: { [K in keyof ParcelaApi]: Mock<ParcelaApi[K]> };
let entrada: { [K in keyof EntradaEmailApi]: Mock<EntradaEmailApi[K]> };
let guardados: Record<string, unknown>[] = [];
beforeEach(() => {
  ler.mockReset(); ler.mockImplementation(LER_PADRAO); guardados = [];
  api = {
    lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: guardados }) })),
    entrar: vi.fn<CaixaApi['entrar']>(async (_c, l, simular) => ({ ok: true, dados: respostaDoBanco(String(l.linha), simular) })),
    subirArquivo: vi.fn<CaixaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: ['111.444.777-35', '11.222.333/0001-81'] })),
    marcar: vi.fn<CaixaApi['marcar']>(async () => ({ ok: true, dados: true })),
  };
  parcela = {
    entrar: api.entrar, subirArquivo: api.subirArquivo,
    ligar: vi.fn<ParcelaApi['ligar']>(async () => ({ ok: true, dados: { ok: true } })),
    boletoDoLancamento: vi.fn<ParcelaApi['boletoDoLancamento']>(async () => ({ ok: true, dados: null })),
  };
  const nada = async () => ({ ok: true as const, dados: true as const });
  entrada = {
    endereco: vi.fn<EntradaEmailApi['endereco']>(async () => ({ ok: true, dados: { dominio: 'd', endereco: null, criadoEm: null } })),
    gerar: vi.fn<EntradaEmailApi['gerar']>(), revogar: vi.fn<EntradaEmailApi['revogar']>(),
    todas: vi.fn<EntradaEmailApi['todas']>(async () => ({ ok: true, dados: [] })),
    baixar: vi.fn<EntradaEmailApi['baixar']>(), ignorar: vi.fn<EntradaEmailApi['ignorar']>(nada), voltar: vi.fn<EntradaEmailApi['voltar']>(nada),
    resolver: vi.fn<EntradaEmailApi['resolver']>(nada), notasNoSistema: vi.fn<EntradaEmailApi['notasNoSistema']>(async () => ({ ok: true, dados: {} })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

const montar = () => render(<CaixaDeBoletosDialog clienteId="cli" api={api} parcela={parcela} ler={ler} entrada={entrada} hoje="2026-11-18" aoFechar={() => {}} />);
async function soltar(...nomes: string[]) {
  fireEvent.change(screen.getByTestId('input-da-caixa'), { target: { files: nomes.map((n) => new File([n], n, { type: 'application/pdf' })) } });
  await waitFor(() => expect(screen.queryAllByText(/^(procurando|lendo)/)).toHaveLength(0));
}
const linhaDe = (nome: string) => {
  const l = screen.getAllByTestId('linha-da-caixa').find((x) => x.textContent?.includes(nome));
  if (!l) throw new Error(`sem a linha de ${nome}`);
  return l;
};

describe('BOLETO D3d — os arrastados', () => {
  it('soltar só LÊ e pede a PRÉVIA (simular, origem pdf); nada grava nem sobe antes do gesto', async () => {
    montar();
    await soltar('boleto-a.pdf');
    expect(screen.getByTestId('grupo-da-caixa').textContent).toMatch(/Arrastados por você/);
    expect(linhaDe('boleto-a.pdf').textContent).toMatch(/exato.*NF 31\.2/);
    expect(api.entrar).toHaveBeenCalledTimes(1);
    expect(api.entrar.mock.calls[0][2]).toBe(true);
    expect(api.entrar.mock.calls[0][1]).toMatchObject({ origem: 'pdf', arquivo_nome: 'boleto-a.pdf' });
    expect(api.subirArquivo).not.toHaveBeenCalled();
  });

  it('"Vincular" grava pela MESMA RPC sem simular, sobe o PDF no caminho do banco e liga ao lançamento; a linha fica "feito"', async () => {
    montar();
    await soltar('boleto-a.pdf');
    fireEvent.click(within(linhaDe('boleto-a.pdf')).getByTestId('acao-vincular_boleto'));
    await waitFor(() => expect(parcela.ligar).toHaveBeenCalledWith('id-3', ['l1'], false));
    expect(api.subirArquivo).toHaveBeenCalledWith('cli/boletos/id-3.pdf', expect.any(File));
    expect(entrada.resolver).not.toHaveBeenCalled();   // arrastado: não há linha de e-mail
    await waitFor(() => expect(linhaDe('boleto-a.pdf').textContent).toMatch(/feito/));
  });

  it('sem lançamento parecido: "Guardar" põe na caixa; o arquivo que não sobe é DITO', async () => {
    api.subirArquivo.mockResolvedValue({ ok: false, erro: 'falhou' });
    montar();
    await soltar('sem-par.pdf');
    const l = linhaDe('sem-par.pdf');
    expect(l.textContent).toMatch(/sem lançamento.*nenhum lançamento parecido/);
    fireEvent.click(within(l).getByTestId('acao-guardar'));
    await waitFor(() => expect(screen.getByTestId('rodape-da-caixa').textContent).toBe('O boleto entrou na caixa, mas o arquivo não subiu.'));
    expect(api.entrar.mock.calls.some((c) => c[2] === false)).toBe(true);
    expect(parcela.ligar).not.toHaveBeenCalled();
  });

  it('PDF com senha: pede a senha, sugere SÓ dos titulares (5 dígitos) e a senha nunca vai ao banco', async () => {
    montar();
    await soltar('senha.pdf');
    expect(linhaDe('senha.pdf').textContent).toMatch(/com senha/);
    const sugestoes = screen.getAllByTestId('sugestao-de-senha').map((b) => b.textContent);
    expect(sugestoes).toEqual(['11144', '11222']);
    fireEvent.click(screen.getAllByTestId('sugestao-de-senha')[0]);
    await waitFor(() => expect(api.entrar).toHaveBeenCalledTimes(1));
    /* o CPF do pagador começa por 11144: o que não pode ir é a SENHA como valor */
    expect(JSON.stringify(api.entrar.mock.calls)).not.toMatch(/"11144"/);
    expect(ler.mock.calls.at(-1)?.[2]).toBe('11144');
  });

  it('PDF imagem: "Não sei" com o porquê e só "Ignorar" — que tira o arrastado da lista sem chamar o banco', async () => {
    montar();
    await soltar('imagem.pdf');
    const l = linhaDe('imagem.pdf');
    expect(l.textContent).toMatch(/Não sei.*imagem \(escaneado\)/);
    fireEvent.click(within(l).getByTestId('acao-ignorar'));
    const d = await screen.findByTestId('ignorar-dialog');
    fireEvent.click(within(d).getByTestId('confirmar-ignorar'));   // o motivo sugerido: "não é boleto nem nota"
    await waitFor(() => expect(screen.queryAllByTestId('linha-da-caixa')).toHaveLength(0));
    expect(entrada.ignorar).not.toHaveBeenCalled();
    expect(api.marcar).not.toHaveBeenCalled();
  });

  it('os guardados sem lançamento aparecem em "Na caixa, sem lançamento"; Ignorar = descartado com o motivo escrito', async () => {
    guardados = [{ id: 'g1', codigo_barras: LINHA_A.slice(0, 44), linha_digitavel: LINHA_A, situacao: 'novo', beneficiario_nome: 'Fornecedor F', valor: 1840.5, vencimento: '2026-12-20', arquivo_nome: 'g1.pdf' }];
    montar();
    await waitFor(() => expect(screen.getByText('Na caixa, sem lançamento')).toBeTruthy());
    await waitFor(() => expect(linhaDe('g1.pdf').textContent).toMatch(/exato/));
    fireEvent.click(within(linhaDe('g1.pdf')).getByTestId('acao-ignorar'));
    const d = await screen.findByTestId('ignorar-dialog');
    fireEvent.click(within(d).getByTestId('motivo-repetido'));
    fireEvent.click(within(d).getByTestId('confirmar-ignorar'));
    await waitFor(() => expect(api.marcar).toHaveBeenCalledWith('g1', 'descartado', 'Repetido (já chegou antes)'));
    expect(entrada.ignorar).not.toHaveBeenCalled();
  });
});
