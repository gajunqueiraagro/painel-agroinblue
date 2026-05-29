import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { X, ClipboardList, Boxes, History, Calculator } from 'lucide-react';
import { ReactNode } from 'react';

interface ZooMovShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  /** Slot principal — vai dentro da tab "Dados" */
  children: ReactNode;
  /** Slot opcional — renderizado dentro da tab "Custos da Operação" */
  custosOperacaoSlot?: ReactNode;
  /** Slot opcional — renderizado dentro da tab "Auditoria" */
  auditoriaSlot?: ReactNode;
  /** Slot do rodapé (botões de ação) */
  footer?: ReactNode;
}

export function ZooMovShell({
  open, onOpenChange, title, subtitle, children, custosOperacaoSlot, auditoriaSlot, footer
}: ZooMovShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b bg-card flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 -mr-2"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs defaultValue="dados" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="rounded-none border-b bg-transparent h-auto p-0 px-5 justify-start gap-4">
            <TabsTrigger
              value="dados"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2.5 text-xs"
            >
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
              Dados da Compra (Zootécnico)
            </TabsTrigger>
            <TabsTrigger
              value="custos"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2.5 text-xs"
            >
              <Calculator className="h-3.5 w-3.5 mr-1.5" />
              Custos da Operação
            </TabsTrigger>
            <TabsTrigger
              value="itens"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2.5 text-xs text-muted-foreground"
            >
              <Boxes className="h-3.5 w-3.5 mr-1.5" />
              Itens
            </TabsTrigger>
            <TabsTrigger
              value="auditoria"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2.5 text-xs"
            >
              <History className="h-3.5 w-3.5 mr-1.5" />
              Auditoria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="flex-1 overflow-y-auto p-4 mt-0">
            {children}
          </TabsContent>

          <TabsContent value="custos" className="flex-1 overflow-y-auto p-4 mt-0">
            {custosOperacaoSlot ?? (
              <div className="text-xs text-muted-foreground italic">
                Indisponível para este tipo de lançamento.
              </div>
            )}
          </TabsContent>

          <TabsContent value="itens" className="flex-1 overflow-y-auto p-4 mt-0">
            <div className="rounded-md border border-dashed border-muted-foreground/30 p-8 text-center">
              <Boxes className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                Itens — em breve
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-md mx-auto">
                Futura arquitetura documento × itens permitirá detalhar NFs e
                itens individuais dentro de cada movimentação.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="auditoria" className="flex-1 overflow-y-auto p-4 mt-0">
            {auditoriaSlot}
          </TabsContent>
        </Tabs>

        {footer && (
          <div className="border-t bg-muted/30 px-4 py-3">{footer}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
