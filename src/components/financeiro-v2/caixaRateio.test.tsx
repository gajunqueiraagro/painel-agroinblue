/**
 * CAIXA-FOLHA-RATEIO-01 (Gabriel 27/11 19:45) — a CAIXA MONTADA (APIs e leitor falsos): o pacote do contador da OUTRA parte do rateio,
 * arrastado (8 arquivos), vira UM pacote; 1 clique em "Anexar ao rateio" → os 8 vão para Resolvidos, cada um anexado (comprovante) aos
 * lançamentos da parte do cliente do mês; NENHUM boleto entra na caixa e nenhum lançamento é criado; "Guardar" não aparece.
 * ⚠ Dado INVENTADO (`rateioNaCaixa.casos.ts`).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { entradaDaLinha, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import type { LerArquivoDaCaixa } from '@/hooks/useCaixaDeBoletos';
import { CPF_DO_CLIENTE, LANCAMENTOS, PACOTE, TERCEIRO } from '@/lib/financeiro/boleto/rateioNaCaixa.casos';

const COD = '8'.repeat(44);
/* o leitor falso: o nome do arquivo (o que o `baixar` falso devolve) → a leitura do pacote inventado */
const LER: LerArquivoDaCaixa = async (bytes) => PACOTE[new TextDecoder().decode(bytes)] ?? { k: 'nada', frase: 'x' };
const ler = vi.fn<LerArquivoDaCaixa>(LER);

/* o arrastado já GUARDADO na Caixa (origem 'arrastado', o arquivo no storage do cliente) */
const arrastado = (id: string, nome: string) => entradaDaLinha({
  id, mensagem_id: `arrastado:${id}`, remetente: null, assunto: null, recebido_em: '2026-11-27T22:42:00Z', arquivo_nome: nome,
  tipo: 'pdf', tamanho_bytes: 10, storage_path: `cli/entrada/${id}.pdf`, estado: 'a_ler', origem: 'arrastado',
});

let todas: ReturnType<typeof entradaDaLinha>[] = [];
let api: { [K in keyof CaixaApi]-?: Mock<NonNullable<CaixaApi[K]>> };
let parcela: { [K in keyof ParcelaApi]: Mock<ParcelaApi[K]> };
let entrada: { [K in keyof EntradaEmailApi]-?: Mock<NonNullable<EntradaEmailApi[K]>> };
beforeEach(() => {
  ler.mockReset(); ler.mockImplementation(LER);
  api = {
    lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [] }) })),
    entrar: vi.fn<CaixaApi['entrar']>(async (_c, _l, simular) => ({ ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: false, id: null, storage_path: null, avisos: [],
      boleto: { codigo_barras: COD, valor: 2100, vencimento: '2026-12-20', situacao: 'novo' }, situacao: { lancamentos: [], avisos: [] }, candidatos: [],
    }) })),
    subirArquivo: vi.fn<CaixaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: [CPF_DO_CLIENTE] })),
    acordosDeRateio: vi.fn<NonNullable<CaixaApi['acordosDeRateio']>>(async () => ({ ok: true, dados: [TERCEIRO] })),
    lancamentosDoRateio: vi.fn<NonNullable<CaixaApi['lancamentosDoRateio']>>(async (_c, comps) => ({ ok: true, dados: LANCAMENTOS.filter((l) => comps.includes(l.competencia)) })),
    marcar: vi.fn<CaixaApi['marcar']>(async () => ({ ok: true, dados: true })),
    registrarDocumento: vi.fn<CaixaApi['registrarDocumento']>(async () => ({ ok: true, dados: 'gravado' })),
  };
  parcela = {
    entrar: api.entrar, subirArquivo: api.subirArquivo,
    ligar: vi.fn<ParcelaApi['ligar']>(async () => ({ ok: true, dados: { ok: true } })),
    boletoDoLancamento: vi.fn<ParcelaApi['boletoDoLancamento']>(async () => ({ ok: true, dados: null })),
  };
  entrada = {
    endereco: vi.fn(async () => ({ ok: true as const, dados: { dominio: 'boletos.agroinblue.com.br', endereco: null, criadoEm: null } })),
    gerar: vi.fn(), revogar: vi.fn(),
    todas: vi.fn<EntradaEmailApi['todas']>(async () => ({ ok: true, dados: todas })),
    baixar: vi.fn<EntradaEmailApi['baixar']>(async (caminho) => ({ ok: true, dados: new Blob([todas.find((e) => e.storagePath === caminho)?.arquivoNome ?? '']) })),
    ignorar: vi.fn(), voltar: vi.fn(),
    /* resolver = a linha sai de "A resolver" (o banco grava o estado) */
    resolver: vi.fn<EntradaEmailApi['resolver']>(async (id, estado) => { todas = todas.map((e) => (e.id === id ? { ...e, estado } : e)); return { ok: true, dados: true }; }),
    notasNoSistema: vi.fn<EntradaEmailApi['notasNoSistema']>(async () => ({ ok: true, dados: {} })),
    registrarArrastado: vi.fn(), resolvidos: vi.fn(async () => ({ ok: true as const, dados: {} })),
    guardarLeitura: vi.fn<NonNullable<EntradaEmailApi['guardarLeitura']>>(async () => ({ ok: true, dados: true })),
    ultimaChegada: vi.fn<NonNullable<EntradaEmailApi['ultimaChegada']>>(async () => ({ ok: true, dados: null })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

const montar = () => render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="Cliente Sintético" api={api} parcela={parcela} ler={ler}
  entrada={entrada} hoje="2026-11-27" aoLancarNota={vi.fn()} aoFechar={() => {}} />);
const NOMES = Object.keys(PACOTE);

describe('o pacote do rateio na Caixa', () => {
  it('arrastar o pacote → 1 clique → 8 resolvidos anexados, 0 boleto, 0 lançamento novo', async () => {
    todas = NOMES.map((n, i) => arrastado(`a${i}`, n));
    montar();
    await waitFor(() => expect(screen.getAllByTestId('acao-anexar_rateio')).toHaveLength(8));
    expect(screen.queryAllByTestId('acao-guardar')).toHaveLength(0);
    expect(api.lancamentosDoRateio).toHaveBeenCalledWith('cli', ['2026-11', '2026-12']);
    fireEvent.click(screen.getAllByTestId('acao-anexar_rateio')[0]);
    await waitFor(() => expect(entrada.resolver).toHaveBeenCalledTimes(8));
    expect(entrada.resolver.mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual(NOMES.map(() => ['folha', null, null]));
    /* cada arquivo, como COMPROVANTE, nos lançamentos dele: 2+2+2+1 folhas, 2 INSS, 4+4 FGTS, 1 reembolso */
    expect(api.registrarDocumento).toHaveBeenCalledTimes(18);
    expect(new Set(api.registrarDocumento.mock.calls.map((c) => c[2].especie))).toEqual(new Set(['comprovante']));
    const doArquivo = (n: string) => api.registrarDocumento.mock.calls.filter((c) => c[2].nome === n).map((c) => c[1]).sort();
    expect(doArquivo('resumo a mao.pdf')).toEqual(['reembolso']);
    expect(doArquivo('darf inss nov.pdf')).toEqual(['inss-1', 'inss-2']);
    expect(api.registrarDocumento.mock.calls.find((c) => c[2].nome === 'gfd nov.pdf')?.[2].url).toBe(`cli/entrada/a${NOMES.indexOf('gfd nov.pdf')}.pdf`);
    expect(api.registrarDocumento.mock.calls.some((c) => ['proprio', 'fgts-proprio', 'inss-13', 'reembolso-adiantado'].includes(c[1]))).toBe(false);
    /* nada entra como boleto (a prévia pode perguntar; gravar, nunca) e nenhum lançamento nasce (a Caixa não tem gravador de lançamento) */
    expect(api.entrar.mock.calls.filter((c) => c[2] === false)).toHaveLength(0);
    expect(parcela.ligar).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryAllByTestId('acao-anexar_rateio')).toHaveLength(0));
    expect(await screen.findByText(/8 documentos anexados aos lançamentos de 11\/2026 \(rateio com Terceiro Exemplo da Silva\); nada foi criado\./)).toBeTruthy();
  });

  it('sem acordo de rateio, o mesmo pacote segue como antes (o DARF oferece "Guardar")', async () => {
    api.acordosDeRateio.mockImplementation(async () => ({ ok: true, dados: [] }));
    api.documentosDosTitulares.mockImplementation(async () => ({ ok: true, dados: [] }));
    todas = NOMES.map((n, i) => arrastado(`a${i}`, n));
    montar();
    await waitFor(() => expect(screen.getAllByTestId('acao-guardar')).toHaveLength(1));
    expect(screen.queryAllByTestId('acao-anexar_rateio')).toHaveLength(0);
  });
});
