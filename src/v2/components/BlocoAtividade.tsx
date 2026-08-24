/**
 * Bloco de ATIVIDADE na Home — quatro numeros e uma porta.
 *
 * O QUE RESPONDE (C2, Art. 19.1): "o zootecnico esta bem?" — estoque e
 * producao contra o planejado. Hoje o usuario varre dezoito tiles sem
 * agrupamento; aqui sao quatro numeros por assunto, com o detalhe a um
 * clique.
 *
 * O CARD INTEIRO e o alvo do clique. O icone sinaliza que ha detalhe; ele
 * nao e o unico ponto clicavel, porque alvo pequeno em card grande e
 * armadilha de mira.
 *
 * NAO CALCULA. Recebe metrica pronta — valor ja formatado e delta ja
 * calculado. A polaridade (PR-14) vem por metrica: onde subir e RUIM, o
 * delta positivo pinta VERMELHO. Dar direcao a um indicador e nao ao outro
 * cria tile verde e modal vermelho sobre o mesmo numero.
 *
 * DADO AUSENTE e travessao, nunca zero (Art. 19.8) — quem formata o valor e
 * o chamador, e `null` chega como '—'.
 */
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MetricaBloco {
  rotulo: string;
  /** Ja formatado pelo chamador — o bloco nao formata nem arredonda. */
  valor: string;
  /** A comparacao MAIS relevante desta metrica. `null` = sem base. */
  delta: number | null;
  /** Rotulo curto do que o delta compara: "vs meta", "vs 2025". */
  deltaRotulo?: string;
  /** Onde subir e RUIM (PR-14). */
  inverseDelta?: boolean;
}

interface Props {
  titulo: string;
  /** Em linguagem comum, nao em jargao de indicador. */
  subtitulo: string;
  icone: LucideIcon;
  metricas: MetricaBloco[];
  onClick: () => void;
  loading?: boolean;
}

export function BlocoAtividade({ titulo, subtitulo, icone: Icone, metricas, onClick, loading }: Props) {
  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">{titulo}</p>
            <p className="text-[10px] text-muted-foreground/70 leading-snug">{subtitulo}</p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 text-muted-foreground/60">
            <Icone className="w-4 h-4" />
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {metricas.map(m => {
            const temDelta = m.delta != null && !isNaN(m.delta);
            /* Positivo e BOM por padrao; com `inverseDelta`, positivo e ruim.
               Zero nao e nem um nem outro — fica neutro. */
            const bom = !temDelta ? false
              : m.inverseDelta ? (m.delta as number) < 0 : (m.delta as number) > 0;
            return (
              <div key={m.rotulo} className="min-w-0">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground/70 leading-tight truncate">
                  {m.rotulo}
                </p>
                <p className="text-sm font-bold text-foreground leading-tight tabular-nums truncate">
                  {loading ? '…' : m.valor}
                </p>
                {temDelta ? (
                  <p className={`text-[9px] leading-tight ${bom ? 'text-emerald-600' : 'text-red-600'}`}>
                    {(m.delta as number) > 0 ? '+' : ''}{(m.delta as number).toFixed(1)}%
                    {m.deltaRotulo ? <span className="text-muted-foreground/60"> {m.deltaRotulo}</span> : null}
                  </p>
                ) : (
                  <p className="text-[9px] leading-tight text-muted-foreground/50">—</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
