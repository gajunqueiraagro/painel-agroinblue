/** FECH-CARDS-QUEBRA-01 (4, Gabriel 11/11 15:15): o aviso "Pastos sem Tipo de Uso" diz QUAIS — "P8, P16, … +3": até 8 nomes, o resto vira "+N" */
export function nomesAteOito(nomes: readonly string[]): string {
  return nomes.length <= 8 ? nomes.join(', ') : `${nomes.slice(0, 8).join(', ')} +${nomes.length - 8}`;
}

/** FECH-CARDS-QUEBRA-01 (Chat 18:25) — o nome do card nunca com "…": até 8 letras fica em 12px; mais longo desce a 11px (e quebra em linhas
 *  se ainda não couber). "P12 Retiro do córrego de baixo" → 11px. */
export function fonteDoNomeDoCard(nome: string): 'text-xs' | 'text-[11px]' {
  return nome.trim().length > 8 ? 'text-[11px]' : 'text-xs';
}
