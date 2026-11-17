/**
 * VISAO-GERAL-02 — "Precisa de atenção" e "Atalhos" (mock aprovado, 03/11/2026).
 * Cada item de atenção vem pronto da fonte da tela dona e leva direto para ela. Item sem fonte não entra (regra: "o que não tem fonte
 * fica fora"). Lista vazia = a frase "Nada pendente neste mês." — nunca um bloco em branco.
 * VISAO-GERAL-03: o quadro é o `Card` da Geo pastos › Global (título 11 px); os itens a 11 px.
 * VISAO-GERAL-04 (Gabriel 04/11 07:04): os Atalhos saíram da Visão Geral (o menu lateral já faz isso); o quadro de atenção mora na coluna
 * da direita e estica até o fim dela (`className`).
 * VISAO-GERAL-04 (mock aprovado 08/11): o quadro fica ao lado do "Mapa das fazendas", com o mês no cabeçalho.
 * VISAO-GERAL-PENDENCIAS-01 (mock v2 aprovado 17/11 06:53): "Pendências do mês" COMPACTO — a altura é a do conteúdo; UMA TABELA de régua
 *   fixa: o texto (uma linha, "…" + `title`) · o NÚMERO à direita num lugar fixo (64px, nunca corta) · a ação num lugar fixo (78px).
 *   Nada pendente = UMA linha "✓ Tudo em dia".
 */
import type { ReactNode } from 'react';
import { Card } from '@/components/mapa-geo/GeoPastosGlobal';

export interface ItemAtencao {
  id: string;
  texto: string;
  /** o texto inteiro, quando o `texto` é a versão curta de uma linha */
  title?: string;
  /** o número da linha, à direita (`null`/ausente = a linha não tem contagem, ex.: o fechamento de uma fazenda) */
  numero?: number | null;
  acao: string;
  onIr: () => void;
}

export function PrecisaDeAtencao({ itens, carregando, className, mes }: {
  itens: readonly ItemAtencao[]; carregando?: boolean; className?: string;
  /** VISAO-GERAL-04 (V3) — o mês da régua no cabeçalho ("set/26"): a lista segue esse mês */
  mes?: string;
}) {
  const umaLinha = (conteudo: ReactNode, cls: string) => (
    <tr className="h-[20px] border-t border-border/60"><td colSpan={3} className={`whitespace-nowrap px-2.5 text-[11px] ${cls}`}>{conteudo}</td></tr>
  );
  return (
    <Card titulo="Pendências do mês" testid="vg-atencao" className={className}
      extra={mes ? <span className="ml-auto whitespace-nowrap text-[9.5px] text-muted-foreground" data-testid="vg-atencao-mes">{mes}</span> : undefined}>
      <table className="mb-1.5 w-full table-fixed border-collapse text-[11px]" data-testid="vg-atencao-tabela">
        <colgroup><col /><col style={{ width: 64 }} /><col style={{ width: 78 }} /></colgroup>
        <tbody>
          {carregando && itens.length === 0 ? umaLinha('Conferindo…', 'text-muted-foreground')
            : itens.length === 0 ? umaLinha(<span data-testid="vg-atencao-em-dia">✓ Tudo em dia</span>, 'text-success')
            : itens.map((i) => (
              <tr key={i.id} className="h-[20px] border-t border-border/60" data-testid={`vg-atencao-${i.id}`}>
                <td className="truncate whitespace-nowrap px-2.5" title={i.title ?? i.texto}>{i.texto}</td>
                <td className="whitespace-nowrap pr-1 text-right font-semibold tabular-nums" data-testid={`vg-atencao-${i.id}-numero`}>
                  {i.numero == null ? '' : i.numero.toLocaleString('pt-BR')}
                </td>
                <td className="whitespace-nowrap pr-2.5 text-right">
                  <button type="button" className="text-primary hover:underline" onClick={i.onIr}>{i.acao} ›</button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}
