/**
 * BlocoEntradasSaidas — "Entradas e Saídas" como bloco próprio do Boletim
 * (PR-BOLETIM-2.1B). Reusa a MESMA ComposicaoFinanceira (pizza + tabela) que
 * vivia dentro do Fluxo; zero cálculo/derivação aqui. Mesmo DTO, mesmo modal.
 */
import { BoletimContainer } from './boletim/BoletimContainer';
import { ComposicaoFinanceira, type LinhaModalKey } from '../V2PlanejamentoVisaoGeral.parts/ComposicaoFinanceira';
import type { BlocoResumoExecutivoData } from '@/v2/lib/blocoResumoExecutivoTypes';

type Props = {
  data: BlocoResumoExecutivoData;
  subtitulo?: string;
  onLinhaClick?: (key: LinhaModalKey) => void;
};

export function BlocoEntradasSaidas({ data, subtitulo, onLinhaClick }: Props) {
  return (
    <BoletimContainer titulo="Entradas e Saídas" subtitulo={subtitulo} badge="CAIXA" tone="financeiro">
      <ComposicaoFinanceira data={data} modo="fechamento" onLinhaClick={onLinhaClick} />
    </BoletimContainer>
  );
}
