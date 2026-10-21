/**
 * A CASCA DOS DIÁLOGOS "DESFAZER COMPROMISSO" E "ATUALIZAR COMPROMISSO" — OC-DESFAZER-PREVISTO-01b (mock do Gabriel, 20/10 19h16).
 *
 * ⚠ MODAL FIXO DE 460x344 nos três estados (bloqueio, agendado, atualizar): mesma altura, sem rolagem, nada cresce. Cabeçalho de
 *   38px branco (título 12px semibold, a identidade da OC em 10px, o X), corpo #EEF0F3 com padding 10 e gap 8, rodapé de 38px
 *   branco (dica 10px à esquerda, botões de 24px). Blocos brancos com borda #DDE1E6, raio 6, padding 6/8. Rótulos 10px, valores 11px.
 * ⚠ LEI DE ESTABILIDADE: trocar de estado troca o miolo, nunca a caixa.
 */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { LancamentoQueTrava } from '@/lib/oc/desfazerCompromisso';

export const BLOCO_OC = 'rounded-[6px] border border-[#DDE1E6] bg-white px-2 py-1.5';
export const ROTULO_OC = 'text-[10px] leading-[13px] text-[#4B5563]';
export const VALOR_OC = 'text-[11px] leading-[14px] text-[#111827]';

const brl = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export { brl as brlOC };

export function CascaDialogoOC({ titulo, identidade, children, dica, botoes, onFechar, testid, bloqueado = false }: {
  titulo: string;
  identidade: string;
  children: ReactNode;
  dica?: ReactNode;
  botoes: ReactNode;
  onFechar: () => void;
  testid: string;
  /** Gravando: Esc, clique fora e o X ficam inertes — fechar no meio deixaria o operador sem saber se gravou. */
  bloqueado?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !bloqueado) onFechar(); }}>
      <DialogContent data-testid={testid}
        onInteractOutside={(e) => { if (bloqueado) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (bloqueado) e.preventDefault(); }}
        className={cn('grid h-[344px] w-[460px] max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] sm:max-w-[460px]',
          'grid-rows-[38px_minmax(0,1fr)_38px] gap-0 overflow-hidden rounded-lg border border-[#DDE1E6] bg-white p-0',
          '[&>button.absolute]:hidden')}>
        <div className="flex min-w-0 items-center gap-2 border-b border-[#DDE1E6] bg-white px-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[12px] font-semibold leading-[15px] text-[#111827]">{titulo}</DialogTitle>
            <DialogDescription className="break-words text-[10px] leading-[13px] text-[#4B5563]" data-testid="identidade-oc">
              {identidade}
            </DialogDescription>
          </div>
          <button type="button" aria-label="Fechar" disabled={bloqueado} onClick={onFechar}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#4B5563] hover:bg-[#EEF0F3] disabled:opacity-40">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden bg-[#EEF0F3] p-[10px]">{children}</div>
        <div className="flex min-w-0 items-center gap-2 border-t border-[#DDE1E6] bg-white px-3">
          <div className="min-w-0 flex-1 text-[10px] leading-[13px] text-[#4B5563]" data-testid="dica-oc">{dica}</div>
          {botoes}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const BOTAO = 'h-6 shrink-0 rounded px-2.5 text-[11px] font-medium disabled:cursor-not-allowed';
export function BotaoVoltarOC({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled}
    className={cn(BOTAO, 'border border-[#DDE1E6] bg-white text-[#111827] hover:bg-[#EEF0F3] disabled:opacity-50')}>Voltar</button>;
}
export function BotaoAcaoOC({ texto, onClick, disabled, tom, testid, title }: {
  texto: string; onClick: () => void; disabled?: boolean; tom: 'destrutivo' | 'navy'; testid: string; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testid} title={title}
      className={cn(BOTAO, 'text-white',
        tom === 'destrutivo' ? 'bg-[#DC2626] hover:bg-[#B91C1C] disabled:bg-[#F3B4B4]' : 'bg-[#1F3A5F] hover:bg-[#16304F] disabled:bg-[#A9B6C8]')}>
      {texto}
    </button>
  );
}

/** Recebimento (entrada) ou pagamento (saída): pelo sinal do lançamento; sem ele, pelo tipo da OC (compra paga). */
export const ehRecebimento = (sinal: string | null | undefined, tipoOperacao?: string | null) =>
  sinal != null ? String(sinal) !== '-1' : tipoOperacao !== 'compra';

/** A LINHA DO LANÇAMENTO: data · Receb. n/N · valor (à direita; verde a receber, vermelho a pagar) · selo. Uma informação por campo. */
export function LinhaDoLancamentoOC({ data, sequencia, total, valor, recebimento, selo, testid }: {
  data: string | null; sequencia: number | null; total: number | null; valor: number | null; recebimento: boolean;
  selo: 'pago' | 'pago-conciliado' | 'agendado'; testid: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid={testid}>
      <span className={cn(VALOR_OC, 'shrink-0 whitespace-nowrap tabular-nums')}>{dataBr(data)}</span>
      <span className={cn(ROTULO_OC, 'shrink-0 whitespace-nowrap')}>
        {recebimento ? 'Receb.' : 'Pag.'} {sequencia ?? '—'}/{total ?? '—'}
      </span>
      <span className={cn('min-w-0 flex-1 whitespace-nowrap text-right text-[11px] font-semibold tabular-nums',
        recebimento ? 'text-[#047857]' : 'text-[#B91C1C]')}>{brl(valor)}</span>
      <span className={cn('shrink-0 whitespace-nowrap rounded-full border px-1.5 text-[10px] leading-[15px]',
        selo === 'agendado' ? 'border-[#EFD08A] bg-[#FFF8E6] text-[#92400E]' : 'border-[#BBE5CF] bg-[#ECFDF5] text-[#047857]')}
        data-testid={`${testid}-selo`}>
        {selo === 'agendado' ? 'Agendado' : selo === 'pago-conciliado' ? 'Realizado · conciliado' : 'Realizado'}
      </span>
    </div>
  );
}

/** ESTADO 1 — o bloqueio por realizado ou conciliado: a frase, a linha de quem trava e o caminho ("Abrir lançamento"). */
export function FaixaBloqueioOC({ trava, frase, recebimento, onAbrirLancamento }: {
  trava: LancamentoQueTrava | null; frase: string; recebimento: boolean; onAbrirLancamento: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[6px] border border-[#F0B9B9] bg-[#FDF2F2] px-2 py-1.5" data-testid="faixa-bloqueio">
      <div className="text-[11px] font-semibold leading-[14px] text-[#991B1B]">
        Não dá para desfazer: há um {recebimento ? 'recebimento' : 'pagamento'} já pago.
      </div>
      {trava ? (
        <div className={BLOCO_OC}>
          <LinhaDoLancamentoOC testid="linha-que-trava" data={trava.data} sequencia={trava.sequencia} total={trava.total}
            valor={trava.valor} recebimento={recebimento} selo={trava.conciliado ? 'pago-conciliado' : 'pago'} />
        </div>
      ) : (
        <div className="break-words text-[10px] leading-[13px] text-[#991B1B]" data-testid="frase-do-banco">{frase}</div>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 break-words text-[10px] leading-[13px] text-[#7F1D1D]">
          Desfaça o pagamento no lançamento; depois o compromisso pode ser desfeito.
        </span>
        {trava && (
          <button type="button" data-testid="abrir-lancamento-que-trava" onClick={() => onAbrirLancamento(trava.lancamentoId)}
            className="h-6 shrink-0 rounded border border-[#F0B9B9] bg-white px-2 text-[11px] font-medium text-[#991B1B] hover:bg-[#FEE2E2]">
            Abrir lançamento
          </button>
        )}
      </div>
    </div>
  );
}

/** ESTADO 2 — agendado: a faixa âmbar e a confirmação explícita. */
export function FaixaAgendadoOC({ confirmado, onConfirmar }: { confirmado: boolean; onConfirmar: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1 rounded-[6px] border border-[#EFD08A] bg-[#FFF8E6] px-2 py-1.5" data-testid="faixa-agendado">
      <div className="text-[11px] font-semibold leading-[14px] text-[#92400E]">Este lançamento está agendado no banco.</div>
      <div className="text-[10px] leading-[13px] text-[#92400E]">Cancelar aqui não cancela o agendamento no banco; confira lá também.</div>
      <label className="flex items-center gap-1.5 text-[11px] leading-[14px] text-[#111827]">
        <Checkbox checked={confirmado} onCheckedChange={(v) => onConfirmar(v === true)}
          className="h-3.5 w-3.5 border-[#92400E] data-[state=checked]:bg-[#92400E]" data-testid="confirmar-agendado" />
        Confirmo o cancelamento do lançamento agendado
      </label>
    </div>
  );
}

/** O motivo em uma linha (24px) e a legenda de que fica guardado. Sugerido (o motivo da reabertura, intocado) fica em âmbar. */
export function CampoMotivoOC({ motivo, onMotivo, sugerido = false, disabled, placeholder, testid }: {
  motivo: string; onMotivo: (m: string) => void; sugerido?: boolean; disabled?: boolean; placeholder: string; testid: string;
}) {
  return (
    <div className={cn(BLOCO_OC, 'flex flex-col gap-1')}>
      <div className="flex min-w-0 items-baseline gap-2">
        <label className={ROTULO_OC} htmlFor={testid}>motivo *</label>
        {sugerido && (
          <span className="text-[10px] leading-[13px] text-amber-800" data-testid="motivo-sugerido">motivo da reabertura, confira ou troque</span>
        )}
      </div>
      <input id={testid} value={motivo} onChange={(e) => onMotivo(e.target.value)} disabled={disabled} placeholder={placeholder}
        data-testid={testid}
        className={cn('h-6 w-full rounded border px-2 text-[11px] text-[#111827] outline-none focus:border-[#1F3A5F]',
          sugerido ? 'border-amber-300 bg-amber-50' : 'border-[#DDE1E6] bg-white')} />
      <span className="text-[10px] leading-[13px] text-[#4B5563]" data-testid="legenda-motivo">
        Fica guardado enquanto a OC estiver aberta; não precisa digitar de novo.
      </span>
    </div>
  );
}
