import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { faixaDoMes } from '@/hooks/useConciliacaoDoMes';

/**
 * VincularMatchDireto — o balde que não pede decisão, resolvido de uma vez.
 * FIN-CONCIL-VINCULAR-MASSA-MATCH-DIRETO-01 (B-22c); motor trocado no B-38.
 *
 * ⚠ O MOTIVO DE EXISTIR É MEDIDO: no NJ, BB mar/26 tem 239 movimentos sem
 * vínculo contra 244 lançamentos antigos soltos; BB ago/26 são 110 × 110. São
 * lançamentos do fluxo OFX antigo, idênticos aos movimentos, só sem o elo — ~360
 * cliques para refazer à mão. A regra "onde há lançamento antigo solto, primeiro
 * o vínculo, depois a massa" depende de isto ser viável.
 *
 * ⚠ B-38 — O BOTÃO DEIXOU DE DEPENDER DO MOTOR DE SUGESTÕES. Antes ele lia o
 * balde `match_direto` de `fn_sugestoes_extrato` e chamava o gravador uma vez
 * por par, do navegador. O motor chama `fn_candidatos_conciliacao` POR MOVIMENTO
 * (~6 s cada): 190 movimentos = timeout, e o botão simplesmente nunca aparecia
 * no mês grande — exatamente o mês que precisava dele. Agora quem varre é
 * `fn_vincular_exatos_mes`, set-based, e responde em segundos em qualquer
 * tamanho de mês.
 *
 * ⚠ A RÉGUA DA RPC É MAIS DURA QUE A DO CHIP, e é de propósito: par de mesma
 * conta, mesmo valor absoluto e MESMA DATA, único entre os movimentos em aberto
 * E único entre os lançamentos sem vínculo. O balde `match_direto` do motor
 * admite aproximação de data; esta varredura não admite nenhuma. Por isso a
 * contagem daqui pode ser MENOR que a do chip ao lado — o que sobra continua
 * disponível na estação, uma decisão de cada vez.
 *
 * ⚠ E É POR ISSO QUE O RÓTULO DIZ "OS EXATOS", não "os match direto": o botão
 * passou a nomear o que ele faz, em vez do balde de outro motor. Com dois nomes
 * iguais e duas réguas diferentes, a divergência das contagens viraria surpresa
 * no clique; com nomes diferentes, ela está explicada antes.
 * ⚠ O NOME DO ARQUIVO E DO COMPONENTE FICARAM PARA TRÁS de propósito — renomear
 * é mexer em quem importa, e não era o escopo deste conserto.
 *
 * ⚠ O GRAVADOR CONTINUA SENDO UM SÓ. A RPC chama
 * `fn_vincular_extrato_lancamento` par a par, dentro dela: todas as travas e a
 * guarda de sobre-aplicação valem, e a recusa de um par não derruba o lote —
 * volta contada em `recusados`, com o motivo do Postgres.
 *
 * ⚠ PRÉVIA E EXECUÇÃO SÃO A MESMA CHAMADA, com `p_simular` alternando — o mesmo
 * contrato da geração de recorrências. Uma prévia que responde por um caminho e
 * grava por outro pode prometer N e entregar M.
 */
interface Props {
  clienteId: string | null;
  contaId: string | null;
  ano: number;
  mes: number;
  aoConcluir: () => void | Promise<void>;
}

interface RetornoRpc {
  ok: boolean;
  vinculados: number;
  recusados: number;
  motivos: string | null;
  simulacao: boolean;
}

export function VincularMatchDireto({ clienteId, contaId, ano, mes, aoConcluir }: Props) {
  const [ocupado, setOcupado] = useState(false);
  /** Quantos a varredura encontrou. `null` = ainda não perguntamos. */
  const [previa, setPrevia] = useState<number | null>(null);

  const impedimento: string | null =
    !clienteId ? 'Escolha um cliente primeiro.'
    : !contaId ? 'Escolha uma conta bancária primeiro.'
    : null;

  const chamar = async (simular: boolean) => {
    if (impedimento || !clienteId || !contaId) return;
    setOcupado(true);
    try {
      const { de, ate } = faixaInclusiva(ano, mes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_vincular_exatos_mes', {
        p_cliente_id: clienteId,
        p_conta_bancaria_id: contaId,
        p_de: de,
        p_ate: ate,
        p_simular: simular,
      });
      if (error) { toast.error(error.message ?? 'O banco recusou a varredura.'); return; }
      const r = (data ?? {}) as Partial<RetornoRpc>;
      const n = Number(r.vinculados ?? 0);

      if (simular) {
        setPrevia(n);
        /* ⚠ ZERO É RESPOSTA, NÃO FALHA: significa que não há par exato em aberto
           neste mês. Dizer só "0" faria parecer defeito da varredura. */
        if (n === 0) toast.info('Nenhum par exato em aberto neste mês. O que restou é decisão sua, na estação.');
        return;
      }

      const rec = Number(r.recusados ?? 0);
      /* O relatório diz a verdade inteira, inclusive quando é parcial. A
         mensagem do Postgres nomeia o invariante violado e vai sem tradução. */
      if (n === 0 && rec === 0) {
        toast.info('Nada a vincular — nenhum par exato restou em aberto.');
      } else if (rec === 0) {
        toast.success(`${n} vínculo${n === 1 ? '' : 's'} criado${n === 1 ? '' : 's'}.`);
      } else if (n === 0) {
        toast.error(`Nenhum vínculo criado · ${rec} recusado(s). Motivo: ${r.motivos ?? 'não informado'}`);
      } else {
        toast.warning(`${n} vinculado(s) · ${rec} recusado(s). Motivo: ${r.motivos ?? 'não informado'}`);
      }
      setPrevia(null);
      await aoConcluir();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <span className="ml-1 inline-flex items-center gap-1.5">
      {/* ⚠ O BOTÃO DIZ O QUE FAZ E, QUANDO NÃO PODE, POR QUÊ — e o motivo é fonte
          única do `disabled`, do `title` e da dica ao lado. */}
      <Button type="button" variant="outline" size="sm"
        className="h-5 gap-1 px-2 text-[10px]"
        disabled={impedimento !== null || ocupado}
        title={impedimento ?? (previa === null
          ? 'Procura os pares de mesma data e mesmo valor, únicos dos dois lados, e mostra quantos são antes de gravar.'
          : 'Grava os vínculos encontrados. Cada par passa pelas mesmas travas do vínculo manual.')}
        onClick={() => { void chamar(previa === null || previa === 0); }}>
        {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
        {previa === null || previa === 0
          ? 'Vincular os exatos'
          : `Confirmar ${previa} vínculo${previa === 1 ? '' : 's'}`}
      </Button>

      {/* A prévia fica escrita ao lado até virar gravação — o operador confere o
          número antes de confirmar, e pode desistir sem consequência. */}
      {previa !== null && previa > 0 && !ocupado && (
        <span className="text-[10px] text-muted-foreground">
          {previa} par{previa === 1 ? '' : 'es'} exato{previa === 1 ? '' : 's'} · mesma data e mesmo valor
        </span>
      )}
      {impedimento && (
        <span className="text-[10px] text-muted-foreground">{impedimento}</span>
      )}
    </span>
  );
}

/**
 * ⚠ A RPC USA `BETWEEN`, INCLUSIVO NOS DOIS LADOS, e `faixaDoMes` devolve o fim
 * EXCLUSIVO (o dia 1º do mês seguinte, como o resto do sistema). Passar o `fim`
 * direto faria a varredura alcançar o primeiro dia do mês seguinte — fora do
 * palco que o operador está vendo. A régua do mês continua sendo uma só; o que
 * se faz aqui é converter a convenção, explicitamente.
 */
function faixaInclusiva(ano: number, mes: number): { de: string; ate: string } {
  const { inicio, fim } = faixaDoMes(ano, mes);
  const d = new Date(`${fim}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { de: inicio, ate: d.toISOString().slice(0, 10) };
}
