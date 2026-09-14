/**
 * As áreas plantadas de um pasto numa safra — AGRI-AREA-PLANTADA-01.
 *
 * ⚠ TABELA NOVA, FORA DO `types.ts`: `agri_safra_area` entrou na migration AGRI-02, posterior
 * ao último regen do tipo gerado. Vale o idioma já estabelecido no repo — `supabase as any`
 * no builder, com o resultado convertido imediatamente para o tipo local desta camada. O dia
 * do próximo regen é o dia de tirar os dois casts.
 * ⚠ E A LEITURA É POR (safra, pasto), que é como o operador pensa: "o que plantei NESTE pasto
 * NESTA safra". A UNIQUE do banco é (safra_id, pasto_id, cultura), então o resultado é uma
 * lista curta — uma linha por cultura, a safrinha inclusa.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AreaPlantadaPayload } from '@/lib/agri/areaPlantada';

export interface AreaPlantadaRow {
  id: string;
  safra_id: string;
  pasto_id: string;
  cultura: string;
  /** O cultivar — `null` quando não informado. Faz parte da chave única da área. */
  variedade: string | null;
  /** 'abertura' | 'plantada' — AGRI-AREA-ABERTURA-01. NOT NULL no banco, default 'plantada'. */
  status: string;
  area_plantada_ha: number;
  data_plantio: string | null;
  data_colheita_prevista: string | null;
  data_colheita_real: string | null;
  observacoes: string | null;
}

const COLS = 'id, safra_id, pasto_id, cultura, variedade, status, area_plantada_ha, data_plantio, data_colheita_prevista, data_colheita_real, observacoes';

/** A safra de lavoura como o seletor do painel a lê. */
export interface SafraLavoura {
  id: string;
  nome: string;
  codigo: string | null;
  ciclo: string;
  data_inicio: string | null;
  data_fim: string | null;
}

/**
 * As safras de LAVOURA do cliente, na ordem do cadastro.
 *
 * ⚠ `escopo_negocio = 'agricultura'` É O FILTRO, e o rótulo que o produtor lê é "Lavoura" —
 * a mesma assimetria de sempre: o banco diz agricultura, a tela diz lavoura.
 * ⚠ ORDEM CRONOLÓGICA PURA, `ordem_exibicao` asc com desempate por nome: é a mesma ordem que o
 * FIN-SAFRA-ORDEM-02 devolveu ao dropdown do modal de lançamento, e duas listas de safra na
 * mesma sessão não podem sair em ordens diferentes.
 */
export function useSafrasLavoura(clienteId: string | null | undefined) {
  const [safras, setSafras] = useState<SafraLavoura[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!clienteId) { setSafras([]); return; }
    let vivo = true;
    setCarregando(true);
    const db = supabase as any;
    db.from('financeiro_safras')
      .select('id, nome, codigo, ciclo, data_inicio, data_fim')
      .eq('cliente_id', clienteId)
      .eq('escopo_negocio', 'agricultura')
      .eq('ativa', true)
      .order('ordem_exibicao', { ascending: true })
      .order('nome', { ascending: true })
      .then(({ data }: { data: SafraLavoura[] | null }) => {
        if (!vivo) return;
        setSafras(data ?? []);
        setCarregando(false);
      });
    return () => { vivo = false; };
  }, [clienteId]);

  return { safras, carregando };
}

export function useAreaPlantada(safraId: string | null, pastoId: string | null) {
  const [areas, setAreas] = useState<AreaPlantadaRow[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!safraId || !pastoId) { setAreas([]); return; }
    setCarregando(true);
    setErro(null);
    const db = supabase as any;
    const { data, error } = await db.from('agri_safra_area')
      .select(COLS)
      .eq('safra_id', safraId)
      .eq('pasto_id', pastoId)
      .eq('ativo', true)
      .order('cultura', { ascending: true });
    if (error) setErro(error.message ?? 'Erro ao carregar as áreas plantadas.');
    setAreas((data as AreaPlantadaRow[]) ?? []);
    setCarregando(false);
  }, [safraId, pastoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  /**
   * Grava a lista inteira do par (safra, pasto): insere as novas, atualiza as existentes e
   * APAGA as que o operador removeu da tela.
   *
   * ⚠ APAGA DE VERDADE, e não por `ativo = false`: a UNIQUE é (safra_id, pasto_id, cultura) e
   * NÃO inclui `ativo` — uma linha inativada continuaria ocupando a chave, e recadastrar a
   * mesma cultura devolveria um 23505 que a tela não conseguiria explicar. Inativar só faria
   * sentido com a UNIQUE parcial, que é decisão do arquiteto.
   * ⚠ SEQUENCIAL, NÃO EM LOTE: são unidades por pasto, o custo é o do gesto, e um erro no meio
   * precisa dizer QUAL cultura falhou.
   */
  const salvar = useCallback(async (
    linhas: Array<AreaPlantadaPayload & { id: string | null }>,
    clienteId: string,
  ): Promise<{ ok: boolean; erro?: string }> => {
    if (!safraId || !pastoId) return { ok: false, erro: 'Escolha a safra.' };
    const db = supabase as any;
    const idsQueFicam = new Set(linhas.map(l => l.id).filter(Boolean) as string[]);
    const paraApagar = areas.filter(a => !idsQueFicam.has(a.id));

    for (const a of paraApagar) {
      const { error } = await db.from('agri_safra_area').delete().eq('id', a.id);
      if (error) return { ok: false, erro: `Não foi possível remover ${a.cultura}: ${error.message}` };
    }
    for (const l of linhas) {
      /**
       * ⚠⚠ O PAYLOAD VAI INTEIRO, e esta linha É O CONSERTO do PR-AGRI-VARIEDADE-SAVE.
       * Antes, este bloco DESMONTAVA o payload que a lib montou e remontava um objeto à mão com
       * cinco campos — e `variedade` não estava entre eles. O campo viajava do formulário até a
       * porta do banco e era descartado na última linha antes do `update`.
       * ⚠ E A DEFESA QUE EXISTIA NÃO PEGOU. O `AreaPlantadaPanel` diz, em comentário, que "o tipo
       * sai da lib, não de uma lista de campos repetida aqui: foi assim que `status` quase entrou
       * no formulário sem entrar no payload. O compilador cobra o campo novo". Isso vale até
       * AQUI: um objeto literal novo não é cobrado por tipo nenhum — ele só não tem o campo, e
       * o TypeScript não reclama de propriedade ausente num literal que ninguém tipou.
       * ⚠ COM O REST (`...payload`), campo novo em `AreaPlantadaPayload` chega ao banco sozinho.
       * A regra das datas em abertura continua onde sempre esteve, em `validarAreaPlantada`:
       * virar de "Plantada" para "Em abertura" APAGA o plantio que ficou para trás, senão a área
       * carrega uma data que a tela não mostra mais — dado invisível é dado que ninguém confere.
       */
      const { id: _id, ...payload } = l;
      const { error } = l.id
        ? await db.from('agri_safra_area').update(payload).eq('id', l.id)
        : await db.from('agri_safra_area').insert({
            ...payload, cliente_id: clienteId, safra_id: safraId, pasto_id: pastoId,
          });
      if (error) {
        /**
         * ⚠ 23505 É A CHAVE ÚNICA, e ela MUDOU: passou a incluir a variedade, com
         * `NULLS NOT DISTINCT`. A mensagem tem de dizer o que fazer — sem variedade, a colisão
         * é entre duas linhas da mesma cultura, e a saída é informar o cultivar; COM variedade,
         * a colisão é com uma linha que já tem esse mesmo cultivar, e aí é outra conversa.
         * ⚠ O FRONT NÃO REFAZ A REGRA: quem decide é a constraint. Aqui só se traduz a recusa.
         */
        const msg = error.code === '23505'
          ? (l.variedade || '').trim()
            ? `Já existe ${l.cultura} da variedade "${l.variedade.trim()}" neste pasto nesta safra.`
            : `Já existe uma área de ${l.cultura} neste pasto nesta safra — informe a variedade para distinguir as duas.`
          : error.message;
        return { ok: false, erro: msg };
      }
    }
    await carregar();
    return { ok: true };
  }, [safraId, pastoId, areas, carregar]);

  return { areas, carregando, erro, carregar, salvar };
}

/**
 * AS ÁREAS DE VÁRIAS SAFRAS DE UMA VEZ, POR PASTO — AGRI-AREA-POR-SAFRA-01.
 *
 * ⚠ É O QUE O CARD DA GRADE PRECISA: ele desenha 80 pastos e não pode perguntar um a um. Uma
 * consulta por safra_id `in`, e o resultado vira mapa.
 * ⚠ E SÃO VÁRIAS SAFRAS PORQUE A JANELA TEM VÁRIAS: 25/26-AMD, 25/26-Lav e 25/26-MAND cobrem
 * o mesmo período no NJ. O card soma o que está plantado naquela janela, sem escolher entre
 * rótulos que dizem a mesma temporada.
 */
export interface AreaDoPastoNaJanela {
  totalHa: number;
  culturas: string[];
  /** EM QUAIS safras da janela este pasto tem área — é o que desempata o seletor do painel. */
  safraIds: string[];
}

export function useAreasPorPastoNaJanela(safraIds: readonly string[]) {
  const [mapa, setMapa] = useState<Map<string, AreaDoPastoNaJanela>>(new Map());
  /* A chave evita recarregar quando o array muda de identidade mas não de conteúdo — a grade
     recalcula a lista de safras a cada render do mês. */
  const chave = [...safraIds].sort().join(',');

  useEffect(() => {
    if (!chave) { setMapa(new Map()); return; }
    let vivo = true;
    const db = supabase as any;
    db.from('agri_safra_area')
      .select('pasto_id, safra_id, cultura, area_plantada_ha')
      .in('safra_id', chave.split(','))
      .eq('ativo', true)
      .then(({ data }: { data: Array<{ pasto_id: string; safra_id: string; cultura: string; area_plantada_ha: number }> | null }) => {
        if (!vivo) return;
        const m = new Map<string, AreaDoPastoNaJanela>();
        (data ?? []).forEach(r => {
          const atual = m.get(r.pasto_id) ?? { totalHa: 0, culturas: [], safraIds: [] };
          atual.totalHa += Number(r.area_plantada_ha) || 0;
          if (!atual.culturas.includes(r.cultura)) atual.culturas.push(r.cultura);
          if (!atual.safraIds.includes(r.safra_id)) atual.safraIds.push(r.safra_id);
          m.set(r.pasto_id, atual);
        });
        setMapa(m);
      });
    return () => { vivo = false; };
  }, [chave]);

  return mapa;
}

/**
 * AS CULTURAS EFETIVAMENTE PLANTADAS NUMA SAFRA — AGRI-MODAL-CULTURA-01.
 *
 * ⚠ SERVE PARA ESTREITAR A PERGUNTA, não para limitar o dado: o modal oferece estas primeiro
 * porque são as que existem em campo naquela safra; sem nenhuma área cadastrada, ele volta à
 * lista completa em vez de ficar sem opção — o custo pode chegar antes do cadastro do talhão.
 */
export function useCulturasDaSafra(safraId: string | null | undefined) {
  const [culturas, setCulturas] = useState<string[]>([]);

  useEffect(() => {
    if (!safraId) { setCulturas([]); return; }
    let vivo = true;
    const db = supabase as any;
    db.from('agri_safra_area')
      .select('cultura')
      .eq('safra_id', safraId)
      .eq('ativo', true)
      .then(({ data }: { data: Array<{ cultura: string }> | null }) => {
        if (!vivo) return;
        setCulturas([...new Set((data ?? []).map(r => r.cultura))].sort());
      });
    return () => { vivo = false; };
  }, [safraId]);

  return culturas;
}

/**
 * Um talhão da safra, como o seletor da colheita o lê — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ O PASTO ENTRA NO RÓTULO PORQUE A CULTURA NÃO IDENTIFICA A ÁREA. Medido em 13/09/2026: na
 * 24/25 o amendoim tem 2 talhões, na 25/26 tem 2 e a mandioca 2, na 26/27 são 3. A FK de
 * `agri_colheita` aponta para o talhão, não para a cultura — um seletor por cultura não teria
 * onde pendurar a carga, e escolher "o primeiro" gravaria no talhão errado sem avisar.
 */
export interface TalhaoDaSafra {
  id: string;
  cultura: string;
  status: string;
  area_plantada_ha: number;
  pastoNome: string;
  /** A fazenda do pasto — o cabeçalho do modal a imprime. `null` quando o pasto não a tem. */
  fazendaNome: string | null;
  /**
   * A sigla da fazenda — "PUR", "BG", "3M".
   *
   * ⚠ VEM DA COLUNA `codigo`, NÃO DE TRÊS LETRAS DO NOME. Medido no Proto: a coluna existe e
   * está preenchida em todas as fazendas, e é a sigla que o produtor usa. Derivar do nome daria
   * "Faz" para toda "Faz. Alguma coisa" — o prefixo é igual em quase todas.
   */
  fazendaCodigo: string | null;
}

/**
 * Os talhões ATIVOS de uma safra, com o nome do pasto resolvido.
 *
 * ⚠ DUAS CONSULTAS, NÃO UM JOIN EMBUTIDO: o `select` com relação aninhada do PostgREST depende
 * do `types.ts`, que não conhece `agri_safra_area` — o resultado viria como `SelectQueryError`
 * e o campo do pasto sairia mudo em runtime sem erro nenhum. Buscar os nomes por `.in()` é o
 * idioma já usado no repo para o mesmo impasse.
 */
export function useTalhoesDaSafra(clienteId: string | null | undefined, safraId: string | null) {
  const [talhoes, setTalhoes] = useState<TalhaoDaSafra[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!clienteId || !safraId) { setTalhoes([]); return; }
    let vivo = true;
    setCarregando(true);
    const db = supabase as any;
    void (async () => {
      const { data } = await db.from('agri_safra_area')
        .select('id, pasto_id, cultura, status, area_plantada_ha')
        .eq('cliente_id', clienteId)
        .eq('safra_id', safraId)
        .eq('ativo', true);
      const linhas = (data ?? []) as Array<{
        id: string; pasto_id: string; cultura: string; status: string; area_plantada_ha: number;
      }>;
      const ids = Array.from(new Set(linhas.map(l => l.pasto_id).filter(Boolean)));
      const nomes = new Map<string, string>();
      const fazendaDoPasto = new Map<string, string | null>();
      const fazendas = new Map<string, string>();
      const codigos = new Map<string, string | null>();
      if (ids.length > 0) {
        const { data: ps } = await db.from('pastos').select('id, nome, fazenda_id').in('id', ids);
        const pastos = (ps ?? []) as Array<{ id: string; nome: string; fazenda_id: string | null }>;
        for (const p of pastos) { nomes.set(p.id, p.nome); fazendaDoPasto.set(p.id, p.fazenda_id); }
        const fids = Array.from(new Set(pastos.map(p => p.fazenda_id).filter(Boolean))) as string[];
        if (fids.length > 0) {
          /* ⚠ `codigo` NO `select`, e não só no tipo: o mapa `codigos` existia vazio desde o
             POLISH-13 porque a coluna nunca foi pedida — o TSC não acusa (o builder é `as any`)
             e a tela mostrava "—" com o dado inteiro no banco. Pedir a coluna é o conserto;
             conferir o `select` depois de editar é a lição. */
          const { data: fs } = await db.from('fazendas').select('id, nome, codigo').in('id', fids);
          for (const f of (fs ?? []) as Array<{ id: string; nome: string; codigo: string | null }>) {
            fazendas.set(f.id, f.nome);
            codigos.set(f.id, f.codigo);
          }
        }
      }
      if (!vivo) return;
      setTalhoes(linhas
        .map(l => ({
          id: l.id,
          cultura: l.cultura,
          status: l.status,
          area_plantada_ha: Number(l.area_plantada_ha) || 0,
          /* Sem nome de pasto o talhão continua existindo — e a carga precisa cair nele. */
          pastoNome: nomes.get(l.pasto_id) ?? '—',
          fazendaNome: fazendas.get(fazendaDoPasto.get(l.pasto_id) ?? '') ?? null,
          fazendaCodigo: codigos.get(fazendaDoPasto.get(l.pasto_id) ?? '') ?? null,
        }))
        .sort((a, b) => a.cultura.localeCompare(b.cultura, 'pt-BR')
          || a.pastoNome.localeCompare(b.pastoNome, 'pt-BR')));
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [clienteId, safraId]);

  return { talhoes, carregando };
}
