// EnriquecimentoActions — dumb. Barra operacional da Mesa de Revisão.
// Bloco PRINCIPAL = revisão por lançamento (Anterior/Salvar/Salvar e Próximo/Reverter/Próximo).
// O CTA se chama "Salvar e Próximo" SEMPRE (adendo PR-MESA-TRANSF-01); o que muda conforme
// a linha é o que ele faz — grava e avança, ou marca revisada e avança.
// Bloco SECUNDÁRIO (após separador) = acelerador em lote "Aplicar todos os Exatos".
// PR-U1: Salvar/Salvar e Próximo/Reverter ligados (flags granulares). P0-1A: "Aplicar
// todos" e "Revisado" ligados — lote conservador da sessão (fn_classificacao_apply).
import type { ReactNode } from 'react';
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
   * A linha não tem nada a gravar (Resultado já confere com o sistema): o botão continua
   * dizendo "Salvar e Próximo" e marca revisada + avança, sem chamar o banco.
   *
   * ⚠ O RÓTULO NÃO MUDA MAIS — adendo do PR-MESA-TRANSF-01. Estas duas flags decidem o QUE
   * o botão faz; o nome dele é um só, porque o gesto do operador é um só.
   */
  soConfirma?: boolean;
  onConfirmarProximo?: () => void;
  /**
   * 133i item 2c — a linha JÁ foi gravada e não há diferença: nada a gravar.
   *
   * ⚠ A RAZÃO DE ELA EXISTIR CONTINUA A MESMA: chamar o `apply_row` aqui devolveria
   * `pulado_subcentro_preenchido` e o operador veria um toast de recusa no fim de um gesto
   * que estava certo. O que mudou (adendo do PR-MESA-TRANSF-01) é que ela não troca mais o
   * RÓTULO do botão — só o caminho: marca revisada e avança.
   */
  soAvanca?: boolean;
  /**
   * 133i-c item 1 — a ação "É transferência para/de ▾" da linha selecionada.
   *
   * ⚠ SLOT, E NÃO A AÇÃO EMBUTIDA. Este componente é DUMB (diz isso na primeira linha) e a
   * ação precisa de RPC, de estado de simulação e da lista de contas. Recebê-la pronta
   * mantém a barra sem saber o que é uma transferência; quem monta é a Mesa, que já tem
   * as contas e a linha. `null` quando a ação não cabe naquela linha — e aí nada ocupa
   * espaço na faixa.
   */
  slotTransferencia?: ReactNode;
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
  salvarDisabled, salvarMotivo, soConfirma, onConfirmarProximo, soAvanca, slotTransferencia,
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
      {/* ⚠ ANTES DO "Salvar e Próximo", como pedido: reclassificar como transferência vem
          ANTES de gravar a linha — se ela for transferência, o que a Mesa ia gravar deixa
          de fazer sentido. */}
      {slotTransferencia}
      {/* ⚠ UM BOTÃO SÓ, E ELE SEMPRE SE CHAMA "SALVAR E PRÓXIMO" — adendo do
          PR-MESA-TRANSF-01. O rótulo mudava sozinho entre "Salvar e Próximo", "Confirmar e
          Próximo" e "Próximo" conforme a linha tivesse ou não o que gravar, e o operador
          tinha de LER o botão antes de cada clique para saber se o gesto era o mesmo. Num
          trabalho de trezentas linhas seguidas, ler o botão trezentas vezes é o custo; e
          quando o rótulo dizia "Confirmar", parecia que ele estava deixando de gravar
          alguma coisa.
          ⚠ O QUE MUDA É O QUE ACONTECE, NÃO O NOME: com diferença, grava e avança; sem
          diferença, marca a linha como revisada e avança. As duas coisas são "salvar" do
          ponto de vista de quem opera — o que ele quer dizer é "esta está conferida, vá". */}
      <Button size="sm" className="h-6 text-[11px] px-3"
        onClick={soConfirma || soAvanca ? onConfirmarProximo : onSalvarProximo}
        disabled={soConfirma || soAvanca ? isBusy : (salvarDisabled || isBusy)}
        title={soAvanca ? 'Esta linha já está gravada e nada mudou: marca como revisada e vai para a próxima.'
          : soConfirma ? 'O Resultado já confere com o sistema: nada a gravar. Marca como revisada e vai para a próxima.'
          : (salvarMotivo ?? 'Grava esta linha no lançamento e vai para a próxima.')}>
        Salvar e Próximo
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
        <b>Salvar</b> grava no lançamento; sem mudança, só marca a linha como revisada.
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
