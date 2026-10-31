/**
 * MAPA-02b (D3) — os CRÉDITOS do fundo como controle Leaflet no canto de baixo à direita, LOGO ABAIXO do zoom (P1, Gabriel 31/10):
 * andam junto com o zoom (no Gestor, a regra que já sobe o canto acima da legenda e o leva para a esquerda com o painel aberto).
 * Regras da Google: o logo CONTORNADO sobre imagem (16 px de altura, nunca deformado, 10 px livres dos lados e acima, 5 px abaixo,
 * rótulo de acessibilidade "Google Maps") e o copyright da área visível, sem nada por cima. No OpenStreetMap, "© OpenStreetMap".
 * Lugar FIXO (UI-SEM-DESLOCAR-01): altura reservada para 2 linhas; o texto muda dentro dela e nada acima se mexe; o texto inteiro
 * vai no `title`.
 */
import L from 'leaflet';
import logoGoogle from '@/assets/google-maps-logo-contornado.svg';
import type { CreditosDoFundo } from './camadaDoFundo';

export const ALTURA_DOS_CREDITOS_PX = 32;
export const LARGURA_MAXIMA_DOS_CREDITOS_PX = 360;
export const ALTURA_DO_LOGO_PX = 16;

export interface ControleDeCreditos {
  controle: L.Control;
  atualizar: (c: CreditosDoFundo) => void;
}

export function criarControleDeCreditos(): ControleDeCreditos {
  const caixa = L.DomUtil.create('div', 'leaflet-control');
  caixa.dataset.testid = 'mapa-creditos';
  Object.assign(caixa.style, {
    height: `${ALTURA_DOS_CREDITOS_PX}px`, maxWidth: `${LARGURA_MAXIMA_DOS_CREDITOS_PX}px`, boxSizing: 'border-box',
    display: 'flex', alignItems: 'flex-end', gap: '10px', padding: '0 8px 5px 8px', borderRadius: '4px',
    background: 'rgba(15, 20, 25, 0.55)', color: '#FFFFFF', fontSize: '9.5px', lineHeight: '12px', clear: 'both',
    pointerEvents: 'auto', visibility: 'hidden',
  });
  L.DomEvent.disableClickPropagation(caixa);
  L.DomEvent.disableScrollPropagation(caixa);

  const logo = L.DomUtil.create('img', '', caixa);
  logo.src = logoGoogle;
  logo.alt = 'Google Maps';
  logo.setAttribute('aria-label', 'Google Maps');
  logo.dataset.testid = 'mapa-creditos-logo';
  Object.assign(logo.style, { height: `${ALTURA_DO_LOGO_PX}px`, width: 'auto', flex: 'none', display: 'none' });

  const texto = L.DomUtil.create('span', '', caixa);
  texto.dataset.testid = 'mapa-creditos-texto';
  Object.assign(texto.style, { minWidth: '0', overflowWrap: 'anywhere', textShadow: '0 0 2px rgba(0,0,0,0.9)' });

  const aviso = L.DomUtil.create('span', '', caixa);
  aviso.dataset.testid = 'mapa-creditos-aviso';
  Object.assign(aviso.style, { flex: 'none', color: '#F6C35B', display: 'none' });

  const Controle = L.Control.extend({ onAdd: () => caixa });
  const controle = new Controle({ position: 'bottomright' });

  const atualizar = (c: CreditosDoFundo) => {
    caixa.style.visibility = c.tipo === 'nenhum' ? 'hidden' : 'visible';
    logo.style.display = c.tipo === 'google' ? 'block' : 'none';
    texto.textContent = c.texto;
    aviso.textContent = c.aviso ?? '';
    aviso.style.display = c.aviso ? 'inline' : 'none';
    caixa.title = [c.tipo === 'google' ? 'Google Maps' : '', c.texto, c.aviso ?? ''].filter(Boolean).join(' · ');
  };

  return { controle, atualizar };
}
