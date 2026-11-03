/**
 * MAPA-ROTULO-POR-CAMADA-01 (Gabriel 02/11 16:00, Ursa Maior: com "Camadas: Cabeças" a cor mudava e o rótulo seguia "1.945 kg/ha") — a 2ª
 * linha do rótulo de cada pasto segue a CAMADA ativa (a mesma escolha que pinta e que faz a legenda):
 *   Situação da lotação / Lotação → "1,22 UA/ha" (UA/ha principal, como os cartões; o kg/ha no title) · Cabeças → "120 cab." ·
 *   Atividade → a fase/atividade ("Cria", "Lavoura · Soja") · Tipo de área → "Pasto" · Área (ha) → "25,3 ha" (a oficial do cadastro; se a
 *   do mapa difere > 1 %, "25,3 ha · mapa 25,6").
 * Vazio continua "vazio" e sem fechamento "—" nas camadas de rebanho; o pasto fora da pecuária diz o uso (nunca "vazio").
 * "Mostrar área no rótulo" (Filtros) acrescenta "· 25,3 ha" em qualquer camada (na de área ela já é o rótulo). Puro.
 */
import { formatNum } from '@/lib/calculos/formatters';
import { uaPorHa } from '@/lib/mapa/faixasLotacao';
import { rotuloDaAtividade, type CamadaDoMapa } from '@/lib/mapa/camadasDoMapa';

export interface PastoParaRotulo {
  temFechamento: boolean;
  cabecas: number | null;
  pesoMedioKg: number | null;
  kgHa: number | null;
  atividade: string | null;
  /** o rótulo do uso quando o pasto NÃO é pecuária no mês ("Lavoura · Amendoim", "Reserva"); null = pecuária */
  foraDaPecuaria: string | null;
  areaCadastroHa: number | null;
  areaMapaHa: number | null;
}

/** "25,3 ha", ou "25,3 ha · mapa 25,6" quando a área do mapa difere mais de 1 % da oficial; sem a oficial, "mapa 25,6 ha". */
export function textoDaArea(cadastro: number | null, mapa: number | null): string {
  if (cadastro == null || !(cadastro > 0)) return mapa != null ? `mapa ${formatNum(mapa, 1)} ha` : '—';
  const difere = mapa != null && Math.abs(mapa - cadastro) / cadastro > 0.01;
  return `${formatNum(cadastro, 1)} ha${difere ? ` · mapa ${formatNum(mapa, 1)}` : ''}`;
}

export function rotuloDoPastoNaCamada(camada: CamadaDoMapa, p: PastoParaRotulo, mostrarArea: boolean): { sub: string; titulo: string } {
  const area = textoDaArea(p.areaCadastroHa, p.areaMapaHa);
  const kgHaTexto = p.kgHa != null ? `${formatNum(p.kgHa, 0)} kg/ha` : null;
  let sub: string;
  let extra: string | null = null;
  if (camada === 'area') sub = area;
  else if (p.foraDaPecuaria) sub = camada === 'tipo_area' ? 'Pasto' : p.foraDaPecuaria;
  else if (camada === 'tipo_area') sub = 'Pasto';
  else if (!p.temFechamento) sub = '—';
  else if ((p.cabecas ?? 0) === 0) sub = 'vazio';
  else if (camada === 'cabecas') sub = `${formatNum(p.cabecas, 0)} cab.`;
  else if (camada === 'atividade') sub = rotuloDaAtividade(p.atividade);
  else {
    const ua = uaPorHa(p.cabecas, p.pesoMedioKg, p.areaCadastroHa);
    sub = ua != null ? `${formatNum(ua, 2)} UA/ha` : kgHaTexto ?? '—';
    extra = ua != null ? kgHaTexto : null;
  }
  if (mostrarArea && camada !== 'area' && area !== '—') sub = `${sub} · ${area}`;
  return { sub, titulo: extra ? `${sub} (${extra})` : sub };
}
