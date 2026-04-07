/**
 * Preços para Meta Anual — Motor de precificação oficial do cenário META.
 * Layout espelhado do ValorRebanhoTab com tema laranja (META).
 * Fonte única de preços para Valor do Rebanho META e Painel do Consultor META.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Save, Copy, Lock, Unlock, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react';
import { useMetaValorRebanhoPrecos, type MetaPrecoCategoria } from '@/hooks/useMetaValorRebanhoPrecos';
import { useZootCategoriaMensal, type ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { usePermissions } from '@/hooks/usePermissions';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { toast } from 'sonner';

interface Props {
  onBack?: () => void;
}

const ORDEM_CATEGORIAS_FIXA = [
  'mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros',
  'mamotes_f', 'desmama_f', 'novilhas', 'vacas',
];

const MESES_SHORT = [
  { key: '01', label: 'Jan' }, { key: '02', label: 'Fev' }, { key: '03', label: 'Mar' },
  { key: '04', label: 'Abr' }, { key: '05', label: 'Mai' }, { key: '06', label: 'Jun' },
  { key: '07', label: 'Jul' }, { key: '08', label: 'Ago' }, { key: '09', label: 'Set' },
  { key: '10', label: 'Out' }, { key: '11', label: 'Nov' }, { key: '12', label: 'Dez' },
];

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', color: 'bg-amber-500/20 text-amber-700 border-amber-300', icon: AlertTriangle },
  parcial: { label: 'Parcial', color: 'bg-orange-500/20 text-orange-700 border-orange-300', icon: AlertTriangle },
  validado: { label: 'Validado', color: 'bg-emerald-500/20 text-emerald-700 border-emerald-300', icon: CheckCircle },
};

interface LinhaTabela {
  codigo: string;
  nome: string;
  saldo: number;
  pesoMedio: number;
  precoArroba: number;
  precoKg: number;
  valorCabeca: number;
  valorTotal: number;
}

function fmtArroba(v: number): string {
  return v > 0 ? v.toFixed(2).replace('.', ',') : '0,00';
}

export function MetaPrecoTab({ onBack }: Props) {
  const now = new Date();
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const anoMes = `${ano}-${mes}`;

  const {
    precos, statusMes, loading, saving, isValidado,
    salvar, reabrir, copiarMesAnterior,
    statusAno, loadStatusAno,
  } = useMetaValorRebanhoPrecos(anoMes);

  const { perfil } = usePermissions();
  const isAdmin = perfil === 'admin_agroinblue';

  // Meta consolidation data for qty/peso
  const { data: viewDataMeta } = useZootCategoriaMensal({ ano: Number(ano), cenario: 'meta' });

  const anos = useMemo(() => {
    const a: string[] = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) a.push(String(y));
    return a;
  }, []);

  useEffect(() => { loadStatusAno(ano); }, [ano, loadStatusAno, statusMes]);

  // Local prices state
  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});
  const [precosDisplay, setPrecosDisplay] = useState<Record<string, string>>({});

  useEffect(() => {
    const numMap: Record<string, number> = {};
    const strMap: Record<string, string> = {};
    precos.forEach(p => {
      numMap[p.categoria] = p.preco_arroba;
      strMap[p.categoria] = p.preco_arroba > 0 ? fmtArroba(p.preco_arroba) : '';
    });
    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
  }, [precos]);

  // Meta rows by category
  const metaRowsByCategoria = useMemo(() => {
    if (!viewDataMeta) return new Map<string, ZootCategoriaMensal>();
    const mesNum = Number(mes);
    const map = new Map<string, ZootCategoriaMensal>();
    viewDataMeta.filter(r => r.mes === mesNum).forEach(r => map.set(r.categoria_codigo, r));
    return map;
  }, [viewDataMeta, mes]);

  // Build table rows
  const rows = useMemo<LinhaTabela[]>(() => {
    return ORDEM_CATEGORIAS_FIXA.map(codigo => {
      const metaRow = metaRowsByCategoria.get(codigo);
      const saldo = metaRow?.saldo_final ?? 0;
      const pesoMedio = metaRow?.peso_medio_final ?? 0;
      const precoArroba = precosLocal[codigo] ?? 0;
      const precoKg = precoArroba > 0 ? precoArroba / 15 : 0;
      const valorCabeca = pesoMedio > 0 && precoKg > 0 ? pesoMedio * precoKg : 0;
      const valorTotal = saldo * pesoMedio * precoKg;

      return {
        codigo,
        nome: metaRow?.categoria_nome || codigo,
        saldo,
        pesoMedio,
        precoArroba,
        precoKg,
        valorCabeca,
        valorTotal,
      };
    });
  }, [metaRowsByCategoria, precosLocal]);

  // Totals
  const totals = useMemo(() => {
    const cabecas = rows.reduce((s, r) => s + r.saldo, 0);
    const pesoTotalKg = rows.reduce((s, r) => s + r.saldo * r.pesoMedio, 0);
    const valor = rows.reduce((s, r) => s + r.valorTotal, 0);
    const pesoMedio = cabecas > 0 ? pesoTotalKg / cabecas : 0;
    const totalArrobas = pesoTotalKg / 30;
    const precoArroba = totalArrobas > 0 ? valor / totalArrobas : 0;
    const valorCabeca = cabecas > 0 ? valor / cabecas : 0;
    const precoKg = pesoTotalKg > 0 ? valor / pesoTotalKg : 0;
    return { cabecas, pesoMedio, precoKg, precoArroba, valorCabeca, valor };
  }, [rows]);

  const temPreenchimento = Object.values(precosLocal).some(v => v > 0);
  const todosPreenchidos = ORDEM_CATEGORIAS_FIXA.every(c => (precosLocal[c] ?? 0) > 0);

  const handlePrecoChange = (codigo: string, value: string) => {
    if (isValidado) return;
    const sanitized = value.replace(/[^0-9.,]/g, '');
    setPrecosDisplay(prev => ({ ...prev, [codigo]: sanitized }));
    const num = parseFloat(sanitized.replace(',', '.'));
    setPrecosLocal(prev => ({ ...prev, [codigo]: isNaN(num) ? 0 : num }));
  };

  const handlePrecoBlur = (codigo: string) => {
    const num = precosLocal[codigo] || 0;
    setPrecosDisplay(prev => ({ ...prev, [codigo]: num > 0 ? fmtArroba(num) : '' }));
  };

  const handleSalvar = (status: 'rascunho' | 'parcial' | 'validado') => {
    const items: MetaPrecoCategoria[] = ORDEM_CATEGORIAS_FIXA.map(codigo => ({
      categoria: codigo,
      preco_arroba: precosLocal[codigo] ?? 0,
    }));
    salvar(items, status);
  };

  const handleCopiarMesAnterior = async () => {
    const dados = await copiarMesAnterior(anoMes);
    if (dados) {
      const numMap: Record<string, number> = {};
      const strMap: Record<string, string> = {};
      dados.forEach(p => {
        numMap[p.categoria] = p.preco_arroba;
        strMap[p.categoria] = p.preco_arroba > 0 ? fmtArroba(p.preco_arroba) : '';
      });
      setPrecosLocal(numMap);
      setPrecosDisplay(strMap);
      toast.success('Valores carregados do mês anterior. Salve para confirmar.');
    }
  };

  const stCfg = STATUS_CONFIG[statusMes.status];
  const StIcon = stCfg.icon;
  const mesLabel = MESES_COLS.find(m => m.key === mes)?.label || mes;

  const getMesButtonClass = (mesVal: string) => {
    const key = `${ano}-${mesVal}`;
    const st = statusAno[key];
    const isSelected = mes === mesVal;
    if (isSelected) return 'bg-orange-500 text-white shadow-sm';
    if (st === 'validado') return 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200';
    if (st === 'parcial' || st === 'rascunho') return 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200';
    return 'text-muted-foreground hover:bg-muted';
  };

  const hasMetaData = metaRowsByCategoria.size > 0;

  return (
    <div className="p-2 w-full space-y-1.5 animate-fade-in pb-16">
      {/* Back + Toolbar */}
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-orange-600 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para Preços de Mercado
        </button>
      )}

      <div className="flex gap-1.5 items-center flex-wrap">
        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-20 h-7 text-xs font-bold border-orange-300">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anos.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${stCfg.color}`}>
          <StIcon className="h-3 w-3 mr-1" />
          {stCfg.label}
        </Badge>

        {!isValidado && (
          <Button variant="outline" size="sm" onClick={handleCopiarMesAnterior} className="gap-1 h-7 text-xs px-2 border-orange-300 text-orange-700 hover:bg-orange-50">
            <Copy className="h-3 w-3" /> Mês anterior
          </Button>
        )}

        <div className="ml-auto flex gap-1.5">
          {isValidado && isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 h-7 text-xs px-2 border-orange-300 text-orange-700">
                  <Unlock className="h-3 w-3" /> Reabrir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reabrir mês?</AlertDialogTitle>
                  <AlertDialogDescription>Os preços META voltarão ao status rascunho.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={reabrir}>Reabrir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {!isValidado && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-7 text-xs px-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => handleSalvar(temPreenchimento && !todosPreenchidos ? 'parcial' : 'rascunho')}
                disabled={saving}
              >
                <Save className="h-3 w-3" /> Rascunho
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="gap-1 h-7 text-xs px-3 bg-orange-500 hover:bg-orange-600 text-white" disabled={saving || !todosPreenchidos}>
                    <CheckCircle className="h-3 w-3" /> Validar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Validar preços META de {mesLabel}/{ano}?</AlertDialogTitle>
                    <AlertDialogDescription>Os preços META serão travados para este mês e passam a alimentar o Painel do Consultor.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction className="bg-orange-500 hover:bg-orange-600" onClick={() => handleSalvar('validado')}>Validar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {/* Month ruler */}
      <div className="flex gap-0.5 bg-orange-50 dark:bg-orange-950/20 rounded-md p-0.5 border border-orange-200 dark:border-orange-900/30">
        {MESES_SHORT.map(m => (
          <button
            key={m.key}
            onClick={() => setMes(m.key)}
            className={`flex-1 text-center text-[11px] font-semibold py-1 rounded transition-colors ${getMesButtonClass(m.key)}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!hasMetaData && (
        <div className="flex items-center gap-1.5 text-[10px] bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded px-2 py-1 border border-orange-500/30">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Nenhuma meta de rebanho encontrada para {mesLabel}/{ano}. Defina a Consolidação Meta antes de precificar.</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="flex gap-3 items-start">
          {/* Table */}
          <div className="flex-1 max-w-[55%] min-w-0 bg-card rounded-lg shadow-sm border overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b bg-orange-500/15">
                  <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider bg-orange-500/25">Categoria</th>
                  <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Qtd</th>
                  <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Peso</th>
                  <th className="text-center px-1 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider w-[80px]">R$/@</th>
                  <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">R$/kg</th>
                  <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">R$/cab</th>
                  <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                    <td className="px-1.5 py-0.5 text-foreground text-[9.5px] italic whitespace-nowrap bg-orange-500/10">
                      {r.nome}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                      {r.saldo > 0 ? formatNum(r.saldo, 0) : '-'}
                    </td>
                    <td className="px-1.5 py-0.5 text-right tabular-nums italic text-[9.5px]">
                      {r.saldo > 0 && r.pesoMedio > 0 ? formatNum(r.pesoMedio, 2) : '-'}
                    </td>
                    <td className="px-0.5 py-0.5 w-[80px]">
                      <Input
                        type="text"
                        inputMode="decimal"
                        className={`h-5 text-right !text-[9px] leading-none tabular-nums italic px-1 w-full border-orange-300 focus:border-orange-500 focus:ring-orange-500/20`}
                        placeholder="0,00"
                        value={precosDisplay[r.codigo] ?? ''}
                        onChange={e => handlePrecoChange(r.codigo, e.target.value)}
                        onBlur={() => handlePrecoBlur(r.codigo)}
                        disabled={isValidado}
                      />
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                      {r.precoKg > 0 ? formatNum(r.precoKg, 2) : '-'}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                      {r.valorCabeca > 0 ? formatMoeda(r.valorCabeca) : '-'}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                      {r.valorTotal > 0 ? formatMoeda(r.valorTotal) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-orange-500/25">
                  <td className="px-1.5 py-1 font-bold text-foreground text-[11px] italic bg-orange-500/30">TOTAL</td>
                  <td className="px-1.5 py-1 text-right font-bold text-foreground tabular-nums italic text-[11px]">
                    {totals.cabecas > 0 ? formatNum(totals.cabecas, 0) : '—'}
                  </td>
                  <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">
                    {totals.pesoMedio > 0 ? formatNum(totals.pesoMedio, 2) : '—'}
                  </td>
                  <td className="px-1 py-1 text-center text-foreground tabular-nums italic text-[11px] w-[80px]">
                    {totals.precoArroba > 0 ? formatMoeda(totals.precoArroba) : '—'}
                  </td>
                  <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">
                    {totals.precoKg > 0 ? formatNum(totals.precoKg, 2) : '—'}
                  </td>
                  <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">
                    {totals.valorCabeca > 0 ? formatMoeda(totals.valorCabeca) : '—'}
                  </td>
                  <td className="px-1.5 py-1 text-right font-bold text-foreground tabular-nums italic text-[11px]">
                    {totals.valor > 0 ? formatMoeda(totals.valor) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="flex items-center justify-end px-1.5 py-0.5 border-t">
              <p className="text-[9px] text-muted-foreground">
                R$/kg = R$/@ ÷ 15 • R$/cab = Peso × R$/kg
              </p>
            </div>
          </div>

          {/* Summary card */}
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Card className="bg-orange-500/5 border-orange-500/20">
              <CardContent className="p-2.5">
                <div className="flex gap-3">
                  <div className="shrink-0">
                    <p className="text-[9px] text-orange-600 font-medium uppercase tracking-wider">
                      Valor do Rebanho META — {mesLabel}/{ano}
                    </p>
                    <p className="text-xl font-extrabold text-foreground leading-tight mt-0.5">
                      {totals.valor > 0 ? formatMoeda(totals.valor) : '—'}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      Cenário de planejamento
                    </p>
                  </div>

                  <div className="flex-1 min-w-0 text-[10px] ml-4">
                    <div className="grid grid-cols-[auto_80px] gap-x-2 items-center">
                      <span className="text-[8px] text-muted-foreground font-medium">Indicador</span>
                      <span className="text-[8px] text-muted-foreground font-medium text-right">Valor</span>

                      {[
                        { label: 'Cabeças', value: totals.cabecas > 0 ? formatNum(totals.cabecas, 0) : '—' },
                        { label: 'Peso médio', value: totals.pesoMedio > 0 ? `${formatNum(totals.pesoMedio, 2)} kg` : '—' },
                        { label: 'R$/@ médio', value: totals.precoArroba > 0 ? formatMoeda(totals.precoArroba) : '—' },
                        { label: 'R$/cab', value: totals.valorCabeca > 0 ? formatMoeda(totals.valorCabeca) : '—' },
                        { label: '@s estoque', value: totals.cabecas > 0 ? formatNum(rows.reduce((s, r) => s + r.saldo * r.pesoMedio, 0) / 30, 2) : '—' },
                      ].map(ind => (
                        <React.Fragment key={ind.label}>
                          <span className="text-muted-foreground text-[9px] truncate">{ind.label}</span>
                          <span className="text-right font-semibold text-foreground tabular-nums">{ind.value}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 dark:border-orange-900/30">
              <CardContent className="p-2.5">
                <p className="text-[9px] text-orange-600 font-medium uppercase tracking-wider mb-1">Sobre esta tela</p>
                <ul className="text-[9px] text-muted-foreground space-y-0.5 list-disc pl-3">
                  <li>Base única de precificação META</li>
                  <li>Alimenta Painel do Consultor (META)</li>
                  <li>Alimenta Valor do Rebanho (META)</li>
                  <li>Preços definidos por categoria em R$/@</li>
                  <li>Sem preço → sem valor calculado</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
