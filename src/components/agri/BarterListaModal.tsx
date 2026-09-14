/**
 * A CASCA DOS TRÊS MODAIS DE LISTA DO BARTER — PR-AGRI-BARTER-RESUMO-MODAL.
 *
 * ⚠ NÃO É O `LancamentoModalEnvelope`, e medi antes de decidir. Aquele é a casca de um
 * FORMULÁRIO de lançamento: o cabeçalho exige `data` e `fazendaNome` e imprime a pílula
 * "Realizado"; o corpo é duas colunas (campos à esquerda, resumo à direita); o rodapé aceita
 * UMA ação. Uma lista de 26 insumos não tem data nem fazenda próprias, não tem resumo lateral e
 * tem duas ações por LINHA. Forçá-la ali obrigaria a inventar um cabeçalho falso — e a pílula
 * "Realizado" sobre uma lista é ruído que parece informação.
 *
 * ⚠ O QUE SE REUSA É O PADRÃO, e ele está aqui inteiro: faixa `bg-primary` no topo e no rodapé,
 * corpo rolando entre as duas, cabeçalho de tabela grudado e total fixo. É o mesmo chassi que as
 * três listas já tinham na tela — elas só mudaram de moldura.
 *
 * ⚠ TRÊS USOS NO MESMO PR, e é por isso que a casca existe em vez de três cópias: insumos,
 * vendas e extrato. A quarta cópia é que costuma cobrar o preço; aqui a terceira já bastou.
 */
import type { ReactNode } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BarterListaModal({
  aberto, titulo, subtitulo, acao, rodapeEsquerda, rodapeDireita, onFechar, children,
}: {
  aberto: boolean;
  titulo: string;
  /** Uma linha de contexto — o que a lista responde. */
  subtitulo: string;
  /** Botão de ação do cabeçalho ("Adicionar insumo"), opcional. */
  acao?: ReactNode;
  /** O rótulo do total, no rodapé fixo. */
  rodapeEsquerda: ReactNode;
  /** O número do total. */
  rodapeDireita: ReactNode;
  onFechar: () => void;
  /** A tabela. O cabeçalho dela usa `sticky top-0` e gruda neste scrollport. */
  children: ReactNode;
}) {
  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA FIXA EM 80vh, NÃO `max-h`. Com `max-h` o modal encolheria para caber em 3
          linhas e cresceria em 26 — e a lista, que é onde o operador trabalha, mudaria de
          tamanho conforme o dado. Altura fixa mantém o rodapé no mesmo lugar sempre. */}
      <DialogContent
        className={cn('flex h-[80vh] max-w-4xl flex-col gap-0 overflow-hidden p-0',
          '[&>button.absolute]:hidden')}>
        <div className="flex shrink-0 items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight">{titulo}</h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">{subtitulo}</p>
          </div>
          <div className="flex-1" />
          {acao}
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ⚠ RECUO INTERNO — item 10 do polish. A tabela nascia colada nas bordas do modal, e
            texto encostado na moldura se lê pior e parece corte. O `px-3 py-2` é o mesmo respiro
            dos outros modais da casa. */}
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">{children}</div>

        <div className="flex shrink-0 items-center justify-between gap-2 bg-primary px-4 py-1.5
          text-[11px] font-semibold text-primary-foreground">
          <span className="truncate">{rodapeEsquerda}</span>
          <span className="tabular-nums">{rodapeDireita}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O cartão de resumo que fica NA TELA no lugar de cada lista.
 *
 * ⚠ ELE NÃO REPETE O DINHEIRO DOS CARDS DE TOPO. "Recebido (insumos) R$ 390.000" já está lá em
 * cima; repetir aqui gastaria a altura que este PR existe para economizar, e dois números iguais
 * em telas diferentes é como nascem as divergências de leitura.
 * ⚠ OS BOTÕES FICAM SEMPRE NOS MESMOS LUGARES, inclusive quando não há o que ver: "Ver" com
 * lista vazia continua abrindo e dizendo que está vazia. Botão que some conforme o dado é
 * exatamente o que a lei de estabilidade visual proíbe.
 */
export function BarterResumoCard({
  titulo, estado, valor, cor, children,
}: {
  titulo: string;
  /** A contagem: "26 insumos". Nunca vazia — use "—". */
  estado: ReactNode;
  /**
   * O DINHEIRO, em destaque — item 2 do polish.
   *
   * ⚠ ELE SAIU DA MESMA LINHA DA CONTAGEM. "26 insumos · R$ 390.252,59" em 11px cinza punha o
   * número que importa no mesmo peso do que é só contexto, e o olho não achava nenhum dos dois.
   */
  valor?: string;
  /** Verde para receita, vermelho para custo — o padrão de cor da casa. */
  cor?: string;
  /** Os botões. */
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-card px-2.5 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</div>
      {/* ⚠ A LINHA DO VALOR OCUPA ALTURA SEMPRE, com ou sem número: o card de materializar não tem
          valor, e sem o `min-h` os três cartões da linha teriam alturas diferentes. */}
      <div className={cn('min-h-[19px] truncate text-[16px] font-medium leading-none tabular-nums', cor)}>
        {valor ?? ''}
      </div>
      <div className="min-h-[13px] truncate text-[10px] leading-tight text-muted-foreground">{estado}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}
