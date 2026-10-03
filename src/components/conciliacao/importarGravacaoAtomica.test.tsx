/**
 * PR-CONC-IMPORT-BANCO-01B — a gravação do "Importar Banco" pela RPC atômica, ponta a ponta na tela (parser e prévia reais;
 * só o banco é falso).
 *
 * ⚠ O CASO DO AGNALDO (03/10): o CSV de set/26 do Bradesco tinha dois "RENTAB.INVEST FACILCRED*" de 0,13 no mesmo dia, com o
 *   mesmo documento. O hash não tinha a ocorrência, o banco devolvia 23505 e a tela dizia "Extrato já importado
 *   anteriormente" — quatro tentativas, quatro cabeçalhos vazios. Agora os dois vão à RPC com hashes diferentes, e o
 *   resultado é escrito AO LADO DO BOTÃO, não em toast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  resposta: { data: null as unknown, error: null as unknown },
}));
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
  return {
    supabase: {
      from: () => vazio(),
      rpc: (fn: string, args: Record<string, unknown>) => {
        banco.chamadas.push({ fn, args });
        return Promise.resolve(fn === 'fn_extrato_importar_arquivo' ? banco.resposta : { data: [], error: null });
      },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'agnaldo' } }) }));
vi.mock('@/v2/pages/V2ImportLancamentosExcel', () => ({ V2ImportLancamentosExcel: () => null }));
vi.mock('@/v2/pages/CusteioTxtImportTab', () => ({ default: () => null }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toasts }));

import { ImportarBancoInline } from './ImportarBancoInline';

const STMT = (data: string, valor: string, fitid: string, memo: string) =>
  `<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${data}<TRNAMT>${valor}<FITID>${fitid}<MEMO>${memo}</STMTTRN>`;
const OFX = (linhas: string[]) => `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
${linhas.join('\n')}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const RENTAB = STMT('20260929', '0.13', '3709291', 'RENTAB.INVEST FACILCRED*');

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
  banco.chamadas = [];
  banco.resposta = { data: null, error: null };
  toasts.success.mockClear(); toasts.error.mockClear();
  Element.prototype.scrollIntoView = () => {};
  if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function (this: Blob) { return lerComo(this, 'buffer', new ArrayBuffer(0)); };
  if (!Blob.prototype.text) Blob.prototype.text = function (this: Blob) { return lerComo(this, 'texto', ''); };
});

async function importar(linhas: string[]) {
  const { container } = render(<ImportarBancoInline contas={[{ id: 'bradesco', label: 'Bradesco' }]} contaId="bradesco" onContaChange={() => {}} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([OFX(linhas)], 'set26.ofx', { type: 'application/x-ofx' })] } });
  const botao = await screen.findByRole('button', { name: /^Importar \d+/ });
  fireEvent.click(botao);
  await waitFor(() => expect(banco.chamadas.some((c) => c.fn === 'fn_extrato_importar_arquivo')).toBe(true));
  const chamada = banco.chamadas.find((c) => c.fn === 'fn_extrato_importar_arquivo');
  const movs = (chamada?.args.p_movimentos ?? []) as Array<{ hash: string; seq: number }>;
  return movs;
}

describe('a gravação pela RPC atômica', () => {
  it('dois movimentos idênticos: os dois vão à RPC, com hashes diferentes, e a tela diz "2 importados"', async () => {
    banco.resposta = { data: { ok: true, importacao_id: 'imp', inseridos: 2, pulados: [], ids: [] }, error: null };
    const movs = await importar([RENTAB, RENTAB]);
    expect(movs).toHaveLength(2);
    expect(movs[0].hash).not.toBe(movs[1].hash);
    expect(await screen.findByTestId('resultado-importacao')).toHaveTextContent('2 importados');
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it('três idênticos: três hashes diferentes', async () => {
    banco.resposta = { data: { ok: true, importacao_id: 'imp', inseridos: 3, pulados: [], ids: [] }, error: null };
    const movs = await importar([RENTAB, RENTAB, RENTAB]);
    expect(new Set(movs.map((m) => m.hash)).size).toBe(3);
  });

  it('tudo já existia (o banco pulou): "Extrato já importado anteriormente", sem cabeçalho', async () => {
    banco.resposta = { data: { ok: true, importacao_id: null, inseridos: 0, ids: [],
      pulados: [{ indice: 0, hash: 'a', motivo: 'hash' }, { indice: 1, hash: 'b', motivo: 'hash' }] }, error: null };
    await importar([RENTAB, STMT('20260930', '5.00', '1', 'OUTRO')]);
    expect(await screen.findByTestId('resultado-importacao'))
      .toHaveTextContent('Extrato já importado anteriormente. Nenhuma movimentação nova foi encontrada.');
  });

  it('metade nova: "1 importado · 1 já existia"', async () => {
    banco.resposta = { data: { ok: true, importacao_id: 'imp', inseridos: 1, ids: [],
      pulados: [{ indice: 1, hash: 'b', motivo: 'chave_natural' }] }, error: null };
    await importar([RENTAB, STMT('20260930', '5.00', '1', 'OUTRO')]);
    expect(await screen.findByTestId('resultado-importacao')).toHaveTextContent('1 importado · 1 já existia');
  });

  it('falha: a frase ao lado do botão, a prévia fica, nada de toast — e diz que nada foi gravado', async () => {
    banco.resposta = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout', details: null, hint: null } };
    await importar([RENTAB]);
    const erro = await screen.findByTestId('erro-importacao');
    await waitFor(() => expect(erro.textContent).toMatch(/^Não foi possível gravar o extrato \(.+\)\. Nada foi gravado — tente de novo\.$/));
    expect(screen.getByRole('button', { name: /^Importar \d+/ })).toBeInTheDocument();
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('recusa escrita pelo banco: a frase dele, inteira', async () => {
    banco.resposta = { data: { ok: false, motivo: 'conta_de_outro_cliente', frase: 'A conta bancária selecionada não pertence ao cliente atual.' }, error: null };
    await importar([RENTAB]);
    expect(await screen.findByTestId('erro-importacao')).toHaveTextContent('A conta bancária selecionada não pertence ao cliente atual.');
  });
});
