/* MAPA-02b (D4) — a bancada nunca chama o Google nem o OSM: o fundo é NEUTRO e local (a cor do contêiner do mapa, sem tile). Os créditos
   são os de verdade (o controle real), com um copyright SINTÉTICO do tamanho dos reais. `fundo=sem-satelite` na URL = o caminho da
   queda (OSM + o aviso), sem tile também. */
import type L from 'leaflet';
import { CREDITO_OSM, FRASE_SEM_SATELITE, type FundoDoMapa } from '../../../src/lib/mapa/fundoDoMapa';

export interface CreditosDoFundo { tipo: 'google' | 'osm' | 'nenhum'; texto: string; aviso: string | null }
export const CREDITOS_VAZIOS: CreditosDoFundo = { tipo: 'nenhum', texto: '', aviso: null };
export const ESPERA_DA_VISTA_MS = 400;
export const ERROS_ATE_DESISTIR = 3;
export const COPYRIGHT_SINTETICO = 'Imagens ©2026 Airbus, CNES / Airbus, Maxar Technologies, Dados do mapa ©2026';

export function montarFundo(_map: L.Map, pedido: FundoDoMapa, aoMudar: (c: CreditosDoFundo, ativo: FundoDoMapa) => void): () => void {
  const semSatelite = new URLSearchParams(window.location.search).get('fundo') === 'sem-satelite';
  if (pedido === 'mapa') aoMudar({ tipo: 'osm', texto: CREDITO_OSM, aviso: null }, 'mapa');
  else if (semSatelite) aoMudar({ tipo: 'osm', texto: CREDITO_OSM, aviso: FRASE_SEM_SATELITE }, 'mapa');
  else aoMudar({ tipo: 'google', texto: COPYRIGHT_SINTETICO, aviso: null }, 'satelite');
  return () => {};
}
