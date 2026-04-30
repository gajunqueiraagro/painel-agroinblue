import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { cn } from '@/lib/utils';

type S = 'ok' | 'atencao' | 'fora';
const SC: Record<S, string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  atencao: 'text-amber-700 bg-amber-50 border-amber-200',
  fora: 'text-red-700 bg-red-50 border-red-200',
};
const SI: Record<S, string> = { ok: '🟢', atencao: '🟡', fora: '🔴' };

function Card({ label, isPlaceholder = false }: { label: string; isPlaceholder?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-2 p-4 rounded-lg border bg-card min-w-0 flex-1', isPlaceholder && 'opacity-50')}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}{isPlaceholder && <span className="ml-1 text-[9px] normal-case font-normal">(fase 2)</span>}
      </p>
      <p className="text-2xl font-bold text-foreground leading-none">
        —<span className="text-sm font-normal text-muted-foreground ml-1">R$</span>
      </p>
      {isPlaceholder && <p className="text-[10px] text-muted-foreground">— mês · — ano · — meta</p>}
    </div>
  );
}

function Alert({ level, text }: { level: S; text: string }) {
  return (
    <div className={cn('flex items-start gap-2 px-3 py-2 rounded border text-xs', SC[level])}>
      <span className="shrink-0 mt-0.5">{SI[level]}</span>
      <span>{text}</span>
    </div>
  );
}

function MetaBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-amber-500 bg-amber-50 px-3 py-2.5 rounded-r">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded">META</span>
        <span className="text-[10px] text-amber-600">somente leitura · fase 2</span>
      </div>
      <div className="text-xs text-amber-800 space-y-0.5">{children}</div>
    </div>
  );
}

export function V2Home({ ano, mes }: { ano: string; mes: string }) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const ml = mes === '0'
    ? 'Jan–Dez ' + ano
    : new Date(parseInt(ano), parseInt(mes) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  return (
    <div className="space-y-5 px-4 py-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {g}{clienteAtual ? ', ' + clienteAtual.nome : ''}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {fazendaAtual?.id === '__global__' ? 'Todas as fazendas' : fazendaAtual?.nome} · {ml}
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Caixa Atual" isPlaceholder />
        <Card label="Resultado Mês" isPlaceholder />
        <Card label="Rebanho" isPlaceholder />
        <Card label="Endividamento" isPlaceholder />
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Alertas</p>
        <Alert level="atencao" text="Indicadores integrados na Fase 2 — aqui virão alertas reais vs META." />
        <Alert level="ok" text="Sidebar, filter bar e mobile nav funcionando corretamente." />
        <Alert level="ok" text="App original em / preservado sem nenhuma alteração." />
      </div>
      <MetaBlock>
        <p>Rebanho Meta: — · Realizado: — · Desvio: —</p>
        <p>Resultado Meta: — · Realizado: — · Desvio: —</p>
        <p className="text-[10px] text-amber-600 mt-1">Dados reais na Fase 2 via hooks existentes, sem modificação.</p>
      </MetaBlock>
      <div className="grid md:grid-cols-2 gap-4">
        {['Receitas do Mês', 'Despesas do Mês'].map(t => (
          <div key={t}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t}</p>
            <div className="space-y-1 text-xs">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">Item {i} (fase 2)</span>
                  <span className="font-medium">—</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span><span className="text-muted-foreground">—</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary">
        Ambiente /v2 — validação visual (Fase 1). App original em / sem alteração.
      </div>
    </div>
  );
}
