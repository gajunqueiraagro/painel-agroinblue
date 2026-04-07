/**
 * Explicação didática da Variação de Estoque de Rebanho.
 * Separada em: Bloco Físico, Bloco Financeiro, Interpretação e Alerta de Consistência.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface Props {
  lancamentosPecuarios: Lancamento[];
  saldosIniciais: SaldoInicial[];
  anoFiltro: string;
  mesLimite: number;
  fazendaId?: string;
  precosMap: Map<string, { categoria: string; preco_kg: number }[]>;
  /** Reposição vinda de financeiro_lancamentos (Investimento em Bovinos, Conciliado) */
  reposicaoFinanceiro: number;
  /** Pesos reais (do fechamento de pastos) para o estoque inicial (Dez ano anterior) */
  pesosReaisInicial?: Record<string, number>;
  /** Pesos reais (do fechamento de pastos) para o estoque final (mês corrente) */
  pesosReaisFinal?: Record<string, number>;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function VariacaoEstoqueExplicacao({
  lancamentosPecuarios,
  saldosIniciais,
  anoFiltro,
  mesLimite,
  fazendaId,
  precosMap,
  reposicaoFinanceiro,
  pesosReaisInicial,
  pesosReaisFinal,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const anoNum = Number(anoFiltro);

  // FONTE OFICIAL
  const rebanho = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });

  const dados = useMemo(() => {
    // ── BLOCO FÍSICO ──
    const cabInicio = saldosIniciais
      .filter(s => s.ano === anoNum)
      .reduce((sum, s) => sum + s.quantidade, 0);

    // FONTE OFICIAL: saldo final do mês
    const saldoFimMap = rebanho.getSaldoMap(mesLimite);
    const cabFim = Array.from(saldoFimMap.values()).reduce((s, v) => s + v, 0);
    const deltaCab = cabFim - cabInicio;

    const arrobasInicio = saldosIniciais
      .filter(s => s.ano === anoNum)
      .reduce((sum, s) => {
        const pesoKg = pesosReaisInicial?.[s.categoria] ?? s.pesoMedioKg ?? 0;
        return sum + s.quantidade * (pesoKg / 30);
      }, 0);

    let arrobasFim = 0;
    // Use official weight from rebanho or fallback to pesosReais prop
    const pesoMapOficial = rebanho.getPesoMedioMap(mesLimite);
    for (const [cat, qtd] of saldoFimMap.entries()) {
      const pesoKg = pesoMapOficial.get(cat) ?? pesosReaisFinal?.[cat] ?? saldosIniciais.find(s => s.ano === anoNum && s.categoria === cat)?.pesoMedioKg ?? 0;
      arrobasFim += qtd * (pesoKg / 30);
    }
    const deltaArrobas = arrobasFim - arrobasInicio;

    // ── BLOCO FINANCEIRO ──
    const precosInicial = precosMap.get(`${anoNum - 1}-12`) || [];
    const precosFinal = precosMap.get(`${anoFiltro}-${String(mesLimite).padStart(2, '0')}`) || [];
    const precoMapInicial = new Map(precosInicial.map(p => [p.categoria, p.preco_kg]));
    const precoMapFinal = new Map(precosFinal.map(p => [p.categoria, p.preco_kg]));

    const hasPrecoInicial = precosInicial.length > 0;
    const hasPrecoFinal = precosFinal.length > 0;
    const hasPrecos = hasPrecoInicial && hasPrecoFinal;

    let valorInicial = 0;
    saldosIniciais
      .filter(s => s.ano === anoNum)
      .forEach(s => {
        const preco = precoMapInicial.get(s.categoria) || 0;
        const pesoKg = pesosReaisInicial?.[s.categoria] ?? s.pesoMedioKg ?? 0;
        valorInicial += s.quantidade * pesoKg * preco;
      });

    let valorFinal = 0;
    for (const [cat, qtd] of saldoFimMap.entries()) {
      const preco = precoMapFinal.get(cat) || 0;
      const pesoKg = pesosReaisFinal?.[cat] ?? saldosIniciais.find(s => s.ano === anoNum && s.categoria === cat)?.pesoMedioKg ?? 0;
      valorFinal += qtd * pesoKg * preco;
    }

    const variacaoBruta = valorFinal - valorInicial;
    const variacaoLiquida = variacaoBruta - reposicaoFinanceiro;

    // ── Alertas de consistência ──
    const alertas: string[] = [];
    if (!hasPrecoInicial) alertas.push('Valor do estoque inicial (Dez/' + (anoNum - 1) + ') não preenchido');
    if (!hasPrecoFinal) alertas.push('Valor do estoque final (' + MESES_CURTOS[mesLimite - 1] + '/' + anoFiltro + ') não preenchido');
    if (reposicaoFinanceiro === 0 && cabFim > cabInicio) alertas.push('Reposição de bovinos zerada — verifique se há compras conciliadas no período');

    return {
      cabInicio, cabFim, deltaCab,
      arrobasInicio, arrobasFim, deltaArrobas,
      valorInicial, valorFinal,
      variacaoBruta,
      reposicao: reposicaoFinanceiro,
      variacaoLiquida,
      hasPrecos, hasPrecoInicial, hasPrecoFinal,
      alertas,
    };
  }, [saldosIniciais, lancamentosPecuarios, anoNum, anoFiltro, mesLimite, precosMap, reposicaoFinanceiro, pesosReaisInicial, pesosReaisFinal]);

  const colorVal = (v: number) =>
    v > 0 ? 'text-blue-600 dark:text-blue-400' : v < 0 ? 'text-red-600 dark:text-red-400' : '';

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
          <div className="mt-3 space-y-3 text-[11px]">

            {/* ── A) BLOCO FÍSICO ── */}
            <div>
              <div className="text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wide">
                📦 Estoque Físico
              </div>
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
            </div>

            {/* ── B) BLOCO FINANCEIRO ── */}
            <div className="border-t pt-2">
              <div className="text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wide">
                💰 Valorização do Estoque
              </div>
              {dados.hasPrecos ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Valor estoque inicial</span>
                  <span className="font-mono text-right font-bold">{formatMoeda(dados.valorInicial)}</span>

                  <span className="text-muted-foreground">Valor estoque final</span>
                  <span className="font-mono text-right font-bold">{formatMoeda(dados.valorFinal)}</span>

                  <span className="text-muted-foreground font-semibold">Variação bruta (final − inicial)</span>
                  <span className={`font-mono text-right font-bold ${colorVal(dados.variacaoBruta)}`}>
                    {formatMoeda(dados.variacaoBruta)}
                  </span>

                  <span className="text-muted-foreground">(-) Reposição de bovinos</span>
                  <span className="font-mono text-right text-red-600 dark:text-red-400">
                    {dados.reposicao > 0 ? `-${formatMoeda(dados.reposicao)}` : formatMoeda(0)}
                  </span>

                  <span className="font-bold">Variação líquida do estoque</span>
                  <span className={`font-mono text-right font-bold text-sm ${colorVal(dados.variacaoLiquida)}`}>
                    {formatMoeda(dados.variacaoLiquida)}
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground italic">
                  Dados insuficientes — preencha os valores de rebanho (R$/kg por categoria) no módulo Valor do Rebanho.
                </div>
              )}
            </div>

            {/* ── C) INTERPRETAÇÃO ── */}
            {dados.hasPrecos && (
              <div className="border-t pt-2 flex items-start gap-2">
                <span className="text-base">
                  {dados.variacaoLiquida > 0 ? '🟢' : dados.variacaoLiquida < 0 ? '🔴' : '🟡'}
                </span>
                <div>
                  <div className="font-bold">
                    {dados.variacaoLiquida > 0
                      ? 'Aumento de estoque'
                      : dados.variacaoLiquida < 0
                        ? 'Redução de estoque'
                        : 'Estoque estável'}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {dados.variacaoLiquida > 0
                      ? 'Parte do resultado está sendo retida no rebanho — o patrimônio pecuário cresceu.'
                      : dados.variacaoLiquida < 0
                        ? 'Pode indicar venda acima da reposição ou consumo de patrimônio pecuário.'
                        : 'Sem variação significativa de estoque no período.'}
                  </div>
                </div>
              </div>
            )}

            {/* ── ALERTA DE CONSISTÊNCIA ── */}
            {dados.alertas.length > 0 && (
              <div className="border-t pt-2 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 mb-1">
                  ⚠️ Alerta de consistência
                </div>
                <div className="text-[10px] text-amber-700 dark:text-amber-400 space-y-0.5">
                  <div>A variação de estoque depende de:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Valor do estoque inicial (Dez/{anoNum - 1})</li>
                    <li>Valor do estoque final ({MESES_CURTOS[mesLimite - 1]}/{anoFiltro})</li>
                    <li>Reposição de bovinos (Investimento em Bovinos, conciliado)</li>
                  </ul>
                  <div className="mt-1 font-semibold">Pendências encontradas:</div>
                  <ul className="list-disc pl-4">
                    {dados.alertas.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                  <div className="mt-1 italic">
                    Se alguma dessas bases não estiver validada, a DRE pode não fechar corretamente.
                  </div>
                </div>
              </div>
            )}

            {/* Fórmula de referência */}
            <div className="border-t pt-2 text-[9px] text-muted-foreground">
              <span className="font-bold">Fórmula:</span> Variação Líquida = Valor Estoque Final − Valor Estoque Inicial − Reposição de Bovinos
              <br />
              <span className="font-bold">Base Reposição:</span> financeiro_lancamentos · macro_custo = "Investimento em Bovinos" · status = Conciliado
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
