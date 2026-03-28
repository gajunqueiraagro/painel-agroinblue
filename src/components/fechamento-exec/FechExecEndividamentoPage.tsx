import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoeda } from '@/lib/calculos/formatters';
import { AlertTriangle } from 'lucide-react';

interface Props {
  snapshot: Record<string, any>;
}

export function FechExecEndividamentoPage({ snapshot }: Props) {
  const fin = snapshot.financeiro || {};
  const caixa = snapshot.caixa || {};

  // MVP: show amortization and basic debt indicators from available data
  const amortizacoes = fin.amortizacoes ?? 0;
  const dividendos = fin.dividendos ?? 0;
  const saldoCaixa = caixa.caixa_final ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Endividamento e Estrutura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Indicator label="Amortizações no Período" value={formatMoeda(amortizacoes)} />
            <Indicator label="Dividendos" value={formatMoeda(dividendos)} />
            <Indicator label="Saldo Financeiro" value={formatMoeda(saldoCaixa)} />
            <Indicator label="Dividendos Líquidos" value={formatMoeda(dividendos - amortizacoes)} />
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Dados completos de endividamento</p>
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                Para exibir dívida pecuária, agricultura, alavancagem e cronograma de amortização, 
                será necessário cadastrar os dados de financiamento no módulo financeiro.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resumo Global da Operação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Block title="Desempenho Operacional">
            <MiniRow label="Receitas" value={formatMoeda(fin.receitas ?? 0)} />
            <MiniRow label="Custeio Produtivo" value={formatMoeda(fin.custeio_produtivo ?? 0)} />
            <MiniRow label="Lucro Bruto" value={formatMoeda(fin.lucro_bruto ?? 0)} />
          </Block>

          <Block title="Fluxo de Caixa">
            <MiniRow label="Entradas" value={formatMoeda(caixa.entradas_totais ?? 0)} />
            <MiniRow label="Saídas" value={formatMoeda(caixa.saidas_totais ?? 0)} />
            <MiniRow label="Caixa Final" value={formatMoeda(caixa.caixa_final ?? 0)} />
          </Block>

          <Block title="Estrutura Financeira">
            <MiniRow label="Amortizações" value={formatMoeda(amortizacoes)} />
            <MiniRow label="Dividendos" value={formatMoeda(dividendos)} />
          </Block>
        </CardContent>
      </Card>
    </div>
  );
}

function Indicator({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 bg-muted/30 rounded-lg">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs font-bold mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-semibold">{value}</span>
    </div>
  );
}
