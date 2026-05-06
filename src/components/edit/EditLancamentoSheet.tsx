/**
 * EditLancamentoSheet — Base compartilhada para edição de lançamentos zootécnicos.
 *
 * Responsabilidade: SOMENTE chrome visual (Sheet container, header, banners,
 * slots). Sem lógica de negócio. Cada tipo de lançamento (Nascimento, Morte,
 * etc.) renderiza seus campos via slot `bloco1` e, quando aplicável, painel
 * financeiro via slot `bloco2`.
 *
 * Padrão visual idêntico ao `<Sheet compraEditSheet>` existente em
 * `LancamentoDetalhe.tsx`.
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título do header (ex.: "Editar Nascimento"). */
  titulo: string;
  /** Subtítulo opcional em itálico (ex.: aviso de impacto financeiro). */
  subtitulo?: string;
  /** Banners no topo (P1 oficial, P1 selectivo, etc.). */
  banners?: React.ReactNode;
  /** Bloco zootécnico — campos + status + botão de salvar. */
  bloco1: React.ReactNode;
  /** Bloco financeiro — opcional; só preenchido para Compra/Abate/Venda. */
  bloco2?: React.ReactNode;
}

export function EditLancamentoSheet({ open, onOpenChange, titulo, subtitulo, banners, bloco1, bloco2 }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-1">
          <SheetTitle className="text-sm">{titulo}</SheetTitle>
          {subtitulo && (
            <p className="text-[10px] text-muted-foreground/70 italic">{subtitulo}</p>
          )}
        </SheetHeader>
        {banners && <div className="mt-2 space-y-2">{banners}</div>}
        <div className="mt-2 space-y-2.5">
          <div className="space-y-2">{bloco1}</div>
          {bloco2 && (
            <>
              <Separator />
              {bloco2}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
