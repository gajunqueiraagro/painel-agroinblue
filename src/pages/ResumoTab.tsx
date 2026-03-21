import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial, isEntrada, isReclassificacao, CATEGORIAS, Categoria } from '@/types/cattle';
import { TrendingUp, TrendingDown, Beef, BarChart2, Percent } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseISO, format } from 'date-fns';
import { kgToArrobas } from '@/types/cattle';
import { TabId } from '@/components/BottomNav';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId) => void;
}

const MESES = [
  { value: 'todos', label: 'Todos' },
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

export function ResumoTab({ lancamentos, saldosIniciais, onTabChange }: Props) {
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
  const [mesFiltro, setMesFiltro] = useState('todos');

  const filtrados = useMemo(() => {
    return lancamentos.filter(l => {
      try {
        const d = parseISO(l.data);
        const ano = format(d, 'yyyy');
        const mes = format(d, 'MM');
        if (ano !== anoFiltro) return false;
        if (mesFiltro !== 'todos' && mes !== mesFiltro) return false;
        return true;
      } catch { return false; }
    });
  }, [lancamentos, anoFiltro, mesFiltro]);

  const saldoInicialAno = useMemo(() => {
    return saldosIniciais
      .filter(s => s.ano === Number(anoFiltro))
      .reduce((sum, s) => sum + s.quantidade, 0);
  }, [saldosIniciais, anoFiltro]);

  // Saldo início do mês: saldo ano + acumulado meses anteriores
  const saldoInicialPeriodo = useMemo(() => {
    if (mesFiltro === 'todos') return saldoInicialAno;
    const mesNum = Number(mesFiltro);
    const acumulado = lancamentos.filter(l => {
      try {
        const d = parseISO(l.data);
        return format(d, 'yyyy') === anoFiltro && Number(format(d, 'MM')) < mesNum;
      } catch { return false; }
    }).reduce((sum, l) => {
      if (isEntrada(l.tipo)) return sum + l.quantidade;
      if (!isReclassificacao(l.tipo)) return sum - l.quantidade;
      return sum;
    }, 0);
    return saldoInicialAno + acumulado;
  }, [lancamentos, saldosIniciais, anoFiltro, mesFiltro, saldoInicialAno]);

  const totalEntradas = filtrados
    .filter(l => isEntrada(l.tipo))
    .reduce((sum, l) => sum + l.quantidade, 0);

  const totalSaidas = filtrados
    .filter(l => !isEntrada(l.tipo) && !isReclassificacao(l.tipo))
    .reduce((sum, l) => sum + l.quantidade, 0);

  const saldo = saldoInicialPeriodo + totalEntradas - totalSaidas;

  // Desfrute calculations
  const tiposDesfrute = ['abate', 'venda', 'consumo'];
  const desfrutados = filtrados.filter(l => tiposDesfrute.includes(l.tipo));
  const totalDesfruteCab = desfrutados.reduce((sum, l) => sum + l.quantidade, 0);
  const totalDesfrunteArrobas = desfrutados.reduce((sum, l) => sum + (l.pesoMedioArrobas || 0) * l.quantidade, 0);

  const arrobasInicioAno = useMemo(() => {
    return saldosIniciais
      .filter(s => s.ano === Number(anoFiltro))
      .reduce((sum, s) => {
        const pesoKg = s.pesoMedioKg || 0;
        return sum + s.quantidade * kgToArrobas(pesoKg);
      }, 0);
  }, [saldosIniciais, anoFiltro]);

  const pctDesfruteCab = saldoInicialAno > 0 ? (totalDesfruteCab / saldoInicialAno) * 100 : 0;
  const pctDesfrunteArrobas = arrobasInicioAno > 0 ? (totalDesfrunteArrobas / arrobasInicioAno) * 100 : 0;

  const porCategoria = CATEGORIAS.map(cat => {
    const saldoIniAno = saldosIniciais
      .filter(s => s.ano === Number(anoFiltro) && s.categoria === cat.value)
      .reduce((sum, s) => sum + s.quantidade, 0);
    // Acumulado de meses anteriores por categoria
    let saldoIniCat = saldoIniAno;
    if (mesFiltro !== 'todos') {
      const mesNum = Number(mesFiltro);
      const anteriores = lancamentos.filter(l => {
        try {
          const d = parseISO(l.data);
          return format(d, 'yyyy') === anoFiltro && Number(format(d, 'MM')) < mesNum;
        } catch { return false; }
      });
      anteriores.forEach(l => {
        if (l.categoria === cat.value && isEntrada(l.tipo)) saldoIniCat += l.quantidade;
        if (l.categoria === cat.value && !isEntrada(l.tipo) && !isReclassificacao(l.tipo)) saldoIniCat -= l.quantidade;
        if (l.tipo === 'reclassificacao' && l.categoria === cat.value) saldoIniCat -= l.quantidade;
        if (l.tipo === 'reclassificacao' && l.categoriaDestino === cat.value) saldoIniCat += l.quantidade;
      });
    }
    const entradas = filtrados
      .filter(l => l.categoria === cat.value && isEntrada(l.tipo))
      .reduce((s, l) => s + l.quantidade, 0);
    const saidas = filtrados
      .filter(l => l.categoria === cat.value && !isEntrada(l.tipo) && !isReclassificacao(l.tipo))
      .reduce((s, l) => s + l.quantidade, 0);
    const reclassSaida = filtrados
      .filter(l => l.tipo === 'reclassificacao' && l.categoria === cat.value)
      .reduce((s, l) => s + l.quantidade, 0);
    const reclassEntrada = filtrados
      .filter(l => l.tipo === 'reclassificacao' && l.categoriaDestino === cat.value)
      .reduce((s, l) => s + l.quantidade, 0);
    return { ...cat, saldo: saldoIniCat + entradas - saidas - reclassSaida + reclassEntrada };
  }).filter(c => c.saldo !== 0);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
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

      {/* Saldo principal */}
      <div className="bg-primary rounded-lg p-5 text-center shadow-md">
        <Beef className="h-10 w-10 mx-auto text-primary-foreground mb-2" />
        <p className="text-primary-foreground text-sm font-semibold opacity-80">Saldo Atual</p>
        <p className="text-4xl font-extrabold text-primary-foreground">{saldo}</p>
        <p className="text-primary-foreground text-sm opacity-70">cabeças</p>
      </div>

      {/* Entradas e saídas */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Saldo Inicial</p>
          <p className="text-xl font-extrabold text-foreground">{saldoInicialPeriodo}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <TrendingUp className="h-5 w-5 mx-auto text-success mb-1" />
          <p className="text-xs text-muted-foreground font-semibold">Entradas</p>
          <p className="text-xl font-extrabold text-foreground">+{totalEntradas}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <TrendingDown className="h-5 w-5 mx-auto text-destructive mb-1" />
          <p className="text-xs text-muted-foreground font-semibold">Saídas</p>
          <p className="text-xl font-extrabold text-foreground">-{totalSaidas}</p>
        </div>
      </div>

      {/* Desfrute */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Desfrute (cab.)</p>
          <p className="text-xl font-extrabold text-foreground">{totalDesfruteCab}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <Percent className="h-4 w-4 mx-auto text-amber-600 mb-1" />
          <p className="text-xs text-muted-foreground font-semibold">% Desfrute Cab.</p>
          <p className="text-xl font-extrabold text-foreground">{pctDesfruteCab.toFixed(1)}%</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <Percent className="h-4 w-4 mx-auto text-amber-600 mb-1" />
          <p className="text-xs text-muted-foreground font-semibold">% Desfrute @</p>
          <p className="text-xl font-extrabold text-foreground">{pctDesfrunteArrobas.toFixed(1)}%</p>
        </div>
      </div>

      {/* Link para análise gráfica */}
      <button
        onClick={() => onTabChange('analise')}
        className="w-full inline-flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors border border-primary/20"
      >
        <BarChart2 className="h-4 w-4" />
        Análise Gráfica
      </button>

      {/* Por categoria */}
      {porCategoria.length > 0 && (
        <div className="bg-card rounded-lg p-4 shadow-sm border">
          <h2 className="font-bold text-foreground mb-3">Por Categoria</h2>
          <div className="space-y-2">
            {porCategoria.map(c => (
              <div key={c.value} className="flex justify-between items-center py-1 border-b last:border-0">
                <span className="text-sm font-semibold text-foreground">{c.label}</span>
                <span className="text-sm font-extrabold text-foreground">{c.saldo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtrados.length === 0 && saldoInicialPeriodo === 0 && (
        <div className="text-center py-10">
          <p className="text-muted-foreground text-lg font-semibold">Nenhum lançamento neste período</p>
          <p className="text-muted-foreground text-sm mt-1">Toque em "Lançar" para começar</p>
        </div>
      )}
    </div>
  );
}
