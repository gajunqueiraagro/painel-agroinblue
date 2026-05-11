/**
 * FluxoCaixa — Página 5 do Fechamento do Período.
 * 2 tabelas (Créditos / Débitos) + 2 PieCharts + card de Caixa Final.
 */

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { FechamentoPeriodoDTO, MacroNode } from '@/v2/types/fechamentoPeriodo';
import { fmt } from './fmt';

interface Props { dto: FechamentoPeriodoDTO; }

const CORES = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#65a30d'];

function somarMacros(nodes: MacroNode[], macroNome: string): number {
  const node = nodes.find(n => n.label === macroNome);
  return node?.realizado ?? 0;
}

export default function FluxoCaixa({ dto }: Props) {
  const c = dto.cabecalho;
  const entradasMacros = dto.resumoMacro.entradas;
  const saidasMacros = dto.resumoMacro.saidas;

  // Créditos
  const receitas = somarMacros(entradasMacros, 'Receita Operacional');
  const aportes = somarMacros(entradasMacros, 'Entrada Financeira'); // proxy: entrada financeira geral

  const creditos = [
    { nome: 'Receitas', valor: receitas },
    { nome: 'Aportes / Entradas Fin.', valor: aportes },
  ].filter(x => x.valor > 0);

  // Débitos
  const custos = somarMacros(saidasMacros, 'Custeio Produção');
  const investFazenda = somarMacros(saidasMacros, 'Investimento na Fazenda');
  const reposicao = somarMacros(saidasMacros, 'Investimento em Bovinos');
  const amortizacoes = somarMacros(saidasMacros, 'Saída Financeira');
  const dividendos = somarMacros(saidasMacros, 'Dividendos');

  const debitos = [
    { nome: 'Custos Produtivos', valor: custos },
    { nome: 'Investimentos Faz.', valor: investFazenda },
    { nome: 'Reposição Animais', valor: reposicao },
    { nome: 'Amortizações', valor: amortizacoes },
    { nome: 'Dividendos', valor: dividendos },
  ].filter(x => x.valor > 0);

  return (
    <section className="pagina-fechamento">
      <h2>Fluxo de Caixa</h2>

      <div className="cards-grid">
        <div className="card-mini">
          <div className="card-mini-titulo">Caixa Final</div>
          <div className="card-mini-valor">R$ {fmt(c.caixaFinal.realizado)}</div>
        </div>
        <div className="card-mini">
          <div className="card-mini-titulo">Geração de Caixa</div>
          <div className="card-mini-valor">R$ {fmt(c.geracaoCaixa.realizado)}</div>
        </div>
      </div>

      <div className="tabelas-lado-a-lado">
        <div>
          <h3>Créditos em Caixa</h3>
          <table className="fechamento-table">
            <thead>
              <tr><th>Fonte</th><th className="num">Valor</th></tr>
            </thead>
            <tbody>
              {creditos.map(c => (
                <tr key={c.nome}>
                  <td>{c.nome}</td>
                  <td className="num">R$ {fmt(c.valor)}</td>
                </tr>
              ))}
              <tr className="linha-total">
                <td>Total</td>
                <td className="num">R$ {fmt(dto.resumoMacro.totalEntradas.realizado)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h3>Débitos em Caixa</h3>
          <table className="fechamento-table">
            <thead>
              <tr><th>Destino</th><th className="num">Valor</th></tr>
            </thead>
            <tbody>
              {debitos.map(d => (
                <tr key={d.nome}>
                  <td>{d.nome}</td>
                  <td className="num">R$ {fmt(d.valor)}</td>
                </tr>
              ))}
              <tr className="linha-total">
                <td>Total</td>
                <td className="num">R$ {fmt(dto.resumoMacro.totalSaidas.realizado)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="fluxo-graficos">
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={creditos} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={80} label>
                {creditos.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `R$ ${fmt(v)}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={debitos} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={80} label>
                {debitos.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `R$ ${fmt(v)}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
