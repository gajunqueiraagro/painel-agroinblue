/**
 * PR-CONC-OFX-LINHA-SALDO-01 — a prévia do "Importar Banco" com um OFX do Itaú que traz linhas de SALDO.
 *
 * ⚠ É O CAMINHO INTEIRO, SEM ATALHO: o arquivo entra pelo input da tela, passa pelo `parseOFX`, pelo helper de saldo e
 *   pelo `gerarPreview` reais. Só o banco é falso (nada já importado, nenhum candidato).
 * ⚠ O CASO (print do Chat, 30/09 15:45): OFX Itaú 15/08-14/09/2026 com "SALDO ANTERIOR" e "SALDO TOTAL DISPONIVEL DIA"
 *   aparecendo como NOVO e entrando no "Importar 26", sem caixa para o operador desmarcar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => {
  const vazio = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in', 'or', 'range', 'limit', 'neq', 'filter', 'match']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return { supabase: { from: () => vazio(), rpc: () => Promise.resolve({ data: [], error: null }) } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'nj' } }) }));
vi.mock('@/v2/pages/V2ImportLancamentosExcel', () => ({ V2ImportLancamentosExcel: () => null }));
vi.mock('@/v2/pages/CusteioTxtImportTab', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ImportarBancoInline } from './ImportarBancoInline';

/* O desenho do Itaú: o saldo é um STMTTRN comum, TRNAMT positivo, FITID AAAAMMDD001. */
const OFX_ITAU = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST><DTSTART>20260815<DTEND>20260914
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260815<TRNAMT>2494790.27<FITID>20260815001<MEMO>SALDO ANTERIOR</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260818<TRNAMT>-610102.51<FITID>20260818002<MEMO>TED ENVIADA FAZENDA X</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260818<TRNAMT>1884687.76<FITID>20260818001<MEMO>SALDO TOTAL DISPONÍVEL DIA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260914<TRNAMT>-777.42<FITID>20260914002<MEMO>TARIFA PACOTE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260914<TRNAMT>100.00<FITID>20260914003<MEMO>PIX RECEBIDO SALDO ANTERIOR ACERTO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260914<TRNAMT>1884010.34<FITID>20260914001<MEMO>SALDO TOTAL DISPONÍVEL DIA</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1884010.34<DTASOF>20260914</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

/* O Blob do jsdom não tem `arrayBuffer()` nem `text()`, que a tela usa para ler o arquivo: o FileReader dele faz. */
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
  Element.prototype.scrollIntoView = () => {};
  if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function (this: Blob) { return lerComo(this, 'buffer', new ArrayBuffer(0)); };
  if (!Blob.prototype.text) Blob.prototype.text = function (this: Blob) { return lerComo(this, 'texto', ''); };
});

async function abrirPrevia(conteudo = OFX_ITAU) {
  const { container } = render(<ImportarBancoInline contas={[{ id: 'itau', label: 'cc-008 | itau bba pecuária' }]} contaId="itau" onContaChange={() => {}} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([conteudo], 'itau-ago-set.ofx', { type: 'application/x-ofx' })] } });
  return screen.findByRole('button', { name: /^Importar \d+/ });
}
const botaoImportar = () => screen.getByRole('button', { name: /^Importar \d+/ });

describe('a linha de saldo não vira movimento', () => {
  it('as 3 linhas de SALDO saem da contagem: "Importar 3" (TED, tarifa e o PIX que só CITA saldo)', async () => {
    const b = await abrirPrevia();
    expect(b.textContent).toContain('Importar 3');
    expect(screen.getAllByTestId('linha-saldo')).toHaveLength(3);
    for (const l of screen.getAllByTestId('linha-saldo')) {
      expect(l.textContent).toContain('saldo do banco · não importa');
      expect(l.className).toContain('opacity-45');
      expect(within(l).queryByRole('checkbox')).toBeNull(); // saldo não tem caixa: nunca entra
    }
    expect(screen.getByText(/PIX RECEBIDO SALDO ANTERIOR ACERTO/).closest('tr')!.getAttribute('data-testid')).toBeNull();
  });

  it('o último saldo do extrato confere o declarado (LEDGERBAL)', async () => {
    await abrirPrevia();
    expect(screen.getByTestId('conferencia-saldo').textContent).toMatch(/Saldo do extrato em 14\/09\/2026: R\$\s?1\.884\.010,34 · confere com o saldo declarado/);
  });

  it('diverge quando o declarado é outro', async () => {
    await abrirPrevia(OFX_ITAU.replace('<BALAMT>1884010.34', '<BALAMT>1884000.00'));
    expect(screen.getByTestId('conferencia-saldo').textContent).toMatch(/diverge do saldo declarado em R\$\s?10,34/);
  });
});

describe('toda linha importável tem caixa', () => {
  it('o "novo" nasce marcado; desmarcar reduz o "Importar N", marcar de volta devolve', async () => {
    await abrirPrevia();
    const tarifa = screen.getByRole('checkbox', { name: 'Importar TARIFA PACOTE' });
    expect(tarifa).toBeChecked();
    fireEvent.click(tarifa);
    await waitFor(() => expect(botaoImportar().textContent).toContain('Importar 2'));
    expect(tarifa.closest('tr')!.className).toContain('opacity-45');
    fireEvent.click(tarifa);
    await waitFor(() => expect(botaoImportar().textContent).toContain('Importar 3'));
  });

  it('o "importar" do cabeçalho desmarca todas: "Importar 0" e o botão desliga', async () => {
    await abrirPrevia();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Importar todas' }));
    await waitFor(() => expect(botaoImportar().textContent).toContain('Importar 0'));
    expect(botaoImportar()).toBeDisabled();
  });
});
