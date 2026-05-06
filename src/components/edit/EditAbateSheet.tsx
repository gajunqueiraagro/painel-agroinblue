/**
 * EditAbateSheet — Edição de lançamento de Abate.
 *
 * BLOCO 1 (zootécnico): data, quantidade, peso, categoria, frigorífico,
 *                       status, observação + botão "Salvar zoo"
 * BLOCO 2 (financeiro): AbateFinanceiroPanel mode="update" com hidratação
 *                       de formaReceb/parcelas existentes + botão regerar.
 *
 * Padrão idêntico ao compraEditSheet (overlay no BLOCO 2 enquanto há
 * alterações zoo não salvas — após salvar, BLOCO 2 fica disponível).
 *
 * Não altera banco. Não altera payload.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Trash2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIAS, kgToArrobas, type Lancamento, type Categoria } from '@/types/cattle';
import { STATUS_OPTIONS_ZOOTECNICO_COM_META } from '@/lib/statusOperacional';
import { supabase } from '@/integrations/supabase/client';
import { AbateFinanceiroPanel, type AbateFinanceiroPanelRef } from '@/components/AbateFinanceiroPanel';
import { EditLancamentoSheet } from './EditLancamentoSheet';

interface Parcela { data: string; valor: number; }

interface Props {
  lancamento: Lancamento;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSalvar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => Promise<void>;
  onRemover?: () => Promise<void>;
  podeRemover?: boolean;
  canEditMeta?: boolean;
  p1Oficial?: boolean;
  temAlteracaoEstrutural?: (lanc: Lancamento, dados: Partial<Lancamento>) => boolean;
  nomeFazenda: string;
}

export function EditAbateSheet({
  lancamento, open, onOpenChange, onSalvar, onRemover, podeRemover = true,
  canEditMeta = true, p1Oficial = false, temAlteracaoEstrutural,
}: Props) {
  const [form, setForm] = useState<Lancamento>(lancamento);
  const [statusMode, setStatusMode] = useState<'realizado' | 'programado' | 'meta'>(
    lancamento.cenario === 'meta'
      ? 'meta'
      : ((lancamento.statusOperacional as 'realizado' | 'programado') || 'realizado'),
  );
  const [saving, setSaving] = useState(false);
  const [zooSaved, setZooSaved] = useState(false);
  const [p1BloqueioMsg, setP1BloqueioMsg] = useState<string | null>(null);

  // Estado financeiro vinculado (lido do DB ao abrir)
  const [finLoaded, setFinLoaded] = useState(false);
  const [valorLiquidoDb, setValorLiquidoDb] = useState(0);
  const [totalDescontosDb, setTotalDescontosDb] = useState(0);
  const [formaRecebDb, setFormaRecebDb] = useState<'avista' | 'prazo'>('avista');
  const [parcelasDb, setParcelasDb] = useState<Parcela[]>([]);
  const [fornecedorIdDb, setFornecedorIdDb] = useState<string>('');
  const [notaFiscalEdit, setNotaFiscalEdit] = useState<string>(lancamento.notaFiscal || '');
  const [regenerating, setRegenerating] = useState(false);

  const abateFinRef = useRef<AbateFinanceiroPanelRef>(null);

  // Carrega financeiro vinculado ao abrir o sheet
  useEffect(() => {
    if (!open || finLoaded) return;
    (async () => {
      const { data } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, sinal, valor, data_pagamento, favorecido_id, tipo_operacao')
        .eq('movimentacao_rebanho_id', lancamento.id)
        .eq('cancelado', false)
        .order('data_pagamento');
      const rows = data || [];
      const receitas = rows.filter(r => r.sinal === 1);
      const deducoes = rows.filter(r => r.sinal === -1);
      const valor = receitas.reduce((s, r) => s + Math.abs(Number(r.valor) || 0), 0);
      const desc = deducoes.reduce((s, r) => s + Math.abs(Number(r.valor) || 0), 0);
      const forma: 'avista' | 'prazo' = receitas.length > 1 ? 'prazo' : 'avista';
      const parc: Parcela[] = forma === 'prazo'
        ? receitas.map(r => ({ data: r.data_pagamento || lancamento.data, valor: Math.abs(Number(r.valor) || 0) }))
        : [];
      setValorLiquidoDb(valor);
      setTotalDescontosDb(desc);
      setFormaRecebDb(forma);
      setParcelasDb(parc);
      setFornecedorIdDb(rows.find(r => r.favorecido_id)?.favorecido_id || '');
      setFinLoaded(true);
    })();
  }, [open, finLoaded, lancamento.id, lancamento.data]);

  // Reset hidratação quando o sheet fecha (próxima abertura recarrega)
  useEffect(() => {
    if (!open) {
      setFinLoaded(false);
      setZooSaved(false);
      setForm(lancamento);
      setStatusMode(
        lancamento.cenario === 'meta'
          ? 'meta'
          : ((lancamento.statusOperacional as 'realizado' | 'programado') || 'realizado'),
      );
    }
  }, [open, lancamento]);

  const dirty = useMemo(() => {
    const cenario = statusMode === 'meta' ? 'meta' : 'realizado';
    const status = statusMode === 'meta' ? null : (form.statusOperacional || null);
    return (
      form.data !== lancamento.data ||
      Number(form.quantidade) !== Number(lancamento.quantidade) ||
      Number(form.pesoMedioKg ?? 0) !== Number(lancamento.pesoMedioKg ?? 0) ||
      form.categoria !== lancamento.categoria ||
      ((form as any).frigorifico || form.fazendaDestino || '') !== ((lancamento as any).frigorifico || lancamento.fazendaDestino || '') ||
      (form.observacao || '') !== (lancamento.observacao || '') ||
      cenario !== (lancamento.cenario || 'realizado') ||
      status !== (lancamento.statusOperacional ?? null)
    );
  }, [form, statusMode, lancamento]);

  const handleSalvarZoo = async () => {
    const isMeta = statusMode === 'meta';
    const pesoFinal = form.pesoMedioKg ? Number(form.pesoMedioKg) : undefined;
    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data: form.data,
      tipo: 'abate',
      quantidade: Number(form.quantidade),
      categoria: form.categoria,
      fazendaDestino: (form as any).frigorifico || form.fazendaDestino || undefined,
      pesoMedioKg: pesoFinal,
      pesoMedioArrobas: pesoFinal !== undefined ? kgToArrobas(pesoFinal) : undefined,
      observacao: form.observacao || undefined,
      cenario: isMeta ? 'meta' : 'realizado',
      statusOperacional: isMeta ? null : (form.statusOperacional || 'realizado'),
    };

    if (p1Oficial && temAlteracaoEstrutural && temAlteracaoEstrutural(lancamento, dados as Partial<Lancamento>)) {
      setP1BloqueioMsg('Alteração não salva. Este mês está fechado no Mapa de Pastos. Campos zootécnicos estruturais não podem ser alterados após o fechamento. Peso e observação podem ser editados.');
      return;
    }
    setP1BloqueioMsg(null);

    setSaving(true);
    try {
      await onSalvar(lancamento.id, dados);
      setZooSaved(true);
      toast.success('Dados zootécnicos do abate atualizados.');
    } catch (e: any) {
      toast.error('Falha ao salvar abate: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerarFinanceiro = async () => {
    if (!abateFinRef.current) return;
    setRegenerating(true);
    try {
      const ok = await abateFinRef.current.generateFinanceiro(lancamento.id, {
        valorLiquido: valorLiquidoDb,
        totalDescontos: totalDescontosDb,
        formaReceb: formaRecebDb,
        parcelas: parcelasDb,
      });
      if (ok) {
        toast.success('Financeiro do abate atualizado.');
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error('Falha ao recalcular financeiro: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setRegenerating(false);
    }
  };

  const handleRemover = async () => {
    if (!onRemover) return;
    setSaving(true);
    try {
      await onRemover();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Falha ao excluir: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const frigorificoAtual = (form as any).frigorifico || form.fazendaDestino || '';
  const bloco2Disabled = dirty && !zooSaved;

  return (
    <EditLancamentoSheet
      open={open}
      onOpenChange={onOpenChange}
      titulo="Editar Abate"
      subtitulo="Alterações nos dados zootécnicos podem exigir recálculo do financeiro."
      banners={
        <>
          {p1Oficial && (
            <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
              <p className="text-[9px] text-destructive font-medium">
                🔒 Mês fechado (P1 oficial). Campos estruturais bloqueados.
              </p>
            </div>
          )}
          {p1BloqueioMsg && (
            <div className="bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              <p className="text-[10px] text-destructive font-semibold mb-0.5">⚠️ Alteração não salva</p>
              <p className="text-[9px] text-destructive/90">{p1BloqueioMsg}</p>
            </div>
          )}
        </>
      }
      bloco1={
        <>
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide">
            📋 Dados Zootécnicos
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] font-bold text-foreground">Data</Label>
              <Input
                type="date"
                value={form.data}
                onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                className="mt-0.5 h-7 text-[11px]"
                disabled={p1Oficial}
              />
            </div>
            <div>
              <Label className="text-[10px] font-bold text-foreground">Quantidade</Label>
              <Input
                type="number"
                value={form.quantidade}
                onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))}
                className="mt-0.5 h-7 text-[11px]"
                min="1"
                disabled={p1Oficial}
              />
            </div>
            <div>
              <Label className="text-[10px] font-bold text-foreground">Peso (kg)</Label>
              <Input
                type="number"
                value={form.pesoMedioKg || ''}
                onChange={e => setForm(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))}
                className="mt-0.5 h-7 text-[11px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] font-bold text-foreground">Categoria</Label>
              <Select
                value={form.categoria}
                onValueChange={v => setForm(f => ({ ...f, categoria: v as Categoria }))}
                disabled={p1Oficial}
              >
                <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-bold text-foreground">Frigorífico</Label>
              <Input
                value={frigorificoAtual}
                onChange={e => setForm(f => ({ ...f, fazendaDestino: e.target.value, frigorifico: e.target.value } as any))}
                className="mt-0.5 h-7 text-[11px]"
                placeholder="Ex: JBS, Marfrig"
                disabled={p1Oficial}
              />
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-bold text-foreground">Observação</Label>
            <Input
              value={form.observacao || ''}
              onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
              className="mt-0.5 h-7 text-[11px]"
              placeholder="Opcional"
            />
          </div>

          <div>
            <Label className="text-[10px] font-bold text-foreground">Status</Label>
            <div className="flex gap-1 mt-0.5">
              {STATUS_OPTIONS_ZOOTECNICO_COM_META.map(s => {
                const disabled = (s.value === 'meta' && !canEditMeta) || p1Oficial;
                const selected = statusMode === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      setStatusMode(s.value as 'realizado' | 'programado' | 'meta');
                      setForm(f => ({
                        ...f,
                        statusOperacional: s.value === 'meta' ? null : (s.value as 'realizado' | 'programado'),
                        cenario: s.value === 'meta' ? 'meta' : 'realizado',
                      }));
                    }}
                    disabled={disabled}
                    className={`flex-1 py-1 rounded text-[10px] font-bold border-2 transition-all ${
                      disabled ? 'opacity-40 cursor-not-allowed' : ''
                    } ${
                      selected ? `${s.bg} text-white border-transparent shadow-md` : 'border-border text-muted-foreground bg-muted/30'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {dirty && !zooSaved && (
            <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>Alterações nos dados zootécnicos impactam o financeiro.</span>
            </div>
          )}

          {!dirty ? (
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/30 rounded px-2 py-1 border border-border/40">
              Sem alterações zootécnicas — financeiro disponível abaixo.
            </div>
          ) : !zooSaved ? (
            <Button
              className="w-full h-7 text-[10px] font-bold"
              size="sm"
              onClick={handleSalvarZoo}
              disabled={saving}
            >
              {saving ? 'Salvando…' : '1. Salvar dados zootécnicos'}
            </Button>
          ) : (
            <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded px-2 py-1 border border-green-200 dark:border-green-800">
              ✅ Dados zootécnicos salvos
            </div>
          )}

          {podeRemover && onRemover && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9"
              onClick={handleRemover}
              disabled={saving || p1Oficial}
              title={p1Oficial ? 'Mês fechado — exclusão bloqueada' : 'Excluir abate'}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Excluir Abate
            </Button>
          )}
        </>
      }
      bloco2={
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide mb-1.5">
            <DollarSign className="h-3 w-3" /> 2. Recalcular Financeiro
          </div>
          {bloco2Disabled && (
            <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-[1px] rounded-md flex items-center justify-center p-4">
              <div className="text-center space-y-1">
                <AlertTriangle className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-[11px] font-medium text-muted-foreground">
                  Salve os dados zootécnicos primeiro
                </p>
              </div>
            </div>
          )}
          {finLoaded ? (
            <>
              <AbateFinanceiroPanel
                ref={abateFinRef}
                quantidade={Number(form.quantidade) || 0}
                categoria={form.categoria}
                data={form.data}
                valorLiquido={valorLiquidoDb}
                totalDescontos={totalDescontosDb}
                frigorifico={frigorificoAtual}
                fornecedorId={fornecedorIdDb}
                notaFiscal={notaFiscalEdit}
                onNotaFiscalChange={setNotaFiscalEdit}
                lancamentoId={lancamento.id}
                mode="update"
                onFinanceiroUpdated={() => onOpenChange(false)}
                statusOperacional={statusMode === 'meta' ? 'meta' : ((form.statusOperacional as any) || 'realizado')}
                initialFormaReceb={formaRecebDb}
                initialParcelas={parcelasDb}
              />
              <Button
                className="w-full h-9 text-[12px] font-bold mt-2"
                size="sm"
                onClick={handleRegenerarFinanceiro}
                disabled={regenerating || saving}
              >
                {regenerating ? 'Recalculando…' : 'Recalcular financeiro'}
              </Button>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground py-2">Carregando financeiro vinculado…</p>
          )}
        </div>
      }
    />
  );
}
