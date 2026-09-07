// EnriquecimentoActions — dumb. Barra operacional da Mesa de Revisão.
// Bloco PRINCIPAL = revisão por lançamento (Anterior/Salvar/Salvar e Próximo/Reverter/Próximo).
// Bloco SECUNDÁRIO (após separador) = acelerador em lote "Aplicar todos os Exatos".
// PR-U1: Salvar/Salvar e Próximo/Reverter ligados (flags granulares). P0-1A: "Aplicar
// todos" e "Revisado" ligados — lote conservador da sessão (fn_classificacao_apply).
import { Button } from '@/components/ui/button';

export interface EnriquecimentoActionsProps {
  posicao: string;                 // ex.: "3 / 58"
  onAnterior: () => void;
  onProximo: () => void;
  canAnterior: boolean;
  canProximo: boolean;
  revisado: boolean;
  onRevisado: (v: boolean) => void;
  onSalvar: () => void;
  onSalvarProximo: () => void;
  onReverter: () => void;
  onAplicarTodos: () => void;
  nAplicaveis: number;
  salvarDisabled?: boolean;        // Salvar / Salvar e Próximo
  /**
   * 133b-a correção 1 — POR QUE o Salvar está apagado. Fonte ÚNICA do `disabled`, do
   * `title` e da frase ao lado: um botão apagado sem motivo faz o operador procurar o que
   * consertar em campos que já estão certos.
   */
  salvarMotivo?: string | null;
  /**
   * A linha não tem nada a gravar (Resultado já confere com o sistema): o gesto vira
   * "Confirmar e próximo" — marca revisado e avança, sem chamar o banco.
   */
  soConfirma?: boolean;
  onConfirmarProximo?: () => void;
  reverterDisabled?: boolean;      // Reverter
  aplicarTodosDisabled?: boolean;  // acelerador em lote + Revisado
  isBusy?: boolean;                // uma escrita em andamento
}

export function EnriquecimentoActions({
  posicao, onAnterior, onProximo, canAnterior, canProximo,
  revisado, onRevisado, onSalvar, onSalvarProximo, onReverter, onAplicarTodos, nAplicaveis,
  salvarDisabled, salvarMotivo, soConfirma, onConfirmarProximo,
  reverterDisabled, aplicarTodosDisabled, isBusy,
}: EnriquecimentoActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1 md:shrink-0">
      {/* ── Bloco principal: revisão por lançamento ── */}
      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={onAnterior} disabled={!canAnterior}>
        ◀ Anterior
      </Button>
      <Button size="sm" className="h-6 text-[11px] px-3" onClick={onSalvar}
        disabled={salvarDisabled || isBusy} title={salvarMotivo ?? undefined}>
        Salvar
      </Button>
      <Button size="sm" className="h-6 text-[11px] px-3"
        onClick={soConfirma ? onConfirmarProximo : onSalvarProximo}
        disabled={(soConfirma ? false : salvarDisabled) || isBusy}
        title={soConfirma ? 'O Resultado já confere com o sistema: nada a gravar. Marca como revisado e vai para a próxima.' : (salvarMotivo ?? undefined)}>
        {soConfirma ? 'Confirmar e Próximo' : 'Salvar e Próximo'}
      </Button>
      {salvarMotivo && !soConfirma && (
        <span className="text-[10px] text-muted-foreground">{salvarMotivo}</span>
      )}
      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={onReverter} disabled={reverterDisabled || isBusy}>
        ↺ Reverter
      </Button>
      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={onProximo} disabled={!canProximo}>
        Próximo ▶
      </Button>
      <label className={`flex items-center gap-1.5 text-[11px] ${aplicarTodosDisabled ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
        <input type="checkbox" checked={revisado} disabled={aplicarTodosDisabled || isBusy} onChange={(e) => onRevisado(e.target.checked)} />
        Revisado
      </label>
      <span className="text-[10px] text-muted-foreground tabular-nums">{posicao}</span>

      <div className="flex-1" />

      {/* ── Separador + acelerador secundário (lote) ── */}
      <div className="h-5 w-px bg-border" />
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-[11px] px-2 text-muted-foreground"
        onClick={onAplicarTodos}
        disabled={aplicarTodosDisabled || !revisado || isBusy}
        title="Acelerador: aplica todos os Exatos pendentes DA SESSÃO (todas as contas), sem sobrescrever classificações existentes. Marque 'Revisado' para habilitar."
      >
        Aplicar todos os Exatos ({nAplicaveis})
      </Button>
    </div>
  );
}
