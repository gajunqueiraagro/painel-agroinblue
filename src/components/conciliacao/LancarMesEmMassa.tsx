import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2, ListPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';

/**
 * LancarMesEmMassa — o mês inteiro vira lançamento cru, já conciliado.
 * FIN-ENRIQUECER-MODO-NJ-01, peça 1.
 *
 * ⚠ É O PRIMEIRO PASSO DO FLUXO REAL, não um atalho: no NJ importa-se o OFX,
 * lança-se TUDO cru e conciliado, e só depois a classificação chega pelo Excel.
 * Antes disso o operador tinha de abrir a estação movimento a movimento — num
 * mês de centenas de linhas, isso não é fluxo, é impedimento.
 *
 * ⚠ A RPC É O ÚNICO GRAVADOR. `fn_criar_lancamento_de_extrato` cria o lançamento
 * e o vínculo na MESMA transação; `p_subcentro` nulo é o que faz o lançamento
 * nascer CRU, esperando classificação. Insert manual em massa criaria um segundo
 * gravador com as regras copiadas — e o dia em que o banco mudasse uma trava,
 * este caminho não saberia.
 *
 * ⚠ UM MOVIMENTO POR TRANSAÇÃO, e sequencial. Cada linha tem seu veredito: mês
 * fechado, fazenda de outro cliente, vínculo já ativo. Falhar o lote inteiro por
 * causa de uma esconderia as que deram certo — e num mês de centenas, o operador
 * não saberia por onde recomeçar. O relatório final diz quantas entraram e por
 * que as outras não.
 */
interface Props {
  movimentos: readonly MovimentoConciliacao[];
  contaBancariaId: string | null;
  aoConcluir: () => void | Promise<void>;
}

export function LancarMesEmMassa({ movimentos, contaBancariaId, aoConcluir }: Props) {
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);

  /* A fazenda vem da conta do extrato — a RPC a exige, e perguntar o que o dado
     já sabe é trabalho que o operador não deveria ter. Medido: as 69 contas
     ativas do Proto têm `fazenda_id`. */
  const contaQ = useQuery({
    queryKey: ['lancar-massa-conta', contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('financeiro_contas_bancarias').select('fazenda_id').eq('id', contaBancariaId).maybeSingle();
      return (data ?? null) as { fazenda_id: string | null } | null;
    },
  });

  /* ⚠ SEM VÍNCULO, e não "não conciliado por heurística": `situacao` é o vínculo
     real (soma dos `valor_aplicado` ativos), a mesma régua do placar. Movimento
     parcial fica de fora — a RPC o recusaria, e oferecer o que o banco recusa é
     o que a regra do botão proíbe. */
  const alvos = movimentos.filter(m => m.situacao === 'nao_conciliado');
  const fazendaId = contaQ.data?.fazenda_id ?? null;

  const impedimento: string | null =
    !contaBancariaId ? 'Escolha uma conta na régua para lançar o mês.'
    : contaQ.isPending ? 'Lendo a conta do movimento…'
    : !fazendaId ? 'A conta desta régua não tem fazenda definida — o lançamento pertence a uma.'
    : alvos.length === 0 ? 'Nenhum movimento sem vínculo neste mês.'
    : null;

  const lancar = async () => {
    if (impedimento || !fazendaId) return;
    setRodando(true);
    setFeitos(0);
    const erros: string[] = [];
    let criados = 0;
    try {
      for (const m of alvos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { error } = await (supabase as any).rpc('fn_criar_lancamento_de_extrato', {
          p_extrato_id: m.id,
          p_fazenda_id: fazendaId,
          /* ⚠ `null` DE PROPÓSITO: o lançamento nasce CRU. A classificação vem
             depois, pelo Excel do Enriquecer, que atualiza estes mesmos
             lançamentos pelo id. */
          p_subcentro: null,
        });
        if (error) erros.push(`${brData(m.data_movimento)} ${formatMoeda(m.valor)}: ${error.message}`);
        else criados += 1;
        setFeitos(f => f + 1);
      }
      /* ⚠ O RELATÓRIO DIZ A VERDADE INTEIRA, inclusive quando ela é parcial. A
         mensagem do Postgres nomeia o invariante violado e vai sem tradução —
         ela é mais precisa que qualquer texto nosso. */
      if (erros.length === 0) {
        toast.success(`${criados} lançamento${criados === 1 ? '' : 's'} criado${criados === 1 ? '' : 's'} e vinculado${criados === 1 ? '' : 's'}.`);
      } else if (criados === 0) {
        toast.error(`Nenhum lançamento criado. Primeiro motivo: ${erros[0]}`);
      } else {
        toast.warning(`${criados} criado(s) · ${erros.length} recusado(s). Primeiro motivo: ${erros[0]}`);
      }
      await aoConcluir();
    } finally {
      setRodando(false);
    }
  };

  return (
    <span className="flex items-center gap-1.5">
      {rodando && (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {feitos} de {alvos.length}
        </span>
      )}
      {/* ⚠ O BOTÃO DIZ QUANTOS VAI LANÇAR E, QUANDO NÃO PODE, POR QUÊ — fonte
          única de `disabled`, `title` e do número no rótulo. */}
      <Button type="button" variant="outline" size="sm"
        className="h-6 gap-1 px-2 text-[10px]"
        disabled={impedimento !== null || rodando}
        title={impedimento ?? 'Cria um lançamento cru para cada movimento sem vínculo, já conciliado. A classificação vem depois, pelo Excel.'}
        onClick={() => { void lancar(); }}>
        {rodando ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />}
        Lançar todos os sem vínculo{alvos.length > 0 ? ` (${alvos.length})` : ''}
      </Button>
    </span>
  );
}

const brData = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
