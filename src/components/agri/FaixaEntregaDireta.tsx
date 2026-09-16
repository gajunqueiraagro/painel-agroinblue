/**
 * O CONSOLIDADO DA SAFRA EM ENTREGA DIRETA — AGRI-MANDIOCA-01c §2.
 *
 * ⚠ FAIXA IRMÃ, como a lista e o modal. Os seis cards da saca estocável contam a história do grão
 * que entra no galpão (verde → seco → sacas boas → roça → quebra → secagem). Aqui não há galpão:
 * o caminhão sai do talhão e entra na indústria, e a história é outra — quanto entregou, quanto
 * rendeu de amido, quanto a indústria pagou e quanto custou tirar a raiz do chão.
 *
 * ⚠ TODO NÚMERO VEM DA RPC, nenhum é somado aqui. `fn_painel_safra_entrega` já devolve tonelada,
 * rendimento ponderado, preço médio, serviços por tonelada e receita. O rendimento médio, em
 * especial, é PONDERADO PELA TONELADA (`sum(rendimento_g*toneladas)/sum(toneladas)`) — a média
 * simples das cargas daria outro número, e seriam dois totais para a mesma pergunta.
 * ⚠ `null` VIRA "—", NUNCA ZERO. Os campos de razão (`preco_t`, `servicos_t`, `rendimento_medio_g`)
 * saem nulos quando não há tonelada para dividir, e "R$ 0,00 por tonelada" diria algo falso.
 */
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import type { EntregaDireta } from '@/hooks/usePainelSafra';

/**
 * Uma caixa da faixa — a régua da faixa do DRE.
 *
 * ⚠ OS TRÊS TAMANHOS SÃO A RÉGUA, não escolha desta tela: rótulo 10px, valor 13px/500, unidade
 * 9px. É a mesma hierarquia que o DRE usa, e repeti-la aqui é o que faz as duas telas parecerem
 * o mesmo sistema.
 */
function Caixa({ rotulo, valor, unidade, cor, title, onAbrir }: {
  rotulo: string;
  valor: string;
  unidade?: string;
  cor?: string;
  title?: string;
  /** Quando existe, a caixa inteira é o botão — o mesmo gesto do card destacado da saca. */
  onAbrir?: () => void;
}) {
  return (
    <div className={cn('rounded-md border bg-card px-2 py-1',
      onAbrir && 'cursor-pointer hover:bg-[#1e3a5f]/[0.06]')}
      title={title}
      onClick={onAbrir}
      role={onAbrir ? 'button' : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      onKeyDown={onAbrir ? e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); }
      } : undefined}>
      <div className="truncate text-[10px] leading-tight text-muted-foreground">{rotulo}</div>
      <div className="flex items-baseline gap-1">
        <span className={cn('text-[13px] font-medium tabular-nums leading-tight', cor)}>{valor}</span>
        {unidade && <span className="text-[9px] leading-tight text-muted-foreground">{unidade}</span>}
      </div>
    </div>
  );
}

const traco = (v: number | null | undefined, casas = 2) =>
  (v == null ? '—' : formatNum(v, casas));

export function FaixaEntregaDireta({ entrega, produtividade, nIndustrias, onAbrirAnalise }: {
  /** `null` enquanto a RPC não respondeu, ou quando a cultura não tem carga entregue. */
  entrega: EntregaDireta | null;
  /**
   * Toneladas por hectare — `painel.sacas_ha`.
   *
   * ⚠ A CHAVE AINDA SE CHAMA `sacas_ha` NO BANCO, e o número que ela carrega aqui é TONELADA por
   * hectare: `fn_painel_safra` divide `coalesce(toneladas, sacas)` pela área. O nome ficou da
   * época em que só havia saca; renomeá-lo é frente do arquiteto, e inventar um apelido no front
   * faria a tela e a RPC falarem de campos diferentes.
   */
  produtividade: number | null;
  /** Quantas indústrias compraram — contado das notas, por quem tem a lista das cargas. */
  nIndustrias?: number;
  /**
   * Abre a Análise de produção.
   *
   * ⚠ ELA PRECISA DE UMA PORTA AQUI, e isso quase passou: na saca o gesto mora no card "Final
   * aproveitado", que esta faixa não tem. Sem esta prop a análise da mandioca existiria sem
   * nenhum jeito de abri-la.
   */
  onAbrirAnalise?: () => void;
}) {
  if (!entrega) {
    return (
      <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        Nenhuma carga entregue nesta safra.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-6">
        <Caixa rotulo="Entregue" valor={traco(entrega.toneladas)} unidade="t"
          onAbrir={onAbrirAnalise}
          title={onAbrirAnalise ? 'Abrir a análise de produção' : undefined} />
        {/* ⚠ NAVY NO RENDIMENTO: é o número que a indústria paga, e o que o produtor negocia. */}
        <Caixa rotulo="Rendimento médio" cor="text-primary"
          valor={traco(entrega.rendimento_medio_g, 0)} unidade="g de amido/5 kg" />
        <Caixa rotulo="Produtividade" valor={traco(produtividade)} unidade="t/ha" />
        <Caixa rotulo="Preço médio" valor={traco(entrega.preco_t)} unidade="R$/t" />
        {/* ⚠ VERMELHO NO CUSTO DE TIRAR A RAIZ DO CHÃO — arranquio, frete e carregamento são o que
            a carga paga antes de virar receita. */}
        <Caixa rotulo="Colheita + frete + carreg." cor="text-destructive"
          valor={traco(entrega.servicos_t)} unidade="R$/t"
          title={`${formatMoeda(entrega.servicos_total)} no total`} />
        <Caixa rotulo="Receita bruta" cor="text-success"
          valor={traco(entrega.receita_bruta)} unidade="R$" />
      </div>
      {/* ⚠ A SEGUNDA FAIXA É O QUE SOBRA DA NOTA: o que a nota levou e o que ainda não caiu. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px]">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Nota
        </span>
        <span className="text-muted-foreground">
          Deduções na nota:{' '}
          <b className="tabular-nums text-destructive">{formatMoeda(entrega.deducoes)}</b>
        </span>
        <div className="flex-1" />
        <span className="text-muted-foreground">
          A receber: <b className="tabular-nums text-amber-700">{formatMoeda(entrega.a_receber)}</b>
          {' · '}
          <b className="tabular-nums">{formatNum(entrega.cargas, 0)}</b> cargas
          {' · '}
          <b className="tabular-nums">{formatNum(entrega.por_nf.length, 0)}</b> NFs
          {nIndustrias != null && (
            <>{' · '}<b className="tabular-nums">{formatNum(nIndustrias, 0)}</b> indústrias</>
          )}
        </span>
      </div>
    </div>
  );
}
