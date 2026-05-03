/**
 * ConciliacaoTab — Conciliação de Categorias (Sistema × Pastos)
 *
 * Fonte oficial do "Sistema": vw_zoot_categoria_mensal.saldo_sistema
 *   (cadeia pura de lançamentos, sem override de P1)
 * Fonte oficial do "Pastos":  vw_zoot_categoria_mensal.saldo_p1
 *   (snapshot do fechamento de pastos)
 *
 * Regra: o front NÃO recalcula nada e NÃO usa `|| 0` / `?? 0` em saldos.
 * Se um lado não existir (null), a divergência não é computada — exibe "—".
 */

import { useState, useEffect, useMemo } from 'react';
import { usePastos, isPastoAtivoNoMes } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { useZootCategoriaMensal, groupByMes, categoriasUnicas } from '@/hooks/useZootCategoriaMensal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
import { classificarNivelConciliacao, type NivelConciliacao } from '@/lib/calculos/zootecnicos';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

interface ConciliacaoRow {
  categoriaId: string;
  categoriaNome: string;
  qtdSistema: number | null;
  qtdPastos: number | null;
  diferenca: number | null;
  nivel: NivelConciliacao | 'sem_dado';
  ordem: number;
}

export function ConciliacaoTab({ filtroAnoInicial, filtroMesInicial }: Props = {}) {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos } = usePastos();
  const { fechamentos, loadFechamentos } = useFechamento();
  const defaultAnoMes = filtroAnoInicial && filtroMesInicial
    ? `${filtroAnoInicial}-${String(filtroMesInicial).padStart(2, '0')}`
    : format(new Date(), 'yyyy-MM');
  const [anoMes, setAnoMes] = useState(defaultAnoMes);

  useEffect(() => {
    if (filtroAnoInicial && filtroMesInicial) {
      setAnoMes(`${filtroAnoInicial}-${String(filtroMesInicial).padStart(2, '0')}`);
    }
  }, [filtroAnoInicial, filtroMesInicial]);

  const [ano, mes] = anoMes.split('-').map(Number);

  // ── Fonte oficial: view zootécnica ──
  const { data: viewData = [], isLoading: loadingView } = useZootCategoriaMensal({
    ano,
    cenario: 'realizado',
  });

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  // Saldo do sistema: cadeia pura de lançamentos (sem override de P1).
  // Se saldo_sistema for null, omitir — não tratar como zero.
  const saldoSistema = useMemo(() => {
    const byMes = groupByMes(viewData);
    const catsMes = byMes[mes] || [];
    const map = new Map<string, number>();
    catsMes.forEach(c => {
      const val = (c as any).saldo_sistema;
      if (val != null) map.set(c.categoria_id, Number(val));
    });
    return map;
  }, [viewData, mes]);

  // Saldo dos pastos: snapshot do fechamento de pastos (saldo_p1).
  // Se saldo_p1 for null, omitir — não tratar como zero.
  const saldoPasto = useMemo(() => {
    const byMes = groupByMes(viewData);
    const catsMes = byMes[mes] || [];
    const map = new Map<string, number>();
    catsMes.forEach(c => {
      const val = (c as any).saldo_p1;
      if (val != null) map.set(c.categoria_id, Number(val));
    });
    return map;
  }, [viewData, mes]);

  // Categorias da view
  const cats = useMemo(() => categoriasUnicas(viewData), [viewData]);

  // Conciliação: sistema × pastos
  const rows = useMemo((): ConciliacaoRow[] => {
    const allCatIds = new Set([...saldoSistema.keys(), ...saldoPasto.keys()]);
    const catMap = new Map(cats.map(c => [c.id, c]));

    return Array.from(allCatIds)
      .map(catId => {
        const cat = catMap.get(catId);
        const qtdSistema = saldoSistema.has(catId) ? saldoSistema.get(catId)! : null;
        const qtdPastos = saldoPasto.has(catId) ? saldoPasto.get(catId)! : null;
        const diferenca = qtdSistema != null && qtdPastos != null
          ? qtdPastos - qtdSistema
          : null;
        const nivel: NivelConciliacao | 'sem_dado' = diferenca != null
          ? classificarNivelConciliacao(diferenca)
          : 'sem_dado';
        return {
          categoriaId: catId,
          categoriaNome: cat?.nome || catId,
          qtdSistema,
          qtdPastos,
          diferenca,
          nivel,
          ordem: cat?.ordem ?? 999,
        };
      })
      .filter(r =>
        (r.qtdSistema != null && r.qtdSistema !== 0) ||
        (r.qtdPastos != null && r.qtdPastos !== 0),
      )
      .sort((a, b) => a.ordem - b.ordem);
  }, [saldoSistema, saldoPasto, cats]);

  // Totais — só consideram linhas com dado válido em cada lado.
  const totalSistema = useMemo(
    () => rows.reduce((s, r) => s + (r.qtdSistema != null ? r.qtdSistema : 0), 0),
    [rows],
  );
  const totalPastos = useMemo(
    () => rows.reduce((s, r) => s + (r.qtdPastos != null ? r.qtdPastos : 0), 0),
    [rows],
  );
  const totalDiferenca = useMemo(
    () => rows.reduce((s, r) => s + r.diferenca!, 0),
    [rows],
  );
  const algumSemDado = useMemo(
    () => rows.some(r => r.nivel === 'sem_dado'),
    [rows],
  );

  const alertas = useMemo(() => {
    const msgs: string[] = [];

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
        const di = rows[i].diferenca;
        const dj = rows[j].diferenca;
        if (di == null || dj == null) continue;
        if (di < -2 && dj > 2 && Math.abs(di + dj) <= 2) {
          msgs.push(`Possível evolução de categoria: ${rows[i].categoriaNome} → ${rows[j].categoriaNome} não lançada no sistema.`);
        }
        if (dj < -2 && di > 2 && Math.abs(di + dj) <= 2) {
          msgs.push(`Possível evolução de categoria: ${rows[j].categoriaNome} → ${rows[i].categoriaNome} não lançada no sistema.`);
        }
      }
    }

    return msgs;
  }, [rows, totalSistema, totalPastos]);

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para conciliação.</div>;

  const pastosCount = pastos.filter(p => p.ativo && p.entra_conciliacao && isPastoAtivoNoMes(p, anoMes)).length;
  const fechadosCount = fechamentos.filter(f => f.status === 'fechado').length;
  const isLoading = loadingView;

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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            (supabase.rpc as any)('refresh_zoot_cache', {
              p_fazenda_id: fazendaAtual?.id,
              p_ano: Number(anoMes?.split('-')[0]),
              p_mes: Number(anoMes?.split('-')[1]),
            }).catch(() => {});
            toast.info('Atualizando rebanho... aguarde ~15s e recarregue a tela.');
          }}
        >
          🔄 Atualizar Rebanho
        </Button>
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
                row.nivel === 'sem_dado' ? 'border-muted bg-muted/30' :
                'border-red-500/30 bg-red-500/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{row.categoriaNome}</div>
                <div className="flex items-center gap-1">
                  {row.nivel === 'ok' ? <CheckCircle className="h-4 w-4 text-green-500" /> :
                   row.nivel === 'atencao' ? <Info className="h-4 w-4 text-yellow-500" /> :
                   row.nivel === 'sem_dado' ? <Info className="h-4 w-4 text-muted-foreground" /> :
                   <AlertTriangle className="h-4 w-4 text-red-500" />}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Sistema</span>
                  <div className="font-bold">{row.qtdSistema != null ? row.qtdSistema : '—'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Pastos</span>
                  <div className="font-bold">{row.qtdPastos != null ? row.qtdPastos : '—'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Diferença</span>
                  <div className={`font-bold ${
                    row.diferenca == null ? 'text-muted-foreground' :
                    row.diferenca > 0 ? 'text-green-600' :
                    row.diferenca < 0 ? 'text-red-600' : ''
                  }`}>
                    {row.diferenca == null
                      ? '—'
                      : `${row.diferenca > 0 ? '+' : ''}${row.diferenca}`}
                  </div>
                </div>
              </div>
              {row.nivel === 'sem_dado' && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Dado ausente em um dos lados — divergência não calculada.
                </p>
              )}
            </div>
          ))}

          <div className="rounded-lg border-2 p-3 bg-muted">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Total Sistema</span>
                <div className="text-lg font-bold">{totalSistema}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Total Pastos</span>
                <div className="text-lg font-bold">{totalPastos}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Diferença</span>
                <div className={`text-lg font-bold ${
                  totalDiferenca > 0 ? 'text-green-600' :
                  totalDiferenca < 0 ? 'text-red-600' : ''
                }`}>
                  {totalDiferenca > 0 ? '+' : ''}{totalDiferenca}
                </div>
              </div>
            </div>
            {algumSemDado && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Totais excluem categorias sem dado em um dos lados.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
