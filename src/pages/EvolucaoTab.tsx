import { useMemo } from 'react';
import { Lancamento, SaldoInicial, CATEGORIAS, isEntrada, isReclassificacao, Categoria } from '@/types/cattle';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

export function EvolucaoTab({ lancamentos, saldosIniciais }: Props) {
  const { meses, dados } = useMemo(() => {
    if (lancamentos.length === 0 && saldosIniciais.length === 0) return { meses: [], dados: {} };

    // Collect all months
    const mesesSet = new Set<string>();
    lancamentos.forEach(l => {
      try {
        const d = parseISO(l.data);
        mesesSet.add(format(d, 'yyyy-MM'));
      } catch { /* skip */ }
    });

    const mesesArr = Array.from(mesesSet).sort();
    if (mesesArr.length === 0) return { meses: [], dados: {} };

    // Get the year of the first month to find saldo inicial
    const primeiroAno = Number(mesesArr[0].split('-')[0]);

    // Build cumulative saldo per category per month
    const dados: Record<Categoria, { saldoInicial: number; meses: Record<string, number> }> = {} as any;
    CATEGORIAS.forEach(c => {
      const saldoIni = saldosIniciais
        .filter(s => s.ano === primeiroAno && s.categoria === c.value)
        .reduce((sum, s) => sum + s.quantidade, 0);

      dados[c.value] = { saldoInicial: saldoIni, meses: {} };
      let acum = saldoIni;

      mesesArr.forEach(mes => {
        const entradasMes = lancamentos
          .filter(l => {
            try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.categoria === c.value && isEntrada(l.tipo); }
            catch { return false; }
          })
          .reduce((s, l) => s + l.quantidade, 0);
        const saidasMes = lancamentos
          .filter(l => {
            try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.categoria === c.value && !isEntrada(l.tipo) && !isReclassificacao(l.tipo); }
            catch { return false; }
          })
          .reduce((s, l) => s + l.quantidade, 0);
        const reclassEntMes = lancamentos
          .filter(l => {
            try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.tipo === 'reclassificacao' && l.categoriaDestino === c.value; }
            catch { return false; }
          })
          .reduce((s, l) => s + l.quantidade, 0);
        const reclassSaiMes = lancamentos
          .filter(l => {
            try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.tipo === 'reclassificacao' && l.categoria === c.value; }
            catch { return false; }
          })
          .reduce((s, l) => s + l.quantidade, 0);

        acum += entradasMes - saidasMes + reclassEntMes - reclassSaiMes;
        dados[c.value].meses[mes] = acum;
      });
    });

    return { meses: mesesArr, dados };
  }, [lancamentos, saldosIniciais]);

  if (meses.length === 0) {
    return (
      <div className="p-4 max-w-lg mx-auto animate-fade-in pb-20">
        <div className="text-center py-10">
          <p className="text-muted-foreground text-lg font-semibold">Nenhum dado ainda</p>
          <p className="text-muted-foreground text-sm mt-1">Faça lançamentos para ver a evolução</p>
        </div>
      </div>
    );
  }

  const totalSaldoInicial = CATEGORIAS.reduce((s, c) => s + (dados[c.value]?.saldoInicial || 0), 0);

  return (
    <div className="p-4 max-w-4xl mx-auto animate-fade-in pb-20">
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="text-left px-3 py-2 font-bold text-foreground sticky left-0 bg-primary/10 min-w-[100px]">
                Categoria
              </th>
              <th className="px-3 py-2 font-bold text-foreground text-center min-w-[70px] bg-primary/20">
                Saldo Ini.
              </th>
              {meses.map(m => (
                <th key={m} className="px-3 py-2 font-bold text-foreground text-center whitespace-nowrap min-w-[70px]">
                  {format(parseISO(m + '-01'), 'MMM/yy', { locale: ptBR })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIAS.map((cat, i) => (
              <tr key={cat.value} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                <td className={`px-3 py-2 font-bold text-foreground sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}>
                  {cat.label}
                </td>
                <td className="px-3 py-2 text-center font-semibold text-foreground bg-primary/5">
                  {dados[cat.value]?.saldoInicial || 0}
                </td>
                {meses.map(m => (
                  <td key={m} className="px-3 py-2 text-center font-semibold text-foreground">
                    {dados[cat.value]?.meses[m] || 0}
                  </td>
                ))}
              </tr>
            ))}
            {/* Total row */}
            <tr className="border-t-2 bg-primary/10">
              <td className="px-3 py-2 font-extrabold text-foreground sticky left-0 bg-primary/10">TOTAL</td>
              <td className="px-3 py-2 text-center font-extrabold text-foreground">{totalSaldoInicial}</td>
              {meses.map(m => {
                const total = CATEGORIAS.reduce((s, c) => s + (dados[c.value]?.meses[m] || 0), 0);
                return (
                  <td key={m} className="px-3 py-2 text-center font-extrabold text-foreground">{total}</td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
