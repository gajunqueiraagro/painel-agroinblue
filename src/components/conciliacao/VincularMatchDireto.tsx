import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { MovimentoConciliacao, SugestaoDoMes } from '@/hooks/useConciliacaoDoMes';

/**
 * VincularMatchDireto — o balde que não pede decisão, resolvido de uma vez.
 * FIN-CONCIL-VINCULAR-MASSA-MATCH-DIRETO-01 (B-22c).
 *
 * ⚠ SÓ `match_direto`, E A REGRA É DURA. Match direto é sugestão ÚNICA com valor
 * exato — não há o que escolher, e é por isso que ele pode ir em lote. Provável,
 * ambíguo e parcial ficam FORA: cada um é uma decisão que só quem conhece a
 * operação toma, e tomá-la por lote seria decidir no lugar do operador em
 * silêncio, centenas de vezes.
 *
 * ⚠ O MOTIVO DE EXISTIR É MEDIDO: no NJ, BB mar/26 tem 239 movimentos sem
 * vínculo contra 244 lançamentos antigos soltos; BB ago/26 são 110 × 110. São
 * lançamentos do fluxo OFX antigo, idênticos aos movimentos, só sem o elo — ~360
 * cliques para refazer à mão. A regra "onde há lançamento antigo solto, primeiro
 * o vínculo, depois a massa" depende de isto ser viável.
 *
 * ⚠ A RPC É O ÚNICO GRAVADOR. `fn_vincular_extrato_lancamento` traz, desde a
 * migration `b22fd273`, a guarda de sobre-aplicação nos dois lados; conta
 * divergente e vínculo já ativo ela sempre recusou. Nada é checado aqui além do
 * que a tela precisa para não oferecer o impossível — quem valida é o banco, e a
 * recusa dele vai ao relatório linha a linha, sem derrubar o lote.
 *
 * ⚠ O PAR VEM DA MESMA LINHA DA RPC que classificou o balde: `sugestaoId` sai de
 * `fn_sugestoes_extrato`, junto com o `estado` que pintou o chip. Redescobrir o
 * par aqui abriria a chance de vincular um lançamento diferente do que a tela
 * mostrou.
 */
interface Props {
  movimentos: readonly MovimentoConciliacao[];
  sugestoes: readonly SugestaoDoMes[] | null;
  aoConcluir: () => void | Promise<void>;
}

export function VincularMatchDireto({ movimentos, sugestoes, aoConcluir }: Props) {
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);

  /* ⚠ OS DOIS LADOS TÊM DE ESTAR PRONTOS: o movimento ainda sem vínculo (fato do
     banco) E a sugestão com estado `match_direto` e id (resposta do motor).
     Movimento já conciliado que o motor ainda classifica como match seria
     recusado pela RPC — e oferecer o que o banco recusa é o que a regra do botão
     proíbe. */
  const pares = (sugestoes ?? [])
    .filter(s => s.estado === 'match_direto' && s.sugestaoId)
    .map(s => ({ sug: s, mov: movimentos.find(m => m.id === s.extratoId) }))
    .filter((p): p is { sug: SugestaoDoMes; mov: MovimentoConciliacao } =>
      !!p.mov && p.mov.situacao === 'nao_conciliado');

  const impedimento: string | null =
    sugestoes == null ? 'O motor de sugestões ainda não respondeu para este mês.'
    : pares.length === 0 ? 'Nenhum movimento em match direto sem vínculo.'
    : null;

  const vincular = async () => {
    if (impedimento) return;
    setRodando(true);
    setFeitos(0);
    const erros: string[] = [];
    let feitosOk = 0;
    try {
      for (const { sug, mov } of pares) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { error } = await (supabase as any).rpc('fn_vincular_extrato_lancamento', {
          p_extrato_id: mov.id,
          p_lancamento_id: sug.sugestaoId,
          /* Valor cheio do movimento, explícito. Match direto é valor exato, então
             cheio e saldo coincidem — mas o default da função é o valor do
             EXTRATO, e depender dele calaria a diferença no dia em que deixassem
             de coincidir. */
          p_valor_aplicado: Math.abs(mov.valor),
        });
        if (error) erros.push(`${brData(mov.data_movimento)} ${formatMoeda(mov.valor)}: ${error.message}`);
        else feitosOk += 1;
        setFeitos(f => f + 1);
      }
      /* O relatório diz a verdade inteira, inclusive quando é parcial. A mensagem
         do Postgres nomeia o invariante violado e vai sem tradução. */
      if (erros.length === 0) {
        toast.success(`${feitosOk} vínculo${feitosOk === 1 ? '' : 's'} criado${feitosOk === 1 ? '' : 's'}.`);
      } else if (feitosOk === 0) {
        toast.error(`Nenhum vínculo criado. Primeiro motivo: ${erros[0]}`);
      } else {
        toast.warning(`${feitosOk} vinculado(s) · ${erros.length} recusado(s). Primeiro motivo: ${erros[0]}`);
      }
      await aoConcluir();
    } finally {
      setRodando(false);
    }
  };

  return (
    <span className="ml-1 inline-flex items-center gap-1.5">
      {rodando && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{feitos} de {pares.length}</span>
      )}
      {/* O botão diz quantos vai vincular e, quando não pode, por quê. */}
      <Button type="button" variant="outline" size="sm"
        className="h-5 gap-1 px-2 text-[10px]"
        disabled={impedimento !== null || rodando}
        title={impedimento ?? 'Vincula de uma vez os movimentos com sugestão única e valor exato. Provável e ambíguo ficam de fora — são decisão sua, na estação.'}
        onClick={() => { void vincular(); }}>
        {rodando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
        Vincular os match direto{pares.length > 0 ? ` (${pares.length})` : ''}
      </Button>
    </span>
  );
}

const brData = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
