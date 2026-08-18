// ============================================================================
// EnriquecimentoMesaModal — PR-UX-ENR-MODAL-01. Superfície AMPLA da Mesa de
// Enriquecimento. Componente dumb: não busca dado, não calcula, não decide.
//
// Recebe os MESMOS prop-bags que MesaEnriquecimentoTab entrega hoje a
// EnriquecimentoLista / EnriquecimentoDetalhe / EnriquecimentoActions — por isso
// não há lógica duplicada entre aba e modal: são duas superfícies do mesmo estado.
//
// Únicas diferenças de APRESENTAÇÃO em relação à aba:
//   · grid 0.28fr_1fr (na aba, 0.40fr_1fr) — aqui a lista só localiza;
//   · `amplo` no detalhe (colunas mais largas + tipografia maior).
// Padrão de diálogo reutilizado de MesaPareamentoModal.tsx:1365.
// ============================================================================
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnriquecimentoLista, type EnriquecimentoListaProps } from './EnriquecimentoLista';
import { EnriquecimentoDetalhe, type EnriquecimentoDetalheProps } from './EnriquecimentoDetalhe';
import { EnriquecimentoActions, type EnriquecimentoActionsProps } from './EnriquecimentoActions';

export interface EnriquecimentoMesaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rótulo da sessão ativa (mesmo label do seletor da toolbar). '—' quando não há. */
  sessaoLabel: string | null;
  lista: EnriquecimentoListaProps;
  detalhe: EnriquecimentoDetalheProps;
  actions: EnriquecimentoActionsProps;
}

export function EnriquecimentoMesaModal({
  open, onOpenChange, sessaoLabel, lista, detalhe, actions,
}: EnriquecimentoMesaModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1800px] h-[92vh] max-h-[92vh] p-0 flex flex-col">
        <DialogHeader className="px-3 py-1.5 border-b shrink-0 space-y-0">
          <div className="flex items-baseline gap-2 flex-wrap text-left">
            <DialogTitle className="text-xs font-bold tracking-tight uppercase shrink-0">
              Mesa de revisão — enriquecimento
            </DialogTitle>
            <span className="text-[11px] text-muted-foreground min-w-0 truncate" title={sessaoLabel ?? undefined}>
              {sessaoLabel ?? '—'}
            </span>
          </div>
        </DialogHeader>

        {/* Corpo. A cadeia de altura (flex-1 min-h-0 → h-full + grid-template-rows
            minmax(0,1fr)) é a MESMA da aba: sem ela, Lista/Detalhe crescem em vez
            de rolar dentro do diálogo. */}
        <div className="flex-1 min-h-0 px-3 py-2">
          <div className="grid gap-1.5 grid-cols-1 items-start h-full min-h-0 md:[grid-template-columns:0.28fr_1fr] md:[grid-template-rows:minmax(0,1fr)]">
            <EnriquecimentoLista {...lista} />
            <EnriquecimentoDetalhe {...detalhe} amplo />
          </div>
        </div>

        <div className="shrink-0 px-3 pb-3">
          <EnriquecimentoActions {...actions} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
