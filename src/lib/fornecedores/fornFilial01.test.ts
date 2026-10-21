/**
 * FORN-FILIAL-01 (Gabriel, 21/10/2026 08h17) — fornecedor com filiais: a mesma razão social; o CNPJ (mesma raiz) e a cidade as distinguem.
 *   (1) XML: o cadastro achado pelo NOME que é OUTRA filial (mesma raiz, CNPJ diferente) não é proposto e não recebe o CNPJ; a faixa oferece
 *       criar o cadastro desta filial;
 *   (2) a consulta pública do CNPJ (BrasilAPI + o nome do município pelo IBGE) preenche; falha (rede, 404, tempo, alfanumérico) NÃO trava;
 *   (3) o formulário preenche SÓ campo vazio, e diz o que entrou.
 * Dados SINTÉTICOS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolverEmitente, raizDoCnpj } from '@/lib/financeiro/nfe/resolverEmitente';
import {
  consultarCnpj, preencherVazios, fraseDoPreenchido, caixaDeTitulo, FRASE_CONSULTA_INDISPONIVEL, FRASE_CNPJ_NAO_ACHADO, FRASE_CNPJ_ALFANUMERICO,
  type DadosDoCnpj,
} from './consultaCnpj';
import { VAZIO } from './cadastroDoFornecedor';

const TL = { id: 'tl', nome: 'Zeta Filial Agropecuária Ltda', cpf_cnpj: '11.222.333/0004-24', ativo: true };
const SEM = { id: 'sem', nome: 'Zeta Filial Agropecuária Ltda', cpf_cnpj: null, ativo: true };
const OUTRA_EMPRESA = { id: 'oe', nome: 'Zeta Filial Agropecuária Ltda', cpf_cnpj: '54.442.418/0001-88', ativo: true };

describe('FORN-FILIAL-01 — o XML de uma filial não cai no cadastro de outra', () => {
  it('a raiz do CNPJ são os 8 primeiros dígitos (CPF e torto não têm raiz)', () => {
    expect(raizDoCnpj('11.222.333/0038-73')).toBe('11222333');
    expect(raizDoCnpj('123.456.789-09')).toBe('');
    expect(raizDoCnpj(null)).toBe('');
  });
  it('achado pelo nome, OUTRA filial (mesma raiz, CNPJ diferente): não é proposto, e não oferece gravar o CNPJ nele', () => {
    const r = resolverEmitente({ documento: '11222333003873', nome: 'ZETA FILIAL AGROPECUARIA LTDA' }, [TL], 'tl');
    expect(r).toMatchObject({ achadoPor: 'nome', propostoId: null, filialDiferente: true, cadastroSemDocumento: false });
  });
  it('achado pelo nome SEM documento: proposto, e a tela oferece gravar o do XML (como antes)', () => {
    expect(resolverEmitente({ documento: '11222333003873', nome: 'x' }, [SEM], 'sem'))
      .toMatchObject({ propostoId: 'sem', filialDiferente: false, cadastroSemDocumento: true });
  });
  it('raiz diferente (outra empresa de mesmo nome): segue o caminho de "o cadastro tem outro documento"', () => {
    expect(resolverEmitente({ documento: '11222333003873', nome: 'x' }, [OUTRA_EMPRESA], 'oe'))
      .toMatchObject({ propostoId: 'oe', filialDiferente: false });
  });
  it('o documento vence o nome: a própria filial achada pelo CNPJ', () => {
    expect(resolverEmitente({ documento: '11222333000424', nome: 'x' }, [TL, SEM], 'sem')).toMatchObject({ achadoPor: 'documento', propostoId: 'tl' });
  });
  it('a faixa: "é outra filial (CNPJ …)" e "criar o cadastro desta filial" — sem a caixa de gravar o CNPJ', () => {
    const fonte = readFileSync(resolve(__dirname, '../../components/financeiro-v2/LancamentoDoXml.tsx'), 'utf8');
    const bloco = fonte.slice(fonte.indexOf("if (r.achadoPor === 'nome' && r.filialDiferente)"), fonte.indexOf("if (r.achadoPor === 'nome') {"));
    expect(bloco).toContain('é outra filial (CNPJ ${docDoCadastro}) · o XML traz ${doc}');
    expect(bloco).toContain('data-testid="xml-criar-filial"');
    expect(bloco).toContain('onClick={onCriar}');
    expect(bloco).not.toContain('xml-gravar-documento');
  });
});

/* o `buscar` da consulta, de mentira: responde por URL */
type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
const resp = (status: number, corpo: unknown): Resp => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
const RECEITA = { cnpj: '11222333003873', razao_social: 'ZETA FILIAL AGROPECUARIA LTDA', nome_fantasia: 'ZETA AGRO', municipio: 'PRESIDENTE PRUDENTE',
  codigo_municipio_ibge: 3541406, uf: 'sp', descricao_tipo_de_logradouro: 'RUA', logradouro: 'DAS FLORES', numero: '1200', complemento: 'SALA 2',
  bairro: 'CENTRO', cep: '19010000', descricao_identificador_matriz_filial: 'FILIAL' };

describe('FORN-FILIAL-01 — a consulta pública do CNPJ', () => {
  it('preenche: razão social, fantasia, o município pelo IBGE (com acento), UF, endereço e matriz/filial', async () => {
    const urls: string[] = [];
    const r = await consultarCnpj('11.222.333/0038-73', { buscar: async (u) => {
      urls.push(u);
      return u.includes('brasilapi') ? resp(200, RECEITA) : resp(200, { id: 3541406, nome: 'Presidente Prudente' });
    } });
    expect(urls).toEqual(['https://brasilapi.com.br/api/cnpj/v1/11222333003873', 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios/3541406']);
    expect(r).toEqual({ ok: true, dados: { razaoSocial: 'ZETA FILIAL AGROPECUARIA LTDA', fantasia: 'ZETA AGRO', municipio: 'Presidente Prudente', uf: 'SP',
      logradouro: 'RUA DAS FLORES', numero: '1200', complemento: 'SALA 2', bairro: 'CENTRO', cep: '19010-000', matrizFilial: 'FILIAL' } });
  });
  it('sem o IBGE (falhou), o município em caixa de título — a consulta não cai por isso', async () => {
    const r = await consultarCnpj('11222333003873', { buscar: async (u) => { if (u.includes('ibge')) throw new Error('rede'); return resp(200, RECEITA); } });
    expect(r.ok && r.dados.municipio).toBe('Presidente Prudente');
    expect(caixaDeTitulo('SAO JOAO DO OESTE')).toBe('Sao Joao do Oeste');
  });
  it('falha NUNCA trava: rede fora, limite (429), não achado (404), tempo esgotado e CNPJ alfanumérico viram frase', async () => {
    expect(await consultarCnpj('11222333003873', { buscar: async () => { throw new Error('offline'); } })).toEqual({ ok: false, frase: FRASE_CONSULTA_INDISPONIVEL });
    expect(await consultarCnpj('11222333003873', { buscar: async () => resp(429, {}) })).toEqual({ ok: false, frase: FRASE_CONSULTA_INDISPONIVEL });
    expect(await consultarCnpj('11222333003873', { buscar: async () => resp(404, {}) })).toEqual({ ok: false, frase: FRASE_CNPJ_NAO_ACHADO });
    const lento = await consultarCnpj('11222333003873', { ms: 20, buscar: (_u, init) => new Promise((_ok, falha) => {
      init?.signal?.addEventListener('abort', () => falha(new Error('abortado')));
    }) });
    expect(lento).toEqual({ ok: false, frase: FRASE_CONSULTA_INDISPONIVEL });
    expect(await consultarCnpj('12.ABC.345/01DE-35', { buscar: async () => resp(200, RECEITA) })).toEqual({ ok: false, frase: FRASE_CNPJ_ALFANUMERICO });
  });
});

describe('FORN-FILIAL-01 — o formulário preenche SÓ o vazio', () => {
  const C: DadosDoCnpj = { razaoSocial: 'ZETA FILIAL AGROPECUARIA LTDA', fantasia: 'ZETA AGRO', municipio: 'Presidente Prudente', uf: 'SP',
    logradouro: 'RUA DAS FLORES', numero: '1200', complemento: '', bairro: 'CENTRO', cep: '19010-000', matrizFilial: 'FILIAL' };
  it('o digitado fica; o vazio recebe; tipo de pessoa vira PJ só se estava vazio', () => {
    const { patch, campos } = preencherVazios({ ...VAZIO, nome: 'Zeta Filial Agropecuária Ltda', municipio: '' }, C);
    expect(patch.nome).toBeUndefined();
    expect(patch).toMatchObject({ nome_fantasia: 'ZETA AGRO', municipio: 'Presidente Prudente', uf: 'SP', logradouro: 'RUA DAS FLORES', cep: '19010-000', tipo_pessoa: 'PJ' });
    expect(campos).toEqual(['nome_fantasia', 'municipio', 'uf', 'logradouro', 'numero', 'bairro', 'cep']);
    expect(fraseDoPreenchido(campos, 'FILIAL')).toBe('Da consulta do CNPJ (filial): fantasia, cidade/UF e endereço. Confira antes de salvar.');
    expect(preencherVazios({ ...VAZIO, nome: 'a', nome_fantasia: 'b', municipio: 'c', uf: 'd', logradouro: 'e', numero: 'f', bairro: 'g', cep: 'h' }, C).campos).toEqual([]);
    expect(fraseDoPreenchido([], '')).toBeNull();
  });
  it('o cadastro chama a consulta só com o CNPJ DIGITADO e válido, e o Salvar não espera por ela (lido da fonte)', () => {
    const f = readFileSync(resolve(__dirname, '../../components/financeiro-v2/FornecedorFormDialog.tsx'), 'utf8');
    expect(f).toContain("const cnpjParaConsultar = docTocado && validado.valido && validado.tipo === 'cnpj' ? validado.digitos : '';");
    expect(f).toContain('setD((x) => ({ ...x, ...preencherVazios(x, r.dados).patch }));');
    /* o Salvar não depende da consulta */
    const salvar = f.slice(f.indexOf('data-testid="salvar-fornecedor"') - 400, f.indexOf('data-testid="salvar-fornecedor"'));
    expect(salvar).not.toContain('consulta');
  });
});
