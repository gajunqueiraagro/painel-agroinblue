/**
 * ExtratoMaioresCompromissos — PR-FIN-V2-MAIORES-COMPROMISSOS-01.
 *
 * 5ª view do modo "Analisar Fluxo": "Principais Custos e Compromissos" — quais compromissos
 * pressionam o caixa. Visão gerencial de CONCENTRAÇÃO (não é extrato nem lista de lançamentos).
 *
 * Agrupador ÚNICO = centro_custo PERSISTIDO no lançamento (limpo, ~100% cobertura). Favorecido
 * NUNCA classifica (cadastro fragmentado) — entra só como detalhe no drill. Fonte: os mesmos
 * `itens` derivados de `linhas`/`dadosOrg`. Só saídas (mov<0). Exclui tesouraria (tipo '3-%').
 *
 * Ranking Top 10 centros + "Demais" (cauda agregada, clicável). Drill: centro → favorecidos
 * (detalhe) → lançamentos. Total sempre fecha com as saídas.
 */
import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMoeda } from '@/lib/calculos/formatters';
import { AnaliseDrawer } from '@/components/financeiro-v2/AnaliseDrawer';
/* ⚠ `SEM_CENTRO` ESTAVA FALTANDO NO IMPORT, e o TS2304 vivia na baseline. Não era ruído: a
   constante é usada no mini-ranking do drawer (`it.centroPlano || SEM_CENTRO`), e um item sem
   centro dentro do bucket "Demais" avaliaria o lado direito do `||` — ReferenceError, drawer
   em branco. O curto-circuito do `||` é o único motivo de ninguém ter batido nele ainda. */
import { maioresCompromissos, TOP_N, SEM_CENTRO } from '@/lib/analise/analiseAgregacoes';
import { TabelaLancamentosCompacta } from '@/components/financeiro-v2/TabelaLancamentosCompacta';
import { ordenarLancamentos, type CampoOrdemLanc, type Direcao } from '@/lib/analise/drillEconomico';

interface ItemCompromisso {
  id: string; data: string; mov: number; tipo: string;
  centroPlano: string | null; fornecedor: string; produto: string | null; doc: string;
}
const COR = '#1e3a5f';
const COR_DEMAIS = '#94a3b8';
// Paleta ordinal só para distinguir fatias do donut / pontos da tabela (apoio visual; não é classificação).
const PALETA = ['#1e3a5f', '#2f6f4f', '#b7791f', '#7c3aad', '#0e7490', '#9d174d', '#3f6212', '#a16207', '#155e75', '#5b21b6'];
const corLinha = (i: number, ehDemais?: boolean) => (ehDemais ? COR_DEMAIS : PALETA[i % PALETA.length]);

export function ExtratoMaioresCompromissos({ itens, contaNome, periodoLabel, onAbrirLancamento }: {
  itens: ItemCompromisso[];
  contaNome: string;
  periodoLabel: string;
  /** Mesma regra da `TabelaLancamentosCompacta`: sem callback, a linha não abre nada. */
  onAbrirLancamento?: (id: string) => void;
}) {
  const [drawer, setDrawer] = useState<string | null>(null);
  /* ⚠ A ORDENAÇÃO VIVE AQUI, e não dentro da tabela, porque ela precisa SOBREVIVER ao modal de
     edição: abrir um lançamento e voltar tem de encontrar a mesma lista na mesma ordem. Uma
     ordenação interna da tabela sobreviveria também (o modal é irmão do drawer), mas ficaria
     fora do alcance de quem monta — e o dia em que o drawer fechar ao salvar, some. */
  const [ordem, setOrdem] = useState<{ campo: CampoOrdemLanc; direcao: Direcao }>({ campo: 'data', direcao: 'asc' });
  const trocarOrdem = (campo: CampoOrdemLanc) => setOrdem((o) => (
    o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' }
      : { campo, direcao: campo === 'mov' ? 'desc' : 'asc' }));

  const { linhas, totalGeral, top, demais } = useMemo(() => maioresCompromissos(itens), [itens]);

  const topTotal = useMemo(() => top.reduce((s, r) => s + r.total, 0), [top]);
  const topPag = useMemo(() => top.reduce((s, r) => s + r.count, 0), [top]);
  const totalPag = useMemo(() => linhas.reduce((s, r) => s + r.count, 0), [linhas]);
  const pct = (v: number) => (totalGeral > 0 ? Math.round((v / totalGeral) * 100) : 0);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const aberto = drawer ? linhas.find((r) => r.chave === drawer) ?? null : null;
  const itensAberto = useMemo(() => {
    if (!aberto) return [];
    return aberto.itens.slice().sort((a, b) =>
      a.data < b.data ? -1 : a.data > b.data ? 1 : Math.abs(b.mov) - Math.abs(a.mov));
  }, [aberto]);
  /* ⚠ A ORDENAÇÃO É A MESMA RÉGUA DO DRILL-DOWN (`ordenarLancamentos`), não uma cópia: as duas
     listas são a mesma coisa vista por caminhos diferentes, e ordená-las com critérios
     próprios faria a linha trocar de lugar conforme a porta por onde o operador entrou. */
  const itensOrdenados = useMemo(
    () => ordenarLancamentos(itensAberto, ordem.campo, ordem.direcao), [itensAberto, ordem]);
  // Mini-ranking do drawer: favorecidos (centro normal) ou centros da cauda (Demais). Só detalhe.
  const miniRank = useMemo(() => {
    if (!aberto) return [];
    const m = new Map<string, { k: string; total: number; count: number }>();
    for (const it of aberto.itens) {
      const k = aberto.ehDemais ? (it.centroPlano || SEM_CENTRO) : (it.fornecedor || '—');
      const e = m.get(k) ?? { k, total: 0, count: 0 };
      e.total += Math.abs(it.mov); e.count += 1;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [aberto]);

  return (
    <div className="w-full max-w-[720px] mx-auto rounded-lg border px-3 py-1.5 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold">Principais Custos e Compromissos</div>
        <div className="text-[9px] text-muted-foreground">Por centro de custo · {contaNome} · {periodoLabel}</div>
      </div>

      {totalGeral === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-[11px] text-muted-foreground">
          Nenhuma saída de caixa no período (conforme filtros; transferências internas não contam).
        </div>
      ) : (
        <>
          {/* Concentração: Top 10 x Demais. */}
          <div className="rounded-md border p-1.5 space-y-0.5">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
              <span>Top {Math.min(TOP_N, top.length)}: <span className="font-semibold text-foreground">{formatMoeda(topTotal)}</span> · <span className="font-semibold" style={{ color: COR }}>{pct(topTotal)}%</span> das saídas · {topPag} pagamento{topPag !== 1 ? 's' : ''}</span>
              {demais && <span>Demais: <span className="font-semibold text-foreground">{formatMoeda(demais.total)}</span> · {pct(demais.total)}% · {demais.count} pagamento{demais.count !== 1 ? 's' : ''}</span>}
            </div>
            <div className="flex h-2 rounded overflow-hidden bg-muted">
              <div className="h-full" style={{ width: `${pct(topTotal)}%`, background: COR }} title={`Top ${TOP_N}: ${pct(topTotal)}%`} />
              {demais && <div className="h-full" style={{ width: `${pct(demais.total)}%`, background: COR_DEMAIS }} title={`Demais: ${pct(demais.total)}%`} />}
            </div>
          </div>

          {/* Donut (apoio visual) à esquerda · ranking compacto à direita. */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <div className="w-[200px] h-[200px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={linhas} dataKey="total" nameKey="chave" cx="50%" cy="50%" innerRadius={52} outerRadius={86} paddingAngle={1} isAnimationActive={false}
                       onClick={(_, idx) => setDrawer(linhas[idx].chave)}>
                    {linhas.map((r, i) => <Cell key={r.chave} fill={corLinha(i, r.ehDemais)} stroke="#fff" strokeWidth={1} cursor="pointer" />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [typeof v === 'number' ? `${formatMoeda(v)} · ${pct(v)}%` : String(v), String(name)]} contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex-1 min-w-[280px] max-w-[440px]">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="text-[9px] uppercase text-muted-foreground">
                    <th className="text-left py-0.5 font-semibold w-5">#</th>
                    <th className="text-left py-0.5 font-semibold">Compromisso</th>
                    <th className="text-right py-0.5 font-semibold w-[110px]">Valor</th>
                    <th className="text-right py-0.5 font-semibold w-[45px]">%</th>
                    <th className="text-right py-0.5 font-semibold w-[42px]">nº</th>
                    <th className="w-4" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((r, i) => {
                    const cor = corLinha(i, r.ehDemais);
                    return (
                      <tr key={r.chave} onClick={() => setDrawer(r.chave)} className="border-t cursor-pointer hover:bg-muted/40">
                        <td className="py-0.5 text-muted-foreground tabular-nums">{r.ehDemais ? '—' : i + 1}</td>
                        <td className="py-0.5">
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: cor }} />
                            <span className="font-medium truncate text-[11px]" style={{ color: cor }}>{r.chave}</span>
                          </span>
                        </td>
                        <td className="text-right tabular-nums py-0.5 whitespace-nowrap">{formatMoeda(r.total)}</td>
                        <td className="text-right tabular-nums py-0.5 font-semibold" style={{ color: cor }}>{pct(r.total)}%</td>
                        <td className="text-right tabular-nums py-0.5 text-muted-foreground">{r.count}</td>
                        <td className="text-right text-[9px] font-medium" style={{ color: cor }}>↗</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td />
                    <td className="py-0.5">Total</td>
                    <td className="text-right tabular-nums py-0.5 whitespace-nowrap">{formatMoeda(totalGeral)}</td>
                    <td className="text-right tabular-nums py-0.5">100%</td>
                    <td className="text-right tabular-nums py-0.5 text-muted-foreground">{totalPag}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="text-[9px] text-muted-foreground">
            Agrupado por centro de custo (classificação persistida) · só saídas de caixa · exclui tesouraria (transferências '3-%'). Favorecidos aparecem apenas como detalhe no compromisso.
          </div>
        </>
      )}

      {/* Drawer: centro → favorecidos (detalhe) → lançamentos. */}
      {aberto && (
        <AnaliseDrawer
          titulo={aberto.chave}
          subtitulo={`${contaNome} · ${periodoLabel} · ${formatMoeda(aberto.total)} · ${aberto.count} pagamento${aberto.count !== 1 ? 's' : ''}`}
          corAccent={aberto.ehDemais ? COR_DEMAIS : COR}
          total={aberto.total}
          totalLabel="TOTAL DO COMPROMISSO"
          onClose={() => setDrawer(null)}
        >
          {/* Mini-ranking (detalhe): favorecidos, ou centros da cauda quando "Demais". */}
          <div className="px-3 py-2 border-b">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">{aberto.ehDemais ? 'Centros agregados' : 'Favorecidos (detalhe)'}</div>
            <div className="space-y-0.5 max-h-[160px] overflow-auto">
              {miniRank.map((m) => (
                <div key={m.k} className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className="truncate" title={m.k}>{m.k}</span>
                  <span className="tabular-nums whitespace-nowrap text-muted-foreground">{formatMoeda(m.total)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ⚠ ERA UMA CÓPIA DA `TabelaLancamentosCompacta`, e o comentário antigo dizia isso
              com todas as letras ("mesmo acabamento visual"). Duas tabelas iguais são duas
              respostas esperando a pergunta: a ordem das colunas pedida em B2 (Data ·
              Descrição · Favorecido · Doc · Valor) já era a da compartilhada — a cópia é que
              tinha trocado Favorecido com Descrição. Agora é uma tabela só, e a ordenação de
              B3 chegou junto para as duas telas que a usam.
              ⚠ "Centro" CONTINUA FORA: aqui o drawer É um centro, e repeti-lo em toda linha
              gastaria 100px para dizer o que o título já diz. */}
          <TabelaLancamentosCompacta
            itens={itensOrdenados.map((it) => ({
              id: it.id, data: it.data, produto: it.produto, fornecedor: it.fornecedor,
              centro: it.centroPlano, doc: it.doc, mov: it.mov,
            }))}
            mostrarCentro={false}
            ordem={ordem}
            onOrdenar={trocarOrdem}
            onAbrir={onAbrirLancamento}
          />
        </AnaliseDrawer>
      )}
    </div>
  );
}
