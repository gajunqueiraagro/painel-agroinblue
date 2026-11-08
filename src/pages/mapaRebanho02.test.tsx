/**
 * MAPA-REBANHO-02 (Gabriel 07/11 18:33) — o Mapa do rebanho e o PDF dele: a coluna "Programa" logo depois de Lote (tela e PDF), as larguras
 * que cabem sem rolagem lateral a 135% (919 px de CSS com o menu), o peso sempre com 2 casas e menor que a cabeça, "✓ Peso" inteiro e a
 * conta do campeiro como "⚠ Div." (o nome no title). O PDF se lê pelo que vai ao `autoTable` (jsPDF simulado). Dados SINTÉTICOS.
 */
import { readFileSync } from 'node:fs';
import { porcentagensDoMapa, porcentagensDoMapaEstreito, LIMITE_ESTREITO } from '@/lib/mapa/larguraDoMapa';
import { describe, expect, it, vi } from 'vitest';

const pdf = vi.hoisted(() => ({ chamadas: [] as { head?: string[][]; body?: string[][] }[], orientacao: '' }));
vi.mock('jspdf', () => ({
  default: class {
    internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };
    constructor(o: { orientation: string }) { pdf.orientacao = o.orientation; }
    addImage() {} setFontSize() {} setFont() {} setTextColor() {} text() {} setDrawColor() {} setLineWidth() {} line() {}
    addPage() {} setFillColor() {} roundedRect() {} getNumberOfPages() { return 1; } setPage() {} save() {}
  },
}));
vi.mock('jspdf-autotable', () => ({ default: (_d: unknown, o: { head?: string[][]; body?: string[][] }) => { pdf.chamadas.push(o); } }));
vi.mock('@/assets/logo.png', () => ({ default: '' }));
/* o logo não carrega no jsdom: a imagem falha e o PDF segue sem ele (o caminho que o código já tem) */
vi.stubGlobal('Image', class { onerror: (() => void) | null = null; onload: (() => void) | null = null; crossOrigin = '';
  set src(_v: string) { setTimeout(() => this.onerror?.(), 0); } });

import { exportMapaPastosPdf } from '@/lib/exportMapaPastosPdf';
import type { PastoMapaRow, MapaTotais } from './MapaPastosTab';
import type { CategoriaRebanho, Pasto } from '@/hooks/usePastos';

const CATS: CategoriaRebanho[] = [{ id: 'c-n', codigo: 'novilhas', nome: 'Novilhas', ordem_exibicao: 1 }, { id: 'c-v', codigo: 'vacas', nome: 'Vacas', ordem_exibicao: 2 }];
const pasto = (id: string, nome: string, tipo: string, area: number): Pasto => ({ id, fazenda_id: 'f1', nome, lote_padrao: null, area_produtiva_ha: area,
  tipo_uso: tipo, qualidade: null, entra_conciliacao: true, ativo: true, observacoes: null, ordem_exibicao: 1, data_inicio: null,
  created_at: '2026-01-01', updated_at: '2026-01-01' });
const linha = (p: Pasto, lote: string | null, programa: string | null, cats: [string, number, number][], pesoAtualizado = false): PastoMapaRow => {
  const categorias = new Map(cats.map(([id, q, kg]) => [id, { quantidade: q, peso_medio_kg: kg, peso_atualizado: pesoAtualizado }]));
  const total = cats.reduce((s, [, q]) => s + q, 0);
  const kg = cats.reduce((s, [, q, k]) => s + q * k, 0);
  return { pasto: p, fechamentoId: `fc-${p.id}`, lote, loteIds: [], programa, tipoUso: p.tipo_uso, qualidade: null, categorias, totalCabecas: total,
    pesoMedio: total ? kg / total : null, uaTotal: kg / 450, uaHa: p.area_produtiva_ha ? kg / 450 / p.area_produtiva_ha : null, pesoAtualizado };
};
const LINHAS = [
  linha(pasto('a3', 'A-03', 'cria', 58.2), 'Nov-Ins-01', '1ª inseminação', [['c-n', 41, 355.75], ['c-v', 22, 470.5]], true),
  linha(pasto('a6', 'A-06', 'recria', 67), 'Leiteiras e vacas de descarte do retiro', null, [['c-n', 70, 398.2]]),
  linha(pasto('dv', '⚠️ Divergência do Campeiro', 'divergencia', 0), null, null, []),
];
const TOTAIS: MapaTotais = { catTotals: new Map([['c-n', { quantidade: 111, pesoTotal: 41 * 355.75 + 70 * 398.2, qtdComPeso: 111 }], ['c-v', { quantidade: 22, pesoTotal: 22 * 470.5, qtdComPeso: 22 }]]),
  totalCab: 133, areaTotal: 125.2, pesoMedioGeral: 400.123, uaTotal: 118, uaHaGeral: 0.943, qualidadeMedia: null };

describe('o PDF do Mapa do rebanho', () => {
  it('em paisagem, as MESMAS colunas da tela: Programa logo depois de Lote e o peso conferido; o programa e o "—"; "Div." para o campeiro', async () => {
    pdf.chamadas.length = 0;
    await exportMapaPastosPdf(LINHAS, CATS, TOTAIS, [], '2026-10', 'Faz. Exemplo');
    expect(pdf.orientacao).toBe('landscape');
    const t = pdf.chamadas[0];
    expect(t.head?.[0]).toEqual(['Pasto', 'Ativ.', 'Lote', 'Programa', 'Novilhas', 'Vacas', 'Total', 'Peso Md', 'Peso conf.', 'Área', 'UA/ha', 'Qual']);
    const [a3, a6, dv, total, peso] = t.body ?? [];
    expect(a3.slice(0, 4)).toEqual(['A-03', 'Cria', 'Nov-Ins-01', '1ª inseminação']);
    expect(a3[8]).toBe('sim');
    expect(a6[3]).toBe('—');
    expect(dv[0]).toBe('Div.');
    /* toda linha com o mesmo número de colunas do cabeçalho (nada desloca) */
    for (const l of [a3, a6, dv, total, peso]) expect(l).toHaveLength(12);
    /* peso sempre com 2 casas: no pasto, no total e na linha do peso médio */
    expect(a3[7]).toBe('395,82');
    expect(total[7]).toBe('400,12');
    expect(peso.slice(4, 8)).toEqual(['382,52', '470,50', '400,12', '']);
  });
});

describe('a tela do Mapa do rebanho (fonte)', () => {
  const f = readFileSync('src/pages/MapaPastosTab.tsx', 'utf8');
  it('a coluna "Programa" logo depois de Lote, com o separador do bloco; as linhas da tela, do Excel e do PDF são as mesmas (`linhas`)', () => {
    const iLote = f.indexOf('>Lote</th>');
    const iProg = f.indexOf('>Programa</th>');
    expect(iLote).toBeGreaterThan(0);
    expect(iProg).toBeGreaterThan(iLote);
    expect(f.slice(iLote, iProg).match(/<th/g)).toHaveLength(1);
    expect(f).toContain('{row.programa || <span className="opacity-20">—</span>}');
    /* nome comprido ("1ª inseminação") corta com "…" e o nome inteiro no title — nunca seco (o gate de cortes achou 7,3px) */
    expect(f).toContain('className="px-1 py-0.5 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis max-w-0" style={{ borderRight: blockBorder }}');
    expect(f).toContain("title={row.programa || ''} data-testid=\"programa-do-pasto\">");
    expect(f).toContain('rows={linhas}');
    expect(f).toContain('onClick={() => exportMapaPastosXlsx(linhas, categorias,');
    expect(f).toContain('onClick={() => exportMapaPastosPdf(linhas, categorias,');
    expect(f).toContain('return rows.map(r => ({ ...r, programa: programaDoPasto(r.loteIds, lotesDoMes, nomes) }));');
    /* a faixa do total e a do peso cobrem as 4 colunas de texto */
    expect(f.match(/<td colSpan=\{4\}/g)).toHaveLength(2);
  });
  it('08/11 08:43 — a tabela ocupa a LARGURA TODA (porcentagens que somam 100), tela e PDF pela MESMA fonte (`larguraDoMapa`)', () => {
    const pc = porcentagensDoMapa(9);
    expect(pc).toHaveLength(4 + 9 + 6);
    expect(pc.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    /* Lote e Programa largos o bastante a 1.240 (área 1.096 px): os maiores do caso real (124 e 84 px) cabem */
    expect((pc[2] / 100) * 1096).toBeGreaterThanOrEqual(124);
    expect((pc[3] / 100) * 1096).toBeGreaterThanOrEqual(84);
    /* os números cabem a partir de 1.024 (área 880 px): a categoria pede 35 px, o Total 37 */
    expect((pc[4] / 100) * 880).toBeGreaterThanOrEqual(35);
    expect((pc[13] / 100) * 880).toBeGreaterThanOrEqual(37);
    expect(f).toContain('const colWidths = useMemo(() => (estreito ? porcentagensDoMapaEstreito : porcentagensDoMapa)(categorias.length).map(p => `${p}%`), [categorias, estreito]);');
    expect(f).toContain('<div className="flex h-full min-h-0 w-full flex-col">');
    expect(f).not.toContain('mx-auto" style={{ width: tableWidth }}');
    const pdf = readFileSync('src/lib/exportMapaPastosPdf.ts', 'utf8');
    expect(pdf).toContain('const larguras = porcentagensDoMapa(numCats).map(p => (p / 100) * util);');
    expect(pdf).not.toContain('catColWidth');
  });
  it('opção B (08/11 10:00) — abaixo de 1060px: a tabela a 8,5px, folga 2px nos textos, e as colunas medidas nessa fonte — cabe a 1024 (880px) e a 135% (775px)', () => {
    expect(LIMITE_ESTREITO).toBe(1060);
    const pc = porcentagensDoMapaEstreito(9);
    expect(pc.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    /* o que o conteúdo pede a 8,5px (caso real 3M + PUR) */
    const pede = [72, 57, 103, 69, ...Array(9).fill(31), 33, 35, 36, 30, 29, 23];
    for (const area of [775, 880]) pc.forEach((p, i) => expect((p / 100) * area).toBeGreaterThanOrEqual(pede[i]));
    expect(f).toContain('const estreito = useLarguraDaJanela() < LIMITE_ESTREITO;');
    expect(f).toContain("${estreito ? FONTE_ESTREITA : ''}");
    expect(f).toContain("[&_td[data-texto]]:!px-[2px] [&_td[data-texto]_span]:!px-[2px]");
    expect(f.match(/<td data-texto /g)).toHaveLength(4);
  });
  it('o peso: sempre 2 casas e a 9,5px (a cabeça é 11px); "✓ Peso" inteiro; a conta do campeiro "⚠ Div." com o nome no title', () => {
    expect(f).not.toMatch(/formatNum\((?:pesoMed|peso|row\.pesoMedio|totais\.pesoMedioGeral), [013]\)/);
    expect(f.match(/text-\[9\.5px\] italic/g)?.length).toBeGreaterThanOrEqual(4);
    expect(f).toContain('title="Peso atualizado/conferido pelo operador">✓ Peso</th>');
    /* FECH-DIV-CURTA: o rótulo é UM só, o de classificacaoArea (o mesmo do card do Fechamento) */
    expect(f).toContain("import { isPastoDivergencia, DIV_CURTA } from '@/lib/classificacaoArea';");
    expect(f).not.toContain("export const DIV_CURTA");
    expect(f).toContain('{ehDiv ? DIV_CURTA : row.pasto.nome}');
    expect(f).toContain("title={ehDiv ? `${row.pasto.nome} · abrir` : `Abrir ${row.pasto.nome}`}");
  });
});
