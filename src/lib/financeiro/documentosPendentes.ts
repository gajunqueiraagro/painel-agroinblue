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
  paraJson, caminhoDocumentoLancamento, BUCKET_LANCAMENTO_DOCUMENTOS, REGRA_ARQUIVO_DO_DOCUMENTO,
  type LancDocPayload,
} from '@/hooks/useLancamentoDocumentos';
import { extensaoDoArquivo } from '@/lib/oc/caminhoDocumento';
import { aceitarArquivo } from '@/lib/arquivo/aceitarArquivo';

export interface DocumentoPendente {
  /** Identidade local, só para a lista da tela. */
  chave: string;
  payload: LancDocPayload;
  arquivo: File | null;
  /**
   * De quem é o documento — FIN-NFE-PARCELAS-01 PR 2b. `null` = documento da COMPRA (no parcelado,
   * registrado na parcela 1 e ligado a todas; à vista, o do próprio lançamento). Um número = o boleto
   * DAQUELA parcela, registrado nela e só nela.
   */
  parcela: number | null;
  /* ⚠ AS TRÊS ETAPAS SE GUARDAM, e é isso que faz o "Tentar de novo" não repetir nada: o registro não
     é idempotente (repetir cria outro documento) e o anexo tem versão (repetir recusa por conflito). */
  /** Preenchido quando o `fin_documento_registrar` já passou. */
  documentoId: string | null;
  /** O arquivo já subiu e está anexado (ou não havia arquivo). */
  anexado: boolean;
  /** Já ligado às outras parcelas (ou não precisava). */
  vinculado: boolean;
  gravado: boolean;
  erro: string | null;
}

let seq = 0;
export function novoPendente(payload: LancDocPayload, arquivo: File | null, parcela: number | null = null): DocumentoPendente {
  seq += 1;
  return {
    chave: `pendente-${Date.now()}-${seq}`, payload, arquivo, parcela,
    documentoId: null, anexado: false, vinculado: false, gravado: false, erro: null,
  };
}

/** A mesma recusa do `anexar` do hook, dita ANTES — o arquivo errado não espera o salvar para falhar. */
export function motivoArquivoRecusado(file: File): string | null {
  /* DELEGA ao dono do aceite — UI-ARRASTAR-ARQUIVO-01a. A regra e as frases são as do documento do Financeiro. */
  return aceitarArquivo([file], REGRA_ARQUIVO_DO_DOCUMENTO).motivo;
}

function mensagem(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) return e.message;
  return 'Falha ao gravar o documento.';
}

/**
 * Um pendente: registra (se ainda não), sobe o arquivo e anexa (se ainda não) e, quando `ligarA` traz
 * outros lançamentos, liga o documento a eles (se ainda não). Devolve o pendente com o progresso
 * GUARDADO; nunca lança.
 */
async function gravarUm(
  clienteId: string, lancamentoId: string, p: DocumentoPendente, ligarA?: readonly string[],
): Promise<DocumentoPendente> {
  if (p.gravado) return p;
  let documentoId = p.documentoId;
  let anexado = p.anexado;
  let vinculado = p.vinculado;
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
    if (!anexado && p.arquivo) {
      /* O aceite é do dono, e o arquivo que sobe é o que ele devolve (com o tipo preenchido) — UI-ARRASTAR-ARQUIVO-01a. */
      const aceite = aceitarArquivo([p.arquivo], REGRA_ARQUIVO_DO_DOCUMENTO);
      if (aceite.ok === false) throw new Error(aceite.motivo);
      const arquivo = aceite.arquivos[0];
      const ext = extensaoDoArquivo(arquivo) ?? '';
      const caminho = caminhoDocumentoLancamento(clienteId, lancamentoId, documentoId, ext);
      const up = await supabase.storage.from(BUCKET_LANCAMENTO_DOCUMENTOS).upload(caminho, arquivo, { upsert: false });
      if (up.error) throw up.error;
      /* Versão 1: o documento acabou de nascer, e o anexo nunca passou (senão estaria `anexado`). */
      const { error } = await supabase.rpc('fin_documento_editar', {
        p_documento_id: documentoId, p_cliente_id: clienteId, p_versao_esperada: 1,
        p_payload: { url: caminho, tipo: arquivo.type, tamanho_bytes: arquivo.size },
      });
      if (error) {
        await supabase.storage.from(BUCKET_LANCAMENTO_DOCUMENTOS).remove([caminho]);
        throw error;
      }
    }
    anexado = true;
    const outros = (ligarA ?? []).filter(id => id !== lancamentoId);
    if (!vinculado && outros.length > 0) {
      /* ⚠ `fin_documento_vincular` e' idempotente e ignora o dono (PR 2a, 72d9c923); mesmo assim so' se
         chama ate' passar uma vez. O tipo gerado ainda nao a conhece — o idioma `(supabase as any).rpc`. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fin_documento_vincular', {
        p_documento: documentoId, p_cliente: clienteId, p_lancamentos: [lancamentoId, ...outros],
      });
      if (error) throw error;
    }
    vinculado = true;
    return { ...p, documentoId, anexado, vinculado, gravado: true, erro: null };
  } catch (e) {
    return { ...p, documentoId, anexado, vinculado, gravado: false, erro: mensagem(e) };
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

/** Uma parcela gravada: o número dela no parcelamento e o lançamento que a representa. */
export interface ParcelaGravada { numero: number; lancamentoId: string }

/**
 * Grava os pendentes de um PARCELAMENTO recém-criado — FIN-NFE-PARCELAS-01 PR 2b.
 * Documento da compra (`parcela` nula): registrado na parcela 1 e ligado a TODAS. Boleto: na sua
 * parcela, e só nela. A parcela é achada pelo número, nunca pela posição na lista.
 */
export async function gravarDocumentosDoParcelamento(
  clienteId: string, parcelas: readonly ParcelaGravada[], pendentes: readonly DocumentoPendente[],
): Promise<DocumentoPendente[]> {
  const ordenadas = [...parcelas].sort((a, b) => a.numero - b.numero);
  const todas = ordenadas.map(x => x.lancamentoId);
  const saida: DocumentoPendente[] = [];
  for (const p of pendentes) {
    if (p.gravado) { saida.push(p); continue; }
    const alvo = p.parcela == null ? ordenadas[0] : ordenadas.find(x => x.numero === p.parcela);
    if (!alvo) { saida.push({ ...p, erro: `Parcela ${p.parcela ?? 1} não encontrada no parcelamento.` }); continue; }
    saida.push(await gravarUm(clienteId, alvo.lancamentoId, p, p.parcela == null ? todas : undefined));
  }
  return saida;
}

/**
 * As parcelas de um parcelamento, pelo uuid que `fn_parcelamento_cadastrar` devolve — os lançamentos
 * moram em `financiamento_parcelas`. Ordenadas pelo número da parcela.
 */
export async function lancamentosDoParcelamento(financiamentoId: string): Promise<ParcelaGravada[]> {
  const { data, error } = await supabase
    .from('financiamento_parcelas')
    .select('numero_parcela, lancamento_id, status')
    .eq('financiamento_id', financiamentoId)
    .order('numero_parcela', { ascending: true });
  if (error) throw error;
  /* ⚠ A PARCELA RETIRADA NÃO É IRMÃ (PARC-LIVRES-01 fechamento D): a edição do contrato (`fn_parcelamento_editar_parcelas`)
     deixa a retirada com status 'cancelado' e o NÚMERO que tinha — a acrescentada no lugar ganha o MESMO número. Sem este
     filtro o "Anexar boletos das parcelas" contava 4 parcelas num contrato de 3 e a busca pelo número podia cair na retirada. */
  return (data ?? [])
    .filter(r => r.status !== 'cancelado')
    .filter((r): r is { numero_parcela: number; lancamento_id: string; status: string | null } => typeof r.lancamento_id === 'string')
    .map(r => ({ numero: r.numero_parcela, lancamentoId: r.lancamento_id }));
}

/** Uma irmã de uma parcela aberta: número, lançamento, vencimento e valor lidos do banco, e se já tem boleto. */
export interface ParcelaIrma extends ParcelaGravada {
  vencimento: string | null;
  valor: number | null;
  cancelada: boolean;
  temBoleto: boolean;
}

/**
 * As irmãs de uma parcela já gravada — a consulta do M6 da FASE 0: `financiamento_parcelas` pelo
 * `financiamento_id` da parcela. `null` quando o lançamento não é parcela de parcelamento.
 * O vencimento e o valor vêm do LANÇAMENTO, e o boleto da view (a mesma fonte da aba).
 */
export async function irmasDaParcela(lancamentoId: string, clienteId: string): Promise<ParcelaIrma[] | null> {
  const { data: minha, error: e1 } = await supabase
    .from('financiamento_parcelas').select('financiamento_id').eq('lancamento_id', lancamentoId).maybeSingle();
  if (e1) throw e1;
  if (!minha?.financiamento_id) return null;
  const parcelas = await lancamentosDoParcelamento(minha.financiamento_id);
  if (parcelas.length < 2) return null;
  const ids = parcelas.map(p => p.lancamentoId);
  const [lancs, docs] = await Promise.all([
    supabase.from('financeiro_lancamentos_v2').select('id, data_vencimento, valor, cancelado').in('id', ids).eq('cliente_id', clienteId),
    supabase.from('vw_lancamento_documentos').select('lancamento_id').in('lancamento_id', ids)
      .eq('cliente_id', clienteId).eq('especie', 'boleto').eq('cancelado', false),
  ]);
  if (lancs.error) throw lancs.error;
  if (docs.error) throw docs.error;
  const comBoleto = new Set((docs.data ?? []).map(d => d.lancamento_id));
  const porId = new Map((lancs.data ?? []).map(l => [l.id, l]));
  return parcelas.map(p => {
    const l = porId.get(p.lancamentoId);
    return {
      ...p,
      vencimento: l?.data_vencimento ?? null,
      valor: l?.valor == null ? null : Number(l.valor),
      cancelada: l?.cancelado === true,
      temBoleto: comBoleto.has(p.lancamentoId),
    };
  });
}

/**
 * Nome de arquivo numa linha só — FIN-NFE-PARCELAS-01 PR 2b-fix1. O nome da NF-e (a chave de 44
 * dígitos + "-nfe.pdf") quebrava em três linhas na coluna Arquivo. A tela mostra o FIM sempre (a extensão
 * e os últimos dígitos) e o COMEÇO no espaço que sobrar, cortado com "…" pelo CSS só quando não cabe
 * ("3526092345…446110-nfe.pdf"); o nome inteiro vai no `title`. O corte acompanha a largura da coluna —
 * medido: a 748px úteis do diálogo, com o emitente inteiro, sobram ~94px para o arquivo.
 * ⚠ EXCEÇÃO CONSCIENTE À A31 ("nada cortado com reticência"), SÓ NA COLUNA ARQUIVO: nome de arquivo não
 *   cabe e não se lê inteiro; quem precisa dele passa o mouse.
 */
export function partesDoNome(nome: string, fim = 10): { inicio: string; fim: string } {
  if (nome.length <= fim) return { inicio: '', fim: nome };
  return { inicio: nome.slice(0, nome.length - fim), fim: nome.slice(nome.length - fim) };
}

/**
 * O número da coluna "Nota fiscal" da grade de parcelas — PR 2b-fix1. O da NF da compra pendente; sem ele,
 * o Nº Documento do lançamento; sem nenhum, null ("—"). O formato 000.000.000 é de quem mostra.
 */
export function numeroDaNotaDaCompra(pendentes: readonly DocumentoPendente[], numeroDoLancamento: string): string | null {
  const nf = pendentes.find(p => p.parcela == null && p.payload.especie === 'nf');
  return nf?.payload.numero?.trim() || numeroDoLancamento.trim() || null;
}
