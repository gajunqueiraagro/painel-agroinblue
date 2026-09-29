/**
 * FIN-NFE-PARCELAS-01 PR 2b-fix2 — decisão do Gabriel (29/09): o bloco "Documentos" (Tipo / Nº Documento) fica
 * no TOPO da aba em todo uso do diálogo, não só no novo lançamento e na parcela aberta; e o nome de arquivo fica
 * numa linha também na grade de parcelas e no "Anexar vários boletos", com a mesma célula do fix1.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/financeiro/parser/extractPdfText', () => ({
  extractPdfText: () => Promise.resolve({ text: '', pageCount: 1, hasTextLayer: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { ParcelasDaCompra } from '@/components/financeiro-v2/ParcelasDaCompra';
import { AnexarBoletosDialog } from '@/components/financeiro-v2/AnexarBoletosDialog';
import { novoPendente } from '@/lib/financeiro/documentosPendentes';

const LONGO = 'boleto_parcela_003_banco_do_brasil_vencimento_28-12-2026.pdf';
const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });

describe('bloco "Documentos" no topo em todo uso (lido da fonte: o diálogo não se monta em teste)', () => {
  const fonte = readFileSync(resolve(__dirname, './LancamentoV2Dialog.tsx'), 'utf8');
  const aba = fonte.slice(fonte.indexOf('<TabsContent value="documentos"'), fonte.indexOf('{/* ═══ fim ABA DOCUMENTOS ═══ */}'));

  it('um bloco só, sem condição, ANTES do ramo do lançamento salvo (a lista de documentos de um lançamento comum)', () => {
    /* a busca sabe achar: a aba e o bloco estão lá */
    expect(aba.length).toBeGreaterThan(0);
    const bloco = aba.indexOf('data-testid="bloco-documentos-topo"');
    const salvo = aba.indexOf('{lancamento?.id ? (');
    expect(bloco).toBeGreaterThan(-1);
    expect(salvo).toBeGreaterThan(bloco);
    /* Tipo Documento aparece UMA vez na aba: o bloco de baixo saiu */
    expect(aba.split('Tipo Documento</Label>').length - 1).toBe(1);
    /* e nada o condiciona: a condição do fix1 caiu */
    expect(fonte).not.toContain('blocoDocumentosNoTopo');
    const inicioDaSecao = aba.lastIndexOf('<section', bloco);
    const antes = aba.slice(0, inicioDaSecao);
    /* entre o comentário e o <section> do bloco só há espaço: nenhum `{cond && (` nem ternário */
    expect(antes.slice(antes.lastIndexOf('*/}') + 3).trim()).toBe('');
  });

  it('o bloco é fixo no topo da área que rola, opaco e acima das tabelas; a Observação fica embaixo', () => {
    expect(aba).toContain('cn(sectionClass, "sticky -top-2 z-20")');
    expect(aba.indexOf('Observação</Label>')).toBeGreaterThan(aba.indexOf('<AbaDocumentosLancamento'));
  });
});

describe('nome de arquivo numa linha: grade de parcelas e "Anexar vários boletos"', () => {
  it('coluna Boleto da grade: sem quebra, fim fixo, nome inteiro no title', () => {
    const b = novoPendente({ especie: 'boleto' }, pdf(LONGO), 1);
    render(<ParcelasDaCompra parcelas={[{ numero: 1, dataVencimento: '2026-12-28', valor: 10 }]} notaFiscal={null} qtdNotas={0}
      boletos={[b]} foraDoPlano={[]} onBoleto={vi.fn()} onTirarBoleto={vi.fn()} onAnexarVarios={vi.fn()} />);
    const td = screen.getByTestId('boleto-da-parcela');
    expect(td.className).toContain('whitespace-nowrap');
    expect(td.className).toContain('overflow-hidden');
    expect(td.className).not.toContain('break-all');
    expect(td.getAttribute('title')).toBe(LONGO);
    expect(td.querySelector('[data-testid="arquivo-fim"]')?.textContent).toBe('2-2026.pdf');
    expect(td.textContent).toBe(LONGO);
  });

  it('coluna Arquivo do diálogo B: sem quebra, fim fixo, nome inteiro no title', async () => {
    render(<AnexarBoletosDialog parcelas={[{ numero: 1, vencimento: '2026-12-28', valor: 10, temBoleto: false }]}
      onConfirmar={vi.fn()} onFechar={() => {}} />);
    fireEvent.change(screen.getByTestId('input-boletos'), { target: { files: [pdf(LONGO)] } });
    await waitFor(() => expect(screen.queryByText('lendo…')).toBeNull());
    const td = screen.getByTestId('arquivo-do-boleto');
    expect(td.className).toContain('whitespace-nowrap');
    expect(td.className).not.toContain('break-all');
    expect(td.getAttribute('title')).toBe(LONGO);
    expect(td.querySelector('[data-testid="arquivo-inicio"]')?.className).toContain('text-ellipsis');
    expect(td.querySelector('[data-testid="arquivo-fim"]')?.textContent).toBe('2-2026.pdf');
  });

  it('a célula é UMA só nas três telas (a do fix1, movida — nunca uma segunda versão)', () => {
    for (const arq of ['./DocumentosPendentes.tsx', './ParcelasDaCompra.tsx', './AnexarBoletosDialog.tsx']) {
      const f = readFileSync(resolve(__dirname, arq), 'utf8');
      expect(f).toContain("import { NomeDoArquivo } from '@/components/financeiro-v2/NomeDoArquivo';");
      expect(f).not.toContain('function NomeDoArquivo');
      expect(f).not.toContain('break-all');
    }
  });
});
