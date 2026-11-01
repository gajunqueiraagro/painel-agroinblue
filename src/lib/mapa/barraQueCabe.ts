/**
 * MAPA-EDITAR-POLIGONO-09 (UI-ESPACO-RESERVADO, Gabriel 01/11 17:52, Pureza › 6B→P6 em Vértices: "está empurrando para a direita e sumindo
 * o salvar") — a 1ª linha da barra de edição tem um bloco FIXO à direita (Cancelar · Prévia e gravar, largura reservada) e uma zona que se
 * acomoda: a instrução e os botões de ação. Quem decide o que cabe é esta conta (pura, com as larguras medidas na tela):
 *   1º tudo inteiro; 2º a instrução vira o ícone ⓘ (o texto inteiro no `title`); 3º os botões do fim vão para "Mais ▾", um a um.
 * Nada aqui encolhe o bloco fixo: ele nem entra na conta.
 */
export interface LargurasDaZona {
  /** a largura da zona que se acomoda (já sem as escolhas do gesto e sem o bloco fixo) */
  disponivel: number;
  instrucaoInteira: number;
  instrucaoCurta: number;
  /** cada botão de ação, na ordem em que aparecem */
  acoes: readonly number[];
  /** o botão "Mais ▾" */
  mais: number;
  /** o espaço entre os itens */
  gap: number;
}

export interface ArranjoDaZona { instrucaoInteira: boolean; acoesVisiveis: number }

export function arranjarZona(l: LargurasDaZona): ArranjoDaZona {
  const n = l.acoes.length;
  const largura = (instrucao: number, k: number) => {
    const acoes = l.acoes.slice(0, k).reduce((s, w) => s + w + l.gap, 0);
    return instrucao + acoes + (k < n ? l.mais + l.gap : 0);
  };
  if (largura(l.instrucaoInteira, n) <= l.disponivel) return { instrucaoInteira: true, acoesVisiveis: n };
  for (let k = n; k >= 0; k--) {
    if (largura(l.instrucaoCurta, k) <= l.disponivel) return { instrucaoInteira: false, acoesVisiveis: k };
  }
  return { instrucaoInteira: false, acoesVisiveis: 0 };
}
