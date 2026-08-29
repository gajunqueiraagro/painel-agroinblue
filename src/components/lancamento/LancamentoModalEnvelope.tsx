/**
 * LancamentoModalEnvelope — a casca dos modais de lançamento simples.
 *
 * ⚠ EXTRAIDO, NAO ESCRITO. Todo o JSX abaixo veio de `NascimentoModalShell`, movido
 * byte a byte; `MorteModalShell` tinha exatamente o mesmo — conferido linha a linha,
 * as unicas diferencas eram o texto do <h2>, o nome da variavel da fazenda e os
 * comentarios. Nenhuma medida foi redigitada.
 *
 * ⚠ POR QUE AGORA. A casca nasceu no CompraModalShell (PR-OC-MODAL-TAMANHO-01), foi
 * copiada para o Nascimento (PR-UI-NASCIMENTO-SHELL-02) e de novo para a Morte
 * (PR-ZOO-MORTE-NO-SHELL-01). Na terceira copia a divida ficou declarada; em
 * PR-ZOO-META-IDENTIDADE-01 ela cobrou o preco — dez edicoes onde uma bastaria, so'
 * para trocar a cor da faixa. A quarta copia nao se justificava.
 *
 * ⚠ NAO HA CONDICIONAL DE TIPO AQUI DENTRO, e isso e' requisito, nao estilo. O
 * envelope conhece `cenario` — de onde saem a cor da faixa e o rotulo da pilula, uma
 * fonte so' — e mais nada. Campos, resumo e regras entram por slot e continuam
 * morando com cada tipo. No dia em que este arquivo precisar perguntar "que tipo e'
 * este?", a extracao foi longe demais.
 *
 * ⚠ O CompraModalShell NAO foi migrado. Ele tem faixa de abas e outras medidas; junta-lo
 * exigiria mexer numa tela em producao sem mandato. Fica como quarta casca, e a decisao
 * de unificar e' de PR-UI-LANCAMENTOS-SIMPLES-PADRAO-02.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, Building2, X } from 'lucide-react';
import { META_VISUAL } from '@/lib/statusOperacional';

export interface LancamentoModalEnvelopeProps {
  /** Texto do <h2> no cabeçalho: "Nascimento", "Morte". */
  titulo: string;
  /** Cenário DO REGISTRO. Fonte única: dele saem a cor da faixa E o rótulo da pílula.
   *  ⚠ Eram duas decisões separadas e foi assim que a pílula do Nascimento passou a
   *  mentir — um literal 'Realizado' num caminho que grava meta. */
  cenario?: 'meta' | 'realizado';
  /** Data em ISO (yyyy-mm-dd); o cabeçalho a imprime em dd/mm/aaaa, ou "—". */
  data: string;
  /** Nome da fazenda DO LANÇAMENTO, nunca a do contexto. Sem escolha, "—". */
  fazendaNome: string | null;
  onFechar: () => void;
  /** Coluna esquerda: os campos do tipo. */
  children: ReactNode;
  /** Miolo do resumo lateral — os blocos, sem a faixa de título. */
  resumo: ReactNode;
  /** Botão de ação do rodapé. O "Fechar" já vem no envelope. */
  acao: ReactNode;
}

export function LancamentoModalEnvelope({
  titulo, cenario = 'realizado', data, fazendaNome, onFechar, children, resumo, acao,
}: LancamentoModalEnvelopeProps) {
  const isMeta = cenario === 'meta';
  const faixa = isMeta ? META_VISUAL.faixa : 'bg-primary';
  const cenarioRotulo = isMeta ? META_VISUAL.label : 'Realizado';

  return (
        <div className="flex flex-col">
          <div className={`${faixa} text-primary-foreground px-6 py-2.5 flex items-start justify-between`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">{titulo}</h2>
                {/* ⚠ ROTULO, NAO CONTROLE — e por isso ele tem de dizer a VERDADE.
                    O seletor de cenario saiu em 056054e7, e o rotulo ficou o literal
                    'Realizado'. So' que a rota `lancamentos-meta-zoo` abre a MESMA
                    tela com o cenario ja' em 'meta': a pilula dizia realizado enquanto
                    o payload gravava meta. Agora sai do estado real, junto com a cor
                    da faixa — uma fonte so' (PR-ZOO-META-IDENTIDADE-01). */}
                <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs">{cenarioRotulo}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {data ? data.split('-').reverse().join('/') : '—'}</span>
                {/* ⚠ A FAZENDA ESCOLHIDA, nao a do contexto. `fazendaAtual?.nome` e'
                    "Global" no modo Global, e este cabecalho chegou a anunciar isso
                    enquanto o seletor, a faixa de topo, o resumo lateral e a
                    confirmacao mostravam a fazenda certa — quatro contra um.
                    Sem escolha, "—": o mesmo traco de ausencia que a faixa de topo usa.
                    "Global" ali nao e' ausencia, e' outra coisa, e foi o que confundiu. */}
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {fazendaNome ?? '—'}</span>
              </div>
            </div>
            <button type="button" onClick={onFechar} className="text-white/80 hover:text-white shrink-0"
              title="Fechar" aria-label="Fechar"><X className="h-5 w-5" /></button>
          </div>

          {/* ⚠ `+38px` E' A FAIXA DE ABAS QUE ESTA TELA NAO TEM. O corpo da Compra e'
              `h-[69vh]` e ela ainda carrega 38px de abas; sem absorver isso, este modal
              fecharia 38px mais baixo e os dois nunca pareceriam o mesmo.
              Em `calc` e nao num vh novo porque o que falta e' uma altura FIXA — vh
              acertaria numa janela e erraria em todas as outras. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:grid-rows-[minmax(0,1fr)] gap-3 p-4 h-[calc(69vh_+_38px)] overflow-y-auto lg:overflow-hidden bg-muted/30">
            <div className="space-y-2 min-w-0 lg:min-h-0 lg:overflow-y-auto">
              {children}
            </div>

            {/* RESUMO LATERAL — idioma do ResumoLateralOC: faixa de titulo, blocos com
                faixa, pares rotulo-valor alinhados a direita, traco no vazio. */}
            <div className="lg:min-h-0 lg:overflow-y-auto">
              <aside className="bg-card rounded-md border shadow-sm overflow-hidden self-start text-[10px]">
                <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
                  {isMeta ? 'Resumo da meta' : 'Resumo do lançamento'}
                </div>
                {resumo}
              </aside>
            </div>
          </div>

          <div className={`${faixa} px-6 py-2 flex items-center justify-end gap-3`}>
            <Button type="button" variant="ghost" onClick={onFechar}
              className="text-white/90 hover:bg-white/10 hover:text-white" title="Fechar sem registrar" aria-label="Fechar">
              Fechar
            </Button>
            {acao}
          </div>
        </div>
  );
}
