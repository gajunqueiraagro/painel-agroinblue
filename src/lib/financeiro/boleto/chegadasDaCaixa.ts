/**
 * CAIXA-ATUALIZAR-01 (Gabriel 27/11 16:52) — o que a Caixa de entrada diz sobre a CHEGADA de e-mail, puro:
 *   · "última chegada: dd/mm hh:mm" = o e-mail mais novo que chegou (o arrastado não conta: ninguém o "recebeu");
 *   · "N novo(s) e-mail(s) · agora" = quantos E-MAILS (mensagens, não anexos) apareceram desde a última leitura da lista.
 * A Caixa relê sozinha enquanto está aberta (a cada 30 s, pela pergunta barata "quando chegou o último?") e pelo botão "↻ Atualizar".
 * ⚠ NADA DE GMAIL/IMAP: só o que o endereço da caixa já recebeu (nunca senha nem acesso à caixa de e-mail do cliente).
 */
import type { EntradaDoEmail } from './entradaEmailApi';

const doEmail = (e: EntradaDoEmail) => e.origem !== 'arrastado';

/** O recebimento mais novo ('AAAA-MM-DDThh:mm…'), ou null sem e-mail. */
export function ultimaChegada(entradas: readonly EntradaDoEmail[]): string | null {
  const xs = entradas.filter(doEmail).flatMap((e) => (e.recebidoEm ? [e.recebidoEm] : [])).sort();
  return xs.length ? xs[xs.length - 1] : null;
}

/** Quantos e-mails (mensagens distintas) entraram na lista nova que não estavam na anterior (pelas linhas). */
export function novosEmails(antes: ReadonlySet<string>, depois: readonly EntradaDoEmail[]): number {
  return new Set(depois.filter((e) => doEmail(e) && !antes.has(e.id)).map((e) => e.mensagemId)).size;
}

/** 'dd/mm hh:mm' na hora local, ou '—'. */
export function dataHoraCurta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** O texto do lugar fixo do cabeçalho: o aviso de novo (por 60 s) ou a última chegada. */
export function textoDaChegada(aviso: { n: number; em: number } | null, agora: number, ultima: string | null): string {
  if (aviso && agora - aviso.em < 60_000) return `${aviso.n} ${aviso.n === 1 ? 'novo e-mail' : 'novos e-mails'} · agora`;
  return `última chegada: ${dataHoraCurta(ultima)}`;
}
