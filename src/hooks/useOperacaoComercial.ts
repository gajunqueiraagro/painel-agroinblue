import { supabase } from '@/integrations/supabase/client';

// Envelope de retorno das RPCs oc_* (motor transacional PR-OC-02). O React apenas
// coleta dados, envia payload, interpreta este retorno e atualiza a UI — nenhuma
// regra de negócio vive aqui; tudo permanece no banco.
export interface OcEnvelope {
  ok: boolean;
  operacao_id: string;
  versao: number;
  status_comercial: string;
  status_financeiro: string;
  idempotente?: boolean;
  multi_fazenda?: boolean;
  motivo?: string;
}

export interface OcPartePayload {
  natureza: 'principal' | 'deducao' | 'acrescimo';
  componente?: string;
  sequencia_parcela?: number;
  quantidade_parcelas?: number;
  valor: number;
  data_vencimento?: string | null;
  descricao?: string | null;
}

export interface OcRascunhoPayload {
  tipo_operacao: 'compra' | 'venda' | 'abate';
  data_operacao: string;
  contraparte_id?: string | null;
  tipo_precificacao?: string | null;
  condicao_pagamento?: string | null;
  data_pagamento_prevista?: string | null;
  valor_total?: number | null;
  // Forward-compat: identificador da NF (documento da operação). A RPC atual IGNORA
  // esta chave (ainda não há coluna) e a NF NÃO é persistida neste MVP — quando a
  // coluna numero_nf existir em zoo_operacoes_comerciais, basta a RPC passar a lê-la,
  // sem alterar o frontend. Não misturar com observacoes (texto livre).
  numero_nf?: string | null;
  observacoes?: string | null;
  // Lote (Ordem de Compra): uma ou mais movimentações. Nesta etapa o modal envia
  // um único lote — a estrutura de lotes será formalizada depois sem quebrar isto.
  movimentacoes: string[];
  partes: OcPartePayload[];
}

// (supabase as any).rpc é o idioma vigente para RPCs ainda não presentes em types.ts.
async function callRpc(fn: string, args: Record<string, unknown>): Promise<OcEnvelope> {
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message || 'Falha na operação comercial.');
  return data;
}

export function useOperacaoComercial() {
  const criarRascunho = (clienteId: string, payload: OcRascunhoPayload) =>
    callRpc('oc_criar_rascunho', { p_cliente_id: clienteId, p_payload: payload });

  const confirmar = (operacaoId: string, clienteId: string, versaoEsperada: number) =>
    callRpc('oc_confirmar', {
      p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versaoEsperada,
    });

  const sincronizar = (operacaoId: string, clienteId: string, versaoEsperada: number) =>
    callRpc('oc_sincronizar', {
      p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versaoEsperada,
    });

  return { criarRascunho, confirmar, sincronizar };
}
