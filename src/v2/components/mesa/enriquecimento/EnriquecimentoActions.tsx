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
  /**
   * 133i item 2c — a linha JÁ foi gravada e não há diferença: o gesto que resta é seguir.
   *
   * ⚠ "SALVAR E PRÓXIMO" NUMA LINHA GRAVADA PROMETE UMA GRAVAÇÃO QUE NÃO ACONTECE: o
   * `apply_row` responde `pulado_subcentro_preenchido`, o operador vê um toast de recusa no
   * fim de um gesto que estava certo, e passa a desconfiar do botão. "Confirmar" também não
   * serve — não há o que confirmar em algo que já está no banco.
   */
  soAvanca?: boolean;
  reverterDisabled?: boolean;      // Reverter
  aplicarTodosDisabled?: boolean;  // acelerador em lote + Revisado
  isBusy?: boolean;                // uma escrita em andamento
  /**
   * 133h item 12 — em que a planilha diverge do extrato, nesta linha.
   *
   * ⚠ AVISO, NUNCA TRAVA. A RPC já ignora estes campos quando o lançamento veio do extrato;
   * o que faltava era o operador ver a divergência ANTES de salvar, em vez de descobrir no
   * fechamento que o arquivo dele dizia outra data. Lista vazia = nada a dizer.
   */
  divergenciasDoExtrato?: readonly string[];
  /**
   * 133h adendo item 15 — o que o banco respondeu na ÚLTIMA tentativa de gravar esta linha.
   *
   * ⚠ O TOAST SOZINHO NÃO BASTA: ele some em segundos e o operador fica com um botão que
   * "não fez nada" e nenhuma explicação na tela. O motivo fica escrito, em vermelho, ao
   * lado do botão — até a próxima tentativa ou até trocar de linha.
   */
  erroBanco?: string | null;
}

export function EnriquecimentoActions({
  posicao, onAnterior, onProximo, canAnterior, canProximo,
  revisado, onRevisado, onSalvar, onSalvarProximo, onReverter, onAplicarTodos, nAplicaveis,
  salvarDisabled, salvarMotivo, soConfirma, onConfirmarProximo, soAvanca,
  reverterDisabled, aplicarTodosDisabled, isBusy, divergenciasDoExtrato, erroBanco,
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
        onClick={soAvanca ? onProximo : soConfirma ? onConfirmarProximo : onSalvarProximo}
        disabled={soAvanca ? !canProximo : ((soConfirma ? false : salvarDisabled) || isBusy)}
        title={soAvanca ? 'Esta linha já está gravada e nada mudou: só seguir.'
          : soConfirma ? 'O Resultado já confere com o sistema: nada a gravar. Marca como revisado e vai para a próxima.'
          : (salvarMotivo ?? undefined)}>
        {soAvanca ? 'Próximo' : soConfirma ? 'Confirmar e Próximo' : 'Salvar e Próximo'}
      </Button>
      {/* ⚠ 133h item 8 — O MOTIVO EM ÂMBAR, NÃO EM CINZA. Ele estava na cor do texto
          secundário, ao lado de um botão apagado: dois cinzas dizendo "não dá" sem que
          nenhum chamasse o olho. Âmbar é a cor de "falta algo" no resto da tela. */}
      {salvarMotivo && !soConfirma && !soAvanca && (
        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">{salvarMotivo}</span>
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

      {/* 133h adendo item 15 — o erro do banco fica na tela, não só no toast. */}
      {erroBanco && (
        <span className="w-full text-[10px] font-medium text-red-700 dark:text-red-400"
          title={erroBanco}>
          Não gravou — o banco recusou: {erroBanco}
        </span>
      )}

      {/* 133h item 12 — a divergência com o extrato, escrita, antes de gravar. */}
      {divergenciasDoExtrato && divergenciasDoExtrato.length > 0 && (
        <span className="w-full text-[10px] text-amber-700 dark:text-amber-400">
          Planilha diverge do extrato em: {divergenciasDoExtrato.join(' · ')} — o extrato manda,
          e estes campos não serão gravados.
        </span>
      )}

      {/* 133h item 11 — a mesma frase do rodapé do passo 2: a Mesa também precisa dizê-la. */}
      <span className="text-[10px] text-muted-foreground">
        <b>Salvar</b> grava no lançamento agora. <b>Confirmar</b> só marca a linha como revisada.
      </span>

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
