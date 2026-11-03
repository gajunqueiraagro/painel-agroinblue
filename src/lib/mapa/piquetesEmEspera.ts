/**
 * MAPA-PIQUETES-02 (Gabriel 01/11/2026) — a ESPERA dos piquetes na visão VALIDAÇÃO e a leitura da prévia de `fn_piquetes_concluir`.
 *
 * O gesto: no painel do polígono, "É piquete de…" → o pasto-pai do cadastro. O polígono fica EM ESPERA (nada grava). "Concluir piquetes
 * de <pasto>" → o mês → a prévia (a RPC com p_simular) → grava tudo numa transação (pastos novos, vínculos, grupo, pai encerrado).
 * Aqui só o que a tela decide sozinha: quem pode entrar na espera, o agrupamento por pai, quando o "Concluir" acende, os meses
 * oferecidos e a leitura da resposta do banco. As recusas de verdade (mês travado, nome repetido, polígono já ligado…) são do banco.
 */

import { pontoDentro, pontoInterior } from '@/lib/mapa/linhasDosPiquetes';

export interface PiqueteEmEspera {
  geometriaId: string;
  nome: string;
  paiId: string;
}

/** O mínimo do polígono que a espera olha (a `FazendaGeometria` do hook encaixa). */
export interface PoligonoParaPiquete {
  id: string;
  nome_original: string | null;
  tipo?: string | null;
  pasto_id: string | null;
}

export type ResultadoDaMarca = { espera: PiqueteEmEspera[]; recusa: null } | { espera: PiqueteEmEspera[]; recusa: string };

/** Marca o polígono como piquete do pai. Trocar o pai de quem já está na espera troca a marca (nunca duplica). */
export function marcarPiquete(espera: readonly PiqueteEmEspera[], p: PoligonoParaPiquete, paiId: string): ResultadoDaMarca {
  const lista = [...espera];
  if (p.pasto_id) return { espera: lista, recusa: 'Este polígono já está ligado a um pasto: desvincule antes.' };
  if (p.tipo && p.tipo !== 'outra') return { espera: lista, recusa: 'Só polígono sem classificação vira piquete: tire a classificação antes.' };
  const nome = (p.nome_original ?? '').trim();
  if (!nome) return { espera: lista, recusa: 'O polígono não tem nome: dê um nome antes (ele vira o nome do pasto).' };
  const sem = lista.filter((x) => x.geometriaId !== p.id);
  return { espera: [...sem, { geometriaId: p.id, nome, paiId }], recusa: null };
}

/** Tira o polígono da espera (nada a gravar: a espera é só da tela). */
export function tirarDaEspera(espera: readonly PiqueteEmEspera[], geometriaId: string): PiqueteEmEspera[] {
  return espera.filter((x) => x.geometriaId !== geometriaId);
}

/** Tira da espera todos os piquetes de um pai (depois de gravar). */
export function limparPai(espera: readonly PiqueteEmEspera[], paiId: string): PiqueteEmEspera[] {
  return espera.filter((x) => x.paiId !== paiId);
}

/** A espera agrupada por pai, os piquetes de cada um em ordem de nome (a mesma ordem da prévia do banco). */
export function esperaPorPai(espera: readonly PiqueteEmEspera[]): Map<string, PiqueteEmEspera[]> {
  const m = new Map<string, PiqueteEmEspera[]>();
  for (const x of espera) m.set(x.paiId, [...(m.get(x.paiId) ?? []), x]);
  for (const [k, v] of m) m.set(k, [...v].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })));
  return m;
}

/** O "Concluir" só acende com 2 ou mais piquetes; o motivo vai ao lado do botão (o botão desabilitado diz por quê). */
export function motivoParaNaoConcluir(piquetes: readonly PiqueteEmEspera[]): string | null {
  return piquetes.length < 2 ? 'Marque pelo menos 2 polígonos.' : null;
}

export interface MesDeInicio { valor: string; rotulo: string }

/** Os meses oferecidos para o início: o mês atual e os `n - 1` anteriores (o banco recusa o travado com a frase dele). */
export function mesesDeInicio(hoje: Date, n = 4): MesDeInicio[] {
  const saida: MesDeInicio[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    saida.push({ valor: `${d.getFullYear()}-${mm}-01`, rotulo: `${mm}/${d.getFullYear()}` });
  }
  return saida;
}

export interface PiqueteDaPrevia { geometriaId: string; nome: string; areaHa: number }
export interface PreviaDosPiquetes {
  mes: string;
  pai: { id: string; nome: string; areaOficialHa: number | null; encerraEm: string };
  piquetes: PiqueteDaPrevia[];
  somaHa: number;
  difHa: number | null;
  difPct: number | null;
  grupo: { nome: string };
  frase: string;
  /** MAPA-PIQUETES-04: o contorno do pai — `criado` = nasce agora (a união das divisões); null = a RPC não disse */
  contorno: { criado: boolean; areaHa: number | null } | null;
}

const campo = (o: unknown, k: string): unknown => (o && typeof o === 'object' ? Reflect.get(o, k) : undefined);
const texto = (o: unknown, k: string): string | null => { const v = campo(o, k); return typeof v === 'string' ? v : null; };
const numero = (o: unknown, k: string): number | null => {
  const v = campo(o, k);
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Lê a prévia que a RPC devolve. Resposta fora do formato = null (a tela trata como falha, nunca como prévia vazia). */
export function lerPrevia(dado: unknown): PreviaDosPiquetes | null {
  if (campo(dado, 'ok') !== true || campo(dado, 'simulado') !== true) return null;
  const pai = campo(dado, 'pai');
  const lista = campo(dado, 'piquetes');
  const paiId = texto(pai, 'id'); const paiNome = texto(pai, 'nome'); const encerra = texto(pai, 'encerra_em');
  const mes = texto(dado, 'mes'); const soma = numero(dado, 'soma_ha');
  if (!paiId || !paiNome || !encerra || !mes || soma == null || !Array.isArray(lista)) return null;
  const piquetes: PiqueteDaPrevia[] = [];
  for (const i of lista) {
    const id = texto(i, 'geometria_id'); const nome = texto(i, 'nome'); const area = numero(i, 'area_ha');
    if (!id || !nome || area == null) return null;
    piquetes.push({ geometriaId: id, nome, areaHa: area });
  }
  return {
    mes, piquetes, somaHa: soma, difHa: numero(dado, 'dif_ha'), difPct: numero(dado, 'dif_pct'),
    pai: { id: paiId, nome: paiNome, areaOficialHa: numero(pai, 'area_oficial_ha'), encerraEm: encerra },
    grupo: { nome: texto(campo(dado, 'grupo'), 'nome') ?? paiNome },
    frase: texto(dado, 'frase') ?? '',
    contorno: ((c) => (c && typeof c === 'object' ? { criado: campo(c, 'criado') === true, areaHa: numero(c, 'area_ha') } : null))(campo(dado, 'contorno')),
  };
}

/** "2026-09-30" → "30/09/2026" (data sempre dd/mm/aaaa). */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** Área em ha com 2 casas e vírgula ("1.234,50"). */
export function haBr(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** PIQUETES-PRACA-CONCAVO-01 (item 3): os polígonos SEM classificação que já estão dentro do pasto (os piquetes que vieram no KMZ): antes de
 *  desenhar, a ferramenta oferece "É piquete de" para eles. Dentro = o ponto interior do polígono cai no contorno do pasto. */
export function soltosDentroDoPasto(
  contorno: GeoJSON.Polygon,
  geometrias: readonly { id?: string; pasto_id: string | null; tipo?: string | null; nome_original?: string | null; geojson?: GeoJSON.Geometry }[],
  contornoId: string | null,
): PoligonoParaPiquete[] {
  return geometrias.flatMap(x => {
    if (!x.id || x.id === contornoId || x.pasto_id || (x.tipo && x.tipo !== 'outra') || !x.geojson) return [];
    if (x.geojson.type !== 'Polygon' && x.geojson.type !== 'MultiPolygon') return [];
    if (!pontoDentro(contorno, pontoInterior(x.geojson))) return [];
    return [{ id: x.id, nome_original: x.nome_original ?? null, tipo: x.tipo ?? null, pasto_id: null }];
  });
}
