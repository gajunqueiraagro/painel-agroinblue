// ============================================================================
// useImportarClassificacao — fluxo de importação de Excel de classificação,
// EXTRAÍDO do MesaClassificacaoTab (parse + DE/PARA de conta + populate +
// invalidação). Fonte única reaproveitada pela Mesa antiga e pela Mesa Global.
//
// Escrita: SOMENTE staging (fn_classificacao_populate_staging faz INSERT em
// financeiro_classificacao_staging). NUNCA toca financeiro_lancamentos_v2.
// Sem apply, sem RPC nova, sem edição de Resultado.
// ============================================================================
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseExcelClassificacao,
  type ClassificacaoParseResult,
  type ClassificacaoExcelRow,
} from '@/v2/lib/excelPreview/parserClassificacao';
import {
  useClassificacaoStaging, ErroLotePopulate, abrirSessaoImportacao, concluirSessaoImportacao, linhasJaNaSessao,
} from '@/v2/hooks/useClassificacaoStaging';
import { ErroUsuarioSeguro } from '@/lib/erroOperacional';
import { resolverContaPorTexto, type ContaResolvivel } from '@/v2/lib/mesa/resolverConta';

export type ContaMapItem = { textoExcel: string; contaId: string | null; ignorar?: boolean };

/**
 * Quem respondeu pela conta — 133g item 8.
 *
 * ⚠ A ORIGEM EXISTE PARA A TELA PODER COLAPSAR O CARD. Sem ela, o diálogo teria de
 * adivinhar se um `contaId` preenchido veio da memória ou do operador, e as duas coisas
 * pedem apresentação diferente: o que a memória resolveu se lê de relance, o que ninguém
 * resolveu ainda pede atenção.
 */
export type OrigemContaResolvida = 'memoria' | 'operador';

export interface ContaDistinta {
  texto: string;
  qtd: number;
  exemplo: ClassificacaoExcelRow;
  /** A data mais antiga entre as linhas desta conta; `null` quando nenhuma tem data. */
  primeiraData: string | null;
  /** A soma dos valores das linhas desta conta. Zero é soma real, não ausência. */
  soma: number;
}

export interface ImportarPopularResult {
  sessaoId: string;
  inseridas: number;
  counts: Record<string, number>;
}

/**
 * Uma importação que parou no meio — PR-CONC-ENRIQ-IMPORT-ATOMICA-01 (D4).
 * `inicio` é o índice da primeira linha que NÃO entrou (a do lote que falhou); `rows` são as linhas como foram montadas
 * no primeiro envio (com as contas do de-para), para o reenvio levar exatamente o mesmo conteúdo.
 */
export interface FalhaImportacao {
  sessaoId: string;
  rows: ClassificacaoRowEnviada[];
  inicio: number;
  total: number;
  causa: string;
}
type ClassificacaoRowEnviada = ClassificacaoExcelRow & { conta_origem_id: string | null; conta_destino_id: string | null };

/** "linha 401 de 470 · o que falhou" — a frase ao lado do "Tentar de novo" (D4). */
export function textoDaFalha(f: Pick<FalhaImportacao, 'inicio' | 'total' | 'causa'>): string {
  return `linha ${f.inicio + 1} de ${f.total} · ${f.causa}`;
}

/** A resposta do operador para um texto de conta no de-para do passo 1 (`DeParaItem` do importador). */
export interface RespostaContaDePara { valor: string | null; descartado?: boolean }

/**
 * A MEMÓRIA, PURA — o que `resolverContaPorTexto` resolve com certeza, sem sobrescrever quem já respondeu.
 * `preResolverPelaMemoria` grava isto no estado; `popular` usa direto, na mesma chamada.
 */
export function resolucoesPelaMemoria(
  distintas: readonly ContaDistinta[],
  respondidas: Record<string, ContaMapItem>,
  contas: readonly ContaResolvivel[],
): Record<string, ContaMapItem> {
  const novos: Record<string, ContaMapItem> = {};
  if (contas.length === 0) return novos;
  for (const c of distintas) {
    const jaTem = respondidas[c.texto];
    if (jaTem?.contaId || jaTem?.ignorar) continue;
    const hit = resolverContaPorTexto(c.texto, contas);
    if (!hit) continue;
    novos[c.texto] = { textoExcel: c.texto, contaId: hit.id, ignorar: false };
  }
  return novos;
}

/**
 * O MAPA DE CONTAS DE UM GESTO — PR-CONC-EXCEL-CONTA-STAGING-01. Memória, depois o que já está no estado, e por
 * cima as respostas do de-para do passo 1 (a do operador vence). Pendente (sem valor e não descartado) não entra: a
 * linha vai sem conta e o motor a marca `sem_conta_para_match`, como antes.
 */
export function mapaContasDoGesto(
  distintas: readonly ContaDistinta[],
  noEstado: Record<string, ContaMapItem>,
  deParaConta?: Record<string, RespostaContaDePara>,
  contasMemoria?: readonly ContaResolvivel[],
): Record<string, ContaMapItem> {
  const doDePara: Record<string, ContaMapItem> = {};
  for (const [texto, item] of Object.entries(deParaConta ?? {})) {
    if (item.valor) doDePara[texto] = { textoExcel: texto, contaId: item.valor, ignorar: false };
    else if (item.descartado) doDePara[texto] = { textoExcel: texto, contaId: null, ignorar: true };
  }
  const respondidas = { ...noEstado, ...doDePara };
  return { ...resolucoesPelaMemoria(distintas, respondidas, contasMemoria ?? []), ...respondidas };
}

export function useImportarClassificacao(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  // sessaoId=null → a query de staging fica desabilitada; só usamos populate.
  const { populate, isPopulating } = useClassificacaoStaging(null, clienteId);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lote, setLote] = useState<ClassificacaoParseResult | null>(null);
  const [errosParser, setErrosParser] = useState<Array<{ linha: number; motivo: string }>>([]);
  const [parsing, setParsing] = useState(false);
  const [contaMap, setContaMap] = useState<Record<string, ContaMapItem>>({});
  const [origemConta, setOrigemConta] = useState<Record<string, OrigemContaResolvida>>({});
  /** A importação que parou no meio (D4): a sessão, as linhas EXATAS que se enviaram e de onde recomeçar. */
  const [falha, setFalha] = useState<FalhaImportacao | null>(null);

  // Contas distintas do lote (ignora vazio e '-') — idêntico à Mesa antiga.
  const contasDistintas = useMemo<ContaDistinta[]>(() => {
    if (!lote) return [];
    const acc = new Map<string, {
      qtd: number; exemplo: ClassificacaoExcelRow; primeiraData: string | null; soma: number;
    }>();
    for (const r of lote.rows) {
      for (const txt of [r.conta_origem, r.conta_destino]) {
        const t = txt?.trim();
        if (!t || t === '-') continue;
        const cur = acc.get(t);
        /* ⚠ A DATA DE CAIXA VEM PRIMEIRO, e a de competência é o fallback: o cabeçalho do
           card serve para o operador reconhecer o extrato que tem na mão, e o extrato fala
           em pagamento. `null` quando nenhuma das duas existe — traço, nunca uma data
           inventada. */
        const data = r.data_pagamento ?? r.data ?? null;
        const valor = r.valor ?? 0;
        if (cur) {
          cur.qtd++;
          cur.soma += valor;
          if (data && (cur.primeiraData === null || data < cur.primeiraData)) cur.primeiraData = data;
        } else {
          acc.set(t, { qtd: 1, exemplo: r, primeiraData: data, soma: valor });
        }
      }
    }
    return [...acc.entries()].map(([texto, v]) => ({
      texto, qtd: v.qtd, exemplo: v.exemplo, primeiraData: v.primeiraData, soma: v.soma,
    }));
  }, [lote]);

  // Gate: toda conta distinta precisa estar resolvida OU ignorada.
  const todasResolvidasOuIgnoradas = contasDistintas.every((c) => {
    const item = contaMap[c.texto];
    return item?.ignorar || !!item?.contaId;
  });

  function reset() {
    setArquivo(null);
    setLote(null);
    setErrosParser([]);
    setContaMap({});
    setOrigemConta({});
    setFalha(null);
  }

  /**
   * Pré-resolve as contas do lote pela MEMÓRIA do cadastro — 133g item 8.
   *
   * ⚠ SÓ O QUE É CERTO. `resolverContaPorTexto` responde apelido, nome igual e
   * agência+número, e devolve `null` no resto: as camadas de substring viraram sugestão em
   * 133b, depois de resolverem "Cartão Sicredi Lavoura Ag. 0903…" para a conta corrente
   * "Sicredi Lavoura" e mandarem 57 lançamentos de cartão para o lugar errado.
   *
   * ⚠ NUNCA SOBRESCREVE O OPERADOR — mesma doutrina do `mesclarDePara`: quem já respondeu
   * (escolheu uma conta ou mandou ignorar) mantém a resposta, e catálogo que chega depois
   * só preenche o que está vazio.
   *
   * ⚠ IDEMPOTENTE POR CONSTRUÇÃO: sem nada novo a preencher, não chama `setState` — é o que
   * permite chamá-la de um efeito sem laço infinito.
   *
   * @returns quantas contas ficaram resolvidas pela memória nesta chamada.
   */
  function preResolverPelaMemoria(contas: readonly ContaResolvivel[]): number {
    const novos = resolucoesPelaMemoria(contasDistintas, contaMap, contas);
    const novasOrigens: Record<string, OrigemContaResolvida> = {};
    for (const texto of Object.keys(novos)) novasOrigens[texto] = 'memoria';
    const qtd = Object.keys(novos).length;
    if (qtd === 0) return 0;
    setContaMap((prev) => ({ ...prev, ...novos }));
    setOrigemConta((prev) => ({ ...prev, ...novasOrigens }));
    return qtd;
  }

  async function selecionarArquivo(file: File | null): Promise<ClassificacaoParseResult | null> {
    reset();
    if (!file) return null;
    setArquivo(file);
    setParsing(true);
    try {
      const parsed = await parseExcelClassificacao(file);
      setLote(parsed);
      setErrosParser(parsed.erros);
      return parsed;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrosParser([{ linha: 0, motivo: msg }]);
      throw e;
    } finally {
      setParsing(false);
    }
  }

  function resolverConta(texto: string, resolucao: { contaId?: string | null; ignorar?: boolean }) {
    /* Mexeu, é do operador: a pílula "pela memória" some no mesmo gesto em que a escolha
       deixa de ser da memória. */
    setOrigemConta((prev) => ({ ...prev, [texto]: 'operador' }));
    setContaMap((prev) => ({
      ...prev,
      [texto]: {
        textoExcel: texto,
        contaId: resolucao.ignorar ? null : (resolucao.contaId ?? prev[texto]?.contaId ?? null),
        ignorar: resolucao.ignorar ?? false,
      },
    }));
  }

  /**
   * Popula o staging.
   *
   * ⚠ O MAPA DE CONTAS VEM POR PARÂMETRO — PR-CONC-EXCEL-CONTA-STAGING-01. O Enriquecer chamava `resolverConta`
   * (que só AGENDA o estado) e logo depois `popular()`, que lia o `contaMap` da renderização em curso — vazio. A
   * planilha ia inteira para o staging sem conta (NJ, set/26: 483 de 509 linhas) e o motor pulava todas. Agora quem
   * chama entrega as respostas do de-para e o catálogo da memória, e o mapa se monta AQUI, na mesma chamada.
   */
  async function popular(opcoes?: {
    deParaConta?: Record<string, RespostaContaDePara>;
    contasMemoria?: readonly ContaResolvivel[];
    /** RETOMAR uma importação incompleta (D6): a MESMA sessão, com o mesmo arquivo; só as linhas que faltam são enviadas. */
    sessaoRetomar?: string;
  }): Promise<ImportarPopularResult | null> {
    if (!lote || !clienteId) return null;
    /* ⚠ A SESSÃO NÃO MUDA NO "TENTAR DE NOVO" — PR-CONC-ENRIQ-IMPORT-ATOMICA-01 (D4). Antes cada clique gerava um uuid
       novo e o NJ ficou com quatro importações paradas em 400 de 470. Com uma falha guardada, o gesto seguinte REENVIA a
       partir do lote que falhou, na sessão que já existe; arquivo novo (`reset`) é que zera a falha. */
    const anterior = falha;
    const sessao = opcoes?.sessaoRetomar ?? anterior?.sessaoId ?? crypto.randomUUID();
    const rows = anterior && anterior.sessaoId === sessao ? anterior.rows : (() => {
      const mapa = mapaContasDoGesto(contasDistintas, contaMap, opcoes?.deParaConta, opcoes?.contasMemoria);
      // Enriquecer cada row com o UUID resolvido no DE/PARA (idêntico à Mesa antiga);
      // COALESCE no back resolve o restante via fn_classificacao_resolver_conta.
      return lote.rows.map((r) => {
        const o = r.conta_origem?.trim();
        const d = r.conta_destino?.trim();
        const io = o ? mapa[o] : undefined;
        const id = d ? mapa[d] : undefined;
        return {
          ...r,
          conta_origem_id: io && !io.ignorar ? io.contaId : null,
          conta_destino_id: id && !id.ignorar ? id.contaId : null,
        };
      });
    })();
    const esperadas = new Set(rows.map((r) => r.linha)).size;

    /* D2 — o banco sabe quantas linhas esperar ANTES do primeiro lote. Reabrir é idempotente; com outro número de linhas
       ele recusa ("escolha o mesmo arquivo") e a recusa vai escrita onde o erro aparece, não em toast. */
    const aberta = await abrirSessaoImportacao({ sessaoId: sessao, clienteId, linhasEsperadas: esperadas, arquivo: arquivo?.name ?? null });
    if (!aberta.ok) {
      setFalha(null);
      throw new ErroUsuarioSeguro(aberta.mensagem ?? 'Não foi possível abrir a importação.');
    }

    /* O que enviar: na falha guardada, do lote que falhou em diante; no retomar de uma incompleta, só as linhas que ainda
       não estão no staging (o populate repetiria sem mexer em nada, mas não há por que reenviar o que já entrou). */
    let aEnviar = rows;
    if (anterior && anterior.sessaoId === sessao) aEnviar = rows.slice(anterior.inicio);
    else if (opcoes?.sessaoRetomar) {
      const ja = await linhasJaNaSessao(sessao);
      aEnviar = rows.filter((r) => !ja.has(r.linha));
    }
    const deslocamento = rows.length - aEnviar.length;

    let res: Awaited<ReturnType<typeof populate>> = { sessao_id: sessao, total_linhas: 0, inseridas: 0, counts_por_status: {} };
    if (aEnviar.length > 0) {
      try {
        res = await populate({
          sessao_id: sessao, rows: aEnviar,
          /* O botão fica em "Populando…" por vários segundos num arquivo de 500 linhas; sem
             contagem, o operador não distingue "trabalhando" de "travado" — e foi assim que a
             falha silenciosa passou por homologação como "o botão não faz nada". */
          onProgresso: (feitas) => setProgresso({ feitas: deslocamento + feitas, total: rows.length }),
        });
      } catch (e: unknown) {
        setProgresso(null);
        qc.invalidateQueries({ queryKey: ['classificacao-sessoes', clienteId] });
        if (e instanceof ErroLotePopulate) {
          const inicio = deslocamento + e.inicio;
          setFalha({ sessaoId: sessao, rows, inicio, total: rows.length, causa: e.causa });
        }
        throw e;
      }
    }
    setProgresso(null);

    /* D3 — só o banco diz que chegou tudo. Incompleta guarda a falha (o "Tentar de novo" reenvia o que falta). */
    const fim = await concluirSessaoImportacao(sessao);
    qc.invalidateQueries({ queryKey: ['classificacao-sessoes', clienteId] });
    if (fim.status !== 'completa') {
      const faltam = await linhasJaNaSessao(sessao);
      const inicio = Math.max(0, rows.findIndex((r) => !faltam.has(r.linha)));
      const causa = fim.mensagem ?? `${fim.linhasRecebidas} de ${fim.linhasEsperadas ?? esperadas} linhas chegaram.`;
      setFalha({ sessaoId: sessao, rows, inicio, total: rows.length, causa });
      throw new ErroUsuarioSeguro(causa);
    }
    setFalha(null);
    return { sessaoId: sessao, inseridas: res.inseridas, counts: res.counts_por_status ?? {} };
  }

  return {
    arquivo, lote, errosParser, parsing,
    contasDistintas, todasResolvidasOuIgnoradas, contaMap, origemConta,
    selecionarArquivo, resolverConta, preResolverPelaMemoria, popular, isPopulating, progresso, reset,
    falha, textoFalha: falha ? textoDaFalha(falha) : null,
  };
}
