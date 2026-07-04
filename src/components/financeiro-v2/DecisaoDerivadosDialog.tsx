// DecisaoDerivadosDialog — PR-PROTOCOLO-01. Dialog ÚNICO do protocolo de invalidação
// de origem (extrato). Zero regra de negócio: a régua e a justificativa vêm PRONTAS da
// RPC fn_invalidar_origem_extrato. O sistema sugere; o operador decide.
//   - abrir → RPC sem p_decisoes → lista derivados vivos + sugestões/justificativas
//   - confirmar → RPC com p_decisoes completo (motivo obrigatório; o banco revalida)
//   - modo 'resolver' = movimento já ignorado com derivado vivo (fecha o caso Vera)
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Decisao = 'cancelar_junto' | 'manter_independente';
interface Derivado {
  lancamento_id: string;
  valor: number | null;
  descricao: string | null;
  origem_lancamento: string | null;
  editado_manual: boolean | null;
  sugestao: Decisao;
  justificativa_tipo: string;
  justificativa: string;
}

export interface DecisaoDerivadosDialogProps {
  extratoId: string | null;
  aberto: boolean;
  onClose: () => void;
  onConcluido: () => void;
  modo: 'ignorar' | 'resolver';
}

const fmtBRL = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function DecisaoDerivadosDialog({ extratoId, aberto, onClose, onConcluido, modo }: DecisaoDerivadosDialogProps) {
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [derivados, setDerivados] = useState<Derivado[]>([]);
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});

  // Abrir → LISTAR (RPC sem decisões; motivo vazio é aceito nesta fase pelo banco).
  const carregar = useCallback(async () => {
    if (!extratoId) return;
    setCarregando(true);
    try {
      const { data, error } = await (supabase as any).rpc('fn_invalidar_origem_extrato', {
        p_extrato_id: extratoId, p_motivo: '', p_decisoes: null,
      });
      if (error) throw error;
      if (data?.motivo === 'decisao_pendente') {
        const ds: Derivado[] = data.derivados ?? [];
        setDerivados(ds);
        setDecisoes(Object.fromEntries(ds.map((d) => [d.lancamento_id, d.sugestao])));
      } else if (data?.motivo === 'motivo_obrigatorio') {
        setDerivados([]);   // sem derivados vivos: só falta o motivo para ignorar
        setDecisoes({});
      } else if (data?.ok === false) {
        toast.error(data.motivo === 'sem_permissao' ? 'Sem permissão.' : `Não foi possível abrir (${data.motivo}).`);
        onClose();
      }
    } catch (e) {
      toast.error((e as { message?: string } | null)?.message || 'Falha ao carregar derivados.');
      onClose();
    } finally {
      setCarregando(false);
    }
  }, [extratoId, onClose]);

  useEffect(() => {
    if (aberto && extratoId) { setMotivo(''); void carregar(); }
    else { setDerivados([]); setDecisoes({}); }
  }, [aberto, extratoId, carregar]);

  const confirmar = async () => {
    if (!extratoId || !motivo.trim() || enviando) return;
    setEnviando(true);
    try {
      const p_decisoes = derivados.length ? decisoes : null;
      const { data, error } = await (supabase as any).rpc('fn_invalidar_origem_extrato', {
        p_extrato_id: extratoId, p_motivo: motivo.trim(), p_decisoes,
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Origem invalidada: ${data.cancelados} cancelado(s) · ${data.promovidos} mantido(s).`);
        onConcluido();
        onClose();
      } else {
        toast.error(data?.motivo === 'motivo_obrigatorio' ? 'Motivo é obrigatório.'
          : data?.motivo === 'erro_cancelamento' ? `Erro ao cancelar: ${data?.detalhe ?? ''}`
          : `Não aplicado (${data?.motivo ?? 'erro'}).`);
      }
    } catch (e) {
      toast.error((e as { message?: string } | null)?.message || 'Falha ao confirmar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[94vw] p-0 gap-0 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b px-4 pr-12 py-2">
          <DialogTitle className="text-sm font-semibold">
            {modo === 'resolver' ? 'Resolver derivados do movimento ignorado' : 'Ignorar movimento (invalidar origem)'}
          </DialogTitle>
          <DialogDescription className="text-[11px] mt-1 leading-snug">
            O movimento deixa de participar da conciliação. Os lançamentos derivados abaixo continuam existindo — decida o destino de cada um. Ação reversível e auditada.
          </DialogDescription>
        </header>

        <div className="p-3 space-y-3 overflow-y-auto max-h-[60vh]">
          <div className="space-y-1">
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Motivo *</span>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                   placeholder="Por que invalidar esta origem?" className="h-8 text-[12px]" autoFocus />
          </div>

          {carregando ? (
            <div className="text-[11px] text-muted-foreground text-center py-4">Carregando derivados…</div>
          ) : derivados.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center py-4 rounded border border-dashed">
              Nenhum lançamento derivado vivo. O movimento será apenas ignorado.
            </div>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground italic">O sistema sugere; a decisão é sua.</p>
              <div className="space-y-2">
                {derivados.map((d) => {
                  const reflexo = d.sugestao === 'cancelar_junto';
                  const dec = decisoes[d.lancamento_id];
                  return (
                    <div key={d.lancamento_id} className="rounded border p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium tabular-nums">{fmtBRL(d.valor)}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${reflexo ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                          {reflexo ? 'Reflexo' : 'Vida própria'}
                        </span>
                      </div>
                      <div className="text-[11px] truncate" title={d.descricao ?? ''}>{d.descricao ?? '—'}</div>
                      <div className="text-[10px] text-muted-foreground">origem: {d.origem_lancamento ?? '—'}</div>
                      <div className="text-[10px] text-muted-foreground leading-snug">{d.justificativa}</div>
                      <div className="flex gap-3 pt-0.5">
                        {(['cancelar_junto', 'manter_independente'] as Decisao[]).map((op) => (
                          <label key={op} className="flex items-center gap-1 text-[11px] cursor-pointer">
                            <input type="radio" name={`dec-${d.lancamento_id}`} checked={dec === op}
                                   onChange={() => setDecisoes((s) => ({ ...s, [d.lancamento_id]: op }))} />
                            {op === 'cancelar_junto' ? 'Cancelar junto' : 'Manter como independente'}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <footer className="shrink-0 border-t px-4 py-2 flex items-center justify-end gap-2 bg-muted/30">
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={enviando} onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="h-7 text-[11px]" disabled={!motivo.trim() || enviando || carregando} onClick={() => void confirmar()}>
            {enviando ? 'Aplicando…' : 'Confirmar'}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
