/**
 * VISAO-GERAL-02 — "Precisa de atenção" e "Atalhos" (mock aprovado, 03/11/2026).
 * Cada item de atenção vem pronto da fonte da tela dona e leva direto para ela. Item sem fonte não entra (regra: "o que não tem fonte
 * fica fora"). Lista vazia = a frase "Nada pendente neste mês." — nunca um bloco em branco.
 */
import type { V2Section } from '@/v2/lib/navGrupos';

export interface ItemAtencao {
  id: string;
  texto: string;
  acao: string;
  onIr: () => void;
}

export function PrecisaDeAtencao({ itens, carregando }: { itens: readonly ItemAtencao[]; carregando?: boolean }) {
  return (
    <div className="bg-card rounded-xl border border-border/40 p-4" data-testid="vg-atencao">
      <h3 className="text-sm font-semibold text-foreground">Precisa de atenção</h3>
      <ul className="mt-2 space-y-1.5">
        {carregando && itens.length === 0 ? (
          <li className="text-[12px] text-muted-foreground">Conferindo…</li>
        ) : itens.length === 0 ? (
          <li className="text-[12px] text-muted-foreground">Nada pendente neste mês.</li>
        ) : itens.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 text-[12px]" data-testid={`vg-atencao-${i.id}`}>
            <span className="min-w-0 truncate" title={i.texto}>{i.texto}</span>
            <button type="button" className="shrink-0 text-primary hover:underline" onClick={i.onIr}>{i.acao} ›</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { Atalho } from './atalhosDaVisao';
import type { Atalho } from './atalhosDaVisao';

export function AtalhosVG({ atalhos, onIr }: { atalhos: readonly Atalho[]; onIr: (s: V2Section) => void }) {
  return (
    <div className="bg-card rounded-xl border border-border/40 p-4" data-testid="vg-atalhos">
      <h3 className="text-sm font-semibold text-foreground">Atalhos</h3>
      <div className="mt-2 grid grid-cols-2 2xl:grid-cols-3 gap-2">
        {atalhos.map((a) => (
          <button key={a.id} type="button" onClick={() => onIr(a.id)}
            className="text-left text-[12px] border border-border/60 rounded-lg px-3 py-2 hover:border-primary/50 hover:bg-muted/40 transition-colors truncate">
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}
