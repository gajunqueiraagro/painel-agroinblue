/** FORN-CRIAR-DA-NOTA-ERRO — a regra: o erro de formato do cadastro do fornecedor diz o CAMPO e o VALOR; a frase do banco em português passa. */
import { describe, it, expect } from 'vitest';
import { fraseDoErroDoFornecedor } from './erroDoCadastro';

const pg = (code: string, message: string) => ({ code, message, details: null, hint: null });
const enviado = { cliente_id: 'cli', fazenda_id: '', nome: 'Pneus Sinteticos Ltda', cpf_cnpj: '11.222.333/0001-81', uf: 'MSX' };

describe('fraseDoErroDoFornecedor', () => {
  it('22P02 do uuid vazio (o caso da NF 39.814): Fazenda, valor vazio', () => {
    expect(fraseDoErroDoFornecedor(pg('22P02', 'invalid input syntax for type uuid: ""'), enviado, 'criar o fornecedor'))
      .toBe('Fazenda: formato inválido (valor vazio). Nada foi gravado.');
  });
  it('22P02 com valor citado: o campo dono do valor', () => {
    expect(fraseDoErroDoFornecedor(pg('22P02', 'invalid input syntax for type uuid: "Pneus Sinteticos Ltda"'), enviado))
      .toBe('Nome: formato inválido (valor "Pneus Sinteticos Ltda"). Nada foi gravado.');
  });
  it('22001 texto comprido: o campo que passa do tamanho e o valor; mais de um candidato = todos', () => {
    expect(fraseDoErroDoFornecedor(pg('22001', 'value too long for type character varying(2)'), { cliente_id: 'cli', uf: 'MSX', cep: '79' }))
      .toBe('UF: até 2 caracteres (enviado "MSX"). Nada foi gravado.');
    expect(fraseDoErroDoFornecedor(pg('22001', 'value too long for type character varying(2)'), { cliente_id: 'cli', nome: 'Pneus', uf: 'MSX' }))
      .toBe('Um destes passa de 2 caracteres: Nome ("Pneus"), UF ("MSX"). Nada foi gravado.');
  });
  it('formato sem valor citado: lista os campos enviados (nunca o genérico)', () => {
    const f = fraseDoErroDoFornecedor(pg('22007', 'invalid datetime format'), { nome: 'X', cep: '7' });
    expect(f).toBe('Formato inválido num destes campos: Nome, CEP. Nada foi gravado.');
  });
  it('a frase pronta do banco em português passa como está', () => {
    expect(fraseDoErroDoFornecedor(pg('23505', 'Este CPF/CNPJ já é de Pneus Sinteticos Ltda (ativo). Nada foi gravado.'), enviado))
      .toBe('Este CPF/CNPJ já é de Pneus Sinteticos Ltda (ativo). Nada foi gravado.');
  });
  it('o resto: a ação + a frase segura (o texto cru do Postgres não vai à tela)', () => {
    const f = fraseDoErroDoFornecedor(pg('XX000', 'internal error at relation secret_table'), enviado, 'reativar o fornecedor');
    expect(f.startsWith('Não foi possível reativar o fornecedor: ')).toBe(true);
    expect(f).not.toContain('secret_table');
  });
  it('nenhum caminho devolve o genérico "Um dos campos está em formato inválido"', () => {
    for (const code of ['22P02', '22007', '22008', '22003', '22001']) {
      expect(fraseDoErroDoFornecedor(pg(code, 'qualquer coisa'), enviado)).not.toContain('Um dos campos está em formato inválido');
    }
  });
});
