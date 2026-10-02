/**
 * "AO FORNECEDOR" — PR-CONC-ENRIQ-AGRUP-2a (religado no "⋯" do cabeçalho da Mesa, decisão do Gabriel (iii)).
 *
 * Leva a CLASSIFICAÇÃO da linha aberta (conta do plano, fazenda, safra) às outras linhas DO MESMO FORNECEDOR da sessão.
 *
 * ⚠ GRAVA SÓ A PROPOSTA (`fn_classificacao_editar_proposto`), NUNCA O LANÇAMENTO. Era `editarProposto` + `applyRow` em
 *   cada linha, sem prévia (9ea78c40): o gesto gravava 20 lançamentos sem o "Aprovar" de nenhum deles. Agora cada linha
 *   segue para a Mesa com a proposta, e quem grava é o operador.
 * ⚠ O ALVO É PELO ID DO FORNECEDOR RESOLVIDO, NUNCA PELO TEXTO: o da planilha (`planilha_favorecido_id`), senão o da
 *   proposta. O texto exibido ("TELEFONICA BRASIL S.A." × "Telefonica Brasil S.A.") juntava e separava errado.
 * ⚠ SÓ LINHA NÃO APROVADA (`aplicado = false`), e a LINHA JÁ CLASSIFICADA NÃO MUDA: no classificado o sistema prevalece
 *   (PR-CONC-MESA-CRU-EXCEL-PREVALECE-01) — ela entra na prévia só como contagem, e a marca "planilha: X" continua
 *   dizendo o que a planilha queria.
 * ⚠ PLANO ADMINISTRATIVO leva a fazenda Administrativo e NENHUMA safra (FIN-FAZENDA-ADM-01) — a mesma regra do
 *   `ajustarSeAdministrativo` da aba.
 */
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import type { ClassificacaoComEscopo } from '@/lib/financeiro/escopoDoSubcentro';
import { ehLinhaAdministrativa, fazendaAdministrativa } from '@/lib/financeiro/escopoDoSubcentro';

/** O fornecedor resolvido da linha: o da planilha (banco), senão o da proposta. `null` = não resolvido. */
export function fornecedorResolvido(r: ClassificacaoStagingPreviewRow): string | null {
  return r.planilha_favorecido_id ?? r.proposto_favorecido_id ?? null;
}

/** A linha já tem classificação no sistema — aí o sistema prevalece e o "Ao fornecedor" não a toca. */
export function jaClassificada(r: ClassificacaoStagingPreviewRow): boolean {
  return !!r.lanc_id && !!r.lanc_plano_conta_id_atual;
}

export interface PatchAoFornecedor { subcentro?: string; fazenda_id?: string; safra_id?: string | null }

export interface PreviaAoFornecedor {
  /** Por que não há o que levar (fornecedor não resolvido, linha sem conta do plano, ninguém a mudar). */
  motivo: string | null;
  alvos: Array<{ stagingId: string; patch: PatchAoFornecedor; campos: string[] }>;
  /** Linhas do mesmo fornecedor JÁ CLASSIFICADAS no sistema: ficam como estão (só a marca). */
  classificadas: number;
  /** Os campos que mudam em pelo menos uma linha, na ordem da grade. */
  campos: string[];
  /** "N linhas · campos: Plano de contas, Fazenda" — a prévia, pronta. */
  resumo: string;
}

const ORDEM_CAMPOS = ['Plano de contas', 'Fazenda', 'Safra'];

export function previaAoFornecedor(
  fonte: ClassificacaoStagingPreviewRow,
  staging: readonly ClassificacaoStagingPreviewRow[],
  opts: { classificacoes?: readonly ClassificacaoComEscopo[] | null; fazendas?: ReadonlyArray<{ id: string; nome?: string | null }> | null },
): PreviaAoFornecedor {
  const vazio = (motivo: string): PreviaAoFornecedor => ({ motivo, alvos: [], classificadas: 0, campos: [], resumo: motivo });
  const forn = fornecedorResolvido(fonte);
  if (!forn) return vazio('O fornecedor da planilha não está resolvido nesta linha.');
  const subcentro = fonte.proposto_subcentro ?? fonte.lanc_subcentro_atual ?? null;
  if (!subcentro) return vazio('Esta linha ainda não tem plano de contas para levar.');
  const adm = ehLinhaAdministrativa(opts.classificacoes, subcentro, fonte.proposto_macro ?? fonte.lanc_macro_atual);
  const fazAdm = adm ? fazendaAdministrativa(opts.fazendas) : null;
  const fazenda = fazAdm?.id ?? fonte.proposto_fazenda_id ?? fonte.lanc_fazenda_id ?? null;
  const safra = adm ? null : (fonte.proposto_safra_id ?? fonte.lanc_safra_id ?? null);

  let classificadas = 0;
  const alvos: PreviaAoFornecedor['alvos'] = [];
  for (const r of staging) {
    if (r.staging_id === fonte.staging_id || r.aplicado) continue;
    if (fornecedorResolvido(r) !== forn) continue;
    if (jaClassificada(r)) { classificadas += 1; continue; }
    const patch: PatchAoFornecedor = {};
    const campos: string[] = [];
    if ((r.proposto_subcentro ?? r.lanc_subcentro_atual ?? null) !== subcentro) { patch.subcentro = subcentro; campos.push('Plano de contas'); }
    if (fazenda && (r.proposto_fazenda_id ?? r.lanc_fazenda_id ?? null) !== fazenda) { patch.fazenda_id = fazenda; campos.push('Fazenda'); }
    if ((r.proposto_safra_id ?? r.lanc_safra_id ?? null) !== safra) { patch.safra_id = safra; campos.push('Safra'); }
    if (campos.length > 0) alvos.push({ stagingId: r.staging_id, patch, campos });
  }
  const campos = ORDEM_CAMPOS.filter((c) => alvos.some((a) => a.campos.includes(c)));
  const sufixoClass = classificadas > 0
    ? ` · ${classificadas} já classificada${classificadas === 1 ? '' : 's'} (o sistema prevalece)` : '';
  if (alvos.length === 0) {
    const motivo = `Nenhuma outra linha deste fornecedor a mudar${sufixoClass}.`;
    return { motivo, alvos, classificadas, campos, resumo: motivo };
  }
  return {
    motivo: null, alvos, classificadas, campos,
    resumo: `${alvos.length} linha${alvos.length === 1 ? '' : 's'} · campos: ${campos.join(', ')}${sufixoClass}`,
  };
}

/**
 * O GESTO: leva o patch a cada alvo pela ÚNICA porta que recebe — `editarProposto`. Não há `applyRow` no contrato, e é
 * isso que prova "grava só a proposta" por construção (o teste conta as chamadas).
 */
export async function levarAoFornecedor(
  alvos: PreviaAoFornecedor['alvos'],
  editarProposto: (p: { staging_id: string; patch: Record<string, unknown> }) => Promise<unknown>,
  aoLevar?: (stagingId: string) => void,
): Promise<{ ok: number; falhas: number }> {
  let ok = 0; let falhas = 0;
  for (const a of alvos) {
    try {
      const res = await editarProposto({ staging_id: a.stagingId, patch: { ...a.patch } });
      const recusou = typeof res === 'object' && res !== null && 'ok' in res && res.ok === false;
      if (recusou) falhas++; else { ok++; aoLevar?.(a.stagingId); }
    } catch { falhas++; }
  }
  return { ok, falhas };
}
