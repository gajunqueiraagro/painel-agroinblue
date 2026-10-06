/**
 * O AVISO DO DRE: LANÇAMENTOS SEM PLANO DE CONTAS — CONC-SEM-CLASSIFICACAO-01 (Gabriel, 06/10/2026).
 *
 * `fn_dre_pecuaria` e `fn_dre_lavoura` juntam o lançamento com o plano de contas; sem `plano_conta_id` ele é descartado em
 * silêncio. Este aviso diz QUANTO o recorte aberto não está vendo — quantidade, entradas e saídas, lidos de
 * `fn_dre_sem_classificacao` (o mesmo predicado da Conciliação) — e leva à Conciliação, onde se classifica.
 * ⚠ SLOT FIXO: a linha de 18px existe SEMPRE (vazia com zero, lendo ou sem recorte) — a grade abaixo mede o próprio topo, e
 *   uma linha que aparece e some a empurraria. Os números ficam em tabela, com sinal e cor; nenhum número dentro de frase.
 * ⚠ LANÇAMENTO SEM PLANO NÃO TEM ATIVIDADE (ela vem do plano): o recorte é o do PERÍODO (pecuária) ou o da SAFRA gravada no
 *   lançamento (lavoura), não o da atividade. O `title` diz isso.
 */
import { useDreSemClassificacao, type RecorteDoDre } from '@/hooks/useSemClassificacao';
import { COR_SINAL } from '@/lib/oc/contaCorrente';

const NUM = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const ALTURA_AVISO_DRE = 18;
export const TITULO_AVISO_DRE = 'Lançamentos sem plano de contas neste recorte: o DRE não os soma em linha nenhuma. '
  + 'Sem plano o lançamento não tem atividade — a contagem é do período (ou da safra gravada), não da atividade.';

export function AvisoDreSemClassificacao({ clienteId, recorte, onIrParaConciliacao }: {
  clienteId: string | null | undefined;
  recorte: RecorteDoDre;
  /** Sem a saída (quem não tem a Conciliação), o aviso informa e não oferece o caminho. */
  onIrParaConciliacao?: () => void;
}) {
  const { data } = useDreSemClassificacao(clienteId, recorte);
  const tem = !!data && data.qtde > 0;
  return (
    <div className="flex items-center overflow-hidden" style={{ height: ALTURA_AVISO_DRE }} data-testid="aviso-dre-sem-classificacao"
         data-qtde={data ? data.qtde : undefined}>
      {tem && (
        <table className="border-collapse text-[10px] leading-none" title={TITULO_AVISO_DRE}>
          <tbody>
            <tr>
              <td className="whitespace-nowrap pr-2 font-semibold text-destructive">sem plano de contas · fora do DRE</td>
              <td className="whitespace-nowrap pr-1 text-muted-foreground">lançamentos</td>
              <td className="whitespace-nowrap pr-3 text-right font-semibold tabular-nums text-destructive" data-testid="aviso-dre-qtde">{data.qtde}</td>
              <td className="whitespace-nowrap pr-1 text-muted-foreground">entradas</td>
              <td className={`whitespace-nowrap pr-3 text-right tabular-nums ${data.valorEntradas === 0 ? 'text-muted-foreground' : COR_SINAL.pos}`} data-testid="aviso-dre-entradas">
                {data.valorEntradas === 0 ? '0,00' : `▲ ${NUM(data.valorEntradas)}`}
              </td>
              <td className="whitespace-nowrap pr-1 text-muted-foreground">saídas</td>
              <td className={`whitespace-nowrap pr-3 text-right tabular-nums ${data.valorSaidas === 0 ? 'text-muted-foreground' : COR_SINAL.neg}`} data-testid="aviso-dre-saidas">
                {data.valorSaidas === 0 ? '0,00' : `▼ ${NUM(data.valorSaidas)}`}
              </td>
              {onIrParaConciliacao && (
                <td className="whitespace-nowrap">
                  <button type="button" onClick={onIrParaConciliacao} className="underline text-muted-foreground hover:text-foreground cursor-pointer"
                          data-testid="aviso-dre-ir">classificar na Conciliação →</button>
                </td>
              )}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
