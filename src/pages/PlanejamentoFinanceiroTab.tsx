/**
 * PlanejamentoFinanceiroTab
 *
 * Grade completa de planejamento financeiro (META) baseada no plano de contas oficial.
 * Todos os subcentros planejáveis aparecem automaticamente na grade.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { usePlanejamentoFinanceiro, DRIVERS_DISPONIVEIS } from '@/hooks/usePlanejamentoFinanceiro';
import { DRIVER_POR_SUBCENTRO } from '@/lib/calculos/driverZootecnico';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';
import { loadPlanoContasCompleto, type PlanoContasItem } from '@/lib/financeiro/planoContasBuilder';
import { Download, Percent, RefreshCw, Plus, Trash2 } from 'lucide-react';
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import { extrairDriversMensais, validarDriversDisponiveis } from '@/lib/calculos/driverZootecnico';

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  onBack?: () => void;
  metaConsolidacao?: MetaCategoriaMes[];
}

interface FazendaOption {
  id: string;
  nome: string;
}

/** Linha da grade: pode vir do banco ou ser um placeholder do plano de contas */
interface GridRow {
  centro_custo: string;
  subcentro: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  tipo_custo: 'fixo' | 'variavel';
  driver: string | null;
  unidade_driver: string | null;
  meses: number[];
  total: number;
  ids: (string | null)[];
}

export function PlanejamentoFinanceiroTab({ onBack, metaConsolidacao }: Props) {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear + 1);
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id || '';

  const {
    data, loading, reload,
    upsertRow, deleteRow,
    replicarParaMeses, importarRealizadoAnoAnterior,
    aplicarAjustePercentual, recalcularVariaveis,
    getLinhasAgrupadas, totalAnual,
  } = usePlanejamentoFinanceiro(ano, fazendaId);

  // ─── Plano de contas ─────────────────────────────────────
  const [planoContas, setPlanoContas] = useState<PlanoContasItem[]>([]);

  useEffect(() => {
    if (!clienteAtual?.id) return;
    loadPlanoContasCompleto(clienteAtual.id).then(setPlanoContas);
  }, [clienteAtual?.id]);

  // All plannable subcentros (2-Saídas with subcentro)
  const itensSaidas = useMemo(() =>
    planoContas.filter(p => p.tipo_operacao === '2-Saídas' && p.subcentro),
    [planoContas]
  );

  // ─── Build complete grid: plano de contas + existing data ─
  const linhasAgrupadas = useMemo(() => getLinhasAgrupadas(), [getLinhasAgrupadas]);

  const gridCompleto = useMemo<GridRow[]>(() => {
    // Start with existing data rows
    const existingKeys = new Set(
      linhasAgrupadas.map(r => `${r.centro_custo}||${r.subcentro || ''}`)
    );

    const rows: GridRow[] = [...linhasAgrupadas];

    // Add plano de contas items that don't have data yet
    for (const item of itensSaidas) {
      const key = `${item.centro_custo}||${item.subcentro || ''}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const sub = item.subcentro || '';
      const driverInfo = DRIVER_POR_SUBCENTRO[sub];
      const grupo = (item.grupo_custo || '').toLowerCase();
      const isVariavel = !!driverInfo || grupo.includes('variável') || grupo.includes('variavel');

      rows.push({
        centro_custo: item.centro_custo,
        subcentro: item.subcentro,
        macro_custo: item.macro_custo,
        grupo_custo: item.grupo_custo,
        tipo_custo: isVariavel ? 'variavel' : 'fixo',
        driver: driverInfo?.driver || null,
        unidade_driver: driverInfo?.unidade || null,
        meses: new Array(12).fill(0),
        total: 0,
        ids: new Array(12).fill(null),
      });
    }

    // Sort by macro > grupo > centro > subcentro
    rows.sort((a, b) => {
      const cmp = (x: string | null, y: string | null) => (x || '').localeCompare(y || '');
      return cmp(a.macro_custo, b.macro_custo)
        || cmp(a.grupo_custo, b.grupo_custo)
        || cmp(a.centro_custo, b.centro_custo)
        || cmp(a.subcentro, b.subcentro);
    });

    return rows;
  }, [linhasAgrupadas, itensSaidas]);

  // ─── State: dialogs ──────────────────────────────────────
  const [showAjuste, setShowAjuste] = useState(false);
  const [ajustePercent, setAjustePercent] = useState('');
  const [showNovaLinha, setShowNovaLinha] = useState(false);
  const [nlCentro, setNlCentro] = useState('');
  const [nlSubcentroId, setNlSubcentroId] = useState('');
  const [nlValorBase, setNlValorBase] = useState('');

  const centrosUnicos = useMemo(() => {
    const set = new Set<string>();
    itensSaidas.forEach(p => set.add(p.centro_custo));
    return Array.from(set).sort();
  }, [itensSaidas]);

  const subcentrosFiltrados = useMemo(() =>
    itensSaidas.filter(p => p.centro_custo === nlCentro),
    [itensSaidas, nlCentro]
  );

  const selectedPlanoItem = useMemo(() =>
    itensSaidas.find(p => p.id === nlSubcentroId),
    [itensSaidas, nlSubcentroId]
  );

  const handleNovaLinha = async () => {
    if (!selectedPlanoItem) { toast.error('Selecione um subcentro'); return; }
    const valorBase = parseFloat(nlValorBase) || 0;
    const sub = selectedPlanoItem.subcentro || '';
    const driverInfo = DRIVER_POR_SUBCENTRO[sub];
    const grupo = (selectedPlanoItem.grupo_custo || '').toLowerCase();
    const isVariavel = !!driverInfo || grupo.includes('variável') || grupo.includes('variavel');

    await replicarParaMeses({
      centro_custo: selectedPlanoItem.centro_custo,
      subcentro: selectedPlanoItem.subcentro,
      macro_custo: selectedPlanoItem.macro_custo,
      grupo_custo: selectedPlanoItem.grupo_custo,
      escopo_negocio: selectedPlanoItem.escopo_negocio || 'pecuaria',
      tipo_custo: isVariavel ? 'variavel' : 'fixo',
      driver: driverInfo?.driver || null,
      unidade_driver: driverInfo?.unidade || null,
      valor_base: valorBase,
    });
    setShowNovaLinha(false);
    setNlCentro(''); setNlSubcentroId(''); setNlValorBase('');
  };

  const handleAjuste = async () => {
    const pct = parseFloat(ajustePercent);
    if (isNaN(pct)) { toast.error('Informe um percentual válido'); return; }
    await aplicarAjustePercentual(pct);
    setShowAjuste(false);
    setAjustePercent('');
  };

  const handleRecalcularVariaveis = async () => {
    if (!metaConsolidacao || metaConsolidacao.length === 0) {
      toast.error('Sem dados do rebanho META. Lance o zootécnico META antes de recalcular.');
      return;
    }
    const driverValues = extrairDriversMensais(metaConsolidacao);
    const validacao = validarDriversDisponiveis(driverValues);
    const semDados = validacao.filter(v => !v.temDados);
    const variaveis = data.filter(r => r.tipo_custo === 'variavel' && r.driver);
    const driversSemBase = variaveis
      .map(r => r.driver!)
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .filter(d => semDados.some(s => s.driver === d));
    if (driversSemBase.length > 0) {
      toast.warning(`Drivers sem dados no rebanho META: ${driversSemBase.join(', ')}.`);
    }
    await recalcularVariaveis(driverValues);
  };

  const handleExcluirLinha = async (ids: (string | null)[]) => {
    const validIds = ids.filter(Boolean) as string[];
    if (validIds.length === 0) return;
    for (const id of validIds) await deleteRow(id);
    toast.success('Linha excluída');
  };

  // ─── Edição inline ────────────────────────────────────────
  const handleCellEdit = useCallback(async (
    id: string | null, mes: number, valor: number, row: GridRow
  ) => {
    if (!clienteAtual?.id || !fazendaId) return;
    const sub = row.subcentro || '';
    const driverInfo = DRIVER_POR_SUBCENTRO[sub];
    const payload: any = {
      cliente_id: clienteAtual.id,
      fazenda_id: fazendaId,
      ano,
      mes,
      centro_custo: row.centro_custo,
      subcentro: row.subcentro,
      macro_custo: row.macro_custo,
      grupo_custo: row.grupo_custo,
      escopo_negocio: null,
      tipo_custo: row.tipo_custo,
      driver: driverInfo?.driver || row.driver,
      unidade_driver: driverInfo?.unidade || row.unidade_driver,
      valor_base: row.tipo_custo === 'fixo' ? valor : (row.meses[0] || valor),
      quantidade_driver: 0,
      valor_planejado: valor,
      origem: 'manual',
      cenario: 'meta',
      observacao: null,
    };
    if (id) payload.id = id;
    await upsertRow(payload);
  }, [ano, clienteAtual, fazendaId, upsertRow]);

  // ─── Group rows by macro_custo for visual grouping ────────
  const macroGroups = useMemo(() => {
    const groups = new Map<string, GridRow[]>();
    for (const row of gridCompleto) {
      const macro = row.macro_custo || 'Outros';
      if (!groups.has(macro)) groups.set(macro, []);
      groups.get(macro)!.push(row);
    }
    return Array.from(groups.entries());
  }, [gridCompleto]);

  const fazendaNome = useMemo(() => {
    const f = fazendaOptions.find(f => f.id === fazendaId);
    return f?.nome || '';
  }, [fazendaOptions, fazendaId]);

  return (
    <div className="w-full px-2 sm:px-4 animate-fade-in pb-24 space-y-4">
      {/* Header / Filtros */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Select value={fazendaId} onValueChange={setFazendaId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Fazenda..." />
          </SelectTrigger>
          <SelectContent>
            {fazendaOptions.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">META</Badge>
        <div className="flex-1" />

        <Button size="sm" variant="outline" onClick={() => importarRealizadoAnoAnterior()} disabled={loading || !fazendaId}>
          <Download className="h-4 w-4 mr-1" />
          Importar Realizado {ano - 1}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowAjuste(true)} disabled={loading}>
          <Percent className="h-4 w-4 mr-1" />
          Ajuste %
        </Button>
        <Button size="sm" variant="outline" onClick={handleRecalcularVariaveis} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Recalcular
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowNovaLinha(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Linha
        </Button>
      </div>

      {/* Resumo */}
      <Card>
        <CardContent className="p-3 flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{gridCompleto.length} subcentros</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{data.length} registros com valor</span>
          <span className="flex-1" />
          <span className="font-bold">Total: R$ {fmt(totalAnual)}</span>
        </CardContent>
      </Card>

      {/* Grid principal */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[220px]">Centro / Subcentro</TableHead>
                  <TableHead className="w-[60px]">Tipo</TableHead>
                  {MESES_CURTOS.map(m => (
                    <TableHead key={m} className="w-[75px] text-right">{m}</TableHead>
                  ))}
                  <TableHead className="w-[90px] text-right font-bold">Total</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {gridCompleto.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center text-muted-foreground py-8">
                      Selecione uma fazenda para visualizar o planejamento.
                    </TableCell>
                  </TableRow>
                )}
                {macroGroups.map(([macro, rows]) => (
                  <>
                    <TableRow key={`header-${macro}`}>
                      <TableCell colSpan={16} className="bg-muted/50 font-semibold text-xs py-1.5 sticky left-0">
                        {macro}
                      </TableCell>
                    </TableRow>
                    {rows.map((row, idx) => {
                      const hasData = row.total > 0 || row.ids.some(Boolean);
                      return (
                        <TableRow key={`${macro}-${idx}`} className={!hasData ? 'opacity-50' : ''}>
                          <TableCell className="sticky left-0 bg-background z-10 text-xs">
                            <div className="font-medium">{row.centro_custo}</div>
                            {row.subcentro && (
                              <div className="text-muted-foreground text-[10px]">{row.subcentro}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.tipo_custo === 'fixo' ? 'secondary' : 'outline'} className="text-[10px]">
                              {row.tipo_custo === 'fixo' ? 'F' : 'V'}
                            </Badge>
                            {row.driver && (
                              <span className="text-[9px] text-muted-foreground block">
                                {DRIVERS_DISPONIVEIS.find(d => d.value === row.driver)?.label || row.driver}
                              </span>
                            )}
                          </TableCell>
                          {row.meses.map((val, mesIdx) => (
                            <TableCell key={mesIdx} className="text-right p-1">
                              <EditableCell
                                value={val}
                                onSave={(v) => handleCellEdit(row.ids[mesIdx], mesIdx + 1, v, row)}
                              />
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold text-xs">{row.total > 0 ? fmt(row.total) : '–'}</TableCell>
                          <TableCell>
                            {hasData && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleExcluirLinha(row.ids)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Nova Linha (exceção) */}
      <Dialog open={showNovaLinha} onOpenChange={setShowNovaLinha}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Linha Extra</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Use apenas para subcentros que não aparecem na grade do plano de contas oficial.
          </p>
          <div className="space-y-3">
            <div>
              <Label>Centro de Custo *</Label>
              <Select value={nlCentro} onValueChange={v => { setNlCentro(v); setNlSubcentroId(''); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {centrosUnicos.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subcentro *</Label>
              <Select value={nlSubcentroId} onValueChange={setNlSubcentroId} disabled={!nlCentro}>
                <SelectTrigger><SelectValue placeholder={nlCentro ? 'Selecione...' : 'Centro primeiro'} /></SelectTrigger>
                <SelectContent>
                  {subcentrosFiltrados.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.subcentro}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlanoItem && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {selectedPlanoItem.macro_custo} › {selectedPlanoItem.grupo_custo} › {selectedPlanoItem.centro_custo}
                </p>
              )}
            </div>
            <div>
              <Label>Valor Base Mensal (R$)</Label>
              <Input type="number" step="0.01" value={nlValorBase} onChange={e => setNlValorBase(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovaLinha(false)}>Cancelar</Button>
            <Button onClick={handleNovaLinha} disabled={!selectedPlanoItem}>Criar 12 meses</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ajuste Percentual */}
      <Dialog open={showAjuste} onOpenChange={setShowAjuste}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Ajuste Percentual</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Aplica ajuste sobre todas as linhas do ano {ano} na fazenda selecionada.
            </p>
            <div>
              <Label>Percentual (%)</Label>
              <Input
                type="number" step="0.1" value={ajustePercent}
                onChange={e => setAjustePercent(e.target.value)}
                placeholder="ex: 5 para +5%"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAjuste(false)}>Cancelar</Button>
            <Button onClick={handleAjuste}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Editable Cell ──────────────────────────────────────────

function EditableCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const start = () => {
    setText(value === 0 ? '' : String(value));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const v = parseFloat(text) || 0;
    if (v !== value) onSave(v);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type="number" step="0.01"
        className="h-6 text-xs text-right p-1 w-[70px]"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }

  return (
    <span
      className="cursor-pointer text-xs hover:bg-muted px-1 py-0.5 rounded block text-right"
      onClick={start}
    >
      {value === 0 ? '–' : fmt(value)}
    </span>
  );
}
