/**
 * FECH-ROTACAO-01 · FATIA 2 — o grupo de pastejo no cadastro de pastos.
 *
 * O grupo junta pastos que JÁ existem (o piquete é pasto do cadastro — G1); o pasto não muda de nome (decisão 6) e a área do grupo
 * é a SOMA das áreas dos pastos, calculada, nunca gravada. Quem grava é o banco, por um escritor só (migration 20261028113150):
 *  · `fn_pasto_grupo_salvar(grupo, fazenda, nome, pastos[], p_simular)` — criar, renomear, pôr e tirar pastos, reativar;
 *  · `fn_pasto_grupo_desativar(grupo, p_simular)` — o grupo fica inativo e solta os pastos.
 * Com `p_simular` (o padrão) é a PRÉVIA: a frase, quem entra, quem sai e a área — nada gravado. A tela só grava o que a prévia mostrou.
 * ⚠ `pastos.grupo_id` muda SÓ por essas funções (gatilho de guarda no banco); o cadastro do pasto continua gravando o resto direto.
 * ⚠ Nada aqui muda número: a lotação (`fn_lotacao_do_mes`) lê as alocações do mês, não o grupo.
 */
import { supabase } from '@/integrations/supabase/client';
import { fraseDoErro } from '@/lib/patrimonio/patrimonio';

export interface GrupoDePastejo {
  id: string;
  fazenda_id: string;
  nome: string;
  ativo: boolean;
}

/** O pasto como o grupo o vê (o `Pasto` do cadastro tem tudo isso). */
export interface PastoDoGrupo {
  id: string;
  nome: string;
  area_produtiva_ha: number | null;
  ativo: boolean;
  grupo_id?: string | null;
}

export interface PastoNaPrevia { id: string; nome: string; area_ha: number | null }

export interface PreviaDoGrupo {
  simulado: boolean;
  semMudanca: boolean;
  grupoId: string | null;
  frase: string;
  entram: PastoNaPrevia[];
  saem: PastoNaPrevia[];
  areaHa: number | null;
}

/** a forma do `patrimonioApi` (com `strict: false` o `ok` sozinho não estreita a união; o campo ausente vem como `undefined`) */
export type Resultado<T> = { ok: true; dados: T; erro?: undefined } | { ok: false; erro: string; dados?: undefined };

/* ── leitura da resposta do banco (jsonb), sem `as` ────────────────────────────────────────────────────────────────────────── */

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

function pastosDaResposta(v: unknown): PastoNaPrevia[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e) => {
    if (!ehObjeto(e)) return [];
    const id = texto(e.id); const nome = texto(e.nome);
    return id && nome ? [{ id, nome, area_ha: numero(e.area_ha) }] : [];
  });
}

/** A resposta das duas funções. Sem `frase` não é resposta do escritor: vira recusa genérica, nunca prévia vazia. */
export function lerPrevia(dados: unknown): Resultado<PreviaDoGrupo> {
  if (!ehObjeto(dados) || texto(dados.frase) === null) return { ok: false, erro: 'Não consegui ler a resposta do banco. Nada foi gravado.' };
  return {
    ok: true,
    dados: {
      simulado: dados.simulado === true,
      semMudanca: dados.sem_mudanca === true,
      grupoId: texto(dados.grupo_id),
      frase: texto(dados.frase) ?? '',
      entram: pastosDaResposta(dados.entram),
      saem: pastosDaResposta(dados.saem),
      areaHa: numero(dados.area_ha),
    },
  };
}

function lerGrupos(v: unknown): GrupoDePastejo[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e) => {
    if (!ehObjeto(e)) return [];
    const id = texto(e.id); const fazenda = texto(e.fazenda_id); const nome = texto(e.nome);
    return id && fazenda && nome ? [{ id, fazenda_id: fazenda, nome, ativo: e.ativo !== false }] : [];
  });
}

/* ── as contas da tela (puras) ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** Σ das áreas dos pastos; nenhum com área = sem número (nunca "0,00"). */
export function areaDoGrupo(pastos: ReadonlyArray<Pick<PastoDoGrupo, 'area_produtiva_ha'>>): number | null {
  const comArea = pastos.map((p) => p.area_produtiva_ha).filter((a): a is number => a != null && Number.isFinite(a));
  if (comArea.length === 0) return null;
  return Math.round(comArea.reduce((s, a) => s + a, 0) * 100) / 100;
}

/** Os pastos de cada grupo, pelo `grupo_id` do cadastro (em ordem de nome). */
export function membrosPorGrupo<P extends PastoDoGrupo>(pastos: readonly P[]): Map<string, P[]> {
  const mapa = new Map<string, P[]>();
  for (const p of pastos) {
    if (!p.grupo_id) continue;
    mapa.set(p.grupo_id, [...(mapa.get(p.grupo_id) ?? []), p]);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return mapa;
}

/** Quem pode entrar no grupo que está sendo editado: ativo, sem grupo (ou já deste grupo) e ainda não escolhido. */
export function pastosQuePodemEntrar<P extends PastoDoGrupo>(pastos: readonly P[], grupoId: string | null, escolhidos: readonly string[]): P[] {
  return pastos
    .filter((p) => p.ativo && (!p.grupo_id || p.grupo_id === grupoId) && !escolhidos.includes(p.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ── o banco ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface ApiGruposDePastejo {
  listar(fazendaId: string): Promise<Resultado<GrupoDePastejo[]>>;
  salvar(p: { grupoId: string | null; fazendaId: string; nome: string; pastoIds: string[]; simular: boolean }): Promise<Resultado<PreviaDoGrupo>>;
  desativar(grupoId: string, simular: boolean): Promise<Resultado<PreviaDoGrupo>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela e RPCs novas fora do `types.ts` (a exceção do zero-cast, como `patrimonioApi`)
const semTipo: any = supabase;

export const API_GRUPOS_DE_PASTEJO: ApiGruposDePastejo = {
  async listar(fazendaId) {
    const { data, error } = await semTipo.from('pasto_grupos').select('id, fazenda_id, nome, ativo').eq('fazenda_id', fazendaId).order('nome');
    if (error) return { ok: false, erro: fraseDoErro(error, 'Não consegui ler os grupos. Tente de novo.') };
    return { ok: true, dados: lerGrupos(data) };
  },
  async salvar({ grupoId, fazendaId, nome, pastoIds, simular }) {
    const { data, error } = await semTipo.rpc('fn_pasto_grupo_salvar', {
      p_grupo_id: grupoId, p_fazenda_id: fazendaId, p_nome: nome, p_pasto_ids: pastoIds, p_simular: simular,
    });
    if (error) return { ok: false, erro: fraseDoErro(error) };
    return lerPrevia(data);
  },
  async desativar(grupoId, simular) {
    const { data, error } = await semTipo.rpc('fn_pasto_grupo_desativar', { p_grupo_id: grupoId, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErro(error) };
    return lerPrevia(data);
  },
};
