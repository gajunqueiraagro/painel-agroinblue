/**
 * DANFE-SOB-DEMANDA-01 (Gabriel 23/11: "onde houver XML da NF, o clipe SEMPRE mostra PDF · DANFE; gera do XML guardado e abre no visualizador,
 * sem gravar PDF em massa") — dados SINTÉTICOS.
 *   D1 a regra pura: NF com chave de 44 e sem PDF = sob demanda; com PDF, ou sem chave, ou não-NF, não
 *   D2 a NF SEM arquivo nenhum (o XML só na Receita): o DANFE é gerado do XML da Receita pelo MESMO gerador (`danfePdfDoXml`) e abre no
 *      visualizador; nada é gravado (nenhuma escrita no banco)
 *   D3 sem XML em lugar nenhum: a frase, e o visualizador não abre
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const espia = vi.hoisted(() => ({ erro: vi.fn(), ler: vi.fn(), gerar: vi.fn(), receita: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: espia.erro } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('@/lib/financeiro/documentosDoClipe', async (orig) => ({ ...(await orig<object>()), lerLinhasDoClipe: espia.ler }));
vi.mock('@/lib/fiscal/danfePdf', () => ({ danfePdfDoXml: espia.gerar }));
vi.mock('@/lib/fiscal/danfeDasNotasGuardadas', () => ({ xmlDaCaixaDaReceita: espia.receita }));
vi.mock('@/components/financeiro-v2/VisualizadorDeDocumento', () => ({
  VisualizadorDeDocumento: ({ nome }: { nome: string }) => <div data-testid="visualizador">{nome}</div> }));

import { ClipeDaLinha } from '@/components/financeiro-v2/ClipeDaLinha';
import { chaveDoDanfeSobDemanda, linhasDosDocumentos } from '@/lib/financeiro/notaDosDocumentos';
import type { LancDocumento } from '@/hooks/useLancamentoDocumentos';

const CHAVE = '50261106057223030240553000003371071561590540';
const DOC = (extra: Partial<LancDocumento>): LancDocumento => ({ id: 'd1', origem: 'lancamento', operacaoId: null, especie: 'nf', especieOC: null,
  nome: 'NF 337107 (XML da Receita)', numero: '337107', serie: '300', chaveAcesso: CHAVE, dataEmissao: '2026-11-18', valorDocumento: 10, url: null,
  tipo: 'application/xml', tamanhoBytes: null, observacao: null, emitenteId: null, emitenteNome: null, emitenteDocumento: null, cancelado: false,
  canceladoMotivo: null, versao: 1, ligadoAQtd: 1, ...extra });

beforeEach(() => { espia.erro.mockReset(); espia.ler.mockReset(); espia.gerar.mockReset(); espia.receita.mockReset(); });
const monta = () => render(<ClipeDaLinha clienteId="cli" lancamentoId="lanc-1" qtd={1} resumo="NF 337.107" />);

describe('DANFE-SOB-DEMANDA-01', () => {
  it('D1 a regra pura', () => {
    expect(chaveDoDanfeSobDemanda(linhasDosDocumentos([DOC({})])[0])).toBe(CHAVE);
    expect(chaveDoDanfeSobDemanda(linhasDosDocumentos([DOC({ url: 'a.xml' }), DOC({ id: 'p', nome: 'nf.pdf', tipo: 'application/pdf', url: 'a.pdf' })])[0])).toBeNull();
    expect(chaveDoDanfeSobDemanda(linhasDosDocumentos([DOC({ chaveAcesso: null })])[0])).toBeNull();
    expect(chaveDoDanfeSobDemanda(linhasDosDocumentos([DOC({ especie: 'recibo' })])[0])).toBeNull();
  });
  it('D2 sem arquivo: gera do XML da Receita pelo mesmo gerador e abre no visualizador', async () => {
    espia.ler.mockResolvedValue({ ok: true, valor: linhasDosDocumentos([DOC({})]) });
    espia.receita.mockResolvedValue(new TextEncoder().encode('<nfeProc/>').buffer);
    espia.gerar.mockResolvedValue({ ok: true, pdf: new File(['%PDF'], `NFe${CHAVE}-DANFE.pdf`, { type: 'application/pdf' }) });
    monta();
    fireEvent.click(screen.getByTestId('clipe-da-linha'));
    const pop = await screen.findByTestId('clipe-popover');
    fireEvent.click(within(pop).getAllByTestId('clipe-documento')[0]);
    expect((await screen.findByTestId('visualizador')).textContent).toBe(`NFe${CHAVE}-DANFE.pdf`);
    expect(espia.receita).toHaveBeenCalledWith('cli', CHAVE);
    expect(espia.gerar.mock.calls[0][0].name).toBe(`NFe${CHAVE}.xml`);
    /* o MESMO gerador do DANFE-LAYOUT-02: o clipe importa o `danfePdfDoXml` da `danfePdf` (que usa o foreignObjectRendering) */
    expect(readFileSync(join(__dirname, 'ClipeDaLinha.tsx'), 'utf8')).toMatch(/import \{ danfePdfDoXml \} from '@\/lib\/fiscal\/danfePdf';/);
  });
  it('D3 sem XML em lugar nenhum: a frase, e nada abre', async () => {
    espia.ler.mockResolvedValue({ ok: true, valor: linhasDosDocumentos([DOC({})]) });
    espia.receita.mockResolvedValue(null);
    monta();
    fireEvent.click(screen.getByTestId('clipe-da-linha'));
    const pop = await screen.findByTestId('clipe-popover');
    fireEvent.click(within(pop).getAllByTestId('clipe-documento')[0]);
    await waitFor(() => expect(espia.erro).toHaveBeenCalledWith(expect.stringMatching(/não tem o XML guardado/)));
    expect(espia.gerar).not.toHaveBeenCalled();
    expect(screen.queryByTestId('visualizador')).toBeNull();
  });
});
