/**
 * P140 — a GÊMEA na prévia da importação, o caminho inteiro (o hook de verdade, a tela de verdade, o banco falso).
 * O caso de origem (Santa Rita · Bradesco · 10/09 · +5.193,57), SINTÉTICO: no extrato, "Resg Automatico Investim" de um arquivo de
 * agosto; o arquivo novo traz "Resg/vencto Cdb" no mesmo dia e valor, com outro FITID. Antes caía em "mesmo dia e valor" e ENTRAVA;
 * agora é "repetida?", desmarcada (D1), com o arquivo e a data de gravação da antiga no title, e o contador próprio no topo.
 * A coincidência VERDADEIRA não vira gêmea: o arquivo novo traz a linha antiga (FORTE, mesmo FITID) e mais um pagamento igual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

type Linha = { id: string; hash_movimento: string; data_movimento: string; valor: number; documento: string | null; descricao: string;
  seq_ocorrencia: number; status: string; created_at: string; importacao_id: string | null };
const banco = vi.hoisted(() => ({ extratos: [] as Linha[], arquivos: [] as { id: string; nome_arquivo: string }[] }));

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
        data = hashes ? banco.extratos.filter((e) => hashes?.includes(e.hash_movimento)) : colunas.includes('seq_ocorrencia') ? banco.extratos : [];
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
<BANKTRANLIST><DTSTART>20310901<DTEND>20310930
${linhas}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const trn = (valor: string, fitid: string, memo: string) =>
  `<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20310910<TRNAMT>${valor}<FITID>${fitid}<MEMO>${memo}</STMTTRN>`;
const viva = (id: string, documento: string, descricao: string): Linha => ({
  id, hash_movimento: `velho-${id}`, data_movimento: '2031-09-10', valor: 5193.57, documento, descricao, seq_ocorrencia: 1,
  status: 'conciliado', created_at: '2031-09-11T13:00:00Z', importacao_id: 'imp-ago',
});

function lerBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(blob); });
}
function lerTexto(blob: Blob): Promise<string> {
  return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(typeof r.result === 'string' ? r.result : ''); r.readAsText(blob); });
}
beforeEach(() => {
  banco.extratos = []; banco.arquivos = [{ id: 'imp-ago', nome_arquivo: 'extrato-ago.ofx' }];
  Element.prototype.scrollIntoView = () => {};
  if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function (this: Blob) { return lerBuffer(this); };
  if (!Blob.prototype.text) Blob.prototype.text = function (this: Blob) { return lerTexto(this); };
});

async function abrir(conteudo: string) {
  const { container } = render(<ImportarBancoInline contas={[{ id: 'bradesco', label: 'Bradesco' }]} contaId="bradesco" onContaChange={() => {}} />);
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('sem o campo de arquivo');
  fireEvent.change(input, { target: { files: [new File([conteudo], 'set31.ofx', { type: 'application/x-ofx' })] } });
  await screen.findByRole('button', { name: /^Importar \d+/ });
}
const botao = () => screen.getByRole('button', { name: /^Importar \d+/ });

describe('P140 — a gêmea de outro arquivo na prévia', () => {
  it('o banco reescreveu a linha (texto E FITID): "repetida?", desmarcada, com o arquivo e a data da antiga; o contador no topo', async () => {
    banco.extratos = [viva('x1', '0100926', 'Resg Automatico Investim')];
    await abrir(ofx(trn('5193.57', '2521702', 'Resg/vencto Cdb')));
    const selo = screen.getByTestId('selo-gemea');
    expect(selo.textContent).toBe('repetida?');
    const titulo = selo.getAttribute('title') ?? '';
    expect(titulo).toContain('No extrato: Resg Automatico Investim (doc 0100926) · arquivo extrato-ago.ofx · gravada em 11/09/2031 · já conciliada.');
    expect(titulo).toContain('Não será importada — marque se for movimento novo mesmo.');
    expect(screen.getByRole('checkbox', { name: 'Importar Resg/vencto Cdb' })).not.toBeChecked();
    expect(botao().textContent).toContain('Importar 0');
    expect(screen.getByTestId('importar-gemeas').textContent).toBe('1 parece repetida de um arquivo anterior (o banco mudou o texto ou o documento)');
    /* o "duplicado?" é outra coisa: a gêmea não conta nele */
    expect(screen.queryByText(/duplicado\?$/)).toBeNull();
  });

  it('marcar a gêmea a devolve à importação (o operador sabe que é movimento novo)', async () => {
    banco.extratos = [viva('x1', '0100926', 'Resg Automatico Investim')];
    await abrir(ofx(trn('5193.57', '2521702', 'Resg/vencto Cdb')));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Importar Resg/vencto Cdb' }));
    expect(botao().textContent).toContain('Importar 1');
    expect(screen.getByTestId('selo-gemea').getAttribute('title')).toContain('Será importada — desmarque se for a mesma linha.');
  });

  it('a coincidência VERDADEIRA não vira gêmea: o arquivo traz a antiga (mesmo FITID) e mais um pagamento igual — esse é novo', async () => {
    banco.extratos = [viva('x1', '0100926', 'Resg Automatico Investim')];
    await abrir(ofx([trn('5193.57', '0100926', 'Resg Automatico Investim'), trn('5193.57', '7777777', 'TED RECEBIDA OUTRA EMPRESA')].join('\n')));
    expect(screen.queryByTestId('selo-gemea')).toBeNull();
    expect(screen.queryByTestId('importar-gemeas')).toBeNull();
    const nova = screen.getByRole('checkbox', { name: 'Importar TED RECEBIDA OUTRA EMPRESA' });
    expect(nova).toBeChecked();
    expect(within(nova.closest('tr') ?? document.body).getByText('novo')).toBeInTheDocument();
  });

  it('a linha antiga sem arquivo gravado (importacao_id nulo) diz "arquivo sem registro"', async () => {
    banco.extratos = [{ ...viva('x1', '0100926', 'Resg Automatico Investim'), importacao_id: null }];
    await abrir(ofx(trn('5193.57', '2521702', 'Resg/vencto Cdb')));
    expect(screen.getByTestId('selo-gemea').getAttribute('title')).toContain('· arquivo sem registro ·');
  });

  /* ⚠ AS TRÊS PASSADAS: a linha PARECIDA (PROVÁVEL) mais adiante no arquivo fica com a linha viva; a de texto diferente que vem ANTES não
     a leva como "coincidência" (com duas passadas, em ordem de arquivo, levava — e a diferente virava gêmea e a parecida, nova) */
  it('a parecida mais adiante fica com a linha viva (duplicado?); a diferente que vem antes é nova, não gêmea', async () => {
    banco.extratos = [viva('x1', '0100926', 'INT RESGATE CDB')];
    await abrir(ofx([trn('5193.57', '5555555', 'TED RECEBIDA OUTRA EMPRESA'), trn('5193.57', '2521702', 'RESGATE CDB')].join('\n')));
    expect(screen.queryByTestId('selo-gemea')).toBeNull();
    const parecida = screen.getByRole('checkbox', { name: 'Importar RESGATE CDB' });
    expect(within(parecida.closest('tr') ?? document.body).getByText('duplicado?')).toBeInTheDocument();
    const diferente = screen.getByRole('checkbox', { name: 'Importar TED RECEBIDA OUTRA EMPRESA' });
    expect(within(diferente.closest('tr') ?? document.body).getByText('novo')).toBeInTheDocument();
  });
});
