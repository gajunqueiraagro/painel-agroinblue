/**
 * Auditoria Zootécnica — identifica inconsistências na base oficial
 * por fazenda / ano / mês / categoria.
 *
 * NÃO corrige nada automaticamente. Apenas lista.
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';

type Severidade = 'critico' | 'alerta';

interface Inconsistencia {
  fazenda: string;
  ano: number;
  mes: number;
  mesLabel: string;
  categoria: string;
  categoriaCodigo: string;
  tipo: string;
  valor: string;
  causa: string;
  severidade: Severidade;
  fonte: string;
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function AuditoriaZootecnicaTab() {
  const { fazendaAtual } = useFazenda();
  const { data: anosDisp = [String(new Date().getFullYear())] } = useAnosDisponiveis();
  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [severidadeFiltro, setSeveridadeFiltro] = useState<'todos' | 'critico' | 'alerta'>('todos');

  const { rawCategorias, loading } = useRebanhoOficial({ ano: Number(anoFiltro), cenario: 'realizado' });

  const inconsistencias = useMemo<Inconsistencia[]>(() => {
    const result: Inconsistencia[] = [];
    const fazNome = fazendaAtual?.nome || 'Fazenda';

    for (const row of rawCategorias) {
      const mesLabel = MESES_LABELS[row.mes - 1] || String(row.mes);
      const base = {
        fazenda: fazNome,
        ano: row.ano,
        mes: row.mes,
        mesLabel,
        categoria: row.categoria_nome,
        categoriaCodigo: row.categoria_codigo,
        fonte: row.fonte_oficial_mes,
      };

      // 1. Saldo final negativo
      if (row.saldo_final < 0) {
        result.push({
          ...base,
          tipo: 'Saldo final negativo',
          valor: `${row.saldo_final} cab`,
          causa: 'Saídas excedem saldo disponível. Possível duplicidade ou importação faltando entradas.',
          severidade: 'critico',
        });
      }

      // 2. Peso total final negativo
      if (row.peso_total_final < 0) {
        result.push({
          ...base,
          tipo: 'Peso total final negativo',
          valor: `${row.peso_total_final.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`,
          causa: 'Peso de saídas supera peso disponível. Verificar pesos das movimentações do mês.',
          severidade: 'critico',
        });
      }

      // 3. Peso médio final negativo (quando saldo > 0)
      if (row.saldo_final > 0 && row.peso_medio_final !== null && row.peso_medio_final < 0) {
        result.push({
          ...base,
          tipo: 'Peso médio negativo',
          valor: `${row.peso_medio_final?.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`,
          causa: 'Peso total negativo com saldo positivo gera média impossível.',
          severidade: 'critico',
        });
      }

      // 4. Saldo final = 0 mas peso total > 0 (resíduo)
      if (row.saldo_final === 0 && row.peso_total_final > 10) {
        result.push({
          ...base,
          tipo: 'Peso residual sem cabeças',
          valor: `0 cab / ${row.peso_total_final.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`,
          causa: 'Cabeças zeraram mas peso não foi zerado. Regra de consistência violada.',
          severidade: 'alerta',
        });
      }

      // 5. Peso médio biologicamente impossível (> 1500 kg ou < 10 kg com saldo > 0)
      if (row.saldo_final > 0 && row.peso_medio_final !== null) {
        if (row.peso_medio_final > 1500) {
          result.push({
            ...base,
            tipo: 'Peso médio impossível (alto)',
            valor: `${row.peso_medio_final.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`,
            causa: 'Peso médio acima de 1.500 kg é biologicamente impossível.',
            severidade: 'alerta',
          });
        }
        if (row.peso_medio_final > 0 && row.peso_medio_final < 10) {
          result.push({
            ...base,
            tipo: 'Peso médio impossível (baixo)',
            valor: `${row.peso_medio_final.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`,
            causa: 'Peso médio abaixo de 10 kg é suspeito.',
            severidade: 'alerta',
          });
        }
      }

      // 6. Saldo inicial negativo
      if (row.saldo_inicial < 0) {
        result.push({
          ...base,
          tipo: 'Saldo inicial negativo',
          valor: `${row.saldo_inicial} cab`,
          causa: 'Herdado de saldo final negativo do mês anterior. Problema propagado.',
          severidade: 'critico',
        });
      }

      // 7. Peso total inicial negativo
      if (row.peso_total_inicial < 0) {
        result.push({
          ...base,
          tipo: 'Peso total inicial negativo',
          valor: `${row.peso_total_inicial.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`,
          causa: 'Herdado de peso total final negativo do mês anterior.',
          severidade: 'critico',
        });
      }
    }

    return result.sort((a, b) => {
      if (a.severidade !== b.severidade) return a.severidade === 'critico' ? -1 : 1;
      return a.mes - b.mes || a.categoria.localeCompare(b.categoria);
    });
  }, [rawCategorias, fazendaAtual]);

  const filtrado = useMemo(() => {
    if (severidadeFiltro === 'todos') return inconsistencias;
    return inconsistencias.filter(i => i.severidade === severidadeFiltro);
  }, [inconsistencias, severidadeFiltro]);

  const criticos = inconsistencias.filter(i => i.severidade === 'critico').length;
  const alertas = inconsistencias.filter(i => i.severidade === 'alerta').length;

  return (
    <div className="w-full px-4 animate-fade-in pb-20 space-y-4">
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 pt-3 pb-2">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <h1 className="text-base font-extrabold text-foreground">Auditoria Zootécnica</h1>
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="w-24 text-sm font-bold ml-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumo */}
      <div className="flex gap-3 px-4">
        <button
          onClick={() => setSeveridadeFiltro('todos')}
          className={`flex-1 rounded-lg border p-3 text-center transition-colors ${severidadeFiltro === 'todos' ? 'ring-2 ring-primary' : ''}`}
        >
          <div className="text-2xl font-extrabold text-foreground">{inconsistencias.length}</div>
          <div className="text-[10px] text-muted-foreground font-semibold">Total</div>
        </button>
        <button
          onClick={() => setSeveridadeFiltro('critico')}
          className={`flex-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center transition-colors ${severidadeFiltro === 'critico' ? 'ring-2 ring-destructive' : ''}`}
        >
          <div className="text-2xl font-extrabold text-destructive">{criticos}</div>
          <div className="text-[10px] text-destructive/80 font-semibold">Críticos</div>
        </button>
        <button
          onClick={() => setSeveridadeFiltro('alerta')}
          className={`flex-1 rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-center transition-colors ${severidadeFiltro === 'alerta' ? 'ring-2 ring-amber-500' : ''}`}
        >
          <div className="text-2xl font-extrabold text-amber-600">{alertas}</div>
          <div className="text-[10px] text-amber-600/80 font-semibold">Alertas</div>
        </button>
      </div>

      {/* Tabela */}
      <Card className="mx-4">
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtrado.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">Nenhuma inconsistência encontrada</p>
              <p className="text-xs mt-1">A base está consistente para {anoFiltro}.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[60px]">Sev.</TableHead>
                  <TableHead className="min-w-[60px]">Mês</TableHead>
                  <TableHead className="min-w-[100px]">Categoria</TableHead>
                  <TableHead className="min-w-[150px]">Tipo</TableHead>
                  <TableHead className="min-w-[100px]">Valor</TableHead>
                  <TableHead className="min-w-[80px]">Fonte</TableHead>
                  <TableHead className="min-w-[250px]">Causa provável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrado.map((inc, idx) => (
                  <TableRow key={idx} className={inc.severidade === 'critico' ? 'bg-destructive/5' : 'bg-amber-50/50'}>
                    <TableCell>
                      <Badge variant={inc.severidade === 'critico' ? 'destructive' : 'outline'} className={inc.severidade === 'alerta' ? 'border-amber-500 text-amber-700 bg-amber-100' : ''}>
                        {inc.severidade === 'critico' ? '🔴' : '🟡'} {inc.severidade}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold">{inc.mesLabel}/{inc.ano}</TableCell>
                    <TableCell className="font-semibold">{inc.categoria}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <AlertTriangle className={`h-3 w-3 shrink-0 ${inc.severidade === 'critico' ? 'text-destructive' : 'text-amber-500'}`} />
                        <span className="text-xs">{inc.tipo}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold">{inc.valor}</TableCell>
                    <TableCell>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        inc.fonte === 'fechamento' ? 'bg-green-100 text-green-800' :
                        inc.fonte === 'projecao' ? 'bg-blue-100 text-blue-800' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {inc.fonte}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inc.causa}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="px-4 text-[9px] text-muted-foreground">
        Fonte única: vw_zoot_categoria_mensal (cenário realizado) — {fazendaAtual?.nome || 'Fazenda'} — {anoFiltro}
      </div>
    </div>
  );
}
