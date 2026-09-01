import { useConciliacaoDoMes } from '@/hooks/useConciliacaoDoMes';
import { V2ImportLancamentosExcel } from '@/v2/pages/V2ImportLancamentosExcel';

/**
 * EnriquecerPorPlanilha — a planilha do mês, no modelo canônico da casa.
 * FIN-ENRIQUECER-EXCEL-01 (B-22a), primeira das três dores do Enriquecer.
 *
 * ⚠ A TELA É A DA IMPORTAÇÃO DE LANÇAMENTOS, INTEIRA. Nada do fluxo nasce aqui:
 * leitura do arquivo, de-para com memória de apelidos, prévia linha a linha,
 * confirmação e gravação são o motor de `useImportLancamentosExcel`, exercido
 * pelo mesmo componente que a rota do menu monta. Recriar o fluxo daria ao
 * operador dois formatos para a mesma planilha e ao repo dois lugares onde a
 * mesma regra pode divergir.
 *
 * ⚠ A ÚNICA DIFERENÇA É O PONTO DE PARTIDA: o modelo baixa PRÉ-PREENCHIDO com os
 * movimentos do mês e da conta da régua. Data, valor, tipo, conta bancária,
 * descrição e documento vêm do extrato; conta do plano, fazenda, fornecedor e
 * safra saem vazias — são o que o operador completa fora, e é para isso que o
 * arquivo existe.
 *
 * ⚠ ESTE COMPONENTE EXISTE PARA QUE O HOOK NÃO RODE NAS OUTRAS ABAS. Montar
 * `useConciliacaoDoMes` no corpo da tela de Conciliação faria a consulta do mês
 * a cada render de qualquer aba; aqui ela acontece quando a aba Enriquecer está
 * na tela, e só.
 */
interface Props {
  clienteId: string | null;
  contaId: string | null;
  contaNome: string;
  ano: number;
  mes: number;
}

export function EnriquecerPorPlanilha({ clienteId, contaId, contaNome, ano, mes }: Props) {
  const { movimentos, loading } = useConciliacaoDoMes(clienteId, contaId, ano, mes);

  return (
    <div className="space-y-1.5">
      {/* ⚠ O ESTADO DA CARGA É DITO, e não escondido: sem esta linha, quem
          apertasse "Baixar" durante a leitura levaria o modelo em branco sem
          entender por quê — e o modelo em branco é um arquivo legítimo, então
          nada pareceria errado. */}
      {loading ? (
        <p className="rounded border border-dashed px-3 py-2 text-[10px] text-muted-foreground">
          Lendo os movimentos do mês…
        </p>
      ) : !contaId ? (
        <p className="rounded border border-dashed px-3 py-2 text-[10px] text-muted-foreground">
          Escolha uma conta na régua acima para baixar a planilha já preenchida. Sem conta, o botão
          entrega o modelo em branco.
        </p>
      ) : movimentos.length === 0 ? (
        <p className="rounded border border-dashed px-3 py-2 text-[10px] text-muted-foreground">
          Nenhum movimento importado neste mês para esta conta — o botão entrega o modelo em branco,
          que é o arquivo certo para digitar do zero.
        </p>
      ) : null}

      <V2ImportLancamentosExcel
        movimentosDoExtrato={movimentos}
        contaNome={contaNome}
        /* `2026-08` no nome do arquivo: o operador acaba com vários downloads na
           pasta e a régua não viaja junto com o .xlsx. */
        sufixoArquivo={`${ano}-${String(mes).padStart(2, '0')}`}
      />
    </div>
  );
}
