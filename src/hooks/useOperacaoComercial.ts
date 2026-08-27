import { supabase } from '@/integrations/supabase/client';

// Envelope de retorno das RPCs oc_* (motor transacional PR-OC-02). O React apenas
// coleta dados, envia payload, interpreta este retorno e atualiza a UI — nenhuma
// regra de negócio vive aqui; tudo permanece no banco. Toda escrita OC passa
// EXCLUSIVAMENTE por estas RPCs (proibido escrever direto nas tabelas zoo_*).
// status_comercial vigente: 'programada' | 'fechada' | 'cancelada' (o texto real vem do
// banco). `rascunho` é FLAG técnica separada do status. `rascunho` e `valor_total` só vêm
// no envelope de oc_salvar_rascunho; `status_financeiro` só em oc_sincronizar — por isso
// opcionais no envelope compartilhado pelas 6 RPCs.
export interface OcEnvelope {
  ok: boolean;
  operacao_id: string;
  versao: number;
  status_comercial: string;
  rascunho?: boolean;
  valor_total?: number | null;
  status_financeiro?: string;
  idempotente?: boolean;
  multi_fazenda?: boolean;
  motivo?: string;
}

// Uma parte da composição financeira. componente = codigo do catálogo global
// (zoo_componentes_financeiros) — identidade estável. sequencia_parcela e
// quantidade_parcelas NÃO são enviadas: o motor (PR-OC-04A) as computa por
// componente no servidor. Idem valor_bruto/descontos/acrescimos/valor_total, que
// são DERIVADOS das partes na RPC — o frontend não envia resumos.
export interface OcPartePayload {
  natureza: 'principal' | 'deducao' | 'acrescimo';
  componente: string;
  valor: number;
  data_vencimento?: string | null;
  descricao?: string | null;
  incluso_no_total?: boolean;
  plano_conta_id?: string | null;
  macro_custo?: string | null;
  grupo_custo?: string | null;
  centro_custo?: string | null;
  subcentro?: string | null;
}

// Payload da RPC soberana oc_salvar_rascunho (upsert) no contrato vigente (§3 do UX-03A).
// Chaves omitidas preservam o valor no banco (padrão 02A): o modal envia só o que coleta;
// os 7 campos de abate (02B) NÃO entram aqui (UX-03B). Responsável é resolvido no servidor
// (snapshot); resumos e seq/qtd são derivados no motor.
export interface OcRascunhoPayload {
  tipo_operacao: 'compra' | 'venda' | 'abate';
  data_operacao: string;
  cenario: 'realizado' | 'meta';
  fazenda_id?: string | null;
  contraparte_id?: string | null;
  qtd_negociada?: number | null;
  categoria_negociada?: string | null;
  peso_medio_negociado_kg?: number | null;
  peso_total_negociado_kg?: number | null;
  peso_negociado_soberano?: 'medio' | 'total' | null;
  tipo_precificacao?: string | null;
  preco_unitario?: number | null;
  condicao_pagamento?: string | null;
  data_pagamento_prevista?: string | null;
  valor_estimado?: number | null;
  valor_acordado?: number | null;
  numero_documento?: string | null;
  observacoes?: string | null;
  // Lote (Ordem de Compra): uma ou mais movimentações. Consideradas só na criação.
  movimentacoes: string[];
  partes: OcPartePayload[];
}

// Estado completo de uma operação existente (modo edição) — leitura direta (RLS
// isola por cliente). Nenhuma escrita aqui.
export interface OcOperacaoRow {
  id: string;
  cliente_id: string;
  tipo_operacao: string;
  data_operacao: string;
  // Hidratação do cabeçalho ao abrir operação existente (PR-OC-COMPRA-OPEN-01).
  // `select('*')` já traz ambos do banco; aqui só os tipamos (compatíveis com o schema).
  fazenda_id: string | null;
  numero_documento: string | null;
  responsavel: string | null;
  // Snapshot soberano do nome do responsável (server-side; resolver_nome_usuario).
  // Leitura derivada — o modal exibe read-only; NUNCA é enviado no payload.
  responsavel_nome_snapshot: string | null;
  cenario: string;
  contraparte_id: string | null;
  tipo_precificacao: string | null;
  preco_unitario: number | null;
  condicao_pagamento: string | null;
  data_pagamento_prevista: string | null;
  valor_bruto: number | null;
  descontos: number | null;
  acrescimos: number | null;
  valor_total: number | null;
  observacoes: string | null;
  status_comercial: string;
  status_financeiro: string;
  // PR-OC-EDIT-01B — rascunho TÉCNICO (cadastro incompleto). `select('*')` já o traz; usado no
  //   gate do "Confirmar" (o backend permanece soberano com sua própria validação).
  rascunho: boolean;
  // PR-HOTFIX-P0 — entrega_encerrada soberana (coluna NOT NULL; `select('*')` já a traz). Hidrata o
  //   estado do Recebimento ao abrir operação existente (habilita o botão "Reabrir recebimento").
  entrega_encerrada: boolean;
  versao: number;
}

export interface OcEstado {
  operacao: OcOperacaoRow;
  partes: Record<string, unknown>[];
  movimentacoes: Record<string, unknown>[];
  eventos: Record<string, unknown>[];
  /** Quantos titulos financeiros estao REALMENTE vivos. Resolvido em
      `carregarOperacao` cruzando as partes com `financeiro_lancamentos_v2`.
      ⚠ NAO derivar isto de `partes` no consumidor: a parte guarda o vinculo, nao
      o estado do lancamento. Ver o comentario da resolucao. */
  titulosAtivos: number;
}

// (supabase as any).rpc é o idioma vigente para RPCs ainda não presentes em types.ts.
async function callRpc(fn: string, args: Record<string, unknown>): Promise<OcEnvelope> {
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message || 'Falha na operação comercial.');
  return data;
}

export function useOperacaoComercial() {
  // RPC soberana única: p_operacao_id NULL => cria (versao NULL); preenchido =>
  // atualiza (exige rascunho + versao). Substitui criar/editar/alterar-parcelas.
  const salvarRascunho = (
    operacaoId: string | null, clienteId: string, versaoEsperada: number | null, payload: OcRascunhoPayload,
  ) =>
    callRpc('oc_salvar_rascunho', {
      p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versaoEsperada, p_payload: payload,
    });

  const reabrir = (operacaoId: string, clienteId: string, versaoEsperada: number, motivo: string) =>
    callRpc('oc_reabrir', {
      p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versaoEsperada, p_motivo: motivo,
    });

  const confirmar = (operacaoId: string, clienteId: string, versaoEsperada: number) =>
    callRpc('oc_confirmar', {
      p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versaoEsperada,
    });

  const sincronizar = (operacaoId: string, clienteId: string, versaoEsperada: number) =>
    callRpc('oc_sincronizar', {
      p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versaoEsperada,
    });

  const cancelar = (operacaoId: string, clienteId: string, versaoEsperada: number, motivo: string) =>
    callRpc('oc_cancelar', {
      p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versaoEsperada, p_motivo: motivo,
    });

  // Leitura do estado completo (modo edição). Somente SELECT; RLS isola por cliente.
  // (supabase as any).from — mesmo idioma do .rpc: as tabelas zoo_operacao_* ainda
  // não estão no types.ts gerado.
  const carregarOperacao = async (operacaoId: string, clienteId: string): Promise<OcEstado | null> => {
    const { data: operacao, error: eOp } = await (supabase as any)
      .from('zoo_operacoes_comerciais').select('*')
      .eq('id', operacaoId).eq('cliente_id', clienteId).maybeSingle();
    if (eOp) throw new Error(eOp.message);
    if (!operacao) return null;
    const [pr, mv, ev] = await Promise.all([
      (supabase as any).from('zoo_operacao_partes').select('*').eq('operacao_id', operacaoId).order('created_at'),
      (supabase as any).from('zoo_operacao_movimentacoes').select('*').eq('operacao_id', operacaoId).order('created_at'),
      (supabase as any).from('zoo_operacao_eventos').select('*').eq('operacao_id', operacaoId).order('created_at'),
    ]);
    /* TITULO VIVO = parte ativa CUJO LANCAMENTO tambem esta vivo.
       `zoo_operacao_partes` guarda o vinculo (`financeiro_lancamento_id`) e o
       cancelamento DA PARTE, mas nao sabe se o LANCAMENTO foi cancelado. Quem
       olhasse so a parte concluiria que ha titulo onde nao ha — e a UI trancaria
       a operacao inteira contra um titulo que nao existe mais.
       Medido no proto em 27/08/2026: 4 operacoes nesse estado, 13 partes ativas
       apontando para lancamentos cancelados. Cruzando as 29 operacoes existentes
       com a `vw_oc_titulos_liquidacao`, que ja filtra certo, a derivacao antiga
       divergia em exatamente essas 4 e concordava nas outras 25.

       ⚠⚠ FAIL-CLOSED, e nao e detalhe de implementacao. Na duvida, o titulo
       conta como ATIVO:
         - erro na consulta      -> todos os ids contam como ativos;
         - id que NAO volta      -> conta como ativo (RLS pode te-lo ocultado);
         - so conta como inativo o que voltou com `cancelado === true`.
       Sem isso, uma policy de RLS restritiva DESTRAVARIA a edicao de operacoes
       com titulo legitimo — que e' exatamente a dupla verdade de pagamento que o
       ADR-2026-18 §10 registra. Falhar para o lado de trancar demais e'
       recuperavel; falhar para o lado de abrir nao e'. */
    const partes = pr.data ?? [];
    const idsTitulo: string[] = partes
      .filter((p: Record<string, unknown>) => p.cancelada !== true && !!p.financeiro_lancamento_id)
      .map((p: Record<string, unknown>) => String(p.financeiro_lancamento_id));

    let titulosAtivos = 0;
    if (idsTitulo.length > 0) {
      const { data: lancs, error: eLanc } = await (supabase as any)
        .from('financeiro_lancamentos_v2').select('id, cancelado').in('id', idsTitulo);
      if (eLanc || !lancs) {
        titulosAtivos = idsTitulo.length;
      } else {
        const cancelados = new Set(
          (lancs as Array<{ id: string; cancelado: boolean }>)
            .filter(l => l.cancelado === true)
            .map(l => String(l.id)),
        );
        titulosAtivos = idsTitulo.filter(id => !cancelados.has(id)).length;
      }
    }

    return {
      operacao,
      partes,
      movimentacoes: mv.data ?? [],
      eventos: ev.data ?? [],
      titulosAtivos,
    };
  };

  return { salvarRascunho, reabrir, confirmar, sincronizar, cancelar, carregarOperacao };
}
