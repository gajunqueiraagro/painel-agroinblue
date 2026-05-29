import { CheckCircle2, Clock, AlertTriangle, Lock, ShieldCheck } from 'lucide-react';

const REGRAS = [
  { icon: CheckCircle2, color: 'text-emerald-600', title: 'Financeiro não existe',
    desc: 'Pode gerar financeiro a partir do valor zootécnico.' },
  { icon: Clock, color: 'text-amber-600', title: 'Programado / Previsto',
    desc: 'Pode regenerar financeiro. Confirmação necessária.' },
  { icon: AlertTriangle, color: 'text-amber-600', title: 'Agendado',
    desc: 'Alerta: revisar antes de regenerar.' },
  { icon: Lock, color: 'text-red-600', title: 'Realizado',
    desc: 'Não altera automaticamente o financeiro.' },
  { icon: ShieldCheck, color: 'text-blue-600', title: 'Realizado (Conciliado)',
    desc: 'Não é possível alterar. Financeiro realizado tem prioridade absoluta.' },
];

export function RegrasEdicaoBar() {
  return (
    <section className="rounded-lg border bg-muted/30 px-3 py-2.5 mt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Regras de Edição
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {REGRAS.map(({ icon: Icon, color, title, desc }) => (
          <div key={title} className="flex items-start gap-1.5">
            <Icon className={`h-3.5 w-3.5 ${color} shrink-0 mt-0.5`} />
            <div className="min-w-0">
              <div className="text-[11px] font-medium leading-tight">{title}</div>
              <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
