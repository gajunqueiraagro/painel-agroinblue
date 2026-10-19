/**
 * FIN-NFE-PARCELAS-01 PR 2b — a parcela aberta (tela C): a NF da compra ligada às N parcelas, o boleto só
 * desta, a conferência pela compra e o erro do formulário ao lado do botão (sem toast).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const toastErro = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastErro(...a) } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { AbaDocumentosLancamento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { DocumentosPendentes } from '@/components/financeiro-v2/DocumentosPendentes';
import {
  daConfronto, type LancDocumento, type LancamentoDocumentosApi, type Confronto,
} from '@/hooks/useLancamentoDocumentos';
/* FORN-SELETOR-PADRAO-01 fatia 2a — o emitente lê do leitor único (de mentira no teste) */
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

const doc = (x: Partial<LancDocumento>): LancDocumento => ({
  id: 'd', origem: 'lancamento', operacaoId: null, especie: 'nf', especieOC: null, nome: 'nf', numero: null, serie: null,
  chaveAcesso: null, dataEmissao: null, valorDocumento: null, url: 'x.pdf', tipo: 'application/pdf', tamanhoBytes: 1,
  observacao: null, emitenteId: null, emitenteNome: null, emitenteDocumento: null, cancelado: false, canceladoMotivo: null,
  versao: 2, ligadoAQtd: 1, ...x,
});
const NF = doc({ id: 'nf', numero: '18112', valorDocumento: 24052, ligadoAQtd: 8 });
const BOLETO = doc({ id: 'bol', especie: 'boleto', ligadoAQtd: 1 });

function api(confronto: Confronto | null, cancelar = vi.fn().mockResolvedValue(true)): LancamentoDocumentosApi {
  return {
    documentos: [NF, BOLETO], confronto, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
    registrar: vi.fn(), editar: vi.fn().mockResolvedValue(true), cancelar, anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
  };
}
const monta = (a: LancamentoDocumentosApi, onAnexar?: () => void) => render(
  <MemoryRouter><AbaDocumentosLancamento api={a} clienteId="cli" onAnexarBoletosDasParcelas={onAnexar} /></MemoryRouter>);

describe('tela C — a NF da compra dentro de uma parcela', () => {
  it('selo "8 parcelas" na NF; a NF não tem cancelar no cartão; o boleto tem', () => {
    monta(api(null));
    expect(screen.getByTestId('selo-parcelas').textContent).toBe('8 parcelas');
    /* um cancelar só: o do boleto (a busca sabe achar o botão) */
    expect(screen.getAllByLabelText('Cancelar documento')).toHaveLength(1);
    expect(screen.getAllByLabelText('Editar documento')).toHaveLength(2);
  });

  it('o lápis da NF avisa que vale para as 8 e oferece "Cancelar nota", que exige motivo e cancela uma vez', async () => {
    const cancelar = vi.fn().mockResolvedValue(true);
    monta(api(null, cancelar));
    fireEvent.click(screen.getAllByLabelText('Editar documento')[0]);
    expect(screen.getByTestId('aviso-nota-compartilhada').textContent).toBe('Esta nota está em 8 parcelas; a alteração vale para todas.');
    fireEvent.click(screen.getByTestId('abrir-cancelar-nota'));
    fireEvent.click(screen.getByTestId('confirmar-cancelar-nota'));
    expect(screen.getByTestId('erro-form-documento').textContent).toBe('Informe o motivo do cancelamento da nota.');
    expect(cancelar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('A nota sai das 8 parcelas'), { target: { value: 'nota errada' } });
    fireEvent.click(screen.getByTestId('confirmar-cancelar-nota'));
    await waitFor(() => expect(cancelar).toHaveBeenCalledWith('nf', 'nota errada'));
  });

  it('o boleto (só desta parcela) abre sem o aviso e sem "Cancelar nota"', () => {
    monta(api(null));
    fireEvent.click(screen.getAllByLabelText('Editar documento')[1]);
    expect(screen.queryByTestId('aviso-nota-compartilhada')).toBeNull();
    expect(screen.queryByTestId('abrir-cancelar-nota')).toBeNull();
  });

  it('"Anexar boletos das parcelas" aparece só quando o lançamento é parcela', () => {
    const onAnexar = vi.fn();
    const { unmount } = monta(api(null), onAnexar);
    fireEvent.click(screen.getByTestId('anexar-boletos-parcelas'));
    expect(onAnexar).toHaveBeenCalled();
    unmount();
    monta(api(null));
    expect(screen.queryByTestId('anexar-boletos-parcelas')).toBeNull();
  });
});

describe('conferência pela compra (chaves grupo_* do banco)', () => {
  const COM_GRUPO = {
    valor_lancamento: 3006.5, valor_documentado: 24052, docs_ativos: 2, docs_com_valor: 1, diferenca: 3006.5, confere: false,
    grupo_valor_documento: 24052, grupo_soma_lancamentos: 21045.5, grupo_qtd: 7,
    fiscal: { total: 24052, qtd: 1, recibos: 0, base: 'grupo', base_valor: 21045.5, base_qtd: 7, diferenca: 3006.5, situacao: 'passa' },
    pagamentos: [], informativos: 0, repetidas: [],
  };

  it('com grupo_*, o topo mostra a nota da compra contra as parcelas ativas, e a diferença do banco (FIN-DOC-SOMA-01: a frase da faixa)', () => {
    const c = daConfronto(COM_GRUPO);
    expect(c?.grupo).toEqual({ valorDocumento: 24052, somaLancamentos: 21045.5, qtd: 7 });
    monta(api(c));
    expect(screen.getByTestId('faixa-fiscal').textContent?.replace(/\u00a0/g, ' ')).toBe('Nota fiscal R$ 24.052,00 · 7 parcelas ativas somam R$ 21.045,50passa R$ 3.006,50');
  });

  it('FIN-DOC-SOMA-01 — o front NÃO soma nada: o hook não tem mais a soma das duas origens (lido da fonte)', () => {
    const fonte = readFileSync(resolve(__dirname, '../../hooks/useLancamentoDocumentos.ts'), 'utf8');
    expect(fonte).not.toContain('confrontoDasDuasOrigens');
    expect(fonte).not.toMatch(/reduce\(\(acc, d\) => acc \+ \(d\.valorDocumento/);
    expect(fonte).toContain('setConfronto(daConfronto(conf.data));');
  });

  it('sem grupo_*, sem a chave grupo; a nota contra o lançamento', () => {
    const c = daConfronto({ valor_lancamento: 3006.5, valor_documentado: 3006.5, docs_ativos: 1, docs_com_valor: 1, diferenca: 0, confere: true,
      fiscal: { total: 3006.5, qtd: 1, recibos: 0, base: 'lancamento', base_valor: 3006.5, base_qtd: 1, diferenca: 0, situacao: 'fecha' } });
    expect(c).not.toHaveProperty('grupo');
    monta(api(c));
    expect(screen.getByTestId('faixa-fiscal').textContent?.replace(/\u00a0/g, ' ')).toBe('Nota fiscal R$ 3.006,50✓ confere com o lançamento');
  });
});

describe('UX-TOAST-01 — o formulário do documento não usa toast para recusa', () => {
  /* UI-ARRASTAR-ARQUIVO-01a — CONTRATO NOVO (Gabriel, 05/10): o tipo errado é recusado AO ESCOLHER, na própria área, pelo dono
     do aceite — não espera o "Adicionar à lista". A frase é a mesma; o toast continua proibido. */
  it('arquivo em formato errado é recusado NA ÁREA ao escolher, e nenhum toast.error', async () => {
    toastErro.mockClear();
    let lista: import('@/lib/financeiro/documentosPendentes').DocumentoPendente[] = [];
    render(<DocumentosPendentes pendentes={lista} onMudar={f => { lista = f(lista); }} clienteId="cli" />);
    fireEvent.click(screen.getByText('Adicionar documento'));
    const input = document.querySelector('input[type="file"]');
    if (!input) throw new Error('input de arquivo não achado');
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Formato não aceito. Envie PDF, JPG, PNG ou XML.'));
    expect(screen.queryByTestId('arquivo-escolhido')).toBeNull();
    expect(screen.queryByTestId('erro-form-documento')).toBeNull();
    expect(toastErro).not.toHaveBeenCalled();
  });

  it('a fonte não tem mais o toast da recusa do salvar (a linha :308 de antes)', () => {
    const fonte = readFileSync(resolve(__dirname, './AbaDocumentosLancamento.tsx'), 'utf8');
    expect(fonte).not.toContain("toast.error(e instanceof Error ? e.message : 'Falha ao salvar o documento.')");
    expect(fonte).toContain("setErroForm(e instanceof Error ? e.message : 'Falha ao salvar o documento.')");
  });
});
