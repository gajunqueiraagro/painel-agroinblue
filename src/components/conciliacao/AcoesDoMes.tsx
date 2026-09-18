import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LayoutList, ListPlus } from 'lucide-react';
import { useConciliacaoDoMes } from '@/hooks/useConciliacaoDoMes';
import {
  useSaldoGerencialDoMes, useSaldoSistemaNaPosicao,
  useImportacoesDaConta, importacoesDoMes,
} from '@/hooks/useExtratoDaConta';
import { PalcoDoMes } from '@/components/conciliacao/PalcoDoMes';
import { ConciliarMesDialog } from '@/components/conciliacao/ConciliarMesDialog';

/**
 * AcoesDoMes — as duas portas que CONCILIAM o mês: "Conciliar o mês" e "Ver o mês".
 *
 * ⚠ ELAS MORAVAM NA ABA "IMPORTAR BANCO", e era isso que ensinava o fluxo errado —
 * PR-CONCILIACAO-PASSOS-01. O operador entrava para conferir se o extrato chegou completo e
 * encontrava, no mesmo cabeçalho, dois botões que GRAVAM vínculo e criam lançamento. O passo 1
 * (o arquivo está certo?) e o passo 2 (casar com o que já existe) aconteciam no mesmo lugar, e
 * quem explicava o próprio fluxo se perdia no meio.
 *
 * ⚠ E A SEPARAÇÃO É DE PRODUTO, NÃO DE ARRUMAÇÃO: importar é conferência, conciliar é decisão.
 * Misturar as duas faz o operador aprovar sem ter conferido — que é exatamente o que se quer
 * impedir numa conciliação bancária.
 *
 * ⚠ UM COMPONENTE PRÓPRIO, E NÃO OS BOTÕES SOLTOS NA ABA: eles dependem de dois números que o
 * `PainelExtratoMes` calculava para si — quantos arquivos de OFX o mês tem e o saldo do sistema
 * na posição. Repetir esses dois hooks na aba seria a segunda cópia da mesma leitura, e a
 * primeira divergência nasceria na primeira mudança de regra. Aqui eles moram uma vez.
 *
 * ⚠ O QUE OS BOTÕES FAZEM NÃO MUDOU NESTE PR — nem o rótulo, nem a régua, nem o momento de
 * gravar. Separar o passo é uma frente; mudar o que o passo faz é a seguinte.
 */
export function AcoesDoMes({ clienteId, contaId, contaNome, ano, mes, aoMudar }: {
  clienteId: string | null;
  contaId: string | null;
  contaNome: string;
  ano: number;
  mes: number;
  /** O que recarregar depois de gravar — a aba que monta decide. */
  aoMudar?: () => void | Promise<void>;
}) {
  const [verPalco, setVerPalco] = useState(false);
  const [verConciliarMes, setVerConciliarMes] = useState(false);

  const { movimentos, recarregar } = useConciliacaoDoMes(clienteId, contaId, ano, mes);
  const saldo = useSaldoGerencialDoMes(clienteId, contaId, ano, mes);
  const sistema = useSaldoSistemaNaPosicao(
    clienteId, contaId, saldo.anoMes, saldo.saldoInicial, saldo.posicaoEm);
  const importacoes = useImportacoesDaConta(clienteId, contaId);

  /* ⚠ MESMA RÉGUA DO BOTÃO ANTIGO: `situacao === 'nao_conciliado'` é o vínculo real (soma dos
     `valor_aplicado` ativos), não heurística. Movimento parcial fica de fora, como antes. */
  const semVinculo = movimentos.filter(m => m.situacao === 'nao_conciliado').length;

  const recarregarTudo = async () => {
    await recarregar();
    await aoMudar?.();
  };

  if (movimentos.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ⚠ O LAÇO MORREU — [CONCIL-MES-01] (130). "Lançar todos os sem vínculo" criava um cru
          para CADA movimento, sem prévia e sem olhar o sistema. Agora o botão abre a prévia, e
          quem grava é uma RPC atômica.
          ⚠ O NÚMERO NO RÓTULO é o de movimentos sem vínculo: é o que o operador conta na tela.
          Quantos viram cru e quantos são substituídos só a RPC sabe, e ela diz na prévia. */}
      <Button type="button" variant="outline" size="sm"
        className="h-6 gap-1 px-2 text-[10px]"
        disabled={!clienteId || !contaId}
        title={!contaId ? 'Escolha uma conta na régua para conciliar o mês.'
          : 'Ver o que entra cru, o que o banco substitui e se o saldo fecha — antes de gravar.'}
        onClick={() => setVerConciliarMes(true)}>
        <ListPlus className="h-3 w-3" />
        Conciliar o mês{semVinculo > 0 ? ` (${semVinculo})` : ''}
      </Button>

      {/* ⚠ ESTE SÓ MOSTRA; o outro GRAVA, e é o que merece o verbo — 130. */}
      <Button type="button" variant="outline" size="sm"
        className="h-6 gap-1 px-2 text-[10px]"
        title="Ver o mês inteiro com as sugestões do motor, numa tela só. Não grava nada."
        onClick={() => setVerPalco(true)}>
        <LayoutList className="h-3 w-3" />
        Ver o mês
      </Button>

      {verPalco && (
        <PalcoDoMes
          clienteId={clienteId} contaId={contaId} contaNome={contaNome}
          ano={ano} mes={mes}
          aoFechar={() => setVerPalco(false)}
          aoMudar={recarregarTudo}
        />
      )}

      {/* ⚠ O SALDO DO SISTEMA VAI POR PROP — 130. Quem o calcula é `useSaldoSistemaNaPosicao`
          (posição contra posição); refazer a conta dentro do diálogo daria dois números para a
          mesma pergunta na mesma tela. */}
      <ConciliarMesDialog
        open={verConciliarMes}
        onOpenChange={setVerConciliarMes}
        clienteId={clienteId} contaId={contaId} contaNome={contaNome}
        ano={ano} mes={mes}
        arquivosOfx={importacoesDoMes(importacoes.importacoes, `${ano}-${String(mes).padStart(2, '0')}`).ativas.length}
        saldoSistemaHoje={sistema.saldoSistema ?? null}
        aoConcluir={recarregarTudo}
      />
    </div>
  );
}
