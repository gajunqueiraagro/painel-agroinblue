/**
 * EditMorteSheet — Edição de lançamento de Morte.
 *
 * Padrão visual idêntico ao EditNascimentoSheet (BLOCO 1 zoot, sem BLOCO 2).
 * Morte NÃO gera lançamento financeiro.
 *
 * Regras:
 * - motivo morte gravado em `fazendaDestino` (regra zoot existente)
 * - lista oficial MOTIVOS_MORTE + opção __custom__ para texto livre
 * - status: realizado | programado | meta
 * - P1 oficial bloqueia campos estruturais
 * - soft delete via callback `onRemover`
 *
 * Não altera banco. Não altera payload. Não altera hooks.
 */
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIAS, kgToArrobas, type Lancamento, type Categoria } from '@/types/cattle';
import { STATUS_OPTIONS_ZOOTECNICO_COM_META } from '@/lib/statusOperacional';
import { EditLancamentoSheet } from './EditLancamentoSheet';

// Lista oficial de motivos — espelha src/pages/LancamentosTab.tsx:99
const MOTIVOS_MORTE = [
  'Raio', 'Picada de cobra', 'Doença respiratória', 'Tristeza parasitária',
  'Clostridiose', 'Intoxicação por planta', 'Acidente', 'Desidratação',
  'Parto distócico', 'Ataque de animal', 'Causa desconhecida',
];

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

export function EditMorteSheet({
  lancamento, open, onOpenChange, onSalvar, onRemover, podeRemover = true,
  canEditMeta = true, p1Oficial = false, temAlteracaoEstrutural,
  nomeFazenda,
}: Props) {
  const [form, setForm] = useState<Lancamento>(lancamento);
  const [statusMode, setStatusMode] = useState<'realizado' | 'programado' | 'meta'>(
    lancamento.cenario === 'meta'
      ? 'meta'
      : ((lancamento.statusOperacional as 'realizado' | 'programado') || 'realizado'),
  );

  // Motivo está gravado em `fazendaDestino` (ou fallback observação)
  const motivoInicial = lancamento.fazendaDestino || lancamento.observacao || '';
  const motivoIsPreset = MOTIVOS_MORTE.includes(motivoInicial);
  const [motivo, setMotivo] = useState(motivoIsPreset ? motivoInicial : motivoInicial ? '__custom__' : '');
  const [motivoCustom, setMotivoCustom] = useState(motivoIsPreset ? '' : motivoInicial);

  const [saving, setSaving] = useState(false);
  const [p1BloqueioMsg, setP1BloqueioMsg] = useState<string | null>(null);

  const motivoFinal = motivo === '__custom__' ? motivoCustom : motivo;

  const dirty = useMemo(() => {
    const cenario = statusMode === 'meta' ? 'meta' : 'realizado';
    const status = statusMode === 'meta' ? null : (form.statusOperacional || null);
    return (
      form.data !== lancamento.data ||
      Number(form.quantidade) !== Number(lancamento.quantidade) ||
      Number(form.pesoMedioKg ?? 0) !== Number(lancamento.pesoMedioKg ?? 0) ||
      form.categoria !== lancamento.categoria ||
      (motivoFinal || '') !== (lancamento.fazendaDestino || lancamento.observacao || '') ||
      (form.observacao || '') !== (lancamento.observacao || '') ||
      cenario !== (lancamento.cenario || 'realizado') ||
      status !== (lancamento.statusOperacional ?? null)
    );
  }, [form, statusMode, motivoFinal, lancamento]);

  const handleSalvar = async () => {
    const isMeta = statusMode === 'meta';
    const pesoFinal = form.pesoMedioKg ? Number(form.pesoMedioKg) : undefined;
    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data: form.data,
      tipo: 'morte',
      quantidade: Number(form.quantidade),
      categoria: form.categoria,
      fazendaOrigem: nomeFazenda,
      fazendaDestino: motivoFinal || undefined,
      pesoMedioKg: pesoFinal,
      pesoMedioArrobas: pesoFinal !== undefined ? kgToArrobas(pesoFinal) : undefined,
      observacao: form.observacao || undefined,
      cenario: isMeta ? 'meta' : 'realizado',
      statusOperacional: isMeta ? null : (form.statusOperacional || 'realizado'),
    };

    if (p1Oficial && temAlteracaoEstrutural && temAlteracaoEstrutural(lancamento, dados as Partial<Lancamento>)) {
      setP1BloqueioMsg('Alteração não salva. Este mês está fechado no Mapa de Pastos. Campos zootécnicos estruturais (data, quantidade, categoria, fazenda) não podem ser alterados após o fechamento. Peso e observação podem ser editados.');
      return;
    }
    setP1BloqueioMsg(null);

    setSaving(true);
    try {
      await onSalvar(lancamento.id, dados);
      toast.success('Morte atualizada.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Falha ao salvar morte: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
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

  return (
    <EditLancamentoSheet
      open={open}
      onOpenChange={onOpenChange}
      titulo="Editar Morte"
      banners={
        <>
          {p1Oficial && (
            <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
              <p className="text-[9px] text-destructive font-medium">
                🔒 Mês fechado (P1 oficial). Campos estruturais bloqueados. Apenas peso e observação podem ser alterados.
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

          <div className="grid grid-cols-3 gap-2">
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
            <div className="col-span-2">
              <Label className="text-[10px] font-bold text-foreground">Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS_MORTE.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Outro (especificar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {motivo === '__custom__' && (
            <div>
              <Label className="text-[10px] font-bold text-foreground">Motivo (texto livre)</Label>
              <Input
                value={motivoCustom}
                onChange={e => setMotivoCustom(e.target.value)}
                className="mt-0.5 h-7 text-[11px]"
                placeholder="Descreva o motivo"
              />
            </div>
          )}

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

          {!dirty && (
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/30 rounded px-2 py-1 border border-border/40">
              Sem alterações.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {podeRemover && onRemover && (
              <Button
                variant="destructive"
                size="sm"
                className="h-9 px-3"
                onClick={handleRemover}
                disabled={saving || p1Oficial}
                title={p1Oficial ? 'Mês fechado — exclusão bloqueada' : 'Excluir morte'}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              className="flex-1 h-9 text-[12px] font-bold"
              size="sm"
              onClick={handleSalvar}
              disabled={saving || !dirty}
            >
              {saving ? 'Salvando…' : 'Salvar Morte'}
            </Button>
          </div>
          {!dirty && (
            <p className="text-[9px] text-muted-foreground/70 text-center">
              <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5" />
              Nada para salvar — altere algum campo.
            </p>
          )}
        </>
      }
    />
  );
}
