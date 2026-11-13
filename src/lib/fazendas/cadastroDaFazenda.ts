/**
 * FAZENDA-CADASTRO-01 · F1b — a regra da tela do cadastro da fazenda (mock tela 2): a lista de UFs do seletor, o histórico do cadastro
 * lido da trilha que já existe (`audit_log` do `trg_trilha_cadastro`), o "em uso desde", o ponto da sede e o "algo mudou?" do Salvar.
 */

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS',
  'SC', 'SE', 'SP', 'TO'] as const;
/** o texto livre de hoje: se não for uma UF, o seletor mostra "valor inexistente" — nunca troca sozinho (P94) */
export const ehUf = (s: string | null | undefined): boolean => !!s && UFS.some(u => u === s.trim().toUpperCase());

/** os campos do cadastro com nome por extenso — a trilha guarda a coluna */
const ROTULO: Record<string, string> = {
  municipio: 'Município', estado: 'Estado', car: 'CAR', nirf: 'NIRF', ccir: 'CCIR', ie: 'Inscrição estadual', roteiro: 'Roteiro de acesso',
  area_total_ha: 'Área da matrícula', matricula_conferida_em: 'Matrícula conferida em',
};
/** as colunas que a tela não mostra (as de área antiga, a área produtiva calculada, carimbos) não entram no histórico */
const FORA = new Set(['id', 'cliente_id', 'fazenda_id', 'created_at', 'updated_at']);
/* as áreas antigas do cadastro (pecuária, agricultura, APP…) e a produtiva calculada seguem gravadas, mas não têm tela: só a da matrícula aparece */
const foraDoHistorico = (k: string) => FORA.has(k) || (k.startsWith('area_') && k !== 'area_total_ha');

export interface LinhaDaTrilha {
  created_at: string;
  usuario_id: string | null;
  via?: string | null;
  acao: string;
  resumo: string | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
}
export interface MudancaDoCadastro { quando: string; quem: string; oQue: string }

const dataBR = (iso: string) => {
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
};
const valorLegivel = (k: string, v: unknown): string => {
  if (v == null || v === '') return 'vazio';
  if (k === 'area_total_ha') return `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
  if (k === 'matricula_conferida_em') return dataBR(String(v));
  return String(v);
};

/** o que mudou numa linha da trilha: o resumo do banco quando há (ex.: a IE pela nota), senão campo a campo "antes → depois" */
export function oQueMudou(l: LinhaDaTrilha): string {
  if (l.resumo && l.resumo.trim()) return l.resumo.trim();
  if (l.acao === 'criou') return 'Cadastro criado';
  const antes = l.dados_anteriores ?? {}; const depois = l.dados_novos ?? {};
  const partes: string[] = [];
  for (const k of Object.keys({ ...antes, ...depois })) {
    if (foraDoHistorico(k)) continue;
    const a = antes[k] ?? null; const d = depois[k] ?? null;
    if (JSON.stringify(a) === JSON.stringify(d)) continue;
    partes.push(`${ROTULO[k] ?? k}: ${valorLegivel(k, a)} → ${valorLegivel(k, d)}`);
  }
  return partes.length > 0 ? partes.join(' · ') : 'Ajuste interno (sem campo da tela)';
}

/** quem: o nome do usuário; sem usuário, a rotina que gravou (P116: `sistema:<via>`) */
export function quemMudou(l: LinhaDaTrilha, nomes: ReadonlyMap<string, string>): string {
  if (l.usuario_id) return nomes.get(l.usuario_id) ?? 'usuário';
  return l.via ? `sistema · ${l.via.replace(/^sistema:/, '')}` : 'sistema';
}

export function historicoDoCadastro(linhas: readonly LinhaDaTrilha[], nomes: ReadonlyMap<string, string>): MudancaDoCadastro[] {
  return [...linhas].sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(l => ({ quando: dataBR(l.created_at), quem: quemMudou(l, nomes), oQue: oQueMudou(l) }));
}

/** "em uso desde" = o mês de partida do rebanho; sem ele, o início mais antigo dos pastos; sem nenhum, nada (sentinela "—") */
export function emUsoDesde(partida: string | null, iniciosDosPastos: readonly (string | null | undefined)[]): string | null {
  if (partida) return partida.slice(0, 7);
  const datas = iniciosDosPastos.filter((d): d is string => !!d).map(d => d.slice(0, 7)).sort();
  return datas[0] ?? null;
}
export const mesAnoBR = (anoMes: string | null): string => (anoMes ? `${anoMes.slice(5, 7)}/${anoMes.slice(0, 4)}` : '—');

/** o ponto da sede (infra `sede_casa`, GeoJSON Point [long, lat]) → "lat · long" com 4 casas */
export function pontoDaSede(geo: unknown): { lat: number; lng: number; texto: string } | null {
  if (!geo || typeof geo !== 'object' || !('type' in geo) || !('coordinates' in geo)) return null;
  if (geo.type !== 'Point' || !Array.isArray(geo.coordinates) || geo.coordinates.length < 2) return null;
  const [lng, lat] = geo.coordinates.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const f = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return { lat, lng, texto: `${f(lat)} · ${f(lng)}` };
}

/** o Salvar só acende quando algo mudou (comparação campo a campo com o que se leu) */
export function camposQueMudaram(lido: Record<string, unknown>, atual: Record<string, unknown>): string[] {
  return Object.keys(atual).filter(k => (lido[k] ?? '') !== (atual[k] ?? ''));
}
