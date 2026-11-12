/**
 * VISAO-GERAL-02 — "Precisa de atenção" e "Atalhos" (mock aprovado, 03/11/2026).
 * Cada item de atenção vem pronto da fonte da tela dona e leva direto para ela. Item sem fonte não entra (regra: "o que não tem fonte
 * fica fora"). Lista vazia = a frase "Nada pendente neste mês." — nunca um bloco em branco.
 * VISAO-GERAL-03: o quadro é o `Card` da Geo pastos › Global (título 11 px); os itens a 11 px.
 * VISAO-GERAL-04 (Gabriel 04/11 07:04): os Atalhos saíram da Visão Geral (o menu lateral já faz isso); o quadro de atenção mora na coluna
 * da direita e estica até o fim dela (`className`).
 * VISAO-GERAL-04 (mock aprovado 08/11): o quadro fica ao lado do "Mapa das fazendas", com o mês no cabeçalho.
 */
import { Card } from '@/components/mapa-geo/GeoPastosGlobal';

export interface ItemAtencao {
  id: string;
  texto: string;
  /** o texto inteiro, quando o `texto` é a versão curta de uma linha */
  title?: string;
  acao: string;
  onIr: () => void;
}

export function PrecisaDeAtencao({ itens, carregando, className, mes }: {
  itens: readonly ItemAtencao[]; carregando?: boolean; className?: string;
  /** VISAO-GERAL-04 (V3) — o mês da régua no cabeçalho ("set/26"): a lista segue esse mês */
  mes?: string;
}) {
  return (
    <Card titulo="Precisa de atenção" testid="vg-atencao" className={className}
      extra={mes ? <span className="ml-auto whitespace-nowrap text-[9.5px] text-muted-foreground" data-testid="vg-atencao-mes">{mes}</span> : undefined}>
      <ul className="space-y-1 px-2.5 pb-2.5">
        {carregando && itens.length === 0 ? (
          <li className="text-[11px] text-muted-foreground">Conferindo…</li>
        ) : itens.length === 0 ? (
          <li className="text-[11px] text-muted-foreground">Nada pendente neste mês.</li>
        ) : itens.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 whitespace-nowrap text-[11px]" data-testid={`vg-atencao-${i.id}`} title={i.title ?? i.texto}>
            <span>{i.texto}</span>
            <button type="button" className="shrink-0 text-primary hover:underline" onClick={i.onIr}>{i.acao} ›</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
