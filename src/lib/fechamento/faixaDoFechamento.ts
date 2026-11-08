/**
 * FECH-FAIXA-01 (Gabriel 08/11 07:17) — a FAIXA DO FECHAMENTO: Fechamento área, Valor do Rebanho e Mapa do rebanho são etapas do MESMO
 * fechamento do mês do pasto. Uma linha, no topo das 3 telas, no mesmo lugar:
 *   "Out/26 · ① Pastos 17/17 fechados ✓ → ② Valor do rebanho ⏳ falta validar → ③ Mapa do rebanho"
 * Só TEXTO e TOM a partir das fontes que já existem (nenhuma conta nova):
 *   · ① a regra da tela do Fechamento: os pastos do mês (`pastosDoFechamentoNoMes`) × os cards com status 'fechado';
 *   · ② o snapshot do Valor do Rebanho (`valor_rebanho_realizado_validado`: validado / invalidado / cadeia quebrada / sem snapshot)
 *     e, validado, o valor que ELE guarda (`valor_total`, `preco_arroba_medio`).
 */
import { formatMoeda, formatMoedaInt } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import type { SnapshotStatusValue } from '@/hooks/useSnapshotStatus';

export type EtapaDoFechamento = 'pastos' | 'valor' | 'mapa';
export type TomDaEtapa = 'ok' | 'pendente' | 'alerta' | 'neutro';

export interface EstadoDaFaixa {
  anoMes: string;
  /** nulo = ainda lendo (ou sem dado) */
  pastos: { fechados: number; total: number } | null;
  valor: { situacao: SnapshotStatusValue; valorTotal: number | null; precoArroba: number | null } | null;
}

export interface PassoDaFaixa {
  etapa: EtapaDoFechamento;
  numero: '①' | '②' | '③';
  texto: string;
  tom: TomDaEtapa;
  /** o texto inteiro, para o `title` */
  title: string;
}

/** "2026-10" → "Out/26" */
export function mesDaFaixa(anoMes: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(anoMes);
  return m ? `${MESES_NOMES[Number(m[2]) - 1]}/${m[1].slice(2)}` : anoMes;
}

function passoDosPastos(p: EstadoDaFaixa['pastos']): Omit<PassoDaFaixa, 'etapa' | 'numero'> {
  if (!p) return { texto: 'Pastos —', tom: 'neutro', title: 'Pastos do mês: lendo' };
  if (p.total === 0) return { texto: 'Pastos —', tom: 'neutro', title: 'Nenhum pasto no mês' };
  const todos = p.fechados >= p.total;
  return {
    texto: `Pastos ${p.fechados}/${p.total} fechados${todos ? ' ✓' : ''}`,
    tom: todos ? 'ok' : 'pendente',
    title: todos ? 'Todos os pastos do mês estão fechados' : `${p.total - p.fechados} pasto(s) do mês ainda sem fechar`,
  };
}

function passoDoValor(v: EstadoDaFaixa['valor']): Omit<PassoDaFaixa, 'etapa' | 'numero'> {
  if (!v) return { texto: 'Valor do rebanho —', tom: 'neutro', title: 'Valor do rebanho: lendo' };
  if (v.situacao === 'validado') {
    const valor = v.valorTotal != null ? ` ${formatMoedaInt(v.valorTotal)}` : '';
    const arroba = v.precoArroba != null ? ` · ${formatMoeda(v.precoArroba)}/@` : '';
    return { texto: `Valor do rebanho ✓${valor}${arroba}`, tom: 'ok', title: 'Valor do rebanho validado' };
  }
  if (v.situacao === 'invalidado') {
    /* REABRIR-AUTOMATICO-01 (Gabriel 08/11 08:15): reaberto pelo pasto, o ② diz "aberto" (o banco marca o snapshot como invalidado; o
       rebanho que mudou depois da validação também cai aqui — os dois pedem validar de novo) */
    return { texto: 'Valor do rebanho ⚠ aberto — valide de novo', tom: 'alerta', title: 'O Valor do Rebanho deste mês foi reaberto (ou o rebanho mudou depois da validação): valide de novo' };
  }
  if (v.situacao === 'cadeia_quebrada') {
    return { texto: 'Valor do rebanho ⚠ cadeia quebrada', tom: 'alerta', title: 'Um mês anterior foi reaberto: resolva os meses em ordem' };
  }
  return { texto: 'Valor do rebanho ⏳ falta validar', tom: 'pendente', title: 'O Valor do Rebanho deste mês ainda não foi validado' };
}

export function passosDaFaixa(e: EstadoDaFaixa): PassoDaFaixa[] {
  return [
    { etapa: 'pastos', numero: '①', ...passoDosPastos(e.pastos) },
    { etapa: 'valor', numero: '②', ...passoDoValor(e.valor) },
    { etapa: 'mapa', numero: '③', texto: 'Mapa do rebanho', tom: 'neutro', title: 'O Mapa do rebanho do mês' },
  ];
}

/** ① pela regra da tela do Fechamento: dos pastos do mês, quantos têm o card com status 'fechado' */
export function contarPastosFechados(pastoIdsDoMes: readonly string[], statusPorPasto: ReadonlyMap<string, string>): { fechados: number; total: number } {
  return { fechados: pastoIdsDoMes.filter(id => statusPorPasto.get(id) === 'fechado').length, total: pastoIdsDoMes.length };
}
