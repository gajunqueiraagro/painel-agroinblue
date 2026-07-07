/**
 * conciliacaoSync — sincronização do estado de conciliação bancária.
 *
 * FONTE SOBERANA de `recomputarStatusExtrato`. Antes vivia inline em
 * useConciliacaoBancariaItens.ts — movida pra cá para que o hook de edição
 * de lançamento (useFinanceiroV2) possa chamar a MESMA implementação sem
 * duplicar lógica de status.
 *
 * Regra de status (preservada literal do PR original):
 *   soma <= 0                    → 'nao_conciliado'
 *   soma + 0.005 >= |valor_ofx|  → 'conciliado'
 *   senão                        → 'parcial'
 *
 * Sem React, sem hooks, sem queryClient. Apenas supabase + lógica pura.
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * Recomputa `extrato_bancario_v2.status` a partir do somatório atual dos
 * vínculos em `conciliacao_bancaria_itens`. Idempotente.
 */
export async function recomputarStatusExtrato(extratoId: string): Promise<void> {
  const { data: extrato, error: e1 } = await supabase
    .from('extrato_bancario_v2' as any)
    .select('valor')
    .eq('id', extratoId)
    .maybeSingle();
  if (e1 || !extrato) return;
  const valorMov = Math.abs(
    Number((extrato as unknown as { valor: number }).valor) || 0,
  );

  const { data: itens } = await supabase
    .from('conciliacao_bancaria_itens' as any)
    .select('valor_aplicado')
    .eq('extrato_id', extratoId)
    .is('desfeito_em', null);   // PR-STATUS-SYNC-01: soma só vínculos vivos
  const soma = ((itens as unknown as { valor_aplicado: number }[]) ?? [])
    .reduce((s, r) => s + Math.abs(Number(r.valor_aplicado) || 0), 0);

  let novoStatus: 'nao_conciliado' | 'parcial' | 'conciliado';
  if (soma <= 0) novoStatus = 'nao_conciliado';
  else if (soma + 0.005 >= valorMov) novoStatus = 'conciliado';
  else novoStatus = 'parcial';

  await supabase
    .from('extrato_bancario_v2' as any)
    .update({ status: novoStatus })
    .eq('id', extratoId);
}

/**
 * Atualiza `valor_aplicado` de UM vínculo e recomputa o status do extrato
 * associado. Usado pelo sync do lançamento (PR4) e disponível como API
 * pública para edição manual futura.
 */
export async function atualizarValorAplicado(
  id: string,
  valor_aplicado: number,
): Promise<void> {
  const { data: row } = await supabase
    .from('conciliacao_bancaria_itens' as any)
    .select('extrato_id')
    .eq('id', id)
    .maybeSingle();
  const extratoId = (row as unknown as { extrato_id: string } | null)?.extrato_id;

  const { error } = await supabase
    .from('conciliacao_bancaria_itens' as any)
    .update({ valor_aplicado })
    .eq('id', id);
  if (error) throw error;

  if (extratoId) await recomputarStatusExtrato(extratoId);
}

/**
 * PR4 — sincroniza TODOS os vínculos de um lançamento.
 *
 * Regra: apenas vínculos cujo OFX bate EXATO (tolerância 0,01) com o novo
 * valor do lançamento são atualizados. Se não bate, vínculo permanece
 * intocado — operador decide manualmente.
 *
 * Caso Allianz: lançamento Hilux passa de R$ 1.108,37 → R$ 1.126,30.
 * OFX vinculado é -R$ 1.126,30. Antes do sync: valor_aplicado=1.108,37
 * (status='parcial' falso). Após sync: 1.126,30 (status='conciliado').
 */
export async function sincronizarVinculosDoLancamento(
  lancamentoId: string,
  lancamentoValorAbs: number,
): Promise<{ atualizados: number; ignorados: number }> {
  const { data: vinculos, error: eList } = await supabase
    .from('conciliacao_bancaria_itens' as any)
    .select('id, extrato_id, valor_aplicado')
    .eq('lancamento_id', lancamentoId)
    .is('desfeito_em', null);   // PR-STATUS-SYNC-01: nunca sincronizar vínculo morto
  if (eList) throw eList;

  const vinculosArr =
    ((vinculos as unknown as
      { id: string; extrato_id: string; valor_aplicado: number }[]) ?? []);
  if (vinculosArr.length === 0) return { atualizados: 0, ignorados: 0 };

  const extratoIds = vinculosArr.map((v) => v.extrato_id);
  const { data: extratos, error: eExt } = await supabase
    .from('extrato_bancario_v2' as any)
    .select('id, valor')
    .in('id', extratoIds);
  if (eExt) throw eExt;

  const extMap = new Map<string, number>();
  for (const e of ((extratos as unknown as
    { id: string; valor: number }[]) ?? [])) {
    extMap.set(e.id, Math.abs(Number(e.valor) || 0));
  }

  let atualizados = 0;
  let ignorados = 0;
  for (const v of vinculosArr) {
    const valorOfxAbs = extMap.get(v.extrato_id);
    if (valorOfxAbs === undefined) { ignorados++; continue; }

    // Lançamento bate exato com OFX?
    if (Math.abs(valorOfxAbs - lancamentoValorAbs) >= 0.01) {
      ignorados++;
      continue;
    }

    // Vínculo já está sincronizado?
    if (Math.abs(Number(v.valor_aplicado) - valorOfxAbs) < 0.01) {
      ignorados++;
      continue;
    }

    await atualizarValorAplicado(v.id, valorOfxAbs);
    atualizados++;
  }

  return { atualizados, ignorados };
}
