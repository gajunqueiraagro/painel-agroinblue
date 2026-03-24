/**
 * Explicação didática da Variação de Estoque de Rebanho.
 * Mostra detalhamento do efeito volume e efeito preço.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface Props {
  lancamentosPecuarios: Lancamento[];
  saldosIniciais: SaldoInicial[];
  anoFiltro: string;
  mesLimite: number;
  fazendaId?: string;
  precosMap: Map<string, { categoria: string; preco_kg: number }[]>;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function VariacaoEstoqueExplicacao({
  lancamentosPecuarios,
  saldosIniciais,
  anoFiltro,
  mesLimite,
  fazendaId,
  precosMap,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const anoNum = Number(anoFiltro);

  const dados = useMemo(() => {
    // --- Quantities ---
    const cabInicio = saldosIniciais
      .filter(s => s.ano === anoNum)
      .reduce((sum, s) => sum + s.quantidade, 0);

    const saldoFimMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, anoNum, mesLimite);
    const cabFim = Array.from(saldoFimMap.values()).reduce((s, v) => s + v, 0);

    // --- Arrobas ---
    const arrobasInicio = saldosIniciais
      .filter(s => s.ano === anoNum)
      .reduce((sum, s) => sum + s.quantidade * ((s.pesoMedioKg || 0) / 30), 0);

    // Arrobas fim: use saldo final * peso (fallback to saldo inicial weight)
    let arrobasFim = 0;
    for (const [cat, qtd] of saldoFimMap.entries()) {
      const si = saldosIniciais.find(s => s.ano === anoNum && s.categoria === cat);
      const pesoKg = si?.pesoMedioKg || 0;
      arrobasFim += qtd * (pesoKg / 30);
    }

    // --- Reposição ---
    const compras = lancamentosPecuarios.filter(l => {
      if (!l.data.startsWith(anoFiltro)) return false;
      if (l.tipo !== 'compra') return false;
      return Number(l.data.substring(5, 7)) <= mesLimite;
    });
    const reposicaoCab = compras.reduce((s, l) => s + l.quantidade, 0);
    const reposicaoValor = compras.reduce((s, l) => s + (l.valorTotal || 0), 0);

    const deltaCab = cabFim - cabInicio;
    const deltaArrobas = arrobasFim - arrobasInicio;

    // --- Valor do Rebanho (from precosMap) ---
    const precosInicial = precosMap.get(`${anoNum - 1}-12`) || [];
    const precosFinal = precosMap.get(`${anoFiltro}-${String(mesLimite).padStart(2, '0')}`) || [];
    const precoMapInicial = new Map(precosInicial.map(p => [p.categoria, p.preco_kg]));
    const precoMapFinal = new Map(precosFinal.map(p => [p.categoria, p.preco_kg]));

    const hasPrecos = precosInicial.length > 0 && precosFinal.length > 0;

    // Valor do rebanho inicial
    let valorInicial = 0;
    let pesoTotalInicio = 0;
    saldosIniciais
      .filter(s => s.ano === anoNum)
      .forEach(s => {
        const preco = precoMapInicial.get(s.categoria) || 0;
        const pesoKg = s.pesoMedioKg || 0;
        valorInicial += s.quantidade * pesoKg * preco;
        pesoTotalInicio += s.quantidade * pesoKg;
      });

    // Valor do rebanho final
    let valorFinal = 0;
    let pesoTotalFim = 0;
    for (const [cat, qtd] of saldoFimMap.entries()) {
      const preco = precoMapFinal.get(cat) || 0;
      const si = saldosIniciais.find(s => s.ano === anoNum && s.categoria === cat);
      const pesoKg = si?.pesoMedioKg || 0;
      valorFinal += qtd * pesoKg * preco;
      pesoTotalFim += qtd * pesoKg;
    }

    // Preço médio da arroba do estoque
    const precoArrobaInicio = arrobasInicio > 0 ? valorInicial / arrobasInicio : 0;
    const precoArrobaFim = arrobasFim > 0 ? valorFinal / arrobasFim : 0;

    // --- Efeito Volume e Efeito Preço ---
    // Efeito Volume = (arrobasFim - arrobasInicio) × precoArrobaInicio
    // Efeito Preço = arrobasFim × (precoArrobaFim - precoArrobaInicio)
    const efeitoVolume = (arrobasFim - arrobasInicio) * precoArrobaInicio;
    const efeitoPreco = arrobasFim * (precoArrobaFim - precoArrobaInicio);

    const variacao = valorFinal - valorInicial - reposicaoValor;

    return {
      cabInicio, cabFim, deltaCab,
      arrobasInicio, arrobasFim, deltaArrobas,
      reposicaoCab, reposicaoValor,
      valorInicial, valorFinal, variacao,
      precoArrobaInicio, precoArrobaFim,
      efeitoVolume, efeitoPreco,
      hasPrecos,
    };
  }, [saldosIniciais, lancamentosPecuarios, anoNum, anoFiltro, mesLimite, precosMap]);

  const colorVal = (v: number) =>
    v > 0 ? 'text-blue-600 dark:text-blue-400' : v < 0 ? 'text-red-600 dark:text-red-400' : '';

  const interpretacao = dados.deltaCab > 0
    ? { icon: '🟢', texto: 'Aumento de estoque no período' }
    : dados.deltaCab < 0
      ? { icon: '🔴', texto: 'Redução / queima de estoque no período' }
      : { icon: '🟡', texto: 'Estoque estável no período' };

  return (
    <Card>
      <CardContent className="p-3">
        <button
          onClick={() => setAberto(!aberto)}
          className="w-full text-left text-xs font-bold flex items-center gap-1"
        >
          <span>{aberto ? '▼' : '▶'}</span>
          📖 Entendendo a Variação de Estoque
        </button>

        {aberto && (
          <div className="mt-3 space-y-2 text-[11px]">
            {/* Cabeças e Arrobas */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Cabeças início ({anoFiltro})</span>
              <span className="font-mono text-right font-bold">{formatNum(dados.cabInicio, 0)}</span>

              <span className="text-muted-foreground">Cabeças fim ({MESES_CURTOS[mesLimite - 1]}/{anoFiltro})</span>
              <span className="font-mono text-right font-bold">{formatNum(dados.cabFim, 0)}</span>

              <span className="text-muted-foreground">Δ Cabeças</span>
              <span className={`font-mono text-right font-bold ${colorVal(dados.deltaCab)}`}>
                {dados.deltaCab >= 0 ? '+' : ''}{formatNum(dados.deltaCab, 0)}
              </span>

              <span className="text-muted-foreground">Arrobas início</span>
              <span className="font-mono text-right">{formatNum(dados.arrobasInicio, 0)} @</span>

              <span className="text-muted-foreground">Arrobas fim</span>
              <span className="font-mono text-right">{formatNum(dados.arrobasFim, 0)} @</span>

              <span className="text-muted-foreground">Δ Arrobas</span>
              <span className={`font-mono text-right font-bold ${colorVal(dados.deltaArrobas)}`}>
                {dados.deltaArrobas >= 0 ? '+' : ''}{formatNum(dados.deltaArrobas, 0)} @
              </span>
            </div>

            {/* Reposição */}
            <div className="border-t pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Reposição (compras)</span>
              <span className="font-mono text-right">{formatNum(dados.reposicaoCab, 0)} cab · {formatMoeda(dados.reposicaoValor)}</span>
            </div>

            {/* Valor do Rebanho */}
            {dados.hasPrecos && (
              <div className="border-t pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Valor rebanho início</span>
                <span className="font-mono text-right font-bold">{formatMoeda(dados.valorInicial)}</span>

                <span className="text-muted-foreground">Valor rebanho fim</span>
                <span className="font-mono text-right font-bold">{formatMoeda(dados.valorFinal)}</span>

                <span className="text-muted-foreground">R$/@ estoque início</span>
                <span className="font-mono text-right">{formatMoeda(dados.precoArrobaInicio)}</span>

                <span className="text-muted-foreground">R$/@ estoque fim</span>
                <span className="font-mono text-right">{formatMoeda(dados.precoArrobaFim)}</span>

                <span className="text-muted-foreground font-bold">Variação do estoque</span>
                <span className={`font-mono text-right font-bold ${colorVal(dados.variacao)}`}>
                  {formatMoeda(dados.variacao)}
                </span>
              </div>
            )}

            {/* Efeito Volume / Efeito Preço */}
            {dados.hasPrecos && (
              <div className="border-t pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Efeito Volume (Δ@ × preço início)</span>
                <span className={`font-mono text-right font-bold ${colorVal(dados.efeitoVolume)}`}>
                  {formatMoeda(dados.efeitoVolume)}
                </span>

                <span className="text-muted-foreground">Efeito Preço (@fim × Δpreço)</span>
                <span className={`font-mono text-right font-bold ${colorVal(dados.efeitoPreco)}`}>
                  {formatMoeda(dados.efeitoPreco)}
                </span>
              </div>
            )}

            {/* Interpretação */}
            <div className="border-t pt-2 flex items-start gap-2">
              <span className="text-base">{interpretacao.icon}</span>
              <div>
                <div className="font-bold">{interpretacao.texto}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {dados.deltaCab < 0
                    ? 'Atenção: resultado pode estar inflado por queima de estoque. Verifique o efeito volume separado do efeito preço.'
                    : dados.deltaCab > 0
                      ? 'Estoque cresceu — parte do resultado pode estar "retido" no rebanho.'
                      : 'Sem variação significativa de estoque no período.'}
                </div>
                {dados.hasPrecos && dados.efeitoPreco !== 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {dados.efeitoPreco > 0
                      ? `📈 Efeito preço positivo de ${formatMoeda(dados.efeitoPreco)} — valorização de mercado.`
                      : `📉 Efeito preço negativo de ${formatMoeda(dados.efeitoPreco)} — desvalorização de mercado.`}
                  </div>
                )}
              </div>
            </div>

            {!dados.hasPrecos && (
              <div className="text-[9px] text-muted-foreground border-t pt-1.5">
                Para análise completa de efeito preço vs efeito volume, preencha os valores de rebanho (R$/kg por categoria) no módulo Valor do Rebanho.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
