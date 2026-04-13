/**
 * PlanejamentoFinanceiroTab
 *
 * Tela operacional para planejamento financeiro anual (cenário META).
 * Seleção baseada no plano de contas oficial — sem digitação livre.
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
import { usePlanejamentoFinanceiro, DRIVERS_DISPONIVEIS, DRIVER_POR_SUBCENTRO } from '@/hooks/usePlanejamentoFinanceiro';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { loadPlanoContasCompleto, type PlanoContasItem } from '@/lib/financeiro/planoContasBuilder';
import { Copy, Download, Percent, RefreshCw, Plus, Trash2, AlertTriangle } from 'lucide-react';
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import { extrairDriversMensais, validarDriversDisponiveis } from '@/lib/calculos/driverZootecnico';

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  onBack?: () => void;
  metaConsolidacao?: MetaCategoriaMes[];
}

export function PlanejamentoFinanceiroTab({ onBack, metaConsolidacao }: Props) {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear + 1);
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();

  const {
    data, loading, reload,
    upsertRow, deleteRow,
    replicarParaMeses, importarAnoAnterior,
    aplicarAjustePercentual, recalcularVariaveis,
    getLinhasAgrupadas, totalAnual,
  } = usePlanejamentoFinanceiro(ano);

  // ─── Plano de contas ─────────────────────────────────────
  const [planoContas, setPlanoContas] = useState<PlanoContasItem[]>([]);

  useEffect(() => {
    if (!clienteAtual?.id) return;
    loadPlanoContasCompleto(clienteAtual.id).then(setPlanoContas);
  }, [clienteAtual?.id]);

  // Filter: only 2-Saídas items with subcentro (expenditures for planning)
  const itensSaidas = useMemo(() =>
    planoContas.filter(p => p.tipo_operacao === '2-Saídas' && p.subcentro),
    [planoContas]
  );

  // Group by centro_custo for cascading selector
  const centrosUnicos = useMemo(() => {
    const set = new Set<string>();
    itensSaidas.forEach(p => set.add(p.centro_custo));
    return Array.from(set).sort();
  }, [itensSaidas]);

  // ─── State: dialogs ──────────────────────────────────────
  const [showNovaLinha, setShowNovaLinha] = useState(false);
  const [showAjuste, setShowAjuste] = useState(false);
  const [ajustePercent, setAjustePercent] = useState('');

  // Nova linha form — plano de contas based
  const [nlCentro, setNlCentro] = useState('');
  const [nlSubcentroId, setNlSubcentroId] = useState('');
  const [nlTipo, setNlTipo] = useState<'fixo' | 'variavel'>('fixo');
  const [nlDriver, setNlDriver] = useState('');
  const [nlUnidadeDriver, setNlUnidadeDriver] = useState('cab/mes');
  const [nlValorBase, setNlValorBase] = useState('');

  // Subcentros filtered by selected centro
  const subcentrosFiltrados = useMemo(() =>
    itensSaidas.filter(p => p.centro_custo === nlCentro),
    [itensSaidas, nlCentro]
  );

  // Selected plano item
  const selectedPlanoItem = useMemo(() =>
    itensSaidas.find(p => p.id === nlSubcentroId),
    [itensSaidas, nlSubcentroId]
  );

  // Auto-detect tipo_custo and driver from plano de contas
  useEffect(() => {
    if (!selectedPlanoItem) return;
    const sub = selectedPlanoItem.subcentro || '';
    const grupo = (selectedPlanoItem.grupo_custo || '').toLowerCase();

    // Auto-set tipo based on grupo_custo
    if (grupo.includes('variável') || grupo.includes('variavel')) {
      setNlTipo('variavel');
    } else {
      setNlTipo('fixo');
    }

    // Auto-set driver from canonical mapping
    const driverInfo = DRIVER_POR_SUBCENTRO[sub];
    if (driverInfo) {
      setNlDriver(driverInfo.driver);
      setNlUnidadeDriver(driverInfo.unidade);
      setNlTipo('variavel');
    } else {
      setNlDriver('');
      setNlUnidadeDriver('cab/mes');
    }
  }, [selectedPlanoItem]);

  const linhasAgrupadas = useMemo(() => getLinhasAgrupadas(), [getLinhasAgrupadas]);

  const handleNovaLinha = async () => {
    if (!selectedPlanoItem) { toast.error('Selecione um subcentro do plano de contas'); return; }
    const valorBase = parseFloat(nlValorBase) || 0;

    await replicarParaMeses({
      centro_custo: selectedPlanoItem.centro_custo,
      subcentro: selectedPlanoItem.subcentro,
      macro_custo: selectedPlanoItem.macro_custo,
      grupo_custo: selectedPlanoItem.grupo_custo,
      escopo_negocio: selectedPlanoItem.escopo_negocio || 'pecuaria',
      tipo_custo: nlTipo,
      driver: nlTipo === 'variavel' ? (nlDriver || null) : null,
      unidade_driver: nlTipo === 'variavel' ? nlUnidadeDriver : null,
      valor_base: valorBase,
    });
    setShowNovaLinha(false);
    resetNovaLinha();
  };

  const resetNovaLinha = () => {
    setNlCentro(''); setNlSubcentroId(''); setNlTipo('fixo');
    setNlDriver(''); setNlValorBase(''); setNlUnidadeDriver('cab/mes');
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

    // Check if any variable line uses a driver without data
    const variaveis = data.filter(r => r.tipo_custo === 'variavel' && r.driver);
    const driversSemBase = variaveis
      .map(r => r.driver!)
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .filter(d => semDados.some(s => s.driver === d));

    if (driversSemBase.length > 0) {
      const labels = driversSemBase.join(', ');
      toast.warning(`Drivers sem dados no rebanho META: ${labels}. Esses valores ficarão zerados.`);
    }

    await recalcularVariaveis(driverValues);
  };

  const handleExcluirLinha = async (subcentro: string | null, ids: (string | null)[]) => {
    const validIds = ids.filter(Boolean) as string[];
    if (validIds.length === 0) return;
    for (const id of validIds) {
      await deleteRow(id);
    }
    toast.success('Linha excluída');
  };

  // ─── Edição inline de valor_planejado ─────────────────────
  const handleCellEdit = useCallback(async (id: string | null, mes: number, valor: number, row: ReturnType<typeof getLinhasAgrupadas>[0]) => {
    if (!clienteAtual?.id || !fazendaAtual?.id) return;
    const payload: any = {
      cliente_id: clienteAtual.id,
      fazenda_id: fazendaAtual.id,
      ano,
      mes,
      centro_custo: row.centro_custo,
      subcentro: row.subcentro,
      macro_custo: row.macro_custo,
      grupo_custo: row.grupo_custo,
      tipo_custo: row.tipo_custo,
      driver: row.driver,
      unidade_driver: row.unidade_driver,
      valor_base: row.tipo_custo === 'fixo' ? valor : row.valor_base,
      quantidade_driver: row.tipo_custo === 'variavel' ? (valor / (row.valor_base || 1)) : 0,
      valor_planejado: valor,
      origem: 'manual',
      cenario: 'meta',
      observacao: null,
    };
    if (id) payload.id = id;
    await upsertRow(payload);
  }, [ano, clienteAtual, fazendaAtual, upsertRow]);

  return (
    <div className="w-full px-2 sm:px-4 animate-fade-in pb-24 space-y-4">
      {/* Header / Filtros */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
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

        <Button size="sm" variant="outline" onClick={() => importarAnoAnterior()} disabled={loading}>
          <Download className="h-4 w-4 mr-1" />
          Importar {ano - 1}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowAjuste(true)} disabled={loading}>
          <Percent className="h-4 w-4 mr-1" />
          Ajuste %
        </Button>
        <Button size="sm" variant="outline" onClick={handleRecalcularVariaveis} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Recalcular
        </Button>
        <Button size="sm" onClick={() => setShowNovaLinha(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Linha
        </Button>
      </div>

      {/* Resumo */}
      <Card>
        <CardContent className="p-3 flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{linhasAgrupadas.length} centros de custo</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{data.length} registros</span>
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
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Centro / Subcentro</TableHead>
                  <TableHead className="w-[60px]">Tipo</TableHead>
                  <TableHead className="w-[90px]">Driver</TableHead>
                  <TableHead className="w-[80px] text-right">Base</TableHead>
                  {MESES_CURTOS.map(m => (
                    <TableHead key={m} className="w-[80px] text-right">{m}</TableHead>
                  ))}
                  <TableHead className="w-[90px] text-right font-bold">Total</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasAgrupadas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={17} className="text-center text-muted-foreground py-8">
                      Nenhum planejamento cadastrado para {ano}. Clique em "Nova Linha" ou "Importar {ano - 1}".
                    </TableCell>
                  </TableRow>
                )}
                {linhasAgrupadas.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs">
                      <div>{row.centro_custo}</div>
                      {row.subcentro && <div className="text-muted-foreground text-[10px]">{row.subcentro}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.tipo_custo === 'fixo' ? 'secondary' : 'outline'} className="text-[10px]">
                        {row.tipo_custo === 'fixo' ? 'Fixo' : 'Var'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {row.driver ? DRIVERS_DISPONIVEIS.find(d => d.value === row.driver)?.label || row.driver : '–'}
                    </TableCell>
                    <TableCell className="text-right text-xs">{fmt(row.valor_base)}</TableCell>
                    {row.meses.map((val, mesIdx) => (
                      <TableCell key={mesIdx} className="text-right p-1">
                        <EditableCell
                          value={val}
                          onSave={(v) => handleCellEdit(row.ids[mesIdx], mesIdx + 1, v, row)}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold text-xs">{fmt(row.total)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleExcluirLinha(row.subcentro, row.ids)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Nova Linha — Plano de Contas */}
      <Dialog open={showNovaLinha} onOpenChange={setShowNovaLinha}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Linha de Planejamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Centro de Custo *</Label>
              <Select value={nlCentro} onValueChange={v => { setNlCentro(v); setNlSubcentroId(''); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o centro..." /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder={nlCentro ? 'Selecione o subcentro...' : 'Selecione o centro primeiro'} /></SelectTrigger>
                <SelectContent>
                  {subcentrosFiltrados.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.subcentro}
                      {p.grupo_custo && <span className="text-muted-foreground ml-1 text-[10px]">({p.grupo_custo})</span>}
                    </SelectItem>
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
              <Label>Tipo de Custo</Label>
              <Select value={nlTipo} onValueChange={v => setNlTipo(v as 'fixo' | 'variavel')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixo">Fixo</SelectItem>
                  <SelectItem value="variavel">Variável</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {nlTipo === 'variavel' && (
              <>
                <div>
                  <Label>Driver Zootécnico</Label>
                  <Select value={nlDriver} onValueChange={setNlDriver}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {DRIVERS_DISPONIVEIS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unidade do Driver</Label>
                  <Select value={nlUnidadeDriver} onValueChange={setNlUnidadeDriver}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cab/mes">Cabeça / Mês</SelectItem>
                      <SelectItem value="cab/dia">Cabeça / Dia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label>Valor Base (R${nlTipo === 'variavel' && nlDriver ? ` / ${nlUnidadeDriver}` : ''})</Label>
              <Input type="number" step="0.01" value={nlValorBase} onChange={e => setNlValorBase(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNovaLinha(false); resetNovaLinha(); }}>Cancelar</Button>
            <Button onClick={handleNovaLinha} disabled={!selectedPlanoItem}>
              <Copy className="h-4 w-4 mr-1" />
              Criar e Replicar 12 meses
            </Button>
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
              Aplica ajuste sobre valor_base e valor_planejado de todas as linhas do ano {ano}.
            </p>
            <div>
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={ajustePercent}
                onChange={e => setAjustePercent(e.target.value)}
                placeholder="ex: 5 para +5%, -3 para -3%"
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
        type="number"
        step="0.01"
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
