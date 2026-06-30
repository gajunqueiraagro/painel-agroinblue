// ============================================================================
// LancamentoLeituraDialog — modal SOMENTE-LEITURA do lançamento oficial.
// P3.3: aberto pela aba Sistema da Auditoria (linha clicável). Carga read-only
// por 4 selects simples via client (sem RPC, sem embed frágil). NÃO edita, NÃO
// cancela, NÃO restaura — só apresenta a ficha + ação Resolver (reusa a Estação).
// ============================================================================
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LancRow {
  id: string;
  data_pagamento: string | null; data_competencia: string | null;
  valor: number | null; sinal: string | null;
  descricao: string | null; historico: string | null; observacao: string | null;
  documento: string | null; numero_documento: string | null;
  favorecido_id: string | null; conta_bancaria_id: string | null;
  centro_custo: string | null; subcentro: string | null;
  origem_lancamento: string | null; status_transacao: string | null; cancelado: boolean | null;
  created_at: string | null; created_by: string | null;
  updated_at: string | null; updated_by: string | null;
}
interface Ficha {
  lanc: LancRow;
  fornecedor_nome: string | null;
  conta_nome: string | null;
  ofx_extrato_id: string | null;
}

const fmtData = (s: string | null | undefined): string => {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};
const fmtBRL = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 border-b last:border-b-0">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80 shrink-0">{label}</span>
      <span className="text-[11px] leading-snug break-words text-right min-w-0">{children}</span>
    </div>
  );
}
const ou = (v: string | null | undefined) =>
  v === null || v === undefined || v === '' ? <span className="italic text-muted-foreground/70">—</span> : v;

export interface LancamentoLeituraDialogProps {
  open: boolean;
  lancamentoId: string | null;
  onClose: () => void;
  onResolver?: (id: string) => void;        // sem vínculo → Estação
  onVerOfx?: (extratoId: string) => void;   // conciliado → best-effort
}

export function LancamentoLeituraDialog({ open, lancamentoId, onClose, onResolver, onVerOfx }: LancamentoLeituraDialogProps) {
  const [estado, setEstado] = useState<'loading' | 'erro' | 'ok'>('loading');
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [msgErro, setMsgErro] = useState('');

  useEffect(() => {
    if (!open || !lancamentoId) return;
    let vivo = true;
    setEstado('loading'); setFicha(null); setMsgErro('');
    (async () => {
      try {
        const { data: l, error } = await (supabase as any)
          .from('financeiro_lancamentos_v2').select('*').eq('id', lancamentoId).single();
        if (!vivo) return;
        if (error || !l) { setMsgErro(error?.message ?? 'Lançamento não encontrado.'); setEstado('erro'); return; }
        const [forn, conta, cbi] = await Promise.all([
          l.favorecido_id
            ? (supabase as any).from('financeiro_fornecedores').select('nome').eq('id', l.favorecido_id).maybeSingle()
            : Promise.resolve({ data: null }),
          l.conta_bancaria_id
            ? (supabase as any).from('financeiro_contas_bancarias').select('nome_exibicao').eq('id', l.conta_bancaria_id).maybeSingle()
            : Promise.resolve({ data: null }),
          (supabase as any).from('conciliacao_bancaria_itens').select('extrato_id')
            .eq('lancamento_id', lancamentoId).is('desfeito_em', null).limit(1).maybeSingle(),
        ]);
        if (!vivo) return;
        setFicha({
          lanc: l as LancRow,
          fornecedor_nome: forn?.data?.nome ?? null,
          conta_nome: conta?.data?.nome_exibicao ?? null,
          ofx_extrato_id: cbi?.data?.extrato_id ?? null,
        });
        setEstado('ok');
      } catch (e) {
        if (!vivo) return;
        setMsgErro((e as { message?: string } | null)?.message || 'Erro ao carregar o lançamento.');
        setEstado('erro');
      }
    })();
    return () => { vivo = false; };
  }, [open, lancamentoId]);

  const l = ficha?.lanc;
  const valorAssinado = l ? (l.sinal === '-1' ? -(l.valor ?? 0) : (l.valor ?? 0)) : 0;
  const semVinculo = !!ficha && !ficha.ofx_extrato_id;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[92vw] p-0 gap-0 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b px-4 pr-12 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">Lançamento do sistema</div>
          <DialogTitle className="text-sm font-semibold mt-0.5 truncate">{l?.descricao ?? 'Lançamento'}</DialogTitle>
          <DialogDescription className="text-[10px] mt-0.5">Ficha somente leitura — auditoria.</DialogDescription>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {estado === 'loading' && <div className="text-xs text-muted-foreground py-8 text-center">Carregando…</div>}
          {estado === 'erro' && <div className="text-xs text-rose-600 dark:text-rose-400 py-8 text-center break-words">{msgErro}</div>}
          {estado === 'ok' && l && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-lg font-semibold tabular-nums ${valorAssinado >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {valorAssinado >= 0 ? '▲' : '▼'} {fmtBRL(Math.abs(valorAssinado))}
                </span>
                <div className="flex items-center gap-1">
                  {l.cancelado ? <Badge variant="outline" className="text-[9px] border-rose-400 text-rose-600">cancelado</Badge> : null}
                  {ficha?.ofx_extrato_id
                    ? <Badge variant="outline" className="text-[9px] border-emerald-400 text-emerald-600">conciliado</Badge>
                    : <Badge variant="outline" className="text-[9px]">sem vínculo</Badge>}
                </div>
              </div>

              <div className="rounded border p-1.5">
                <Campo label="Pagamento">{fmtData(l.data_pagamento)}</Campo>
                <Campo label="Competência">{fmtData(l.data_competencia)}</Campo>
                <Campo label="Descrição">{ou(l.descricao)}</Campo>
                <Campo label="Histórico">{ou(l.historico)}</Campo>
                <Campo label="Observação">{ou(l.observacao)}</Campo>
                <Campo label="Documento">{ou(l.numero_documento ?? l.documento)}</Campo>
              </div>
              <div className="rounded border p-1.5">
                <Campo label="Fornecedor">{ou(ficha?.fornecedor_nome)}</Campo>
                <Campo label="Centro / Subcentro">{ou([l.centro_custo, l.subcentro].filter(Boolean).join(' / ') || null)}</Campo>
                <Campo label="Conta bancária">{ou(ficha?.conta_nome)}</Campo>
                <Campo label="Origem">{ou(l.origem_lancamento)}</Campo>
                <Campo label="Status">{ou(l.status_transacao)}</Campo>
                <Campo label="Conciliação">
                  {ficha?.ofx_extrato_id ? `Conciliado ao OFX ${ficha.ofx_extrato_id.slice(0, 8)}` : 'Sem vínculo'}
                </Campo>
              </div>
              <div className="rounded border p-1.5">
                <Campo label="Criado em">{fmtData(l.created_at)}{l.created_by ? ` · ${l.created_by.slice(0, 8)}` : ''}</Campo>
                {(l.updated_at || l.updated_by) && (
                  <Campo label="Atualizado em">{fmtData(l.updated_at)}{l.updated_by ? ` · ${l.updated_by.slice(0, 8)}` : ''}</Campo>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t px-4 py-2 flex items-center justify-end gap-2 bg-muted/30">
          {estado === 'ok' && semVinculo && onResolver && l && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onResolver(l.id)}>Resolver</Button>
          )}
          {estado === 'ok' && ficha?.ofx_extrato_id && onVerOfx && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onVerOfx(ficha.ofx_extrato_id!)}>Ver OFX</Button>
          )}
          <Button size="sm" className="h-7 text-[11px]" onClick={onClose}>Fechar</Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
