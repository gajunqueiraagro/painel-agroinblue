/**
 * Documentos anexados ANTES de o lançamento existir — FIN-NFE-PARCELAS-01, PR 1.
 *
 * No "Novo lançamento" a aba Documentos passa a aceitar documentos antes do salvar. Eles ficam
 * em memória (`DocumentoPendente`) e só vão ao banco depois que o lançamento nasce, pela MESMA
 * cadeia que a aba sempre usou: `fin_documento_registrar` -> upload no `fin-documentos` ->
 * `fin_documento_editar` com o arquivo. Nenhuma RPC muda, nenhum payload muda — o registro sai
 * de `paraJson`, o caminho de `caminhoDocumentoLancamento`, os dois do hook.
 *
 * ⚠ NÃO É TRANSACIONAL, e não tem como ser: o storage não entra em transação. O lançamento já
 * está gravado quando a cadeia começa; se ela falhar, o lançamento FICA e o que faltou volta
 * para a tela com "Tentar de novo". Por isso cada pendente guarda até onde chegou
 * (`documentoId`): tentar de novo não registra o documento duas vezes.
 * ⚠ NADA DE ARQUIVO ÓRFÃO: se o arquivo subiu e o `fin_documento_editar` recusou, o arquivo é
 * APAGADO antes de devolver o erro. Um arquivo no bucket sem linha apontando para ele é lixo
 * que ninguém acha; um documento "sem arquivo" aparece na lista e se conserta.
 * ⚠ SÓ A ORIGEM LANÇAMENTO: um lançamento recém-criado nunca tem parte de OC, então o destino
 * `oc-documentos` não existe aqui.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  paraJson, caminhoDocumentoLancamento, BUCKET_LANCAMENTO_DOCUMENTOS, TAMANHO_MAXIMO, TIPOS_ACEITOS,
  type LancDocPayload,
} from '@/hooks/useLancamentoDocumentos';
import { extensaoDoArquivo } from '@/lib/oc/caminhoDocumento';

export interface DocumentoPendente {
  /** Identidade local, só para a lista da tela. */
  chave: string;
  payload: LancDocPayload;
  arquivo: File | null;
  /** Preenchido quando o `fin_documento_registrar` já passou — a nova tentativa não registra de novo. */
  documentoId: string | null;
  gravado: boolean;
  erro: string | null;
}

let seq = 0;
export function novoPendente(payload: LancDocPayload, arquivo: File | null): DocumentoPendente {
  seq += 1;
  return { chave: `pendente-${Date.now()}-${seq}`, payload, arquivo, documentoId: null, gravado: false, erro: null };
}

/** A mesma recusa do `anexar` do hook, dita ANTES — o arquivo errado não espera o salvar para falhar. */
export function motivoArquivoRecusado(file: File): string | null {
  if (!extensaoDoArquivo(file) || !TIPOS_ACEITOS.includes(file.type)) return 'Formato não aceito. Envie PDF, JPG ou PNG.';
  if (file.size > TAMANHO_MAXIMO) return 'Arquivo acima de 10 MB.';
  return null;
}

function mensagem(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) return e.message;
  return 'Falha ao gravar o documento.';
}

/** Um pendente: registra (se ainda não), sobe o arquivo e anexa. Devolve o pendente atualizado; nunca lança. */
async function gravarUm(clienteId: string, lancamentoId: string, p: DocumentoPendente): Promise<DocumentoPendente> {
  if (p.gravado) return p;
  let documentoId = p.documentoId;
  try {
    if (!documentoId) {
      const { data, error } = await supabase.rpc('fin_documento_registrar', {
        p_lancamento_id: lancamentoId, p_cliente_id: clienteId,
        p_payload: { ...paraJson(p.payload), especie: p.payload.especie ?? 'outro' },
      });
      if (error) throw error;
      const id = data && typeof data === 'object' && !Array.isArray(data) ? data.documento_id : null;
      if (!id) throw new Error('O banco não devolveu o documento registrado.');
      documentoId = String(id);
    }
    if (p.arquivo) {
      const recusa = motivoArquivoRecusado(p.arquivo);
      if (recusa) throw new Error(recusa);
      const ext = extensaoDoArquivo(p.arquivo) ?? '';
      const caminho = caminhoDocumentoLancamento(clienteId, lancamentoId, documentoId, ext);
      const up = await supabase.storage.from(BUCKET_LANCAMENTO_DOCUMENTOS).upload(caminho, p.arquivo, { upsert: false });
      if (up.error) throw up.error;
      /* Versão 1: o documento acabou de nascer, e o anexo nunca passou (senão estaria `gravado`). */
      const { error } = await supabase.rpc('fin_documento_editar', {
        p_documento_id: documentoId, p_cliente_id: clienteId, p_versao_esperada: 1,
        p_payload: { url: caminho, tipo: p.arquivo.type, tamanho_bytes: p.arquivo.size },
      });
      if (error) {
        await supabase.storage.from(BUCKET_LANCAMENTO_DOCUMENTOS).remove([caminho]);
        throw error;
      }
    }
    return { ...p, documentoId, gravado: true, erro: null };
  } catch (e) {
    return { ...p, documentoId, gravado: false, erro: mensagem(e) };
  }
}

/**
 * Grava os pendentes no lançamento, um de cada vez, na ordem da lista. Devolve a lista inteira
 * atualizada — quem chama olha `todosGravados` para decidir entre fechar e "Tentar de novo".
 */
export async function gravarDocumentosPendentes(
  clienteId: string, lancamentoId: string, pendentes: readonly DocumentoPendente[],
): Promise<DocumentoPendente[]> {
  const saida: DocumentoPendente[] = [];
  for (const p of pendentes) saida.push(await gravarUm(clienteId, lancamentoId, p));
  return saida;
}

export const todosGravados = (lista: readonly DocumentoPendente[]) => lista.every(p => p.gravado);

/**
 * O lançamento da PARCELA 1 de um parcelamento recém-criado — `fn_parcelamento_cadastrar`
 * devolve o uuid do financiamento, e os lançamentos moram em `financiamento_parcelas`.
 * ⚠ SÓ A PARCELA 1 NESTE PR, por decisão: a herança da NF para todas as parcelas é o PR 2.
 */
export async function lancamentoDaParcela1(financiamentoId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('financiamento_parcelas')
    .select('lancamento_id')
    .eq('financiamento_id', financiamentoId)
    .order('numero_parcela', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.lancamento_id ?? null;
}
