/**
 * FIN-DETALHE-CABECALHO-ALINHADO-01 — a régua da tabela de parcelas do contrato.
 *
 * O que se prende: (1) o cabeçalho alinha como o conteúdo da coluna; (2) a tabela não estica coluna nenhuma além da Conta;
 * (3) as larguras medidas (data, Nº, Prazo); (4) a tela desenha `colgroup` e cabeçalho DA MESMA lista, e as células de número,
 * de ícone e de texto usam o alinhamento que a régua declara. A tela não se monta em teste: a ligação é lida da FONTE, com
 * auto-teste do detector.
 */
import { TD_VALOR_LANC } from '@/components/financiamentos/ListaDeFinanciamentos';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  alinhamentoDoCabecalho, colunasDasParcelas, CLASSE_DO_ALINHAMENTO, LARGURA_DA_DATA, type ChaveDaColuna,
} from './reguaDasParcelas';

const FONTE = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
const porChave = (ehParcelamento: boolean) => new Map(colunasDasParcelas(ehParcelamento).map(c => [c.chave, c]));

describe('a régua — o cabeçalho alinha como a coluna', () => {
  it('número à direita, ícone ao centro, o resto à esquerda — nas duas naturezas', () => {
    const credito = colunasDasParcelas(false);
    expect(credito.filter(c => c.alinha === 'direita').map(c => c.chave)).toEqual(['principal', 'juros', 'total', 'saldoApos']);
    expect(credito.filter(c => c.alinha === 'centro')).toEqual([]);
    const parcelamento = colunasDasParcelas(true);
    expect(parcelamento.filter(c => c.alinha === 'direita').map(c => c.chave)).toEqual(['total']);
    expect(parcelamento.filter(c => c.alinha === 'centro').map(c => c.chave)).toEqual(['boleto']);
    for (const c of [...credito, ...parcelamento]) {
      expect(alinhamentoDoCabecalho(c)).toBe(CLASSE_DO_ALINHAMENTO[c.alinha]);
    }
    expect(alinhamentoDoCabecalho(porChave(false).get('total')!)).toBe('text-right');
    expect(alinhamentoDoCabecalho(porChave(false).get('lancamento')!)).toBe('text-left');
    expect(alinhamentoDoCabecalho(porChave(true).get('conta')!)).toBe('text-left');
    expect(alinhamentoDoCabecalho(porChave(true).get('boleto')!)).toBe('text-center');
  });

  it('a tabela não estica: UMA coluna sem largura (a Conta na compra parcelada, o Lançamento no crédito); todas as outras em px', () => {
    for (const ehParcelamento of [false, true]) {
      const cols = colunasDasParcelas(ehParcelamento);
      const resto = ehParcelamento ? 'conta' : 'lancamento';
      expect(cols.filter(c => c.largura === null).map(c => c.chave)).toEqual([resto]);
      for (const c of cols) if (c.chave !== resto) expect(c.largura).toBeGreaterThan(0);
      expect(new Set(cols.map(c => c.chave)).size).toBe(cols.length);
    }
  });

  it('as larguras medidas: compra parcelada data 64, Nº 48, Prazo 116; crédito na régua v4 com a data dd/mm/aaaa', () => {
    expect(LARGURA_DA_DATA).toBe(64);
    const m = porChave(true);
    for (const data of ['competencia', 'vencimento', 'pagamento'] as ChaveDaColuna[]) expect(m.get(data)!.largura).toBe(64);
    expect(m.get('numero')!.largura).toBe(48);
    expect(m.get('prazo')!.largura).toBe(116);
    const fixas = (p: boolean) => colunasDasParcelas(p).reduce((a, c) => a + (c.largura ?? 0), 0);
    expect(901 - fixas(true)).toBe(181);
    /* TELA DO CONTRATO v4 (18/10, medido na bancada com Inter): "em 5097 dias" a 10px 66+5; o Total do rodapé "16.380.000,00" em
       negrito 10,5px 77+5. UI-SEM-CORTE-01 (19/10): a data passou a dd/mm/aaaa, "01/10/2026" pede 64 com o padding -> 68. Fixas 602 — a
       750px de conteúdo sobram 130 ao Lançamento, que quebra a linha ali (nunca corta) */
    const c = porChave(false);
    expect([c.get('numero')!.largura, c.get('vencimento')!.largura, c.get('pagamento')!.largura, c.get('prazo')!.largura]).toEqual([37, 68, 68, 70]);
    expect(fixas(false)).toBe(602);
    expect(c.has('lapis')).toBe(false);
    expect(c.get('lancamento')!.largura).toBeNull();
  });
});

/* ── a ligação na tela, lida da fonte ───────────────────────────────────── */

/** o corpo de uma tag JSX `<Nome …> … </Nome>` (a primeira ocorrência) */
function bloco(fonte: string, nome: string): string {
  const a = fonte.indexOf(`<${nome}`);
  const b = fonte.indexOf(`</${nome}>`, a);
  return a < 0 || b < 0 ? '' : fonte.slice(a, b);
}
/** as células `<TableCell …>` de um trecho, só a tag de abertura */
const aberturas = (trecho: string) => trecho.match(/<TableCell\b[^>]*>/g) ?? [];
/** detector: larguras escritas à mão num colgroup (fora da régua) */
const larguraNaMao = (trecho: string) => /<col\s+style=\{\{\s*width:\s*\d+/.test(trecho);
/** detector: th com alinhamento escrito à mão */
const thNaMao = (trecho: string) => /<ThDet\b[^>]*\b(direita|centro|className)\b/.test(trecho) || /text-(center|right|left)/.test(trecho);

describe('a tela usa a régua (fonte)', () => {
  it('auto-teste dos detectores', () => {
    expect(larguraNaMao('<col style={{ width: 54 }} />')).toBe(true);
    expect(larguraNaMao('{colunas.map(c => <col key={c.chave} style={c.largura === null ? undefined : { width: c.largura }} />)}')).toBe(false);
    expect(thNaMao('<ThDet direita>Juros</ThDet>')).toBe(true);
    expect(thNaMao('<TableHead className="text-center">Juros</TableHead>')).toBe(true);
    expect(thNaMao('{colunas.map(c => <ThDet key={c.chave} coluna={c} />)}')).toBe(false);
    expect(bloco('<a><colgroup>x</colgroup></a>', 'colgroup')).toContain('x');
  });

  it('table-fixed, colgroup e cabeçalho saem da MESMA lista; nada de largura ou alinhamento à mão', () => {
    // FIN-FINANC-28-P3-FIX: a tabela leva a régua de Lançamentos (`table-financeiro`) e segue `table-fixed`
    expect(FONTE).toMatch(/<Table density="dense" className=\{`\$\{TABELA_LANC\} table-fixed /);
    expect(FONTE).toContain('const colunas = colunasDasParcelas(ehParcelamento);');
    const cg = bloco(FONTE, 'colgroup');
    expect(cg).toContain('colunas.map(');
    expect(cg).toContain('c.largura === null ? undefined : { width: c.largura }');
    expect(larguraNaMao(cg)).toBe(false);
    const linhaDoCabecalho = bloco(bloco(FONTE, 'TableHeader'), 'TableRow');
    expect(linhaDoCabecalho).toContain('colunas.map(c => <ThDet key={c.chave} coluna={c} />)');
    expect(thNaMao(linhaDoCabecalho)).toBe(false);
    // o ThDet lê o alinhamento do dono, e não tem largura nem alinhamento próprios
    const thDet = FONTE.slice(FONTE.indexOf('function ThDet('));
    expect(thDet).toContain('${alinhamentoDoCabecalho(coluna)}');
    expect(thDet).not.toMatch(/\bw-\[|\bmin-w-|text-center|text-right|text-left/);
  });

  it('as células do corpo alinham como a régua diz: MOEDA (direita) nos números, text-center no Boleto', () => {
    // MOEDA é o valor de Lançamentos (`TD_VALOR_LANC`, FIN-FINANC-28-P3-FIX), que alinha à direita
    expect(FONTE).toContain('const MOEDA = TD_VALOR_LANC;');
    expect(TD_VALOR_LANC.split(' ')).toContain('text-right');
    const corpo = bloco(FONTE, 'TableBody');
    const cels = aberturas(corpo);
    // crédito: principal, juros, total; parcelamento: só o total (as duas primeiras são condicionais ao crédito)
    expect(cels.filter(c => c.includes('MOEDA')).length).toBe(colunasDasParcelas(false).filter(c => c.alinha === 'direita').length);
    expect(cels.filter(c => /className="text-center"/.test(c) && c.includes('boleto-da-parcela')).length).toBe(1);
    // nenhuma outra célula do corpo centraliza ou alinha à direita por conta própria (o lápis, sem cabeçalho, é a exceção)
    const fora = cels.filter(c => /text-(center|right)/.test(c) && !c.includes('MOEDA') && !c.includes('boleto-da-parcela') && !c.includes('px-0 text-right select-none'));
    expect(fora).toEqual([]);
  });
});
