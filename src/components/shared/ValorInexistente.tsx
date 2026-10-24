/**
 * O VALOR QUE NÃO ESTÁ NAS OPÇÕES — P94 (FIN-V2-FILTRO-FANTASMA-01). A TELA NUNCA FILTRA O QUE NÃO MOSTRA: um seletor cujo valor não
 * está entre as opções do cliente não diz "Todos" (o rótulo do vazio), nem o id cru, nem nada — diz, em vermelho, "valor inexistente
 * (limpar)", e o ✕ (ou o próprio texto) volta ao padrão. OPT-IN: só quem passa `valorInexistente` aos seletores vê; as outras telas
 * não mudam.
 * ⚠ O CLIQUE NÃO ABRE O SELETOR: o Select do Radix abre no `pointerdown` do gatilho, então o marcador para o evento ali.
 */
import { X } from 'lucide-react';

export const FRASE_VALOR_INEXISTENTE = 'valor inexistente (limpar)';
/** a borda e o texto do gatilho com o valor inexistente */
export const CLASSE_DO_INEXISTENTE = '!border-destructive !text-destructive';

export function ValorInexistente({ onLimpar }: { onLimpar: () => void }) {
  const parar = (e: { stopPropagation: () => void; preventDefault: () => void }) => { e.stopPropagation(); e.preventDefault(); };
  return (
    <span role="button" tabIndex={-1} data-testid="valor-inexistente" title="Este valor não existe neste cliente. Clique para limpar."
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-0.5 text-left text-destructive"
      onPointerDown={parar} onMouseDown={parar} onClick={(e) => { parar(e); onLimpar(); }}>
      <span className="uma-linha-que-rola min-w-0 flex-1">{FRASE_VALOR_INEXISTENTE}</span>
      <X className="h-2.5 w-2.5 shrink-0" aria-label="Limpar" />
    </span>
  );
}
