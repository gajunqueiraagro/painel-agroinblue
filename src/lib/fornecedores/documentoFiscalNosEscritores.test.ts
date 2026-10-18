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
    /* FORN-CADASTRO-02: o formulário guarda os campos num objeto; o payload é o do dono puro, com o documento do validador */
    expect(fonte).toContain('validarDocumento(d.cpf_cnpj)');
    expect(fonte).toContain('payloadDoFornecedor(d, documentoParaGravar)');
    expect(ler('src/lib/fornecedores/cadastroDoFornecedor.ts')).toContain('  p.cpf_cnpj = documento;');
    /* inválido trava o Salvar */
    expect(fonte).toContain('disabled={saving || documentoBloqueia || !linhaLida}');
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

describe('a mesclagem é a do FORN-MESCLAR-01 (FORN-CADASTRO-02)', () => {
  it('o cadastro não move lançamento por conta própria: o "Mesclar" do duplicado abre a ferramenta, já com o par', () => {
    const fonte = ler('src/components/financeiro-v2/FornecedorFormDialog.tsx');
    expect(fonte).not.toContain('handleMerge');
    expect(fonte).not.toMatch(/update\(\{ favorecido_id/);
    expect(fonte).toContain('onMesclar(editing.id, dup.id)');
    /* a ferramenta mora no hospedeiro (o cadastro não a importa: fecharia um ciclo de import), aberta já com o par */
    const host = ler('src/pages/FinV2FornecedoresTab.tsx');
    expect(host).toContain('onMesclar={(manter, absorver) => setMesclarPar({ manter, absorver: [absorver] })}');
    expect(host).toContain('<MesclarFornecedoresDialog aberto clienteId={clienteAtual.id} inicial={mesclarPar}');
  });
});
