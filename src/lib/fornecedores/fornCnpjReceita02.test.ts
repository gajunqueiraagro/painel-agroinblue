/**
 * P31 — FORN-CNPJ-RECEITA-02: a razão social e a fantasia da Receita. Respostas GRAVADAS no formato da BrasilAPI (sintéticas; nada chama
 * a Receita): o vazio é preenchido como antes, e o que DIFERE é oferecido ("Usar"), nunca escrito por cima. Diferença só de caixa,
 * acento ou espaço não é diferença (a gravação padroniza a caixa).
 */
import { describe, it, expect } from 'vitest';
import { consultarCnpj, ofertasDaReceita, preencherVazios } from './consultaCnpj';
import { VAZIO } from './cadastroDoFornecedor';
import { RESPOSTA_COM_FANTASIA, RESPOSTA_SEM_FANTASIA } from './__fixtures__/respostasDaReceita';

type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
const resp = (status: number, corpo: unknown): Resp => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
const ler = async (corpo: unknown) => {
  const r = await consultarCnpj(String(Reflect.get(Object(corpo), 'cnpj')), { buscar: async (u) => (u.includes('ibge') ? resp(500, {}) : resp(200, corpo)) });
  if (r.ok === false) throw new Error(r.frase);
  return r.dados;
};

describe('P31 — razão social e fantasia da Receita', () => {
  it('a resposta gravada traz as duas; o cadastro VAZIO recebe as duas (como antes)', async () => {
    const c = await ler(RESPOSTA_COM_FANTASIA);
    expect([c.razaoSocial, c.fantasia]).toEqual(['OMEGA COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA', 'OMEGA COMERCIO DE MATERIAIS']);
    expect(preencherVazios(VAZIO, c).patch).toMatchObject({ nome: c.razaoSocial, nome_fantasia: c.fantasia });
    expect(ofertasDaReceita(VAZIO, c)).toEqual([]);
  });
  it('escrito e DIFERENTE: não escreve por cima — OFERECE (campo · hoje · Receita)', async () => {
    const c = await ler(RESPOSTA_COM_FANTASIA);
    const d = { ...VAZIO, nome: 'Omega Materiais', nome_fantasia: 'Loja do Omega' };
    expect(preencherVazios(d, c).patch.nome).toBeUndefined();
    expect(ofertasDaReceita(d, c)).toEqual([
      { campo: 'nome', rotulo: 'Razão social', hoje: 'Omega Materiais', receita: 'OMEGA COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA' },
      { campo: 'nome_fantasia', rotulo: 'Fantasia', hoje: 'Loja do Omega', receita: 'OMEGA COMERCIO DE MATERIAIS' }]);
  });
  it('igual a menos de caixa, acento e espaço: nada a oferecer', async () => {
    const c = await ler(RESPOSTA_COM_FANTASIA);
    expect(ofertasDaReceita({ nome: 'Omega Comércio de Materiais de  Construção Ltda', nome_fantasia: 'omega comercio de materiais' }, c)).toEqual([]);
  });
  it('a Receita sem fantasia (""): nada a oferecer na fantasia, e o vazio continua vazio', async () => {
    const c = await ler(RESPOSTA_SEM_FANTASIA);
    expect(ofertasDaReceita({ nome: 'Sigma', nome_fantasia: 'Sigma Foods' }, c).map((o) => o.campo)).toEqual(['nome']);
    expect(preencherVazios(VAZIO, c).patch.nome_fantasia).toBeUndefined();
  });
});
