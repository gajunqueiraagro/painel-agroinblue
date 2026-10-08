/**
 * FIN-NFE-PARCELAS-01 PR 2b-fix1 — homologação do Gabriel na aba Documentos do novo parcelado (29/09):
 * o documento NF nascia vazio com o Nº Documento do lançamento preenchido, a coluna "Nota fiscal" da grade
 * mostrava "—", e o nome do arquivo da NF-e quebrava em três linhas.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { DocumentosPendentes } from '@/components/financeiro-v2/DocumentosPendentes';
import { ParcelasDaCompra } from '@/components/financeiro-v2/ParcelasDaCompra';
import {
  novoPendente, partesDoNome, numeroDaNotaDaCompra, type DocumentoPendente,
} from '@/lib/financeiro/documentosPendentes';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
/* FORN-SELETOR-PADRAO-01 fatia 2a — o emitente lê do leitor único (de mentira no teste) */
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

const FORNECEDORES = [{ id: 'f-agro', nome: 'Agro Insumos' }, { id: 'f-outro', nome: 'Outro Fornecedor' }];
const SUGESTAO = { numero: '18112', dataEmissao: '2026-09-29', valor: 24052, emitenteId: 'f-agro' };
const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });

function monta(pendentes: DocumentoPendente[] = []) {
  definirFornecedoresDoLeitor(FORNECEDORES);
  let lista = pendentes;
  const r = render(<DocumentosPendentes pendentes={lista} onMudar={f => { lista = f(lista); }}
    clienteId="cli" ligadoA={8} sugestao={SUGESTAO} />);
  return { ...r, lista: () => lista };
}

describe('o documento novo nasce com o que o lançamento diz', () => {
  it('número, emissão, valor e emitente preenchidos, em âmbar, com a linha que diz de onde vieram', () => {
    monta();
    fireEvent.click(screen.getByText('Adicionar documento'));
    const numero = screen.getByTestId('doc-numero');
    if (!(numero instanceof HTMLInputElement)) throw new Error('campo Número não achado');
    expect(numero.value).toBe('18112');
    expect(numero.className).toContain('bg-amber-50');
    expect(screen.getByTestId('doc-emitente').textContent).toContain('Agro Insumos');
    expect(screen.getByDisplayValue(/24\.052,00/)).toBeTruthy();
    expect(screen.getByDisplayValue('29/09/2026')).toBeTruthy();
    expect(screen.getByTestId('sugestao-do-lancamento').textContent).toContain('número, emissão, valor, emitente');
  });

  it('editar o número tira a marca daquele campo e grava o digitado', async () => {
    const m = monta();
    fireEvent.click(screen.getByText('Adicionar documento'));
    const numero = screen.getByTestId('doc-numero');
    fireEvent.change(numero, { target: { value: '18113' } });
    expect(numero.className).not.toContain('bg-amber-50');
    expect(screen.getByTestId('sugestao-do-lancamento').textContent).not.toContain('número');
    fireEvent.click(screen.getByText('Adicionar à lista'));
    await vi.waitFor(() => expect(m.lista()).toHaveLength(1));
    expect(m.lista()[0].payload).toMatchObject({ numero: '18113', valorDocumento: 24052, dataEmissao: '2026-09-29', emitenteId: 'f-agro' });
  });

  it('a EDIÇÃO de um documento já na lista não recebe sugestão (sugestão não entra em registro gravado)', () => {
    monta([novoPendente({ especie: 'nf', numero: null }, pdf('nf.pdf'))]);
    fireEvent.click(screen.getByLabelText('Editar documento'));
    const numero = screen.getByTestId('doc-numero');
    if (!(numero instanceof HTMLInputElement)) throw new Error('campo Número não achado');
    expect(numero.value).toBe('');
    expect(screen.queryByTestId('sugestao-do-lancamento')).toBeNull();
    /* a busca sabe achar: o formulário está aberto */
    expect(screen.getByText('Editar documento')).toBeTruthy();
  });
});

describe('coluna "Nota fiscal" da grade: o documento, senão o lançamento, senão "—"', () => {
  const nf = (numero: string | null) => novoPendente({ especie: 'nf', numero }, pdf('nf.pdf'));
  const boleto = novoPendente({ especie: 'boleto', numero: '999' }, pdf('b.pdf'), 1);

  it('a regra pura', () => {
    expect(numeroDaNotaDaCompra([nf('18112')], '777')).toBe('18112');
    expect(numeroDaNotaDaCompra([nf(null)], '18112')).toBe('18112');
    expect(numeroDaNotaDaCompra([], '18112')).toBe('18112');
    /* o número do boleto nunca é o da nota */
    expect(numeroDaNotaDaCompra([boleto], '')).toBeNull();
    expect(numeroDaNotaDaCompra([], '  ')).toBeNull();
  });

  it('na grade: 000.018.112 com o número só no lançamento, "—" sem nenhum', () => {
    const previa = [{ numero: 1, dataVencimento: '2026-10-26', valor: 3006.5 }];
    const props = { parcelas: previa, qtdNotas: 1, boletos: [], foraDoPlano: [], onBoleto: vi.fn(), onTirarBoleto: vi.fn(), onAnexarVarios: vi.fn() };
    const { unmount } = render(<ParcelasDaCompra {...props} notaFiscal={numeroDaNotaDaCompra([nf(null)], '18112')} />);
    expect(screen.getByTestId('linha-parcela').textContent).toContain('000.018.112');
    unmount();
    render(<ParcelasDaCompra {...props} notaFiscal={numeroDaNotaDaCompra([], '')} />);
    expect(screen.getByTestId('linha-parcela').textContent).toContain('—');
  });

  it('o diálogo usa a regra (lido da fonte: ele não se monta em teste)', () => {
    const fonte = readFileSync(resolve(__dirname, './LancamentoV2Dialog.tsx'), 'utf8');
    expect(fonte).toContain('notaFiscal={numeroDaNotaDaCompra(pendentes, notaFiscal)}');
  });
});

describe('arquivo de nome longo numa linha só', () => {
  const CHAVE = '35260923456789000123550010000181121000446110-nfe.pdf';

  it('o fim (extensão e últimos dígitos) fica inteiro; o começo é o que encolhe; nome curto é só fim', () => {
    expect(partesDoNome(CHAVE)).toEqual({ inicio: '352609234567890001235500100001811210004461', fim: '10-nfe.pdf' });
    expect(partesDoNome('nf.pdf')).toEqual({ inicio: '', fim: 'nf.pdf' });
  });

  it('na tabela: sem quebra, o começo encolhe com "…" do CSS, o fim não encolhe, e o nome inteiro no title', () => {
    monta([novoPendente({ especie: 'nf', numero: '18112' }, pdf(CHAVE))]);
    const td = screen.getByTestId('arquivo-pendente');
    expect(td.className).toContain('whitespace-nowrap');
    expect(td.className).toContain('overflow-hidden');
    expect(td.className).not.toContain('break-all');
    expect(td.getAttribute('title')).toBe(CHAVE);
    expect(screen.getByTestId('arquivo-inicio').className).toContain('text-ellipsis');
    expect(screen.getByTestId('arquivo-fim').className).toContain('shrink-0');
    expect(screen.getByTestId('arquivo-fim').textContent).toBe('10-nfe.pdf');
    /* nada se perde no DOM: o que o CSS corta continua no texto (e no title) */
    expect(td.textContent).toBe(CHAVE);
  });
});
