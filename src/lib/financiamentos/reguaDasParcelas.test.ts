/**
 * FIN-DETALHE-CABECALHO-ALINHADO-01 — a régua da tabela de parcelas do contrato.
 *
 * O que se prende: (1) o cabeçalho alinha como o conteúdo da coluna; (2) a tabela não estica coluna nenhuma além da Conta;
 * (3) as larguras medidas (data, Nº, Prazo); (4) a tela desenha `colgroup` e cabeçalho DA MESMA lista, e as células de número,
 * de ícone e de texto usam o alinhamento que a régua declara. A tela não se monta em teste: a ligação é lida da FONTE, com
 * auto-teste do detector.
 */
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
    expect(credito.filter(c => c.alinha === 'direita').map(c => c.chave)).toEqual(['principal', 'juros', 'total']);
    expect(credito.filter(c => c.alinha === 'centro')).toEqual([]);
    const parcelamento = colunasDasParcelas(true);
    expect(parcelamento.filter(c => c.alinha === 'direita').map(c => c.chave)).toEqual(['total']);
    expect(parcelamento.filter(c => c.alinha === 'centro').map(c => c.chave)).toEqual(['boleto']);
    for (const c of [...credito, ...parcelamento]) {
      expect(alinhamentoDoCabecalho(c)).toBe(CLASSE_DO_ALINHAMENTO[c.alinha]);
    }
    expect(alinhamentoDoCabecalho(porChave(false).get('total')!)).toBe('text-right');
    expect(alinhamentoDoCabecalho(porChave(false).get('conta')!)).toBe('text-left');
    expect(alinhamentoDoCabecalho(porChave(true).get('boleto')!)).toBe('text-center');
  });

  it('a tabela não estica: UMA coluna sem largura (a Conta); todas as outras em px', () => {
    for (const ehParcelamento of [false, true]) {
      const cols = colunasDasParcelas(ehParcelamento);
      expect(cols.filter(c => c.largura === null).map(c => c.chave)).toEqual(['conta']);
      for (const c of cols) if (c.chave !== 'conta') expect(c.largura).toBeGreaterThan(0);
      expect(new Set(cols.map(c => c.chave)).size).toBe(cols.length);
    }
  });

  it('as larguras medidas: data 64 (46,3 + 16), Nº 48 ("20/20"), Prazo 116 ("vence em 2912 dias")', () => {
    expect(LARGURA_DA_DATA).toBe(64);
    for (const ehParcelamento of [false, true]) {
      const m = porChave(ehParcelamento);
      for (const data of ['competencia', 'vencimento', 'pagamento'] as ChaveDaColuna[]) expect(m.get(data)!.largura).toBe(64);
      expect(m.get('numero')!.largura).toBe(48);
      expect(m.get('prazo')!.largura).toBe(116);
    }
    // a soma das colunas de largura fixa: o que sobra a 901px (a tabela a 1.127 de janela) é a Conta
    const fixas = (p: boolean) => colunasDasParcelas(p).reduce((a, c) => a + (c.largura ?? 0), 0);
    expect(901 - fixas(false)).toBe(145);
    expect(901 - fixas(true)).toBe(181);
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
    expect(FONTE).toMatch(/<Table density="dense" className="table-fixed"/);
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
    const MOEDA = FONTE.match(/const MOEDA = '([^']+)'/)?.[1] ?? '';
    expect(MOEDA.split(' ')).toContain('text-right');
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
