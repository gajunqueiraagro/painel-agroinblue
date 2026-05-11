/**
 * BLOCO 5 — Movimentação Rebanho.
 *
 * STUB no Marco 1.1.B/C — exibe placeholder com aviso "Em construção".
 * Implementação plena com fontes reais virá no Marco 1.1.D
 * (após mapear queries de movimentação META + ano-1).
 */

import { Construction } from 'lucide-react';
import type { Bloco5Rebanho } from '@/v2/lib/planejamentoVisaoGeralTypes';

interface Props {
  data: Bloco5Rebanho;
}

export function BlocoMovimentacaoRebanho({ data: _data }: Props) {
  return (
    <section className="bg-card border border-dashed border-border rounded-lg p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Construction className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-bold text-foreground">Movimentação de Rebanho</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Em construção. Cards executivos (entradas, saídas, compras, vendas, mortes,
        transferências) e mini-gráfico Jan-Dez (cabeças, peso médio, peso total)
        com comparativo META × ano anterior — disponível no próximo marco.
      </p>
    </section>
  );
}
