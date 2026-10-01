/**
 * A ÁREA DE DECISÃO da Mesa — PR-CONC-MESA-FAIXAS-FIXAS-01 (regra soberana do Gabriel: layout fixo).
 *
 * ⚠ ALTURA FIXA, SEMPRE PRESENTE, entre a tabela e o rodapé. As faixas de decisão (sobrescrever/desfazer, juntar grupo,
 *   agrupar o split, candidatos) nasciam ABAIXO da tabela só quando a linha pedia: o rodapé não andava, mas a TABELA
 *   encolhia — e a rolagem dela ligava e desligava ao trocar de linha. Agora a área existe em toda linha, com o mesmo
 *   tamanho; vazia, diz que não há decisão.
 * ⚠ O CONTEÚDO VARIÁVEL ROLA DENTRO DELA, nunca empurra: a lista de candidatos ocupa o que sobra entre o cabeçalho e o
 *   botão dela (`preencher`) e é ELA que rola; as faixas de altura conhecida cabem inteiras.
 * ⚠ 104px, MEDIDO: a faixa do split (três linhas de números + o botão) é a mais alta das faixas fixas (~78px); os
 *   candidatos precisam do cabeçalho (24) + uma fileira de dois candidatos (~41) + o botão (33) = 98. 104 cabe as duas
 *   sem rolar a área; 8 candidatos (4 fileiras) rolam dentro da lista.
 */
import type { ReactNode } from 'react';

export const ALTURA_AREA_DECISAO = '104px';

export function AreaDecisao({ children }: { children?: ReactNode }) {
  return (
    <div data-testid="area-decisao" style={{ height: ALTURA_AREA_DECISAO }}
      className="flex shrink-0 flex-col overflow-y-auto border-t text-[10.5px]">
      {children ?? (
        <p data-testid="area-decisao-vazia" className="flex flex-1 items-center px-3 text-[10px] text-muted-foreground">
          Nenhuma decisão pendente nesta linha.
        </p>
      )}
    </div>
  );
}
