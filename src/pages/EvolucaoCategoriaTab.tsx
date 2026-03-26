import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial, CATEGORIAS, Categoria, isEntrada, isReclassificacao } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { filtrarPorCenario } from '@/lib/statusOperacional';
import { parseISO, format } from 'date-fns';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  initialAno?: string;
  initialMes?: string;
}

const MESES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const COLUNAS_MOV = [
  { tipo: 'nascimento', label: 'Nasc.', entrada: true },
  { tipo: 'compra', label: 'Compras', entrada: true },
  { tipo: 'transferencia_entrada', label: 'Transf.E', entrada: true },
  { tipo: 'reclassificacao_entrada', label: 'Recl.E', entrada: true },
  { tipo: 'abate', label: 'Abates', entrada: false },
  { tipo: 'venda', label: 'Vendas', entrada: false },
  { tipo: 'transferencia_saida', label: 'Transf.S', entrada: false },
  { tipo: 'consumo', label: 'Consumo', entrada: false },
  { tipo: 'morte', label: 'Mortes', entrada: false },
  { tipo: 'reclassificacao_saida', label: 'Recl.S', entrada: false },
];

export function EvolucaoCategoriaTab({ lancamentos, saldosIniciais, initialAno, initialMes }: Props) {
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(initialAno || String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState(initialMes || format(new Date(), 'MM'));
  const [statusFiltro, setStatusFiltro] = useState<'realizado' | 'previsto'>('realizado');

  const lancFiltrados = useMemo(() => {
    const cenario = statusFiltro === 'realizado' ? 'realizado' : 'meta';
    return filtrarPorCenario(lancamentos, cenario);
  }, [lancamentos, statusFiltro]);

  const dados = useMemo(() => {
    const mesKey = `${anoFiltro}-${mesFiltro}`;

    const filtrados = lancFiltrados.filter(l => {
      try {
        return format(parseISO(l.data), 'yyyy-MM') === mesKey;
      } catch { return false; }
    });

    const anteriores = lancFiltrados.filter(l => {
      try {
        return format(parseISO(l.data), 'yyyy-MM') < mesKey;
      } catch { return false; }
    });

    return CATEGORIAS.map(cat => {
      const saldoAno = saldosIniciais
        .filter(s => s.ano === Number(anoFiltro) && s.categoria === cat.value)
        .reduce((sum, s) => sum + s.quantidade, 0);

      const anterioresAno = anteriores.filter(l => {
        try {
          return format(parseISO(l.data), 'yyyy') === anoFiltro;
        } catch { return false; }
      });

      const entradasAnt = anterioresAno
        .filter(l => l.categoria === cat.value && isEntrada(l.tipo))
        .reduce((s, l) => s + l.quantidade, 0);
      const saidasAnt = anterioresAno
        .filter(l => l.categoria === cat.value && !isEntrada(l.tipo) && !isReclassificacao(l.tipo))
        .reduce((s, l) => s + l.quantidade, 0);
      const reclassEntAnt = anterioresAno
        .filter(l => l.tipo === 'reclassificacao' && l.categoriaDestino === cat.value)
        .reduce((s, l) => s + l.quantidade, 0);
      const reclassSaiAnt = anterioresAno
        .filter(l => l.tipo === 'reclassificacao' && l.categoria === cat.value)
        .reduce((s, l) => s + l.quantidade, 0);

      const saldoInicioMes = saldoAno + entradasAnt - saidasAnt + reclassEntAnt - reclassSaiAnt;

      const getQtd = (tipo: string) => {
        if (tipo === 'reclassificacao_entrada') {
          return filtrados
            .filter(l => l.tipo === 'reclassificacao' && l.categoriaDestino === cat.value)
            .reduce((s, l) => s + l.quantidade, 0);
        }
        if (tipo === 'reclassificacao_saida') {
          return filtrados
            .filter(l => l.tipo === 'reclassificacao' && l.categoria === cat.value)
            .reduce((s, l) => s + l.quantidade, 0);
        }
        return filtrados
          .filter(l => l.tipo === tipo && l.categoria === cat.value)
          .reduce((s, l) => s + l.quantidade, 0);
      };

      const movs = COLUNAS_MOV.map(col => getQtd(col.tipo));

      const totalEntradas = movs.slice(0, 4).reduce((a, b) => a + b, 0);
      const totalSaidas = movs.slice(4).reduce((a, b) => a + b, 0);
      const saldoFinal = saldoInicioMes + totalEntradas - totalSaidas;

      return { ...cat, saldoInicioMes, movs, saldoFinal };
    });
  }, [lancFiltrados, saldosIniciais, anoFiltro, mesFiltro]);

  const totais = useMemo(() => {
    const saldoIni = dados.reduce((s, d) => s + d.saldoInicioMes, 0);
    const movs = COLUNAS_MOV.map((_, i) => dados.reduce((s, d) => s + d.movs[i], 0));
    const saldoFin = dados.reduce((s, d) => s + d.saldoFinal, 0);
    return { saldoIni, movs, saldoFin };
  }, [dados]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4 animate-fade-in pb-20">
      {/* Filtros */}
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
            {MESES.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-base">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="text-left px-2 py-2 font-bold text-foreground sticky left-0 bg-primary/10 min-w-[80px]">
                Categoria
              </th>
              <th className="px-2 py-2 font-bold text-foreground text-center min-w-[55px] bg-primary/20">
                Saldo Ini.
              </th>
              {COLUNAS_MOV.map(col => (
                <th key={col.tipo} className={`px-2 py-2 font-bold text-center min-w-[50px] ${col.entrada ? 'text-success' : 'text-destructive'}`}>
                  {col.label}
                </th>
              ))}
              <th className="px-2 py-2 font-bold text-foreground text-center min-w-[55px] bg-primary/20">
                Saldo Fin.
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.map((cat, i) => (
              <tr key={cat.value} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                <td className={`px-2 py-1.5 font-bold text-foreground sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}>
                  {cat.label}
                </td>
                <td className="px-2 py-1.5 text-center font-semibold text-foreground bg-primary/5">
                  {cat.saldoInicioMes}
                </td>
                {cat.movs.map((val, j) => (
                  <td key={j} className={`px-2 py-1.5 text-center font-semibold ${val > 0 ? (COLUNAS_MOV[j].entrada ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
                    {val || '-'}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center font-extrabold text-foreground bg-primary/5">
                  {cat.saldoFinal}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 bg-primary/10">
              <td className="px-2 py-2 font-extrabold text-foreground sticky left-0 bg-primary/10">TOTAL</td>
              <td className="px-2 py-2 text-center font-extrabold text-foreground">{totais.saldoIni}</td>
              {totais.movs.map((val, j) => (
                <td key={j} className={`px-2 py-2 text-center font-extrabold ${val > 0 ? (COLUNAS_MOV[j].entrada ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
                  {val || '-'}
                </td>
              ))}
              <td className="px-2 py-2 text-center font-extrabold text-foreground">{totais.saldoFin}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
