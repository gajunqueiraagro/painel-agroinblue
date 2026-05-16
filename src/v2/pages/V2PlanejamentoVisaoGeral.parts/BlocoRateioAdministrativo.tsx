/**
 * BlocoRateioAdministrativo — placeholder visual para o futuro container
 * "Rateio Administrativo". Sem lógica, sem dado, sem hook. Aparece na
 * Visão Geral Planejamento quando o filtro é Administrativo ou uma
 * fazenda operacional (NÃO em Global).
 */
import { Construction } from 'lucide-react';

export function BlocoRateioAdministrativo() {
  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold text-foreground mb-1">Rateio Administrativo</h2>
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Construction className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span>Em construção</span>
      </div>
    </section>
  );
}
