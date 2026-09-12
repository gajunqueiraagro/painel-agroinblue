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
  /** 'abertura' | 'plantada' — AGRI-AREA-ABERTURA-01. NOT NULL no banco, default 'plantada'. */
  status: string;
  area_plantada_ha: number;
  data_plantio: string | null;
  data_colheita_prevista: string | null;
  data_colheita_real: string | null;
  observacoes: string | null;
}

const COLS = 'id, safra_id, pasto_id, cultura, status, area_plantada_ha, data_plantio, data_colheita_prevista, data_colheita_real, observacoes';

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
      const payload = {
        cultura: l.cultura,
        status: l.status,
        area_plantada_ha: l.area_plantada_ha,
        /* ⚠ EM ABERTURA AS DATAS VÃO NULAS, e isso é gravação, não omissão: virar de
           "Plantada" para "Em abertura" precisa APAGAR o plantio que ficou para trás, senão a
           área carrega uma data que a tela não mostra mais — dado invisível é dado que
           ninguém confere. O caminho de volta (marcar Plantada) pede tudo de novo, que é o
           correto: se voltou para abertura, o que havia não valia. */
        data_plantio: l.data_plantio,
        data_colheita_prevista: l.data_colheita_prevista,
      };
      const { error } = l.id
        ? await db.from('agri_safra_area').update(payload).eq('id', l.id)
        : await db.from('agri_safra_area').insert({
            ...payload, cliente_id: clienteId, safra_id: safraId, pasto_id: pastoId,
          });
      if (error) {
        /* 23505 = a UNIQUE (safra, pasto, cultura). Em vez do texto do Postgres, o fato. */
        const msg = error.code === '23505'
          ? `Já existe uma área de ${l.cultura} neste pasto nesta safra.`
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
