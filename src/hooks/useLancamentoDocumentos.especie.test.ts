/**
 * OC-DOC-ESPECIE-01 — o anexo NUNCA fala de espécie, e a espécie escolhida sobrevive ao arquivo.
 *
 * ⚠ NASCE DE 13 DOCUMENTOS REAIS (05/09 a 25/09/2026): todo documento criado JÁ com arquivo, num clique
 *   só, ficou em 'outro' — o nome automático ("nf 000.059.956", "recibo Pedido Whats") dizia a espécie
 *   escolhida, e o `anexar` a sobrescrevia com `doc?.especie ?? 'outro'`, lido de uma lista que ainda
 *   não conhecia o documento recém-criado.
 * ⚠ OS CASOS REPETEM O CLIQUE DE VERDADE: `registrar` e `anexar` saem do MESMO objeto da API, capturado
 *   antes do gesto — exatamente o que o `salvar` do formulário faz. Chamar `result.current` de novo entre
 *   os dois esconderia o defeito, porque o segundo render já traz a lista nova.
 * ⚠ O BANCO FALSO RECUSA ESPÉCIE ONDE ELA NÃO PODE VIR: no anexo (payload com `url`) e na edição de um
 *   documento da OC feita pela aba do lançamento (lá a espécie é só leitura). Assim o teste falha pelo
 *   gesto proibido, não só pelo estado final.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

interface Doc { id: string; especie: string; nome: string; versao: number; url: string | null; origem: 'lancamento' | 'operacao' }
const L = 'lanc-0001';
const CLI = 'cli-0001';
const OP = 'op-0001';
let fin: Map<string, Doc>;
let oc: Map<string, Doc>;
let operacao: string | null;
let uploads: { bucket: string; caminho: string }[];
let chamadas: { fn: string; payload: Record<string, unknown> }[];
let seq = 0;

const erro = (message: string) => ({ data: null, error: { message } });
const envelope = (id: string) => ({ data: { documento_id: id, confronto: null }, error: null });

function editarNo(tabela: Map<string, Doc>, fn: string, a: Record<string, unknown>) {
  const p = (a.p_payload ?? {}) as Record<string, unknown>;
  chamadas.push({ fn, payload: p });
  if ('url' in p && 'especie' in p) return erro(`${fn}: o ANEXO mandou especie (${String(p.especie)})`);
  if (fn === 'oc_documento_editar' && 'especie' in p) return erro('oc_documento_editar: especie da OC e so leitura no lancamento');
  const d = tabela.get(String(a.p_documento_id));
  if (!d) return erro(`${fn}: documento inexistente nesta tabela (${String(a.p_documento_id)})`);
  if (d.versao !== a.p_versao_esperada) return erro(`${fn}: versao ${d.versao}, esperada ${String(a.p_versao_esperada)}`);
  if (typeof p.especie === 'string') d.especie = p.especie;
  if (typeof p.url === 'string') d.url = p.url;
  d.versao += 1;
  return envelope(d.id);
}

const rpc = vi.fn(async (fn: string, a: Record<string, unknown>) => {
  const p = (a.p_payload ?? {}) as Record<string, unknown>;
  switch (fn) {
    case 'fin_documento_confronto':
      return { data: { valor_lancamento: 100, valor_documentado: 0, docs_ativos: 0, docs_com_valor: 0, diferenca: -100, confere: false }, error: null };
    case 'fin_documento_registrar': {
      chamadas.push({ fn, payload: p });
      const id = `fin-${++seq}`;
      const especie = String(p.especie ?? 'outro');
      /* O nome automatico e' o da RPC real: `coalesce(nome, especie || ' ' || numero)`. */
      fin.set(id, { id, especie, nome: String(p.nome ?? `${especie} ${String(p.numero ?? '')}`), versao: 1, url: null, origem: 'lancamento' });
      return envelope(id);
    }
    case 'oc_documento_registrar': {
      chamadas.push({ fn, payload: p });
      const id = `oc-${++seq}`;
      oc.set(id, { id, especie: String(p.especie ?? 'outro'), nome: String(p.nome ?? ''), versao: 1, url: null, origem: 'operacao' });
      return envelope(id);
    }
    case 'fin_documento_editar': return editarNo(fin, fn, a);
    case 'oc_documento_editar': return editarNo(oc, fn, a);
    case 'fin_documento_cancelar':
    case 'oc_documento_cancelar': {
      chamadas.push({ fn, payload: {} });
      const tabela = fn === 'oc_documento_cancelar' ? oc : fin;
      if (!tabela.has(String(a.p_documento_id))) return erro(`${fn}: documento inexistente nesta tabela (${String(a.p_documento_id)})`);
      tabela.delete(String(a.p_documento_id));
      return envelope(String(a.p_documento_id));
    }
    default: return erro(`rpc inesperada: ${fn}`);
  }
});

function linhaDaView(d: Doc) {
  return {
    documento_id: d.id, origem: d.origem, operacao_id: d.origem === 'operacao' ? OP : null, especie: d.especie,
    nome: d.nome, versao: d.versao, url: d.url, cancelado: false,
  };
}
function from(tabela: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'order', 'limit']) b[m] = () => b;
  b.maybeSingle = async () => ({ data: operacao ? { operacao_id: operacao, zoo_operacoes_comerciais: { tipo_operacao: 'venda' } } : null, error: null });
  b.then = (ok: (v: unknown) => unknown) => {
    const data = tabela === 'vw_lancamento_documentos' ? [...fin.values(), ...(operacao ? [...oc.values()] : [])].map(linhaDaView) : [];
    return Promise.resolve({ data, error: null }).then(ok);
  };
  return b;
}
const storage = {
  from: (bucket: string) => ({
    upload: async (caminho: string) => { uploads.push({ bucket, caminho }); return { data: { path: caminho }, error: null }; },
    createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }),
  }),
};
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: (fn: string, a: Record<string, unknown>) => rpc(fn, a),
  from: (t: string) => from(t),
  get storage() { return storage; },
} }));

import { useLancamentoDocumentos, rotuloEspecieDoc, type EspecieLancDoc, type DestinoDocumento } from '@/hooks/useLancamentoDocumentos';

const pdf = () => new File(['%PDF'], 'nota.pdf', { type: 'application/pdf' });

async function montar() {
  const h = renderHook(() => useLancamentoDocumentos(L, CLI));
  await waitFor(() => expect(h.result.current.loading).toBe(false));
  if (operacao) await waitFor(() => expect(h.result.current.operacaoId).toBe(operacao));
  return h;
}

beforeEach(() => {
  fin = new Map(); oc = new Map(); operacao = null; uploads = []; chamadas = []; seq = 0; rpc.mockClear();
});

describe('criar com arquivo num gesto so', () => {
  it.each<EspecieLancDoc>(['nf', 'boleto', 'recibo', 'comprovante', 'outro'])('%s continua %s depois do anexo', async (especie) => {
    const { result } = await montar();
    /* O MESMO objeto nos dois passos — a lista dele ainda nao tem o documento novo. */
    const api = result.current;
    await act(async () => {
      const criado = await api.registrar({ especie, numero: '000.059.956' });
      expect(criado).not.toBeNull();
      await api.anexar(criado!.id, 1, pdf(), criado!);
    });
    const [doc] = [...fin.values()];
    expect(doc.especie).toBe(especie);
    expect(doc.url).toMatch(new RegExp(`^${CLI}/${L}/${doc.id}-\\d+\\.pdf$`));
    expect(uploads.map(u => u.bucket)).toEqual(['fin-documentos']);
    /* O anexo mandou SO o arquivo. */
    const anexo = chamadas.find(c => c.fn === 'fin_documento_editar');
    expect(Object.keys(anexo!.payload).sort()).toEqual(['tamanho_bytes', 'tipo', 'url']);
  });
});

describe('editar trocando a especie e anexando', () => {
  it('a especie nova fica — o anexo nao a devolve para a velha', async () => {
    fin.set('fin-velho', { id: 'fin-velho', especie: 'recibo', nome: 'recibo 1', versao: 1, url: null, origem: 'lancamento' });
    const { result } = await montar();
    const api = result.current;
    const destino: DestinoDocumento = { origem: 'lancamento', operacaoId: null };
    await act(async () => {
      await api.editar('fin-velho', 1, { especie: 'boleto' });
      await api.anexar('fin-velho', 2, pdf(), destino);
    });
    expect(fin.get('fin-velho')).toMatchObject({ especie: 'boleto', versao: 3 });
    expect(fin.get('fin-velho')!.url).not.toBeNull();
  });
});

describe('destino OC com arquivo', () => {
  it('sobe no bucket da OC e grava so a url pelo writer da OC', async () => {
    operacao = OP;
    const { result } = await montar();
    const api = result.current;
    await act(async () => {
      const criado = await api.registrar({ especie: 'nf', numero: '119306' });
      expect(criado).toMatchObject({ origem: 'operacao', operacaoId: OP });
      await api.anexar(criado!.id, 1, pdf(), criado!);
    });
    const [doc] = [...oc.values()];
    expect(fin.size).toBe(0);
    expect(doc.especie).toBe('nf_principal');
    expect(uploads).toEqual([{ bucket: 'oc-documentos', caminho: `${CLI}/${OP}/${doc.id}.pdf` }]);
    const anexo = chamadas.find(c => c.fn === 'oc_documento_editar');
    expect(anexo!.payload).toEqual({ url: `${CLI}/${OP}/${doc.id}.pdf` });
    /* E nada foi ao writer do lancamento. */
    expect(chamadas.some(c => c.fn === 'fin_documento_editar')).toBe(false);
  });

  it('editar documento da OC sem falar da especie a preserva (NF complementar nao vira principal)', async () => {
    operacao = OP;
    oc.set('oc-comp', { id: 'oc-comp', especie: 'nf_complementar', nome: 'NF 2', versao: 1, url: null, origem: 'operacao' });
    const { result } = await montar();
    await waitFor(() => expect(result.current.documentos).toHaveLength(1));
    await act(async () => { await result.current.editar('oc-comp', 1, { nome: 'NF 2 corrigida' }); });
    expect(oc.get('oc-comp')).toMatchObject({ especie: 'nf_complementar', versao: 2 });
  });
});

describe('cancelar documento da OC pela aba do lancamento', () => {
  it('vai ao writer da OC, nao ao do lancamento', async () => {
    operacao = OP;
    oc.set('oc-p', { id: 'oc-p', especie: 'nf_principal', nome: 'NF', versao: 1, url: null, origem: 'operacao' });
    const { result } = await montar();
    await waitFor(() => expect(result.current.documentos).toHaveLength(1));
    await act(async () => { await result.current.cancelar('oc-p', 'duplicada'); });
    expect(chamadas.map(c => c.fn)).toEqual(['oc_documento_cancelar']);
  });
});

describe('leitura na aba do lancamento', () => {
  it('nf_principal da OC aparece como NF, e nf_complementar como NF complementar', async () => {
    operacao = OP;
    oc.set('oc-p', { id: 'oc-p', especie: 'nf_principal', nome: 'NF', versao: 1, url: null, origem: 'operacao' });
    oc.set('oc-c', { id: 'oc-c', especie: 'nf_complementar', nome: 'NF c', versao: 1, url: null, origem: 'operacao' });
    oc.set('oc-o', { id: 'oc-o', especie: 'outro', nome: 'romaneio', versao: 1, url: null, origem: 'operacao' });
    const { result } = await montar();
    await waitFor(() => expect(result.current.documentos).toHaveLength(3));
    const por = (id: string) => result.current.documentos.find(d => d.id === id)!;
    expect(por('oc-p').especie).toBe('nf');
    expect(rotuloEspecieDoc(por('oc-p'))).toBe('NF');
    expect(rotuloEspecieDoc(por('oc-c'))).toBe('NF complementar');
    /* A busca sabe achar o "Outro" de verdade — nao e' tudo NF. */
    expect(rotuloEspecieDoc(por('oc-o'))).toBe('Outro');
  });
});

describe('o banco falso recusa especie no anexo', () => {
  it('prova que a guarda existe: um anexo que mande especie falha', async () => {
    fin.set('fin-x', { id: 'fin-x', especie: 'nf', nome: 'nf 1', versao: 1, url: null, origem: 'lancamento' });
    const r = await rpc('fin_documento_editar', {
      p_documento_id: 'fin-x', p_cliente_id: CLI, p_versao_esperada: 1, p_payload: { url: 'a.pdf', especie: 'outro' },
    });
    expect(r.error?.message).toMatch(/ANEXO mandou especie/);
    expect(fin.get('fin-x')!.especie).toBe('nf');
  });
});
