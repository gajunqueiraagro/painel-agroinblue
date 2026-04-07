export const TIPO_OPERACAO_TRANSFERENCIA = '3-Transferência';

type StatusTransacaoNormalizada = 'previsto' | 'agendado' | 'confirmado' | 'realizado';

const STATUS_TRANSACAO_VALIDOS = new Set<StatusTransacaoNormalizada>([
  'previsto',
  'agendado',
  'programado',
  'realizado',
]);

export function isTransferenciaTipo(tipoOperacao?: string | null): boolean {
  return (tipoOperacao || '').trim() === TIPO_OPERACAO_TRANSFERENCIA;
}

export function normalizeStatusTransacao(status?: string | null): StatusTransacaoNormalizada {
  const normalized = (status || '').trim().toLowerCase() as StatusTransacaoNormalizada;
  return STATUS_TRANSACAO_VALIDOS.has(normalized) ? normalized : 'previsto';
}

export function validateTransferenciaAccounts(contaOrigemId?: string | null, contaDestinoId?: string | null) {
  const origem = (contaOrigemId || '').trim();
  const destino = (contaDestinoId || '').trim();

  if (!origem || !destino) {
    return { valid: false as const, code: 'missing' as const };
  }

  if (origem === destino) {
    return { valid: false as const, code: 'same' as const };
  }

  return { valid: true as const, code: null };
}
