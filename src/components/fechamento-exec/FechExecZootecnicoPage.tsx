import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNum, formatMoeda, formatCabecas } from '@/lib/calculos/formatters';

interface Props {
  snapshot: Record<string, any>;
}

export function FechExecZootecnicoPage({ snapshot }: Props) {
  const zoo = snapshot.zootecnico || {};

  const indicadores = [
    { label: 'Compras (cab)', value: zoo.compras_cab, fmt: 'num' },
    { label: 'Vendas (cab)', value: zoo.vendas_cab, fmt: 'num' },
    { label: 'Nascimentos', value: zoo.nascimentos, fmt: 'num' },
    { label: 'Mortes', value: zoo.mortes, fmt: 'num' },
    { label: 'Peso Médio Vendas (@)', value: zoo.peso_medio_vendas_arroba, fmt: 'dec' },
    { label: 'Valor Total Vendas', value: zoo.valor_total_vendas, fmt: 'moeda' },
    { label: 'Preço Médio Compra/cab', value: zoo.preco_medio_compra_cab, fmt: 'moeda' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Indicadores Zootécnicos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {indicadores.map(ind => (
              <div key={ind.label} className="p-2 bg-muted/30 rounded-lg">
                <p className="text-[10px] text-muted-foreground">{ind.label}</p>
                <p className="text-sm font-bold">
                  {ind.fmt === 'moeda'
                    ? formatMoeda(ind.value ?? 0)
                    : ind.fmt === 'dec'
                    ? formatNum(ind.value ?? 0, 2)
                    : formatNum(ind.value ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Movimentação do Rebanho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Compras" value={`+${formatCabecas(zoo.compras_cab ?? 0)}`} color="text-green-700" />
          <Row label="Nascimentos" value={`+${formatCabecas(zoo.nascimentos ?? 0)}`} color="text-green-700" />
          <Row label="Vendas" value={`-${formatCabecas(zoo.vendas_cab ?? 0)}`} color="text-red-700" />
          <Row label="Mortes" value={`-${formatCabecas(zoo.mortes ?? 0)}`} color="text-red-700" />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}
