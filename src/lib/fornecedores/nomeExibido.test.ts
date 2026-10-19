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
import { avisoDeInativos, contarFornecedoresDistintos } from '@/pages/FinV2FornecedoresTab';

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
    expect(r.get('a')?.title).toBe('Lineagro Produtos Agropecuarios AS · inativo');
    expect(r.get('b')?.title).toBe('Lineagro Produtos Agropecuários S.A. · 21.018.928/0007-69');
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

describe('o aviso de Cadastros', () => {
  it('conta fornecedores distintos, não lançamentos', () => {
    expect(contarFornecedoresDistintos([{ favorecido_id: 'a' }, { favorecido_id: 'a' }, { favorecido_id: 'b' }, { favorecido_id: null }])).toBe(2);
  });
  it('sem nada a dizer, nulo — nunca "0"', () => {
    expect(avisoDeInativos(null)).toBeNull();
    expect(avisoDeInativos(0)).toBeNull();
    expect(avisoDeInativos(1)).toBe('1 fornecedor inativo ainda tem lançamentos e aparece em Lançamentos Financeiros. Una ao cadastro certo pelo Mesclar.');
    expect(avisoDeInativos(19)).toContain('19 fornecedores inativos ainda têm');
  });
});

describe('a ligação nas telas (fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
  it('filtro e grade leem o MESMO rótulo do dono', () => {
    expect(tela).toMatch(/const rotulosDoRecorte = useMemo\(\s*\(\) => rotulosDosFornecedores\(/);
    expect(tela).toMatch(/hint: \[sufixoDoRotulo\(r\), String\(usos\)\]/);
    expect(tela).toContain("const rotuloForn = rotulosDoRecorte.get(l.favorecido_id || '');");
    expect(tela).toContain('data-testid="final-fornecedor"');
    expect(tela).toContain('data-testid="inativo-fornecedor"');
  });
  it('o final e o "inativo" não cortam (shrink-0); só o nome corta', () => {
    const celula = tela.slice(tela.indexOf('data-testid="celula-fornecedor"'), tela.indexOf('data-testid="inativo-fornecedor"') + 40);
    expect(celula).toContain('<span className="truncate">{fornNome}</span>');
    expect(celula.match(/shrink-0 whitespace-nowrap/g)).toHaveLength(2);
  });
  it('Cadastros tem o lugar reservado do aviso, sempre presente', () => {
    const cad = readFileSync(resolve(__dirname, '../../pages/FinV2FornecedoresTab.tsx'), 'utf8');
    expect(cad).toMatch(/<div className="h-4 [^"]*" data-testid="aviso-inativos-com-lancamento">/);
  });
});
