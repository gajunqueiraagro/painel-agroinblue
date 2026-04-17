/**
 * ConciliacaoTab — Conciliação de Categorias (Sistema × Pastos)
 *
 * Fonte oficial do "Sistema": vw_zoot_categoria_mensal (via useZootCategoriaMensal)
 * Fonte oficial do "Pastos": fechamento_pastos + fechamento_pasto_itens
 *
 * Regra: o front NÃO recalcula saldo final por movimentações.
 */

import { useState, useEffect, useMemo } from 'react';
import { usePastos, isPastoAtivoNoMes } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { useZootCategoriaMensal, groupByMes, categoriasUnicas } from '@/hooks/useZootCategoriaMensal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
import { classificarNivelConciliacao, type NivelConciliacao } from '@/lib/calculos/zootecnicos';

interface Props {
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

interface ConciliacaoRow {
  categoriaId: string;
  categoriaNome: string;
  qtdSistema: number;
  qtdPastos: number;
  diferenca: number;
  nivel: NivelConciliacao;
}

export function ConciliacaoTab({ filtroAnoInicial, filtroMesInicial }: Props = {}) {
  const { isGlobal } = useFazenda();
  const { pastos } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();
  const defaultAnoMes = filtroAnoInicial && filtroMesInicial
    ? `${filtroAnoInicial}-${String(filtroMesInicial).padStart(2, '0')}`
    : format(new Date(), 'yyyy-MM');
  const [anoMes, setAnoMes] = useState(defaultAnoMes);

  useEffect(() => {
    if (filtroAnoInicial && filtroMesInicial) {
      setAnoMes(`${filtroAnoInicial}-${String(filtroMesInicial).padStart(2, '0')}`);
    }
  }, [filtroAnoInicial, filtroMesInicial]);
  const [itensPastos, setItensPastos] = useState<Map<string, number>>(new Map());
  const [loadingItens, setLoadingItens] = useState(false);

  const [ano, mes] = anoMes.split('-').map(Number);

  // ── Fonte oficial: view zootécnica ──
  const { data: viewData = [], isLoading: loadingView } = useZootCategoriaMensal({
    ano,
    cenario: 'realizado',
  });

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  useEffect(() => {
    const load = async () => {
      if (fechamentos.length === 0) { setItensPastos(new Map()); return; }
      setLoadingItens(true);
      const allItems = await Promise.all(fechamentos.map(f => loadItens(f.id)));
      const map = new Map<string, number>();
      allItems.flat().forEach(item => {
        map.set(item.categoria_id, (map.get(item.categoria_id) || 0) + item.quantidade);
      });
      setItensPastos(map);
      setLoadingItens(false);
    };
    load();
  }, [fechamentos, loadItens]);

  // Saldo do sistema: vem da view oficial (saldo_final por categoria no mês)
  const saldoSistema = useMemo(() => {
    const byMes = groupByMes(viewData);
    const catsMes = byMes[mes] || [];
    const map = new Map<string, number>();
    catsMes.forEach(c => map.set(c.categoria_id, c.saldo_final));
    return map;
  }, [viewData, mes]);

  // Categorias da view
  const cats = useMemo(() => categoriasUnicas(viewData), [viewData]);

  // Conciliação: sistema × pastos
  const rows = useMemo((): ConciliacaoRow[] => {
    // Unir categorias da view + categorias dos pastos
    const allCatIds = new Set([...saldoSistema.keys(), ...itensPastos.keys()]);
    const catMap = new Map(cats.map(c => [c.id, c]));

    return Array.from(allCatIds)
      .map(catId => {
        const cat = catMap.get(catId);
        const qtdSistema = saldoSistema.get(catId) || 0;
        const qtdPastos = itensPastos.get(catId) || 0;
        const diferenca = qtdPastos - qtdSistema;
        return {
          categoriaId: catId,
          categoriaNome: cat?.nome || catId,
          qtdSistema,
          qtdPastos,
          diferenca,
          nivel: classificarNivelConciliacao(diferenca),
          ordem: cat?.ordem ?? 999,
        };
      })
      .filter(r => r.qtdSistema !== 0 || r.qtdPastos !== 0)
      .sort((a, b) => a.ordem - b.ordem);
  }, [saldoSistema, itensPastos, cats]);

  const alertas = useMemo(() => {
    const msgs: string[] = [];
    const totalSistema = rows.reduce((s, r) => s + r.qtdSistema, 0);
    const totalPastos = rows.reduce((s, r) => s + r.qtdPastos, 0);

    if (totalPastos === 0 && totalSistema > 0) {
      msgs.push('Nenhum dado de fechamento de pastos encontrado para este mês. Preencha os fechamentos para comparar.');
      return msgs;
    }

    if (totalPastos > totalSistema + 3) {
      msgs.push(`Total nos pastos (${totalPastos}) maior que no sistema (${totalSistema}). Verifique se há entradas (nascimentos, compras) não lançadas.`);
    }
    if (totalPastos < totalSistema - 3) {
      msgs.push(`Total nos pastos (${totalPastos}) menor que no sistema (${totalSistema}). Verifique se há saídas (vendas, abates, mortes) não lançadas.`);
    }

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[i].diferenca < -2 && rows[j].diferenca > 2 && Math.abs(rows[i].diferenca + rows[j].diferenca) <= 2) {
          msgs.push(`Possível evolução de categoria: ${rows[i].categoriaNome} → ${rows[j].categoriaNome} não lançada no sistema.`);
        }
        if (rows[j].diferenca < -2 && rows[i].diferenca > 2 && Math.abs(rows[i].diferenca + rows[j].diferenca) <= 2) {
          msgs.push(`Possível evolução de categoria: ${rows[j].categoriaNome} → ${rows[i].categoriaNome} não lançada no sistema.`);
        }
      }
    }

    return msgs;
  }, [rows]);

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para conciliação.</div>;

  const pastosCount = pastos.filter(p => p.ativo && p.entra_conciliacao && isPastoAtivoNoMes(p, anoMes)).length;
  const fechadosCount = fechamentos.filter(f => f.status === 'fechado').length;
  const isLoading = loadingItens || loadingView;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
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

      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((msg, i) => (
            <div key={i} className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <span className="text-sm">{msg}</span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Calculando...</div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => (
            <div
              key={row.categoriaId}
              className={`rounded-lg border p-3 ${
                row.nivel === 'ok' ? 'border-green-500/30 bg-green-500/5' :
                row.nivel === 'atencao' ? 'border-yellow-500/30 bg-yellow-500/5' :
                'border-red-500/30 bg-red-500/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{row.categoriaNome}</div>
                <div className="flex items-center gap-1">
                  {row.nivel === 'ok' ? <CheckCircle className="h-4 w-4 text-green-500" /> :
                   row.nivel === 'atencao' ? <Info className="h-4 w-4 text-yellow-500" /> :
                   <AlertTriangle className="h-4 w-4 text-red-500" />}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Sistema</span>
                  <div className="font-bold">{row.qtdSistema}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Pastos</span>
                  <div className="font-bold">{row.qtdPastos}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Diferença</span>
                  <div className={`font-bold ${row.diferenca > 0 ? 'text-green-600' : row.diferenca < 0 ? 'text-red-600' : ''}`}>
                    {row.diferenca > 0 ? '+' : ''}{row.diferenca}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-lg border-2 p-3 bg-muted">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Total Sistema</span>
                <div className="text-lg font-bold">{rows.reduce((s, r) => s + r.qtdSistema, 0)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Total Pastos</span>
                <div className="text-lg font-bold">{rows.reduce((s, r) => s + r.qtdPastos, 0)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Diferença</span>
                {(() => {
                  const dif = rows.reduce((s, r) => s + r.diferenca, 0);
                  return <div className={`text-lg font-bold ${dif > 0 ? 'text-green-600' : dif < 0 ? 'text-red-600' : ''}`}>{dif > 0 ? '+' : ''}{dif}</div>;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
