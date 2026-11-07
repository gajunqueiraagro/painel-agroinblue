import { AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SnapshotStatusValue } from '@/hooks/useSnapshotStatus';

/**
 * O aviso de governança do snapshot (invalidado · cadeia quebrada) — REVALIDAR-BG-SET26 (Gabriel 05/11).
 *
 * ⚠ É UMA FAIXA DE 22px, NUNCA UM BLOCO: o aviso antigo (2 linhas, ~44px) morava no corpo, entre a faixa do topo e a tabela, e empurrava
 *   tabela e gráficos para baixo ao trocar de mês. Agora ele é um ESTADO da faixa que a tela já reserva (a do "Mês aberto: …"): a altura
 *   é sempre a mesma; muda a cor, o texto e o botão.
 * ⚠ O BOTÃO NUNCA FICA MUDO: `onRevalidar` grava (quem chama passa o gravador de verdade, o "Salvar e Fechar"); sem poder, `motivo` diz o
 *   porquê ao lado e o botão fica desabilitado com o mesmo texto no `title`.
 */
interface Props {
  status: SnapshotStatusValue;
  /** "Set/2026" */
  mesLabel: string;
  onRevalidar?: () => void;
  onIrMesAnterior?: () => void;
  /** por que não dá para revalidar agora (nulo = pode) */
  motivo?: string | null;
  revalidando?: boolean;
  /** "+N mês(es) afetado(s)" — no Painel, que mostra o primeiro mês comprometido do ano */
  outros?: number;
}

export function FaixaDoSnapshot({ status, mesLabel, onRevalidar, onIrMesAnterior, motivo, revalidando, outros }: Props) {
  if (status !== 'invalidado' && status !== 'cadeia_quebrada') return null;
  const invalidado = status === 'invalidado';
  const cor = invalidado
    ? { bg: 'rgba(245,158,11,0.10)', borda: 'rgba(245,158,11,0.30)', texto: 'text-amber-700' }
    : { bg: 'hsl(var(--destructive) / 0.08)', borda: 'hsl(var(--destructive) / 0.35)', texto: 'text-destructive' };
  const frase = invalidado
    ? `Snapshot invalidado — ${mesLabel} · o rebanho mudou depois da validação; dados não oficiais até revalidar.`
    : `Cadeia quebrada — ${mesLabel} · um mês anterior foi reaberto; reconcilie em ordem antes de usar este mês.`;
  return (
    <div data-testid="faixa-snapshot" data-status={status}
      className={`flex items-center gap-1.5 rounded border px-2 ${cor.texto}`}
      style={{ height: 22, fontSize: 9, backgroundColor: cor.bg, borderColor: cor.borda }}>
      {invalidado ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <ShieldAlert className="h-3 w-3 shrink-0" />}
      <span className="min-w-0 flex-1 truncate" title={frase}>
        {frase}{outros && outros > 0 ? ` · +${outros} mês(es) afetado(s)` : ''}
      </span>
      {invalidado && onRevalidar && (
        <>
          {motivo && <span className="shrink-0 truncate text-[10px] text-muted-foreground" style={{ maxWidth: 260 }} title={motivo} data-testid="faixa-snapshot-motivo">{motivo}</span>}
          <Button variant="outline" size="sm" onClick={onRevalidar} disabled={!!motivo || revalidando} title={motivo ?? undefined}
            data-testid="faixa-snapshot-revalidar"
            className="h-[16px] shrink-0 border-amber-500/50 px-1.5 !text-[9px] text-amber-700 hover:bg-amber-500/10">
            <RefreshCw className="mr-1 h-2.5 w-2.5" />
            {revalidando ? 'Revalidando…' : 'Revalidar'}
          </Button>
        </>
      )}
      {!invalidado && onIrMesAnterior && (
        <Button variant="outline" size="sm" onClick={onIrMesAnterior} data-testid="faixa-snapshot-resolver"
          className="h-[16px] shrink-0 border-destructive/50 px-1.5 !text-[9px] text-destructive hover:bg-destructive/10">
          Resolver
        </Button>
      )}
    </div>
  );
}
