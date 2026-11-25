/**
 * FOLHA-RESUMO-CONTADOR-01 — a Caixa PONTA A PONTA com o resumo do contador ("Extrato Mensal"; dado INVENTADO, banco em memória): o PDF que
 * o leitor reconhece vira a linha "Folha" (Resumo · 13º 1ª parcela · 11/2026, o FGTS total) com "Abrir"; Abrir = a prévia por empresa
 * (fazenda pelo CAEPF, vencimento, "cria a previsão"); "Prever FGTS" grava e a linha fica feita. Sem fazenda = o Prever apaga e diz por quê.
 * E o leitor de verdade (`lerDaCaixaCom`, pdfjs falso) dá o tipo 'resumo'.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import type { EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { lerDaCaixaCom, type LerArquivoDaCaixa } from '@/hooks/useCaixaDeBoletos';
import type { FolhaCaixaApi, ResumoCaixaApi } from '@/lib/folha/folhaCaixaApi';
import type { ResumoLido } from '@/lib/folha/lerResumoDoContador';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

const empregado = (codigo: string, fgts: number) => ({ codigo, nome: `PESSOA ${codigo}`, liquido: fgts * 12.5, fgts });
const RESUMO: ResumoLido = {
  tipo: '13_1', competencia: '2026-11', totalFgts: 190,
  empresas: [
    { codigo: '10', empresa: 'FULANO FICTICIO FAZ BOA VISTA', cei: '11122233300144', fgts: 140, baseFgts: 1750, somaDosEmpregados: 140, confere: true,
      empregados: [empregado('1', 80), empregado('2', 60)], paginas: [1, 2] },
    { codigo: '11', empresa: 'FULANO FICTICIO FAZ SERRA', cei: '11122233300225', fgts: 50, baseFgts: 625, somaDosEmpregados: 50, confere: true,
      empregados: [empregado('3', 50)], paginas: [3] },
  ],
};
const ler: LerArquivoDaCaixa = async () => ({ k: 'resumo', resumo: RESUMO });
const nada = async () => ({ ok: true as const, dados: true as const });
const api = {
  lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [] }) })),
  entrar: vi.fn<CaixaApi['entrar']>(), subirArquivo: vi.fn<CaixaApi['subirArquivo']>(),
  documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: [] })),
  marcar: vi.fn<CaixaApi['marcar']>(), registrarDocumento: vi.fn<CaixaApi['registrarDocumento']>(),
};
const parcela = { entrar: api.entrar, subirArquivo: api.subirArquivo, ligar: vi.fn<ParcelaApi['ligar']>(), boletoDoLancamento: vi.fn<ParcelaApi['boletoDoLancamento']>() };
const entrada = {
  endereco: vi.fn<EntradaEmailApi['endereco']>(async () => ({ ok: true, dados: { dominio: 'd', endereco: null, criadoEm: null } })),
  gerar: vi.fn<EntradaEmailApi['gerar']>(), revogar: vi.fn<EntradaEmailApi['revogar']>(),
  todas: vi.fn<EntradaEmailApi['todas']>(async () => ({ ok: true, dados: [] })),
  baixar: vi.fn<EntradaEmailApi['baixar']>(), ignorar: vi.fn<EntradaEmailApi['ignorar']>(nada), voltar: vi.fn<EntradaEmailApi['voltar']>(nada),
  resolver: vi.fn<EntradaEmailApi['resolver']>(nada), notasNoSistema: vi.fn<EntradaEmailApi['notasNoSistema']>(async () => ({ ok: true, dados: {} })),
};
const folhaApi = { aplicar: vi.fn<FolhaCaixaApi['aplicar']>(), desfazer: vi.fn<FolhaCaixaApi['desfazer']>(), subir: vi.fn<FolhaCaixaApi['subir']>() };
const previsao = (cei: string, fazenda: string, valor: number) => ({ cei, fazenda, descricao: 'FGTS 13º 1ª parcela 2026', valor, vencimento: '2026-12-18', lancamentoId: null });
function resumoApi(semFazenda = false) {
  return {
    fazendasPorCaepf: vi.fn<ResumoCaixaApi['fazendasPorCaepf']>(async () => ({ ok: true, dados: new Map(semFazenda ? [['11122233300144', 'faz-a']] : [['11122233300144', 'faz-a'], ['11122233300225', 'faz-b']]) })),
    prever: vi.fn<ResumoCaixaApi['prever']>(async () => ({ ok: true, dados: {
      jaAplicado: false, soma: semFazenda ? 140 : 190,
      previsoes: semFazenda ? [previsao('11122233300144', 'Faz. Boa Vista', 140)] : [previsao('11122233300144', 'Faz. Boa Vista', 140), previsao('11122233300225', 'Faz. Serra', 50)],
      pendencias: semFazenda ? [{ cei: '11122233300225', pendencia: 'sem_fazenda' }] : [],
    } })),
  };
}
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
  };
}
const doResumo = () => screen.getAllByTestId('linha-da-caixa').find((tr) => tr.getAttribute('data-chave')?.startsWith('resumo:'));
async function abrir(resumo: ReturnType<typeof resumoApi>) {
  render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="Cliente Teste" api={api} parcela={parcela} ler={ler} entrada={entrada} hoje="2026-11-24"
    aoFechar={() => {}} folha={{ api: folhaApi, resumo }} />);
  fireEvent.change(await screen.findByTestId('input-da-caixa'), { target: { files: [new File(['%PDF resumo'], 'Extrato Mensal ficticio.pdf', { type: 'application/pdf' })] } });
  await waitFor(() => expect(doResumo()).toBeTruthy());
  const linha = doResumo();
  if (!linha) throw new Error('sem linha');
  return linha;
}

describe('FOLHA-RESUMO-CONTADOR-01 — a Caixa com o resumo do contador', () => {
  it('arrastado → linha "Folha" (Resumo · 13º 1ª parcela · 11/2026, FGTS 190,00) → Abrir = a prévia por empresa → Prever grava e a linha fica feita', async () => {
    const resumo = resumoApi();
    const linha = await abrir(resumo);
    const c = within(linha).getAllByRole('cell').map((x) => x.textContent);
    expect(c[0]).toBe('Folha');
    expect(c[3]).toBe('Resumo · 13º 1ª parcela · 11/2026');
    expect(c[5]).toBe('190,00');
    expect(c[6]).toMatch(/2 empresas · FGTS confere/);
    fireEvent.click(within(linha).getByTestId('acao-abrir_resumo'));
    await waitFor(() => expect(screen.getByTestId('prever-fgts')).not.toBeDisabled());
    /* a prévia: simular, com a fazenda de cada CAEPF */
    expect(resumo.prever.mock.calls[0][3]).toBe(true);
    expect(resumo.prever.mock.calls[0][2].map((i) => i.fazenda_id)).toEqual(['faz-a', 'faz-b']);
    expect(screen.getByTestId('fazenda-0').textContent).toBe('Faz. Boa Vista');
    expect(screen.getByTestId('vencimento-1').textContent).toBe('18/12/2026');
    expect(screen.getByTestId('acontece-resumo-1').textContent).toBe('cria a previsão');
    expect(screen.getByTestId('prever-fgts').textContent).toBe('Prever FGTS (2)');
    fireEvent.click(screen.getByTestId('prever-fgts'));
    await waitFor(() => expect(resumo.prever.mock.calls[1]?.[3]).toBe(false));
    await waitFor(() => expect(screen.getByTestId('estado-do-resumo').textContent).toBe('✓ 2 previsões criadas'));
    await waitFor(() => expect(within(doResumo() ?? linha).getByTestId('no-sistema').textContent).toMatch(/^feito/));
  });

  it('empresa sem fazenda (CAEPF fora do cadastro): a linha diz "sem fazenda" e o Prever apaga com o motivo', async () => {
    const resumo = resumoApi(true);
    const linha = await abrir(resumo);
    fireEvent.click(within(linha).getByTestId('acao-abrir_resumo'));
    await waitFor(() => expect(screen.getByTestId('acontece-resumo-1').textContent).toBe('sem fazenda'));
    expect(resumo.prever.mock.calls[0][2][1].fazenda_id).toBeUndefined();
    expect(screen.getByTestId('prever-fgts')).toBeDisabled();
    expect(screen.getByTestId('frase-do-resumo').textContent).toMatch(/^1 empresa sem fazenda ou sem molde/);
  });

  it('o leitor de verdade: o "Extrato Mensal" vira o tipo resumo (não "sem linha digitável")', async () => {
    const linhas = [['Empresa:', '10 - FULANO FICTICIO FAZ BOA VISTA', 'Página:', '1/1'], ['CAEPF:', '111.222.333/001-44', 'Emissão:', '17/11/2026'],
      ['Cálculo:', '13o Adiantamento'], ['Competência:', '11/2026'], ['EXTRATO MENSAL'],
      ['Empr.:', '1 PESSOA UM', 'Situação:', 'Trabalhando'], ['ND:', '0', 'Proventos:', '1.000,00', 'Líquido:', '1.000,00'],
      ['NF:', '0', 'Base FGTS:', '1.000,00', 'Valor FGTS:', '80,00'], ['Salário contribuição contribuintes:', '0,00', 'Valor do FGTS:', '80,00']];
    const pdfjs: PdfjsMinimo = {
      getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({
        getViewport: () => ({ width: 595, height: 842 }),
        getTextContent: async () => ({ items: linhas.flatMap((cs, l) => cs.map((str, c) => ({ str, transform: [10, 0, 0, 10, 20 + c * 130, 800 - l * 14], width: 100, height: 10 }))) }),
      }) }) }),
    };
    const r = await lerDaCaixaCom(pdfjs)(new TextEncoder().encode('%PDF falso').buffer, 'pdf');
    expect(r.k).toBe('resumo');
    if (r.k !== 'resumo') return;
    expect(r.resumo.empresas[0]).toMatchObject({ cei: '11122233300144', fgts: 80, confere: true });
  });
});
