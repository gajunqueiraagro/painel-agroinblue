/**
 * AnaliseOperacionalTab — Análise Operacional Mensal
 *
 * Fonte oficial do "Sistema": vw_zoot_categoria_mensal (via useZootCategoriaMensal)
 * Movimentações: lancamentos (detalhe de fluxo)
 * Conciliação: sistema (view) × pastos (fechamento_pasto_itens)
 */
import { useState, useEffect, useMemo } from 'react';
import { usePastos } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useRebanhoOficial, groupByMes } from '@/hooks/useRebanhoOficial';
import { useAnaliseOperacional } from '@/hooks/useAnaliseOperacional';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Info, TrendingUp, TrendingDown, ArrowRightLeft, Skull, ShoppingCart, Baby, Beef } from 'lucide-react';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
import type { SubAba } from './FinanceiroTab';
import type { TabId } from '@/components/BottomNav';

interface Props {
  onNavigateToMovimentacao?: (subAba: SubAba, opts?: { ano?: string; mes?: string; label?: string; backTab?: TabId }) => void;
}

export function AnaliseOperacionalTab({ onNavigateToMovimentacao }: Props) {
  const { isGlobal } = useFazenda();
  const { pastos } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();
  const { lancamentos } = useLancamentos();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
  const [itensPastos, setItensPastos] = useState<Map<string, number>>(new Map());

  const [ano, mes] = anoMes.split('-').map(Number);

  // FONTE OFICIAL: useRebanhoOficial (camada única obrigatória)
  const { rawCategorias: viewData } = useRebanhoOficial({ ano, cenario: 'realizado' });
  const viewCategoriasMes = useMemo(() => {
    const byMes = groupByMes(viewData);
    return byMes[mes] || [];
  }, [viewData, mes]);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  useEffect(() => {
    const load = async () => {
      if (fechamentos.length === 0) { setItensPastos(new Map()); return; }
      const allItems = await Promise.all(fechamentos.map(f => loadItens(f.id)));
      const map = new Map<string, number>();
      allItems.flat().forEach(item => {
        map.set(item.categoria_id, (map.get(item.categoria_id) || 0) + item.quantidade);
      });
      setItensPastos(map);
    };
    load();
  }, [fechamentos, loadItens]);

  const { resumoMov, conciliacao, alertas, sugestoes } = useAnaliseOperacional(
    lancamentos, viewCategoriasMes, itensPastos, anoMes
  );

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para análise.</div>;

  const pastosCount = pastos.filter(p => p.ativo && p.entra_conciliacao).length;
  const fechadosCount = fechamentos.filter(f => f.status === 'fechado').length;

  const LABEL_TO_SUBABA: Record<string, SubAba> = {
    'Nascimentos': 'nascimento',
    'Compras': 'compra',
    'Transf. Entrada': 'transferencia_entrada',
    'Vendas': 'venda',
    'Abates': 'abate',
    'Mortes': 'morte',
    'Consumo': 'consumo',
    'Transf. Saída': 'transferencia_saida',
  };

  const movItems = [
    { label: 'Nascimentos', value: resumoMov.nascimentos, icon: Baby, color: 'text-green-600' },
    { label: 'Compras', value: resumoMov.compras, icon: ShoppingCart, color: 'text-blue-600' },
    { label: 'Transf. Entrada', value: resumoMov.transferenciasEntrada, icon: TrendingUp, color: 'text-cyan-600' },
    { label: 'Vendas', value: resumoMov.vendas, icon: TrendingDown, color: 'text-orange-600' },
    { label: 'Abates', value: resumoMov.abates, icon: Beef, color: 'text-red-600' },
    { label: 'Mortes', value: resumoMov.mortes, icon: Skull, color: 'text-gray-600' },
    { label: 'Consumo', value: resumoMov.consumos, icon: TrendingDown, color: 'text-amber-600' },
    { label: 'Transf. Saída', value: resumoMov.transferenciasSaida, icon: TrendingDown, color: 'text-purple-600' },
    { label: 'Reclassificações', value: resumoMov.reclassificacoes, icon: ArrowRightLeft, color: 'text-indigo-600' },
  ].filter(m => m.value > 0);

  return (
    <div className="p-4 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={anoMes} onValueChange={setAnoMes}>
          <SelectTrigger className="w-40 h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getAnoMesOptions().map(am => (
              <SelectItem key={am} value={am}>{formatAnoMes(am)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{fechadosCount}/{pastosCount} fechados</Badge>
      </div>

      {/* Alertas Inteligentes */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Alertas</h3>
          {alertas.map((a, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 flex items-start gap-2 ${
                a.tipo === 'critico' ? 'border-red-500/30 bg-red-500/10' :
                a.tipo === 'atencao' ? 'border-yellow-500/30 bg-yellow-500/10' :
                'border-blue-500/30 bg-blue-500/10'
              }`}
            >
              {a.tipo === 'critico' ? <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" /> :
               a.tipo === 'atencao' ? <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" /> :
               <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />}
              <span className="text-sm">{a.mensagem}</span>
            </div>
          ))}
        </div>
      )}

      {/* Resumo de Movimentações */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Movimentações do Mês</h3>
        {movItems.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma movimentação registrada neste mês.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {movItems.map(m => {
              const subAba = LABEL_TO_SUBABA[m.label];
              const handleClick = () => {
                if (onNavigateToMovimentacao && subAba) {
                  const [anoStr, mesStr] = anoMes.split('-');
                  onNavigateToMovimentacao(subAba, {
                    ano: anoStr,
                    mes: mesStr,
                    label: `${m.label} | ${formatAnoMes(anoMes)}`,
                    backTab: 'analise_operacional',
                  });
                }
              };
              return (
                <div
                  key={m.label}
                  className={`rounded-lg border bg-card p-3 flex items-center gap-3 ${subAba ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
                  onClick={handleClick}
                >
                  <m.icon className={`h-5 w-5 ${m.color} shrink-0`} />
                  <div>
                    <div className="text-xs text-muted-foreground">{m.label}</div>
                    <div className="text-lg font-bold">{m.value}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {(resumoMov.totalEntradas > 0 || resumoMov.totalSaidas > 0) && (
          <div className="rounded-lg border-2 p-3 bg-muted flex items-center justify-between">
            <div className="text-sm">
              <span className="text-green-600 font-semibold">+{resumoMov.totalEntradas} entradas</span>
              <span className="mx-2 text-muted-foreground">|</span>
              <span className="text-red-600 font-semibold">-{resumoMov.totalSaidas} saídas</span>
            </div>
            <div className={`text-lg font-bold ${resumoMov.saldoMes >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {resumoMov.saldoMes >= 0 ? '+' : ''}{resumoMov.saldoMes}
            </div>
          </div>
        )}
      </div>

      {/* Conciliação por Categoria */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Conciliação por Categoria</h3>
        <div className="space-y-1.5">
          {conciliacao.map(row => (
            <div
              key={row.categoria.id}
              className={`rounded-lg border p-3 ${
                row.nivel === 'ok' ? 'border-green-500/20 bg-green-500/5' :
                row.nivel === 'atencao' ? 'border-yellow-500/20 bg-yellow-500/5' :
                'border-red-500/20 bg-red-500/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{row.categoria.nome}</span>
                {row.nivel === 'ok' ? <CheckCircle className="h-4 w-4 text-green-500" /> :
                 row.nivel === 'atencao' ? <Info className="h-4 w-4 text-yellow-500" /> :
                 <AlertTriangle className="h-4 w-4 text-red-500" />}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-1.5 text-xs">
                <div>
                  <span className="text-muted-foreground">Sistema</span>
                  <div className="font-bold text-sm">{row.qtdSistema}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Pastos</span>
                  <div className="font-bold text-sm">{row.qtdPastos}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Diferença</span>
                  <div className={`font-bold text-sm ${row.diferenca > 0 ? 'text-green-600' : row.diferenca < 0 ? 'text-red-600' : ''}`}>
                    {row.diferenca > 0 ? '+' : ''}{row.diferenca}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totais */}
        <div className="rounded-lg border-2 p-3 bg-muted">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Total Sistema</span>
              <div className="text-lg font-bold">{conciliacao.reduce((s, r) => s + r.qtdSistema, 0)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Total Pastos</span>
              <div className="text-lg font-bold">{conciliacao.reduce((s, r) => s + r.qtdPastos, 0)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Diferença</span>
              {(() => {
                const dif = conciliacao.reduce((s, r) => s + r.diferenca, 0);
                return <div className={`text-lg font-bold ${dif > 0 ? 'text-green-600' : dif < 0 ? 'text-red-600' : ''}`}>{dif > 0 ? '+' : ''}{dif}</div>;
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Sugestões de Ajustes */}
      {sugestoes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sugestões Operacionais</h3>
          {sugestoes.map((s, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 flex items-start gap-2 ${
                s.tipo === 'evolucao' ? 'border-indigo-500/30 bg-indigo-500/5' :
                s.tipo === 'entrada_faltante' ? 'border-green-500/30 bg-green-500/5' :
                'border-orange-500/30 bg-orange-500/5'
              }`}
            >
              {s.tipo === 'evolucao' ? <ArrowRightLeft className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" /> :
               s.tipo === 'entrada_faltante' ? <TrendingUp className="h-5 w-5 text-green-500 shrink-0 mt-0.5" /> :
               <TrendingDown className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />}
              <span className="text-sm">{s.mensagem}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
