import { supabase } from '@/integrations/supabase/client';
import type {
  MesaSessaoRow,
  MesaOfxValidacaoStatus,
  ParEstado,
  AprovacaoLocal,
  ResultadoCriarOuRecuperar,
} from './types';
import type { LoteExcel, ExcelLinhaNormalizada } from '@/v2/lib/excelPreview/types';
// PR6.1C-4 — guard defensivo no write path consome o helper soberano
import { validarAprovacao } from '@/v2/lib/mesa/validacao';

/**
 * PR6.1B — Hash ordem-independente do conjunto de lotes.
 * Aceita LoteExcel[] (novo upload) ou o array bruto vindo do JSON da sessão.
 */
function hashLotes(lotes: ReadonlyArray<{ loteId: string }>): string {
  return lotes
    .map((l) => l.loteId)
    .sort()
    .join('|');
}

/**
 * PR6.1B — Sessão Mesa é IMUTÁVEL em relação ao snapshot Excel.
 *
 * Cenários:
 * - Não existe sessão → INSERT, retorna { tipo: 'criada' }
 * - Existe e hash bate → retorna { tipo: 'existente_igual' } SEM UPDATE
 * - Existe e hash diverge → retorna { tipo: 'divergencia' } SEM UPDATE
 *
 * Esta função NÃO executa UPDATE em mesa_sessao em hipótese alguma.
 * UI decide o que fazer no caso de divergência (Commit 3).
 */
export async function criarOuRecuperarSessao(
  clienteId: string,
  contaBancariaId: string,
  anoMes: string,
  excelLotes: LoteExcel[],
  ofxIds: string[],
): Promise<ResultadoCriarOuRecuperar> {
  // Cast em supabase: tabelas novas do PR5 ainda não estão nos tipos gerados.
  const sb = supabase as any;

  const existRes = await sb
    .from('mesa_sessao')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('conta_bancaria_id', contaBancariaId)
    .eq('ano_mes', anoMes)
    .maybeSingle();

  if (existRes.error) throw existRes.error;

  if (existRes.data) {
    const sessao = existRes.data as MesaSessaoRow;
    const hashNovo = hashLotes(excelLotes);
    const hashExistente = hashLotes(
      (sessao.excel_lotes_json ?? []) as Array<{ loteId: string }>,
    );

    if (hashNovo === hashExistente) {
      // Mesmo conjunto de arquivos → continua sessão existente, NÃO sobrescreve.
      return { tipo: 'existente_igual', sessao };
    }

    // Conjunto diferente → operador decide via UI (não toca no banco aqui).
    return { tipo: 'divergencia', sessaoExistente: sessao, hashNovo };
  }

  // Não existe → cria nova.
  const insRes = await sb
    .from('mesa_sessao')
    .insert({
      cliente_id: clienteId,
      conta_bancaria_id: contaBancariaId,
      ano_mes: anoMes,
      excel_lotes_json: excelLotes,
      ofx_extratos_ids: ofxIds,
    })
    .select()
    .single();

  if (insRes.error) throw insRes.error;
  return { tipo: 'criada', sessao: insRes.data as MesaSessaoRow };
}

/**
 * Upsert em batch dos pares (Map → array de rows).
 * Usa UPSERT por (sessao_id, excel_key).
 */
export async function salvarPares(
  sessaoId: string,
  pares: Map<string, ParEstado>,
  aprovacoes: Map<string, AprovacaoLocal>,
  // PR6.1B-4 — defesa em profundidade contra pares órfãos. Pares cujo loteId
  // (prefixo do excel_key antes do ':') não estiver neste Set são descartados
  // silenciosamente, sem chegar ao banco. Opcional para preservar chamadores
  // legados — quando undefined, comportamento anterior é mantido.
  lotesValidos?: Set<string>,
  // PR6.1C-4 — defesa última no write path. Quando fornecido, salvarPares
  // valida cada aprovação via validarAprovacao() antes do upsert. Pares
  // 'aprovado' com aprovação inválida são revertidos SILENCIOSAMENTE a
  // 'pendente' (schema NOT NULL DEFAULT 'pendente' impede null real) e
  // aprovacao_json zerado. correcao_json é PRESERVADO em qualquer caminho.
  // Backward-compatible: undefined → não valida (preserva legado).
  linhasPorKey?: Map<string, ExcelLinhaNormalizada>,
): Promise<void> {
  if (pares.size === 0) return;
  const sb = supabase as any;

  const rows: Array<{
    sessao_id: string;
    excel_key: string;
    ofx_id_ativo: string | null;
    ofx_id_sugerido_original: string | null;
    decisao: ParEstado['decisao'];
    correcao_json: ParEstado['correcao'];
    aprovacao_json: AprovacaoLocal | null;
  }> = [];

  pares.forEach((p, key) => {
    if (lotesValidos) {
      const loteIdDoPar = key.split(':')[0];
      if (!lotesValidos.has(loteIdDoPar)) return; // par órfão — pula
    }

    let decisaoFinal: ParEstado['decisao'] = p.decisao;
    let aprovacaoFinal: AprovacaoLocal | null = aprovacoes.get(key) ?? null;

    // PR6.1C-4 — guard final: aprovação inválida reverte par pra 'pendente'
    // (semanticamente equivalente a 'desfeito', já que o schema do banco é
    // text NOT NULL DEFAULT 'pendente'). correcao_json INTACTO (A2).
    if (linhasPorKey && decisaoFinal === 'aprovado') {
      const linha = linhasPorKey.get(key);
      const v = validarAprovacao(aprovacaoFinal, linha);
      if (!v.valido) {
        console.error('[salvarPares] PR6.1C-4 reverteu par aprovado→pendente:', {
          excel_key: key,
          motivo: v.mensagem,
          camposFaltantes: v.camposFaltantes,
          aprovacao_recebida: aprovacaoFinal,
          linha_disponivel: !!linha,
        });
        decisaoFinal = 'pendente';
        aprovacaoFinal = null;
      }
    }

    rows.push({
      sessao_id: sessaoId,
      excel_key: key,
      ofx_id_ativo: p.ofxIdAtivo,
      ofx_id_sugerido_original: p.ofxIdSugeridoOriginal,
      decisao: decisaoFinal,
      correcao_json: p.correcao, // INTACTO sempre (A2 — regra absoluta)
      aprovacao_json: aprovacaoFinal,
    });
  });

  if (rows.length === 0) return;

  const res = await sb
    .from('mesa_par')
    .upsert(rows, { onConflict: 'sessao_id,excel_key' });

  if (res.error) throw res.error;
}

/**
 * Upsert das validações de OFX.
 */
export async function salvarOfxValidacoes(
  sessaoId: string,
  validacoes: Map<string, MesaOfxValidacaoStatus>,
): Promise<void> {
  if (validacoes.size === 0) return;
  const sb = supabase as any;

  const rows: Array<{ sessao_id: string; ofx_id: string; status: MesaOfxValidacaoStatus }> = [];
  validacoes.forEach((status, ofxId) => {
    rows.push({ sessao_id: sessaoId, ofx_id: ofxId, status });
  });

  const res = await sb
    .from('mesa_ofx_validacao')
    .upsert(rows, { onConflict: 'sessao_id,ofx_id' });

  if (res.error) throw res.error;
}

/**
 * Marca sessão como finalizada (D5).
 */
export async function finalizarSessao(sessaoId: string): Promise<void> {
  const sb = supabase as any;
  const res = await sb
    .from('mesa_sessao')
    .update({ status: 'finalizada' })
    .eq('id', sessaoId);
  if (res.error) throw res.error;
}

/**
 * Reabre sessão finalizada (D8).
 */
export async function reabrirSessao(sessaoId: string): Promise<void> {
  const sb = supabase as any;
  const res = await sb
    .from('mesa_sessao')
    .update({ status: 'em_andamento' })
    .eq('id', sessaoId);
  if (res.error) throw res.error;
}

/**
 * Reset total (D7): DELETE CASCADE limpa pares + validações.
 */
export async function descartarSessao(sessaoId: string): Promise<void> {
  const sb = supabase as any;
  const res = await sb.from('mesa_sessao').delete().eq('id', sessaoId);
  if (res.error) throw res.error;
}
