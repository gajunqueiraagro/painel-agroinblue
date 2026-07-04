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
// PR-A3.1 — número absoluto sem símbolo (o texto do aviso já traz "R$").
const fmtNum = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// PR-A3.1 — proteção "última cópia válida" (campos vêm da RPC; opcionais p/ retrocompat).
interface UltimaCopiaInfo { ultima_copia_valida: boolean; gemeas_vivas: number; impacto_valor: number; documento: string | null; }

export function DecisaoDerivadosDialog({ extratoId, aberto, onClose, onConcluido, modo }: DecisaoDerivadosDialogProps) {
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [derivados, setDerivados] = useState<Derivado[]>([]);
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});
  const [ultimaCopia, setUltimaCopia] = useState<UltimaCopiaInfo | null>(null);   // PR-A3.1

  // Abrir → LISTAR (RPC sem decisões; motivo vazio é aceito nesta fase pelo banco).
  const carregar = useCallback(async () => {
    if (!extratoId) return;
    setCarregando(true);
    try {
      const { data, error } = await (supabase as any).rpc('fn_invalidar_origem_extrato', {
        p_extrato_id: extratoId, p_motivo: '', p_decisoes: null,
      });
      if (error) throw error;
      // PR-A3.1 — captura os campos de última-cópia/impacto (ausentes na RPC antiga → false/0).
      const uc: UltimaCopiaInfo = {
        ultima_copia_valida: data?.ultima_copia_valida === true,
        gemeas_vivas: data?.gemeas_vivas ?? 0,
        impacto_valor: typeof data?.impacto_valor === 'number' ? data.impacto_valor : 0,
        documento: data?.documento ?? null,
      };
      if (data?.motivo === 'decisao_pendente') {
        const ds: Derivado[] = data.derivados ?? [];
        setDerivados(ds);
        setDecisoes(Object.fromEntries(ds.map((d) => [d.lancamento_id, d.sugestao])));
        setUltimaCopia(uc);
      } else if (data?.motivo === 'motivo_obrigatorio') {
        setDerivados([]);   // sem derivados vivos: só falta o motivo para ignorar
        setDecisoes({});
        setUltimaCopia(uc);
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
    else { setDerivados([]); setDecisoes({}); setUltimaCopia(null); }
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
          {/* PR-A3.1 — última ocorrência válida: remover = remover dinheiro real do banco. */}
          {ultimaCopia?.ultima_copia_valida && (
            <div className="rounded border border-amber-400 bg-amber-50 p-2.5 space-y-1">
              <div className="text-[11px] font-bold text-amber-800">ATENÇÃO</div>
              <div className="text-[11px] text-amber-900 leading-snug">
                Esta é a <b>última ocorrência válida</b> deste documento. Após confirmar:
              </div>
              <ul className="text-[11px] text-amber-900 leading-snug list-disc pl-4">
                <li>o movimento desaparecerá do OFX válido;</li>
                <li>o saldo do extrato será <b>{ultimaCopia.impacto_valor < 0 ? 'reduzido' : 'aumentado'}</b> em R$ {fmtNum(ultimaCopia.impacto_valor)};</li>
                <li>o fechamento poderá deixar de bater.</li>
              </ul>
              <div className="text-[11px] text-amber-900">Deseja continuar?</div>
            </div>
          )}
          {/* PR-A3.1 — há cópias vivas: informativo discreto (dialog atual, sem bloco forte). */}
          {ultimaCopia && !ultimaCopia.ultima_copia_valida && ultimaCopia.gemeas_vivas > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {ultimaCopia.gemeas_vivas} outra(s) cópia(s) válida(s) deste documento permanecem no extrato.
            </p>
          )}
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
          {ultimaCopia?.ultima_copia_valida ? (
            <>
              {/* PR-A3.1 — Cancelar é o default seguro; confirmar exige gesto explícito. */}
              <Button size="sm" className="h-7 text-[11px]" disabled={enviando} onClick={onClose}>Cancelar</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!motivo.trim() || enviando || carregando} onClick={() => void confirmar()}>
                {enviando ? 'Aplicando…' : 'Confirmar assim mesmo'}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={enviando} onClick={onClose}>Cancelar</Button>
              <Button size="sm" className="h-7 text-[11px]" disabled={!motivo.trim() || enviando || carregando} onClick={() => void confirmar()}>
                {enviando ? 'Aplicando…' : 'Confirmar'}
              </Button>
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
