export const TIPO_OPERACAO_TRANSFERENCIA = '3-Transferência';

type StatusTransacaoNormalizada = 'meta' | 'agendado' | 'programado' | 'realizado';

const STATUS_TRANSACAO_VALIDOS = new Set<StatusTransacaoNormalizada>([
  'meta',
  'agendado',
  'programado',
  'realizado',
]);

export function isTransferenciaTipo(tipoOperacao?: string | null): boolean {
  return (tipoOperacao || '').trim() === TIPO_OPERACAO_TRANSFERENCIA;
}

export function normalizeStatusTransacao(status?: string | null): StatusTransacaoNormalizada {
  const raw = (status || '').trim().toLowerCase();
  if (raw === 'previsto') return 'meta'; // backward compat
  if (raw === 'conciliado') return 'realizado'; // backward compat
  if (raw === 'confirmado') return 'programado'; // backward compat
  const normalized = raw as StatusTransacaoNormalizada;
  return STATUS_TRANSACAO_VALIDOS.has(normalized) ? normalized : 'meta';
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
