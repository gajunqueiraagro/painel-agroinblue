import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoeda } from '@/lib/calculos/formatters';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { StandardTooltip } from '@/lib/chartConfig';

interface Props {
  snapshot: Record<string, any>;
}

export function FechExecOperacaoPage({ snapshot }: Props) {
  const fin = snapshot.financeiro || {};
  
  const lucroBruto = fin.lucro_bruto ?? 0;
  const receitas = fin.receitas ?? 0;
  const margemEbitda = receitas > 0 ? (lucroBruto / receitas) * 100 : 0;
  const markupEbitda = (fin.custeio_produtivo ?? 0) > 0 
    ? (lucroBruto / (fin.custeio_produtivo ?? 1)) * 100 
    : 0;

  const linhas = [
    { label: 'Faturamento', value: receitas },
    { label: 'Desembolso Produção', value: fin.custeio_produtivo ?? 0 },
    { label: 'Lucro Bruto', value: lucroBruto },
    { label: 'Reposição Bovinos', value: fin.reposicao_bovinos ?? 0 },
    { label: 'Investimentos', value: fin.investimentos_fazenda ?? 0 },
    { label: 'Amortizações', value: fin.amortizacoes ?? 0 },
    { label: 'Dividendos', value: fin.dividendos ?? 0 },
  ];

  const chartData = linhas.map(l => ({ name: l.label.substring(0, 12), valor: l.value }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Evolução da Operação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {linhas.map(l => (
            <div key={l.label} className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{l.label}</span>
              <span className="text-xs font-semibold">{formatMoeda(l.value)}</span>
            </div>
          ))}
          <div className="border-t pt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-xs font-bold">Margem EBITDA</span>
              <span className="text-xs font-bold">{margemEbitda.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-bold">Markup EBITDA</span>
              <span className="text-xs font-bold">{markupEbitda.toFixed(1)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Composição</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={80} />
              <Tooltip content={<StandardTooltip isCurrency />} />
              <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
