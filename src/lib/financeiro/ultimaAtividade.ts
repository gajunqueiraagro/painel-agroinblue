/**
 * A ÚLTIMA ATIVIDADE USADA — PR-FIN-ATIVIDADE-01 (decisão D13).
 *
 * ⚠ VALOR DE MÓDULO, E NÃO `useState`, e o motivo é mecânico: o modal de lançamento
 * DESMONTA a cada fechamento — os oito montadores o renderizam sob `open &&` ou equivalente.
 * Um `useState` voltaria a vazio toda vez, e "lembrar a última" nunca funcionaria. O módulo
 * vive enquanto a aba viver, que é exatamente o alcance pedido: a sessão.
 *
 * ⚠ SEM `localStorage`, por decisão. Lembrar entre sessões faria o operador abrir a tela
 * amanhã com um filtro que ele não escolheu hoje, e procurar um subcentro que a lista está
 * escondendo. O esquecimento no fim da sessão é a garantia de que ninguém herda um recorte.
 *
 * ⚠ NÃO É PREFERÊNCIA, É ATALHO. Nada depende deste valor: quem abre e não mexe em nada
 * escolhe pela lista completa, porque o card só filtra quando tem valor.
 */
export type Atividade = 'pecuaria' | 'agricultura' | 'silvicultura' | 'administrativo';

/**
 * ⚠ O RÓTULO É "LAVOURA", O VALOR É `agricultura`. O operador chama de lavoura; o plano de
 * contas, o `escopo_negocio` e o banco chamam de agricultura. Trocar o identificador para
 * casar com a fala custaria uma migration e quebraria tudo que já grava; trocar o texto
 * custa esta linha.
 */
export const ATIVIDADES: readonly { valor: Atividade; rotulo: string }[] = [
  { valor: 'pecuaria', rotulo: 'Pecuária' },
  { valor: 'agricultura', rotulo: 'Lavoura' },
  { valor: 'silvicultura', rotulo: 'Silvicultura' },
  { valor: 'administrativo', rotulo: 'Administrativo' },
];

const VALIDAS = new Set<string>(ATIVIDADES.map((a) => a.valor));

let ultima: Atividade | null = null;

/** A última escolhida nesta sessão. `null` no primeiro uso — e aí a lista é a completa. */
export function ultimaAtividade(): Atividade | null {
  return ultima;
}

/**
 * ⚠ SÓ GUARDA O QUE CONHECE. O `escopo_negocio` do plano tem valores fora desta lista
 * (vazio, e o `outros` que o normalizador da lista devolve); guardá-los faria o modal
 * abrir filtrando por um escopo que não existe no card, com a lista vazia e sem pílula
 * marcada para explicar por quê.
 */
export function lembrarAtividade(v: string | null | undefined): void {
  if (v && VALIDAS.has(v)) ultima = v as Atividade;
}

/** Só para teste: devolve o módulo ao estado de primeira abertura. */
export function esquecerAtividade(): void {
  ultima = null;
}
