/**
 * FIN-NFE-PARCELAS-01, PR 1 — a cadeia dos documentos PENDENTES, depois do salvar.
 *
 * ⚠ O BANCO FALSO REGISTRA A ORDEM das chamadas: registrar -> upload -> editar é a cadeia de sempre
 * da aba, e a ordem é o que impede arquivo órfão (o registro vem antes do arquivo). Os casos de falha
 * afirmam os DOIS lados: o que sobra no banco e o que a nova tentativa NÃO repete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chamada = { op: string; args: unknown };
const chamadas: Chamada[] = [];
const falhar = { registrar: false, upload: false, editar: false, vincular: false };
let docSeq = 0;

vi.mock('@/integrations/supabase/client', () => {
  const rpc = (nome: string, args: unknown) => {
    chamadas.push({ op: `rpc:${nome}`, args });
    if (nome === 'fin_documento_registrar') {
      if (falhar.registrar) return Promise.resolve({ data: null, error: { message: 'Lançamento cancelado' } });
      docSeq += 1;
      return Promise.resolve({ data: { documento_id: `doc-${docSeq}`, confronto: {} }, error: null });
    }
    if (nome === 'fin_documento_vincular') {
      return Promise.resolve(falhar.vincular
        ? { data: null, error: { message: 'Falha de rede' } }
        : { data: { ok: true, vinculados: 3 }, error: null });
    }
    if (nome === 'fin_documento_editar') {
      return Promise.resolve(falhar.editar
        ? { data: null, error: { message: 'Versão em conflito' } }
        : { data: { confronto: {} }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  const storage = {
    from: (bucket: string) => ({
      upload: (caminho: string) => {
        chamadas.push({ op: `upload:${bucket}`, args: caminho });
        return Promise.resolve(falhar.upload ? { data: null, error: { message: 'Invalid key' } } : { data: {}, error: null });
      },
      remove: (caminhos: string[]) => {
        chamadas.push({ op: `remove:${bucket}`, args: caminhos });
        return Promise.resolve({ data: [], error: null });
      },
    }),
  };
  const from = (tabela: string) => {
    const ops: unknown[] = [];
    const b = {
      select: (c: string) => { ops.push(['select', c]); return b; },
      eq: (c: string, v: unknown) => { ops.push(['eq', c, v]); return b; },
      order: (c: string, o: unknown) => { ops.push(['order', c, o]); return b; },
      limit: (n: number) => { ops.push(['limit', n]); return b; },
      maybeSingle: () => {
        chamadas.push({ op: `from:${tabela}`, args: ops });
        return Promise.resolve({ data: { lancamento_id: 'lanc-parcela-1' }, error: null });
      },
      /* A lista das parcelas (PR 2b): fora de ordem de propósito — quem ordena é o `.order()` e a função. */
      then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => {
        chamadas.push({ op: `from:${tabela}`, args: ops });
        return Promise.resolve({ data: [
          { numero_parcela: 1, lancamento_id: 'lanc-p1' }, { numero_parcela: 2, lancamento_id: 'lanc-p2' },
          { numero_parcela: 3, lancamento_id: 'lanc-p3' }, { numero_parcela: 4, lancamento_id: null },
        ], error: null }).then(ok, erro);
      },
    };
    return b;
  };
  return { supabase: { rpc, storage, from } };
});

import {
  gravarDocumentosPendentes, gravarDocumentosDoParcelamento, lancamentosDoParcelamento, novoPendente, todosGravados,
  motivoArquivoRecusado,
} from '@/lib/financeiro/documentosPendentes';

const pdf = (nome = 'nf.pdf') => new File(['%PDF'], nome, { type: 'application/pdf' });

beforeEach(() => {
  chamadas.length = 0;
  falhar.registrar = false; falhar.upload = false; falhar.editar = false; falhar.vincular = false;
});

describe('gravação depois do salvar', () => {
  it('registra, sobe o arquivo e anexa — nessa ordem, no lançamento criado, com o payload da aba', async () => {
    const p = novoPendente({ especie: 'nf', numero: '18112', serie: '2', valorDocumento: 24052, chaveAcesso: 'X' }, pdf());
    const [r] = await gravarDocumentosPendentes('cli-1', 'lanc-1', [p]);

    expect(chamadas.map(c => c.op)).toEqual(['rpc:fin_documento_registrar', 'upload:fin-documentos', 'rpc:fin_documento_editar']);
    expect(chamadas[0].args).toMatchObject({
      p_lancamento_id: 'lanc-1', p_cliente_id: 'cli-1',
      p_payload: { especie: 'nf', numero: '18112', serie: '2', valor_documento: 24052, chave_acesso: 'X' },
    });
    /* o caminho de sempre: cliente/lançamento/documento-ts.ext — é onde a aba procura */
    expect(String(chamadas[1].args)).toMatch(/^cli-1\/lanc-1\/doc-\d+-\d+\.pdf$/);
    expect(chamadas[2].args).toMatchObject({
      p_versao_esperada: 1, p_payload: { url: chamadas[1].args, tipo: 'application/pdf', tamanho_bytes: 4 },
    });
    expect(r).toMatchObject({ gravado: true, erro: null });
    expect(todosGravados([r])).toBe(true);
  });

  it('documento sem arquivo só registra — nada sobe', async () => {
    const [r] = await gravarDocumentosPendentes('cli-1', 'lanc-1', [novoPendente({ especie: 'recibo' }, null)]);
    expect(chamadas.map(c => c.op)).toEqual(['rpc:fin_documento_registrar']);
    expect(r.gravado).toBe(true);
  });

  it('as parcelas do parcelamento vêm de financiamento_parcelas, pelo número, sem as que não têm lançamento', async () => {
    const parcelas = await lancamentosDoParcelamento('fin-1');
    expect(parcelas).toEqual([
      { numero: 1, lancamentoId: 'lanc-p1' }, { numero: 2, lancamentoId: 'lanc-p2' }, { numero: 3, lancamentoId: 'lanc-p3' },
    ]);
    expect(chamadas[0]).toEqual({
      op: 'from:financiamento_parcelas',
      args: [['select', 'numero_parcela, lancamento_id'], ['eq', 'financiamento_id', 'fin-1'], ['order', 'numero_parcela', { ascending: true }]],
    });
  });
});

describe('falha e "Tentar de novo"', () => {
  it('anexo recusado APAGA o arquivo que subiu (nada órfão) e guarda até onde chegou', async () => {
    falhar.editar = true;
    const [r] = await gravarDocumentosPendentes('cli-1', 'lanc-1', [novoPendente({ especie: 'nf' }, pdf())]);
    const caminho = chamadas.find(c => c.op === 'upload:fin-documentos')?.args;
    expect(chamadas.map(c => c.op)).toEqual([
      'rpc:fin_documento_registrar', 'upload:fin-documentos', 'rpc:fin_documento_editar', 'remove:fin-documentos',
    ]);
    expect(chamadas[3].args).toEqual([caminho]);
    expect(r).toMatchObject({ gravado: false, erro: 'Versão em conflito' });
    expect(r.documentoId).toMatch(/^doc-/);
    expect(todosGravados([r])).toBe(false);
  });

  it('a nova tentativa NÃO registra o documento de novo: só sobe e anexa', async () => {
    falhar.upload = true;
    const [primeira] = await gravarDocumentosPendentes('cli-1', 'lanc-1', [novoPendente({ especie: 'boleto' }, pdf('b.pdf'))]);
    expect(primeira).toMatchObject({ gravado: false, erro: 'Invalid key' });
    /* upload falhou: não houve arquivo, então não há o que apagar */
    expect(chamadas.map(c => c.op)).not.toContain('remove:fin-documentos');

    chamadas.length = 0; falhar.upload = false;
    const [segunda] = await gravarDocumentosPendentes('cli-1', 'lanc-1', [primeira]);
    expect(chamadas.map(c => c.op)).toEqual(['upload:fin-documentos', 'rpc:fin_documento_editar']);
    expect(segunda).toMatchObject({ gravado: true, documentoId: primeira.documentoId });
  });

  it('registro recusado não sobe arquivo, e o que já foi gravado não é repetido', async () => {
    const ok = novoPendente({ especie: 'recibo' }, null);
    const [gravado] = await gravarDocumentosPendentes('cli-1', 'lanc-1', [ok]);
    chamadas.length = 0; falhar.registrar = true;
    const lista = await gravarDocumentosPendentes('cli-1', 'lanc-1', [gravado, novoPendente({ especie: 'nf' }, pdf())]);
    expect(chamadas.map(c => c.op)).toEqual(['rpc:fin_documento_registrar']);
    expect(lista[0].gravado).toBe(true);
    expect(lista[1]).toMatchObject({ gravado: false, documentoId: null, erro: 'Lançamento cancelado' });
  });

  it('o arquivo que não serve é recusado antes, com a mesma frase do anexo da aba', () => {
    expect(motivoArquivoRecusado(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBe('Formato não aceito. Envie PDF, JPG ou PNG.');
    expect(motivoArquivoRecusado(pdf())).toBeNull();
  });
});

/* ─── PR 2b — o parcelado: a NF da compra UMA vez, ligada às N; o boleto na sua parcela ─── */
const PARCELAS = [
  { numero: 3, lancamentoId: 'lanc-p3' }, { numero: 1, lancamentoId: 'lanc-p1' }, { numero: 2, lancamentoId: 'lanc-p2' },
];

describe('PR 2b — cadeia do parcelado', () => {
  it('a NF da compra é registrada UMA vez, na parcela 1, e ligada às 3; cada boleto na parcela dele', async () => {
    const nf = novoPendente({ especie: 'nf', numero: '18112', valorDocumento: 9019.5 }, pdf('nf.pdf'));
    const b2 = novoPendente({ especie: 'boleto' }, pdf('boleto_002.pdf'), 2);
    const b3 = novoPendente({ especie: 'boleto' }, pdf('boleto_003.pdf'), 3);
    const lista = await gravarDocumentosDoParcelamento('cli-1', PARCELAS, [nf, b2, b3]);

    expect(todosGravados(lista)).toBe(true);
    const registros = chamadas.filter(c => c.op === 'rpc:fin_documento_registrar');
    expect(registros.map(r => (r.args as { p_lancamento_id: string }).p_lancamento_id)).toEqual(['lanc-p1', 'lanc-p2', 'lanc-p3']);
    const vinculos = chamadas.filter(c => c.op === 'rpc:fin_documento_vincular');
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0].args).toEqual({ p_documento: lista[0].documentoId, p_cliente: 'cli-1', p_lancamentos: ['lanc-p1', 'lanc-p2', 'lanc-p3'] });
    /* o boleto nunca é ligado a outra parcela */
    expect(lista[1].vinculado).toBe(true);
    /* e cada arquivo sobe na pasta do lançamento onde nasceu */
    const uploads = chamadas.filter(c => c.op === 'upload:fin-documentos').map(c => String(c.args).split('/')[1]);
    expect(uploads).toEqual(['lanc-p1', 'lanc-p2', 'lanc-p3']);
  });

  it('"Tentar de novo" depois de o vínculo falhar NÃO registra nem sobe de novo: só liga', async () => {
    falhar.vincular = true;
    const [primeira] = await gravarDocumentosDoParcelamento('cli-1', PARCELAS, [novoPendente({ especie: 'nf' }, pdf())]);
    expect(primeira).toMatchObject({ gravado: false, anexado: true, vinculado: false, erro: 'Falha de rede' });
    expect(primeira.documentoId).toMatch(/^doc-/);

    chamadas.length = 0; falhar.vincular = false;
    const [segunda] = await gravarDocumentosDoParcelamento('cli-1', PARCELAS, [primeira]);
    expect(chamadas.map(c => c.op)).toEqual(['rpc:fin_documento_vincular']);
    expect(segunda).toMatchObject({ gravado: true, documentoId: primeira.documentoId });
  });

  it('boleto de parcela que não existe no parcelamento não é gravado em outra — vira erro dele', async () => {
    const [b] = await gravarDocumentosDoParcelamento('cli-1', PARCELAS, [novoPendente({ especie: 'boleto' }, pdf(), 7)]);
    expect(b).toMatchObject({ gravado: false, erro: 'Parcela 7 não encontrada no parcelamento.' });
    expect(chamadas).toHaveLength(0);
  });

  it('à vista não chama o vínculo (documento de um lançamento só)', async () => {
    await gravarDocumentosPendentes('cli-1', 'lanc-1', [novoPendente({ especie: 'nf' }, pdf())]);
    expect(chamadas.map(c => c.op)).not.toContain('rpc:fin_documento_vincular');
  });
});
