/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a (P3) — o pedido à `fn_piquetes_criar` e a frase da prévia. A RPC ganha dois parâmetros (a mudança de banco
 * é do arquiteto): `p_areas jsonb` = [{ nome, tipo, geojson }] (a praça é `benfeitoria` "Praça de alimentação"; o corredor, `estrada`
 * "Corredor") e `p_infra jsonb` = [{ tipo: 'cocho', nome: 'Cocho', ponto: [lng, lat] }]. Vão na prévia E no gravar. Puro.
 */
import { areaDoBancoHa, haDoBanco } from '@/lib/mapa/criarPiquetes';
import { extrasParaGravar, type Desenho } from '@/lib/mapa/desenhoDosPiquetes';
import { NOME_DA_PRACA, NOME_DO_CORREDOR, type AreaParaGravar, type InfraParaGravar } from '@/lib/mapa/linhasDosPiquetes';

export interface PiqueteParaGravar { nome: string; geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null; pasto_id: string | null }
export interface PedidoDosPiquetes {
  p_pasto_pai: string | undefined; p_mes: string | null; p_contorno: null; p_simular: boolean;
  p_piquetes: PiqueteParaGravar[]; p_areas: AreaParaGravar[]; p_infra: InfraParaGravar[];
}

export function pedidoDosPiquetes(a: {
  paiId: string | undefined; mes: string | null; simular: boolean; piquetes: PiqueteParaGravar[]; desenho: Desenho; cocho: boolean;
}): PedidoDosPiquetes {
  const extras = extrasParaGravar(a.desenho, a.cocho);
  return {
    p_pasto_pai: a.paiId, p_mes: a.mes, p_contorno: null, p_simular: a.simular,
    p_piquetes: a.piquetes, p_areas: extras.areas, p_infra: extras.infra,
  };
}

export interface LinhaDaSecao { nome: string; tipo: string; areaHa: number | null }
/** A seção própria da prévia: a praça, o corredor e o cocho (nome, tipo, área). */
export function secaoDaPrevia(areas: readonly AreaParaGravar[], infra: readonly InfraParaGravar[]): LinhaDaSecao[] {
  return [
    ...areas.map((x): LinhaDaSecao => ({ nome: x.nome, tipo: x.tipo === 'benfeitoria' ? 'benfeitoria (área da fazenda)' : 'estrada', areaHa: areaDoBancoHa(x.geojson) })),
    ...infra.map((x): LinhaDaSecao => ({ nome: x.nome, tipo: 'infraestrutura', areaHa: null })),
  ];
}

const haBr = (ha: number) => haDoBanco(ha).toFixed(2).replace('.', ',');

/** "Modulo 03-A…D" quando os nomes só diferem na letra final; senão os nomes (até 4) separados por vírgula. */
export function nomesEmFrase(nomes: readonly string[]): string {
  const ns = nomes.map(x => x.trim()).filter(Boolean);
  if (ns.length < 2) return ns.join(', ');
  const ordenados = [...ns].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const base = ordenados[0].slice(0, -1);
  if (ordenados.every(x => x.startsWith(base) && x.length === base.length + 1)) return `${ordenados[0]}…${ordenados[ordenados.length - 1].slice(-1)}`;
  return ordenados.length <= 4 ? ordenados.join(', ') : `${ordenados.slice(0, 3).join(', ')}…`;
}

/** A frase da prévia (a do mock): "4 pastos novos (Modulo 03-A…D, 24,40 ha cada) · Praça de alimentação 0,28 ha (área da fazenda, dentro de
 *  Modulo 03) · Cocho no centro da praça (infraestrutura) · o contorno de Modulo 03 fica." */
export function fraseDaPrevia(a: {
  paiNome: string; caso: 'novo' | 'grupo_existente'; piquetes: readonly { nome: string; areaHa: number }[]; areas: readonly AreaParaGravar[]; infra: readonly InfraParaGravar[];
}): string {
  const n = a.piquetes.length;
  const has = a.piquetes.map(p => haBr(p.areaHa));
  const iguais = has.length > 0 && has.every(x => x === has[0]);
  const medida = !n ? '' : iguais ? `${has[0]} ha cada` : `${haBr(Math.min(...a.piquetes.map(p => p.areaHa)))} a ${haBr(Math.max(...a.piquetes.map(p => p.areaHa)))} ha`;
  const quais = a.caso === 'novo' ? (n === 1 ? 'pasto novo' : 'pastos novos') : (n === 1 ? 'divisão do cadastro ligada' : 'divisões do cadastro ligadas');
  const partes = [`${n} ${quais} (${[nomesEmFrase(a.piquetes.map(p => p.nome)), medida].filter(Boolean).join(', ')})`];
  for (const x of a.areas) {
    partes.push(x.tipo === 'benfeitoria'
      ? `${NOME_DA_PRACA} ${haBr(areaDoBancoHa(x.geojson))} ha (área da fazenda, dentro de ${a.paiNome})`
      : `${NOME_DO_CORREDOR} ${haBr(areaDoBancoHa(x.geojson))} ha (estrada, dentro de ${a.paiNome})`);
  }
  if (a.infra.some(x => x.tipo === 'cocho')) partes.push('Cocho no centro da praça (infraestrutura)');
  partes.push(`o contorno de ${a.paiNome} fica.`);
  return partes.join(' · ');
}
