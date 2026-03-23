import { useState, useEffect, useMemo } from 'react';
import { usePastos, type CategoriaRebanho } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { useLancamentos } from '@/hooks/useLancamentos';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { format, subMonths } from 'date-fns';

function getAnoMesOptions() {
  const opts: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = subMonths(now, i);
    opts.push(format(d, 'yyyy-MM'));
  }
  return opts;
}

interface ConciliacaoRow {
  categoria: CategoriaRebanho;
  qtdSistema: number;
  qtdPastos: number;
  diferenca: number;
  nivel: 'ok' | 'atencao' | 'critico';
}

export function ConciliacaoTab() {
  const { isGlobal } = useFazenda();
  const { categorias, pastos } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();
  const { lancamentos, saldosIniciais } = useLancamentos();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
  const [itensPastos, setItensPastos] = useState<Map<string, number>>(new Map());
  const [loadingItens, setLoadingItens] = useState(false);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  // Load all fechamento items for the month
  useEffect(() => {
    const load = async () => {
      if (fechamentos.length === 0) { setItensPastos(new Map()); return; }
      setLoadingItens(true);
      const map = new Map<string, number>();
      for (const fech of fechamentos) {
        const items = await loadItens(fech.id);
        items.forEach(item => {
          map.set(item.categoria_id, (map.get(item.categoria_id) || 0) + item.quantidade);
        });
      }
      setItensPastos(map);
      setLoadingItens(false);
    };
    load();
  }, [fechamentos, loadItens]);

  // Calculate system balances per category up to the end of selected month
  const saldoSistema = useMemo(() => {
    const [y, m] = anoMes.split('-').map(Number);
    const map = new Map<string, number>();

    // Map categoria codes to IDs
    const codeToId = new Map(categorias.map(c => [c.codigo, c.id]));

    // Add saldos iniciais for the year
    saldosIniciais.filter(s => s.ano === y).forEach(s => {
      const catId = codeToId.get(s.categoria);
      if (catId) map.set(catId, (map.get(catId) || 0) + s.quantidade);
    });

    // Process lancamentos up to end of selected month
    const endDate = `${anoMes}-31`;
    const startDate = `${y}-01-01`;
    lancamentos
      .filter(l => l.data >= startDate && l.data <= endDate)
      .forEach(l => {
        const catId = codeToId.get(l.categoria);
        if (!catId) return;

        const isEntrada = ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo);
        const isSaida = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(l.tipo);
        const isReclass = l.tipo === 'reclassificacao';

        if (isEntrada) {
          map.set(catId, (map.get(catId) || 0) + l.quantidade);
        } else if (isSaida) {
          map.set(catId, (map.get(catId) || 0) - l.quantidade);
        } else if (isReclass && l.categoriaDestino) {
          const destId = codeToId.get(l.categoriaDestino);
          map.set(catId, (map.get(catId) || 0) - l.quantidade);
          if (destId) map.set(destId, (map.get(destId) || 0) + l.quantidade);
        }
      });

    return map;
  }, [anoMes, lancamentos, saldosIniciais, categorias]);

  const rows: ConciliacaoRow[] = useMemo(() => {
    return categorias.map(cat => {
      const qtdSistema = saldoSistema.get(cat.id) || 0;
      const qtdPastos = itensPastos.get(cat.id) || 0;
      const diferenca = qtdPastos - qtdSistema;
      const absDif = Math.abs(diferenca);
      const nivel: 'ok' | 'atencao' | 'critico' = absDif === 0 ? 'ok' : absDif <= 3 ? 'atencao' : 'critico';
      return { categoria: cat, qtdSistema, qtdPastos, diferenca, nivel };
    });
  }, [categorias, saldoSistema, itensPastos]);

  // Detect patterns
  const alertas = useMemo(() => {
    const msgs: string[] = [];
    const totalSistema = rows.reduce((s, r) => s + r.qtdSistema, 0);
    const totalPastos = rows.reduce((s, r) => s + r.qtdPastos, 0);

    if (totalPastos > totalSistema + 3) {
      msgs.push(`Total nos pastos (${totalPastos}) é maior que no sistema (${totalSistema}). Possível falta de lançamento de entrada.`);
    }
    if (totalPastos < totalSistema - 3) {
      msgs.push(`Total nos pastos (${totalPastos}) é menor que no sistema (${totalSistema}). Possível falta de lançamento de saída.`);
    }

    // Detect possible category evolution
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[i].diferenca < -2 && rows[j].diferenca > 2 && Math.abs(rows[i].diferenca + rows[j].diferenca) <= 2) {
          msgs.push(`Possível evolução de categoria: ${rows[i].categoria.nome} → ${rows[j].categoria.nome} não refletida no sistema.`);
        }
        if (rows[j].diferenca < -2 && rows[i].diferenca > 2 && Math.abs(rows[i].diferenca + rows[j].diferenca) <= 2) {
          msgs.push(`Possível evolução de categoria: ${rows[j].categoria.nome} → ${rows[i].categoria.nome} não refletida no sistema.`);
        }
      }
    }

    return msgs;
  }, [rows]);

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para conciliação.</div>;

  const pastosCount = pastos.filter(p => p.ativo && p.entra_conciliacao).length;
  const fechadosCount = fechamentos.filter(f => f.status === 'fechado').length;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <Select value={anoMes} onValueChange={setAnoMes}>
          <SelectTrigger className="w-40 h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getAnoMesOptions().map(am => (
              <SelectItem key={am} value={am}>{am.split('-').reverse().join('/')}</SelectItem>
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

      {loadingItens ? (
        <div className="text-center py-8 text-muted-foreground">Calculando...</div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => (
            <div
              key={row.categoria.id}
              className={`rounded-lg border p-3 ${
                row.nivel === 'ok' ? 'border-green-500/30 bg-green-500/5' :
                row.nivel === 'atencao' ? 'border-yellow-500/30 bg-yellow-500/5' :
                'border-red-500/30 bg-red-500/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{row.categoria.nome}</div>
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

          {/* Totals */}
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
