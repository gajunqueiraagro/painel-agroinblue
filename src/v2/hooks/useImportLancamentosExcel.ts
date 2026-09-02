// ============================================================================
// useImportLancamentosExcel — PR-IMPORT-EXCEL-LANC-01, passos 1 a 3.
//
// Orquestra: leitura do arquivo (parser puro), carga dos catálogos, estado dos
// quatro de-para e derivação da prévia (selectors puros).
//
// NÃO GRAVA NADA. Nem lançamento, nem apelido. A gravação é o passo 4 e entra
// depois, no mesmo PR. Até o operador confirmar, tudo vive em memória.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { persistirApelidos, type ResultadoApelidos } from '@/v2/lib/importLanc/persistirApelidos';
import {
  montarDePara, montarPrevia, contarPendentes, chaveFechamento,
  normalizar as normalizarTexto,
  type CatalogosImport, type DeParaCompleto, type DeParaMap, type DeParaItem,
  type SubcentroAliasRef, type ChaveFechamento, type NivelDuplicidade, type AlvoAtualizacao,
  casarLinhasSemId, dataDoCasamento, type CandidatoCasamento,
} from '@/v2/lib/importLanc/importLancamentosView';

/**
 * Valida em runtime a linha de financeiro_subcentro_aliases (tabela sem tipo gerado).
 * Devolve null quando a forma não bate — nenhuma suposição sobre o payload.
 */
function normalizarAlias(bruto: unknown): Omit<SubcentroAliasRef, 'subcentro'> | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const r: Record<string, unknown> = Object.fromEntries(Object.entries(bruto));
  const id = r.id, aliasText = r.alias_text, planoId = r.plano_conta_id, cli = r.cliente_id;
  if (typeof id !== 'string' || typeof aliasText !== 'string' || typeof planoId !== 'string') return null;
  return {
    id,
    cliente_id: typeof cli === 'string' ? cli : null,
    alias_text: aliasText,
    plano_conta_id: planoId,
  };
}

/** Saldo da confirmação: o que entrou, o que falhou e quanta memória ficou. */
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
        .select('id, cliente_id, alias_text, plano_conta_id')
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
      const idsPorTexto: Record<string, string> = {};
      for (const bruto of brutos) {
        const r = normalizarAlias(bruto);
        if (r && (r.cliente_id === null || r.cliente_id === clienteId)) {
          idsPorTexto[normalizarTexto(r.alias_text)] = r.id;
        }
      }
      setAliasIdPorTexto(idsPorTexto);
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
    void Promise.all([
      supabase.from('financeiro_fornecedores').select('id, aliases').eq('cliente_id', clienteId),
      supabase.from('financeiro_contas_bancarias').select('*').eq('cliente_id', clienteId),
    ]).then(([fRes, cRes]) => {
      if (cancelado) return;
      const mapaForn: Record<string, string[]> = {};
      for (const r of fRes.data ?? []) mapaForn[r.id] = listaDeAliases(r);
      setAliasesFornecedor(mapaForn);

      const mapaConta: Record<string, string[]> = {};
      for (const r of cRes.data ?? []) mapaConta[r.id] = listaDeAliases(r);
      setAliasesConta(mapaConta);
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
  }), [classificacoes, fazendas, fornecedores, contasResolviveis, aliasesSubcentro, aliasesFornecedor, fechados, safras]);

  // ── Passo 1: ler o arquivo ──
  const lerArquivo = useCallback(async (file: File) => {
    setLendo(true);
    setErro(null);
    try {
      const r = await parseExcelLancamentos(file);
      setArquivo(file);
      setParse(r);
      setDePara(montarDePara(r.rows, catalogos));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
      setParse(null);
      setDePara(null);
    } finally {
      setLendo(false);
    }
  }, [catalogos]);

  // Recalcula a pré-resolução quando os catálogos terminam de carregar depois
  // do parse (ordem de chegada das queries não é garantida). Preserva o que o
  // operador já resolveu à mão: só reavalia os itens ainda pendentes.
  useEffect(() => {
    if (!parse) return;
    const base = montarDePara(parse.rows, catalogos);
    setDePara((atual) => {
      if (!atual) return base;
      const merge = (a: DeParaMap, b: DeParaMap): DeParaMap => {
        const out: DeParaMap = {};
        for (const [k, item] of Object.entries(b)) {
          const anterior = a[k];
          // Preserva tanto a resolução manual quanto o descarte: os dois são
          // decisão do operador e não podem ser desfeitos por chegada de catálogo.
          const decidido = anterior && (anterior.valor !== null || anterior.descartado);
          out[k] = decidido ? anterior : item;
        }
        return out;
      };
      return {
        subcentro: merge(atual.subcentro, base.subcentro),
        fazenda: merge(atual.fazenda, base.fazenda),
        fornecedor: merge(atual.fornecedor, base.fornecedor),
        conta: merge(atual.conta, base.conta),
        safra: merge(atual.safra, base.safra),
      };
    });
  }, [parse, catalogos]);

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
    if (campo !== 'subcentro' && campo !== 'fornecedor' && campo !== 'conta') return;
    const item: DeParaItem = { texto, qtd: 1, valor, origem: 'manual', rotulo };
    const vazio: DeParaMap = {};
    try {
      const r = await persistirApelidos({
        clienteId,
        subcentro: campo === 'subcentro' ? { [texto]: item } : vazio,
        fornecedor: campo === 'fornecedor' ? { [texto]: item } : vazio,
        conta: campo === 'conta' ? { [texto]: item } : vazio,
        planoIdPorSubcentro, aliasIdPorTexto, aliasesFornecedor, aliasesConta,
      });
      /* O id recém-criado entra no mapa: o próximo remapeamento do mesmo texto
         vira UPDATE em vez de esbarrar no UNIQUE. */
      if (Object.keys(r.idsSubcentroPorTexto).length > 0) {
        setAliasIdPorTexto((p) => ({ ...p, ...r.idsSubcentroPorTexto }));
      }
      if (r.erros.length > 0) toast.warning(`Apelido não memorizado: ${r.erros[0]}`);
    } catch (e) {
      toast.warning(`Apelido não memorizado: ${e instanceof Error ? e.message : 'falha ao gravar.'}`);
    }
  }, [clienteId, planoIdPorSubcentro, aliasIdPorTexto, aliasesFornecedor, aliasesConta]);

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
          const candidatos = existentes.filter((e) =>
            e.data_pagamento === r.data_pagamento
            && Math.round((Number(e.valor) || 0) * 100) === alvo);
          for (const c of candidatos) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
            const { data: nivel } = await (supabase as any).rpc('classificar_nivel_duplicidade', {
              _new_data_pagamento: r.data_pagamento, _new_valor: Math.abs(Number(r.valor) || 0),
              _new_tipo_operacao: r.tipo_operacao, _new_conta_bancaria_id: null,
              _new_favorecido_id: null, _new_descricao: r.descricao,
              _new_numero_documento: r.numero_documento, _new_subcentro: null,
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
    const erros: string[] = [];
    let criados = 0;
    let atualizados = 0;
    let falhas = 0;

    try {
      const clsPorSubcentro = new Map(classificacoes.map((c) => [c.subcentro, c]));

      for (const l of previa.linhas) {
        if (!l.entra || !l.fazendaId || !l.subcentro || !l.row.tipo_operacao) continue;
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
          const ok = await editarLancamento(alvoId, formUpd);
          if (ok) atualizados++;
          else { falhas++; erros.push(`Linha ${l.row.linha}: falha ao atualizar o lançamento.`); }
          continue;
        }
        /* ⚠ CRIAÇÃO SEM APROVAÇÃO NÃO GRAVA — B-42. A prévia mostra a linha
           marcável; sem a marca, ela fica para a próxima. Silenciosa aqui é o
           certo: a tela já disse quantas seriam criadas e o operador escolheu
           não aprovar estas. */
        if (!criacoesAprovadas.has(l.indice)) continue;
        const id = await criarLancamentoComId(form, { origem: 'excel', silent: true });
        if (id) criados++;
        else { falhas++; erros.push(`Linha ${l.row.linha}: falha ao criar o lançamento.`); }
      }

      const apelidos = await persistirApelidos({
        clienteId,
        subcentro: dePara.subcentro,
        fornecedor: dePara.fornecedor,
        conta: dePara.conta,
        planoIdPorSubcentro,
        aliasIdPorTexto,
        aliasesFornecedor,
        aliasesConta,
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
  };
}
