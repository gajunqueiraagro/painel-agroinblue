/**
 * DOC-ANEXO-E-IMPORT-01 F2 — o clipe da lista abre o documento SEM o modal (mock `ui-validar/doc-anexo-mock.html` D1, Gabriel 05/11 17:41):
 * 1 documento abre direto; 2+ mostram o número e o popover (selo do tipo · nome · data dd/mm/aa), lido no clique ("Carregando…", "sem
 * documento", a frase do erro); o clique não chega à linha; sem duplo clique. E as regras puras: o selo (D3) e a contagem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
const fontes = vi.hoisted(() => ({
  ler: vi.fn(),
  assinar: vi.fn(async (c: string, _o?: string) => `https://assinado/${c}`),
}));
vi.mock('@/lib/financeiro/documentosDoClipe', async (orig) => ({ ...(await orig<object>()), lerLinhasDoClipe: fontes.ler }));
vi.mock('@/hooks/useLancamentoDocumentos', async (orig) => ({ ...(await orig<object>()), assinarDocumento: fontes.assinar }));
vi.mock('@/components/financeiro-v2/ItensDaNotaDialog', () => ({ ItensDaNotaDialog: ({ chave }: { chave: string }) => <div data-testid="itens-da-nota">{chave}</div> }));

import { ClipeDaLinha } from '@/components/financeiro-v2/ClipeDaLinha';
import { SeloDoTipo } from '@/components/financeiro-v2/SeloDoTipo';
import { tipoDoSelo, ROTULO_DO_SELO, TIPOS_DO_SELO } from '@/lib/financeiro/tipoDoDocumento';
import { FRASE_CLIPE_NAO_LEU } from '@/lib/financeiro/documentosDoClipe';
import { linhasDosDocumentos, quantasLinhasDoClipe } from '@/lib/financeiro/notaDosDocumentos';
import type { LancDocumento } from '@/hooks/useLancamentoDocumentos';

const DOC = (extra: Partial<LancDocumento>): LancDocumento => ({ id: 'd1', origem: 'lancamento', operacaoId: null, especie: 'recibo', especieOC: null,
  nome: 'Recibo contador set-2026.pdf', numero: null, serie: null, chaveAcesso: null, dataEmissao: '2026-09-18', valorDocumento: 10, url: 'cli/l/d1.pdf',
  tipo: 'application/pdf', tamanhoBytes: 1, observacao: null, emitenteId: null, emitenteNome: null, emitenteDocumento: null, cancelado: false,
  canceladoMotivo: null, versao: 1, ligadoAQtd: 1, ...extra });
const GUIA = DOC({ id: 'g', especie: 'outro', especieOC: 'guia', origem: 'operacao', nome: 'DARF INSS ago-2026.pdf', dataEmissao: '2026-09-11', url: 'cli/op/g.pdf' });
const COMP = DOC({ id: 'c', especie: 'comprovante', nome: 'Comprovante Itaú 18-09.pdf', url: 'cli/l/c.pdf' });
const REC = DOC({ id: 'r' });
const linhas = (...d: LancDocumento[]) => linhasDosDocumentos(d);

let abriu: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fontes.ler.mockReset(); fontes.assinar.mockClear();
  abriu = vi.fn(); window.open = abriu;
});
function monta(qtd: number) {
  const linha = { click: vi.fn(), dbl: vi.fn() };
  render(<table><tbody><tr onClick={linha.click} onDoubleClick={linha.dbl}><td>
    <ClipeDaLinha clienteId="cli" lancamentoId="lanc-1" qtd={qtd} resumo="1 recibo" />
  </td></tr></tbody></table>);
  return linha;
}
const clipe = () => screen.getByTestId('clipe-da-linha');

describe('F2 — o clipe da lista', () => {
  it('1 documento: o clique abre o arquivo (a URL assinada, no bucket da origem) numa aba nova — sem popover, sem abrir a linha', async () => {
    fontes.ler.mockResolvedValue({ ok: true, valor: linhas(REC) });
    const linha = monta(1);
    expect(screen.queryByTestId('clipe-numero')).toBeNull();
    fireEvent.click(clipe());
    await waitFor(() => expect(abriu).toHaveBeenCalledWith('https://assinado/cli/l/d1.pdf', '_blank', 'noopener'));
    expect(fontes.assinar).toHaveBeenCalledWith('cli/l/d1.pdf', 'lancamento');
    expect(fontes.ler).toHaveBeenCalledWith('cli', 'lanc-1');
    expect(screen.queryByTestId('clipe-popover')).toBeNull();
    expect(linha.click).not.toHaveBeenCalled();
  });
  it('3 documentos: o número no clipe; o popover diz "Carregando…" e depois "3 documentos · clique para abrir", o SELO primeiro, nome e data dd/mm/aa', async () => {
    let soltar: (v: unknown) => void = () => {};
    fontes.ler.mockImplementation(() => new Promise((ok) => { soltar = ok; }));
    const linha = monta(3);
    expect(screen.getByTestId('clipe-numero').textContent).toBe('3');
    fireEvent.click(clipe());
    expect(await screen.findByTestId('clipe-carregando')).toBeTruthy();
    soltar({ ok: true, valor: linhas(GUIA, COMP, REC) });
    expect((await screen.findByTestId('clipe-titulo')).textContent).toBe('3 documentos · clique para abrir');
    const docs = screen.getAllByTestId('clipe-documento');
    expect(docs.map((d) => [...d.children].map((c) => c.textContent))).toEqual([
      ['Guia de imposto', 'DARF INSS ago-2026.pdf', '11/09/2026'], ['Comprovante', 'Comprovante Itaú 18-09.pdf', '18/09/2026'], ['Recibo', 'Recibo contador set-2026.pdf', '18/09/2026']]);
    expect(docs[0].children[0].firstElementChild?.getAttribute('data-testid')).toBe('selo-do-tipo');
    /* a linha é de TABELA: o nome corta com "…" e o inteiro fica no `title` da célula (a regra de corte) */
    expect(docs[0].tagName).toBe('TR');
    expect(docs[0].children[1].getAttribute('title')).toBe('DARF INSS ago-2026.pdf');
    fireEvent.click(docs[0]);
    await waitFor(() => expect(abriu).toHaveBeenCalledWith('https://assinado/cli/op/g.pdf', '_blank', 'noopener'));
    expect(fontes.assinar).toHaveBeenCalledWith('cli/op/g.pdf', 'operacao');
    expect(linha.click).not.toHaveBeenCalled();
  });
  it('a linha SEM arquivo não abre nem fecha o popover (o title diz "sem arquivo anexado"); a de arquivo abre pelo Enter', async () => {
    fontes.ler.mockResolvedValue({ ok: true, valor: linhas(DOC({ id: 's', nome: 'Recibo sem arquivo.pdf', url: null }), COMP) });
    monta(2);
    fireEvent.click(clipe());
    const docs = await screen.findAllByTestId('clipe-documento');
    expect(docs[0].children[1].getAttribute('title')).toBe('Recibo sem arquivo.pdf · sem arquivo anexado');
    fireEvent.click(docs[0]);
    expect(screen.getByTestId('clipe-popover')).toBeTruthy();
    fireEvent.keyDown(docs[1], { key: 'Enter' });
    await waitFor(() => expect(abriu).toHaveBeenCalledWith('https://assinado/cli/l/c.pdf', '_blank', 'noopener'));
    expect(abriu).toHaveBeenCalledTimes(1);
  });
  it('a contagem velha: o clipe diz 2 e o banco não tem mais nada → "sem documento" (nunca um popover vazio)', async () => {
    fontes.ler.mockResolvedValue({ ok: true, valor: [] });
    monta(2);
    fireEvent.click(clipe());
    expect((await screen.findByTestId('clipe-sem-documento')).textContent).toBe('sem documento');
    expect(abriu).not.toHaveBeenCalled();
  });
  it('a leitura falha: a frase e "Tentar de novo" (nunca lista vazia); tentar de novo lê outra vez', async () => {
    fontes.ler.mockResolvedValueOnce({ ok: false, motivo: FRASE_CLIPE_NAO_LEU }).mockResolvedValueOnce({ ok: true, valor: linhas(COMP, REC) });
    monta(2);
    fireEvent.click(clipe());
    const erro = await screen.findByTestId('clipe-erro');
    expect(erro.textContent).toContain(FRASE_CLIPE_NAO_LEU);
    fireEvent.click(within(erro).getByRole('button', { name: 'Tentar de novo' }));
    expect((await screen.findByTestId('clipe-titulo')).textContent).toBe('2 documentos · clique para abrir');
  });
  it('sem duplo clique: dois cliques na leitura = UMA leitura e UMA aba; o duplo clique não chega à linha', async () => {
    let soltar: (v: unknown) => void = () => {};
    fontes.ler.mockImplementation(() => new Promise((ok) => { soltar = ok; }));
    const linha = monta(1);
    fireEvent.click(clipe());
    fireEvent.click(clipe());
    fireEvent.doubleClick(clipe());
    soltar({ ok: true, valor: linhas(REC) });
    await waitFor(() => expect(abriu).toHaveBeenCalledTimes(1));
    expect(fontes.ler).toHaveBeenCalledTimes(1);
    expect([linha.click.mock.calls.length, linha.dbl.mock.calls.length]).toEqual([0, 0]);
  });
  it('a nota só em XML abre os ITENS (o XML nunca abre cru); o PDF + XML da mesma nota é UMA linha e abre o PDF', async () => {
    const XML = DOC({ id: 'x', especie: 'nf', numero: '518', nome: 'nf 518.xml', tipo: 'application/xml', url: 'cli/l/x.xml', chaveAcesso: '5026 0911 2223 3300 0424 5500 1000 0005 1812 1753 8290' });
    fontes.ler.mockResolvedValue({ ok: true, valor: linhas(XML) });
    monta(1);
    fireEvent.click(clipe());
    expect((await screen.findByTestId('itens-da-nota')).textContent).toBe('50260911222333000424550010000005181217538290');
    expect(abriu).not.toHaveBeenCalled();
    const PDF = DOC({ ...XML, id: 'p', nome: 'nf 518.pdf', tipo: 'application/pdf', url: 'cli/l/p.pdf' });
    expect(quantasLinhasDoClipe([XML, PDF].map((d) => ({ especie: d.especie, numero: d.numero, chave_acesso: d.chaveAcesso, nome: d.nome, tipo: d.tipo })))).toBe(1);
  });
  it('sem documento: "—" no lugar do clipe', () => {
    monta(0);
    expect(screen.queryByTestId('clipe-da-linha')).toBeNull();
    expect(screen.getByTestId('clipe-vazio').textContent).toBe('—');
  });
});

describe('F2 — as regras puras', () => {
  it('D3: os 8 selos, na ordem do mock, e o tipo de cada documento (a NF com chave de 50 dígitos é NFS-e; as NF da OC são NF)', () => {
    expect(TIPOS_DO_SELO.map((t) => ROTULO_DO_SELO[t])).toEqual(['NF', 'NFS-e', 'Boleto', 'Guia de imposto', 'Recibo', 'Comprovante', 'Contrato', 'Outro']);
    expect([
      tipoDoSelo({ especie: 'nf', chaveAcesso: '5'.repeat(44) }), tipoDoSelo({ especie: 'nf', chaveAcesso: '5'.repeat(50) }),
      tipoDoSelo({ especie: 'outro', especieOC: 'nf_complementar' }), tipoDoSelo({ especie: 'outro', especieOC: 'guia' }),
      tipoDoSelo({ especie: 'boleto' }), tipoDoSelo({ especie: 'recibo' }), tipoDoSelo({ especie: 'comprovante' }), tipoDoSelo({ especie: 'nfse' }),
      tipoDoSelo({ especie: 'contrato' }), tipoDoSelo({ especie: 'outro', especieOC: 'gta' }), tipoDoSelo({ especie: null }),
    ]).toEqual(['nf', 'nfse', 'nf', 'guia', 'boleto', 'recibo', 'comprovante', 'nfse', 'contrato', 'outro', 'outro']);
  });
  it('o selo tem largura FIXA nos dois tamanhos (nada se desloca) e o rótulo inteiro no title', () => {
    render(<><SeloDoTipo tipo="nf" /><SeloDoTipo tipo="guia" /><SeloDoTipo tipo="recibo" tamanho="lista" /></>);
    const s = screen.getAllByTestId('selo-do-tipo');
    expect(s.map((x) => [x.textContent, x.getAttribute('title'), x.className.match(/w-\[\d+px\]/)?.[0]])).toEqual([
      ['NF', 'NF', 'w-[84px]'], ['Guia de imposto', 'Guia de imposto', 'w-[84px]'], ['Recibo', 'Recibo', 'w-[74px]']]);
  });
  it('a contagem do clipe = as linhas da aba: cancelado não conta; dois documentos diferentes = 2', () => {
    expect(quantasLinhasDoClipe([{ especie: 'recibo', numero: null }, { especie: 'boleto', numero: null }, { especie: 'nf', numero: '1', cancelado: true }])).toBe(2);
    expect(quantasLinhasDoClipe(null)).toBe(0);
  });
});
