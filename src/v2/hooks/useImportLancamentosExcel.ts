// ============================================================================
// useImportLancamentosExcel — PR-IMPORT-EXCEL-LANC-01, passos 1 a 3.
//
// Orquestra: leitura do arquivo (parser puro), carga dos catálogos, estado dos
// quatro de-para e derivação da prévia (selectors puros).
//
// NÃO GRAVA NADA. Nem lançamento, nem apelido. A gravação é o passo 4 e entra
// depois, no mesmo PR. Até o operador confirmar, tudo vive em memória.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import {
  parseExcelLancamentos,
  type LancamentosParseResult,
} from '@/v2/lib/excelPreview/parserLancamentos';
import type { ContaResolvivel } from '@/v2/lib/mesa/resolverConta';
import type { LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { montarPayloadConta, type TipoOperacaoFinanceira } from '@/lib/financeiro/contaPayload';
import { persistirApelidos, mapaDeRepontamento, type ResultadoApelidos } from '@/v2/lib/importLanc/persistirApelidos';
import {
  montarDePara, mesclarDePara, montarPrevia, contarPendentes, chaveFechamento,
  normalizar as normalizarTexto,
  type CatalogosImport, type DeParaCompleto, type DeParaMap, type DeParaItem,
  type SubcentroAliasRef, type ChaveFechamento, type NivelDuplicidade, type AlvoAtualizacao,
  casarLinhasSemId, dataDoCasamento, type CandidatoCasamento,
} from '@/v2/lib/importLanc/importLancamentosView';

/**
 * Valida em runtime a linha de financeiro_subcentro_aliases (tabela sem tipo gerado).
 * Devolve null quando a forma não bate — nenhuma suposição sobre o payload.
 */
function normalizarAlias(bruto: unknown): (Omit<SubcentroAliasRef, 'subcentro'> & { origem: string }) | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const r: Record<string, unknown> = Object.fromEntries(Object.entries(bruto));
  const id = r.id, aliasText = r.alias_text, planoId = r.plano_conta_id, cli = r.cliente_id;
  if (typeof id !== 'string' || typeof aliasText !== 'string' || typeof planoId !== 'string') return null;
  return {
    id,
    cliente_id: typeof cli === 'string' ? cli : null,
    alias_text: aliasText,
    plano_conta_id: planoId,
    /* ⚠ A ORIGEM ENTRA NA VALIDAÇÃO — 121i. Sem ela, o mapa de repontamento não tem como
       distinguir o alias deste importador do que o custeio gravou. O default `'manual'` é
       o da coluna no banco: linha sem origem legível não é minha, e não se reponta. */
    origem: typeof r.origem === 'string' ? r.origem : 'manual',
  };
}

/** Saldo da confirmação: o que entrou, o que falhou e quanta memória ficou. */
/** Um evento do feed — 131. `linha` é a da PLANILHA, que é como o operador a chama. */
export interface EventoProgresso {
  linha: number;
  tipo: 'ok' | 'sem_par' | 'recusado';
  data: string;
  valor: number;
  titulo: string;
  contexto: string;
}

export interface ProgressoImportacao {
  total: number;
  feitas: number;
  atualizados: number;
  criados: number;
  semPar: number;
  recusados: number;
  /** "gravando {subcentro} · R$ {valor}" — `null` quando não há linha em curso. */
  agora: string | null;
  iniciadoEm: number | null;
  terminadoEm: number | null;
  /** `true` quando o operador mandou parar: o relatório diz "interrompido em N de M". */
  interrompido: boolean;
  feed: EventoProgresso[];
}

export const PROGRESSO_ZERO: ProgressoImportacao = {
  total: 0, feitas: 0, atualizados: 0, criados: 0, semPar: 0, recusados: 0,
  agora: null, iniciadoEm: null, terminadoEm: null, interrompido: false, feed: [],
};

export interface ResultadoImportacao {
  criados: number;
  /** B-22b — linhas que atualizaram lançamento existente pela coluna ID. */
  atualizados: number;
  falhas: number;
  ignorados: number;
  apelidos: ResultadoApelidos;
  erros: string[];
}

/** Campos que passam pelo mesmo mecanismo de de-para. */
export type CampoDePara = 'subcentro' | 'fazenda' | 'fornecedor' | 'conta' | 'safra';

/**
 * @param somenteAtualizar ENRIQUECER-SO-VESTE-01 — o modo VESTE. A aba Enriquecer
 * atualiza lançamentos que já nasceram do OFX soberano; linha sem par vira "sem
 * par no extrato", nunca criação. É uma FLAG, não um fork: o motor, o de-para, o
 * casamento e o dedup são os mesmos — o que muda é o destino da linha sem par e
 * o vocabulário que a tela usa para narrá-lo.
 */
export function useImportLancamentosExcel(somenteAtualizar = false) {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;

  const {
    classificacoes, fornecedores, contasBancarias, safras,
    loadClassificacoes, loadFornecedores, loadContas, loadSafras, criarFornecedor,
    criarLancamentoComId,
    editarLancamento,
  } = useFinanceiroV2();

  // ── Estado do fluxo ──
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parse, setParse] = useState<LancamentosParseResult | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dePara, setDePara] = useState<DeParaCompleto | null>(null);
  /** Fazenda do cabeçalho — usada quando a planilha não traz coluna de fazenda. */
  const [fazendaCabecalhoId, setFazendaCabecalhoId] = useState<string | null>(null);

  // ── Catálogos que o useFinanceiroV2 não cobre ──
  const [aliasesSubcentro, setAliasesSubcentro] = useState<SubcentroAliasRef[]>([]);
  const [aliasesFornecedor, setAliasesFornecedor] = useState<Record<string, string[]>>({});
  const [aliasesConta, setAliasesConta] = useState<Record<string, string[]>>({});
  /* 133b — os dois cadastros que ganharam `aliases` na migration 20260907134201. */
  const [aliasesFazenda, setAliasesFazenda] = useState<Record<string, string[]>>({});
  const [aliasesSafra, setAliasesSafra] = useState<Record<string, string[]>>({});
  const [fechados, setFechados] = useState<ReadonlySet<ChaveFechamento>>(() => new Set());
  /** subcentro → plano_conta_id (o alias aponta para o plano, não para o texto). */
  const [planoIdPorSubcentro, setPlanoIdPorSubcentro] = useState<Record<string, string>>({});
  /** alias_text normalizado → id da linha existente (para repontar em conflito). */
  const [aliasIdPorTexto, setAliasIdPorTexto] = useState<Record<string, string>>({});
  /**
   * Veredito de duplicidade por ÍNDICE de linha, e o que o operador reincluiu.
   *
   * ⚠ `undefined` ENQUANTO NÃO SE PERGUNTOU. A prévia trata ausência como "não
   * consultei", não como "não há duplicata" — do contrário, a lista apareceria
   * limpa por um instante e as linhas sumiriam depois, o que se lê como defeito.
   */
  const [duplicidades, setDuplicidades] = useState<ReadonlyMap<number, NivelDuplicidade>>(new Map());
  const [reincluidas, setReincluidas] = useState<ReadonlySet<number>>(new Set());
  const [checandoDup, setChecandoDup] = useState(false);
  /**
   * Os lançamentos que a coluna ID da planilha manda ATUALIZAR — B-22b.
   *
   * ⚠ CARREGADOS PELO ID, E CONFERIDOS CONTRA O CLIENTE: id que não volta desta
   * consulta é id que não existe, foi cancelado, ou é de outro cliente — e a
   * linha para, em vez de virar criação silenciosa. Criar seria duplicar
   * justamente o lançamento que o operador queria corrigir.
   */
  const [alvos, setAlvos] = useState<ReadonlyMap<string, AlvoAtualizacao>>(new Map());
  /**
   * B-42 — CRIAÇÃO EXIGE APROVAÇÃO EXPLÍCITA, por linha.
   *
   * ⚠ CRIAR E ATUALIZAR NÃO TÊM O MESMO RISCO, e por isso não têm o mesmo
   * padrão. Atualizar mexe num lançamento que já existe e é reversível na tela;
   * criar acrescenta dinheiro ao mês, e uma criação indevida só aparece no
   * fechamento — quando já virou duplicata a caçar. É o mesmo raciocínio do
   * dedup D1, que já nasce fora.
   *
   * ⚠ POR ÍNDICE DA LINHA, como a reinclusão: `row.linha` é o número no Excel e
   * o filtro da prévia reordena e recorta a lista — só o índice de origem
   * sobrevive a isso.
   */
  const [criacoesAprovadas, setCriacoesAprovadas] = useState<ReadonlySet<number>>(new Set());
  /** Contas (do sistema) que já têm extrato importado — o aviso de duplicação. */
  const [contasComExtrato, setContasComExtrato] = useState<ReadonlySet<string>>(new Set());

  /** B-41 — lançamentos vivos que as linhas SEM id podem estar querendo classificar. */
  const [candidatos, setCandidatos] = useState<CandidatoCasamento[]>([]);
  /** Resultado da gravação (passo 4). null = ainda não confirmada. */
  const [gravando, setGravando] = useState(false);

  /* ── PROGRESSO AO VIVO — [ENRIQUECER-PROGRESSO-01] (131) ──────────────────────
     ⚠ O ESTADO VIVE NO HOOK, não no modal. Confirmar 492 linhas leva minutos; se o
     progresso morasse no diálogo, fechá-lo perderia a contagem e o operador não teria
     como voltar a ver onde está. Fechar o modal não cancela nada — sair da tela, sim, e
     é isso que o rodapé dele avisa.
     ⚠ O `feed` GUARDA TUDO e o modal mostra os últimos nove: o CSV do fim precisa dos
     recusados que já rolaram para fora da vista. */
  const [progresso, setProgresso] = useState<ProgressoImportacao>(PROGRESSO_ZERO);
  /* A flag do "Parar", lida a cada volta. Ref e não estado: o laço fecha sobre o valor do
     render em que começou, e um `useState` só chegaria nele no render seguinte — ou seja,
     nunca. */
  const pararRef = useRef(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  useEffect(() => {
    if (!clienteId) return;
    loadClassificacoes();
    loadFornecedores();
    loadContas();
    /* B-22d — o quinto campo precisa do cadastro de safras do cliente. */
    loadSafras();
  }, [clienteId, loadClassificacoes, loadFornecedores, loadContas, loadSafras]);

  // Aliases de subcentro. O subcentro vive em financeiro_plano_contas, mas o join
  // embutido do PostgREST estoura a inferência de tipos (TS2589) — duas queries e
  // junção em memória custam o mesmo e mantêm o arquivo sem cast.
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    void Promise.all([
      /* ⚠ SEM CAST desde a regeneração do types.ts (02/09): a tabela entrou no
         tipo gerado, e o `as any` que existia só para contorná-la morreu com o
         motivo. */
      supabase
        .from('financeiro_subcentro_aliases')
        .select('id, cliente_id, alias_text, plano_conta_id, origem')
        .eq('ativo', true),
      supabase
        .from('financeiro_plano_contas')
        .select('id, subcentro')
        .eq('ativo', true),
    ]).then(([aliasRes, planoRes]) => {
      if (cancelado) return;
      if (aliasRes.error) {
        console.error('[useImportLancamentosExcel] aliases subcentro', aliasRes.error);
        return;
      }
      const subPorPlano = new Map<string, string>();
      const idPorSub: Record<string, string> = {};
      for (const p of planoRes.data ?? []) {
        if (!p.subcentro) continue;
        subPorPlano.set(p.id, p.subcentro);
        // Primeiro vence: o plano pode ter o mesmo subcentro em mais de uma linha.
        if (!(p.subcentro in idPorSub)) idPorSub[p.subcentro] = p.id;
      }
      setPlanoIdPorSubcentro(idPorSub);
      // A resposta vem sem tipo (tabela ausente dos types): validar a forma em runtime
      // antes de usar, em vez de propagar `any`.
      const brutos: unknown[] = Array.isArray(aliasRes.data) ? aliasRes.data : [];
      /* ⚠ LER TUDO, REPONTAR SÓ O QUE É MEU — 121i. `aliasesSubcentro` (a SUGESTÃO) segue
         com todas as origens: a memória é uma só para ler. O mapa de repontamento é que
         se restringe a `origem = 'importacao'`, porque escrever é que tem dono. */
      const linhas = brutos.flatMap(b => { const r = normalizarAlias(b); return r ? [r] : []; });
      setAliasIdPorTexto(mapaDeRepontamento(linhas, clienteId));
      setAliasesSubcentro(brutos.flatMap((bruto) => {
        const r = normalizarAlias(bruto);
        if (!r) return [];
        if (r.cliente_id !== null && r.cliente_id !== clienteId) return [];
        const sub = subPorPlano.get(r.plano_conta_id);
        if (!sub) return [];
        return [{ ...r, subcentro: sub }];
      }));
    });
    return () => { cancelado = true; };
  }, [clienteId]);

  // Aliases jsonb de fornecedor e de conta bancária — colunas que os loaders oficiais
  // não selecionam.
  //
  // `aliases` está nos types gerados para financeiro_fornecedores, mas NÃO para
  // financeiro_contas_bancarias (types.ts defasado; a coluna existe no banco desde
  // 20260617_conta_aliases_core). Por isso a conta usa select('*') + leitura
  // estrutural opcional — mesmo espírito do resolverConta.ts, sem cast.
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    const listaDeAliases = (row: { id: string; aliases?: unknown }): string[] =>
      Array.isArray(row.aliases)
        ? row.aliases.filter((a): a is string => typeof a === 'string')
        : [];
    /* ⚠ FAZENDA E SAFRA ENTRARAM NO MESMO `Promise.all` — 133b. Duas consultas a mais, em
       paralelo, no lugar onde os outros aliases já eram lidos: um segundo efeito para o
       mesmo assunto criaria duas ordens de chegada para o mesmo mapa. */
    void Promise.all([
      supabase.from('financeiro_fornecedores').select('id, aliases').eq('cliente_id', clienteId),
      supabase.from('financeiro_contas_bancarias').select('*').eq('cliente_id', clienteId),
      supabase.from('fazendas').select('id, aliases').eq('cliente_id', clienteId),
      supabase.from('financeiro_safras').select('id, aliases').eq('cliente_id', clienteId),
    ]).then(([fRes, cRes, fazRes, safRes]) => {
      if (cancelado) return;
      const mapaForn: Record<string, string[]> = {};
      for (const r of fRes.data ?? []) mapaForn[r.id] = listaDeAliases(r);
      setAliasesFornecedor(mapaForn);

      const mapaConta: Record<string, string[]> = {};
      for (const r of cRes.data ?? []) mapaConta[r.id] = listaDeAliases(r);
      setAliasesConta(mapaConta);

      const mapaFaz: Record<string, string[]> = {};
      for (const r of fazRes.data ?? []) mapaFaz[r.id] = listaDeAliases(r);
      setAliasesFazenda(mapaFaz);

      const mapaSaf: Record<string, string[]> = {};
      for (const r of safRes.data ?? []) mapaSaf[r.id] = listaDeAliases(r);
      setAliasesSafra(mapaSaf);
    });
    return () => { cancelado = true; };
  }, [clienteId]);

  // Meses fechados do cliente — chave (fazenda, ano_mes). Fechamento é POR FAZENDA,
  // então a mesma planilha pode ter linha bloqueada e linha liberada no mesmo mês.
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    void supabase
      .from('financeiro_fechamentos')
      .select('fazenda_id, ano_mes, status_fechamento')
      .eq('cliente_id', clienteId)
      .eq('status_fechamento', 'fechado')
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) { console.error('[useImportLancamentosExcel] fechamentos', error); return; }
        const s = new Set<ChaveFechamento>();
        for (const r of data ?? []) {
          s.add(chaveFechamento(r.fazenda_id, r.ano_mes));
        }
        setFechados(s);
      });
    return () => { cancelado = true; };
  }, [clienteId]);

  // `aliases` não está nos types gerados para financeiro_contas_bancarias (arquivo
  // defasado). Mesmo padrão do resolverConta.ts: interseção estrutural, não cast.
  const contasResolviveis = useMemo<ContaResolvivel[]>(
    () => contasBancarias.map((c) => ({
      id: c.id,
      nome_conta: c.nome_conta,
      nome_exibicao: c.nome_exibicao,
      banco: c.banco,
      agencia: c.agencia,
      numero_conta: c.numero_conta,
      aliases: aliasesConta[c.id] ?? null,
    })),
    [contasBancarias, aliasesConta],
  );

  const catalogos = useMemo<CatalogosImport>(() => ({
    classificacoes, fazendas, fornecedores,
    contas: contasResolviveis,
    aliasesSubcentro, aliasesFornecedor, fechados, safras,
    /* ⚠ OS DOIS MAPAS ESTAVAM CARREGADOS E NÃO ENTREGUES — 133b-b. O 133b os leu do banco
       para `gravarApelidoNoAto` não duplicar apelido, e parou aí: o de-para nunca os viu.
       Resultado medido por Gabriel: 4 fazendas e 8 safras memorizadas voltando a pendente
       depois do reload, enquanto a conta do plano (23 → 1) voltava resolvida. */
    aliasesFazenda, aliasesSafra,
  }), [classificacoes, fazendas, fornecedores, contasResolviveis, aliasesSubcentro,
       aliasesFornecedor, fechados, safras, aliasesFazenda, aliasesSafra]);

  /**
   * ⚠ O CATÁLOGO VIAJA POR REF — 133b-b, e esta é a raiz do defeito.
   *
   * `lerArquivo` tinha `[catalogos]` nas dependências, então TODA mudança de identidade do
   * catálogo lhe dava uma função nova. `V2ImportLancamentosExcel` chama
   * `useEffect(() => lerArquivo(arquivoInicial), [arquivoInicial, lerArquivo])`: com
   * `lerArquivo` instável, o efeito redisparava e `setDePara(montarDePara(...))` refazia o
   * mapa DO ZERO — meia hora de escolhas de volta a pendente, porque os apelidos recém-
   * gravados ainda não estão nos catálogos em memória.
   * ⚠ O `CusteioTxtImportTab`, de onde copiei o padrão em 133b, tem `lerArquivo` com deps
   * VAZIAS. Copiei a forma e não a precondição — que é o que fazia a forma ser segura.
   */
  const catalogosRef = useRef(catalogos);
  useEffect(() => { catalogosRef.current = catalogos; }, [catalogos]);

  // ── Passo 1: ler o arquivo ──
  const lerArquivo = useCallback(async (file: File) => {
    setLendo(true);
    setErro(null);
    try {
      const r = await parseExcelLancamentos(file);
      setArquivo(file);
      setParse(r);
      setDePara(montarDePara(r.rows, catalogosRef.current));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
      setParse(null);
      setDePara(null);
    } finally {
      setLendo(false);
    }
  }, []);

  /**
   * Recalcula a pré-resolução quando os catálogos terminam de carregar depois do parse — a
   * ordem de chegada das queries não é garantida.
   *
   * ⚠ SÓ PREENCHE O QUE ESTÁ VAZIO — regra 1 do 133b-b. A mesclagem é `mesclarDePara`, pura
   * e testada: escolha do operador (resolver, descartar, "sem classificação") nunca é
   * sobrescrita, e item resolvido nunca volta a pendente.
   */
  useEffect(() => {
    if (!parse) return;
    const base = montarDePara(parse.rows, catalogos);
    setDePara((atual) => mesclarDePara(atual, base));
  }, [parse, catalogos]);

  /**
   * Marca (ou limpa) o aviso "não memorizado" NA PRÓPRIA LINHA do de-para — 133b-b regra 2.
   *
   * ⚠ TOAST SOME, LINHA FICA. O aviso era um `toast.warning` que desaparecia em segundos;
   * o operador seguia adiante achando que tinha memorizado, e descobria na importação
   * seguinte. A escolha continua valendo na tela — o que ele precisa saber é que ela não
   * vai sobreviver ao reload.
   */
  const marcarApelidoFalhou = useCallback((campo: CampoDePara, texto: string, motivo: string | null) => {
    setDePara((atual) => {
      if (!atual) return atual;
      const item = atual[campo][texto];
      if (!item || (item.apelidoFalhou ?? null) === motivo) return atual;
      return { ...atual, [campo]: { ...atual[campo], [texto]: { ...item, apelidoFalhou: motivo } } };
    });
  }, []);

  /** Acrescenta o texto ao mapa de aliases em memória do cadastro que acabou de recebê-lo. */
  const aplicarApelidoNaMemoria = useCallback((campo: CampoDePara, texto: string, valor: string) => {
    const acrescentar = (p: Record<string, string[]>): Record<string, string[]> => {
      const alvo = normalizarTexto(texto);
      const saida: Record<string, string[]> = {};
      /* O texto sai de quem o tinha antes e entra no novo dono — o mesmo desempate que
         `persistirApelidos` aplica no banco. Duas regras diferentes para o mesmo conflito
         fariam a tela discordar do que foi gravado. */
      for (const [id, arr] of Object.entries(p)) {
        saida[id] = id === valor ? arr : arr.filter((a) => normalizarTexto(a) !== alvo);
      }
      const doAlvo = saida[valor] ?? [];
      saida[valor] = doAlvo.some((a) => normalizarTexto(a) === alvo) ? doAlvo : [...doAlvo, texto];
      return saida;
    };
    if (campo === 'fornecedor') setAliasesFornecedor(acrescentar);
    else if (campo === 'conta') setAliasesConta(acrescentar);
    else if (campo === 'fazenda') setAliasesFazenda(acrescentar);
    else if (campo === 'safra') setAliasesSafra(acrescentar);
  }, []);

  /**
   * B-40 item 7 — O APELIDO GRAVA NO ATO DO MAPEAMENTO, não só no confirmar.
   *
   * ⚠ MEDIDO: depois de meia hora de de-para, ZERO aliases gravados. O trabalho
   * inteiro morava no estado do navegador e morria num reload, num erro de
   * gravação ou numa desistência do lote. Perder a importação não pode mais
   * significar perder o mapeamento — são duas coisas, e só uma é reversível.
   *
   * ⚠ A ESCRITA É A MESMA DO CONFIRMAR, com um mapa de UM item: `persistirApelidos`
   * já sabe repontar em conflito e já trata os três campos. Um segundo gravador
   * aqui divergiria dela no primeiro ajuste — e o conflito de apelido é
   * exatamente o lugar onde divergir custa caro.
   *
   * ⚠ NÃO BLOQUEIA A TELA e não derruba nada: o mapeamento vale em memória
   * imediatamente, e a gravação é um efeito posterior. Falhando, avisa uma vez —
   * o confirmar tentará de novo, sobre o mesmo mapa.
   */
  const gravarApelidoNoAto = useCallback(async (
    campo: CampoDePara, texto: string, valor: string, rotulo: string | null,
  ) => {
    if (!clienteId) return;
    /* ⚠ FAZENDA E SAFRA ENTRARAM EM 133b. Antes o guard as excluía, e por isso o de-para
       delas recomeçava do zero toda importação: a resposta era a mesma todo mês e morria
       com o lote. */
    if (campo !== 'subcentro' && campo !== 'fornecedor' && campo !== 'conta'
        && campo !== 'fazenda' && campo !== 'safra') return;
    const item: DeParaItem = { texto, qtd: 1, valor, origem: 'manual', rotulo };
    const vazio: DeParaMap = {};
    try {
      const r = await persistirApelidos({
        clienteId,
        subcentro: campo === 'subcentro' ? { [texto]: item } : vazio,
        fornecedor: campo === 'fornecedor' ? { [texto]: item } : vazio,
        conta: campo === 'conta' ? { [texto]: item } : vazio,
        fazenda: campo === 'fazenda' ? { [texto]: item } : vazio,
        safra: campo === 'safra' ? { [texto]: item } : vazio,
        planoIdPorSubcentro, aliasIdPorTexto, aliasesFornecedor, aliasesConta,
        aliasesFazenda, aliasesSafra,
      });
      /* O id recém-criado entra no mapa: o próximo remapeamento do mesmo texto
         vira UPDATE em vez de esbarrar no UNIQUE. */
      if (Object.keys(r.idsSubcentroPorTexto).length > 0) {
        setAliasIdPorTexto((p) => ({ ...p, ...r.idsSubcentroPorTexto }));
      }
      if (r.erros.length > 0) {
        marcarApelidoFalhou(campo, texto, r.erros[0]);
      } else {
        /**
         * ⚠ A MEMÓRIA RECÉM-ENSINADA ENTRA NO CATÁLOGO EM MEMÓRIA — 133b-b.
         *
         * Sem isto, o catálogo do navegador continuava sem o apelido que acabou de ser
         * gravado, e QUALQUER reconstrução do de-para (a do efeito de catálogo, ou a de um
         * arquivo relido) devolvia o item a pendente — o banco sabia, a tela não. É o
         * mesmo idioma do `aliasIdPorTexto` logo acima, que já fazia isso para o id.
         * ⚠ SÓ PARA OS QUATRO DE `aliases` JSONB. O subcentro tem tabela própria
         * (`financeiro_subcentro_aliases`) e entra por `aliasesSubcentro`.
         */
        aplicarApelidoNaMemoria(campo, texto, valor);
        marcarApelidoFalhou(campo, texto, null);
      }
    } catch (e) {
      marcarApelidoFalhou(campo, texto, e instanceof Error ? e.message : 'falha ao gravar.');
    }
  }, [clienteId, planoIdPorSubcentro, aliasIdPorTexto, aliasesFornecedor, aliasesConta,
      aliasesFazenda, aliasesSafra, aplicarApelidoNaMemoria, marcarApelidoFalhou]);

  // ── Passo 2: resolução manual de um item do de-para ──
  const resolverManualmente = useCallback((
    campo: CampoDePara,
    texto: string,
    valor: string | null,
    rotulo: string | null,
  ) => {
    setDePara((atual) => {
      if (!atual) return atual;
      const mapa = atual[campo];
      const item = mapa[texto];
      if (!item) return atual;
      return {
        ...atual,
        [campo]: {
          ...mapa,
          /* Resolver reverte o descarte E o "sem classificação": escolher um
             destino é o oposto de qualquer uma das duas saídas. */
          [texto]: {
            ...item, valor, rotulo,
            origem: valor === null ? 'pendente' : 'manual',
            descartado: false, semClassificacao: false,
          },
        },
      };
    });
    /* Fora do setState: efeito não pertence a um reducer. */
    if (valor !== null) void gravarApelidoNoAto(campo, texto, valor, rotulo);
  }, [gravarApelidoNoAto]);

  /**
   * B-40 item 1a — IMPORTAR SEM CLASSIFICAÇÃO, por valor.
   *
   * ⚠ É A SAÍDA QUE FALTAVA, e o caso que a pediu custou caro: nove valores sem
   * mapeamento seguravam 409 linhas prontas, e a única porta era descartá-los —
   * o que levaria as 409 junto. Aqui as linhas ENTRAM cruas, e a classificação
   * vira trabalho de tela, que é onde ela já acontece todo mês.
   */
  const alternarSemClassificacao = useCallback((campo: CampoDePara, texto: string) => {
    setDePara((atual) => {
      if (!atual) return atual;
      const mapa = atual[campo];
      const item = mapa[texto];
      if (!item) return atual;
      const marcar = !item.semClassificacao;
      return {
        ...atual,
        [campo]: {
          ...mapa,
          [texto]: marcar
            /* Limpa a resolução: "entra sem classificação" e "vai para X" são
               respostas diferentes à mesma pergunta. */
            ? { ...item, semClassificacao: true, descartado: false, valor: null, rotulo: null, origem: 'pendente' as const }
            : { ...item, semClassificacao: false },
        },
      };
    });
  }, []);

  /**
   * B-40 item 3 — LIMPAR A SELEÇÃO, distinta do descarte.
   *
   * ⚠ DESFAZER UMA ESCOLHA ERRADA NÃO É DESCARTAR O VALOR. Sem isto, quem
   * escolhesse o subcentro errado não tinha como voltar a "Selecione…": só
   * trocar por outro palpite, ou descartar e perder as linhas. Volta a pendente,
   * e pendente é um estado honesto.
   */
  const limparSelecao = useCallback((campo: CampoDePara, texto: string) => {
    setDePara((atual) => {
      if (!atual) return atual;
      const mapa = atual[campo];
      const item = mapa[texto];
      if (!item) return atual;
      return {
        ...atual,
        [campo]: {
          ...mapa,
          [texto]: { ...item, valor: null, rotulo: null, origem: 'pendente' as const,
            descartado: false, semClassificacao: false },
        },
      };
    });
  }, []);

  /**
   * B-40 item 3 — ESQUECER O APELIDO memorizado deste texto.
   *
   * ⚠ LIMPAR A SELEÇÃO NÃO BASTA quando o texto JÁ virou apelido: na próxima
   * importação ele voltaria pré-resolvido para o destino errado, e o operador
   * repetiria a correção todo mês sem entender por quê. Esquecer apaga a linha
   * do cliente — e só a dele.
   *
   * ⚠ NADA JÁ LANÇADO É RECLASSIFICADO. O apelido governa importações futuras;
   * apagá-lo não toca em lançamento nenhum.
   */
  const esquecerApelido = useCallback(async (texto: string): Promise<boolean> => {
    if (!clienteId) return false;
    const id = aliasIdPorTexto[normalizarTexto(texto)];
    if (!id) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
    const { error } = await (supabase as any)
      .from('financeiro_subcentro_aliases')
      .delete()
      .eq('id', id)
      .eq('cliente_id', clienteId);
    if (error) { toast.error(`Não foi possível esquecer o apelido: ${error.message}`); return false; }
    setAliasIdPorTexto((p) => { const n = { ...p }; delete n[normalizarTexto(texto)]; return n; });
    limparSelecao('subcentro', texto);
    toast.success('Apelido esquecido. Nada já lançado foi reclassificado.');
    return true;
  }, [clienteId, aliasIdPorTexto, limparSelecao]);

  /**
   * PR-IMPORT-EXCEL-LANC-04 — descarte/reversão. Estado da SESSÃO: não vira apelido,
   * não é persistido, some ao trocar de arquivo. Ver relatório sobre memória.
   */
  const alternarDescarte = useCallback((campo: CampoDePara, texto: string) => {
    setDePara((atual) => {
      if (!atual) return atual;
      const mapa = atual[campo];
      const item = mapa[texto];
      if (!item) return atual;
      const descartado = !item.descartado;
      return {
        ...atual,
        [campo]: {
          ...mapa,
          // Descartar limpa a resolução: as duas coisas são mutuamente exclusivas.
          [texto]: descartado
            ? { ...item, descartado: true, valor: null, rotulo: null, origem: 'pendente' as const }
            : { ...item, descartado: false },
        },
      };
    });
  }, []);

  const limpar = useCallback(() => {
    setArquivo(null);
    setParse(null);
    setDePara(null);
    setErro(null);
    setFazendaCabecalhoId(null);
    setResultado(null);
  }, []);

  // ── Passo 3: prévia derivada ──
  const fazendaCabecalhoNome = useMemo(
    () => fazendas.find((f) => f.id === fazendaCabecalhoId)?.nome ?? null,
    [fazendas, fazendaCabecalhoId],
  );

  /* ⚠ O CASAMENTO DEPENDE DO DE-PARA DE CONTA, e por isso é derivado — não é
     efeito. A conta bancária de cada linha só existe depois de o operador mapear
     o texto da planilha; recalcular quando ele mapeia é o comportamento certo, e
     um efeito com estado próprio ficaria um passo atrás do que a tela mostra. */
  const casados = useMemo<ReadonlyMap<number, CandidatoCasamento | 'ambiguo'>>(
    () => (parse && dePara
      ? casarLinhasSemId(parse.rows, dePara, candidatos)
      : new Map<number, CandidatoCasamento | 'ambiguo'>()),
    [parse, dePara, candidatos],
  );

  const previa = useMemo(() => {
    if (!parse || !dePara) return null;
    return montarPrevia(parse.rows, dePara, fechados, fazendaCabecalhoId, fazendaCabecalhoNome,
      duplicidades, reincluidas, alvos, casados, somenteAtualizar);
  }, [parse, dePara, fechados, fazendaCabecalhoId, fazendaCabecalhoNome, duplicidades, reincluidas, alvos, casados, somenteAtualizar]);

  /**
   * Uma linha D1 entra assim mesmo — decisão do operador, por LINHA.
   *
   * ⚠ NÃO REUSA `alternarDescarte`: aquele opera sobre um VALOR do de-para
   * ("todo lançamento cujo texto de conta é X"), e duplicidade não é propriedade
   * de um texto — é desta linha contra aquele lançamento. Duas parcelas iguais no
   * mesmo dia são o caso real em que uma é duplicata e a outra não.
   */
  const alternarReinclusao = useCallback((indice: number) => {
    setReincluidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(indice)) proximo.delete(indice); else proximo.add(indice);
      return proximo;
    });
  }, []);

  /**
   * O DEDUP — a régua é do banco, e a pergunta é feita a ele.
   *
   * ⚠ DUAS ETAPAS, e a primeira é a barata: um SELECT traz os CANDIDATOS por
   * cliente + data de pagamento + valor arredondado — o mesmo `WHERE` grosso que
   * `enforce_financeiro_lancamento_v2_unique_hash` usa. Só depois, e só para os
   * pares que sobraram, chama-se `classificar_nivel_duplicidade`, que é quem
   * decide D1/D2/D3. Classificar tudo contra tudo custaria uma chamada por par
   * de linhas do mês inteiro.
   *
   * ⚠ SEM FILTRO DE `lote_importacao_id`, e é a correção que este PR entrega: o
   * gatilho do banco só compara importação com importação, então o lançamento
   * nascido do OFX (que não tem lote) nunca era candidato. A aba Instruções do
   * modelo prometia o contrário desde sempre.
   *
   * ⚠ O PAGAMENTO É A ÂNCORA porque é o que a régua compara. Linha sem pagamento
   * na planilha não tem contra o que casar e não é checada — não é ausência de
   * duplicata, é ausência de pergunta possível.
   */
  /* ⚠ O DE-PARA VIAJA POR REF, e não por dependência: ele muda a cada escolha do operador,
     e refazer a checagem de duplicidade inteira (uma RPC por candidato) a cada clique seria
     centenas de idas ao banco enquanto ele mapeia. A checagem roda quando o ARQUIVO muda; o
     que ela lê do de-para é o estado do momento em que rodou. */
  const deParaRef = useRef<DeParaCompleto | null>(null);
  useEffect(() => { deParaRef.current = dePara; }, [dePara]);

  useEffect(() => {
    let cancelado = false;
    const rows = parse?.rows;
    if (!clienteId || !rows?.length) { setDuplicidades(new Map()); return; }

    (async () => {
      setChecandoDup(true);
      try {
        const datas = [...new Set(rows.map((r) => r.data_pagamento).filter(Boolean))] as string[];
        if (datas.length === 0) { if (!cancelado) setDuplicidades(new Map()); return; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
        const { data } = await (supabase as any)
          .from('financeiro_lancamentos_v2')
          .select('id, data_pagamento, valor, tipo_operacao, conta_bancaria_id, favorecido_id, descricao, numero_documento, subcentro')
          .eq('cliente_id', clienteId)
          .eq('cancelado', false)
          .in('data_pagamento', datas);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas, fora de types.ts
        const existentes: any[] = data ?? [];
        if (existentes.length === 0) { if (!cancelado) setDuplicidades(new Map()); return; }

        const vereditos = new Map<number, NivelDuplicidade>();
        await Promise.all(rows.map(async (r, i) => {
          if (!r.data_pagamento) return;
          const alvo = Math.round((Number(r.valor) || 0) * 100);
          /* ⚠ A CONTA ENTRA NA CHAVE — [IMPORTACAO-DEDUP-01] (133f item 1a). Sem ela, a
             mesma parcela de R$ 89,00 paga no mesmo dia em duas contas diferentes virava
             candidata de si mesma. Quando o de-para ainda não resolveu a conta da linha,
             não se filtra por ela: filtrar por um `null` não acharia candidato nenhum e o
             dedup ficaria mudo justamente antes de o operador mapear. */
          const contaDaLinha = r.conta_bancaria_texto
            ? (deParaRef.current?.conta[r.conta_bancaria_texto.trim()]?.valor ?? null)
            : null;
          const subcentroDaLinha = r.conta_plano_texto
            ? (deParaRef.current?.subcentro[r.conta_plano_texto.trim()]?.valor ?? null)
            : null;
          const candidatos = existentes.filter((e) =>
            e.data_pagamento === r.data_pagamento
            && Math.round((Number(e.valor) || 0) * 100) === alvo
            && (contaDaLinha === null || e.conta_bancaria_id === contaDaLinha));
          for (const c of candidatos) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
            const { data: nivel } = await (supabase as any).rpc('classificar_nivel_duplicidade', {
              _new_data_pagamento: r.data_pagamento, _new_valor: Math.abs(Number(r.valor) || 0),
              /* ⚠ A RÉGUA PRECISA DOS DOIS LADOS — 133f item 1. O front mandava `null` em
                 conta e subcentro e comparava contra os valores REAIS do existente: a regra
                 7 (conta) e a 4 (subcentro) somavam +1 cada, sempre. Como `D1` exige
                 `diff_count = 0`, o front NUNCA obtinha D1 — uma duplicata literal vinha
                 como D2 e entrava com aviso. A régua do banco não mudou; quem a consultava
                 é que a alimentava pela metade.
                 ⚠ CONSEQUÊNCIA DECLARADA: com os campos certos, duplicata de verdade passa a
                 dar D1 e a ser barrada — que é o que faz "reimportar o mesmo arquivo" dizer
                 "já existe" em vez de recriar tudo. */
              _new_tipo_operacao: r.tipo_operacao, _new_conta_bancaria_id: contaDaLinha,
              _new_favorecido_id: null, _new_descricao: r.descricao,
              _new_numero_documento: r.numero_documento, _new_subcentro: subcentroDaLinha,
              _existing_data_pagamento: c.data_pagamento, _existing_valor: c.valor,
              _existing_tipo_operacao: c.tipo_operacao, _existing_conta_bancaria_id: c.conta_bancaria_id,
              _existing_favorecido_id: c.favorecido_id, _existing_descricao: c.descricao,
              _existing_numero_documento: c.numero_documento, _existing_subcentro: c.subcentro,
            });
            /* O PIOR VEREDITO VENCE — a mesma precedência do gatilho: achado um
               D1, não há o que procurar depois. */
            const atual = vereditos.get(i);
            if (nivel === 'D1') { vereditos.set(i, 'D1'); break; }
            if (nivel === 'D2' && atual !== 'D1') vereditos.set(i, 'D2');
            else if (nivel === 'D3' && atual == null) vereditos.set(i, 'D3');
          }
        }));
        if (!cancelado) setDuplicidades(vereditos);
      } finally {
        if (!cancelado) setChecandoDup(false);
      }
    })();
    return () => { cancelado = true; };
  }, [clienteId, parse]);

  /**
   * ⚠ TRAVADO É O QUE A OPERAÇÃO COMERCIAL GOVERNA. `origem_lancamento='oc'` ou
   * vínculo em `zoo_operacao_partes`: nesses, valor, classificação, tipo e
   * competência compõem a obrigação da OC, e o `editarLancamento` os preserva
   * gravando só o permitido. Aqui a linha CAI FORA com aviso em vez de gravar
   * pela metade — importação silenciosamente parcial é pior que recusa visível.
   */
  useEffect(() => {
    let cancelado = false;
    const ids = [...new Set((parse?.rows ?? [])
      .map((r) => (r.id_lancamento ?? '').trim())
      .filter(Boolean))];
    if (!clienteId || ids.length === 0) { setAlvos(new Map()); return; }

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('financeiro_lancamentos_v2')
        .select('id, subcentro, descricao, safra_id, origem_lancamento, origem_tipo')
        .eq('cliente_id', clienteId)
        .eq('cancelado', false)
        .in('id', ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas, fora de types.ts
      const rows: any[] = data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data: partes } = await (supabase as any)
        .from('zoo_operacao_partes')
        .select('financeiro_lancamento_id')
        .in('financeiro_lancamento_id', ids);
      const comOC = new Set(((partes ?? []) as { financeiro_lancamento_id: string }[])
        .map((p) => p.financeiro_lancamento_id));

      if (cancelado) return;
      const mapa = new Map<string, AlvoAtualizacao>();
      for (const r of rows) {
        mapa.set(r.id, {
          id: r.id,
          travado: r.origem_lancamento === 'oc' || r.origem_tipo === 'oc' || comOC.has(r.id),
          subcentroAtual: r.subcentro ?? null,
          descricaoAtual: r.descricao ?? null,
          safraAtual: r.safra_id ?? null,
        });
      }
      setAlvos(mapa);
    })();
    return () => { cancelado = true; };
  }, [clienteId, parse]);

  /**
   * B-41 — OS CANDIDATOS AO CASAMENTO.
   *
   * ⚠ A JANELA É A DO ARQUIVO, não o histórico inteiro. As datas mínima e máxima
   * que as linhas SEM id oferecem delimitam a busca: o NJ tem 29 mil lançamentos
   * vivos, e trazer todos para casar 400 linhas seria pagar o banco inteiro por
   * um mês. Fora da janela não há par possível — a chave exige data igual.
   *
   * ⚠ SÓ REALIZADO E SÓ NÃO CANCELADO, como em `fn_vincular_exatos_mes`: previsto
   * não é fato consumado, e cancelado não é lançamento.
   *
   * ⚠ E PAGINADO: o PostgREST corta em ~1000 linhas por request, e um mês do NJ
   * passa disso. Sem paginar, o casamento simplesmente não veria metade dos
   * candidatos e a linha viraria criação — duplicando em silêncio, que é
   * exatamente o defeito que este passo existe para matar.
   */
  useEffect(() => {
    let cancelado = false;
    const semId = (parse?.rows ?? []).filter((r) => !(r.id_lancamento ?? '').trim());
    const datas = semId.map(dataDoCasamento).filter((d): d is string => !!d).sort();
    if (!clienteId || datas.length === 0) { setCandidatos([]); return; }
    const de = datas[0].slice(0, 10);
    const ate = datas[datas.length - 1].slice(0, 10);

    (async () => {
      const PAGE = 1000;
      const acc: CandidatoCasamento[] = [];
      for (let from = 0; ; from += PAGE) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
        const { data, error } = await (supabase as any)
          .from('financeiro_lancamentos_v2')
          .select('id, conta_bancaria_id, valor, data_pagamento, subcentro, descricao, safra_id, origem_lancamento, origem_tipo')
          .eq('cliente_id', clienteId)
          .eq('cancelado', false)
          .eq('cenario', 'realizado')
          .gte('data_pagamento', de)
          .lte('data_pagamento', ate)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) { console.error('[useImportLancamentosExcel] candidatos', error); break; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas, fora de types.ts
        const batch: any[] = data ?? [];
        for (const r of batch) {
          acc.push({
            id: r.id,
            contaBancariaId: r.conta_bancaria_id ?? null,
            valor: Number(r.valor ?? 0),
            data: r.data_pagamento ?? null,
            travado: r.origem_lancamento === 'oc' || r.origem_tipo === 'oc',
            subcentroAtual: r.subcentro ?? null,
            descricaoAtual: r.descricao ?? null,
            safraAtual: r.safra_id ?? null,
          });
        }
        if (batch.length < PAGE) break;
        if (from > 200_000) break; // salvaguarda anti-loop
      }
      if (!cancelado) setCandidatos(acc);
    })();
    return () => { cancelado = true; };
  }, [clienteId, parse]);

  /* As contas que as linhas de CRIAÇÃO usam — só elas correm o risco de
     duplicar contra o extrato; linha que atualiza não cria nada. */
  const previaContasIds = useMemo(
    () => (previa?.linhas ?? [])
      .filter((l) => l.entra && l.modo === 'criar' && l.contaBancariaId)
      .map((l) => l.contaBancariaId as string),
    [previa],
  );
  const previaContasIdsKey = useMemo(
    () => [...new Set(previaContasIds)].sort().join(','), [previaContasIds]);

  const alternarCriacao = useCallback((indice: number) => {
    setCriacoesAprovadas((p) => {
      const n = new Set(p);
      if (n.has(indice)) n.delete(indice); else n.add(indice);
      return n;
    });
  }, []);

  /** Marcar/desmarcar todas as criações de uma vez — o acelerador, nunca o padrão. */
  const marcarTodasCriacoes = useCallback((indices: readonly number[], marcar: boolean) => {
    setCriacoesAprovadas((p) => {
      const n = new Set(p);
      for (const i of indices) { if (marcar) n.add(i); else n.delete(i); }
      return n;
    });
  }, []);

  /**
   * B-42 — QUAIS CONTAS JÁ TÊM EXTRATO IMPORTADO.
   *
   * ⚠ O AVISO EXISTE PORQUE A ORDEM IMPORTA. Numa conta que já recebeu OFX, o
   * mês virou lançamento cru; criar por planilha antes de vincular produz o
   * segundo lançamento do mesmo fato, e a duplicata só aparece no fechamento. O
   * caminho certo é Vincular/Lançar em massa primeiro — e a tela diz isso na
   * hora, não depois.
   */
  useEffect(() => {
    let cancelado = false;
    const contas = [...new Set((previaContasIds ?? []))];
    if (!clienteId || contas.length === 0) { setContasComExtrato(new Set()); return; }
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('conta_bancaria_id')
        .in('conta_bancaria_id', contas)
        .is('cancelado_em', null)
        .limit(2000);
      if (cancelado) return;
      const rows = (data ?? []) as { conta_bancaria_id: string }[];
      setContasComExtrato(new Set(rows.map((r) => r.conta_bancaria_id)));
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, previaContasIdsKey]);

  const pendentes = useMemo(() => (dePara ? contarPendentes(dePara) : null), [dePara]);

  /** A planilha não trouxe coluna de fazenda em nenhuma linha → exigir no cabeçalho. */
  const exigeFazendaCabecalho = useMemo(
    () => !!parse && parse.rows.length > 0 && parse.rows.every((r) => !r.fazenda_texto),
    [parse],
  );

  // ── Passo 4: gravação. SÓ roda por confirmação explícita do operador. ──
  //
  // Ordem: lançamentos primeiro, apelidos depois. Se a criação falhar, a memória
  // não é gravada — não queremos ensinar o sistema a partir de uma importação que
  // não aconteceu. O inverso (apelido sem lançamento) seria memória órfã.
  //
  // A criação passa por criarLancamentoComId, caminho canônico: ele deriva sinal,
  // ano_mes e escopo_negocio, e aplica a trava de intake da origem 'excel' — se a
  // movimentação já entrou pelo OFX, defere ao existente em vez de duplicar.
  const confirmarImportacao = useCallback(async (): Promise<ResultadoImportacao | null> => {
    if (!clienteId || !previa || !dePara) return null;
    setGravando(true);
    pararRef.current = false;
    const erros: string[] = [];
    let criados = 0;
    let atualizados = 0;
    let falhas = 0;

    /* ⚠ AS QUE FICAM DE FORA ENTRAM NO FEED DE UMA VEZ, no começo. Elas não passam pelo
       laço — nunca passaram —, e sem elas na conta o operador veria "480 de 492" no fim de
       um lote que terminou. A contagem tem de bater com a prévia, que é onde ele já leu o
       número. Não recalculo: leio `previa.totais.ficamDeFora`. */
    const fora = previa.linhas.filter(l => !l.entra);
    const feedInicial: EventoProgresso[] = fora.map(l => ({
      linha: l.row.linha,
      tipo: 'sem_par' as const,
      data: l.row.data_pagamento ?? l.row.data_competencia ?? '',
      valor: Math.abs(Number(l.row.valor) || 0),
      titulo: l.row.descricao ?? '(sem descrição)',
      contexto: 'sem par no extrato — nada gravado',
    }));
    const alvo = previa.linhas.filter(l => l.entra && l.fazendaId && l.subcentro && l.row.tipo_operacao);
    setProgresso({
      ...PROGRESSO_ZERO,
      total: alvo.length + feedInicial.length,
      feitas: feedInicial.length,
      semPar: feedInicial.length,
      iniciadoEm: Date.now(),
      feed: feedInicial,
    });

    /* Um evento e os contadores num gesto só: dois `setProgresso` seguidos fariam o
       React renderizar um estado onde o número e o feed discordam. */
    const empurrar = (ev: EventoProgresso, delta: Partial<Pick<ProgressoImportacao, 'atualizados' | 'criados' | 'recusados'>>) => {
      setProgresso(p => ({
        ...p,
        feitas: p.feitas + 1,
        atualizados: p.atualizados + (delta.atualizados ?? 0),
        criados: p.criados + (delta.criados ?? 0),
        recusados: p.recusados + (delta.recusados ?? 0),
        feed: [...p.feed, ev],
      }));
    };

    try {
      const clsPorSubcentro = new Map(classificacoes.map((c) => [c.subcentro, c]));

      for (const l of previa.linhas) {
        if (!l.entra || !l.fazendaId || !l.subcentro || !l.row.tipo_operacao) continue;
        /* O "Parar" termina a linha corrente e para — nunca no meio de uma escrita. */
        if (pararRef.current) break;
        const valorLinha = Math.abs(Number(l.row.valor) || 0);
        const dataLinha = l.row.data_pagamento ?? l.row.data_competencia ?? '';
        setProgresso(p => ({ ...p, agora: `gravando ${l.subcentro} · ${valorLinha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` }));
        /* O contexto do evento: só o que a linha REALMENTE levou. Campo vazio não vira
           "— " na tela; ele simplesmente não aparece. */
        const contextoDaLinha = [
          l.fazendaNome ?? null,
          /* ⚠ O NOME SAI DO CADASTRO, não da linha: `LinhaPrevia` guarda `favorecidoId` e
             `safraId` — os ids —, e mostrar UUID na tela é proibido. */
          l.favorecidoId ? (fornecedores.find(f => f.id === l.favorecidoId)?.nome ?? null) : null,
          l.safraId ? `safra ${safras.find(x => x.id === l.safraId)?.codigo ?? safras.find(x => x.id === l.safraId)?.nome ?? ''}`.trim() : null,
        ].filter(Boolean).join(' · ');
        const cls = clsPorSubcentro.get(l.subcentro);
        const contas = montarPayloadConta(
          l.row.tipo_operacao as TipoOperacaoFinanceira,
          l.contaBancariaId,
        );
        const form: LancamentoV2Form = {
          fazenda_id: l.fazendaId,
          conta_bancaria_id: contas.conta_bancaria_id,
          conta_destino_id: contas.conta_destino_id,
          data_competencia: l.row.data_competencia ?? '',
          data_pagamento: l.row.data_pagamento,
          data_vencimento: l.row.data_vencimento,
          valor: Math.abs(Number(l.row.valor) || 0),
          tipo_operacao: l.row.tipo_operacao,
          // Ausente/vazio na planilha → 'realizado' (decisão do briefing). NÃO usar
          // STATUS_FINANCEIRO_INICIAL nem deriveStatusFinanceiro.
          status_transacao: l.row.status ?? 'realizado',
          descricao: l.row.descricao ?? undefined,
          observacao: l.row.observacao ?? undefined,
          numero_documento: l.row.numero_documento,
          tipo_documento: l.row.tipo_documento,
          forma_pagamento: l.row.forma_pagamento,
          favorecido_id: l.favorecidoId,
          subcentro: l.subcentro,
          macro_custo: cls?.macro_custo,
          grupo_custo: cls?.grupo_custo,
          centro_custo: cls?.centro_custo,
          /* B-22d — a safra passa a ser GRAVADA. A coluna existia no modelo, o
             parser a lia desde sempre e o form nunca a levava: era o quarto caso
             do padrão construído-mas-não-ligado desta rodada. */
          safra_id: l.safraId,
        };
        /* ⚠ O MODO DECIDE O GRAVADOR — B-22b. Linha com id de lançamento vivo
           ATUALIZA aquele lançamento; linha sem id cria. É o fluxo real do NJ: o
           mês inteiro já virou lançamento cru pela conciliação, e o Excel chega
           para classificar o que existe. Sem este roteamento, cada linha do mês
           viraria um segundo lançamento. */
        if (l.modo === 'atualizar') {
          /* ⚠ O ALVO VEM DA LINHA DA PRÉVIA, não da coluna ID — B-41. Com o
             casamento, a linha que atualiza pode não ter id escrito; reler a
             planilha aqui criaria de novo o que a prévia prometeu atualizar. */
          const alvoId = l.alvoId ?? '';
          if (!alvoId) {
            falhas++; erros.push(`Linha ${l.row.linha}: modo atualizar sem alvo resolvido.`);
            continue;
          }
          /* ⚠ CÉLULA VAZIA NÃO APAGA O QUE JÁ EXISTE. O `form` acima nasce da
             linha da planilha; aqui as ausências voltam ao valor atual do
             lançamento, e só o que o operador escreveu sobrescreve. Mandar o
             form cru apagaria descrição e classificação de quem deixou a célula
             em branco — que é a maioria das colunas opcionais. */
          /* Linha ambígua nunca chega aqui — ela não entra —, mas o tipo do mapa
             admite o valor, e estreitá-lo é mais barato que confiar. */
          const casadoDaLinha = casados.get(l.indice);
          const alvo = alvos.get(alvoId)
            ?? (casadoDaLinha && casadoDaLinha !== 'ambiguo' ? casadoDaLinha : undefined);
          const formUpd = {
            ...form,
            descricao: form.descricao ?? alvo?.descricaoAtual ?? undefined,
            subcentro: form.subcentro ?? alvo?.subcentroAtual ?? undefined,
            /* Célula vazia não apaga, aqui também: sem safra na planilha, o
               lançamento fica com a que já tinha. */
            safra_id: l.safraId ?? alvo?.safraAtual ?? null,
          };
          /* ⚠ SEM TOAST POR LINHA — 131. Eram 492 toasts empilhados por minutos, e o
             operador não via nem o que gravava nem quanto faltava.
             ⚠ E O MOTIVO REAL DA RECUSA ENTRA NO FEED. Antes o erro virava "falha ao
             atualizar o lançamento" — texto nosso, que não diz nada. A mensagem do banco
             nomeia o invariante (mês fechado, conta de outro cliente) e é a única que
             permite ao operador consertar. */
          let motivo: string | null = null;
          const ok = await editarLancamento(alvoId, formUpd, {
            silent: true, onErro: (m) => { motivo = m; },
          });
          if (ok) {
            atualizados++;
            empurrar({ linha: l.row.linha, tipo: 'ok', data: dataLinha, valor: valorLinha,
              titulo: l.subcentro, contexto: contextoDaLinha }, { atualizados: 1 });
          } else {
            falhas++;
            const msg = motivo ?? 'falha ao atualizar o lançamento.';
            erros.push(`Linha ${l.row.linha}: ${msg}`);
            empurrar({ linha: l.row.linha, tipo: 'recusado', data: dataLinha, valor: valorLinha,
              titulo: l.subcentro ?? '(sem subcentro)', contexto: msg }, { recusados: 1 });
          }
          continue;
        }
        /* ⚠ CRIAÇÃO SEM APROVAÇÃO NÃO GRAVA — B-42. A prévia mostra a linha
           marcável; sem a marca, ela fica para a próxima. Silenciosa aqui é o
           certo: a tela já disse quantas seriam criadas e o operador escolheu
           não aprovar estas. */
        if (!criacoesAprovadas.has(l.indice)) continue;
        let motivoCriar: string | null = null;
        const id = await criarLancamentoComId(form, {
          origem: 'excel', silent: true, onErro: (m) => { motivoCriar = m; },
        });
        if (id) {
          criados++;
          empurrar({ linha: l.row.linha, tipo: 'ok', data: dataLinha, valor: valorLinha,
            titulo: l.subcentro, contexto: contextoDaLinha }, { criados: 1 });
        } else {
          falhas++;
          const msg = motivoCriar ?? 'falha ao criar o lançamento.';
          erros.push(`Linha ${l.row.linha}: ${msg}`);
          empurrar({ linha: l.row.linha, tipo: 'recusado', data: dataLinha, valor: valorLinha,
            titulo: l.subcentro ?? '(sem subcentro)', contexto: msg }, { recusados: 1 });
        }
      }

      const apelidos = await persistirApelidos({
        clienteId,
        subcentro: dePara.subcentro,
        fornecedor: dePara.fornecedor,
        conta: dePara.conta,
        /* 133b — o confirmar memoriza os cinco campos, não três. */
        fazenda: dePara.fazenda,
        safra: dePara.safra,
        planoIdPorSubcentro,
        aliasIdPorTexto,
        aliasesFornecedor,
        aliasesConta,
        aliasesFazenda,
        aliasesSafra,
      });
      erros.push(...apelidos.erros);

      const r: ResultadoImportacao = {
        criados, atualizados, falhas,
        ignorados: previa.totais.ficamDeFora.qtd,
        apelidos, erros,
      };
      setResultado(r);
      return r;
    } finally {
      setGravando(false);
      setProgresso(p => ({ ...p, agora: null, terminadoEm: Date.now(), interrompido: pararRef.current }));
    }
  }, [
    clienteId, previa, dePara, classificacoes, criarLancamentoComId,
    planoIdPorSubcentro, aliasIdPorTexto, aliasesFornecedor, aliasesConta,
    /* B-22b — o gravador do modo atualização e o mapa que o alimenta. */
    editarLancamento, alvos,
    /* ⚠ B-41 — `casados` É DEPENDÊNCIA DE VERDADE, não formalidade: ele muda
       quando o operador mapeia a conta no de-para, e um gravador preso à versão
       anterior atualizaria pelo casamento que a tela já não mostra. */
    casados,
    /* B-42 — idem: o gravador precisa da aprovação vigente, não da de um render
       anterior; presa à antiga, ele criaria o que o operador acabou de desmarcar. */
    criacoesAprovadas,
    /* 131 — os cadastros que dão NOME ao que o feed mostra. Sem eles na lista, o laço
       ficaria preso à versão de um render anterior e o contexto sairia vazio na primeira
       vez em que o cadastro chegasse depois do primeiro render. */
    fornecedores, safras,
  ]);

  return {
    // catálogos p/ os seletores da tela
    classificacoes, fornecedores, fazendas, contasBancarias, safras, criarFornecedor,
    // estado
    arquivo, parse, dePara, previa, pendentes, lendo, erro,
    exigeFazendaCabecalho, fazendaCabecalhoId, setFazendaCabecalhoId,
    // ações
    lerArquivo, resolverManualmente, alternarDescarte, alternarReinclusao, checandoDup, limpar,
    /* B-40 — as três saídas novas do de-para. */
    alternarSemClassificacao, limparSelecao, esquecerApelido,
    /** A tela precisa saber em que modo está para escolher o vocabulário. */
    somenteAtualizar,
    /* B-42 — o gate de aprovação das criações. */
    criacoesAprovadas, alternarCriacao, marcarTodasCriacoes, contasComExtrato,
    /** Texto normalizado → id do alias gravado; a tela usa para oferecer "esquecer". */
    aliasIdPorTexto,
    // passo 4 — a ÚNICA que grava, e só por confirmação explícita
    confirmarImportacao, gravando, resultado,
    /* 131 — o progresso ao vivo e o botão de parar. */
    progresso,
    pararImportacao: () => { pararRef.current = true; },
  };
}
