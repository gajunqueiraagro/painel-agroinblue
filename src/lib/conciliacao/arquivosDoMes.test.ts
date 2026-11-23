/**
 * CONC-PAINEL-ARQUIVOS-01 (Gabriel 23/11) — os arquivos da conta no mês, numa regra só. Dado SINTÉTICO (o caso do Bradesco-VGBL set/26 da
 * FASE 0, com nomes inventados): o chip "PDF" acendia pelo comprovante e o painel só lia as importações.
 */
import { describe, expect, it } from 'vitest';
import { arquivosDoMes, contasComComprovante, formatoDoArquivo, lerComprovante, type ComprovanteDoMes, type ImportacaoDoMes } from './arquivosDoMes';

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
