/**
 * UI-ARRASTAR-ARQUIVO-01b — o que MUDOU no extrato do saldo, no boleto por parcela e no "Importar Banco": os três passaram a
 * aceitar ARRASTAR (pelo dono do gesto), a recusa fica escrita na área / na linha, e a linha da parcela pergunta antes de
 * substituir. O que NÃO mudou está na caracterização (`arquivoCaracterizacao01b.test.tsx`) e nos três testes do Importar Banco.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const B = vi.hoisted(() => ({
  anexar: vi.fn(async (_p: { clienteId: string; contaId: string; anoMes: string; file: File }) => ({ ok: true, erro: null as string | null })),
  recarregar: vi.fn(async () => {}),
  toastErro: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => {
  const vazio = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in', 'or', 'range', 'limit', 'neq', 'filter', 'match']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return { supabase: { from: () => vazio(), rpc: async () => ({ data: [], error: null }), storage: { from: vi.fn() } } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'nj' } }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ inscreverEmLancamentos: () => () => {}, notificarLancamentosMudaram: () => {} }));
vi.mock('@/hooks/useExtratoDaConta', async (orig) => {
  const real = await orig<typeof import('@/hooks/useExtratoDaConta')>();
  return {
    ...real,
    anexarSaldoDocumento: B.anexar,
    useSaldoDeclaradoOfx: () => ({ ofx: null, loading: false }),
    useSaldoDocumentos: () => ({ documentos: [], recarregar: B.recarregar }),
    useExtratoFimDoMes: () => null,
  };
});
vi.mock('@/v2/pages/V2ImportLancamentosExcel', () => ({ V2ImportLancamentosExcel: () => <div data-testid="fluxo-excel" /> }));
vi.mock('@/v2/pages/CusteioTxtImportTab', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: B.toastErro, info: vi.fn() } }));

import { SaldoRealDialog } from './SaldoRealDialog';
import { ImportarBancoInline } from './ImportarBancoInline';
import { ParcelasDaCompra } from '@/components/financeiro-v2/ParcelasDaCompra';
import { novoPendente } from '@/lib/financeiro/documentosPendentes';

const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });
const txt = () => new File(['x'], 'nota.txt', { type: 'text/plain' });
const comArquivos = (arquivos: File[]) => ({ dataTransfer: { files: arquivos, types: ['Files'] } });
const soltar = (alvo: Element, arquivos: File[]) => fireEvent.drop(alvo, comArquivos(arquivos));

function lerComo<T>(blob: Blob, modo: 'buffer' | 'texto', vazio: T): Promise<T> {
  return new Promise((ok) => {
    const r = new FileReader();
    r.onload = () => {
      const v = r.result;
      if (modo === 'buffer' && v instanceof ArrayBuffer) ok(v as unknown as T);
      else if (modo === 'texto' && typeof v === 'string') ok(v as unknown as T);
      else ok(vazio);
    };
    if (modo === 'buffer') r.readAsArrayBuffer(blob); else r.readAsText(blob);
  });
}
beforeEach(() => {
  B.anexar.mockReset(); B.anexar.mockImplementation(async () => ({ ok: true, erro: null }));
  B.recarregar.mockClear(); B.toastErro.mockClear();
  Element.prototype.scrollIntoView = () => {};
  if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function (this: Blob) { return lerComo(this, 'buffer', new ArrayBuffer(0)); };
  if (!Blob.prototype.text) Blob.prototype.text = function (this: Blob) { return lerComo(this, 'texto', ''); };
});

/* ═══ EXTRATO DO SALDO ══════════════════════════════════════════════════════════════════════════════════════════════ */
function montarLapis() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>
    <SaldoRealDialog clienteId="nj" contaId="conta-1" contaNome="Sicredi Lavoura" ano={2026} mes={9}
      saldoAtual={100} saldoDataAtual="2026-09-30" aoFechar={() => {}} aoSalvar={() => {}} />
  </QueryClientProvider>);
  return screen.getByTestId('area-extrato-do-saldo');
}
describe('extrato do saldo — clicar OU arrastar, na mesma linha de 24px', () => {
  it('a área convida, tem 24px e diz os tipos e o limite da regra', () => {
    const area = montarLapis();
    expect(area.textContent).toBe('Clique ou arraste o extrato · PDF, imagem ou XML · até 10 MB');
    expect(area.className).toContain('h-6');
  });
  it('SOLTAR grava na hora, como o botão gravava: uma chamada, com cliente, conta, mês e o arquivo', async () => {
    const area = montarLapis();
    const arquivo = pdf('extrato-set26.pdf');
    soltar(area, [arquivo]);
    await waitFor(() => expect(B.anexar).toHaveBeenCalledTimes(1));
    expect(B.anexar).toHaveBeenCalledWith({ clienteId: 'nj', contaId: 'conta-1', anoMes: '2026-09', file: arquivo });
    await waitFor(() => expect(B.recarregar).toHaveBeenCalledTimes(1));
  });
  it('tipo errado: a frase NA ÁREA, nada é gravado, nenhum toast', () => {
    const area = montarLapis();
    soltar(area, [txt()]);
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Formato não aceito. Envie PDF, JPG, PNG ou XML.');
    expect(B.anexar).not.toHaveBeenCalled();
    expect(B.toastErro).not.toHaveBeenCalled();
  });
  it('o banco recusou o anexo: a frase dele aparece NA ÁREA, não em toast', async () => {
    B.anexar.mockImplementation(async () => ({ ok: false, erro: 'new row violates row-level security policy' }));
    const area = montarLapis();
    soltar(area, [pdf('e.pdf')]);
    await waitFor(() => expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('new row violates row-level security policy'));
    expect(B.toastErro).not.toHaveBeenCalled();
  });
  it('enquanto anexa, a área fica apagada com o motivo e não aceita outro arquivo', async () => {
    let soltarPromessa: (v: { ok: boolean; erro: string | null }) => void = () => {};
    B.anexar.mockImplementation(() => new Promise((ok) => { soltarPromessa = ok; }));
    const area = montarLapis();
    soltar(area, [pdf('a.pdf')]);
    await waitFor(() => expect(area.getAttribute('aria-disabled')).toBe('true'));
    expect(screen.getByTestId('area-de-arquivo-motivo').textContent).toBe('Anexando o extrato…');
    soltar(area, [pdf('b.pdf')]);
    expect(B.anexar).toHaveBeenCalledTimes(1);
    soltarPromessa({ ok: true, erro: null });
    await waitFor(() => expect(area.getAttribute('aria-disabled')).toBeNull());
  });
});

/* ═══ BOLETO POR PARCELA ════════════════════════════════════════════════════════════════════════════════════════════ */
const PREVIA = [1, 2, 3].map(n => ({ numero: n, dataVencimento: `2026-1${n}-05`, valor: 100 }));
function montarParcelas(p: { comBoletoNa2?: boolean; travado?: boolean } = {}) {
  const onBoleto = vi.fn(); const onTirar = vi.fn();
  const antigo = novoPendente({ especie: 'boleto' }, pdf('boleto-antigo.pdf'), 2);
  render(<ParcelasDaCompra parcelas={PREVIA} notaFiscal={null} qtdNotas={0} boletos={p.comBoletoNa2 ? [antigo] : []} foraDoPlano={[]}
    onBoleto={onBoleto} onTirarBoleto={onTirar} onAnexarVarios={vi.fn()} travado={p.travado} />);
  const linhas = screen.getAllByTestId('linha-parcela');
  const celula = (i: number) => within(linhas[i]).getByTestId('boleto-da-parcela');
  return { onBoleto, onTirar, linhas, celula, antigo };
}
describe('boleto por parcela — a LINHA inteira é alvo de soltar', () => {
  it('arquivo por cima realça a linha em verde; sair apaga; a linha continua com a mesma altura declarada', () => {
    const { linhas } = montarParcelas();
    fireEvent.dragEnter(linhas[1], comArquivos([]));
    expect(linhas[1].getAttribute('data-sobre')).toBe('sim');
    expect(linhas[1].className).toContain('bg-success/20');
    expect(linhas[0].getAttribute('data-sobre')).toBeNull();
    /* nenhuma célula mudou de classe de altura */
    for (const td of linhas[1].querySelectorAll('td')) expect(td.className).toContain('h-[18px]');
    fireEvent.dragLeave(linhas[1], comArquivos([]));
    expect(linhas[1].getAttribute('data-sobre')).toBeNull();
  });
  it('soltar em parcela SEM boleto guarda o arquivo naquela parcela, sem perguntar', () => {
    const { onBoleto, onTirar, linhas } = montarParcelas();
    const arquivo = pdf('boleto-3.pdf');
    soltar(linhas[2], [arquivo]);
    expect(screen.queryByTestId('substituir-boleto')).toBeNull();
    expect(onBoleto).toHaveBeenCalledTimes(1);
    expect(onBoleto.mock.calls[0]).toEqual([3, arquivo]);
    expect(onTirar).not.toHaveBeenCalled();
  });
  it('soltar em parcela que JÁ tem boleto pergunta NA LINHA; "Sim" tira o antigo e guarda o novo, uma vez', () => {
    const { onBoleto, onTirar, linhas, celula, antigo } = montarParcelas({ comBoletoNa2: true });
    const novo = pdf('boleto-novo.pdf');
    soltar(linhas[1], [novo]);
    expect(onBoleto).not.toHaveBeenCalled();
    expect(celula(1).textContent).toBe('Substituir o boleto?SimNão');
    expect(celula(1).getAttribute('title')).toBe('Substituir "boleto-antigo.pdf" por "boleto-novo.pdf"?');
    expect(celula(1).className).toContain('h-[18px]');
    fireEvent.click(screen.getByTestId('substituir-sim'));
    expect(onTirar).toHaveBeenCalledTimes(1);
    expect(onTirar).toHaveBeenCalledWith(antigo.chave);
    expect(onBoleto).toHaveBeenCalledTimes(1);
    expect(onBoleto.mock.calls[0]).toEqual([2, novo]);
    expect(screen.queryByTestId('substituir-boleto')).toBeNull();
  });
  it('"Não" desfaz a pergunta e não mexe em nada; Esc também, sem deixar a tecla seguir (o modal não fecha)', () => {
    const { onBoleto, onTirar, linhas, celula } = montarParcelas({ comBoletoNa2: true });
    soltar(linhas[1], [pdf('novo.pdf')]);
    fireEvent.click(screen.getByTestId('substituir-nao'));
    expect(screen.queryByTestId('substituir-boleto')).toBeNull();
    expect(celula(1).textContent).toContain('boleto-antigo.pdf');

    soltar(linhas[1], [pdf('novo.pdf')]);
    const chegouAoDocumento = vi.fn();
    document.addEventListener('keydown', chegouAoDocumento);
    try {
      const naoPrevenido = fireEvent.keyDown(celula(1), { key: 'Escape' });
      expect(naoPrevenido).toBe(false);
      expect(chegouAoDocumento).not.toHaveBeenCalled();
      expect(screen.queryByTestId('substituir-boleto')).toBeNull();
      /* a busca sabe achar: sem pergunta na tela, o Esc segue o caminho dele */
      fireEvent.keyDown(celula(1), { key: 'Escape' });
      expect(chegouAoDocumento).toHaveBeenCalledTimes(1);
    } finally { document.removeEventListener('keydown', chegouAoDocumento); }
    expect(onBoleto).not.toHaveBeenCalled();
    expect(onTirar).not.toHaveBeenCalled();
  });
  it('a tela mostra o que grava: XML solto (ou escolhido) na parcela é recusado NA CÉLULA — boleto é PDF, JPG ou PNG', () => {
    const { onBoleto, linhas, celula } = montarParcelas();
    soltar(linhas[0], [new File(['<x/>'], 'nota.xml', { type: 'text/xml' })]);
    expect(celula(0).textContent).toBe('Formato não aceito. Envie PDF, JPG ou PNG.');
    expect(celula(0).getAttribute('title')).toBe('Formato não aceito. Envie PDF, JPG ou PNG.');
    fireEvent.click(screen.getByTestId('mais-boleto-2'));
    fireEvent.change(screen.getByTestId('input-boleto-linha'), { target: { files: [new File(['<x/>'], 'nota.xml', { type: '' })] } });
    expect(celula(1).textContent).toBe('Formato não aceito. Envie PDF, JPG ou PNG.');
    expect(onBoleto).not.toHaveBeenCalled();
    /* soltar um arquivo bom na linha recusada limpa a frase */
    soltar(linhas[0], [pdf('ok.pdf')]);
    expect(onBoleto).toHaveBeenCalledTimes(1);
  });
  it('dois arquivos numa linha: "Solte um arquivo só."; travado (depois do salvar): não realça nem aceita', () => {
    const a = montarParcelas();
    soltar(a.linhas[0], [pdf('a.pdf'), pdf('b.pdf')]);
    expect(a.celula(0).textContent).toBe('Solte um arquivo só.');
    expect(a.onBoleto).not.toHaveBeenCalled();
  });
  it('travado: a linha não realça nem aceita', () => {
    const { onBoleto, linhas } = montarParcelas({ travado: true });
    fireEvent.dragEnter(linhas[0], comArquivos([]));
    expect(linhas[0].getAttribute('data-sobre')).toBeNull();
    soltar(linhas[0], [pdf('a.pdf')]);
    expect(onBoleto).not.toHaveBeenCalled();
  });
});

/* ═══ IMPORTAR BANCO ════════════════════════════════════════════════════════════════════════════════════════════════ */
const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260929<TRNAMT>0.13<FITID>3709291<MEMO>RENTAB.INVEST FACILCRED*</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const montarBanco = (contaId: string) => {
  render(<ImportarBancoInline contas={[{ id: 'bradesco', label: 'Bradesco' }]} contaId={contaId} onContaChange={() => {}} />);
  return screen.getByTestId('area-importar-banco');
};
describe('Importar Banco — a área no lugar do botão, nos mesmos 28px', () => {
  it('com conta: convida numa linha curta (os formatos estão nas pílulas) e tem 28px', () => {
    const area = montarBanco('bradesco');
    expect(area.textContent).toBe('Clique ou arraste o arquivo');
    expect(area.className).toContain('h-7');
    expect((area.querySelector('input[type="file"]') as HTMLInputElement).accept).toContain('.ofx');
  });
  it('sem conta: apagada, com "Escolha a conta primeiro", e soltar não lê nada', () => {
    const area = montarBanco('');
    expect(area.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('area-de-arquivo-motivo').textContent).toBe('Escolha a conta primeiro');
    soltar(area, [new File([OFX], 'set26.ofx', { type: '' })]);
    expect(screen.queryByRole('button', { name: /^Importar \d+/ })).toBeNull();
  });
  it('OFX SOLTO, sem tipo (o navegador quase nunca o informa): passa pelo dono pela extensão e a prévia abre', async () => {
    const area = montarBanco('bradesco');
    soltar(area, [new File([OFX], 'set26.ofx', { type: '' })]);
    expect(await screen.findByRole('button', { name: /^Importar \d+/ })).toBeTruthy();
    expect(B.toastErro).not.toHaveBeenCalled();
  });
  it('DUAS CAMADAS — o dono deixa o `.ofx` passar e o DETECTOR recusa pelo conteúdo: a frase dele NA ÁREA, sem toast', async () => {
    const area = montarBanco('bradesco');
    soltar(area, [new File(['isto nao e um extrato'], 'falso.ofx', { type: 'text/plain' })]);
    const FRASE = 'O arquivo tem extensão .ofx, mas não contém as marcações de um extrato OFX. Confira se é o arquivo certo do banco.';
    /* a área (232px) diz só o curto; a frase INTEIRA do detector vai para a direita da linha, em tom de recusa, numa linha */
    await waitFor(() => expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Arquivo recusado'));
    const aoLado = screen.getByTestId('recusa-do-arquivo');
    expect(aoLado.textContent).toBe(FRASE);
    expect(aoLado.getAttribute('title')).toBe(FRASE);
    expect(aoLado.getAttribute('role')).toBe('alert');
    for (const c of ['truncate', 'text-destructive']) expect(aoLado.className).toContain(c);
    expect(aoLado.parentElement).toBe(area.parentElement);
    expect(B.toastErro).not.toHaveBeenCalled();
    /* escolher um arquivo bom depois limpa a frase e abre a prévia */
    soltar(area, [new File([OFX], 'set26.ofx', { type: 'application/x-ofx' })]);
    expect(await screen.findByRole('button', { name: /^Importar \d+/ })).toBeTruthy();
    expect(screen.queryByTestId('recusa-do-arquivo')).toBeNull();
  });
  it('tipo que o dono não aceita (PDF): recusado na área ANTES do detector', () => {
    const area = montarBanco('bradesco');
    soltar(area, [pdf('extrato.pdf')]);
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Formato não aceito. Envie OFX, XLSX, XLS, CSV ou TXT.');
  });
  it('planilha solta sem tipo: vai ao fluxo do Excel', async () => {
    const area = montarBanco('bradesco');
    soltar(area, [new File(['PK'], 'lancamentos.xlsx', { type: 'application/octet-stream' })]);
    expect(await screen.findByTestId('fluxo-excel')).toBeTruthy();
  });
});
