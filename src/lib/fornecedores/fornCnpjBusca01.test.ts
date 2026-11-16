/**
 * FORN-CNPJ-BUSCA-01 (Gabriel 16/11/2026, D1): a base da BrasilAPI não tem toda empresa ativa (404). A CNPJá aberta é a 2ª fonte, SÓ
 * quando a 1ª dá 404, falha ou estoura o prazo; a frase final diz o que houve na 2ª (não achei nas duas · limite · indisponível).
 * Respostas SINTÉTICAS (nada sai para a rede).
 */
import { describe, it, expect } from 'vitest';
import { consultarCnpj, FRASE_CNPJ_NAO_ACHADO, FRASE_CONSULTA_NO_LIMITE, FRASE_CONSULTA_INDISPONIVEL } from './consultaCnpj';
import { RESPOSTA_CNPJA, RESPOSTA_COM_FANTASIA } from './__fixtures__/respostasDaReceita';

type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
const resp = (status: number, corpo: unknown): Resp => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
const CNPJ = '11222333000181';
/* responde por fonte; guarda as URLs pedidas */
function fontes(brasil: () => Promise<Resp>, cnpja: () => Promise<Resp>) {
  const urls: string[] = [];
  const buscar = async (u: string) => {
    urls.push(u);
    if (u.includes('brasilapi')) return brasil();
    if (u.includes('cnpja')) return cnpja();
    return resp(200, { id: 5002704, nome: 'Campo Grande' });
  };
  return { urls, buscar };
}

describe('FORN-CNPJ-BUSCA-01 — 2ª fonte (CNPJá) quando a BrasilAPI não acha', () => {
  it('BrasilAPI 404 → a CNPJá preenche tudo (matriz pelo head, município pelo IBGE)', async () => {
    const f = fontes(async () => resp(404, {}), async () => resp(200, RESPOSTA_CNPJA));
    const r = await consultarCnpj(CNPJ, { buscar: f.buscar });
    expect(f.urls).toEqual([`https://brasilapi.com.br/api/cnpj/v1/${CNPJ}`, `https://open.cnpja.com/office/${CNPJ}`,
      'https://servicodados.ibge.gov.br/api/v1/localidades/municipios/5002704']);
    expect(r).toEqual({ ok: true, dados: { razaoSocial: 'OMEGA COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA', fantasia: 'Omega Materiais',
      municipio: 'Campo Grande', uf: 'MS', logradouro: 'Avenida das Pedras', numero: '500', complemento: 'Sala 3', bairro: 'Centro',
      cep: '79000-000', matrizFilial: 'MATRIZ' } });
  });
  it('BrasilAPI fora do ar ou lenta → também pergunta à CNPJá', async () => {
    const fora = fontes(async () => { throw new Error('offline'); }, async () => resp(200, RESPOSTA_CNPJA));
    expect((await consultarCnpj(CNPJ, { buscar: fora.buscar })).ok).toBe(true);
    const lenta = await consultarCnpj(CNPJ, { ms: 20, buscar: (u, init) => (u.includes('brasilapi')
      ? new Promise((_ok, falha) => { init?.signal?.addEventListener('abort', () => falha(new Error('abortado'))); })
      : Promise.resolve(u.includes('cnpja') ? resp(200, RESPOSTA_CNPJA) : resp(500, {}))) });
    expect(lenta.ok && lenta.dados.razaoSocial).toBe('OMEGA COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA');
  });
  it('BrasilAPI achou → a CNPJá NÃO é perguntada', async () => {
    const f = fontes(async () => resp(200, RESPOSTA_COM_FANTASIA), async () => resp(200, RESPOSTA_CNPJA));
    const r = await consultarCnpj(CNPJ, { buscar: f.buscar });
    expect(f.urls.some((u) => u.includes('cnpja'))).toBe(false);
    expect(r.ok && r.dados.fantasia).toBe('OMEGA COMERCIO DE MATERIAIS');
  });
  it('a frase é a da 2ª: 404 = não achei nas duas · 429 = limite · outra falha = indisponível', async () => {
    const com = async (cnpja: () => Promise<Resp>) => consultarCnpj(CNPJ, { buscar: fontes(async () => resp(404, {}), cnpja).buscar });
    expect(await com(async () => resp(404, {}))).toEqual({ ok: false, frase: FRASE_CNPJ_NAO_ACHADO });
    expect(await com(async () => resp(429, {}))).toEqual({ ok: false, frase: FRASE_CONSULTA_NO_LIMITE });
    expect(await com(async () => resp(500, {}))).toEqual({ ok: false, frase: FRASE_CONSULTA_INDISPONIVEL });
    expect(await com(async () => { throw new Error('offline'); })).toEqual({ ok: false, frase: FRASE_CONSULTA_INDISPONIVEL });
  });
  it('filial (head false) e sem a informação (head ausente)', async () => {
    const ler = async (head: unknown) => {
      const r = await consultarCnpj(CNPJ, { buscar: fontes(async () => resp(404, {}), async () => resp(200, { ...RESPOSTA_CNPJA, head })).buscar });
      return r.ok ? r.dados.matrizFilial : null;
    };
    expect([await ler(false), await ler(undefined)]).toEqual(['FILIAL', '']);
  });
});
