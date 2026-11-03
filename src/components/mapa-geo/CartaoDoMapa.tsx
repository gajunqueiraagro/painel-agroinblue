/**
 * MAPA-CARTOES-LARGURA-01 (Gabriel 02/11 12:19, Ursa Maior: "1.047 kg/ha 2,33 UA/h…" cortava e passava por baixo de "Área pastos") — o
 * CARTÃO de cima do mapa, um componente só (o MAPA-ATIVIDADES-01 usa o mesmo para todas as famílias). Regra UI-ESPACO-RESERVADO:
 * - a LARGURA é reservada pelo PIOR CASO do valor (`LARGURA_DO_CARTAO`, medida para os textos de `PIOR_CASO_DO_CARTAO` com algarismos
 *   tabulares) — o número nunca corta nem invade o vizinho;
 * - a ALTURA é fixa de 2 linhas de valor em TODOS os cartões: a principal e, embaixo, a secundária pequena (ex.: kg/ha sob o UA/ha). Cartão
 *   sem secundária reserva a linha vazia — trocar de mês, fazenda ou atividade não move nada.
 * Cada linha tem `overflow-hidden` e `data-linha-cartao`: o gate (`medirCartoesDoMapa`) mede se o texto pede mais que a largura.
 */
import type { ReactNode } from 'react';

/** O pior caso de cada cartão (os textos que a largura reservada tem de caber). */
export const PIOR_CASO_DO_CARTAO = {
  cabecas: '99.999 cab.',
  peso: '9.999 kg',
  lotacao: '99,99 UA/ha · 9.999 kg/ha',
  area: '99.999,9 ha',
} as const;

/** A largura reservada (px) de cada cartão, pelo pior caso acima (provada no gate com a bancada `cartoes=pior`). */
export const LARGURA_DO_CARTAO = { cabecas: 82, peso: 70, lotacao: 92, area: 88 } as const;

export function CartaoDoMapa({ rotulo, valor, unidade, secundario, largura, testid }: {
  rotulo: string;
  valor: string;
  unidade?: string | null;
  /** a 2ª linha pequena (ex.: "1.047 kg/ha" sob "2,33 UA/ha"); ausente = a linha fica reservada, vazia */
  secundario?: string | null;
  largura: number;
  testid?: string;
}): ReactNode {
  return (
    <div className="flex-none rounded-md bg-white/70 px-1.5 py-px" style={{ width: largura }} data-cartao-mapa={testid ?? rotulo} data-testid={testid}>
      <div className="overflow-hidden whitespace-nowrap text-[9.5px] leading-[11px] text-[#4A5361]" data-linha-cartao>{rotulo}</div>
      <div className="overflow-hidden whitespace-nowrap text-[12px] font-semibold leading-[15px] tabular-nums" data-linha-cartao>
        {valor}{unidade ? <span className="ml-0.5 text-[10px] font-normal text-[#4A5361]">{unidade}</span> : null}
      </div>
      <div className="h-[10px] overflow-hidden whitespace-nowrap text-[9.5px] leading-[10px] tabular-nums text-[#5A6472]" data-linha-cartao>
        {secundario ?? ''}
      </div>
    </div>
  );
}
