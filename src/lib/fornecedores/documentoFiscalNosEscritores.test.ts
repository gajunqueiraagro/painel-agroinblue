/**
 * FORN-EDITAR-01 — TESTE DE FONTE: os quatro pontos que gravam CPF/CNPJ no cadastro (`FornecedorFormDialog`, criar e editar;
 * `NovoFornecedorDialog`; `criarFornecedorDaCasa`; `gravarDocumentoNoCadastro`, o CNPJ do XML) importam o validador único e
 * nenhum deles grava `cpf_cnpj` sem passar por ele. Com auto-teste do detector.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf8');

const IMPORT_DO_VALIDADOR = /from '(@\/lib\/fornecedores|\.)\/documentoFiscal'/;

/** O que vai em `cpf_cnpj:` dentro de um insert/update — tem de ser o que o validador devolveu. */
function valoresGravados(fonte: string): string[] {
  return Array.from(fonte.matchAll(/cpf_cnpj:\s*([^,}\n]+)/g)).map((m) => m[1].trim());
}
const CRU = /^(cpfCnpj|dados\.cpfCnpj|documento|formatado)\b|\.trim\(\)/;

describe('o detector sabe achar', () => {
  it('acusa um insert que grava o texto cru', () => {
    const torto = `supabase.from('financeiro_fornecedores').insert({ nome, cpf_cnpj: cpfCnpj.trim() || null })`;
    expect(valoresGravados(torto).some((v) => CRU.test(v))).toBe(true);
    expect(IMPORT_DO_VALIDADOR.test(`import { soDigitos } from './fornecedorTexto';`)).toBe(false);
  });
});

describe('os quatro escritores passam pelo validador único', () => {
  it('FornecedorFormDialog (criar e editar): grava o documento do validador', () => {
    const fonte = ler('src/components/financeiro-v2/FornecedorFormDialog.tsx');
    expect(fonte).toMatch(IMPORT_DO_VALIDADOR);
    expect(fonte).toContain('validarDocumento(cpfCnpj)');
    const gravados = valoresGravados(fonte.slice(fonte.indexOf('const payload')));
    expect(gravados[0]).toBe('documentoParaGravar');
    expect(gravados.some((v) => CRU.test(v))).toBe(false);
    /* inválido trava o Salvar */
    expect(fonte).toContain('disabled={saving || !nome.trim() || documentoBloqueia}');
  });
  it('NovoFornecedorDialog: confere e entrega ao hospedeiro o documento formatado', () => {
    const fonte = ler('src/components/financeiro-v2/NovoFornecedorDialog.tsx');
    expect(fonte).toMatch(IMPORT_DO_VALIDADOR);
    expect(fonte).toContain('await onSave(nome.trim(), documento.formatado || undefined)');
    expect(fonte).toContain('cpfCnpj: documento.formatado');
    expect(fonte).not.toMatch(/onSave\([^)]*cpfCnpj\.trim\(\)/);
  });
  it('criarFornecedorDaCasa: recusa o inválido e grava o formatado', () => {
    const fonte = ler('src/lib/fornecedores/cadastroDaCasaBanco.ts');
    expect(fonte).toMatch(IMPORT_DO_VALIDADOR);
    expect(fonte).toContain('validarDocumento(dados.cpfCnpj)');
    expect(valoresGravados(fonte)).toContain('documento.formatado || null');
    expect(valoresGravados(fonte).filter((v) => /^dados\.cpfCnpj/.test(v))).toEqual([]);
  });
  it('gravarDocumentoNoCadastro (XML): só o formatado do validador', () => {
    const fonte = ler('src/lib/financeiro/nfeConsultas.ts');
    expect(fonte).toMatch(IMPORT_DO_VALIDADOR);
    expect(fonte).toContain('validarDocumento(documento)');
    expect(fonte).toContain('.update({ cpf_cnpj: validado.formatado })');
    expect(fonte).not.toContain('documentoFormatado(');
  });
});

describe('a mesclagem fica travada (FORN-MESCLAR-01)', () => {
  it('o código fica, a entrada não', () => {
    const fonte = ler('src/components/financeiro-v2/FornecedorFormDialog.tsx');
    expect(fonte).toContain('const MESCLAR_LIGADO = false;');
    expect(fonte).toContain('const handleMerge = useCallback(');
    expect(fonte).toContain('disabled={!MESCLAR_LIGADO}');
    expect(fonte).toContain('Indisponível: hoje a mesclagem move só os lançamentos financeiros. Será refeita (FORN-MESCLAR-01).');
  });
});
