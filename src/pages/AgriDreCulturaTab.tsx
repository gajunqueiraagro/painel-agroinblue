/**
 * DRE POR CULTURA — PR-AGRI-DRE-01.
 *
 * ⚠ TELA DE RENDER, ZERO CONTA. Todo número vem de `fn_dre_agricola_por_safra`, inclusive o
 * Total: ele é a coluna `__total__`, nunca a soma das culturas na tela. O compartilhado já foi
 * distribuído entre elas pela RPC — somar de novo contaria o mesmo dinheiro duas vezes, e é
 * exatamente o erro que a coluna soberana existe para impedir.
 * ⚠ O QUE A TELA DERIVA é só apresentação: resultado por hectare, percentual de custo direto e
 * o montante da faixa. Tudo em `lib/agri/dreCultura`, com teste, fora do JSX.
 * ⚠ O INVESTIMENTO FICA ABAIXO DA LINHA, em bloco próprio: é caixa que saiu e não é custo da
 * safra (regra de formação de área, congelada na RPC). Misturá-lo ao resultado faria a
 * primeira safra de uma área nova parecer desastre.
 */
import { useMemo, useState, useEffect } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { useSafrasLavoura } from '@/hooks/useAreaPlantada';
import { useDreAgricola } from '@/hooks/useDreAgricola';
import {
  montarMatriz, valorDe, resultadoPorHa, percentualCustoDireto, montanteRateado, houveRateio,
  exibeTraco, LINHA, COL_TOTAL, ORDENS_CASCATA, ORDENS_ABAIXO_DA_LINHA, ORDENS_SUBTOTAL,
} from '@/lib/agri/dreCultura';

/** Uma célula de número, com o traço no lugar da ausência. */
function Numero({ valor, ordem, cultura, forte }: {
  valor: number | null; ordem: number; cultura: string; forte?: boolean;
}) {
  const traco = exibeTraco(ordem, valor, cultura);
  return (
    <td className={cn('px-2 py-1 text-right tabular-nums text-[11px] leading-tight',
      forte && 'font-bold',
      traco && 'text-muted-foreground')}>
      {traco ? '—' : formatMoeda(valor)}
    </td>
  );
}

function MetricCard({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={cn('mt-0.5 text-[20px] font-medium leading-none tabular-nums', cor)}>{valor}</div>
    </div>
  );
}

export function AgriDreCulturaTab() {
  const { clienteAtual } = useCliente();
  const { safras } = useSafrasLavoura(clienteAtual?.id ?? null);
  const [safraId, setSafraId] = useState('');

  /* A safra mais recente abre por padrão — a lista vem em ordem cronológica crescente, então
     é a última. Só escolhe sozinho enquanto ninguém escolheu. */
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  const { linhas, carregando, erro } = useDreAgricola(clienteAtual?.id ?? null, safraId || null);
  const m = useMemo(() => montarMatriz(linhas), [linhas]);

  const resultadoTotal = valorDe(m, COL_TOTAL, LINHA.resultadoCaixa);
  const porHaTotal = resultadoPorHa(m, COL_TOTAL);
  const rateado = montanteRateado(m);

  const colunas = [...m.culturas, COL_TOTAL];
  const tituloColuna = (c: string) => (c === COL_TOTAL ? 'Total' : labelDaCultura(c));

  return (
    <div className="w-full space-y-3 p-4 pb-20 animate-fade-in">
      {/* ── CABEÇALHO: fica fixo; só a matriz rola (A21) ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">DRE por cultura</h2>
          <p className="text-xs text-muted-foreground">{clienteAtual?.nome ?? '—'}</p>
        </div>
        <div className="w-[220px]">
          {/* ⚠ SELECT, E NÃO CARDS: não existe seletor de safra reusável no repo — o do
              FIN-PAINEL-SAFRA-01 é um `Select` embutido no `PainelPeriodoTab`, não extraído.
              Criar um segundo desenho aqui seria a terceira forma de escolher safra no
              sistema. A lista é a mesma do resto da lavoura (`useSafrasLavoura`). */}
          <Label className="text-[10px]">Safra</Label>
          <Select value={safraId} onValueChange={setSafraId}>
            <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {safras.map(s => (
                <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.codigo || s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {erro && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          <b>O DRE não pôde ser lido.</b> {erro}
        </div>
      )}

      {!erro && !carregando && m.vazio && safraId && (
        <div className="rounded-md border border-dashed p-6 text-center text-[12px] text-muted-foreground">
          Esta safra ainda não tem lançamento nem área — nada a apurar.
        </div>
      )}

      {!m.vazio && (
        <>
          {/* ── QUATRO NÚMEROS DE TOPO, todos do __total__ ── */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricCard rotulo="Área plantada"
              valor={m.areaTotal != null && m.areaTotal > 0 ? `${formatNum(m.areaTotal, 1)} ha` : '—'} />
            <MetricCard rotulo="Receita líquida"
              valor={formatMoeda(valorDe(m, COL_TOTAL, LINHA.receitaLiquida))} />
            <MetricCard rotulo="Resultado de caixa"
              valor={formatMoeda(resultadoTotal)}
              cor={resultadoTotal != null && resultadoTotal < 0 ? 'text-destructive' : 'text-success'} />
            <MetricCard rotulo="Resultado por ha"
              valor={porHaTotal != null ? `${formatMoeda(porHaTotal)}/ha` : '—'}
              cor={porHaTotal != null && porHaTotal < 0 ? 'text-destructive' : undefined} />
          </div>

          {/* ⚠ A FAIXA DIZ O QUE O NÚMERO NÃO DIZ. O resultado por cultura parece apropriado e
              não é: a maior parte do custo chegou lá por rateio de área, e a receita também.
              Sem esta frase, o operador compara amendoim com mandioca como se fossem medições
              independentes — e elas dividem o mesmo denominador. */}
          {houveRateio(m) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <b>{formatMoeda(rateado)}</b> em custos comuns foram rateados por área entre as culturas.
                A receita ainda não é apropriada por cultura — também entra rateada.
              </span>
            </div>
          )}

          {!m.rateioAdminDeclarado && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Falta cadastrar o % de rateio administrativo de algum ano desta safra — o rateio
                administrativo pode estar incompleto.
              </span>
            </div>
          )}

          {/* ── A CASCATA ── */}
          <Card className="rounded-md">
            <CardContent className="overflow-x-auto p-0 rolagem-fina">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Cultura
                    </th>
                    {colunas.map(c => (
                      <th key={c} className={cn('px-2 py-1.5 text-right align-bottom',
                        /* ⚠ O TOTAL É UM CARD CINZA que começa no cabeçalho e fecha na última
                           linha de rateio: ele não é "mais uma cultura", é a leitura da safra
                           inteira, e a cor o separa das colunas que se comparam entre si. */
                        c === COL_TOTAL && 'rounded-t-md bg-muted/40')}>
                        <div className="text-[11px] font-bold text-foreground">{tituloColuna(c)}</div>
                        {c !== COL_TOTAL && (
                          m.areaCadastrada.get(c) === false ? (
                            <div className="mt-0.5 flex flex-col items-end gap-0.5">
                              <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                área não cadastrada
                              </span>
                              <span className="text-[9px] text-muted-foreground">— · não recebe rateio</span>
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[9px] font-normal text-muted-foreground">
                              {formatNum(m.areaPorCultura.get(c) ?? 0, 1)} ha
                            </div>
                          )
                        )}
                        {c === COL_TOTAL && m.areaTotal != null && (
                          <div className="mt-0.5 text-[9px] font-normal text-muted-foreground">
                            {formatNum(m.areaTotal, 1)} ha
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ORDENS_CASCATA.map(ordem => {
                    const subtotal = ORDENS_SUBTOTAL.includes(ordem);
                    const rateio = ordem === LINHA.rateioCompartilhado || ordem === LINHA.rateioAdmin;
                    const resultado = ordem === LINHA.resultadoCaixa;
                    return (
                      <tr key={ordem} className={cn(
                        subtotal && 'border-t',
                        /* ⚠ A FAIXA VERDE DO RESULTADO ATRAVESSA TODAS AS COLUNAS, Total
                           incluído: quebrar a cor no Total sugeriria que ele é outra coisa. */
                        resultado && 'bg-success/10',
                      )}>
                        <td className={cn('px-2 py-1 text-left leading-tight',
                          subtotal && 'font-bold',
                          rateio && 'text-amber-700 dark:text-amber-400')}>
                          {m.rotulos.get(ordem) ?? ''}
                        </td>
                        {colunas.map(c => (
                          <td key={c} className={cn('p-0',
                            c === COL_TOTAL && !resultado && 'bg-muted/40',
                            c === COL_TOTAL && ordem === LINHA.rateioAdmin && 'rounded-b-md')}>
                            <table className="w-full"><tbody><tr>
                              <Numero valor={valorDe(m, c, ordem)} ordem={ordem} cultura={c}
                                forte={subtotal} />
                            </tr></tbody></table>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* ── ABAIXO DA LINHA ── */}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Abaixo da linha de caixa — não entra no resultado do período
            </p>
            <Card className="rounded-md">
              <CardContent className="overflow-x-auto p-0 rolagem-fina">
                <table className="w-full border-collapse text-[11px]">
                  <tbody>
                    {ORDENS_ABAIXO_DA_LINHA.map(ordem => (
                      <tr key={ordem} className="border-b last:border-0">
                        <td className="px-2 py-1 text-left leading-tight">
                          {m.rotulos.get(ordem) ?? ''}
                          {ordem === LINHA.depreciacao && (
                            <span className="ml-1 text-[9px] text-muted-foreground">(reservada)</span>
                          )}
                        </td>
                        {colunas.map(c => (
                          <td key={c} className={cn('p-0', c === COL_TOTAL && 'bg-muted/40')}>
                            <table className="w-full"><tbody><tr>
                              <Numero valor={valorDe(m, c, ordem)} ordem={ordem} cultura={c} />
                            </tr></tbody></table>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* ── UM CARD POR CULTURA ── */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {m.culturas.map(c => {
              const porHa = resultadoPorHa(m, c);
              const pct = percentualCustoDireto(m, c);
              return (
                <div key={c} className="rounded-md border bg-card px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-bold text-foreground">{labelDaCultura(c)}</span>
                    <span className={cn('text-[13px] font-medium tabular-nums',
                      porHa != null && porHa < 0 ? 'text-destructive' : 'text-foreground')}>
                      {porHa != null ? `${formatMoeda(porHa)}/ha` : '—'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    {/* ⚠ O SELO É SOBRE CUSTO. Não existe "% de receita apropriada" porque a RPC
                        não decompõe receita por cultura — ela entra rateada, e a nota ao lado
                        diz isso em vez de deixar o selo insinuar o contrário. */}
                    {pct != null && (
                      <span className="rounded bg-muted px-1 py-0.5 font-medium">
                        custos {pct}% apropriados direto
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Sprout className="h-3 w-3" /> receita ainda entra rateada por área
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
