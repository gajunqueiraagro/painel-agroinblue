/**
 * FORN-NOME-EXIBIDO-01 (Gabriel 19/10/2026) — uma regra de nome exibido: a razão social sempre; entre os parecidos da mesma lista,
 * o fim do CNPJ/CPF ou "sem CNPJ"; o inativo marcado. Caso real (sintético): os três Lineagro da Vera no filtro de Lançamentos
 * — o "Pec.3M-" é outro cadastro de propósito (rateio) e não ganha final.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chaveDoNomeComparado, finalDoDocumento, rotulosDosFornecedores, sufixoDoRotulo, FINAL_SEM_DOCUMENTO,
} from './fornecedorTexto';
import { faixaDoInativo, inativosDasLinhas } from '@/pages/FinV2FornecedoresTab';

const LINEAGRO = [
  { id: 'a', nome: 'Lineagro Produtos Agropecuarios AS', cpf_cnpj: null, ativo: false },
  { id: 'b', nome: 'Lineagro Produtos Agropecuários S.A.', cpf_cnpj: '21.018.928/0007-69', ativo: true },
  { id: 'c', nome: 'Pec.3M-Lineagro Produtos Agropecuários', cpf_cnpj: null, ativo: true },
  { id: 'd', nome: 'Auto Posto Tapajós', cpf_cnpj: '02.152.457/0001-47', ativo: true },
];

describe('o nome comparado', () => {
  it('ignora acento, caixa, pontuação e sufixo societário', () => {
    const k = chaveDoNomeComparado('Lineagro Produtos Agropecuarios AS');
    expect(k).toBe('lineagro produtos agropecuarios');
    expect(chaveDoNomeComparado('Lineagro Produtos Agropecuários S.A.')).toBe(k);
    expect(chaveDoNomeComparado('Cleodir Supermercados Eireli-EPP')).toBe('cleodir supermercados');
  });
  it('"Pec.3M-X" e "X" NÃO são parecidos: o prefixo marca o pagamento por rateio (NF no nome do Higino)', () => {
    expect(chaveDoNomeComparado('Pec.3M-Lineagro Produtos Agropecuários')).not.toBe(chaveDoNomeComparado('Lineagro Produtos Agropecuários S.A.'));
    expect(chaveDoNomeComparado('Pec.3M-Higino Hernandes Neto')).not.toBe(chaveDoNomeComparado('Higino Hernandes Neto'));
    /* dois do MESMO lado continuam comparáveis */
    expect(chaveDoNomeComparado('Pec.3M-Cleodir Supermercados Eireli-EPP')).toBe(chaveDoNomeComparado('Pec.3M-Cleodir Supermercados'));
  });
  it('não junta nomes diferentes nem come pedaço de palavra', () => {
    expect(chaveDoNomeComparado('Casas Bahia')).toBe('casas bahia');
    expect(chaveDoNomeComparado('Lineagro')).not.toBe(chaveDoNomeComparado('Lineagro Sementes'));
  });
});

describe('o final do documento', () => {
  it('CNPJ, CPF, outro tamanho e vazio', () => {
    expect(finalDoDocumento('21.018.928/0007-69')).toBe('…0007-69');
    expect(finalDoDocumento('123.456.789-09')).toBe('…789-09');
    expect(finalDoDocumento('1234567')).toBe('…4567');
    expect(finalDoDocumento(null)).toBe(FINAL_SEM_DOCUMENTO);
    expect(finalDoDocumento('  ')).toBe('sem CNPJ');
  });
});

describe('os rótulos de uma lista', () => {
  it('os parecidos ganham o final; o único não; o inativo é marcado', () => {
    const r = rotulosDosFornecedores(LINEAGRO);
    expect(r.get('a')).toMatchObject({ nome: 'Lineagro Produtos Agropecuarios AS', final: 'sem CNPJ', inativo: true });
    expect(r.get('b')).toMatchObject({ final: '…0007-69', inativo: false });
    expect(r.get('c')).toMatchObject({ final: null, inativo: false });
    expect(r.get('d')).toMatchObject({ final: null, inativo: false });
    expect(sufixoDoRotulo(r.get('a'))).toBe('sem CNPJ · inativo');
    expect(sufixoDoRotulo(r.get('d'))).toBe('');
    /* FIN-V2-FORNECEDOR-SEM-SUFIXO-01 — o `title` leva o detalhe que a tabela não escreve: documento inteiro ou "sem CNPJ", cidade/UF, inativo */
    expect(r.get('a')?.title).toBe('Lineagro Produtos Agropecuarios AS · sem CNPJ · inativo');
    expect(r.get('b')?.title).toBe('Lineagro Produtos Agropecuários S.A. · 21.018.928/0007-69');
    expect(rotulosDosFornecedores([{ id: 'f', nome: 'Lineagro Produtos Agropecuários S.A.', cpf_cnpj: '21018928000769', ativo: true, municipio: 'Dourados', uf: 'MS' }])
      .get('f')?.title).toBe('Lineagro Produtos Agropecuários S.A. · 21.018.928/0007-69 · Dourados/MS');
  });
  it('o final depende da LISTA: sozinho na lista, sem final', () => {
    const r = rotulosDosFornecedores([LINEAGRO[1], LINEAGRO[3]]);
    expect(r.get('b')?.final).toBeNull();
  });
  it('inativo sem parecido: só a marca', () => {
    const r = rotulosDosFornecedores([{ id: 'x', nome: 'Sicredi', cpf_cnpj: null, ativo: false }]);
    expect(sufixoDoRotulo(r.get('x'))).toBe('inativo');
  });
});

describe('a faixa de Cadastros (FORN-01b: nomeia o inativo)', () => {
  it('junta por fornecedor (uma linha por lançamento), o de maior valor primeiro', () => {
    const r = inativosDasLinhas([{ favorecido_id: 'a', valor: -100, nome: 'Alfa' }, { favorecido_id: 'a', valor: -50, nome: 'Alfa' },
      { favorecido_id: 'b', valor: 1000, nome: 'Beta' }, { favorecido_id: null, valor: 5, nome: null }]);
    expect(r).toEqual([{ id: 'b', nome: 'Beta', lancamentos: 1, valor: 1000 }, { id: 'a', nome: 'Alfa', lancamentos: 2, valor: 150 }]);
  });
  it('a frase diz quem, quantos e quanto; com mais de um, "e mais N"; sem nada a dizer, nula — nunca "0"', () => {
    expect(faixaDoInativo(null)).toBeNull();
    expect(faixaDoInativo([])).toBeNull();
    const um = faixaDoInativo([{ id: 'x', nome: 'Cartório Exemplo de Notas', lancamentos: 6, valor: 38876 }]);
    expect(um?.texto).toBe('Cartório Exemplo de Notas (inativo) · 6 lançamentos · R$\u00a038.876,00');
    expect(um?.primeiro.id).toBe('x');
    expect(faixaDoInativo([{ id: 'x', nome: 'Um', lancamentos: 1, valor: 1 }, { id: 'y', nome: 'Dois', lancamentos: 2, valor: 0.5 }])?.texto)
      .toBe('Um (inativo) · 1 lançamento · R$\u00a01,00 · e mais 1 inativo com lançamentos');
  });
});

describe('a ligação nas telas (fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
  it('filtro e grade leem o MESMO rótulo do dono', () => {
    expect(tela).toMatch(/const rotulosDoRecorte = useMemo\(\s*\(\) => rotulosDosFornecedores\(/);
    /* FORN-BUSCA-UNICA-01 — o filtro é o seletor padrão: o documento inteiro, a situação e o uso no item (não mais o final) */
    expect(tela).toMatch(/<FavorecidoSelect[\s\S]{0,200}fornecedores=\{fornecedoresDoFiltro\}[\s\S]{0,40}situacao="todos"/);
    expect(tela).toContain("const rotuloForn = rotulosDoRecorte.get(l.favorecido_id || '');");
  });
  it('FIN-V2-FORNECEDOR-SEM-SUFIXO-01 — na tabela, SÓ o nome (corta com "…"); o detalhe vai no `title`; sem final nem "inativo" grudado', () => {
    const ini = tela.indexOf('<td className="truncate px-1 py-1 align-middle text-[12px] leading-tight text-muted-foreground"');
    const celula = tela.slice(ini, tela.indexOf('</td>', ini));
    expect(celula).toContain("title={rotuloForn?.title ?? fornNome ?? ''} data-testid=\"celula-fornecedor\"");
    expect(celula).toContain('{fornNome ? fornNome : ');
    expect(tela).not.toContain('data-testid="final-fornecedor"');
    expect(tela).not.toContain('data-testid="inativo-fornecedor"');
    expect(celula).not.toContain('rotuloForn?.final');
  });
  it('Cadastros tem o lugar reservado do aviso, sempre presente', () => {
    const cad = readFileSync(resolve(__dirname, '../../pages/FinV2FornecedoresTab.tsx'), 'utf8');
    expect(cad).toMatch(/<div className="h-4 [^"]*" data-testid="aviso-inativos-com-lancamento">/);
  });
});
