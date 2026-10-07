/**
 * PARC-LIVRES-01 passo 5 — no PDF e na lista de Contas a Pagar e Receber, a parcela de parcelamento leva o "i/N" do CONTRATO
 * numa parte que nunca corta; o nome corta antes dele, e o "i/N" não aparece duas vezes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { contaDaFolha, type EntradaDoModelo } from './modeloCpr';

interface L { id: string; descricao: string | null; valor: number; data_competencia: string; data_vencimento: string; data_pagamento: null }
const linha = (id: string, descricao: string | null): L => ({ id, descricao, valor: 100, data_competencia: '2026-10-01', data_vencimento: '2026-10-20', data_pagamento: null });
const de = (parcelas?: Record<string, { numero: number; total: number }>): EntradaDoModelo<L>['de'] => ({
  fornecedor: () => 'F', conta: () => 'C', nomeDaConta: () => 'C', subcentro: () => 'S', centro: () => '', macro: () => '', safra: () => '', faz: () => '',
  status: () => ({ chave: 'programado', rotulo: 'Programado' }), origem: () => '', doc: () => '', receber: () => false, paga: () => false,
  ...(parcelas ? { parcela: (l: L) => parcelas[l.id] ?? null } : {}),
});

describe('contaDaFolha — a parcela do contrato', () => {
  it('forma nova e forma antiga: nome sem o "i/N", e o "i/N" na parte própria', () => {
    const d = de({ a: { numero: 2, total: 3 }, b: { numero: 2, total: 3 } });
    expect(contaDaFolha(linha('a', 'Manutenção Cercas 2/3'), d)).toMatchObject({ descricao: 'Manutenção Cercas', parcela: '2/3' });
    expect(contaDaFolha(linha('b', 'Manutenção Cercas - Parcela 2/3'), d)).toMatchObject({ descricao: 'Manutenção Cercas', parcela: '2/3' });
  });
  it('conta que não é parcela de contrato: a descrição como está e parcela vazia (mesmo terminando em "2/3")', () => {
    expect(contaDaFolha(linha('x', 'Brincos 2/3'), de({}))).toMatchObject({ descricao: 'Brincos 2/3', parcela: '' });
  });
  it('sem o resolvedor (quem não o passa): idêntico ao de antes', () => {
    expect(contaDaFolha(linha('a', 'Manutenção Cercas 2/3'), de())).toMatchObject({ descricao: 'Manutenção Cercas 2/3', parcela: '' });
    expect(contaDaFolha(linha('a', null), de())).toMatchObject({ descricao: '—', parcela: '' });
  });
});

describe('quem desenha (lido da fonte)', () => {
  const pdf = readFileSync(resolve(__dirname, 'DocumentoCpr.tsx'), 'utf8');
  const tela = readFileSync(resolve(__dirname, '../../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  const excel = readFileSync(resolve(__dirname, '../../financeiro/cprExcel.ts'), 'utf8');
  it('PDF: o "i/N" é um Text próprio que não encolhe, ao lado do nome que corta', () => {
    expect(pdf).toContain("<Text style={{ fontSize: F, color: COR.cinza, marginLeft: 3, flexShrink: 0 }}>{c.parcela}</Text>");
    expect(pdf).toContain('{c.parcela ? (');
  });
  it('tela: o "i/N" é `shrink-0 whitespace-nowrap`, vem do mapa do contrato, e o nome corta antes dele', () => {
    expect(tela).toContain('const np = nomeEParcela(l.descricao, parcelasDosLancamentos?.get(l.id));');
    expect(tela).toContain('<span className="shrink-0 whitespace-nowrap tabular-nums text-foreground" data-testid="cpr-parcela-i-n">{np.parcela}</span>');
    expect(tela).toContain('parcela: (l) => parcelasDosLancamentos?.get(l.id) ?? null,');
  });
  it('Excel: nome e "i/N" na mesma célula, uma vez', () => {
    expect(excel).toContain("'Descrição': c.parcela ? `${c.descricao === '—' ? '' : c.descricao} ${c.parcela}`.trim() : c.descricao,");
  });
});
