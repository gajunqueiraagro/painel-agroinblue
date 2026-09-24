/**
 * LinhaResumo — o par rótulo-valor do resumo lateral dos modais de operação comercial (A17).
 *
 * ⚠ MOVIDO VERBATIM de `AbateModalShell:137` — MOVIMENTACOES-PADRAO-01c-i. O JSX é byte a byte
 * o que foi homologado lá; nada foi reescrito na mudança, e o diff do trecho movido é vazio.
 *
 * ⚠ ELE EXISTIA TRÊS VEZES, E AS TRÊS JÁ TINHAM DIVERGIDO:
 *     abate/AbateModalShell.tsx:137   cor · forte · selo · empilhado · seloAbaixo
 *     venda/VendaModalShell.tsx:113   cor · forte · selo          ("SEXTA COPIA deste par")
 *     compra/ResumoLateralOC.tsx:188  valorClassName
 * As correções de 24/09 — `empilhado` (a linha que não cabe vira duas sublinhas) e `seloAbaixo`
 * (o selo para de disputar a linha com o dinheiro e o `truncate` para de comer o número) —
 * chegaram só ao Abate. Compra e Venda seguiam truncando onde o Abate já empilhava. Cópia não
 * diverge no futuro: ela JÁ tinha divergido, e é isso que este arquivo encerra.
 *
 * ⚠ O PADDING MORA NA LINHA, NÃO NO CONTAINER, e essa é a regra que os três precisam seguir
 * para virarem um. O Abate já fazia assim; Compra e Venda davam `px-3 space-y-0.5` no container
 * e mantinham a linha sem padding. Quem consome esta peça NÃO põe padding horizontal nem
 * `space-y` no container — senão soma duas vezes.
 *
 * Módulo folha: importa só React. `ui/` nunca importa de `abate/`, `compra/` ou `venda/`.
 */
import type { ReactNode } from 'react';

export function LinhaResumo({ rotulo, valor, cor, forte, selo, empilhado, seloAbaixo }: {
  rotulo: string; valor: string | null;
  /* ⚠ A COR VEM DE FORA — B-11. O resumo passou a mostrar dois mundos (projecao ambar,
     realizado solido) e a mesma linha serve aos dois; cravar a cor aqui obrigaria a um
     segundo `LinhaResumo`, que e' como dois pares rotulo-valor comecam a divergir. */
  cor?: string; forte?: boolean; selo?: ReactNode;
  /**
   * Rotulo em cima, valor embaixo a direita — MOVIMENTACOES-PADRAO-01a.
   *
   * ⚠ NAO E' ESTILO, E' O QUE SOBRA QUANDO O PAR NAO CABE. Medido no NJ 16/04/2026 (Range
   * sobre o conteudo contra o `clientWidth` menos o padding, descontando a escala 0,95 do
   * Radix), em 10px:
   *                              precisa   com 200px (182 uteis)   com 240px (218 uteis)
   *     "por @ · por cabeca"      214,8          -32,8                   +3,2
   *     "Carcaca · RC"            185,0           -3,0                  +33,0
   *     "A receber da industria"  183,0           -1,0                  +35,0
   * O aside foi a 240px no fix1 e as duas ultimas voltaram a UMA linha. So' "por @ · por
   * cabeca" segue empilhada: +3,2px nao e' folga, e' sorte — o proximo digito a consome.
   * As tres saidas proibidas estao proibidas por um motivo cada: truncate esconde digito
   * de dinheiro, 9px quebra o piso do A18, e alargar mais o aside rouba do corpo.
   */
  empilhado?: boolean;
  /**
   * O selo desce para uma sublinha propria, a direita — fix2.
   *
   * ⚠ ELE DISPUTAVA A LINHA COM O DINHEIRO E GANHAVA. "A receber da industria" leva o selo
   * "agendado 13/09/2026"; com os dois no mesmo `flex`, o `truncate` do valor cortava o
   * NUMERO — "R$ ..." — enquanto a data continuava inteira. O selo e' contexto, o valor e'
   * a resposta: quem encolhe e' o contexto.
   * ⚠ SEM SELO A LINHA NAO CRESCE: a sublinha so' existe quando ha selo, entao a linha
   * segue em 16px no caso comum.
   */
  seloAbaixo?: boolean;
}) {
  return (
    /* ⚠ O PADDING MORA NA LINHA, nao no container — A17. Cada item e' uma linha so', com
       o valor a direita e sem quebra; `py-px` da' ~16px por linha, e e' o que faz as
       quatro secoes caberem sem rolar. Empilhada, a linha vai a ~26px. */
    <div className={`px-2.5 py-px leading-tight ${empilhado || seloAbaixo ? '' : 'flex items-baseline justify-between gap-1.5'}`}>
      <div className={empilhado || !seloAbaixo ? 'contents' : 'flex items-baseline justify-between gap-1.5'}>
        <span className={`text-muted-foreground ${empilhado ? 'block' : 'shrink-0'}`}>{rotulo}</span>
        <span className={`flex items-baseline gap-1.5 min-w-0 ${empilhado ? 'justify-end' : ''}`}>
          {!seloAbaixo && selo}
          <span className={`text-right tabular-nums ${empilhado || seloAbaixo ? 'whitespace-nowrap' : 'truncate'} ${forte ? 'font-bold' : 'font-medium'} ${valor ? (cor ?? '') : ''}`}>
            {valor || '—'}
          </span>
        </span>
      </div>
      {seloAbaixo && selo && <div className="flex justify-end leading-none">{selo}</div>}
    </div>
  );
}
