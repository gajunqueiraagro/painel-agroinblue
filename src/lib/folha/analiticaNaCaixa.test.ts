/**
 * FOLHA-VERA-PACOTE-01 F1 — o relatório analítico da folha na Caixa: o leitor de verdade (`lerDaCaixaCom`, pdfjs falso) dá o tipo 'analitica'
 * (antes: "Folha ainda não é lida aqui"), e a linha diz o que foi lido e se confere — sem gravar nada (a ação é só Ignorar).
 * ⚠ Dado INVENTADO no formato do layout; nenhum documento de cliente entra.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { lerDaCaixaCom } from '@/hooks/useCaixaDeBoletos';
import { linhaDaAnalitica, linhasDasFontes } from '@/lib/financeiro/boleto/caixaPorEmail';
import { lerFolhaAnalitica, type FolhaAnaliticaLida } from './lerFolhaAnalitica';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

const LINHAS: string[][] = [
  ['FULANO FICTICIO FAZENDA UM'], ['Folha', 'de Pagamento'], ['Relatório da Folha Analítico.', 'MARÇO 2026'], ['Emissão', '28/03/2026', 'Hr.', '09:00:00'],
  ['*** CENTRO DE CUSTO: 00002-RURAL ***'],
  ['00011', 'PESSOA UM', '10/03/2015', '/', '/', '2.000,00', '44.0', 'TRABALHADOR RURAL'],
  ['46 SALARIO BASE', '30,0000', '2.000,00', '40 I.N.S.S. EMPREGADO', '7,5000', '150,00', '160,00', '1.850,00'],
  ['2.000,00', '150,00'],
  ['RESUMO GERAL DA FOLHA DE PAGAMENTO'], ['TOTAL DE PROVENTOS...', '2.000,00', 'TOTAL DE DESCONTOS...', '150,00'],
  ['1', 'Funcionário(s)', 'TOTAL LÍQUIDO........', '1.850,00'], ['TOTAL F.G.T.S........', '160,00'],
];
const pdfjs: PdfjsMinimo = {
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({
    getViewport: () => ({ width: 595, height: 842 }),
    getTextContent: async () => ({ items: LINHAS.flatMap((cs, l) => cs.map((str, c) => ({ str, transform: [10, 0, 0, 10, 20 + c * 130, 800 - l * 14], width: 100, height: 10 }))) }),
  }) }) }),
};
function lida(): FolhaAnaliticaLida {
  const r = lerFolhaAnalitica([LINHAS.map((c) => c.join(' | '))]);
  if (r.ok === false) throw new Error(r.frase);
  return r.folha;
}

describe('o relatório analítico da folha na Caixa', () => {
  it('o leitor de verdade: vira o tipo analitica (não "Folha ainda não é lida aqui")', async () => {
    const r = await lerDaCaixaCom(pdfjs)(new TextEncoder().encode('%PDF falso').buffer, 'pdf');
    expect(r.k).toBe('analitica');
    if (r.k !== 'analitica') return;
    expect(r.analitica).toMatchObject({ empresa: 'FULANO FICTICIO FAZENDA UM', competencia: '2026-03', confere: true });
    expect(r.analitica.pessoas.map((p) => [p.codigo, p.liquido, p.fgts, p.inss])).toEqual([['00011', 1850, 160, 150]]);
  });

  it('a linha: "Folha analítica · 03/2026", a empresa e N funcionários, o líquido total, selo confere; só Ignorar (nada grava)', () => {
    const l = linhaDaAnalitica('analitica:f1', 'f1', 'folha.pdf', lida());
    expect(l).toMatchObject({ chave: 'analitica:f1', tipo: 'folha', emitente: 'Folha analítica · 03/2026', valor: 1850, acoes: ['ignorar'] });
    expect(l.noSistema.selo).toEqual({ texto: 'confere', tom: 'ok' });
    expect(l.noSistema.texto).toBe('FULANO FICTICIO FAZENDA UM · 1 funcionário · confere com o resumo geral');
    expect(l.noSistema.titulo).toContain('Ainda não grava nada');
  });

  it('não confere: selo vermelho e o porquê no title', () => {
    const f = { ...lida(), confere: false, naoConfere: ['O resumo geral diz 2 funcionários; li 1.'] };
    const l = linhaDaAnalitica('analitica:f1', 'f1', 'folha.pdf', f);
    expect(l.noSistema.selo).toEqual({ texto: 'não confere', tom: 'vermelho' });
    expect(l.noSistema.titulo).toContain('O resumo geral diz 2 funcionários; li 1.');
  });

  it('nas linhas do e-mail, o analítico é uma linha da folha', () => {
    const linhas = linhasDasFontes([{ chave: 'f1', nome: 'folha.pdf', tipoDoArquivo: 'pdf', lido: { k: 'analitica', analitica: lida() } }], {}, {}, '2026-03-30', true, new Set());
    expect(linhas.map((l) => [l.chave, l.tipo, l.emitente])).toEqual([['analitica:f1', 'folha', 'Folha analítica · 03/2026']]);
  });
});
