/**
 * MAPA-02b — monta o FUNDO no mapa Leaflet: o satélite do Google (sessão de `fundoDoMapa.ts`) ou o OpenStreetMap, e diz os créditos
 * da área visível. Trocar o fundo desmonta a camada e monta a outra no MESMO mapa (nada se recria) e reaproveita a sessão (D6).
 * A bancada (`scripts/ui-cortes`) troca este módulo por um fundo neutro local: nenhuma chamada ao Google nem ao OSM nos gates (D4).
 */
import L from 'leaflet';
import {
  CREDITO_GOOGLE_RESERVA, CREDITO_OSM, FRASE_SEM_SATELITE, URL_OSM, ZOOM_MAXIMO_OSM, ZOOM_MAXIMO_SATELITE_INICIAL,
  assinaturaDaVista, chaveDoGoogle, lerInfoDaVista, sessaoDoGoogle, urlDaVista, urlDosTiles, type FundoDoMapa, type LimitesDaVista,
} from './fundoDoMapa';

export interface CreditosDoFundo {
  /** 'nenhum' = ainda sem fundo (esperando a sessão): o lugar dos créditos fica reservado e vazio. */
  tipo: 'google' | 'osm' | 'nenhum';
  texto: string;
  aviso: string | null;
}

export const CREDITOS_VAZIOS: CreditosDoFundo = { tipo: 'nenhum', texto: '', aviso: null };

/** Espera da leitura do viewport depois de o mapa parar (D6: um pedido por parada, não por quadro). */
export const ESPERA_DA_VISTA_MS = 400;
/** Tiles que falham antes do primeiro que carrega = o satélite não serve (chave recusada, site fora da trava): cai no OSM. */
export const ERROS_ATE_DESISTIR = 3;
/* MAPA-SAT-FRESTA-01 (Gabriel 01/11): no zoom fracionado (ZOOM_SNAP 0,25) o Leaflet escala os ladrilhos e sobra uma fresta de
   fração de pixel entre as fileiras, por onde aparece o fundo do `.leaflet-container` — o #ddd padrão, uma linha clara sobre a foto
   (provado pintando o fundo de magenta: a linha ficou magenta; no zoom inteiro, nenhuma). Atrás do SATÉLITE o fundo passa a ser o
   escuro do quadro e a fresta quase some; no OSM (claro) volta o padrão, onde o #ddd não aparece. Esticar o ladrilho (257/256,5 px)
   foi testado e cria linhas claras nas duas direções. */
export const FUNDO_ATRAS_DO_SATELITE = '#3a4436';

export interface DependenciasDoFundo {
  chave: string | null;
  buscar: typeof fetch;
}

const limitesDe = (map: L.Map): LimitesDaVista => {
  const b = map.getBounds();
  return { norte: b.getNorth(), sul: b.getSouth(), leste: b.getEast(), oeste: b.getWest() };
};

/**
 * Monta o fundo pedido e devolve como DESMONTAR. `aoMudar` recebe os créditos e o fundo que de fato está na tela (pedido satélite que
 * caiu no OSM = 'mapa', com o aviso).
 */
export function montarFundo(
  map: L.Map,
  pedido: FundoDoMapa,
  aoMudar: (creditos: CreditosDoFundo, ativo: FundoDoMapa) => void,
  deps: DependenciasDoFundo = { chave: chaveDoGoogle(), buscar: fetch },
): () => void {
  let vivo = true;
  let camada: L.TileLayer | null = null;
  let timer: number | null = null;
  let ultimaVista = '';
  let aoParar: (() => void) | null = null;

  const tirarCamada = () => {
    if (camada) map.removeLayer(camada);
    camada = null;
    if (aoParar) map.off('moveend', aoParar);
    aoParar = null;
    if (timer != null) window.clearTimeout(timer);
    timer = null;
  };

  const montarOsm = (aviso: string | null) => {
    if (!vivo) return;
    tirarCamada();
    camada = L.tileLayer(URL_OSM, { maxZoom: ZOOM_MAXIMO_OSM }).addTo(map);
    map.getContainer().style.backgroundColor = '';
    map.setMaxZoom(ZOOM_MAXIMO_OSM);
    aoMudar({ tipo: 'osm', texto: CREDITO_OSM, aviso }, 'mapa');
  };

  if (pedido === 'mapa') {
    montarOsm(null);
  } else if (!deps.chave) {
    montarOsm(FRASE_SEM_SATELITE);
  } else {
    const chave = deps.chave;
    // solto do objeto: o `fetch` do navegador chamado como `deps.buscar(url)` recusa ("Illegal invocation") e o viewport falhava calado
    const buscar = deps.buscar;
    sessaoDoGoogle(chave, Date.now(), buscar).then((s) => {
      if (!vivo) return;
      let carregou = false;
      let erros = 0;
      const google = L.tileLayer(urlDosTiles(s.session, chave), { tileSize: s.tileWidth, maxZoom: 22 });
      google.on('tileload', () => { carregou = true; });
      google.on('tileerror', () => {
        if (carregou || !vivo) return;
        erros += 1;
        if (erros >= ERROS_ATE_DESISTIR) montarOsm(FRASE_SEM_SATELITE);
      });
      camada = google.addTo(map);
      map.getContainer().style.backgroundColor = FUNDO_ATRAS_DO_SATELITE;
      map.setMaxZoom(ZOOM_MAXIMO_SATELITE_INICIAL);
      aoMudar({ tipo: 'google', texto: CREDITO_GOOGLE_RESERVA, aviso: null }, 'satelite');

      const lerVista = () => {
        if (!vivo || camada !== google) return;
        const l = limitesDe(map);
        const zoom = map.getZoom();
        const assinatura = assinaturaDaVista(zoom, l);
        if (assinatura === ultimaVista) return;
        ultimaVista = assinatura;
        const centro = map.getCenter();
        buscar(urlDaVista(s.session, chave, zoom, l))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`viewport ${r.status}`))))
          .then((j: unknown) => {
            if (!vivo || camada !== google) return;
            const info = lerInfoDaVista(j, { lat: centro.lat, lng: centro.lng });
            if (info.zoomMaximo !== null) map.setMaxZoom(info.zoomMaximo);
            aoMudar({ tipo: 'google', texto: info.copyright || CREDITO_GOOGLE_RESERVA, aviso: null }, 'satelite');
          })
          .catch(() => {
            /* viewport fora: fica o crédito de reserva e o zoom inicial (o satélite segue) */
          });
      };
      aoParar = () => {
        if (timer != null) window.clearTimeout(timer);
        timer = window.setTimeout(lerVista, ESPERA_DA_VISTA_MS);
      };
      map.on('moveend', aoParar);
      aoParar();
    }).catch(() => montarOsm(FRASE_SEM_SATELITE));
  }

  return () => {
    vivo = false;
    tirarCamada();
  };
}
