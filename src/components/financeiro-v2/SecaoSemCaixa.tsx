import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { rotuloDaConta } from '@/lib/financeiro/rotuloConta';
import { dataCurta } from '@/lib/oc/contaCorrente';
import type { OCDoLancamento } from '@/hooks/useLancamentosComOC';

/* FIN-V2-SEM-CAIXA-01 — o Financeiro V2 mostra SO' DINHEIRO por padrao (mock docs/mocks/fin_v2_sem_caixa_mock_v1.html).
   O que nao movimenta caixa (entrega da conta corrente, barter, consumo) entrou no DRE e nao no banco: fica numa SECAO
   SEPARADA, abaixo da lista, que so' aparece com a chave "Mostrar lancamentos sem caixa". Nunca na mesma tabela.
   ⚠ PADRAO A31: uma informacao por coluna (Descricao, Cab e Conta separados), cabecalho navy, datas dd/mm/aa, nada truncado;
     sem checkbox e sem paginacao (decisao do Gabriel: sao poucas linhas — medido, 64 no NJ e 7 na Santa Rita).
   ⚠ SEM ROLAGEM PROPRIA (um scrollport so' por tela): a secao inteira entra na pagina, abaixo da lista. */

export interface LinhaSemCaixa {
  id: string;
  data_competencia: string | null;
  descricao: string | null;
  subcentro: string | null;
  valor: number;
  sinal: string | number | null;
}

/** Codigo curto da OC — os 8 primeiros caracteres do id, como a Central e o cabecalho da OC mostram. */
export function codigoOC(operacaoId: string): string {
  return operacaoId.slice(0, 8);
}

/** Valor com o sinal do lancamento: entrada soma, saida subtrai. */
function valorComSinal(l: LinhaSemCaixa): number {
  return Number(l.sinal) < 0 ? -Math.abs(l.valor) : Math.abs(l.valor);
}

/** Soma em centavos inteiros — o total da secao e o do topo sao o MESMO numero. */
export function totalSemCaixa(linhas: readonly LinhaSemCaixa[]): number {
  return linhas.reduce((acc, l) => acc + Math.round(valorComSinal(l) * 100), 0) / 100;
}

/** Celula OC da lista padrao: o codigo curto, clicavel, que abre a OC na aba Financeiro. Sem OC, traco. */
/* ACESSOS-02b — `onAbrir` ausente = quem ve^ a linha nao acessa a tela da OC: o CODIGO da OC fica (a informacao), sem o atalho. */
export function CelulaOC({ oc, onAbrir }: { oc: OCDoLancamento | undefined; onAbrir?: (operacaoId: string, tipo?: string | null) => void }) {
  return (
    <td className="px-1 py-1 text-center align-middle font-mono text-[10px] leading-tight" onClick={e => e.stopPropagation()} data-coluna-oc>
      {oc && !onAbrir ? (
        <span className="font-semibold" data-testid="codigo-oc">{codigoOC(oc.operacaoId)}</span>
      ) : oc ? (
        <button type="button" className="font-semibold text-primary underline" title="Abrir a operação na aba Financeiro"
          onClick={() => onAbrir?.(oc.operacaoId, oc.tipo)}>
          {codigoOC(oc.operacaoId)}
        </button>
      ) : <span className="text-muted-foreground">—</span>}
    </td>
  );
}

const TH = 'h-[17px] whitespace-nowrap bg-primary px-[5px] text-center text-[9.5px] font-semibold text-primary-foreground';
const TD = 'h-[18px] border-b border-[#eceae4] px-[5px] text-[10px]';
const TF = 'h-[19px] border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-[10px] font-bold tabular-nums';

interface Props {
  linhas: readonly LinhaSemCaixa[];
  carregando?: boolean;
  erro?: string | null;
  ocDe: (lancamentoId: string) => OCDoLancamento | undefined;
  onAbrirOC?: (operacaoId: string, tipo?: string | null) => void;
}

/** Cabecas por lancamento: so' a entrega da conta corrente tem (a saida adotada que ela fatura). Barter e consumo, traco. */
function useCabecas(ids: readonly string[]): ReadonlyMap<string, number> {
  const [mapa, setMapa] = useState<ReadonlyMap<string, number>>(new Map());
  const chave = ids.join(',');
  useEffect(() => {
    let vivo = true;
    if (ids.length === 0) { setMapa(new Map()); return; }
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: coluna/relacao fora de types.ts
      const { data } = await (supabase as any).from('zoo_operacao_partes')
        .select('financeiro_lancamento_id, lancamentos:entrega_movimentacao_id(quantidade)')
        .in('financeiro_lancamento_id', ids).eq('origem', 'entrega').eq('cancelada', false);
      if (!vivo) return;
      const m = new Map<string, number>();
      for (const r of Array.isArray(data) ? data : []) {
        const q = Number(r?.lancamentos?.quantidade);
        if (typeof r?.financeiro_lancamento_id === 'string' && Number.isFinite(q)) m.set(r.financeiro_lancamento_id, q);
      }
      setMapa(m);
    })();
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return mapa;
}

export function SecaoSemCaixa({ linhas, carregando, erro, ocDe, onAbrirOC }: Props) {
  const cabecas = useCabecas(linhas.map(l => l.id));
  const ordenadas = [...linhas].sort((a, b) => (a.data_competencia ?? '').localeCompare(b.data_competencia ?? '') || a.id.localeCompare(b.id));
  const total = totalSemCaixa(ordenadas);
  const cabTotal = ordenadas.reduce((acc, l) => acc + (cabecas.get(l.id) ?? 0), 0);
  return (
    <section className="mt-2 flex min-h-0 flex-col gap-1" data-testid="secao-sem-caixa">
      <div className="text-[10.5px] font-semibold">
        Lançamentos sem caixa <span className="font-normal text-muted-foreground">· entraram no DRE, não no banco</span>
      </div>
      <div className="rounded border">
        <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
          <colgroup>
            <col style={{ width: 62 }} /><col /><col style={{ width: 44 }} /><col style={{ width: 200 }} />
            <col style={{ width: 70 }} /><col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>{['Comp.', 'Descrição', 'Cab', 'Conta', 'OC', 'Valor'].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={6} className={`${TD} text-center text-muted-foreground`}>Carregando…</td></tr>}
            {erro && <tr><td colSpan={6} className={`${TD} text-center text-destructive`} role="alert">{erro}</td></tr>}
            {!carregando && !erro && ordenadas.length === 0 && (
              <tr><td colSpan={6} className={`${TD} text-center text-muted-foreground`}>Nenhum lançamento sem caixa neste filtro.</td></tr>
            )}
            {!carregando && !erro && ordenadas.map(l => {
              const oc = ocDe(l.id);
              const v = valorComSinal(l);
              const cab = cabecas.get(l.id);
              return (
                <tr key={l.id} data-sem-caixa={l.id}>
                  <td className={`${TD} text-center`}>{dataCurta(l.data_competencia)}</td>
                  <td className={`${TD} break-words`}>{l.descricao ?? '—'}</td>
                  <td className={`${TD} text-right`}>{cab ?? '—'}</td>
                  <td className={`${TD} break-words`}>{rotuloDaConta(l.subcentro) ?? '—'}</td>
                  <CelulaOC oc={oc} onAbrir={onAbrirOC} />
                  <td className={`${TD} text-right ${v < 0 ? 'text-[#b91c1c]' : 'text-[#15803d]'}`}>{formatMoeda(v)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={TF} colSpan={2}>Total sem caixa</td>
              <td className={`${TF} text-right`}>{cabTotal > 0 ? cabTotal : '—'}</td>
              <td className={TF} colSpan={2} />
              <td className={`${TF} text-right ${total < 0 ? 'text-[#b91c1c]' : 'text-[#15803d]'}`} data-testid="total-sem-caixa">{formatMoeda(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
