/**
 * A PRODUÇÃO DE UMA SAFRA — talhões e composição por qualidade.
 *
 * ⚠ CÓDIGO MOVIDO, COPIADO BYTE A BYTE de `PainelSafraTab.tsx:721-896` (a aba "Produção" do
 * Painel da Safra, que este PR aposenta). O miolo do `return` abaixo é o arquivo antigo sem uma
 * vírgula de diferença — indentação inclusive. O que mudou foi o entorno: o bloco virou
 * componente, e o que ele lia do escopo do Painel passou a chegar por prop.
 *
 * ⚠ `TH` E `zebra` VIERAM JUNTO, copiados, não importados: eram `const` de módulo do
 * `PainelSafraTab`, e o arquivo morre neste PR. `colheu` continua vindo de `usePainelSafra`,
 * que é de onde ele sempre veio.
 *
 * ⚠ ELE PRECISA DE `comparadas`, E ISSO IMPORTA. O bloco da Composição lê seis campos de
 * `SafraComparada` (`total_sacas`, `sacas_boas`, `sacas_roca`, `pct_roca`, `sacas_ha`,
 * `area_ha`), que vêm de `fn_painel_safra_comparativo` — não de `fn_painel_safra`. É por isso
 * que essa RPC NÃO ficou órfã com a aposentadoria do Painel: ela alimenta esta aba.
 */
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
/* ⚠ `colheu` E `porHa` CONTINUAM VINDO DE `usePainelSafra`, que é de onde sempre vieram — só
   `TH` e `zebra` precisaram ser copiados, porque eram locais do arquivo que morre. */
import { colheu, porHa, type PainelSafra, type SafraComparada } from '@/hooks/usePainelSafra';

/* ⚠ COPIADO VERBATIM de `PainelSafraTab.tsx:45-46`. */
const TH = 'bg-primary px-2 py-1 text-[9px] font-semibold uppercase tracking-wide'
  + ' text-primary-foreground';

/* ⚠ COPIADO VERBATIM de `PainelSafraTab.tsx:73`. */
const zebra = (i: number) => (i % 2 === 0 ? 'bg-card' : 'bg-muted/40');

/** Os totais da tabela de talhões — somados de `painel.talhoes`, como no Painel. */
export interface TotaisTalhoes {
  area: number; sacas: number; boas: number; roca: number; sacasHa: number; pctAfla: number;
  /** O grão bom acima de 20 ppb, em sacas — a parcela que o `pctAfla` resume. */
  acima: number;
}

export function ProducaoSafraPanel({ painel, totaisTalhoes, comparadas, safraId }: {
  painel: PainelSafra | null;
  totaisTalhoes: TotaisTalhoes;
  comparadas: SafraComparada[];
  safraId: string | null;
}) {
  return (
    <>

      {/* ── POR TALHÃO / VARIEDADE ── */}
      {(painel?.talhoes.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {['21%', '17%', '11%', '14%', '12%', '13%', '12%'].map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                {/* ⚠ O PRIMEIRO `th` É O NOME DA SEÇÃO, não o rótulo da coluna — o padrão que a
                    tabela de Investimento já usa neste arquivo ("Investimento na abertura" no
                    lugar de "Tipo"). O rótulo não se perde: uma coluna de nomes de talhão sob um
                    título que diz "Análise por Talhão" não precisa repetir a palavra.
                    ⚠ E O PADRÃO TEM DUAS PARTES: o título AQUI e o `pl-6` na primeira célula do
                    corpo. É o recuo que faz as linhas se lerem como itens DAQUELA seção; só o
                    texto no `th` deixaria o nome da seção parecendo um cabeçalho de coluna
                    comprido. */}
                <th className={cn(TH, 'text-left')}>Análise por talhão</th>
                <th className={cn(TH, 'text-left')}>Variedade</th>
                <th className={cn(TH, 'text-right')}>Área ha</th>
                <th className={cn(TH, 'text-right')}>Sacas boas</th>
                <th className={cn(TH, 'text-right')}>sc / ha</th>
                <th className={cn(TH, 'text-right')}>Roça (sc)</th>
                {/* ⚠ "% Afla" É SOBRE AS SACAS BOAS ACIMA DE 20 ppb — o corte da cooperativa.
                    O rótulo é curto porque a coluna é estreita; o que ele significa está no
                    tipo da RPC e na nota do rodapé desta tabela. */}
                <th className={cn(TH, 'text-right')}>% Afla</th>
              </tr>
            </thead>
            <tbody>
              {painel?.talhoes.map((t, i) => (
                <tr key={`${t.talhao}·${t.variedade ?? ''}`}
                  className={cn('border-t border-slate-100', zebra(i))}>
                  <td className="truncate px-2 py-0.5 pl-6 text-[11px]" title={t.talhao}>{t.talhao}</td>
                  {/* ⚠ `—` PARA VARIEDADE NULA: a coluna existe sempre, porque some-la quando
                      nenhum talhão tem variedade faria a tabela mudar de forma entre safras. */}
                  <td className="truncate px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t.variedade ?? '—'}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(t.area_ha, 2)}</td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(t.sacas_boas, 2)}</td>
                  {/* ⚠ O MELHOR EM NEGRITO SÓ QUANDO HÁ COM QUEM COMPARAR. Com um talhão só,
                      destacar a única linha sugeriria um ranking que não existe. */}
                  <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                    i === 0 && (painel?.talhoes.length ?? 0) > 1 && 'font-bold text-success')}>
                    {formatNum(t.sacas_ha, 2)}
                  </td>
                  {/* ⚠ ROÇA É SEMPRE VERMELHA, a mesma convenção da lista de cargas: ela é
                      refugo, e o vermelho aqui não julga uma faixa — diz o que aquele grão é.
                      ⚠ ZERO FICA CINZA: um talhão sem refugo não é um alerta. */}
                  <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                    t.roca_sacas > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {formatNum(t.roca_sacas, 2)}
                  </td>
                  {/* ⚠ 0,0% APARECE, nunca "—": o traço diria que o laudo não existe, e aqui
                      ele existe e deu zero — que é o melhor resultado possível. */}
                  <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                    t.pct_afla20 > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {formatNum(t.pct_afla20, 1)}%
                  </td>
                </tr>
              ))}
              {/* ⚠ FAIXA ESCURA, como o "Total investido": é o mesmo papel — a borda de baixo da
                  tabela — e duas convenções diferentes para a mesma função fariam o olho
                  reaprender a cada bloco.
                  ⚠ A ÁREA E AS SACAS FECHAM COM OS CARTÕES DO TOPO por construção: são o mesmo
                  array somado. Se um dia divergirem, é porque alguém passou a filtrar a lista
                  sem filtrar o cartão. */}
              <tr className="bg-primary text-primary-foreground">
                <td className="px-2 py-1 text-[12px] font-bold" colSpan={2}>Total</td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.area, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.boas, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.sacasHa, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.roca, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.pctAfla, 1)}%
                </td>
              </tr>
            </tbody>
          </table>
          <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
            Só a <strong>produtividade</strong> é real por talhão. O custo não aparece aqui porque
            o lançamento financeiro guarda safra e cultura, nunca o talhão — custo por talhão vem
            quando o lançamento marcar talhão.
          </p>
        </div>
      )}

      {/* ── COMPOSIÇÃO POR QUALIDADE ──
          ⚠ A ROÇA É RECEITA *E* PERDA, e as duas coisas ao mesmo tempo (decisão do Gabriel). Ela
          é vendida a R$ 80 e entra no faturamento e na produtividade — escondê-la faria a conta
          não fechar. Mas é grão refugado, e o que se quer é reduzi-la safra a safra. Por isso
          aparece SEPARADA e nomeada "perda de qualidade", nunca fundida no total nem omitida. */}
      {(() => {
        const sel = comparadas.find(sf => sf.safra_id === safraId);
        if (!sel || !colheu(sel)) return null;
        const pctBom = sel.total_sacas > 0 ? 100 - sel.pct_roca : 0;
        return (
          /* ⚠ UMA COLUNA AGORA: o grid de duas existia para o gráfico da Roça, que foi para a aba
             Histórico. Mantê-lo faria a tabela ocupar metade da largura e a outra metade ficar
             vazia — o grid vazio é mais visível que o grid ausente. */
          <div className="grid gap-2">
            <div className="min-w-0 overflow-hidden rounded-md border">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  {['34%', '22%', '22%', '22%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className={cn(TH, 'text-left')}>Composição da produção</th>
                    <th className={cn(TH, 'text-right')}>Sacas</th>
                    <th className={cn(TH, 'text-right')}>% do total</th>
                    <th className={cn(TH, 'text-right')}>sc / ha</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-2 py-0.5 text-[11px]">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-[-1px]" />
                      Grão bom
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(sel.sacas_boas, 2)}</td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(pctBom, 1)}%</td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                      {formatNum(porHa(sel.sacas_boas, sel.area_ha), 2)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-2 py-0.5 text-[11px]">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#8b5e3c] align-[-1px]" />
                      Grão de roça <span className="text-[9px] text-muted-foreground">perda de qualidade</span>
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(sel.sacas_roca, 2)}</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                      {formatNum(sel.pct_roca, 1)}%
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                      {formatNum(porHa(sel.sacas_roca, sel.area_ha), 2)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-slate-300">
                    <td className="px-2 py-0.5 text-[11px] font-bold">Total colhido</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">
                      {formatNum(sel.total_sacas, 2)}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">100,0%</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">
                      {formatNum(sel.sacas_ha, 2)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
                O grão de roça <strong>é receita</strong> — a cooperativa o compra mais barato — e
                já está no faturamento e na produtividade acima. Aparece separado porque é
                <strong> perda de qualidade</strong>: o alvo é reduzi-lo safra a safra.
              </p>
            </div>

          </div>
        );
      })()}

      {/* ⚠ A COMPOSIÇÃO SUBIU E O COMPARATIVO DESCEU — é a única troca de ordem desta fatia, e
          ela é consequência das abas, não escolha de layout: a composição pertence a "Produção"
          e o comparativo a "Histórico", e no arquivo o comparativo vinha primeiro. Dentro de
          cada aba a ordem dos blocos está intacta. */}
    </>
  );
}
