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
const falhar = { registrar: false, upload: false, editar: false };
let docSeq = 0;

vi.mock('@/integrations/supabase/client', () => {
  const rpc = (nome: string, args: unknown) => {
    chamadas.push({ op: `rpc:${nome}`, args });
    if (nome === 'fin_documento_registrar') {
      if (falhar.registrar) return Promise.resolve({ data: null, error: { message: 'Lançamento cancelado' } });
      docSeq += 1;
      return Promise.resolve({ data: { documento_id: `doc-${docSeq}`, confronto: {} }, error: null });
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
    };
    return b;
  };
  return { supabase: { rpc, storage, from } };
});

import {
  gravarDocumentosPendentes, lancamentoDaParcela1, novoPendente, todosGravados, motivoArquivoRecusado,
} from '@/lib/financeiro/documentosPendentes';

const pdf = (nome = 'nf.pdf') => new File(['%PDF'], nome, { type: 'application/pdf' });

beforeEach(() => {
  chamadas.length = 0;
  falhar.registrar = false; falhar.upload = false; falhar.editar = false;
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

  it('no parcelado, os documentos vão para o lançamento da parcela 1, pela ordem do número da parcela', async () => {
    const id = await lancamentoDaParcela1('fin-1');
    expect(id).toBe('lanc-parcela-1');
    expect(chamadas[0]).toEqual({
      op: 'from:financiamento_parcelas',
      args: [['select', 'lancamento_id'], ['eq', 'financiamento_id', 'fin-1'], ['order', 'numero_parcela', { ascending: true }], ['limit', 1]],
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
