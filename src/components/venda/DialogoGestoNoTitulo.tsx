import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  divisaoInicial, motivoParcelasInvalidas, somaDasParcelas, type GestoNoTitulo, type ParcelaDoGesto,
} from '@/lib/oc/gestoNoTitulo';

/* OC-CORRECOES-01 C2 · OC-CC-GESTOS-LEGADO-01 — o dialogo dos tres gestos do titulo da conta corrente (cancelar, desvincular,
   parcelar). TAMANHO FIXO: a lista de parcelas rola por dentro (no maximo 6 a' vista), o rodape e o motivo nao se mexem. A regra das
   parcelas e' de `gestoNoTitulo`; quem grava e' o banco (a frase dele aparece aqui, nada e' gravado se recusar). */

const BOTAO = 'h-[22px] px-[9px] text-[10px] font-medium';
const TITULO: Record<GestoNoTitulo, string> = { cancelar: 'Cancelar', desvincular: 'Desvincular da operação', parcelar: 'Parcelar' };

export interface TituloDoGesto { lancamentoId: string; descricao: string | null; valor: number; vencimento: string }

export function DialogoGestoNoTitulo({ gesto, titulo, nomeDinheiro, onConfirmar, onFechar }: {
  gesto: GestoNoTitulo; titulo: TituloDoGesto; nomeDinheiro: string;
  onConfirmar: (motivo: string, parcelas: ParcelaDoGesto[] | null) => Promise<string | null>; onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [parcelas, setParcelas] = useState<ParcelaDoGesto[]>(() => divisaoInicial(titulo.valor, 2, titulo.vencimento));
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const faltaMotivo = tentou && motivo.trim() === '';
  const invalidas = gesto === 'parcelar' ? motivoParcelasInvalidas(parcelas, titulo.valor) : null;
  const explicacao = gesto === 'cancelar'
    ? `O ${nomeDinheiro} programado sai (o lançamento é cancelado, com o motivo). Pago ou conciliado não se desfaz por aqui.`
    : gesto === 'desvincular'
      ? `O lançamento sai da operação e volta a ser avulso, como está (valor, vencimento e conta não mudam).`
      : `O título vira a parcela 1; as demais nascem na operação. A soma tem de bater com o título ao centavo.`;
  const mudar = (i: number, p: Partial<ParcelaDoGesto>) => setParcelas(ps => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const confirmar = async () => {
    setTentou(true);
    if (motivo.trim() === '' || invalidas) return;
    setRodando(true); setErro(null);
    const e = await onConfirmar(motivo.trim(), gesto === 'parcelar' ? parcelas : null);
    setRodando(false);
    if (e) { setErro(e); return; }
    onFechar();
  };
  return (
    <Dialog open onOpenChange={o => { if (!o && !rodando) onFechar(); }}>
      <DialogContent className="max-w-md" data-testid={`dialogo-gesto-${gesto}`}>
        <DialogHeader><DialogTitle className="text-[12px]">{TITULO[gesto]} · {nomeDinheiro}</DialogTitle></DialogHeader>
        <div className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-[10px]" data-testid="titulo-do-gesto">
          <span className="min-w-0 truncate" title={titulo.descricao ?? undefined}>{titulo.descricao ?? '—'}</span>
          <span className="shrink-0 tabular-nums">{titulo.vencimento.split('-').reverse().join('/')} · {formatMoeda(titulo.valor)}</span>
        </div>
        <div className="text-[10px] text-muted-foreground">{explicacao}</div>
        {gesto === 'parcelar' && (
          <div className="space-y-1">
            <div className="max-h-[156px] space-y-1 overflow-y-auto pr-1" data-testid="parcelas-do-gesto">
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_22px] items-center gap-1" data-testid="parcela-do-gesto">
                  <span className="text-[10px] text-muted-foreground tabular-nums">{i + 1}/{parcelas.length}</span>
                  <CampoMoeda valor={p.valor} onChange={v => mudar(i, { valor: v })} disabled={rodando} className="h-[22px] px-1.5 text-right text-[11px] tabular-nums" />
                  <DatePicker value={p.vencimento} onChange={v => mudar(i, { vencimento: v })} size="compact" disabled={rodando} className="h-[22px] text-[11px]" />
                  <button type="button" aria-label={`Tirar a parcela ${i + 1}`} disabled={rodando || parcelas.length <= 2}
                    onClick={() => setParcelas(ps => ps.filter((_, j) => j !== i))}
                    className="h-[22px] text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-30">×</button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <button type="button" className="underline underline-offset-2" disabled={rodando} data-testid="mais-parcela"
                onClick={() => setParcelas(ps => [...ps, { valor: null, vencimento: ps[ps.length - 1]?.vencimento ?? titulo.vencimento }])}>+ parcela</button>
              <span className={`tabular-nums ${invalidas ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="soma-parcelas"
                title={invalidas ?? undefined}>soma {formatMoeda(somaDasParcelas(parcelas))} de {formatMoeda(titulo.valor)}</span>
            </div>
          </div>
        )}
        <div>
          <label className={`text-[10px] font-medium ${faltaMotivo ? 'text-destructive' : ''}`} htmlFor="motivo-gesto">Motivo *</label>
          <Textarea id="motivo-gesto" value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} disabled={rodando}
            className={`min-h-[44px] text-[11px] ${faltaMotivo ? 'border-destructive' : ''}`} />
          <div className="h-[14px] truncate text-[10px] text-destructive" data-testid="aviso-gesto"
            title={faltaMotivo ? 'Informe o motivo.' : tentou && invalidas ? invalidas : undefined}>
            {faltaMotivo ? 'Informe o motivo.' : tentou && invalidas ? invalidas : ''}
          </div>
        </div>
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto min-w-0 truncate text-[10px] text-destructive" role="alert" title={erro} data-testid="erro-gesto">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className={BOTAO} disabled={rodando} onClick={onFechar}>Voltar</Button>
          <Button type="button" variant={gesto === 'cancelar' ? 'destructive' : 'default'} size="sm" className={BOTAO} disabled={rodando}
            onClick={confirmar} data-testid="confirmar-gesto">
            {rodando ? 'Gravando…' : TITULO[gesto]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
