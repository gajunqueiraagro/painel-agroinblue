/**
 * O QUE O RODAPE DO LANCAMENTO OFERECE NO LUGAR DE "CANCELAR" — FIN-V2-CANCEL-MOTIVO-01.
 *
 * Tres saidas, nesta ordem de precedencia:
 *  1. titulo com parte viva de OC -> a frase e o "Abrir OC" (o caminho e' o Desfazer compromisso);
 *  2. lancamento do rebanho ja' realidade de caixa -> a frase do PR-CPR-2A.4;
 *  3. o resto -> o botao "Cancelar lancamento".
 * ⚠ ESPELHO, NAO CONTROLE: o hook recusa de novo (`excluirLancamento`), e o banco segue sendo a
 * autoridade no caso do rebanho. Esconder o botao e' cortesia.
 */
import { Button } from '@/components/ui/button';
import { MOTIVO_BLOQUEIO_REBANHO, MOTIVO_BLOQUEIO_TITULO_OC } from '@/lib/financeiro/cancelamentoLancamento';

/* MODAIS-PADRAO-01e — na medida do rodape de 32px do `LancamentoV2Dialog` (unico chamador): botao 22px/10px e
   as frases em 10px (eram 11px, e a do titulo de OC quebrava em tres linhas). Mesmos textos. */

export function RodapeCancelamento({ tituloOC, bloqueioRebanho, onCancelar, onAbrirOC }: {
  /** Parte viva de OC encontrada para este lancamento (ou nula). */
  tituloOC: { operacaoId: string; tipo: string | null } | null;
  bloqueioRebanho: boolean;
  onCancelar: () => void;
  /** ACESSOS-02b — ausente = a pessoa nao acessa a tela da OC: a frase do bloqueio fica, o atalho "Abrir OC →" sai. */
  onAbrirOC?: (operacaoId: string, tipo: string | null) => void;
}) {
  if (tituloOC) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] leading-tight text-muted-foreground" data-testid="cancelar-titulo-oc">
        {MOTIVO_BLOQUEIO_TITULO_OC}
        {onAbrirOC && (
        <Button variant="link" size="sm" className="h-auto shrink-0 p-0 text-[10px] font-medium"
          onClick={() => onAbrirOC(tituloOC.operacaoId, tituloOC.tipo)}>
          Abrir OC →
        </Button>
        )}
      </span>
    );
  }
  if (bloqueioRebanho) return <span className="text-[10px] leading-tight text-muted-foreground">{MOTIVO_BLOQUEIO_REBANHO}</span>;
  return (
    <Button
      variant="ghost"
      size="sm"
      /* ⚠ `ghost`, NÃO `destructive`: cancelar é ação rara e não compete com Salvar,
         que é o que o operador veio fazer. A cor destrutiva fica no texto. */
      className="h-[22px] px-[9px] text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={onCancelar}
    >
      Cancelar lançamento
    </Button>
  );
}
