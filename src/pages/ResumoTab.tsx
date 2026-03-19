import { Lancamento, isEntrada, CATEGORIAS } from '@/types/cattle';
import { TrendingUp, TrendingDown, Beef } from 'lucide-react';

interface Props {
  lancamentos: Lancamento[];
}

export function ResumoTab({ lancamentos }: Props) {
  const totalEntradas = lancamentos
    .filter(l => isEntrada(l.tipo))
    .reduce((sum, l) => sum + l.quantidade, 0);

  const totalSaidas = lancamentos
    .filter(l => !isEntrada(l.tipo))
    .reduce((sum, l) => sum + l.quantidade, 0);

  const saldo = totalEntradas - totalSaidas;

  const porCategoria = CATEGORIAS.map(cat => {
    const entradas = lancamentos
      .filter(l => l.categoria === cat.value && isEntrada(l.tipo))
      .reduce((s, l) => s + l.quantidade, 0);
    const saidas = lancamentos
      .filter(l => l.categoria === cat.value && !isEntrada(l.tipo))
      .reduce((s, l) => s + l.quantidade, 0);
    return { ...cat, saldo: entradas - saidas };
  }).filter(c => c.saldo !== 0);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      {/* Saldo principal */}
      <div className="bg-primary rounded-lg p-5 text-center shadow-md">
        <Beef className="h-10 w-10 mx-auto text-primary-foreground mb-2" />
        <p className="text-primary-foreground text-sm font-semibold opacity-80">Saldo Total</p>
        <p className="text-4xl font-extrabold text-primary-foreground">{saldo}</p>
        <p className="text-primary-foreground text-sm opacity-70">cabeças</p>
      </div>

      {/* Entradas e saídas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-4 text-center shadow-sm border">
          <TrendingUp className="h-6 w-6 mx-auto text-success mb-1" />
          <p className="text-xs text-muted-foreground font-semibold">Entradas</p>
          <p className="text-2xl font-extrabold text-foreground">+{totalEntradas}</p>
        </div>
        <div className="bg-card rounded-lg p-4 text-center shadow-sm border">
          <TrendingDown className="h-6 w-6 mx-auto text-destructive mb-1" />
          <p className="text-xs text-muted-foreground font-semibold">Saídas</p>
          <p className="text-2xl font-extrabold text-foreground">-{totalSaidas}</p>
        </div>
      </div>

      {/* Por categoria */}
      {porCategoria.length > 0 && (
        <div className="bg-card rounded-lg p-4 shadow-sm border">
          <h2 className="font-bold text-foreground mb-3">Por Categoria</h2>
          <div className="space-y-2">
            {porCategoria.map(c => (
              <div key={c.value} className="flex justify-between items-center py-1 border-b last:border-0">
                <span className="text-sm font-semibold text-foreground">{c.label}</span>
                <span className="text-sm font-extrabold text-foreground">{c.saldo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lancamentos.length === 0 && (
        <div className="text-center py-10">
          <p className="text-muted-foreground text-lg font-semibold">Nenhum lançamento ainda</p>
          <p className="text-muted-foreground text-sm mt-1">Toque em "Lançar" para começar</p>
        </div>
      )}
    </div>
  );
}
