/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — a leitura da lista "Notas da Receita" (só SELECT, pela RLS de hoje: `tenant_ok(cliente_id)`).
 * "Já no sistema" = a chave numa nota_fiscal OU o critério do "+ Da nota", calculado a cada leitura (F34-SITUACAO-01) numa pergunta só para
 * todas as notas (`fn_notas_ja_lancadas`, NJ-NOTAS-LENTAS: era 1 `fn_nota_ja_lancada` por nota, 4–6 s no NJ).
 * O XML (pesado) NÃO vem na lista: só quando alguém pede "Lançar" ou "PDF" (`lerXmlDaReceita`).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chavesJaLancadas, lerCandidatos, lerLinhasRecebidas, montarLista, precisaConferirLancamento, situacaoNaLista, type CandidatoDaNota, type NotaNaLista, lerAtributos, type AtributosDaNota, lerLigacoes, type LigacaoDaDemonstracao } from '@/lib/fiscal/notasDaReceita';
import { hojeLocal } from '@/lib/datas/hojeLocal';

export interface DadosDaReceita {
  lista: NotaNaLista[];
  titulares: { id: string; nome: string }[];
  ultimaBusca: string | null;
  proximaBusca: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas fiscais novas fora dos tipos gerados
const db = () => supabase as any;

export async function lerNotasDaReceita(clienteId: string): Promise<DadosDaReceita> {
  const [r, t, c] = await Promise.all([
    db().from('fiscal_dfe_recebidos')
      .select('id, titular_id, chave, situacao, emitente_documento, emitente_nome, emissao, valor_cent, nota_id, recebido_em, resumo')
      .eq('cliente_id', clienteId).order('emissao', { ascending: false }).limit(2000),
    db().from('fiscal_titulares').select('id, nome').eq('cliente_id', clienteId),
    db().from('fiscal_dfe_controle').select('ultima_busca_em, nao_antes_de').eq('cliente_id', clienteId),
  ]);
  if (r.error || t.error || c.error) throw new Error('Não consegui ler as notas da Receita.');
  const linhas = lerLinhasRecebidas(r.data);
  const chaves = [...new Set(linhas.map((l) => l.chave))];
  /* NOTA-SALVAR-RAPIDO-01 (22/11) — os atributos fiscais e as ligações da demonstração dependem só das linhas: saem JÁ, em paralelo com a
     conferência "já lançada?" → candidatos (antes eram 7 perguntas em fila a cada volta para a lista) */
  const comXml = linhas.filter((l) => l.temXml || l.situacao === 'xml' || l.situacao === 'importado').map((l) => l.chave);
  const atributosP = comXml.length > 0 ? db().rpc('fn_notas_atributos_fiscais', { p_cliente: clienteId, p_chaves: comXml }) : null;
  const ligacoesP = comXml.length > 0 ? db().rpc('fn_notas_demonstracao_ligacoes', { p_cliente: clienteId }) : null;
  const noSistema = new Set<string>();
  const partes: string[][] = [];
  for (let i = 0; i < chaves.length; i += 200) partes.push(chaves.slice(i, i + 200));
  for (const n of await Promise.all(partes.map((parte) => db().from('nota_fiscal').select('chave_acesso').eq('cliente_id', clienteId).in('chave_acesso', parte)))) {
    if (n.error) throw new Error('Não consegui conferir quais notas já estão no sistema.');
    for (const x of n.data ?? []) if (typeof x.chave_acesso === 'string') noSistema.add(x.chave_acesso.replace(/\D/g, ''));
  }
  /* F34-SITUACAO-01: a nota lançada à mão (sem a chave numa nota_fiscal) se acha como o "+ Da nota" acha — na hora, a cada leitura */
  const conferir = linhas.filter((l) => precisaConferirLancamento(l, noSistema));
  if (conferir.length > 0) {
    const { data, error } = await db().rpc('fn_notas_ja_lancadas', {
      p_cliente: clienteId,
      p_notas: conferir.map((l) => ({ chave: l.chave, numero: l.chave.slice(25, 34), emitente_documento: l.emitenteDocumento, nome: l.emitenteNome })),
    });
    const achadas = error ? null : chavesJaLancadas(data);
    /* P146: a conferência que falha NUNCA vira "Nova" */
    if (!achadas) throw new Error('Não consegui conferir quais notas já estão no sistema.');
    for (const ch of achadas) noSistema.add(ch);
  }
  /* NOTA-RECEITA-CASAR-01 — as que sobram "Nova" (com XML ou não) perguntam UMA vez quais lançamentos podem ser elas */
  let candidatos = new Map<string, CandidatoDaNota[]>();
  const novas = linhas.filter((l) => situacaoNaLista(l, noSistema) === 'nova' && l.emissao && (l.valorCent ?? 0) > 0);
  if (novas.length > 0) {
    const { data, error } = await db().rpc('fn_notas_candidatos', {
      p_cliente: clienteId,
      p_notas: novas.map((l) => ({ chave: l.chave, emissao: l.emissao, valor_cent: l.valorCent, emitente_documento: l.emitenteDocumento })),
    });
    const lidos = error ? null : lerCandidatos(data);
    if (!lidos) throw new Error('Não consegui procurar os lançamentos que podem ser estas notas.');
    candidatos = lidos;
  }
  /* NOTAS-RECEITA-SEM-LANCAMENTO-01 — os atributos fiscais (CFOPs, tpNF, natOp, notas citadas) das notas com XML, numa pergunta só: a CLASSE
     da nota (`classeDaNota`) tira do "A lançar" o que não gera lançamento. Falhou = a lista de sempre (tudo "compra"), com o erro no console:
     a classe só ESCONDE do "A lançar", nunca cria nada. */
  let atributos = new Map<string, AtributosDaNota>();
  if (atributosP) {
    const { data, error } = await atributosP;
    if (error) console.error('[useNotasDaReceita] atributos', error); else atributos = lerAtributos(data);
  }
  /* NOTA-DEMONSTRACAO-01 — a demonstração ligada à compra/ao retorno que veio depois (só leitura; falhou = sem a ligação, erro no console) */
  let ligacoes: LigacaoDaDemonstracao[] = [];
  if (ligacoesP) {
    const { data, error } = await ligacoesP;
    if (error) console.error('[useNotasDaReceita] demonstração', error); else ligacoes = lerLigacoes(data);
  }
  const titulares = ((t.data ?? []) as { id: string; nome: string | null }[]).map((x) => ({ id: x.id, nome: x.nome ?? '—' }));
  const controle = (c.data ?? []) as { ultima_busca_em: string | null; nao_antes_de: string | null }[];
  const ultimas = controle.map((x) => x.ultima_busca_em).filter((x): x is string => !!x).sort();
  const proximas = controle.map((x) => x.nao_antes_de).filter((x): x is string => !!x).sort();
  return {
    lista: montarLista(linhas, new Map(titulares.map((x) => [x.id, x.nome])), noSistema, candidatos, atributos, hojeLocal(), ligacoes),
    titulares,
    ultimaBusca: ultimas.at(-1) ?? null,
    proximaBusca: proximas[0] ?? null,
  };
}

/** NOTAS-RECEITA-SEM-LANCAMENTO-01 — "Registrar bem de terceiro" pela nota de remessa (`fn_bem_terceiro_registrar`; simular = a prévia).
 *  A recusa do banco volta como frase ({ ok: false, frase }), nunca como erro cru. */
export interface PreviaDoBem { ok: true; motivo: string; fornecedor: string | null; nf: string; data: string | null; total: number;
  itens: { n: number; descricao: string; quantidade: number | null; valor: number | null }[] }
export async function registrarBemDeTerceiro(clienteId: string, chave: string, previsao: string | null, observacao: string | null, simular: boolean):
  Promise<PreviaDoBem | { ok: false; frase: string }> {
  const { data, error } = await db().rpc('fn_bem_terceiro_registrar', {
    p_cliente: clienteId, p_chave: chave, p_previsao_devolucao: previsao, p_observacao: observacao, p_simular: simular,
  });
  if (error) {
    console.error('[registrarBemDeTerceiro]', error);
    return { ok: false, frase: error.code === 'P0001' && error.message ? error.message : 'Não consegui registrar o bem. Tente de novo.' };
  }
  const itens = Array.isArray(data?.itens) ? data.itens.map((i: Record<string, unknown>) => ({
    n: Number(i.n) || 0, descricao: String(i.descricao ?? ''), quantidade: i.quantidade == null ? null : Number(i.quantidade),
    valor: i.valor == null ? null : Number(i.valor) })) : [];
  return { ok: true, motivo: String(data?.motivo ?? ''), fornecedor: data?.fornecedor ?? null, nf: String(data?.nf ?? ''), data: data?.data ?? null,
    total: Number(data?.total ?? 0), itens };
}

export async function lerXmlDaReceita(id: string): Promise<string> {
  const { data, error } = await db().from('fiscal_dfe_recebidos').select('xml').eq('id', id).maybeSingle();
  if (error || !data || typeof data.xml !== 'string' || !data.xml) throw new Error('Esta nota ainda não tem o XML completo.');
  return data.xml;
}

export const chaveDasNotasDaReceita = (clienteId: string | null) => ['notas-da-receita', clienteId];

export function useNotasDaReceita(clienteId: string | null) {
  return useQuery({
    queryKey: chaveDasNotasDaReceita(clienteId),
    queryFn: () => lerNotasDaReceita(clienteId as string),
    enabled: !!clienteId,
    staleTime: 60_000,
  });
}
