import { AbaLiquidacaoOC } from './AbaLiquidacaoOC';
import type { LiquidacaoApi } from '@/hooks/useOperacaoLiquidacao';

// Aba Financeiro consolidada (PR-FINANCEIRO-ESTRUTURA-01, etapa 01a).
//   HOSPEDA o conteúdo integral de AbaLiquidacaoOC — resumo da liquidação, Títulos (obrigações)
//   e detalhe de Liquidações — sem alterar lógica, estado, cálculos ou hooks. Wrapper mecânico:
//   os mesmos props chegam por prop drilling; NENHUMA nova instância de hook é criada
//   (useOperacaoLiquidacao segue único, em LancamentosTab → api.liquidacaoApi).
//
//   A seção "Composição" de nível-operação NÃO faz parte deste PR (os componentes econômicos
//   por documento permanecem em AbaDocumentosOC). Composição agregada = PR-COMPRA-COMPOSICAO-01.
interface Props {
  api: LiquidacaoApi;
  operacaoPronta: boolean;
  darkSelectClass: string;
  somenteLeitura?: boolean;
  onIrParaDocumentos?: () => void;
}

export function AbaFinanceiroOC(props: Props) {
  return <AbaLiquidacaoOC {...props} />;
}
