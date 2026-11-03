/**
 * MAPA-CROMO-01 (Gabriel, homologação 02/11 07:46: o aviso "Escolha o polígono para marcar como Sede / b…" saía cortado e POR BAIXO do botão
 * "Ver fazenda inteira") — o "cromo" do mapa (tudo o que flutua sobre ele) tem ZONAS FIXAS e uma regra só de quem aparece quando:
 *   cima   — a barra do MODO ativo (edição, piquetes, o aviso de "escolha o polígono"): 2 linhas fixas, Cancelar sempre à direita;
 *   botoes — canto superior direito (Ver fazenda inteira · Pasto inteiro · Desenhar polígono novo): SAEM com qualquer modo;
 *   painel — a barra compacta do polígono selecionado (só sem modo);
 *   base   — o "Desfazer a última edição"; o zoom e os créditos ficam embaixo à direita (Leaflet).
 * Nunca duas zonas ocupam o mesmo lugar: o modo tira os botões e o painel.
 */
export type ZonaDoCromo = 'cima' | 'botoes' | 'painel' | 'aviso' | 'base';

export interface EstadoDoCromo {
  /** um gesto de edição aberto (vértices, redesenhar, dividir, unir, apagar, desenhar) */
  editando: boolean;
  /** o "Criar piquetes" aberto */
  piquetesAberto: boolean;
  /** veio do Adicionar › Área (ou Sede, Infraestrutura…) pedindo o polígono */
  pedindoPoligono: boolean;
  /** há polígono selecionado */
  selecionado: boolean;
}

export interface ZonasVisiveis { aviso: boolean; botoes: boolean; painel: boolean }

export function zonasVisiveis(e: EstadoDoCromo): ZonasVisiveis {
  const semModo = !e.editando && !e.piquetesAberto;
  const aviso = semModo && e.pedindoPoligono && !e.selecionado;
  return { aviso, botoes: semModo && !aviso, painel: semModo && e.selecionado };
}

/** As frases do aviso: a curta cabe na linha em qualquer largura do mapa; a inteira vai no `title`. */
export function frasesDoAviso(rotuloDoTipo: string, modo: 'escolher' | 'desenhar' = 'escolher'): { curta: string; inteira: string; dica: string } {
  /* MAPA-AREA-TIPOS-02 (Gabriel 02/11 15:54): o aviso oferece DESENHAR a área nova (padrão) ou ESCOLHER uma que já existe */
  if (modo === 'desenhar') {
    return {
      curta: `Marcar como ${rotuloDoTipo}: desenhe a área nova`,
      inteira: `Desenhe a área nova no mapa (ao gravar ela já fica como ${rotuloDoTipo}) ou escolha um polígono que já existe. Cancelar volta ao que estava.`,
      dica: 'Desenhar nova: clique os cantos no mapa · desfaz ponto, ajusta no rascunho, a prévia antes de gravar',
    };
  }
  return {
    curta: `Marcar como ${rotuloDoTipo}: escolha o polígono`,
    inteira: `Escolha o polígono (no mapa ou na lista) para marcar como ${rotuloDoTipo}. Cancelar volta ao que estava.`,
    dica: 'Clique num polígono no mapa ou na lista · o gesto só grava com a prévia',
  };
}
