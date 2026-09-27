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
import { AsideResumo, FaixaTituloResumo } from '@/components/ui/linha-resumo';

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
  /** Botão de ação do rodapé. O "Fechar" já vem no envelope.
   *  ⚠ NA MEDIDA DO RODAPE DE 32px: 22px / 10px (MODAIS-PADRAO-01d). O envelope nao o redimensiona. */
  acao: ReactNode;
}

export function LancamentoModalEnvelope({
  titulo, cenario = 'realizado', data, fazendaNome, onFechar, children, resumo, acao,
}: LancamentoModalEnvelopeProps) {
  const isMeta = cenario === 'meta';
  const faixa = isMeta ? META_VISUAL.faixa : 'bg-primary';
  const cenarioRotulo = isMeta ? META_VISUAL.label : 'Realizado';

  return (
        /* ⚠ A CASCA DO ABATE, DA VENDA E DA COMPRA — MODAIS-PADRAO-01d. Cabecalho 36, rodape 32
           com botoes 22/10px, e a altura mora AQUI (`100vh-32`), uma vez so': as duas faixas sao
           `shrink-0` e so' o corpo rola (A21). Antes o corpo era `69vh + 38px` — os 38 eram a
           faixa de abas que esta tela nao tem, para fechar na altura da compra; com a altura no
           topo, a conta sumiu. O resumo lateral e' o do Abate (`ui/linha-resumo`), 240px e
           esticado ate' o rodape. Campos, resumo e botoes continuam vindo por slot. */
        <div className="flex flex-col h-[calc(100vh-32px)]">
          <div className={`h-9 shrink-0 ${faixa} text-primary-foreground px-4 flex items-center gap-3`}>
            <h2 className="shrink-0 text-[13px] font-semibold leading-none">{titulo}</h2>
            {/* ⚠ ROTULO, NAO CONTROLE — e por isso ele tem de dizer a VERDADE.
                O seletor de cenario saiu em 056054e7, e o rotulo ficou o literal
                'Realizado'. So' que a rota `lancamentos-meta-zoo` abre a MESMA
                tela com o cenario ja' em 'meta': a pilula dizia realizado enquanto
                o payload gravava meta. Agora sai do estado real, junto com a cor
                da faixa — uma fonte so' (PR-ZOO-META-IDENTIDADE-01). */}
            <span className="shrink-0 rounded-md border border-white/40 px-2 py-px text-[10px] leading-none">{cenarioRotulo}</span>
            <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-white/85">
              <Calendar className="h-3 w-3 shrink-0" /> {data ? data.split('-').reverse().join('/') : '—'}
            </span>
            {/* ⚠ A FAZENDA ESCOLHIDA, nao a do contexto. `fazendaAtual?.nome` e'
                "Global" no modo Global, e este cabecalho chegou a anunciar isso
                enquanto o seletor, a faixa de topo, o resumo lateral e a
                confirmacao mostravam a fazenda certa — quatro contra um.
                Sem escolha, "—": o mesmo traco de ausencia que a faixa de topo usa.
                "Global" ali nao e' ausencia, e' outra coisa, e foi o que confundiu. */}
            <span className="flex min-w-0 items-center gap-1 truncate whitespace-nowrap text-[11px] text-white/85">
              <Building2 className="h-3 w-3 shrink-0" /> {fazendaNome ?? '—'}
            </span>
            <button type="button" onClick={onFechar} className="ml-auto shrink-0 text-white/80 hover:text-white"
              title="Fechar" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_240px]">
            <div className="min-h-0 min-w-0 space-y-1.5 overflow-y-auto bg-muted/30 p-2">
              {children}
            </div>

            {/* RESUMO LATERAL — as pecas do Abate: a faixa de titulo, e o miolo de cada tipo
                (blocos com `SecaoResumo` e pares `LinhaResumo`) dentro do card que rola. */}
            <div className="lg:min-h-0">
              <AsideResumo faixa={<FaixaTituloResumo titulo={isMeta ? 'Resumo da meta' : 'Resumo do lançamento'} />}>
                {resumo}
              </AsideResumo>
            </div>
          </div>

          <div className={`h-8 shrink-0 ${faixa} px-2 flex items-center justify-end gap-2`}>
            <Button type="button" variant="ghost" onClick={onFechar}
              className="h-[22px] px-[9px] text-[10px] text-white/90 hover:bg-white/10 hover:text-white" title="Fechar sem registrar" aria-label="Fechar">
              Fechar
            </Button>
            {acao}
          </div>
        </div>
  );
}
