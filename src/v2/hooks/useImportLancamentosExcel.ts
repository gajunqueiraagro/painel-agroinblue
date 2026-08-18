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
  type CatalogosImport, type DeParaCompleto, type DeParaMap,
  type SubcentroAliasRef, type ChaveFechamento,
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
  falhas: number;
  ignorados: number;
  apelidos: ResultadoApelidos;
  erros: string[];
}

/** Campos que passam pelo mesmo mecanismo de de-para. */
export type CampoDePara = 'subcentro' | 'fazenda' | 'fornecedor' | 'conta';

export function useImportLancamentosExcel() {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;

  const {
    classificacoes, fornecedores, contasBancarias,
    loadClassificacoes, loadFornecedores, loadContas, criarFornecedor,
    criarLancamentoComId,
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
  /** Resultado da gravação (passo 4). null = ainda não confirmada. */
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  useEffect(() => {
    if (!clienteId) return;
    loadClassificacoes();
    loadFornecedores();
    loadContas();
  }, [clienteId, loadClassificacoes, loadFornecedores, loadContas]);

  // Aliases de subcentro. O subcentro vive em financeiro_plano_contas, mas o join
  // embutido do PostgREST estoura a inferência de tipos (TS2589) — duas queries e
  // junção em memória custam o mesmo e mantêm o arquivo sem cast.
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    void Promise.all([
      // financeiro_subcentro_aliases NÃO está nos types gerados (types.ts defasado).
      // Idioma do repositório para relação sem tipo — o mesmo do FinV2SubcentroAliasesTab,
      // dono desta tabela, e de outros 80 pontos. Cast confinado a esta linha.
      // ⚠ Ver relatório: a exceção zero-cast do CLAUDE.md cita `.rpc`, não `.from`.
      (supabase as any)
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
    aliasesSubcentro, aliasesFornecedor, fechados,
  }), [classificacoes, fazendas, fornecedores, contasResolviveis, aliasesSubcentro, aliasesFornecedor, fechados]);

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
      };
    });
  }, [parse, catalogos]);

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
          // Resolver reverte o descarte: escolher um destino é o oposto de descartar.
          [texto]: { ...item, valor, rotulo, origem: valor === null ? 'pendente' : 'manual', descartado: false },
        },
      };
    });
  }, []);

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

  const previa = useMemo(() => {
    if (!parse || !dePara) return null;
    return montarPrevia(parse.rows, dePara, fechados, fazendaCabecalhoId, fazendaCabecalhoNome);
  }, [parse, dePara, fechados, fazendaCabecalhoId, fazendaCabecalhoNome]);

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
        };
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
        criados, falhas,
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
  ]);

  return {
    // catálogos p/ os seletores da tela
    classificacoes, fornecedores, fazendas, contasBancarias, criarFornecedor,
    // estado
    arquivo, parse, dePara, previa, pendentes, lendo, erro,
    exigeFazendaCabecalho, fazendaCabecalhoId, setFazendaCabecalhoId,
    // ações
    lerArquivo, resolverManualmente, alternarDescarte, limpar,
    // passo 4 — a ÚNICA que grava, e só por confirmação explícita
    confirmarImportacao, gravando, resultado,
  };
}
