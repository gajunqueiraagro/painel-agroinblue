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
}

export function VariacaoEstoqueExplicacao({
  lancamentosPecuarios,
  saldosIniciais,
  anoFiltro,
  mesLimite,
  fazendaId,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const anoNum = Number(anoFiltro);

  const dados = useMemo(() => {
    // Cabeças início (saldo inicial do ano)
    const cabInicio = saldosIniciais
      .filter(s => s.ano === anoNum)
      .reduce((sum, s) => sum + s.quantidade, 0);

    // Cabeças fim (saldo ao final do mês selecionado)
    const saldoFimMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, anoNum, mesLimite);
    const cabFim = Array.from(saldoFimMap.values()).reduce((s, v) => s + v, 0);

    // Arrobas início (saldo inicial × peso / 30)
    const arrobasInicio = saldosIniciais
      .filter(s => s.ano === anoNum)
      .reduce((sum, s) => sum + s.quantidade * ((s.pesoMedioKg || 0) / 30), 0);

    // Reposição (compras no período)
    const compras = lancamentosPecuarios.filter(l => {
      if (!l.data.startsWith(anoFiltro)) return false;
      if (l.tipo !== 'compra') return false;
      return Number(l.data.substring(5, 7)) <= mesLimite;
    });
    const reposicaoCab = compras.reduce((s, l) => s + l.quantidade, 0);
    const reposicaoValor = compras.reduce((s, l) => s + (l.valorTotal || 0), 0);

    const deltaCab = cabFim - cabInicio;

    return {
      cabInicio,
      cabFim,
      deltaCab,
      arrobasInicio,
      reposicaoCab,
      reposicaoValor,
    };
  }, [saldosIniciais, lancamentosPecuarios, anoNum, anoFiltro, mesLimite]);

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
            {/* Tabela de dados */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Cabeças início ({anoFiltro})</span>
              <span className="font-mono text-right font-bold">{formatNum(dados.cabInicio, 0)}</span>

              <span className="text-muted-foreground">Cabeças fim ({MESES_CURTOS[mesLimite - 1]}/{anoFiltro})</span>
              <span className="font-mono text-right font-bold">{formatNum(dados.cabFim, 0)}</span>

              <span className="text-muted-foreground">Δ Cabeças</span>
              <span className={`font-mono text-right font-bold ${dados.deltaCab >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {dados.deltaCab >= 0 ? '+' : ''}{formatNum(dados.deltaCab, 0)}
              </span>
            </div>

            <div className="border-t pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Arrobas início</span>
              <span className="font-mono text-right">{formatNum(dados.arrobasInicio, 0)} @</span>

              <span className="text-muted-foreground">Reposição (compras)</span>
              <span className="font-mono text-right">{formatNum(dados.reposicaoCab, 0)} cab · {formatMoeda(dados.reposicaoValor)}</span>
            </div>

            {/* Interpretação */}
            <div className="border-t pt-2 flex items-start gap-2">
              <span className="text-base">{interpretacao.icon}</span>
              <div>
                <div className="font-bold">{interpretacao.texto}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {dados.deltaCab < 0
                    ? 'Atenção: resultado pode estar inflado por queima de estoque. Verifique o efeito volume separado do efeito preço nos valores de rebanho.'
                    : dados.deltaCab > 0
                      ? 'Estoque cresceu — parte do resultado pode estar "retido" no rebanho.'
                      : 'Sem variação significativa de estoque no período.'}
                </div>
              </div>
            </div>

            <div className="text-[9px] text-muted-foreground border-t pt-1.5">
              Para análise completa de efeito preço vs efeito volume, preencha os valores de rebanho (R$/kg por categoria) no módulo Valor do Rebanho.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
