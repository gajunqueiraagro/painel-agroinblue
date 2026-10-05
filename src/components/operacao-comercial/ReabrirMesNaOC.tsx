/**
 * "REABRIR MÊS…" DE DENTRO DA OPERAÇÃO COMERCIAL — ACESSOS-OC-02 (M9, decisão do Gabriel de 05/10/2026).
 *
 * Reabrir o período é gesto do FECHAMENTO do rebanho. Os três modais da OC (compra, venda, abate) o oferecem ao lado do aviso de
 * mês fechado; quem não tem a tela do fechamento vê o gesto APAGADO com o motivo (gesto fica apagado com motivo, nunca some).
 * ⚠ QUEM DECIDE É O DONO DO ACESSO (`usePodeAbrir('fechamento')`, em cima de `nivelDaTela`): nenhum `if` de perfil aqui nem nos
 *   modais. Para o admin e para quem tem o fechamento, o controle de sempre, com a MESMA marcação de cada modal.
 */
import { Button } from '@/components/ui/button';
import { usePodeAbrir } from '@/v2/hooks/usePodeAbrir';

export const MOTIVO_REABRIR_SEM_FECHAMENTO = 'só quem fecha o mês pode reabrir';

export function ReabrirMesNaOC({ forma, onAbrir }: {
  /** 'botao' = o do Abate; 'link' = o sublinhado da Venda e da Compra. A forma é a que cada modal já tinha. */
  forma: 'botao' | 'link';
  onAbrir: () => void;
}) {
  const podeReabrir = usePodeAbrir('fechamento');
  if (forma === 'botao') {
    return (
      <>
        {!podeReabrir && <span className="shrink-0 text-[10px]" data-testid="reabrir-mes-motivo">{MOTIVO_REABRIR_SEM_FECHAMENTO}</span>}
        <Button type="button" variant="outline" size="sm" data-testid="reabrir-mes"
          className="h-6 shrink-0 text-[10px]" disabled={!podeReabrir}
          title={podeReabrir ? undefined : MOTIVO_REABRIR_SEM_FECHAMENTO}
          onClick={podeReabrir ? onAbrir : undefined}>
          Reabrir mês…
        </Button>
      </>
    );
  }
  return (
    <>
      <button type="button" data-testid="reabrir-mes"
        className={podeReabrir ? 'underline underline-offset-2' : 'cursor-not-allowed opacity-50'}
        disabled={!podeReabrir} title={podeReabrir ? undefined : MOTIVO_REABRIR_SEM_FECHAMENTO}
        onClick={podeReabrir ? onAbrir : undefined}>Reabrir mês…</button>
      {!podeReabrir && <> <span data-testid="reabrir-mes-motivo">· {MOTIVO_REABRIR_SEM_FECHAMENTO}</span></>}
    </>
  );
}
