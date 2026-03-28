import { ArrowLeftRight, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  onNavigate: (dest: 'tipos' | 'resumo') => void;
}

/**
 * Pré-tela de Movimentações do Rebanho.
 * Exibe 2 cards para escolher entre:
 * - Tipos de Movimentação (lista operacional)
 * - Resumo por Mês (evolução do rebanho e categorias)
 */
export function MovimentacaoTab({ onNavigate }: Props) {
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <div className="grid grid-cols-2 gap-4">
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
        onClick={() => onNavigate('tipos')}
      >
        <CardContent className="flex items-center gap-4 p-5">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base text-foreground">Tipos de Movimentação</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Entradas, saídas e transferências</p>
          </div>
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
        onClick={() => onNavigate('resumo')}
      >
        <CardContent className="flex items-center gap-4 p-5">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <TrendingUp className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base text-foreground">Movimentações por Mês</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Evolução do rebanho e categorias</p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
