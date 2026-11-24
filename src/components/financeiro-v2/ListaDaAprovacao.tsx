/**
 * BPO-FUNCIONAR-01 (mock aprovado, telas 1 e 3) — as peças da aprovação que a CPR monta (a TABELA é a da própria CPR, na régua dela —
 * Code 6 07:13; aqui só o que não é linha da régua):
 *   · `BarraDaAprovacao` — "N selecionados · R$ … · Recusar… · Aprovar N" (o total sempre à vista). Na CPR ela ocupa a faixa presa do rodapé
 *     (mesma altura: nada se desloca); a decisão passa pela PRÉVIA do banco e depois grava (`fn_aprovacao_decidir`: o banco confere de novo
 *     quem lançou, o já decidido e o motivo). Recusar pede o motivo (≥ 3). Erro fica na barra (UX-TOAST-01); sucesso avisa no toast.
 *   · `CartoesDaAprovacao` — o CELULAR (< 900 px): as mesmas linhas da etapa em cartões de 2 linhas (fornecedor + valor · vencimento + o que é
 *     + documento ✓), com a mesma seleção.
 */
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TextoReservado, reservaDeNumero } from '@/components/ui/regua-tabela';
import type { LinhaDaDecisao } from '@/components/financeiro-v2/PainelDeDecisao';
import { decidirAprovacao } from '@/hooks/useAprovacaoDaCpr';
import { formatMoeda } from '@/lib/calculos/formatters';
import { motivoSemSelecao, type AprovacaoDaLinha, type EtapaCpr } from '@/lib/financeiro/aprovacaoNaCpr';
import { cn } from '@/lib/utils';

export interface LinhaDaEtapa extends LinhaDaDecisao { doc: { nf: boolean; boleto: boolean } }

const RESERVA_DO_TOTAL = `999 selecionados · R$ ${reservaDeNumero(7)},99`;

/** abaixo desta largura, a etapa vira cartões (o mock do celular) */
export const LARGURA_DOS_CARTOES = 900;

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

export function BarraDaAprovacao({ clienteId, selecionadas, onFeito, className, legenda, reservarAprovar }: {
  clienteId: string; selecionadas: readonly { id: string; valor: number }[]; onFeito: () => void; className?: string;
  /** APROVAR-PAGAMENTOS-V3 — a legenda das siglas da forma, depois do total (a tela própria; a CPR não passa) */
  legenda?: ReactNode;
  /** APROVAR-PAGAMENTOS-V3 — o "Aprovar N" com lugar reservado também SEM legenda (o celular da tela própria: marcar não empurra o "Recusar…") */
  reservarAprovar?: boolean;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const total = selecionadas.reduce((s, l) => s + Math.abs(l.valor), 0);
  const n = selecionadas.length;

  const decidir = async (aprovar: boolean, texto: string | null) => {
    const ids = selecionadas.map((l) => l.id);
    if (!ids.length) return;
    setOcupado(true); setAviso(null);
    try {
      const previa = await decidirAprovacao({ clienteId, ids, aprovar, motivo: texto, simular: true });
      if (previa.ok === false) { setAviso(previa.frase); return; }
      const r = await decidirAprovacao({ clienteId, ids, aprovar, motivo: texto, simular: false });
      if (r.ok === false) { setAviso(r.frase); return; }
      toast.success(`${r.n} ${r.n === 1 ? 'pagamento' : 'pagamentos'} ${aprovar ? 'aprovado' : 'recusado'}${r.n === 1 ? '' : 's'} · ${formatMoeda(r.total)}`);
      setRecusando(false); setMotivo(''); onFeito();
    } finally { setOcupado(false); }
  };

  return (
    <div className={cn('flex shrink-0 items-center gap-2 border-t-2 border-t-sky-300 bg-sky-50 px-3 text-[11.5px] dark:bg-sky-950/40', className)} data-testid="bpo-barra-selecao">
      <b className="shrink-0 whitespace-nowrap tabular-nums" data-testid="bpo-barra-total">
        {/* com a legenda ao lado (a tela própria), o total tem LUGAR RESERVADO: marcar não empurra a legenda (UI-SEM-DESLOCAR-01) */}
        {legenda ? <TextoReservado texto={`${n} ${n === 1 ? 'selecionado' : 'selecionados'} · ${formatMoeda(total)}`} reserva={RESERVA_DO_TOTAL} />
          : `${n} ${n === 1 ? 'selecionado' : 'selecionados'} · ${formatMoeda(total)}`}
      </b>
      {legenda}
      <span className="min-w-0 flex-1 break-words text-[11px] leading-[13px] text-destructive" data-testid="bpo-barra-aviso">{aviso ?? ''}</span>
      <Button size="sm" variant="outline" className="h-6 shrink-0 text-[11px] text-destructive" disabled={ocupado || n === 0}
        onClick={() => { setMotivo(''); setAviso(null); setRecusando(true); }} data-testid="bpo-recusar">Recusar…</Button>
      <Button size="sm" className="h-6 shrink-0 bg-emerald-700 text-[11px] text-white hover:bg-emerald-800" disabled={ocupado || n === 0}
        onClick={() => void decidir(true, null)} data-testid="bpo-aprovar">Aprovar {legenda || reservarAprovar ? <TextoReservado texto={n || ''} reserva="999" /> : (n || '')}</Button>
      <Dialog open={recusando} onOpenChange={(v) => { if (!v && !ocupado) setRecusando(false); }}>
        <DialogContent className="max-w-[420px]" data-testid="bpo-recusar-dialogo">
          <DialogHeader>
            <DialogTitle className="text-[13px]">Recusar {n} · {formatMoeda(total)}</DialogTitle>
            <DialogDescription className="text-[11px]">Volta para quem lançou, com o motivo.</DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obrigatório)" className="h-[72px] resize-none text-[12px]"
            data-testid="bpo-recusar-motivo" />
          <p className="min-h-[16px] text-[11px] text-destructive">{aviso ?? ''}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setRecusando(false)}>Voltar</Button>
            <Button size="sm" variant="destructive" disabled={ocupado || motivo.trim().length < 3} onClick={() => void decidir(false, motivo.trim())}
              data-testid="bpo-recusar-confirmar">Recusar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CartoesDaAprovacao({ etapa, linhas, estados, euId, marcadas, onMarcar, onAbrir }: {
  etapa: Exclude<EtapaCpr, 'tudo'>; linhas: readonly LinhaDaEtapa[]; estados: ReadonlyMap<string, AprovacaoDaLinha>; euId: string | null;
  marcadas: ReadonlySet<string>; onMarcar: (id: string, v: boolean) => void; onAbrir: (i: number, id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2" data-testid="bpo-cartoes">
      {linhas.length === 0 && (
        <div className="p-4 text-[12px] text-muted-foreground" data-testid="bpo-etapa-vazia">
          {etapa === 'aprovar' ? 'Nada para aprovar neste período.' : 'Nada nesta etapa neste período.'}
        </div>
      )}
      {linhas.map((l, i) => {
        const a = estados.get(l.id);
        const motivo = motivoSemSelecao(a, !!euId && a?.lancadoPor === euId);
        const docTexto = l.doc.nf && l.doc.boleto ? 'NF + boleto ✓' : l.doc.nf ? 'NF ✓' : l.doc.boleto ? 'boleto ✓' : 'sem documento';
        return (
          <div key={l.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-lg border bg-card px-2.5 py-2" data-testid="bpo-cartao">
            {etapa === 'aprovar'
              ? <Checkbox checked={marcadas.has(l.id)} disabled={motivo !== null} onCheckedChange={(v) => onMarcar(l.id, v === true)}
                  title={motivo ?? 'Selecionar'} aria-label={`Selecionar ${l.fornecedor}`} />
              : <span />}
            <button type="button" className="min-w-0 break-words text-left text-[13px] font-semibold" onClick={() => onAbrir(i, l.id)}>{l.fornecedor}</button>
            <span className="text-right text-[13px] font-bold tabular-nums text-destructive">{formatMoeda(l.valor)}</span>
            <span />
            <span className={cn('col-span-2 break-words text-[11px]', docTexto === 'sem documento' ? 'text-amber-700' : 'text-muted-foreground')}>
              {ddmm(l.vencimento)} · {l.subcentro || '—'} · {docTexto}
            </span>
          </div>
        );
      })}
    </div>
  );
}
