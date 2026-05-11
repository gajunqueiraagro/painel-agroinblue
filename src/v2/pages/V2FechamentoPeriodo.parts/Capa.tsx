/**
 * Capa — Página 1 do PDF Fechamento do Período.
 * Frases determinísticas (sem IA, sem semáforo).
 */

import logo from '@/assets/logo.png';
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct, formatarPeriodo } from './fmt';

interface Props {
  dto: FechamentoPeriodoDTO;
  nomeCliente?: string;
  nomeFazenda?: string;
}

export default function Capa({ dto, nomeCliente, nomeFazenda }: Props) {
  const c = dto.cabecalho;
  const dataGeracao = new Date(dto.geradoEm).toLocaleDateString('pt-BR');

  return (
    <section className="pagina-fechamento capa">
      <div className="capa-header">
        <h1>Análise de Indicadores</h1>
        <img src={logo} alt="Agroinblue" className="capa-logo" />
      </div>

      <div className="capa-meta">
        <div>Produtor: <strong>{nomeCliente ?? '—'}</strong></div>
        <div>Período de Referência: <strong>{formatarPeriodo(dto.periodoInicio, dto.periodoFim)}</strong></div>
        <div>Fazenda: <strong>{nomeFazenda ?? 'Global'}</strong></div>
        <div>Gerado em: <strong>{dataGeracao}</strong></div>
      </div>

      <h2>Resumo Executivo</h2>
      <div className="capa-resumo">
        <p>Resultado do período: <strong>R$ {fmt(c.resultadoPeriodo.realizado)}</strong> ({pct(c.resultadoPeriodo.desvioMetaPct)} vs META)</p>
        <p>Caixa final: <strong>R$ {fmt(c.caixaFinal.realizado)}</strong></p>
        <p>Receita Pecuária: <strong>R$ {fmt(c.receitaPecuaria.realizado)}</strong> ({pct(c.receitaPecuaria.desvioMetaPct)} vs META)</p>
        <p>Custeio Produção: <strong>R$ {fmt(c.custeioPecuaria.realizado)}</strong></p>
        <p>Investimentos Fazenda: <strong>R$ {fmt(c.investimentosFazendaPec.realizado)}</strong></p>
        <p>Juros Financiamento: <strong>R$ {fmt(c.jurosFinanciamentoPec.realizado)}</strong></p>
        <p>Arrobas Produzidas: <strong>{fmt(c.arrobasProduzidas.realizado)} @</strong></p>
        <p>GMD médio: <strong>{fmt(c.gmd.realizado, 3)} kg/dia</strong></p>
      </div>
    </section>
  );
}
