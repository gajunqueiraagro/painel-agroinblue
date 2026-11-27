/**
 * CAIXA-FOLHA-VERA (Gabriel 15:10) — as guias da folha na Caixa: a GFD (só PIX) vira a linha "Guia do FGTS" (antes "Não sei · sem linha
 * digitável nem chave"); o DARF lido como boleto ganha o beneficiário "Receita Federal" (sem ele a sugestão por nome não achava o previsto);
 * os ARRASTADOS guardados ficam num grupo só, "Arrastados para a Caixa".
 * ⚠ Dado INVENTADO (o PIX é o exemplo do Manual do BR Code; a arrecadação é a sintética do linhaDigitavelDv.test).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { lerDaCaixaCom } from '@/hooks/useCaixaDeBoletos';
import { gruposDosEmails, linhaDaGfd, linhasDasFontes } from '@/lib/financeiro/boleto/caixaPorEmail';
import { lerGfd } from './lerGuiasDaFolha';
import type { EntradaDoEmail } from '@/lib/financeiro/boleto/entradaEmailApi';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

const PIX = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';
const GFD: string[][] = [
  ['GFD - Guia do FGTS Digital'], ['Pagar este documento até'], ['CPF/CNPJ do Empregador', 'Nome/Razão Social do Empregador'], ['18/12/2026'],
  ['Valor a recolher'], ['Núm. de Pág.', 'Identificador', 'Tag'], ['883,60'], ['1', '0000000000000000-0', '00000000000 11/2026 MENSAL'],
  ['11/2026', '3', '883,60', '0,00', '0,00', '0,00', '883,60'], ['PIX Copia e Cola:'], ['00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano', 'de', 'Tal6008BRASILIA62070503***63041D3D'],
];
const DARF: string[][] = [
  ['Documento de Arrecadação'], ['de Receitas Federais'], ['Período de Apuração', 'Data de Vencimento', 'Número do Documento'],
  ['Novembro/2026', '18/12/2026', '07.00.00000.0000000-0'], ['Valor Total do Documento'], ['1.013,23'],
  ['81660000001-1 23450001111-4 22223333444-0 45555666677-0'],
];
const pdfjsDe = (linhas: string[][]): PdfjsMinimo => ({
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({
    getViewport: () => ({ width: 595, height: 842 }),
    getTextContent: async () => ({ items: linhas.flatMap((cs, l) => cs.map((str, c) => ({ str, transform: [10, 0, 0, 10, 20 + c * 130, 800 - l * 14], width: 100, height: 10 }))) }),
  }) }) }),
});
const ler = (linhas: string[][]) => lerDaCaixaCom(pdfjsDe(linhas))(new TextEncoder().encode('%PDF falso').buffer, 'pdf');

describe('as guias da folha na Caixa', () => {
  it('a GFD vira o tipo gfd (competência, vencimento, valor, PIX conferido)', async () => {
    const r = await ler(GFD);
    expect(r.k).toBe('gfd');
    if (r.k !== 'gfd') return;
    expect(r.gfd).toMatchObject({ competencia: '2026-11', vencimento: '2026-12-18', valor: 883.6, trabalhadores: 3, pix: PIX });
  });
  it('a linha da GFD: "Guia do FGTS · 11/2026", o valor, o vencimento e o PIX; só Ignorar (nada grava)', () => {
    const g = lerGfd([GFD.map((c) => c.join(' | '))]);
    if (g.ok === false) throw new Error(g.frase);
    const l = linhaDaGfd('gfd:a', 'a', 'guia.pdf', g.gfd);
    expect(l).toMatchObject({ tipo: 'guia', emitente: 'Guia do FGTS · 11/2026', valor: 883.6, vencimento: '2026-12-18', acoes: ['ignorar'] });
    expect(l.noSistema.texto).toBe('3 trabalhadores · PIX copia e cola conferido');
    expect(linhaDaGfd('gfd:a', 'a', 'guia.pdf', { ...g.gfd, confere: false, naoConfere: ['x'] }).noSistema.selo).toEqual({ texto: 'não confere', tom: 'vermelho' });
    const ls = linhasDasFontes([{ chave: 'a', nome: 'guia.pdf', tipoDoArquivo: 'pdf', lido: { k: 'gfd', gfd: g.gfd } }], {}, {}, '2026-11-27', true, new Set());
    expect(ls.map((x) => [x.chave, x.tipo])).toEqual([['gfd:a', 'guia']]);
  });
  it('o DARF lido como boleto: o beneficiário é a Receita Federal (para a sugestão por nome achar o previsto)', async () => {
    const r = await ler(DARF);
    expect(r.k).toBe('boletos');
    if (r.k !== 'boletos') return;
    expect(r.beneficiario).toEqual({ documento: null, nome: 'Receita Federal', confira: true });
  });
  it('a arrecadação que NÃO é DARF segue sem beneficiário inventado', async () => {
    const r = await ler([['Conta de água'], ['81660000001-1 23450001111-4 22223333444-0 45555666677-0']]);
    expect(r.k).toBe('boletos');
    if (r.k !== 'boletos') return;
    expect(r.beneficiario.nome).toBeNull();
  });
});

describe('os arrastados guardados', () => {
  const entrada = (id: string, origem: 'email' | 'arrastado', mensagemId: string, recebidoEm: string): EntradaDoEmail => ({
    id, mensagemId, remetente: origem === 'email' ? 'Fornecedor <f@x.invalid>' : null, assunto: origem === 'email' ? 'Boleto' : null, recebidoEm,
    arquivoNome: `${id}.pdf`, tipo: 'pdf', tamanhoBytes: 10, storagePath: `cli/entrada/${id}.pdf`, estado: 'a_ler', motivo: null, chegouDeNovo: 0,
    ignoradoMotivo: null, ignoradoDetalhe: null, ignoradoEm: null, boletoId: null, lancamentoId: null, resolvidoEm: null, origem,
  });
  it('ficam num grupo só, "Arrastados para a Caixa" (cada e-mail segue no dele)', () => {
    const es = [entrada('a1', 'arrastado', 'arrastado:1', '2026-11-27T15:00:00Z'), entrada('a2', 'arrastado', 'arrastado:2', '2026-11-27T15:01:00Z'),
      entrada('e1', 'email', '<m1@x.invalid>', '2026-11-27T14:00:00Z')];
    const g = gruposDosEmails(es, {}, {}, {}, '2026-11-27', true, new Set());
    expect(g.map((x) => [x.titulo, x.linhas.length])).toEqual([['Arrastados para a Caixa', 2], [expect.stringMatching(/Fornecedor/), 1]]);
    expect(g[0].assunto).toBe('guardados na hora; o que espera o gesto é só lançar, vincular ou aplicar');
  });
});
