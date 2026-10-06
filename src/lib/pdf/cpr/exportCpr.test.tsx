/**
 * CPR-EXPORT-01 — a folha exportada de Contas a Pagar e Receber.
 * O que este teste prende: (1) o documento e o modelo NÃO somam (lido da fonte); (2) o modelo escreve o que recebe, na regra de
 * seta e tom da tela; (3) valor inválido não derruba o PDF (o padrão do `pdfValorInvalido.test.tsx`); (4) o erro volta em frase,
 * sem toast; (5) a planilha manda valor como número; (6) o `PdfHeader` sem as props novas é o do PDF executivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/pdf/pdfChassi', () => ({ carregarLogoBase64: vi.fn(async () => undefined) }));

import { celulaDeValor, montarModeloCpr, nomeDoArquivoCpr, type EntradaDoModelo, type GrupoDaTela } from '@/lib/pdf/cpr/modeloCpr';
import { montarPayloadExcelCpr } from '@/lib/financeiro/cprExcel';
import { gerarPdfCpr, motivoDaFalhaDoPdf } from '@/lib/pdf/cpr/gerarPdfCpr';
import { PdfHeader } from '@/lib/pdf/analise/PdfHeader';
import { DocumentoCpr } from '@/lib/pdf/cpr/DocumentoCpr';
import { isValidElement, type ReactNode } from 'react';
import { recortarCpr, serieDoSaldoCpr, resumoPorSemanaCpr, type ContaCpr } from '@/lib/financeiro/cprRecorte';

interface Linha extends ContaCpr { descricao: string; data_competencia: string }
const HOJE = '2026-10-05';
const P = { de: '2026-10-05', ate: '2026-11-04' };
let n = 0;
const lin = (venc: string, valor: number, o: Partial<Linha> = {}): Linha => ({
  id: `l${++n}`, data_vencimento: venc, data_pagamento: null, status_transacao: 'programado', tipo_operacao: '2-Saídas', valor,
  conta_bancaria_id: 'A', descricao: `Conta ${n}`, data_competencia: '2026-10-01', ...o,
});
const LINHAS = [lin('2026-10-02', 100.10), lin('2026-10-10', 5000), lin('2026-10-20', 9000, { tipo_operacao: '1-Entradas', conta_bancaria_id: null, conta_destino_id: 'A' })];
const de: EntradaDoModelo<Linha>['de'] = {
  fornecedor: () => 'Fornecedor', conta: () => 'Banco A', nomeDaConta: (id) => `Conta ${id}`, subcentro: () => 'Subcentro', centro: () => 'Centro', macro: () => 'Macro',
  safra: () => '26/27-Pec', faz: () => 'PUR', status: (l) => ({ chave: l.status_transacao ?? '', rotulo: 'Programado' }), origem: () => 'Manual', doc: () => '',
  receber: (l) => (l.tipo_operacao ?? '').startsWith('1-'), paga: () => false,
};
function entrada(linhas: Linha[] = LINHAS, caixa: number | null = 1000, extra: Partial<EntradaDoModelo<Linha>> = {}): EntradaDoModelo<Linha> {
  const recorte = recortarCpr(linhas, { periodo: P, hoje: HOJE, incluirVencidos: true, ancoras: new Map([['A', '2026-09-30']]) });
  const serie = serieDoSaldoCpr(recorte, caixa);
  const dias = new Map(serie.dias.map((d) => [d.data, d]));
  const grupos: GrupoDaTela<Linha>[] = [
    { tipo: 'vencidos_contam', titulo: 'Vencidos · 1 conta · contam no saldo', quando: '', linhas: recorte.vencidos.contam.linhas, pagar: serie.partida.pagar.valor, receber: serie.partida.receber.valor, saldo: serie.partida.saldo },
    ...Array.from(dias.values()).map((d): GrupoDaTela<Linha> => ({ tipo: 'dia', titulo: d.data, quando: 'em breve', linhas: recorte.periodoSoma.linhas.filter((l) => l.data_vencimento === d.data), pagar: d.pagar.valor, receber: d.receber.valor, saldo: d.saldo })),
  ];
  return {
    clienteNome: 'NJ Pecuária', contaNome: 'Banco do Brasil', todasAsContas: false, periodo: P, segmento: 'ambos', incluirVencidos: true, emitidoEm: '05/10/2026 08:00',
    serie, grupos,
    cartoes: { vencidosContamPagar: recorte.vencidos.contam.pagar, vencidosContamReceber: recorte.vencidos.contam.receber, pagarNoPeriodo: recorte.periodoSoma.pagar, receberNoPeriodo: recorte.periodoSoma.receber },
    rodape: { pagar: recorte.total.pagar.valor, receber: recorte.total.receber.valor, contas: recorte.total.ambos.contas },
    semanas: resumoPorSemanaCpr(serie, P), porConta: null, motivoSemSaldo: 'Cartão não entra no saldo em caixa', de, ...extra,
  };
}

let baixados = 0;
beforeEach(() => {
  baixados = 0;
  URL.createObjectURL = () => { baixados += 1; return 'blob:teste'; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = () => {};
});

describe('o documento e o modelo só escrevem o que o dono entrega (lido da fonte)', () => {
  const semComentario = (f: string) => readFileSync(resolve(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  it('o documento do PDF não soma, não filtra e não decide sinal', () => {
    const doc = semComentario('DocumentoCpr.tsx');
    expect(doc).not.toMatch(/\.reduce\(|\.filter\(|\.sort\(|\+=|Number\(|Math\.|parseFloat|formatMoeda/);
    expect(doc).not.toMatch(/<=?\s*0\b|>=\s*0\b/);                       // nenhuma decisão de sinal: a seta e o tom vêm prontos
    expect(doc).not.toMatch(/cprRecorte/);                                  // nem importa o dono: recebe o modelo pronto
    expect(doc).toContain("import { PdfHeader, PdfRodape } from '@/lib/pdf/analise/PdfHeader';");
    expect(doc).toContain('orientation="landscape"');
    expect(doc).not.toMatch(/jspdf/i);
  });
  it('o modelo e a planilha não somam nem recortam: nenhum reduce, nenhuma chamada ao recorte', () => {
    for (const f of ['modeloCpr.ts', '../../financeiro/cprExcel.ts']) {
      const fonte = semComentario(f);
      expect(fonte, f).not.toMatch(/\.reduce\(|\+=|recortarCpr\(|serieDoSaldoCpr\(|baldeDaConta\(/);
    }
    expect(semComentario('gerarPdfCpr.tsx')).not.toMatch(/toast|sonner|jspdf/i);
  });
});

describe('o modelo — os mesmos números da tela, em texto', () => {
  it('bloco de números, faixas e fim leem a série e os cartões recebidos', () => {
    const m = montarModeloCpr(entrada());
    expect(m.numeros.map((x) => [x.rotulo, x.valor])).toEqual([
      ['Caixa hoje', 'R$ 1.000,00'], ['Vencidos que contam', 'R$ 100,10'], ['A pagar no período', 'R$ 5.000,00'],
      ['A receber no período', 'R$ 9.000,00'], ['Mínimo', '-R$ 4.100,10'], ['Saldo no fim', 'R$ 4.899,90'],
    ]);
    expect(m.numeros[4].detalhe).toBe('em 10/10');
    expect(m.numeros[5].detalhe).toBe('em 04/11/2026');
    expect(m.faixas.map((f) => f.tipo)).toEqual(['saldo_hoje', 'vencidos_contam', 'dia', 'dia']);
    expect(m.faixas[0].saldo?.texto).toBe('R$ 1.000,00');
    expect(m.faixas[2]).toMatchObject({ pagar: { texto: 'R$ 5.000,00', seta: 'baixo', tom: 'neg' }, receber: { seta: null, tom: 'apagado' }, saldo: { texto: '-R$ 4.100,10', seta: 'baixo', tom: 'neg', destaque: true } });
    expect(m.faixas[3].saldo).toMatchObject({ texto: 'R$ 4.899,90', seta: 'cima', tom: 'pos', destaque: false });
    expect(m.fim.titulo).toBe('Fim do período · 04/11/2026 · 3 contas');
    expect(m.fim.saldo?.texto).toBe('R$ 4.899,90');
    expect(m.cabecalho).toMatchObject({ contaNome: 'Banco do Brasil', periodo: '05/10/2026 a 04/11/2026' });
    expect(m.cabecalho.linha2).toContain('emitido em 05/10/2026 08:00');
    expect(m.comColunaConta).toBe(false);
    expect(m.valorInvalido).toBeNull();
  });
  it('a regra da célula é a da tela: ▼ a pagar, ▲ a receber, saldo pelo sinal; zero apagado; sem saldo "—"', () => {
    expect(celulaDeValor('pagar', 10)).toMatchObject({ seta: 'baixo', tom: 'neg' });
    expect(celulaDeValor('receber', 10)).toMatchObject({ seta: 'cima', tom: 'pos' });
    expect(celulaDeValor('saldo', 0)).toMatchObject({ seta: 'cima', tom: 'pos' });
    expect(celulaDeValor('saldo', -0.01, { destacarNegativo: true })).toMatchObject({ seta: 'baixo', tom: 'neg', destaque: true, texto: '-R$ 0,01' });
    expect(celulaDeValor('pagar', 0)).toMatchObject({ seta: null, tom: 'apagado' });
    expect(celulaDeValor('saldo', null)).toMatchObject({ texto: '—', seta: null });
    expect(celulaDeValor('saldo', undefined)).toBeNull();
  });
  it('caixa de vencidos desligada: "Saldo de partida · após vencidos"; cartão de crédito: "—" com a nota', () => {
    const off = montarModeloCpr(entrada(LINHAS, 1000, { incluirVencidos: false }));
    expect(off.numeros[0]).toMatchObject({ rotulo: 'Saldo de partida', valor: 'R$ 899,90' });
    expect(off.numeros[0].detalhe).toContain('após vencidos');
    expect(off.faixas[0].titulo).toContain('após vencidos');
    const cartao = montarModeloCpr(entrada(LINHAS, null));
    expect(cartao.numeros.filter((x) => ['Caixa hoje', 'Mínimo', 'Saldo no fim'].includes(x.rotulo)).map((x) => x.valor)).toEqual(['—', '—', '—']);
    expect(cartao.notaSemSaldo).toContain('Cartão não entra no saldo em caixa');
    expect(cartao.fim.saldo?.texto).toBe('—');
  });
  it('nome do arquivo: sem acento nem espaço, com a conta ou "todas"', () => {
    expect(nomeDoArquivoCpr({ clienteNome: 'NJ Pecuária', contaNome: 'Banco do Brasil', todasAsContas: false, periodo: P }))
      .toBe('contas-a-pagar-receber_nj-pecuaria_banco-do-brasil_2026-10-05_a_2026-11-04');
    expect(nomeDoArquivoCpr({ clienteNome: 'Agnaldo Cedenho', contaNome: 'x', todasAsContas: true, periodo: P }))
      .toBe('contas-a-pagar-receber_agnaldo-cedenho_todas_2026-10-05_a_2026-11-04');
  });
});

describe('a planilha — valores como número, pelo caminho de sempre', () => {
  it('uma linha por conta listada; a pagar e a receber NUMÉRICOS; "Saldo por dia" fecha no saldo no fim', () => {
    const e = entrada();
    const p = montarPayloadExcelCpr({ arquivo: 'arq', grupos: e.grupos, serie: e.serie, de, incluirVencidos: true, hoje: HOJE });
    expect(p.filename).toBe('arq.xlsx');
    expect(p.sheets.map((s) => s.name)).toEqual(['Contas', 'Saldo por dia']);
    const contas = p.sheets[0].rows;
    expect(contas).toHaveLength(3);
    expect(contas[0]).toMatchObject({ 'Venc.': '02/10/2026', 'A pagar': 100.10, 'A receber': null, 'Grupo': 'vencido que conta' });
    expect(contas[2]).toMatchObject({ 'A pagar': null, 'A receber': 9000, 'Grupo': 'período' });
    const dia = p.sheets[1].rows;
    expect(dia[1]).toEqual(['Saldo hoje', null, null, 1000]);
    expect(dia[2]).toEqual(['Vencidos que contam no saldo', 100.10, 0, 899.90]);
    expect(dia[dia.length - 1]).toEqual(['20/10/2026', 0, 9000, e.serie.fim]);
  });
});

describe('gerar o PDF — valor inválido não derruba, e o erro volta em frase', () => {
  it('tudo limpo: gera, baixa e não avisa', async () => {
    const r = await gerarPdfCpr(montarModeloCpr(entrada()));
    expect(r).toEqual({ ok: true, aviso: null });
    expect(baixados).toBe(1);
  });
  it('lançamento com valor NaN e caixa Infinity: o PDF sai e o aviso nomeia o que está errado', async () => {
    const ruim = [...LINHAS, lin('2026-10-15', NaN, { descricao: 'Prolabore' })];
    const r = await gerarPdfCpr(montarModeloCpr(entrada(ruim)));
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.aviso).toContain('Prolabore');
    expect(baixados).toBe(1);
    const inf = await gerarPdfCpr(montarModeloCpr(entrada(LINHAS, Infinity)));
    expect(inf.ok).toBe(true);
    expect(baixados).toBe(2);
  });
  it('com "Todas as contas", vencidos anteriores e resumos: gera as duas páginas de blocos', async () => {
    const e = entrada(LINHAS, 1000, { todasAsContas: true, porConta: [{ conta: 'A', caixa: 1000, pagar: { valor: 5100.10, contas: 2 }, receber: { valor: 9000, contas: 1 }, fim: 4899.90 }] });
    e.grupos.push({ tipo: 'vencidos_anteriores', titulo: 'Vencidos anteriores à conciliação de cada conta · 1 conta · fora do saldo', quando: '', linhas: [lin('2026-08-10', 50)], pagar: 50, receber: 0, saldo: undefined });
    const m = montarModeloCpr(e);
    expect(m.anteriores?.frase).toBe('vencimento em mês já conciliado: confira se foi pago ou atualize a data');
    expect(m.porConta?.total).toMatchObject({ caixa: 'R$\u00a01.000,00', pagar: { texto: 'R$\u00a05.100,10', seta: 'baixo' }, receber: { texto: 'R$\u00a09.000,00', seta: 'cima' } });
    expect(m.comColunaConta).toBe(true);
    expect((await gerarPdfCpr(m)).ok).toBe(true);
  });
  it('a falha vira frase (não toast), com as mesmas três causas do PDF executivo', () => {
    expect(motivoDaFalhaDoPdf(new Error('Failed to fetch dynamically imported module'))).toContain('Recarregue a página');
    expect(motivoDaFalhaDoPdf(new Error('unsupported number: NaN'))).toContain('valor inválido');
    expect(motivoDaFalhaDoPdf(new Error('qualquer'))).toBe('Falha ao gerar PDF: qualquer');
  });
});

describe('PdfHeader — sem as props novas é o do PDF executivo', () => {
  const filhos = (el: ReturnType<typeof PdfHeader>) => {
    const bloco = [el.props.children].flat().filter(Boolean).pop();
    return [bloco.props.children].flat();
  };
  it('título padrão e UMA linha de contexto; a segunda linha não existe', () => {
    const f = filhos(PdfHeader({ clienteNome: 'Cliente', contaNome: 'Conta', periodoLabel: 'Set/2026' }));
    expect(f[0].props.children).toBe('Análise Financeira Executiva');
    expect(f[1].props.children).toBe('Cliente   ·   Conta: Conta   ·   Set/2026');
    expect(f[2]).toBeNull();
    const fonte = readFileSync(resolve(__dirname, '../analise/DocumentoAnaliseExecutiva.tsx'), 'utf8');
    expect(fonte).not.toMatch(/<PdfHeader[^>]*(titulo|linha2)=/);            // o executivo não passa as props novas
  });
  it('com as props: o título e a segunda linha do documento novo', () => {
    const f = filhos(PdfHeader({ clienteNome: 'Cliente', contaNome: 'Conta', periodoLabel: 'P', titulo: 'Contas a Pagar e Receber', linha2: 'A pagar · emitido em X' }));
    expect(f[0].props.children).toBe('Contas a Pagar e Receber');
    expect(f[2].props.children).toBe('A pagar · emitido em X');
  });
});

describe('o bloco de números — o detalhe ocupa uma linha só (árvore do documento)', () => {
  /** acha, na árvore do documento, o elemento cujo texto é exatamente `texto` */
  const achar = (no: ReactNode, texto: string): { style?: { maxLines?: number; textOverflow?: string } } | null => {
    if (Array.isArray(no)) { for (const f of no) { const r = achar(f, texto); if (r) return r; } return null; }
    if (!isValidElement<{ children?: ReactNode; style?: { maxLines?: number; textOverflow?: string } }>(no)) return null;
    if (no.props.children === texto) return no.props;
    return achar(no.props.children, texto);
  };
  it('"Saldo de partida": o detalhe é curto e o texto dele é de UMA linha, com reticência', () => {
    const m = montarModeloCpr(entrada(LINHAS, 604088.31, { incluirVencidos: false }));
    const detalhe = m.numeros[0].detalhe ?? '';
    expect(detalhe).toBe('após vencidos · caixa R$\u00a0604.088,31');
    const el = achar(DocumentoCpr({ modelo: m }), detalhe);
    expect(el).not.toBeNull();
    expect(el?.style).toMatchObject({ maxLines: 1, textOverflow: 'ellipsis' });
    /* a busca sabe achar: o valor do número, que NÃO corta, não tem maxLines */
    expect(achar(DocumentoCpr({ modelo: m }), m.numeros[0].valor)?.style?.maxLines).toBeUndefined();
  });
});
