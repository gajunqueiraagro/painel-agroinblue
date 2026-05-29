import { HelpCircle } from 'lucide-react';

export function BlocoExplicacaoDiferenca() {
  return (
    <section className="rounded-lg border border-amber-200 dark:border-amber-900/60 overflow-hidden">
      <header className="bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2.5 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
          3. Explicação da Diferença
        </h3>
      </header>
      <div className="p-3 bg-card">
        <p className="text-xs text-muted-foreground italic">
          Disponível em fase futura — registrará motivo da diferença entre
          valor da movimentação e valor financeiro vinculado (permuta, frete,
          comissão, desconto, bônus, pagamento parcial, financiamento, outro).
        </p>
      </div>
    </section>
  );
}
