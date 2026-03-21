import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial, isEntrada, isReclassificacao } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { SubAba } from './FinanceiroTab';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onNavigateToMovimentacao?: (subAba: SubAba) => void;
}

const MESES_COLS = [
  { key: '01', label: 'Jan' },
  { key: '02', label: 'Fev' },
  { key: '03', label: 'Mar' },
  { key: '04', label: 'Abr' },
  { key: '05', label: 'Mai' },
  { key: '06', label: 'Jun' },
  { key: '07', label: 'Jul' },
  { key: '08', label: 'Ago' },
  { key: '09', label: 'Set' },
  { key: '10', label: 'Out' },
  { key: '11', label: 'Nov' },
  { key: '12', label: 'Dez' },
];

type FluxoTipo = 'nascimento' | 'compra' | 'transferencia_entrada' | 'abate' | 'venda' | 'transferencia_saida' | 'consumo' | 'morte';

const LINHAS: { tipo: FluxoTipo; label: string; sinal: '+' | '-' }[] = [
  { tipo: 'nascimento', label: 'Nascimentos', sinal: '+' },
  { tipo: 'compra', label: 'Compras', sinal: '+' },
  { tipo: 'transferencia_entrada', label: 'Transf. Entrada', sinal: '+' },
  { tipo: 'abate', label: 'Abates', sinal: '-' },
  { tipo: 'venda', label: 'Vendas em Pé', sinal: '-' },
  { tipo: 'transferencia_saida', label: 'Transf. Saída', sinal: '-' },
  { tipo: 'consumo', label: 'Consumo', sinal: '-' },
  { tipo: 'morte', label: 'Mortes', sinal: '-' },
];

export function FluxoAnualTab({ lancamentos, saldosIniciais, onNavigateToMovimentacao }: Props) {
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));

  const dados = useMemo(() => {
    const saldoInicialAno = saldosIniciais
      .filter(s => s.ano === Number(anoFiltro))
      .reduce((sum, s) => sum + s.quantidade, 0);

    const lancAno = lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoFiltro; }
      catch { return false; }
    });

    // Por mês e tipo
    const porMesTipo: Record<string, Record<FluxoTipo, number>> = {};
    MESES_COLS.forEach(m => {
      porMesTipo[m.key] = {} as Record<FluxoTipo, number>;
      LINHAS.forEach(li => { porMesTipo[m.key][li.tipo] = 0; });
    });

    lancAno.forEach(l => {
      const mes = format(parseISO(l.data), 'MM');
      if (porMesTipo[mes] && !isReclassificacao(l.tipo)) {
        const tipo = l.tipo as FluxoTipo;
        if (porMesTipo[mes][tipo] !== undefined) {
          porMesTipo[mes][tipo] += l.quantidade;
        }
      }
    });

    // Saldo início de cada mês
    const saldoInicioMes: Record<string, number> = {};
    let acum = saldoInicialAno;
    MESES_COLS.forEach(m => {
      saldoInicioMes[m.key] = acum;
      const entradas = LINHAS.filter(li => li.sinal === '+').reduce((s, li) => s + porMesTipo[m.key][li.tipo], 0);
      const saidas = LINHAS.filter(li => li.sinal === '-').reduce((s, li) => s + porMesTipo[m.key][li.tipo], 0);
      acum += entradas - saidas;
    });

    // Saldo final (após dezembro)
    const saldoFinalAno = acum;

    // Total do ano por tipo
    const totalAno: Record<FluxoTipo, number> = {} as any;
    LINHAS.forEach(li => {
      totalAno[li.tipo] = MESES_COLS.reduce((s, m) => s + porMesTipo[m.key][li.tipo], 0);
    });

    return { porMesTipo, saldoInicioMes, saldoFinalAno, totalAno, saldoInicialAno };
  }, [lancamentos, saldosIniciais, anoFiltro]);

  const totalEntradasAno = LINHAS.filter(l => l.sinal === '+').reduce((s, l) => s + dados.totalAno[l.tipo], 0);
  const totalSaidasAno = LINHAS.filter(l => l.sinal === '-').reduce((s, l) => s + dados.totalAno[l.tipo], 0);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4 animate-fade-in pb-20">
      {/* Filtro ano */}
      <div className="max-w-[200px]">
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
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="text-left px-2 py-2 font-bold text-foreground sticky left-0 bg-primary/10 min-w-[110px]">
                Movimentação
              </th>
              {MESES_COLS.map(m => (
                <th key={m.key} className="px-2 py-2 font-bold text-foreground text-center min-w-[45px]">
                  {m.label}
                </th>
              ))}
              <th className="px-2 py-2 font-bold text-foreground text-center min-w-[55px] bg-primary/20">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Saldo início do mês */}
            <tr className="bg-primary/10 border-b">
              <td className="px-2 py-2 font-bold text-foreground sticky left-0 bg-primary/10">Saldo Início</td>
              {MESES_COLS.map(m => (
                <td key={m.key} className="px-2 py-2 text-center font-extrabold text-foreground">
                  {dados.saldoInicioMes[m.key]}
                </td>
              ))}
              <td className="px-2 py-2 text-center font-extrabold text-foreground bg-primary/20">
                {dados.saldoInicialAno}
              </td>
            </tr>

            {/* Linhas de movimentação */}
            {LINHAS.map((li, i) => (
              <tr key={li.tipo} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                <td className={`px-2 py-1.5 font-bold text-foreground sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}>
                  {li.sinal === '+' ? '➕' : '➖'} {li.label}
                </td>
                {MESES_COLS.map(m => {
                  const val = dados.porMesTipo[m.key][li.tipo];
                  return (
                    <td key={m.key} className={`px-2 py-1.5 text-center font-semibold ${val > 0 ? (li.sinal === '+' ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
                      {val || '-'}
                    </td>
                  );
                })}
                <td className={`px-2 py-1.5 text-center font-bold bg-primary/5 ${dados.totalAno[li.tipo] > 0 ? (li.sinal === '+' ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
                  {dados.totalAno[li.tipo] || '-'}
                </td>
              </tr>
            ))}

            {/* Saldo final */}
            <tr className="border-t-2 bg-primary/10">
              <td className="px-2 py-2 font-extrabold text-foreground sticky left-0 bg-primary/10">Saldo Final</td>
              {MESES_COLS.map((m, i) => {
                // Saldo final do mês = saldo início do próximo mês (ou saldoFinalAno para dezembro)
                const saldoFim = i < 11 ? dados.saldoInicioMes[MESES_COLS[i + 1].key] : dados.saldoFinalAno;
                return (
                  <td key={m.key} className="px-2 py-2 text-center font-extrabold text-foreground">
                    {saldoFim}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center font-extrabold text-foreground bg-primary/20">
                {dados.saldoFinalAno}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
