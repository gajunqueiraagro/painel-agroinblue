/**
 * CONC-PAINEL-ARQUIVOS-01 (Gabriel 23/11) — os arquivos da conta no mês, numa regra só. Dado SINTÉTICO (o caso do Bradesco-VGBL set/26 da
 * FASE 0, com nomes inventados): o chip "PDF" acendia pelo comprovante e o painel só lia as importações.
 */
import { describe, expect, it } from 'vitest';
import {
  arquivosDoMes, contasComComprovante, formatoDoArquivo, lerComprovante, ordenarArquivos, periodoCurto, resumoDosArquivos, sobreposicoesDePeriodo,
  type ComprovanteDoMes, type ImportacaoDoMes,
} from './arquivosDoMes';

const COMP = (o: Partial<ComprovanteDoMes> & Pick<ComprovanteDoMes, 'id' | 'contaId' | 'anoMes'>): ComprovanteDoMes =>
  ({ nome: 'Saldo Previdência 3009.pdf', tipo: 'application/pdf', caminho: `cli/saldos/${o.contaId}/${o.anoMes}/${o.id}.pdf`, enviadoEm: '2031-10-10T12:00:00Z', ...o });
const IMP = (o: Partial<ImportacaoDoMes> & Pick<ImportacaoDoMes, 'id'>): ImportacaoDoMes =>
  ({ nomeArquivo: 'extrato-set.ofx', data: '2031-10-02', importados: 124, tipoArquivo: 'OFX', saldoDeclaradoData: '2031-09-30', ...o });

describe('a leitura da linha do banco', () => {
  it('lê o comprovante e recusa a linha torta (sem conta, mês fora do formato)', () => {
    expect(lerComprovante({ id: 'd1', conta_bancaria_id: 'vgbl', ano_mes: '2031-09', nome: 'x.pdf', tipo: 'application/pdf', url: 'cli/a.pdf', uploaded_em: '2031-10-10' }))
      .toEqual({ id: 'd1', contaId: 'vgbl', anoMes: '2031-09', nome: 'x.pdf', tipo: 'application/pdf', caminho: 'cli/a.pdf', enviadoEm: '2031-10-10' });
    expect(lerComprovante({ id: 'd1', conta_bancaria_id: null, ano_mes: '2031-09' })).toBeNull();
    expect(lerComprovante({ id: 'd1', conta_bancaria_id: 'vgbl', ano_mes: '2031-9' })).toBeNull();
    expect(lerComprovante({ id: 'd1', conta_bancaria_id: 'vgbl', ano_mes: '2031-09' })?.caminho).toBeNull(); // registrado, não subiu
  });
  it('o formato: pelo tipo gravado e, sem ele, pela extensão', () => {
    expect(formatoDoArquivo('a.bin', 'application/pdf')).toBe('PDF');
    expect(formatoDoArquivo('foto', 'image/jpeg')).toBe('IMG');
    expect(formatoDoArquivo('extrato.OFX', null)).toBe('OFX');
    expect(formatoDoArquivo('Open Finance · 16/11/2031', 'OPEN_FINANCE')).toBe('OF');
    expect(formatoDoArquivo('planilha.xlsx', null)).toBe('XLS');
    expect(formatoDoArquivo('extrato.txt', null)).toBe('CSV');
    expect(formatoDoArquivo('sem-extensao', null)).toBe('ARQ');
  });
});

describe('os arquivos do mês (o painel) e o chip "PDF" (a linha): a MESMA lista', () => {
  const comps = [
    COMP({ id: 'set', contaId: 'vgbl', anoMes: '2031-09' }),
    COMP({ id: 'ago', contaId: 'vgbl', anoMes: '2031-08', nome: 'Extrato Previdência Ago.pdf' }),
    COMP({ id: 'cc', contaId: 'cc', anoMes: '2031-09', nome: 'cc-set.pdf', enviadoEm: '2031-10-01T09:00:00Z' }),
    COMP({ id: 'cc2', contaId: 'cc', anoMes: '2031-09', nome: 'cc-set-2.jpg', tipo: 'image/jpeg', enviadoEm: '2031-10-03T09:00:00Z' }),
  ];

  it('o caso da FASE 0: conta SEM importação nenhuma e com o comprovante do mês — o painel mostra o arquivo (antes: "Nenhum arquivo")', () => {
    const a = arquivosDoMes({ comprovantes: comps, importacoesDoMes: [], contaId: 'vgbl', anoMes: '2031-09' });
    expect(a.map((x) => [x.origem, x.nome, x.formato, x.podeVer, x.podeBaixar])).toEqual([['comprovante', 'Saldo Previdência 3009.pdf', 'PDF', true, true]]);
    expect(a[0].detalhe).toBe('comprovante de saldo · anexado 10/10');
    expect(contasComComprovante(comps, '2031-09').has('vgbl')).toBe(true);
  });

  it('o chip acende ⇔ o painel lista um comprovante — para TODA conta e mês da lista (nunca duas regras)', () => {
    const contas = ['vgbl', 'cc', 'outra'];
    const meses = ['2031-08', '2031-09', '2031-10'];
    let n = 0;
    for (const c of contas) for (const m of meses) {
      const noPainel = arquivosDoMes({ comprovantes: comps, importacoesDoMes: [], contaId: c, anoMes: m }).some((x) => x.origem === 'comprovante');
      expect({ c, m, chip: contasComComprovante(comps, m).has(c) }).toEqual({ c, m, chip: noPainel });
      n += 1;
    }
    expect(n).toBe(9);
    expect(contasComComprovante(comps, '2031-09')).toEqual(new Set(['vgbl', 'cc']));
  });

  it('comprovantes (mais recente primeiro) e depois as importações do mês; só desta conta e deste mês', () => {
    const a = arquivosDoMes({ comprovantes: comps, importacoesDoMes: [IMP({ id: 'i1' }), IMP({ id: 'i2', nomeArquivo: 'Open Finance · 16/10/2031', tipoArquivo: 'OPEN_FINANCE', data: '2031-10-16', saldoDeclaradoData: null, importados: 3 })],
      contaId: 'cc', anoMes: '2031-09' });
    expect(a.map((x) => x.chave)).toEqual(['comprovante:cc2', 'comprovante:cc', 'importacao:i2', 'importacao:i1']);
    expect(a[0].formato).toBe('IMG');
    expect(a[2].detalhe).toBe('extrato importado 16/10 · 3 mov.');
    expect(a[3].detalhe).toBe('extrato importado 02/10 · saldo 30/09 · 124 mov.');
  });

  it('a importação ANTIGA: "Ver" mostra os movimentos (D1 a); sem "Baixar" — o original não foi guardado', () => {
    const [i] = arquivosDoMes({ comprovantes: [], importacoesDoMes: [IMP({ id: 'i1' })], contaId: 'cc', anoMes: '2031-09' });
    expect([i.podeVer, i.podeBaixar, i.caminho]).toEqual([true, false, null]);
  });
  it('a importação NOVA (lote 115620): com o original guardado, "Baixar" pelo caminho do bucket', () => {
    const [i] = arquivosDoMes({ comprovantes: [], importacoesDoMes: [IMP({ id: 'i9', arquivoCaminho: 'cli/importacoes/cc/i9.ofx' })], contaId: 'cc', anoMes: '2031-09' });
    expect([i.podeVer, i.podeBaixar, i.caminho]).toEqual([true, true, 'cli/importacoes/cc/i9.ofx']);
  });

  it('o comprovante registrado cujo arquivo não subiu: aparece (lixo visível), mas não abre nem baixa', () => {
    const [x] = arquivosDoMes({ comprovantes: [COMP({ id: 'z', contaId: 'cc', anoMes: '2031-09', caminho: null })], importacoesDoMes: [], contaId: 'cc', anoMes: '2031-09' });
    expect([x.podeVer, x.podeBaixar, x.detalhe]).toEqual([false, false, 'comprovante de saldo · o arquivo não subiu']);
  });
});

describe('CONC-PAINEL-02 ajuste (Gabriel 23/11 17:09) — 10 arquivos no mês: resumo, lista ordenável e sobreposição de período', () => {
  /* o caso do print (NJ BB out/26) com nomes inventados: 9 OFX baixados dia a dia (cada um do dia 1 até o dia do download) e 1 PDF */
  const imps = Array.from({ length: 9 }, (_, i) => IMP({ id: `o${i + 1}`, nomeArquivo: `extrato-${String(i + 1).padStart(2, '0')}.ofx`,
    data: `2031-10-${String(i + 2).padStart(2, '0')}`, importados: 10 + i, periodoDe: '2031-09-01', periodoAte: `2031-09-${String(i + 1).padStart(2, '0')}`,
    saldoDeclarado: i === 4 ? null : 1000 - i * 100 }));
  const lista = arquivosDoMes({ comprovantes: [COMP({ id: 'p', contaId: 'cc', anoMes: '2031-09' })], importacoesDoMes: imps, contaId: 'cc', anoMes: '2031-09' });

  it('R1 o resumo: "10 arquivos" e os formatos pelo mais comum ("OFX 9 · PDF 1")', () => {
    expect(resumoDosArquivos(lista)).toEqual({ total: '10 arquivos', formatos: 'OFX 9 · PDF 1' });
    expect(resumoDosArquivos(lista.slice(0, 1))).toEqual({ total: '1 arquivo', formatos: 'PDF 1' });
  });
  it('R2 a lista leva o período, quando entrou, os movimentos e o saldo final; o comprovante não tem período (—)', () => {
    const o3 = lista.find((a) => a.id === 'o3');
    expect([o3?.periodoDe, o3?.periodoAte, o3?.enviadoEm, o3?.movimentos, o3?.saldoFinal]).toEqual(['2031-09-01', '2031-09-03', '2031-10-04', 12, 800]);
    const pdf = lista.find((a) => a.origem === 'comprovante');
    expect([pdf?.periodoDe, pdf?.movimentos, pdf?.saldoFinal, pdf?.enviadoEm]).toEqual([null, null, null, '2031-10-10T12:00:00Z']);
  });
  it('R3 ordenar por coluna, nos dois sentidos; o que não tem o dado vai SEMPRE para o fim', () => {
    expect(ordenarArquivos(lista, 'saldo', true).map((a) => a.id)).toEqual(['o9', 'o8', 'o7', 'o6', 'o4', 'o3', 'o2', 'o1', 'p', 'o5']);
    expect(ordenarArquivos(lista, 'saldo', false).slice(-2).map((a) => a.id).sort()).toEqual(['o5', 'p']);
    expect(ordenarArquivos(lista, 'periodo', false)[0].id).toBe('o9'); // todos do dia 1: o que vai mais longe primeiro
    expect(ordenarArquivos(lista, 'periodo', true).map((a) => a.id).slice(0, 2)).toEqual(['o1', 'o2']);
    expect(ordenarArquivos(lista, 'periodo', true).at(-1)?.id).toBe('p');
    expect(ordenarArquivos(lista, 'nome', true)[0].nome).toBe('extrato-01.ofx');
    expect(ordenarArquivos(lista, 'movimentos', false)[0].id).toBe('o9');
    expect(ordenarArquivos(lista, 'enviado', false)[0].id).toBe('p');
  });
  it('R4 sobreposição: dois arquivos que cobrem os MESMOS DIAS (nem que seja um); encostados sem cruzar, não', () => {
    const [a, b] = arquivosDoMes({ comprovantes: [], contaId: 'cc', anoMes: '2031-09', importacoesDoMes: [
      IMP({ id: 'a', data: '2031-10-02', periodoDe: '2031-09-01', periodoAte: '2031-09-15' }),
      IMP({ id: 'b', data: '2031-10-01', periodoDe: '2031-09-15', periodoAte: '2031-09-30' })] });
    expect(sobreposicoesDePeriodo([a, b]).map((x) => [x.a.id, x.b.id, x.de, x.ate])).toEqual([['a', 'b', '2031-09-15', '2031-09-15']]);
    const c = { ...b, periodoDe: '2031-09-16' };
    expect(sobreposicoesDePeriodo([a, c])).toEqual([]);
    expect(sobreposicoesDePeriodo(lista)).toHaveLength(36); // 9 OFX todos a partir do dia 1: C(9,2); o PDF sem período fica fora
  });
});

describe('o período curto da lista (cabe na coluna e não perde a data inteira)', () => {
  it('R5 mesmo mês · mesmo ano · anos diferentes · um dia · sem período', () => {
    expect(periodoCurto('2031-09-01', '2031-09-27')).toBe('01–27/09/2031');
    expect(periodoCurto('2031-08-28', '2031-09-03')).toBe('28/08–03/09/2031');
    expect(periodoCurto('2030-12-28', '2031-01-03')).toBe('28/12/2030–03/01/2031');
    expect(periodoCurto('2031-09-15', '2031-09-15')).toBe('15/09/2031');
    expect([periodoCurto(null, '2031-09-15'), periodoCurto('2031-09-01', null)]).toEqual(['—', '—']);
  });
});
