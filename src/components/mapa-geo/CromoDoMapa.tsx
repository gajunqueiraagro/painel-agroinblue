/**
 * MAPA-CROMO-01 — o gerenciador do que flutua sobre o mapa da Validação (zonas fixas: `src/lib/mapa/cromoDoMapa.ts`).
 * Zona de cima: o AVISO de "escolha o polígono" é uma barra no padrão da `BarraDeEdicaoDoPoligono` (2 linhas fixas: instrução + Cancelar
 * FIXO à direita; a dica embaixo), nunca pílula. Abaixo/ao lado: a zona do painel (barra do polígono) à esquerda e a dos botões à direita,
 * na MESMA linha — o painel cede (o nome encurta), os botões nunca. Os atributos `data-cromo` são o que o gate mede.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { frasesDoAviso, zonasVisiveis, type EstadoDoCromo } from '@/lib/mapa/cromoDoMapa';

interface Props {
  estado: EstadoDoCromo;
  /** o rótulo do tipo pedido (ex.: "Sede / benfeitorias"); só importa com `estado.pedindoPoligono` */
  rotuloDoPedido: string | null;
  onCancelarPedido: () => void;
  /** MAPA-AREA-TIPOS-02: as duas opções do pedido — "Desenhar nova" (padrão) e "Escolher existente"; ausentes = só escolher (como antes) */
  modoDoPedido?: 'desenhar' | 'escolher';
  onDesenharNova?: () => void;
  onEscolherExistente?: () => void;
  painel: ReactNode;
  botoes: ReactNode;
}

export function CromoDoMapa({ estado, rotuloDoPedido, onCancelarPedido, modoDoPedido, onDesenharNova, onEscolherExistente, painel, botoes }: Props) {
  const z = zonasVisiveis(estado);
  const comDuasOpcoes = !!onDesenharNova && !!onEscolherExistente;
  const frases = frasesDoAviso(rotuloDoPedido ?? 'área', comDuasOpcoes ? modoDoPedido ?? 'desenhar' : 'escolher');
  return (
    <>
      {z.aviso && (
        <div className="absolute left-3 right-3 top-2 z-20 rounded-md border border-border bg-card/95 px-2 py-1 shadow-md backdrop-blur-sm"
          data-cromo="aviso" data-testid="validacao-tipo-pedido">
          <div className="flex h-[22px] items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[9.5px] font-semibold text-foreground" title={frases.inteira}>{frases.curta}</p>
            {comDuasOpcoes && (
              /* MAPA-AREA-TIPOS-02: lado a lado — "Desenhar nova" (padrão, começa o desenho) e "Escolher existente" (clique num polígono) */
              <div className="flex flex-none gap-1" data-testid="validacao-tipo-pedido-opcoes">
                <Button size="sm" variant={modoDoPedido === 'escolher' ? 'outline' : 'default'} className="h-5 px-2 text-[9.5px]"
                  onClick={onDesenharNova} data-testid="validacao-tipo-pedido-desenhar">Desenhar nova</Button>
                <Button size="sm" variant={modoDoPedido === 'escolher' ? 'default' : 'outline'} className="h-5 px-2 text-[9.5px]"
                  onClick={onEscolherExistente} data-testid="validacao-tipo-pedido-escolher">Escolher existente</Button>
              </div>
            )}
            <Button variant="outline" size="sm" className="h-5 flex-none px-2 text-[9.5px]" onClick={onCancelarPedido} data-testid="validacao-tipo-pedido-cancelar">
              Cancelar
            </Button>
          </div>
          <p className="h-[18px] truncate text-[9.5px] leading-[18px] text-muted-foreground" title={frases.dica}>{frases.dica}</p>
        </div>
      )}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-2" data-testid="validacao-topo">
        {z.painel ? <div className="flex min-w-0 pointer-events-none" data-cromo="painel">{painel}</div> : <span />}
        {z.botoes && <div className="flex flex-none pointer-events-none" data-cromo="botoes">{botoes}</div>}
      </div>
    </>
  );
}
