import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoeda } from '@/lib/calculos/formatters';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  snapshot: Record<string, any>;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(221, 83%, 53%)',
  'hsl(262, 83%, 58%)',
];

export function FechExecFluxoCaixaPage({ snapshot }: Props) {
  const cx = snapshot.caixa || {};

  const entradas = [
    { name: 'Receitas', value: cx.receitas_caixa ?? 0 },
  ].filter(e => e.value > 0);

  const saidas = [
    { name: 'Custos Prod.', value: cx.custos_produtivos ?? 0 },
    { name: 'Investimentos', value: cx.investimentos_fazenda ?? 0 },
    { name: 'Reposição', value: cx.reposicao_animais ?? 0 },
    { name: 'Amortizações', value: cx.amortizacoes ?? 0 },
    { name: 'Dividendos', value: cx.dividendos ?? 0 },
  ].filter(e => e.value > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Fluxo de Caixa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-center text-green-700">
            <span className="text-xs font-semibold">Total Entradas</span>
            <span className="text-sm font-bold">{formatMoeda(cx.entradas_totais ?? 0)}</span>
          </div>
          <div className="flex justify-between items-center text-red-700">
            <span className="text-xs font-semibold">Total Saídas</span>
            <span className="text-sm font-bold">{formatMoeda(cx.saidas_totais ?? 0)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between items-center">
            <span className="text-xs font-bold">Caixa Final</span>
            <span className={`text-sm font-bold ${(cx.caixa_final ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatMoeda(cx.caixa_final ?? 0)}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs">Entradas</CardTitle>
          </CardHeader>
          <CardContent>
            {entradas.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={entradas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} label={false}>
                    {entradas.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoeda(v)} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs">Saídas</CardTitle>
          </CardHeader>
          <CardContent>
            {saidas.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={saidas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} label={false}>
                    {saidas.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoeda(v)} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Detalhamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Entradas</p>
          <DetailRow label="Receitas" value={cx.receitas_caixa} />
          <div className="border-t my-2" />
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Saídas</p>
          <DetailRow label="Custos Produtivos" value={cx.custos_produtivos} />
          <DetailRow label="Investimentos Fazenda" value={cx.investimentos_fazenda} />
          <DetailRow label="Reposição Animais" value={cx.reposicao_animais} />
          <DetailRow label="Amortizações" value={cx.amortizacoes} />
          <DetailRow label="Dividendos" value={cx.dividendos} />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{formatMoeda(value ?? 0)}</span>
    </div>
  );
}
