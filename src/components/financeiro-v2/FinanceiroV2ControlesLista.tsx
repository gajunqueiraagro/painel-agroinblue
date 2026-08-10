/**
 * PR-FIN-LISTA-VENCIMENTO-03 · 2C-4 — controles da lista por vencimento.
 *
 * Reúne o que a fase 2C-4 acrescenta: o botão "Aplicar filtros", o bloco 2×2 de
 * ações, o aviso de alterações pendentes, o contador de lançamentos sem
 * vencimento e a paginação real de 30.
 *
 * É um componente de APRESENTAÇÃO: recebe tudo por props e não conhece hook,
 * contexto nem rede. Isso é o que permite testá-lo com testing-library e
 * fotografá-lo nas quatro larguras sem subir a aplicação inteira.
 *
 * Só é renderizado com a feature flag LIGADA. Com a flag desligada a tela
 * mantém o layout legado, intacto.
 */
import { Plus, FilterX, Maximize2, Minimize2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  rotuloPaginacao,
  avisoSemVencimento,
  type EstadoPaginacao,
} from '@/lib/financeiro/estadoFiltrosLista';

/**
 * Botão "Aplicar filtros", isolado.
 *
 * Mora fora do bloco de ações de propósito: o lugar dele é ao lado de
 * Atividade, no FIM da fileira de filtros, e não junto de Novo/Exportar. Quem
 * acabou de mexer nos campos precisa do botão à mão, não do outro lado da tela.
 */
export function BotaoAplicarFiltros({ pendente, onAplicar, className }: {
  pendente: boolean;
  onAplicar: () => void;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      data-testid="btn-aplicar"
      onClick={onAplicar}
      disabled={!pendente}
      className={cn(
        'h-6 text-[10px] gap-0.5 px-2 bg-[#2F6FBF] text-white hover:bg-[#255A9C] disabled:opacity-50',
        className,
      )}
      title="Aplicar filtros"
    >
      Aplicar filtros
    </Button>
  );
}

export interface PropsControlesLista {
  /** Há alterações de filtro ainda não aplicadas — acende o aviso. */
  pendente: boolean;
  onLimpar: () => void;
  onNovo: () => void;
  /** O menu de exportação existente, passado como slot para preservar sua identidade. */
  exportar?: React.ReactNode;
  modoIntensivo: boolean;
  onToggleIntensivo: () => void;
  onVoltar?: () => void;

  /** Quantos lançamentos sem vencimento o período em vigor deixou de fora. */
  excluidosSemVencimento: number;
  /** Valor de RASCUNHO da opção — ligar não muda a lista antes de aplicar. */
  incluirSemVencimento: boolean;
  onToggleSemVencimento: () => void;

  paginacao: EstadoPaginacao;
  total: number;
  onPagina: (p: number) => void;
  carregandoLista?: boolean;
}

export function FinanceiroV2ControlesLista({
  pendente, onLimpar, onNovo, exportar,
  modoIntensivo, onToggleIntensivo, onVoltar,
  excluidosSemVencimento, incluirSemVencimento, onToggleSemVencimento,
  paginacao, total, onPagina, carregandoLista,
}: PropsControlesLista) {
  const aviso = avisoSemVencimento(excluidosSemVencimento, incluirSemVencimento);

  return (
    <div data-testid="controles-lista" className="flex flex-col gap-1">
      {/* Bloco 2x2 congelado no GO:  Novo | Exportar  /  Limpar | Intensivo.
          O "Aplicar filtros" NAO mora aqui — ele fica ao lado de Atividade,
          no fim da fileira de filtros. Ver BotaoAplicarFiltros. */}
      <div className="flex flex-wrap items-start justify-end gap-2">
        <div data-testid="bloco-acoes" className="grid grid-cols-2 gap-1">
          <Button
            size="sm"
            data-testid="btn-novo"
            onClick={onNovo}
            className="h-6 text-[10px] gap-0.5 px-1.5 bg-[#E7C873] text-foreground hover:bg-[#D9B95F]"
            title="Novo Lançamento"
          >
            <Plus className="h-3 w-3" /> Novo
          </Button>

          <div data-testid="slot-exportar" className="flex items-center">{exportar}</div>

          <Button
            size="sm"
            variant="outline"
            data-testid="btn-limpar"
            onClick={onLimpar}
            className="h-6 text-[10px] gap-0.5 px-1.5 text-muted-foreground"
            title="Limpar filtros"
          >
            <FilterX className="h-3 w-3" /> Limpar
          </Button>

          <Button
            size="sm"
            variant={modoIntensivo ? 'default' : 'outline'}
            data-testid="btn-intensivo"
            onClick={onToggleIntensivo}
            className={cn('h-6 text-[10px] gap-0.5 px-1.5', modoIntensivo && 'bg-primary text-primary-foreground')}
            title={modoIntensivo ? 'Sair do Modo Intensivo' : 'Modo Intensivo'}
          >
            {modoIntensivo ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {modoIntensivo ? 'Sair' : 'Intensivo'}
          </Button>
        </div>
      </div>

      {onVoltar && (
        <div>
          <Button size="sm" variant="outline" data-testid="btn-voltar" onClick={onVoltar}
                  className="h-6 text-[10px] gap-0.5 px-1.5" title="Voltar">
            <ChevronLeft className="h-3 w-3" /> Voltar
          </Button>
        </div>
      )}

      {/* Aviso de pendência. A lista continua mostrando o ÚLTIMO filtro aplicado —
          o texto diz isso, para o operador não achar que está vendo o que digitou. */}
      {pendente && (
        <div
          data-testid="aviso-pendente"
          role="status"
          className="flex items-center gap-1 rounded border border-[#E7C873] bg-[#FDF6E3] px-2 py-1 text-[10px] text-foreground"
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>Filtros alterados. A lista ainda mostra o último filtro aplicado — clique em <strong>Aplicar filtros</strong>.</span>
        </div>
      )}

      {/* Sem vencimento: só aparece quando há de fato excluídos. */}
      {aviso && (
        <div data-testid="aviso-sem-vencimento" className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span data-testid="contador-sem-vencimento">{aviso}</span>
          <Button
            size="sm"
            variant="outline"
            data-testid="btn-incluir-sem-vencimento"
            onClick={onToggleSemVencimento}
            className="h-5 text-[9px] px-1.5"
          >
            Incluir sem vencimento
          </Button>
        </div>
      )}
      {incluirSemVencimento && (
        <div data-testid="marca-incluindo-sem-vencimento" className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>Incluindo lançamentos sem vencimento (ao final da lista).</span>
          <Button
            size="sm"
            variant="outline"
            data-testid="btn-excluir-sem-vencimento"
            onClick={onToggleSemVencimento}
            className="h-5 text-[9px] px-1.5"
          >
            Voltar a excluir
          </Button>
        </div>
      )}

      {/* Paginação. `de–ate de total` vem do count do servidor, não das linhas
          em memória: são 30 na tela e o total pode ser 29 mil. */}
      <div data-testid="paginacao" className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <span data-testid="rotulo-paginacao" className="text-muted-foreground">
          {rotuloPaginacao(paginacao, total)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="outline" data-testid="btn-pagina-anterior"
            disabled={paginacao.primeira || paginacao.vazio || carregandoLista}
            onClick={() => onPagina(paginacao.pagina - 1)}
            className="h-6 w-6 p-0" title="Página anterior"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span data-testid="indicador-pagina" className="px-1 text-muted-foreground">
            {paginacao.vazio ? '—' : `${paginacao.pagina + 1} / ${paginacao.totalPaginas}`}
          </span>
          <Button
            size="sm" variant="outline" data-testid="btn-pagina-proxima"
            disabled={paginacao.ultima || paginacao.vazio || carregandoLista}
            onClick={() => onPagina(paginacao.pagina + 1)}
            className="h-6 w-6 p-0" title="Próxima página"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
