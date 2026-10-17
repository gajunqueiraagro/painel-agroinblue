/**
 * FIN-FINANC-28-P3-FIX — O NOME CURTO DO CREDOR, numa regra só (o cadastro `financeiro_fornecedores` não tem campo de nome
 * curto). Usado onde a coluna é estreita e NÃO PODE CORTAR (a lista de financiamentos); o nome inteiro vai no `title`.
 *
 * Ordem: (1) banco conhecido pelo nome, sem acento e sem caixa — "Itaú BBA" antes de "Itaú"; (2) o nome que já cabe no teto
 * fica inteiro; (3) mais de uma palavra: a primeira + a inicial da última ("Fabio D."); (4) uma palavra só: ela mesma. Teto de 12 caracteres
 * (`TETO_NOME_CURTO`): passou, corta em 11 + "." — a coluna é medida para 12.
 * Medido em 17/10 nos credores de financiamento e empréstimo do proto: 24 nomes, nenhum passa do teto.
 */
export const TETO_NOME_CURTO = 12;

const BANCOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bitau\s*bba\b/, 'Itaú BBA'],
  [/\bitau\b/, 'Itaú'],
  [/\bbanco do brasil\b|^bb\b/, 'BB'],
  [/\bbradesco\b/, 'Bradesco'],
  [/\bsicredi\b/, 'Sicredi'],
  [/\bsicoob\b/, 'Sicoob'],
  [/\bbrde\b/, 'BRDE'],
  [/\bde lage landen\b|\bdll\b/, 'DLL'],
  [/\bjohn deere\b/, 'John Deere'],
  [/\brabobank\b/, 'Rabobank'],
  [/\bsantander\b/, 'Santander'],
  [/\bcaixa economica\b|\bcef\b/, 'Caixa'],
  [/\bbanco do nordeste\b|\bbnb\b/, 'BNB'],
  [/\bbndes\b/, 'BNDES'],
  [/\bsafra\b/, 'Safra'],
  [/\bbtg\b/, 'BTG'],
  [/\bcresol\b/, 'Cresol'],
];

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function nomeCurtoDoCredor(nome: string | null | undefined): string {
  const limpo = (nome ?? '').trim().replace(/\s+/g, ' ');
  if (!limpo) return '—';
  const chave = semAcento(limpo).toLowerCase();
  for (const [re, curto] of BANCOS) if (re.test(chave)) return curto;
  if (limpo.length <= TETO_NOME_CURTO) return limpo;
  const palavras = limpo.split(' ').filter((p) => !/^(da|de|do|das|dos|e)$/i.test(p));
  const curto = palavras.length > 1 ? `${palavras[0]} ${palavras[palavras.length - 1][0].toUpperCase()}.` : limpo;
  return curto.length > TETO_NOME_CURTO ? `${curto.slice(0, TETO_NOME_CURTO - 1)}.` : curto;
}
