/**
 * Os grupos de conta bancária, num lugar só — [CONCIL-MES-02] (132).
 *
 * ⚠ O VOCABULÁRIO É O DO PR-H1, e o banco o guarda em `financeiro_contas_bancarias.
 * tipo_conta` com um CHECK: `corrente | investimento | cartao | caixa | outro`. A ordem
 * saiu do `ConciliacaoBancariaTab`, onde vivia como `CONTA_GROUP_ORDER`; os rótulos
 * estavam escritos à mão em três `<tr>` daquela mesma tela.
 *
 * ⚠ EXTRAÍDO PORQUE O SEGUNDO CONSUMIDOR CHEGOU. Enquanto era uma tela, a constante local
 * bastava; com o dropdown do Importar Banco agrupando igual, duas listas de rótulos
 * divergiriam na primeira conta nova. A tabela de saldos daquela tela ainda tem os três
 * `<tr>` literais — ela não migra aqui, e fica anotado: é tela homologada, e trocá-la junto
 * misturaria duas mudanças.
 */

/**
 * Ordem de exibição. Tipo desconhecido cai no fim, sem sumir da lista.
 *
 * ⚠ AS CHAVES SÃO AS DO BANCO, E ESTAVAM ERRADAS — 133g item 9. Este mapa nasceu no 132 com
 * `corrente`/`investimento`, e a coluna `financeiro_contas_bancarias.tipo_conta` guarda
 * `cc`/`inv`/`cartao` — medido: 35 `cc`, 25 `inv`, 9 `cartao`, e nenhuma `corrente` nem
 * `investimento` em 69 contas. Com as chaves antigas, `grupoDaConta` devolvia `outro` para
 * TODAS elas: o dropdown do Importar Banco exibia as 69 sob "Outros", e ninguém reparou
 * porque uma faixa só continua parecendo uma lista.
 * ⚠ `caixa` E `outro` FICAM: `caixa` está no vocabulário do produto e ainda não tem conta;
 * `outro` é o destino honesto do tipo que não se reconhece.
 */
export const ORDEM_GRUPO_CONTA: Record<string, number> = {
  cc: 0,
  inv: 1,
  cartao: 2,
  caixa: 3,
  outro: 4,
};

/** O rótulo que o operador lê — o mesmo das faixas da tabela de saldos. */
export const ROTULO_GRUPO_CONTA: Record<string, string> = {
  cc: 'Conta corrente',
  inv: 'Investimentos',
  cartao: 'Cartão',
  caixa: 'Caixa',
  outro: 'Outros',
};

/** A chave normalizada do grupo. Vazio ou desconhecido vira `outro`. */
export function grupoDaConta(tipoConta: string | null | undefined): string {
  const t = (tipoConta ?? '').toLowerCase().trim();
  return t in ORDEM_GRUPO_CONTA ? t : 'outro';
}

/**
 * Agrupa e ordena: grupos na ordem oficial, contas em ordem alfabética dentro de cada um.
 * Grupo sem conta não aparece — uma faixa vazia é ruído.
 */
export function agruparContasPorTipo<T extends { tipo_conta?: string | null; label: string }>(
  contas: readonly T[],
): Array<{ chave: string; rotulo: string; contas: T[] }> {
  const mapa = new Map<string, T[]>();
  for (const c of contas) {
    const g = grupoDaConta(c.tipo_conta);
    const atual = mapa.get(g);
    if (atual) atual.push(c); else mapa.set(g, [c]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (ORDEM_GRUPO_CONTA[a] ?? 99) - (ORDEM_GRUPO_CONTA[b] ?? 99))
    .map(([chave, lista]) => ({
      chave,
      rotulo: ROTULO_GRUPO_CONTA[chave] ?? 'Outros',
      contas: [...lista].sort((x, y) => x.label.localeCompare(y.label, 'pt-BR')),
    }));
}
