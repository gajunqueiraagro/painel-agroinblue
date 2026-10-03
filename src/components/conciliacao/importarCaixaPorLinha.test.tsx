/**
 * PR-CONC-IMPORT-BANCO-01B (fechamento) — a CAIXA da prévia é por LINHA, inclusive entre linhas idênticas.
 *
 * ⚠ O PRINT DO GABRIEL (03/10 14:31): as duas linhas de 29/09 "RENTAB.INVEST FACILCRED*" 0,13 compartilhavam a caixa
 *   IMPORTAR — clicar numa mudava as duas. A caixa, o contador do botão e o selo são acionados pelo HASH da linha
 *   (`toggleImportar(m.hash)`), e as duas tinham o mesmo hash. Com a ocorrência no hash (`hashesDoArquivo`), cada uma tem o
 *   seu. Aqui o caminho inteiro com um banco falso que GUARDA o que a RPC grava: desmarcar uma leva o botão de 2 para 1,
 *   importar grava só a outra, e reimportar o mesmo arquivo traz só a que faltou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

type Linha = { id: string; hash_movimento: string; data_movimento: string; valor: number; documento: string | null;
  descricao: string; seq_ocorrencia: number; status: string; created_at: string };
const banco = vi.hoisted(() => ({ extratos: [] as Linha[], gravacoes: [] as Array<Array<{ hash: string }>> }));

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
        data = hashes ? banco.extratos.filter((e) => hashes!.includes(e.hash_movimento))
          : colunas.includes('seq_ocorrencia') ? banco.extratos : [];
      }
      return Promise.resolve({ data, error: null, count: data.length }).then(ok);
    };
    return b;
  };
  return {
    supabase: {
      from: (t: string) => consulta(t),
      rpc: (fn: string, args: Record<string, unknown>) => {
        if (fn !== 'fn_extrato_importar_arquivo') return Promise.resolve({ data: [], error: null });
        const movs = args.p_movimentos as Array<{ data: string; valor: number; documento: string | null; descricao: string; hash: string; seq: number }>;
        banco.gravacoes.push(movs.map((m) => ({ hash: m.hash })));
        const ids: Array<{ hash: string; id: string }> = []; const pulados: unknown[] = [];
        movs.forEach((m, i) => {
          if (banco.extratos.some((e) => e.hash_movimento === m.hash)) { pulados.push({ indice: i, hash: m.hash, motivo: 'hash' }); return; }
          const id = `ext-${banco.extratos.length + 1}`;
          banco.extratos.push({ id, hash_movimento: m.hash, data_movimento: m.data, valor: m.valor, documento: m.documento,
            descricao: m.descricao, seq_ocorrencia: m.seq, status: 'nao_conciliado', created_at: '2026-10-03T18:00:00Z' });
          ids.push({ hash: m.hash, id });
        });
        return Promise.resolve({ data: { ok: true, importacao_id: ids.length ? 'imp' : null, inseridos: ids.length, pulados, ids }, error: null });
      },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'agnaldo' } }) }));
vi.mock('@/v2/pages/V2ImportLancamentosExcel', () => ({ V2ImportLancamentosExcel: () => null }));
vi.mock('@/v2/pages/CusteioTxtImportTab', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ImportarBancoInline } from './ImportarBancoInline';

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260929<TRNAMT>0.13<FITID>3709291<MEMO>RENTAB.INVEST FACILCRED*</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260929<TRNAMT>0.13<FITID>3709291<MEMO>RENTAB.INVEST FACILCRED*</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

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
  banco.extratos = []; banco.gravacoes = [];
  Element.prototype.scrollIntoView = () => {};
  if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function (this: Blob) { return lerComo(this, 'buffer', new ArrayBuffer(0)); };
  if (!Blob.prototype.text) Blob.prototype.text = function (this: Blob) { return lerComo(this, 'texto', ''); };
});

async function abrir() {
  const { container } = render(<ImportarBancoInline contas={[{ id: 'bradesco', label: 'Bradesco' }]} contaId="bradesco" onContaChange={() => {}} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([OFX], 'set26.ofx', { type: 'application/x-ofx' })] } });
  await screen.findByRole('button', { name: /^Importar \d+/ });
}
const caixas = () => screen.getAllByRole('checkbox', { name: 'Importar RENTAB.INVEST FACILCRED*' });
const botao = () => screen.getByRole('button', { name: /^Importar \d+/ });

describe('a caixa da prévia é por linha', () => {
  it('duas linhas idênticas: desmarcar uma leva o botão de 2 para 1, a outra continua marcada', async () => {
    await abrir();
    expect(botao().textContent).toContain('Importar 2');
    expect(caixas()).toHaveLength(2);
    fireEvent.click(caixas()[0]);
    expect(caixas()[0]).not.toBeChecked();
    expect(caixas()[1]).toBeChecked();
    expect(botao().textContent).toContain('Importar 1');
  });

  it('importar com uma desmarcada grava só a outra; reimportar o mesmo arquivo traz só a que faltou', async () => {
    await abrir();
    fireEvent.click(caixas()[0]);
    expect(botao().textContent).toContain('Importar 1');
    fireEvent.click(botao());
    await waitFor(() => expect(banco.gravacoes).toHaveLength(1));
    expect(banco.gravacoes[0]).toHaveLength(1);
    const gravada = banco.gravacoes[0][0].hash;
    expect(banco.extratos.map((e) => e.hash_movimento)).toEqual([gravada]);
    cleanup();

    await abrir();
    expect(botao().textContent).toContain('Importar 1');
    /* a que já está no extrato não tem caixa (não é importável); só a que faltou tem, e marcada */
    expect(caixas()).toHaveLength(1);
    expect(caixas()[0]).toBeChecked();
    fireEvent.click(botao());
    await waitFor(() => expect(banco.gravacoes).toHaveLength(2));
    expect(banco.gravacoes[1]).toHaveLength(1);
    expect(banco.gravacoes[1][0].hash).not.toBe(gravada);
    expect(banco.extratos).toHaveLength(2);
  });
});
