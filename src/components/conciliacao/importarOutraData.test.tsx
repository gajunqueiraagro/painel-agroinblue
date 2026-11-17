/**
 * OF-CONFERIR-CASAMENTO-01 (OK do Gabriel 17/11) — a REPETIDA COM OUTRA DATA na prévia da importação, o caminho inteiro (o hook de
 * verdade, a tela de verdade, o banco falso). O caso da Vera, SINTÉTICO: o Pix de domingo 01/11/2026 entrou pelo "Buscar do banco"
 * (Open Finance, data da transação); o OFX traz o mesmo Pix na terça 03/11 (data contábil; 02/11 é Finados). Sem a regra, entraria
 * duas vezes. Só entre ORIGENS diferentes; até 3 dias úteis; o mesmo valor ao centavo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

type Linha = { id: string; hash_movimento: string; data_movimento: string; valor: number; documento: string | null; descricao: string;
  seq_ocorrencia: number; status: string; created_at: string; importacao_id: string | null };
const banco = vi.hoisted(() => ({ extratos: [] as Linha[], arquivos: [] as { id: string; nome_arquivo: string; tipo_arquivo: string }[] }));

vi.mock('@/integrations/supabase/client', () => {
  const consulta = (tabela: string) => {
    let colunas = ''; let hashes: string[] | null = null;
    const b: Record<string, unknown> = {};
    for (const m of ['eq', 'gte', 'lte', 'is', 'not', 'order', 'or', 'range', 'limit', 'neq', 'filter', 'match']) b[m] = () => b;
    b.select = (c: string) => { colunas = c; return b; };
    b.in = (col: string, vals: string[]) => { if (col === 'hash_movimento') hashes = vals; return b; };
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => {
      let data: unknown[] = [];
      if (tabela === 'extrato_bancario_v2') {
        data = hashes ? banco.extratos.filter((e) => hashes?.includes(e.hash_movimento)) : colunas.includes('importacao_id') ? banco.extratos : [];
      }
      if (tabela === 'financeiro_importacoes_v2') data = banco.arquivos;
      return Promise.resolve({ data, error: null, count: data.length }).then(ok);
    };
    return b;
  };
  return { supabase: { from: (t: string) => consulta(t), rpc: () => Promise.resolve({ data: [], error: null }) } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/v2/pages/V2ImportLancamentosExcel', () => ({ V2ImportLancamentosExcel: () => null }));
vi.mock('@/v2/pages/CusteioTxtImportTab', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ImportarBancoInline } from './ImportarBancoInline';

const ofx = (linhas: string) => `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST><DTSTART>20261101<DTEND>20261113
${linhas}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const trn = (dia: string, valor: string, fitid: string, memo: string) =>
  `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${dia}<TRNAMT>${valor}<FITID>${fitid}<MEMO>${memo}</STMTTRN>`;
const viva = (id: string, dia: string, valor: number, importacao: string | null): Linha => ({
  id, hash_movimento: `velho-${id}`, data_movimento: dia, valor, documento: 'end-to-end-1', descricao: 'PIX ENVIADO MANUELA SINTETICA', seq_ocorrencia: 1,
  status: 'conciliado', created_at: '2026-11-16T13:00:00Z', importacao_id: importacao,
});

function lerBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(blob); });
}
function lerTexto(blob: Blob): Promise<string> {
  return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(typeof r.result === 'string' ? r.result : ''); r.readAsText(blob); });
}
beforeEach(() => {
  banco.extratos = []; banco.arquivos = [{ id: 'imp-of', nome_arquivo: 'Open Finance · 16/11/2026', tipo_arquivo: 'OPEN_FINANCE' }, { id: 'imp-ofx', nome_arquivo: 'out26.ofx', tipo_arquivo: 'OFX' }];
  Element.prototype.scrollIntoView = () => {};
  if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function (this: Blob) { return lerBuffer(this); };
  if (!Blob.prototype.text) Blob.prototype.text = function (this: Blob) { return lerTexto(this); };
});

async function abrir(conteudo: string) {
  const { container } = render(<ImportarBancoInline contas={[{ id: 'itau', label: 'Itaú Personalite' }]} contaId="itau" onContaChange={() => {}} />);
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('sem o campo de arquivo');
  fireEvent.change(input, { target: { files: [new File([conteudo], 'nov26.ofx', { type: 'application/x-ofx' })] } });
  await screen.findByRole('button', { name: /^Importar \d+/ });
}
const botao = () => screen.getByRole('button', { name: /^Importar \d+/ });

describe('OF-CONFERIR-CASAMENTO-01 — a repetida com outra data (Open Finance × arquivo)', () => {
  it('o Pix de domingo do Open Finance × o mesmo Pix na terça do OFX: "repetida? outra data", desmarcado, com a data da antiga', async () => {
    banco.extratos = [viva('x1', '2026-11-01', -6000, 'imp-of')];
    await abrir(ofx(trn('20261103', '-6000.00', '9900001', 'PIX TRANSF MANUELA 01/11')));
    const selo = screen.getByTestId('selo-gemea');
    expect(selo.textContent).toBe('repetida? outra data');
    const titulo = selo.getAttribute('title') ?? '';
    expect(titulo).toContain('Parece a MESMA linha, com OUTRA data: no extrato em 01/11/2026');
    expect(titulo).toContain('arquivo Open Finance · 16/11/2026');
    expect(screen.getByRole('checkbox', { name: 'Importar PIX TRANSF MANUELA 01/11' })).not.toBeChecked();
    expect(botao().textContent).toContain('Importar 0');
  });

  it('a MESMA origem nunca se acusa: dois Pix iguais em dias diferentes, ambos de arquivo, são dois pagamentos', async () => {
    banco.extratos = [viva('x1', '2026-11-01', -6000, 'imp-ofx')];
    await abrir(ofx(trn('20261103', '-6000.00', '9900001', 'PIX TRANSF MANUELA 01/11')));
    expect(screen.queryByTestId('selo-gemea')).toBeNull();
    expect(within(screen.getByRole('checkbox', { name: 'Importar PIX TRANSF MANUELA 01/11' }).closest('tr') ?? document.body).getByText('novo')).toBeInTheDocument();
  });

  it('mais de 3 dias úteis (dom 01 → seg 09: 5 úteis) ou um centavo de diferença: novo', async () => {
    banco.extratos = [viva('x1', '2026-11-01', -6000, 'imp-of'), viva('x2', '2026-11-01', -1650, 'imp-of')];
    await abrir(ofx([trn('20261109', '-6000.00', '9900001', 'PIX LONGE'), trn('20261103', '-1650.01', '9900002', 'PIX CENTAVO')].join('\n')));
    expect(screen.queryByTestId('selo-gemea')).toBeNull();
    expect(botao().textContent).toContain('Importar 2');
  });
});
