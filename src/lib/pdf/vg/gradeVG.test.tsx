/**
 * P90 — o PDF da grade ampliada da Visão Geral:
 *   P1 o modelo escreve a série do CRITÉRIO que o banco mandou (não soma nem divide) e a mesma escrita da tela (R$ ou R$ mil)
 *   P2 o cabeçalho: cliente, contas, período, recorte, chips ligados, critério e emissão; o resumo é o do mês escolhido (do banco)
 *   P3 gera o PDF de verdade (o motor do react-pdf) e baixa; a falha vira frase
 *   P4 o documento só escreve o modelo
 *   P5 o sinal do negativo no PDF é o hífen (a fonte não tem o "−" e o descartava: negativo saía positivo) (lido da fonte: nenhuma soma, nenhum `valores`)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/pdf/pdfChassi', () => ({ carregarLogoBase64: vi.fn(async () => undefined) }));

import { montarModeloGradeVG } from '@/lib/pdf/vg/modeloGradeVG';
import { gerarPdfGradeVG } from '@/lib/pdf/vg/gerarPdfGradeVG';
import { sinalNoPdf } from '@/lib/pdf/vg/DocumentoGradeVG';
import type { TelaVG } from '@/lib/financeiro/visaoGeral';

const M = ['2026-01', '2026-02', '2026-03'];
const TELA = {
  mes_atual: '2026-02',
  meses: M.map((am) => ({ am, previsto: am > '2026-02', vigente: am === '2026-02' })),
  linhas: [
    { chave: 'saldo_inicial', tipo: 'saldo', rotulo: 'Saldo inicial', valores: [100, 200, 300], total: 100 },
    { chave: 'entrada:total::', tipo: 'total', lado: 'entrada', rotulo: 'ENTRADAS', valores: [10, 20, 30], valores_acum: [7, 77, 777], valores_media: [3, 33, 333], total: 60, media: 20 },
    { chave: 'saida:total::', tipo: 'total', lado: 'saida', rotulo: 'SAÍDAS TOTAIS', valores: [5, 6, 7], valores_acum: [1, 2, 3], valores_media: [1, 1, 1], total: 18, media: 6 },
    { chave: 'saida:grupo:Custeio:', tipo: 'grupo', lado: 'saida', grupo: 'Custeio', rotulo: 'Custeio', valores: [5, 6, 7], valores_acum: [9, 99, 999], valores_media: [4, 44, 444], total: 18, media: 6, pct: 100 },
    { chave: 'resultado', tipo: 'resultado', rotulo: 'Resultado no mês', valores: [5, -14, 23], valores_acum: [5, -9, 14], valores_media: [5, -4.5, 4.67], total: 42, media: 14 },
    { chave: 'saldo_final', tipo: 'saldo', rotulo: 'Saldo final · fluxo de caixa', valores: [105, 186, 323], total: 323 },
  ],
  grafico: null, conciliado_ate: null, contas_sem_ancora: [],
} as unknown as TelaVG;
const base = { tela: TELA, sel: '2026-02', clienteNome: 'Produtor Exemplo', rotuloContas: 'Caixa + cartões', recorte: ['Global'],
  chipsLigados: ['Previsto', 'Vencidos'], emissao: '23/10/2026 11:30' };

let baixados = 0;
beforeEach(() => {
  baixados = 0;
  URL.createObjectURL = () => { baixados += 1; return 'blob:teste'; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = () => {};
});

describe('PDF da grade da Visão Geral', () => {
  it('P1 a série do critério, do banco', () => {
    const mes = montarModeloGradeVG({ ...base, criterio: 'mes' });
    const acum = montarModeloGradeVG({ ...base, criterio: 'acumulado' });
    const custeio = (m: typeof mes) => m.linhas.find((l) => l.rotulo === 'Custeio')!;
    expect(custeio(mes).celulas.map((c) => c.texto)).toEqual(['5', '6', '7']);
    expect(custeio(acum).celulas.map((c) => c.texto)).toEqual(['9', '99', '999']);
    expect(custeio(acum).total).toBe('18');
    /* saldo é posição: igual em qualquer critério */
    expect(acum.linhas.find((l) => l.rotulo === 'Saldo inicial')!.celulas.map((c) => c.texto)).toEqual(['100', '200', '300']);
    expect(acum.unidade).toBe('R$ · acumulado até o mês');
  });

  it('P2 cabeçalho e resumo do mês', () => {
    const m = montarModeloGradeVG({ ...base, criterio: 'media' });
    expect(m.cabecalho).toMatchObject({ clienteNome: 'Produtor Exemplo', contaNome: 'Caixa + cartões', periodo: 'jan/26 – mar/26 · mês fev/26' });
    expect(m.cabecalho.linha2).toBe('Global   ·   Realizado + Previsto, Vencidos   ·   Valores: média jan/26–fev/26   ·   Emitido em 23/10/2026 11:30');
    expect(m.resumo.map((r) => r.valor)).toEqual(['R$ 20,00', 'R$ 6,00', '−R$ 14,00', 'R$ 186,00']);
    expect(m.resumo[2].tom).toBe('neg');
    expect(m.arquivo).toBe('visao-geral-produtor-exemplo-2026-02');
  });

  it('P3 gera o PDF e baixa', async () => {
    const r = await gerarPdfGradeVG(montarModeloGradeVG({ ...base, criterio: 'mes' }));
    expect(r).toEqual({ ok: true });
    expect(baixados).toBe(1);
  }, 30000);

  it('P5 o sinal: no PDF o negativo leva o hífen (a fonte não tem o "−"); a tela e o modelo seguem com o "−"', () => {
    const m = montarModeloGradeVG({ ...base, criterio: 'mes' });
    expect(m.resumo[2].valor).toBe('−R$ 14,00');
    expect(sinalNoPdf(m.resumo[2].valor)).toBe('-R$ 14,00');
    expect(sinalNoPdf(m.linhas.find((l) => l.rotulo === 'Resultado no mês')!.celulas[1].texto)).toBe('-14');
    const fonte = readFileSync(resolve(__dirname, 'DocumentoGradeVG.tsx'), 'utf8');
    expect(fonte).toContain('{sinalNoPdf(texto)}');
    expect(fonte).toContain('{sinalNoPdf(r.valor)}');
  });

  it('P4 o documento só escreve o modelo', () => {
    const fonte = readFileSync(resolve(__dirname, 'DocumentoGradeVG.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(fonte).not.toMatch(/\.valores|reduce\(|serieDoCriterio/);
  });
});
