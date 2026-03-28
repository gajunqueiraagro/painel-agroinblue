import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

const BLOCOS = Array.from({ length: 10 }, (_, i) =>
  String(i + 1).padStart(3, '0'),
);

export function AnaliseConsultorTab() {
  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-20 p-4 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Análise do Consultor
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Área técnica para observações e interpretação — blocos para preenchimento futuro.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {BLOCOS.map((num) => (
            <div
              key={num}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
            >
              <span className="text-xs font-bold text-primary tabular-nums">{num}</span>
              <div className="flex-1 border-b border-dashed border-border/40 h-0" />
              <span className="text-[10px] text-muted-foreground italic">—</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
