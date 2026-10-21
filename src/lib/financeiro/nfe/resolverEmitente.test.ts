/**
 * NOTA-FORNECEDOR-DUPLICA-01 — o emitente sem CNPJ no cadastro e' achado pelo NOME, com a regra da busca do cadastro, entre os
 * cadastros ATIVOS SEM DOCUMENTO (o caso de 21/10: o cadastro antigo sem CNPJ nao foi achado e "Cadastrar" criou um duplicado).
 * Nomes e documentos SINTETICOS.
 */
import { describe, it, expect } from 'vitest';
import { nomeSemDocumento, resolverEmitente, semDocumentoPeloNome, type FornecedorParaResolver } from './resolverEmitente';

const CNPJ = '11222333000424';
const f = (id: string, nome: string, extra: Partial<FornecedorParaResolver> = {}): FornecedorParaResolver => ({ id, nome, cpf_cnpj: null, ativo: true, ...extra });

describe('R — o cadastro sem documento, pelo nome', () => {
  it('R1 o MEI ("22.522.463 NOME"): o prefixo de CNPJ sai e o cadastro antigo sem CNPJ e\' o proposto', () => {
    expect(nomeSemDocumento('11.222.333 FULANO SINTETICO DE TESTE')).toBe('FULANO SINTETICO DE TESTE');
    expect(nomeSemDocumento('FULANO SINTETICO DE TESTE 52998224725')).toBe('FULANO SINTETICO DE TESTE');
    const r = resolverEmitente({ documento: CNPJ, nome: '11.222.333 FULANO SINTETICO DE TESTE' }, [f('a', 'Fulano Sintético de Teste')], null);
    expect(r).toMatchObject({ achadoPor: 'nome', propostoId: 'a', cadastroSemDocumento: true, filialDiferente: false });
  });
  it('R2 o nome cortado do DANFE ("… LTD") acha o "… Ltda"; a fantasia e a razao social da Receita tambem procuram', () => {
    expect(resolverEmitente({ documento: CNPJ, nome: 'AGRO SINTETICA INSUMOS LTD' }, [f('a', 'Agro Sintetica Insumos Ltda')], null).propostoId).toBe('a');
    expect(resolverEmitente({ documento: CNPJ, nome: 'XYZ', fantasia: 'Vidracaria Sintetica' }, [f('b', 'Vidraçaria Sintética')], null).propostoId).toBe('b');
    expect(resolverEmitente({ documento: CNPJ, nome: 'XYZ' }, [f('c', 'Razao Sintetica Completa Ltda')], null, ['RAZAO SINTETICA COMPLETA LTDA']).propostoId).toBe('c');
  });
  it('R3 so\' entre os SEM documento, ATIVOS e nao mesclados', () => {
    const lista = [f('doc', 'Fulano Sintetico de Teste', { cpf_cnpj: '99.888.777/0001-00' }), f('ina', 'Fulano Sintetico de Teste', { ativo: false }),
      f('mes', 'Fulano Sintetico de Teste', { fundido_em_id: 'x' })];
    expect(semDocumentoPeloNome(['FULANO SINTETICO DE TESTE'], lista)).toEqual([]);
    expect(resolverEmitente({ documento: CNPJ, nome: 'FULANO SINTETICO DE TESTE' }, lista, null).achadoPor).toBeNull();
  });
  it('R4 dois cadastros sem documento casam: o operador escolhe (nenhum proposto)', () => {
    const r = resolverEmitente({ documento: CNPJ, nome: 'FULANO SINTETICO' }, [f('a', 'Fulano Sintetico'), f('b', 'Fulano Sintetico Filho')], null);
    expect([r.achadoPor, r.propostoId, r.candidatos.map((c) => c.id)]).toEqual(['nome', null, ['a', 'b']]);
  });
  it('R5 termo curto (menos de 5 letras) nao procura: nada de achar qualquer coisa', () => {
    expect(semDocumentoPeloNome(['ABC'], [f('a', 'ABC Comercio')])).toEqual([]);
  });
  it('R6 o documento manda: com CNPJ igual, e\' ele (a busca por nome nem entra)', () => {
    const r = resolverEmitente({ documento: CNPJ, nome: 'FULANO SINTETICO DE TESTE' }, [f('semdoc', 'Fulano Sintetico de Teste'), f('comdoc', 'Outro Nome', { cpf_cnpj: '11.222.333/0004-24' })], null);
    expect([r.achadoPor, r.propostoId]).toEqual(['documento', 'comdoc']);
  });
});
