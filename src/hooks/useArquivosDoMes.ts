/**
 * CONC-PAINEL-ARQUIVOS-01 / CONC-PAINEL-02 — as LEITURAS do painel da conta no mês. As regras ficam puras em
 * `src/lib/conciliacao/arquivosDoMes.ts` e `painelDaConta.ts`; aqui só o banco.
 * ⚠ OS COMPROVANTES DO ANO SÃO LIDOS UMA VEZ, PELA TELA (`lerComprovantesDoAno`), e o chip "PDF" da linha e o painel recebem a MESMA
 *   lista — nunca duas leituras (Gabriel 23/11: "mesma fonte do chip da linha, nunca duas").
 */
import { supabase } from '@/integrations/supabase/client';
import { lerComprovante, type ComprovanteDoMes } from '@/lib/conciliacao/arquivosDoMes';
import type { LancamentoCandidato } from '@/lib/conciliacao/painelDaConta';
import { urlAssinadaSaldoDocumento } from '@/hooks/useExtratoDaConta';

/** Os comprovantes de saldo VIVOS do cliente no ano (todas as contas). Falha = `null` (quem chama diz "não consegui ler"). */
export async function lerComprovantesDoAno(clienteId: string, ano: number | string): Promise<ComprovanteDoMes[] | null> {
  const { data, error } = await supabase.from('financeiro_saldo_documentos')
    .select('id, conta_bancaria_id, ano_mes, nome, tipo, url, uploaded_em')
    .eq('cliente_id', clienteId)
    .eq('cancelado', false)
    .gte('ano_mes', `${ano}-01`)
    .lte('ano_mes', `${ano}-12`);
  if (error) return null;
  const linhas: Record<string, unknown>[] = data ?? [];
  return linhas.map(lerComprovante).filter((c): c is ComprovanteDoMes => c !== null);
}

/** Os bytes do comprovante (para o visualizador dentro do painel). `null` = não deu. */
export async function bytesDoComprovante(caminho: string): Promise<ArrayBuffer | null> {
  const url = await urlAssinadaSaldoDocumento(caminho);
  if (!url) return null;
  try {
    const r = await fetch(url);
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Baixar = salvar o arquivo com o nome original (o link assinado direto abriria no navegador, e de outra origem o `download` não vale). */
export async function baixarComprovante(caminho: string, nome: string): Promise<boolean> {
  const url = await urlAssinadaSaldoDocumento(caminho);
  if (!url) return false;
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const blob = await r.blob();
    const local = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = local; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(local), 10_000);
    return true;
  } catch {
    return false;
  }
}

export interface MovimentoDoArquivo { id: string; data: string; descricao: string; valor: number }

/** "Ver" de uma importação (D1 a, Gabriel 23/11): os movimentos VIVOS que aquele arquivo trouxe. */
export async function lerMovimentosDaImportacao(clienteId: string, importacaoId: string): Promise<MovimentoDoArquivo[] | null> {
  const { data, error } = await supabase.from('extrato_bancario_v2')
    .select('id, data_movimento, descricao, valor')
    .eq('cliente_id', clienteId)
    .eq('importacao_id', importacaoId)
    .is('cancelado_em', null)
    .order('data_movimento', { ascending: true })
    .limit(1000);
  if (error) return null;
  const linhas: { id: string; data_movimento: string; descricao: string | null; valor: number }[] = data ?? [];
  return linhas.map((l) => ({ id: l.id, data: l.data_movimento, descricao: l.descricao ?? '—', valor: Number(l.valor) }));
}

/** "Explicar a diferença": os lançamentos VIVOS do realizado com o valor exato (±meio centavo). O filtro de sentido, conta e mês é da
 *  regra pura (`candidatosDaDiferenca`). */
export async function lerLancamentosDeValor(clienteId: string, valor: number): Promise<LancamentoCandidato[] | null> {
  const alvo = Math.abs(valor);
  const { data, error } = await supabase.from('financeiro_lancamentos_v2')
    .select('id, descricao, valor, tipo_operacao, status_transacao, conta_bancaria_id, data_pagamento, data_vencimento')
    .eq('cliente_id', clienteId)
    .eq('cancelado', false)
    .eq('cenario', 'realizado')
    .gte('valor', alvo - 0.005)
    .lte('valor', alvo + 0.005)
    .limit(50);
  if (error) return null;
  const linhas: LancamentoCandidato[] = (data ?? []).map((l) => ({
    id: l.id, descricao: l.descricao ?? null, valor: Number(l.valor), tipo_operacao: l.tipo_operacao ?? null,
    status_transacao: l.status_transacao ?? null, conta_bancaria_id: l.conta_bancaria_id ?? null,
    data_pagamento: l.data_pagamento ?? null, data_vencimento: l.data_vencimento ?? null,
  }));
  return linhas;
}

/**
 * "Deixar pendente com observação" (o mock): a observação do MÊS da conta, na linha do saldo informado (`financeiro_saldos_bancarios_v2`).
 * ⚠ TERCEIRO GRAVADOR DA TABELA, declarado (o 1º é o `FinV2SaldosTab`; o 2º, `gravarSaldoReal`) — e o menor possível: só a
 *   `observacao` da linha que JÁ EXISTE. Sem saldo informado não há linha, e a observação não cria uma (o saldo vem antes).
 */
export async function gravarObservacaoDoMes(p: { clienteId: string; contaId: string; anoMes: string; texto: string }): Promise<string | null> {
  const { data, error } = await supabase.from('financeiro_saldos_bancarios_v2')
    .update({ observacao: p.texto.trim() || null, updated_at: new Date().toISOString() })
    .eq('cliente_id', p.clienteId)
    .eq('conta_bancaria_id', p.contaId)
    .eq('ano_mes', p.anoMes)
    .select('id');
  if (error) return 'Não consegui gravar a observação.';
  return (data ?? []).length === 0 ? 'Informe o saldo do banco deste mês antes: a observação fica junto dele.' : null;
}

/** A observação gravada do mês (para o campo vir preenchido). */
export async function lerObservacaoDoMes(clienteId: string, contaId: string, anoMes: string): Promise<string | null> {
  const { data } = await supabase.from('financeiro_saldos_bancarios_v2')
    .select('observacao').eq('cliente_id', clienteId).eq('conta_bancaria_id', contaId).eq('ano_mes', anoMes).maybeSingle();
  return data?.observacao ?? null;
}

/** A extensão que vai no caminho do bucket (a função do banco aceita 1–5 letras/números minúsculos); sem ela, 'bin'. */
export const extensaoDoOriginal = (nome: string): string => {
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(nome)?.[1]?.toLowerCase();
  return ext ?? 'bin';
};
/** O caminho do original da importação: `<cliente>/importacoes/<conta>/<id da importação>.<ext>` (o que `fn_importacao_guardar_arquivo` confere). */
export const caminhoDoOriginal = (p: { clienteId: string; contaId: string | null; importacaoId: string; nome: string }): string =>
  `${p.clienteId}/importacoes/${p.contaId ?? 'sem-conta'}/${p.importacaoId}.${extensaoDoOriginal(p.nome)}`;

/**
 * CONC-PAINEL-ARQUIVOS-01 (b, lote 115620, Gabriel 23/11) — GUARDAR O ORIGINAL da importação que acabou de gravar: sobe o arquivo ao
 * `fin-documentos` e registra o caminho (`fn_importacao_guardar_arquivo`, uma vez só). ⚠ NUNCA DESFAZ A IMPORTAÇÃO: os movimentos já
 * entraram; falhou aqui = a importação fica "o arquivo original não foi guardado" (devolve a frase, quem chama a mostra ao lado do resultado).
 */
export async function guardarOriginalDaImportacao(p: { clienteId: string; contaId: string | null; importacaoId: string; arquivo: File }): Promise<string | null> {
  try {
    const caminho = caminhoDoOriginal({ clienteId: p.clienteId, contaId: p.contaId, importacaoId: p.importacaoId, nome: p.arquivo.name });
    const up = await supabase.storage.from('fin-documentos').upload(caminho, p.arquivo, { upsert: false });
    if (up.error && !/exist/i.test(up.error.message)) return 'o arquivo original não foi guardado';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo (função nova fora dos tipos gerados)
    const { error } = await (supabase as any).rpc('fn_importacao_guardar_arquivo', { p_importacao_id: p.importacaoId, p_caminho: caminho });
    return error ? 'o arquivo original não foi guardado' : null;
  } catch {
    return 'o arquivo original não foi guardado';
  }
}
