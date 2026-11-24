/**
 * FIN-PRONTO-PAGAR-01 PR B (mock aprovado 23/11 13:38) — o "pronto para pagar" na TELA. Quem decide é o BANCO (`_fn_pronto_para_pagar`,
 * migration 118450): cada linha da lista traz o código em `pronto_pagar` e a forma que vale em `forma_efetiva`; a resposta traz a contagem
 * {prontos, faltando} do recorte. Aqui só se LÊ o código e se escolhe a FRASE — nenhuma regra é recalculada na tela.
 * Lib única das telas que mostram o ponto (Lançamentos e a CPR).
 */

export const CODIGOS_PRONTO = ['pronto_boleto', 'nada_a_fazer', 'pronto_dados_lancamento', 'pronto_chave_cadastro', 'pronto_dados_bancarios',
  'falta_boleto', 'falta_chave', 'falta_dados_bancarios', 'falta_forma', 'falta_outro'] as const;
export type CodigoPronto = (typeof CODIGOS_PRONTO)[number];

const ehCodigo = (v: unknown): v is CodigoPronto => typeof v === 'string' && (CODIGOS_PRONTO as readonly string[]).includes(v);

/** O código de uma linha da lista (nulo = sem ponto: não é saída, já foi paga ou é sem caixa; código desconhecido = sem ponto). */
export function codigoProntoDaLinha(linha: object): CodigoPronto | null {
  const v = Reflect.get(linha, 'pronto_pagar');
  return ehCodigo(v) ? v : null;
}

/** A forma que vale (a do lançamento; sem ela, a padrão do cadastro), como o banco a devolveu. */
export function formaEfetivaDaLinha(linha: object): string | null {
  const v = Reflect.get(linha, 'forma_efetiva');
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export const ehPronto = (c: CodigoPronto): boolean => !c.startsWith('falta');

/** O que o ponto diz (o `title`): a 1ª linha (pronto / falta), a forma e o que conta. */
export function fraseDoPronto(c: CodigoPronto, forma: string | null): string {
  const motivo: Record<CodigoPronto, string> = {
    pronto_boleto: 'boleto ligado',
    nada_a_fazer: `${forma ?? 'débito/cartão/dinheiro'}: nada a fazer`,
    pronto_dados_lancamento: 'dados de pagamento no próprio lançamento',
    pronto_chave_cadastro: 'PIX: chave do cadastro do fornecedor',
    pronto_dados_bancarios: 'TED: banco, agência e conta do cadastro',
    falta_boleto: 'falta ligar o boleto',
    falta_chave: 'falta a chave PIX no cadastro do fornecedor',
    falta_dados_bancarios: 'falta banco, agência e conta do favorecido',
    falta_forma: 'falta a forma de pagamento',
    falta_outro: 'forma sem regra: escolha boleto, PIX, TED, cartão, débito ou dinheiro',
  };
  const linhas = [ehPronto(c) ? 'Pronto para pagar' : 'Falta algo para pagar', `Forma: ${forma ?? 'em branco'}`, motivo[c]];
  if (!ehPronto(c)) linhas.push('Clique para resolver na aba Pagamento.');
  return linhas.join('\n');
}

/** A contagem do recorte (o seletor e os totais): do recorte SEM o filtro de pagamento — não encolhe ao escolher. */
export interface ResumoPronto { prontos: number; prontosValor: number; faltando: number; faltandoValor: number }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Lê `pronto_pagar` da resposta da página; ausente ou torto = nulo (a tela mostra "—", nunca zeros inventados). */
export function lerResumoPronto(v: unknown): ResumoPronto | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const prontos = num(Reflect.get(v, 'prontos')), prontosValor = num(Reflect.get(v, 'prontos_valor'));
  const faltando = num(Reflect.get(v, 'faltando')), faltandoValor = num(Reflect.get(v, 'faltando_valor'));
  if (prontos === null || prontosValor === null || faltando === null || faltandoValor === null) return null;
  return { prontos, prontosValor, faltando, faltandoValor };
}

export const FILTROS_PRONTO = ['todos', 'prontos', 'faltando'] as const;
export type FiltroPronto = (typeof FILTROS_PRONTO)[number];
