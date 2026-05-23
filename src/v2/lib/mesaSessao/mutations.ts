import { supabase } from '@/integrations/supabase/client';
import type {
  MesaSessaoRow,
  MesaOfxValidacaoStatus,
  ParEstado,
  AprovacaoLocal,
} from './types';
import type { LoteExcel } from '@/v2/lib/excelPreview/types';

/**
 * Cria nova sessão (idempotente via UNIQUE constraint).
 * Retorna a sessão criada OU a existente (com snapshot Excel atualizado).
 */
export async function criarOuRecuperarSessao(
  clienteId: string,
  contaBancariaId: string,
  anoMes: string,
  excelLotes: LoteExcel[],
  ofxIds: string[],
): Promise<MesaSessaoRow> {
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
    // Atualiza snapshot Excel + OFX se houve nova importação
    const updRes = await sb
      .from('mesa_sessao')
      .update({
        excel_lotes_json: excelLotes,
        ofx_extratos_ids: ofxIds,
      })
      .eq('id', existRes.data.id)
      .select()
      .single();
    if (updRes.error) throw updRes.error;
    return updRes.data as MesaSessaoRow;
  }

  // Cria nova
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
  return insRes.data as MesaSessaoRow;
}

/**
 * Upsert em batch dos pares (Map → array de rows).
 * Usa UPSERT por (sessao_id, excel_key).
 */
export async function salvarPares(
  sessaoId: string,
  pares: Map<string, ParEstado>,
  aprovacoes: Map<string, AprovacaoLocal>,
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
    rows.push({
      sessao_id: sessaoId,
      excel_key: key,
      ofx_id_ativo: p.ofxIdAtivo,
      ofx_id_sugerido_original: p.ofxIdSugeridoOriginal,
      decisao: p.decisao,
      correcao_json: p.correcao,
      aprovacao_json: aprovacoes.get(key) ?? null,
    });
  });

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
