/**
 * Sub-aba "Fechamento Categoria" — fotografia oficial mensal por categoria.
 *
 * Fonte única de verdade para GMD, Valor do Rebanho e indicadores.
 */

import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useFechamentoCategoria, type OrigemPeso } from '@/hooks/useFechamentoCategoria';
import { formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

const ORIGEM_LABELS: Record<OrigemPeso, { label: string; color: string; desc: string }> = {
  pastos: { label: 'Pastos', color: 'bg-green-500/15 text-green-700 border-green-500/30', desc: 'Peso agregado dos fechamentos de pasto' },
  lancamento: { label: 'Lançamento', color: 'bg-blue-500/15 text-blue-700 border-blue-500/30', desc: 'Último lançamento com peso no período' },
  saldo_inicial: { label: 'Saldo Ini.', color: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30', desc: 'Peso do saldo inicial do ano' },
  sem_base: { label: 'Sem base', color: 'bg-red-500/15 text-red-700 border-red-500/30', desc: 'Nenhuma fonte de peso encontrada' },
};

export function FechamentoCategoriaTab({ lancamentos, saldosIniciais }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));

  const resumo = useFechamentoCategoria(
    fazendaId,
    Number(anoFiltro),
    Number(mesFiltro),
    lancamentos,
    saldosIniciais,
    categorias,
  );

  if (isGlobal) {
    return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para ver o fechamento por categoria.</div>;
  }

  const rowsComQtd = resumo.rows.filter(r => r.quantidadeFinal > 0);
  const rowsSemBase = resumo.rows.filter(r => r.quantidadeFinal > 0 && r.origemPeso === 'sem_base');
  const rowsEstimativa = resumo.rows.filter(r => r.quantidadeFinal > 0 && (r.origemPeso === 'lancamento' || r.origemPeso === 'saldo_inicial'));

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-20">
      {/* Filtros - sticky */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="touch-target text-base font-bold">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mesFiltro} onValueChange={setMesFiltro}>
            <SelectTrigger className="touch-target text-base font-bold">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {MESES_COLS.map(m => (
                <SelectItem key={m.key} value={m.key} className="text-base">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4 space-y-4">

      {/* Info */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <span className="text-xs text-muted-foreground">
          Base oficial do mês. Quantidade = saldo conciliado do sistema. Peso = agregação ponderada dos fechamentos de pasto (quando disponível).
        </span>
      </div>

      {/* Avisos */}
      {rowsSemBase.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
          <span className="font-semibold text-red-700">⚠ {rowsSemBase.length} categoria(s) sem base de peso:</span>{' '}
          <span className="text-red-600">{rowsSemBase.map(r => r.categoriaNome).join(', ')}</span>
        </div>
      )}
      {rowsEstimativa.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          <span className="font-semibold text-yellow-700">⚠ {rowsEstimativa.length} categoria(s) com peso estimado</span>{' '}
          <span className="text-yellow-600">(não baseado em fechamento de pastos)</span>
        </div>
      )}

      {/* Tabela */}
      {resumo.loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-primary/10">
                <th className="text-left px-3 py-2 font-bold text-foreground sticky left-0 bg-primary/10 min-w-[120px]">Categoria</th>
                <th className="px-3 py-2 font-bold text-foreground text-right min-w-[70px]">Qtd Final</th>
                <th className="px-3 py-2 font-bold text-foreground text-right min-w-[80px]">Peso Médio</th>
                <th className="px-3 py-2 font-bold text-foreground text-right min-w-[90px]">Peso Total</th>
                <th className="px-3 py-2 font-bold text-foreground text-center min-w-[90px]">Origem</th>
              </tr>
            </thead>
            <tbody>
              {resumo.rows.map((row, i) => {
                const origemInfo = ORIGEM_LABELS[row.origemPeso];
                const temQtd = row.quantidadeFinal > 0;
                return (
                  <tr key={row.categoriaId} className={`${i % 2 === 0 ? '' : 'bg-muted/30'} ${!temQtd ? 'opacity-40' : ''}`}>
                    <td className={`px-3 py-2 font-semibold text-foreground sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}>
                      {row.categoriaNome}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-foreground">
                      {row.quantidadeFinal}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {row.pesoMedioFinalKg !== null ? `${formatNum(row.pesoMedioFinalKg, 1)} kg` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {row.pesoTotalFinalKg > 0 ? `${formatNum(row.pesoTotalFinalKg, 0)} kg` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {temQtd && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className={`text-[10px] ${origemInfo.color}`}>
                              {origemInfo.label}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="text-xs">{origemInfo.desc}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* Totais */}
              <tr className="border-t-2 bg-primary/10">
                <td className="px-3 py-2 font-extrabold text-foreground sticky left-0 bg-primary/10">TOTAL</td>
                <td className="px-3 py-2 text-right font-extrabold text-foreground">{resumo.totalCabecas}</td>
                <td className="px-3 py-2 text-right font-extrabold text-foreground">
                  {resumo.pesoMedioGeral !== null ? `${formatNum(resumo.pesoMedioGeral, 1)} kg` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-extrabold text-foreground">
                  {resumo.pesoTotalGeral > 0 ? `${formatNum(resumo.pesoTotalGeral, 0)} kg` : '—'}
                </td>
                <td className="px-3 py-2 text-center">
                  <Badge variant="outline" className="text-[10px]">
                    {rowsComQtd.length} cat.
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
