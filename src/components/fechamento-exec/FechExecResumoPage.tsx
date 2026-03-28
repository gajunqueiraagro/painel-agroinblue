import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Beef, Landmark, BarChart3 } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';

interface Props {
  snapshot: Record<string, any>;
}

export function FechExecResumoPage({ snapshot }: Props) {
  const fin = snapshot.financeiro || {};
  const zoo = snapshot.zootecnico || {};
  const caixa = snapshot.caixa || {};

  const pilares = [
    { label: 'Receitas', value: fin.receitas, icon: DollarSign, color: 'text-green-600' },
    { label: 'Custeio Produtivo', value: fin.custeio_produtivo, icon: TrendingDown, color: 'text-red-600' },
    { label: 'Lucro Bruto', value: fin.lucro_bruto, icon: TrendingUp, color: fin.lucro_bruto >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'Saldo Caixa', value: caixa.caixa_final, icon: Landmark, color: 'text-blue-600' },
    { label: 'Vendas (cab)', value: zoo.vendas_cab, icon: Beef, color: 'text-primary', isCurrency: false },
    { label: 'Compras (cab)', value: zoo.compras_cab, icon: BarChart3, color: 'text-amber-600', isCurrency: false },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Principais Pilares da Operação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {pilares.map(p => (
              <div key={p.label} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <p.icon className={`h-5 w-5 ${p.color} shrink-0`} />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate">{p.label}</p>
                  <p className="text-sm font-bold">
                    {p.isCurrency === false
                      ? (p.value ?? 0).toLocaleString('pt-BR')
                      : formatMoeda(p.value ?? 0)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resumo Financeiro do Mês</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Receitas" value={fin.receitas} positive />
          <Row label="(-) Dedução de Receitas" value={fin.deducao_receitas} />
          <Row label="(-) Custeio Produtivo" value={fin.custeio_produtivo} />
          <div className="border-t pt-1">
            <Row label="= Lucro Bruto" value={fin.lucro_bruto} bold positive={fin.lucro_bruto >= 0} />
          </div>
          <Row label="(-) Investimentos" value={fin.investimentos_fazenda} />
          <Row label="(-) Reposição Bovinos" value={fin.reposicao_bovinos} />
          <Row label="(-) Amortizações" value={fin.amortizacoes} />
          <Row label="(-) Dividendos" value={fin.dividendos} />
          <div className="border-t pt-1">
            <Row label="Total Entradas" value={caixa.entradas_totais} bold positive />
            <Row label="Total Saídas" value={caixa.saidas_totais} bold />
            <Row label="Saldo Final" value={caixa.caixa_final} bold positive={caixa.caixa_final >= 0} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold, positive }: { label: string; value?: number; bold?: boolean; positive?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-xs ${bold ? 'font-bold' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-xs ${bold ? 'font-bold' : ''} ${positive ? 'text-green-700' : value && value > 0 ? 'text-red-700' : ''}`}>
        {formatMoeda(value ?? 0)}
      </span>
    </div>
  );
}
