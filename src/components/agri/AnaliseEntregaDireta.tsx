/**
 * A ANÁLISE DE PRODUÇÃO EM ENTREGA DIRETA — AGRI-MANDIOCA-01c §4.
 *
 * ⚠ SEÇÃO IRMÃ, pelo mesmo motivo da faixa e da lista. A análise da saca estocável conta a cadeia
 * verde → seco → sacas boas → roça, com a quebra da secagem no meio e a aflatoxina como corte de
 * preço. Na mandioca não existe secagem, nem laudo, nem roça: a cadeia é peso bruto → desconto de
 * terra → tonelada entregue, e o que decide o preço é o RENDIMENTO em amido.
 *
 * ⚠ TUDO VEM DA RPC. Os oito cartões, as notas e a produtividade por talhão já chegam somados de
 * `fn_painel_safra` e `fn_painel_safra_entrega`. A única razão calculada aqui é a t/ha por talhão,
 * e ela divide dois números que vieram juntos da mesma consulta — é o mesmo dado visto por
 * hectare, não um dado novo.
 */
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import type { EntregaDireta, TalhaoProdutividade } from '@/hooks/usePainelSafra';

/**
 * Um cartão da matriz.
 *
 * ⚠ SEM FRASE EXPLICATIVA — decisão do §4. O mock traz linhas em cinza que são anotação para o
 * Gabriel, não texto de tela: um painel de oito cartões com uma frase embaixo de cada um vira
 * leitura, e o que se quer aqui é conferência.
 */
function Cartao({ rotulo, valor, unidade, cor, subtitulo }: {
  rotulo: string; valor: string; unidade?: string; cor?: string; subtitulo?: string;
}) {
  return (
    <div className="rounded-md border bg-card px-2 py-1.5">
      <div className="truncate text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
        {rotulo}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn('text-[15px] font-medium tabular-nums leading-tight', cor)}>{valor}</span>
        {unidade && <span className="text-[9px] leading-tight text-muted-foreground">{unidade}</span>}
      </div>
      {/* ⚠ O SUBTÍTULO É DADO, não explicação: "R$ 150.996,48 no total" ao lado do R$/t. */}
      {subtitulo && (
        <div className="truncate text-[9px] leading-tight text-muted-foreground">{subtitulo}</div>
      )}
    </div>
  );
}

const TH = 'px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground';

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

const traco = (v: number | null | undefined, casas = 2) =>
  (v == null ? '—' : formatNum(v, casas));

export function AnaliseEntregaDireta({ entrega, produtividade, talhoes }: {
  entrega: EntregaDireta;
  /** t/ha da safra — `painel.sacas_ha`, que na mandioca carrega tonelada (ver `FaixaEntregaDireta`). */
  produtividade: number | null;
  talhoes: readonly TalhaoProdutividade[];
}) {
  /* ⚠ A ESCALA DAS BARRAS É O MAIOR TALHÃO, não o total: com o total, um talhão de 20% da safra
     vira um risco fino e a comparação entre talhões — que é a pergunta — desaparece. */
  const maiorT = talhoes.reduce((m, t) => Math.max(m, t.sacas), 0);

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Do que arrancou ao que a indústria pagou
        </div>
        {/* ⚠ OITO CARTÕES EM DUAS LINHAS DE QUATRO: a primeira é o físico (bruto → desconto →
            entregue → rendimento), a segunda é o dinheiro (produtividade → preço → receita →
            custo). Ler na horizontal dá a cadeia; na vertical, a causa e o efeito. */}
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <Cartao rotulo="Peso bruto" valor={traco(entrega.toneladas_bruto)} unidade="t" />
          <Cartao rotulo="Desconto terra/impureza" cor="text-destructive"
            valor={traco(entrega.desconto_t)} unidade="t" />
          {/* ⚠ NAVY NO ENTREGUE: é o peso que a indústria reconheceu, e a base de tudo adiante. */}
          <Cartao rotulo="Entregue" cor="text-primary" valor={traco(entrega.toneladas)} unidade="t" />
          <Cartao rotulo="Rendimento médio" valor={traco(entrega.rendimento_medio_g, 0)}
            unidade="g de amido/5 kg" />
          <Cartao rotulo="Produtividade" valor={traco(produtividade)} unidade="t/ha" />
          <Cartao rotulo="Preço médio" valor={traco(entrega.preco_t)} unidade="R$/t" />
          <Cartao rotulo="Receita bruta" cor="text-success"
            valor={traco(entrega.receita_bruta)} unidade="R$" />
          <Cartao rotulo="Colheita + frete + carregamento" cor="text-destructive"
            valor={traco(entrega.servicos_t)} unidade="R$/t"
            subtitulo={`${formatMoeda(entrega.servicos_total)} no total`} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* ── POR NOTA ── */}
        <div>
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Por nota
          </div>
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full border-collapse text-[10px] leading-tight">
              <thead>
                <tr className="border-b">
                  <th className={cn(TH, 'text-left')}>NF</th>
                  <th className={cn(TH, 'text-left')}>Data</th>
                  <th className={cn(TH, 'text-right')}>Cargas</th>
                  <th className={cn(TH, 'text-right')}>t</th>
                  <th className={cn(TH, 'text-right')} title="Rendimento médio da nota">g</th>
                  <th className={cn(TH, 'text-right')}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {entrega.por_nf.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">
                    Nenhuma nota nesta safra.
                  </td></tr>
                )}
                {entrega.por_nf.map(n => (
                  <tr key={n.nf} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                    <td className="truncate px-1 py-0.5" title={n.nf}>{n.nf}</td>
                    <td className="whitespace-nowrap px-1 py-0.5 tabular-nums">{dataBR(n.data)}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{formatNum(n.cargas, 0)}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{formatNum(n.toneladas, 2)}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{traco(n.rendimento_g, 0)}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums text-success">
                      {formatNum(n.valor, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* ⚠ O RODAPÉ REPETE OS TOTAIS DA RPC, não a soma das linhas acima: são os mesmos
                  números que os cartões mostram, e lê-los da mesma fonte é o que garante que as
                  duas partes do painel nunca discordem. */}
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-card font-semibold">
                  <td className="px-1 py-0.5" colSpan={2}>{entrega.por_nf.length} nota(s)</td>
                  <td className="px-1 py-0.5 text-right tabular-nums">{formatNum(entrega.cargas, 0)}</td>
                  <td className="px-1 py-0.5 text-right tabular-nums">{formatNum(entrega.toneladas, 2)}</td>
                  <td className="px-1 py-0.5 text-right tabular-nums">
                    {traco(entrega.rendimento_medio_g, 0)}
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums text-success">
                    {formatNum(entrega.receita_bruta, 2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── ENTREGUE POR TALHÃO ── */}
        <div>
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Entregue por talhão
          </div>
          <div className="space-y-1 rounded-md border bg-card p-2">
            {talhoes.length === 0 && (
              <div className="py-2 text-center text-[10px] text-muted-foreground">
                Nenhum talhão com entrega nesta safra.
              </div>
            )}
            {talhoes.map(t => {
              /* ⚠ `sacas` CARREGA A TONELADA na entrega direta — a RPC soma
                 `coalesce(toneladas, sacas_boas)` no mesmo campo, e o nome ficou da época em que
                 só havia saca. O rótulo da tela diz a unidade certa; renomear a chave é do
                 arquiteto. */
              const tha = t.area_ha > 0 ? t.sacas / t.area_ha : null;
              return (
                <div key={`${t.talhao}-${t.variedade ?? ''}`} className="grid grid-cols-[1.2fr_2fr_1.3fr] items-center gap-2">
                  <span className="truncate text-[10px]" title={t.talhao}>
                    {t.talhao}
                    <span className="text-muted-foreground"> · {formatNum(t.area_ha, 2)} ha</span>
                  </span>
                  <div className="h-2.5 rounded-sm bg-muted">
                    <div className="h-full rounded-sm bg-primary"
                      style={{ width: maiorT > 0 ? `${Math.max((t.sacas / maiorT) * 100, 1)}%` : '0%' }} />
                  </div>
                  <span className="whitespace-nowrap text-right text-[10px] tabular-nums">
                    {formatNum(t.sacas, 2)} t
                    <span className="text-muted-foreground"> · {traco(tha)} t/ha</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
