import { EnriquecerTresPassos } from '@/v2/components/mesa/enriquecimento/EnriquecerTresPassos';

/**
 * EnriquecerPorPlanilha — a aba Enriquecer da Conciliação.
 *
 * ⚠ ELA DEIXOU DE SER "A TELA DA IMPORTAÇÃO INTEIRA" — [ENRIQUECER-TELA-01] (133b). Até
 * aqui este componente montava `V2ImportLancamentosExcel` em modo veste, e a Mesa era um
 * segundo bloco logo abaixo: dois motores respondendo à mesma pergunta com números
 * diferentes, e o operador sem saber qual usar. Agora há uma tela em três passos, e ela
 * usa o motor da Mesa (staging + casar_sessao + apply_row); o que sobrou do importador é
 * a leitura do arquivo e o de-para com memória, dentro do passo 1.
 *
 * ⚠ A ROTA DO MENU NÃO MUDOU. "Importação de lançamentos" segue com
 * `V2ImportLancamentosExcel` completo — lá se CRIA lançamento; aqui só se veste o que já
 * nasceu do OFX soberano. A diferença é de intenção, não de motor.
 *
 * ⚠ `useConciliacaoDoMes` SAIU DAQUI JUNTO COM O "BAIXAR PREENCHIDO". Ele existia para
 * montar o modelo pré-preenchido com os movimentos do mês, que era prop de
 * `V2ImportLancamentosExcel`; sem aquele botão nesta aba, a consulta do mês seria uma ida
 * ao banco cujo resultado ninguém lê. O download do modelo continua na rota do menu.
 */
interface Props {
  clienteId: string | null;
  contaId: string | null;
  contaNome: string;
  ano: number;
  mes: number;
  /** O destino do "Ver no Financeiro" do modal de progresso — ligado na 133c. */
  onVerNoFinanceiro?: () => void;
  clienteNome?: string;
}

export function EnriquecerPorPlanilha({ contaNome, ano, mes, clienteNome, onVerNoFinanceiro }: Props) {
  return (
    <EnriquecerTresPassos
      ano={ano}
      mes={mes}
      clienteNome={clienteNome}
      /* ⚠ ELE ESTAVA NO CONTRATO E NÃO DESCIA — 133b deixou a prop sem destino porque o
         passo 3 ainda não gravava. Agora grava, e o relatório final oferece a navegação. */
      onVerNoFinanceiro={onVerNoFinanceiro}
      /* A conta da régua é CONTEXTO do cabeçalho; a partição de trabalho é a do passo 2,
         que a lê do próprio staging — duas fontes para "qual conta" divergiriam. */
      contaNome={contaNome || undefined}
    />
  );
}
