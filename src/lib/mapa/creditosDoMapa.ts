/**
 * MAPA-02b (D3) — os CRÉDITOS do fundo como controle Leaflet no canto de baixo à direita, LOGO ABAIXO do zoom (P1, Gabriel 31/10):
 * andam junto com o zoom (no Gestor, a regra que leva o canto para a esquerda com o painel aberto ou acima da legenda sem lugar).
 *
 * MAPA-COMPACTO-01 (Gabriel 31/10, "como no AgriWebb"): sem a pílula escura de 32 px. O logo CONTORNADO direto sobre o mapa, no
 * tamanho padrão (16 px, o mínimo da Google; nunca ampliado nem deformado), e o texto numa faixa clara translúcida mínima, em UMA
 * linha, 9,5 px (o piso da casa), alinhada pela base com o logo e com a legenda do Gestor.
 * Regras da Google (Map Tiles API › Policies, developers.google.com/maps/documentation/tile/policies):
 *   - logo: não modificar; altura de 16 a 19 dp; espaço livre de 10 dp à esquerda, à direita e em cima, 5 dp embaixo (aqui é o
 *     padding TRANSPARENTE da caixa + a margem da faixa — nada da casa entra nele); contornado sobre imagem; rótulo "Google Maps";
 *   - atribuição: o `copyright` do viewport, INTEIRO (nunca cortado nem abreviado), em geral no canto de baixo à direita; se não
 *     couber, um elemento "Data sources" que abre DENTRO do mapa — aqui o botão "Fontes dos dados" com o texto inteiro num balão.
 * Lugar: a caixa tem a altura fixa do logo + o espaço livre (31 px); o texto muda dentro da faixa e nada acima se mexe.
 */
import L from 'leaflet';
import logoGoogle from '@/assets/google-maps-logo-contornado.svg';
import type { CreditosDoFundo } from './camadaDoFundo';

export const ALTURA_DO_LOGO_PX = 16;
/** espaço livre do logo exigido pela Google (dp = px css aqui) */
export const LIVRE_DO_LOGO = { lados: 10, cima: 10, baixo: 5 };
/** a caixa: espaço livre de cima + logo + espaço livre de baixo */
export const ALTURA_DOS_CREDITOS_PX = LIVRE_DO_LOGO.cima + ALTURA_DO_LOGO_PX + LIVRE_DO_LOGO.baixo;
/** a largura máxima da caixa; texto que não cabe vira o botão "Fontes dos dados" (nunca cortado) */
export const LARGURA_MAXIMA_DOS_CREDITOS_PX = 560;
/** a margem de baixo do controle: a base do logo e da faixa fica a 12 px do pé do mapa, a mesma da legenda do Gestor */
export const MARGEM_DE_BAIXO_DOS_CREDITOS_PX = 7;
/** a tela que tem vidros ao lado do canto (o Gestor: Filtros, painel) diz quanto espaço sobra: `new CustomEvent(EVENTO, { detail: px })`
    na caixa `[data-testid="mapa-creditos"]`; sem lugar para o texto inteiro, vira o botão "Fontes dos dados" (nunca cortado) */
export const EVENTO_LIMITE_DOS_CREDITOS = 'mapa-creditos:limite';

export interface ControleDeCreditos {
  controle: L.Control;
  atualizar: (c: CreditosDoFundo) => void;
}

export function criarControleDeCreditos(): ControleDeCreditos {
  const caixa = L.DomUtil.create('div', 'leaflet-control');
  caixa.dataset.testid = 'mapa-creditos';
  Object.assign(caixa.style, {
    position: 'relative', height: `${ALTURA_DOS_CREDITOS_PX}px`, maxWidth: `${LARGURA_MAXIMA_DOS_CREDITOS_PX}px`, boxSizing: 'border-box',
    display: 'flex', alignItems: 'flex-end', padding: `${LIVRE_DO_LOGO.cima}px 0 ${LIVRE_DO_LOGO.baixo}px ${LIVRE_DO_LOGO.lados}px`,
    marginBottom: `${MARGEM_DE_BAIXO_DOS_CREDITOS_PX}px`, background: 'transparent', clear: 'both', pointerEvents: 'auto', visibility: 'hidden',
  });
  L.DomEvent.disableClickPropagation(caixa);
  L.DomEvent.disableScrollPropagation(caixa);

  const logo = L.DomUtil.create('img', '', caixa);
  logo.src = logoGoogle;
  logo.alt = 'Google Maps';
  logo.setAttribute('aria-label', 'Google Maps');
  logo.dataset.testid = 'mapa-creditos-logo';
  Object.assign(logo.style, { height: `${ALTURA_DO_LOGO_PX}px`, width: 'auto', flex: 'none', display: 'none' });

  /* a faixa clara do texto: uma linha, sem cortar; a margem esquerda é o espaço livre à direita do logo */
  const faixa = L.DomUtil.create('span', '', caixa);
  faixa.dataset.testid = 'mapa-creditos-faixa';
  Object.assign(faixa.style, {
    display: 'flex', alignItems: 'center', gap: '6px', minWidth: '0', overflow: 'hidden', whiteSpace: 'nowrap', height: '14px',
    padding: '0 4px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.72)', color: '#1D232B', fontSize: '9.5px', lineHeight: '14px',
  });
  const texto = L.DomUtil.create('span', '', faixa);
  texto.dataset.testid = 'mapa-creditos-texto';
  const aviso = L.DomUtil.create('span', '', faixa);
  aviso.dataset.testid = 'mapa-creditos-aviso';
  Object.assign(aviso.style, { flex: 'none', color: '#8A5A00', display: 'none' });

  /* sem lugar para o texto inteiro: o botão "Fontes dos dados" abre o texto inteiro num balão dentro do mapa (criados só quando
     precisam — o texto do controle é só a atribuição) */
  let botao: HTMLButtonElement | null = null;
  let balao: HTMLDivElement | null = null;
  let atual = '';
  const fecharBalao = () => { balao?.remove(); balao = null; };
  const abrirBalao = () => {
    if (balao) { fecharBalao(); return; }
    balao = L.DomUtil.create('div', '', caixa);
    balao.dataset.testid = 'mapa-creditos-balao';
    balao.textContent = atual;
    Object.assign(balao.style, {
      position: 'absolute', right: '0', bottom: 'calc(100% + 4px)', width: '280px', padding: '6px 8px', borderRadius: '4px',
      background: 'rgba(255, 255, 255, 0.96)', color: '#1D232B', fontSize: '9.5px', lineHeight: '13px', whiteSpace: 'normal',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    });
  };
  const modoFontes = (ligar: boolean) => {
    if (ligar && !botao) {
      botao = L.DomUtil.create('button', '', faixa);
      botao.type = 'button';
      botao.dataset.testid = 'mapa-creditos-fontes';
      botao.textContent = 'Fontes dos dados';
      Object.assign(botao.style, { flex: 'none', background: 'none', border: '0', padding: '0', color: '#2B6CB0', fontSize: '9.5px', cursor: 'pointer' });
      L.DomEvent.on(botao, 'click', abrirBalao);
    }
    if (!ligar && botao) { botao.remove(); botao = null; fecharBalao(); }
    texto.style.display = ligar ? 'none' : 'inline';
  };

  const Controle = L.Control.extend({ onAdd: () => caixa });
  const controle = new Controle({ position: 'bottomright' });

  /* o texto inteiro cabe numa linha? senão, o botão (nunca cortado) */
  const reavaliar = () => {
    modoFontes(false);
    /* a largura com o texto INTEIRO (mesmo limitada agora): a tela decide o rodapé por ela, nunca pela largura do botão */
    caixa.dataset.larguraInteira = String(caixa.offsetWidth - faixa.clientWidth + faixa.scrollWidth);
    if (faixa.scrollWidth > faixa.clientWidth + 1) modoFontes(true);
    else if (balao) balao.textContent = atual;
  };
  caixa.addEventListener(EVENTO_LIMITE_DOS_CREDITOS, (e) => {
    if (!(e instanceof CustomEvent) || typeof e.detail !== 'number') return;
    const limite = `${Math.max(0, Math.min(LARGURA_MAXIMA_DOS_CREDITOS_PX, Math.floor(e.detail)))}px`;
    if (caixa.style.maxWidth === limite) return;
    caixa.style.maxWidth = limite;
    reavaliar();
  });

  const atualizar = (c: CreditosDoFundo) => {
    const comLogo = c.tipo === 'google';
    caixa.style.visibility = c.tipo === 'nenhum' ? 'hidden' : 'visible';
    logo.style.display = comLogo ? 'block' : 'none';
    faixa.style.marginLeft = comLogo ? `${LIVRE_DO_LOGO.lados}px` : '0';
    atual = [c.texto, c.aviso ?? ''].filter(Boolean).join(' · ');
    texto.textContent = c.texto;
    aviso.textContent = c.aviso ?? '';
    aviso.style.display = c.aviso ? 'inline' : 'none';
    caixa.title = [comLogo ? 'Google Maps' : '', c.texto, c.aviso ?? ''].filter(Boolean).join(' · ');
    reavaliar();
  };

  return { controle, atualizar };
}
