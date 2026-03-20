import { useState } from 'react';
import { Lancamento, SaldoInicial, isEntrada, isReclassificacao } from '@/types/cattle';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, parseISO, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

const MESES_LABEL = (d: Date) => format(d, 'MMMM yyyy', { locale: ptBR });

type FluxoTipo = 'nascimento' | 'compra' | 'transferencia_entrada' | 'abate' | 'venda' | 'transferencia_saida' | 'consumo' | 'morte';

const FLUXO_CONFIG: { tipo: FluxoTipo; label: string; sinal: '+' | '-' }[] = [
  { tipo: 'nascimento', label: 'Nascimentos', sinal: '+' },
  { tipo: 'compra', label: 'Compras', sinal: '+' },
  { tipo: 'transferencia_entrada', label: 'Transf. Entrada', sinal: '+' },
  { tipo: 'abate', label: 'Abates', sinal: '-' },
  { tipo: 'venda', label: 'Vendas em Pé', sinal: '-' },
  { tipo: 'transferencia_saida', label: 'Transf. Saída', sinal: '-' },
  { tipo: 'consumo', label: 'Consumo', sinal: '-' },
  { tipo: 'morte', label: 'Mortes', sinal: '-' },
];

export function MovimentacaoTab({ lancamentos, saldosIniciais }: Props) {
  const [mesAtual, setMesAtual] = useState(new Date());

  const inicio = startOfMonth(mesAtual);
  const fim = endOfMonth(mesAtual);
  const anoAtual = format(mesAtual, 'yyyy');

  const lancamentosMes = lancamentos.filter(l => {
    try {
      const d = parseISO(l.data);
      return isWithinInterval(d, { start: inicio, end: fim });
    } catch {
      return false;
    }
  });

  // Saldo inicial do ano (definido pelo usuário)
  const saldoInicialAno = saldosIniciais
    .filter(s => s.ano === Number(anoAtual))
    .reduce((sum, s) => sum + s.quantidade, 0);

  // Lançamentos anteriores ao mês selecionado MAS no mesmo ano
  const inicioAno = parseISO(`${anoAtual}-01-01`);
  const lancamentosAnterioresMes = lancamentos.filter(l => {
    try {
      const d = parseISO(l.data);
      return d >= inicioAno && isBefore(d, inicio);
    } catch {
      return false;
    }
  });

  const entradasAnt = lancamentosAnterioresMes
    .filter(l => isEntrada(l.tipo))
    .reduce((s, l) => s + l.quantidade, 0);
  const saidasAnt = lancamentosAnterioresMes
    .filter(l => !isEntrada(l.tipo) && !isReclassificacao(l.tipo))
    .reduce((s, l) => s + l.quantidade, 0);

  const saldoInicial = saldoInicialAno + entradasAnt - saidasAnt;

  const getTotal = (tipo: FluxoTipo) =>
    lancamentosMes.filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0);

  const totalEntradas = lancamentosMes.filter(l => isEntrada(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
  const totalSaidas = lancamentosMes.filter(l => !isEntrada(l.tipo) && !isReclassificacao(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
  const saldoFinal = saldoInicial + totalEntradas - totalSaidas;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-3 animate-fade-in pb-20">
      {/* Seletor de mês */}
      <div className="flex items-center justify-between bg-card rounded-lg p-3 shadow-sm border">
        <button
          onClick={() => setMesAtual(subMonths(mesAtual, 1))}
          className="touch-target flex items-center justify-center rounded-md hover:bg-muted"
        >
          <ChevronLeft className="h-6 w-6 text-foreground" />
        </button>
        <span className="text-base font-bold text-foreground capitalize">
          {MESES_LABEL(mesAtual)}
        </span>
        <button
          onClick={() => setMesAtual(addMonths(mesAtual, 1))}
          className="touch-target flex items-center justify-center rounded-md hover:bg-muted"
        >
          <ChevronRight className="h-6 w-6 text-foreground" />
        </button>
      </div>

      {/* Fluxo */}
      <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
        {/* Saldo inicial */}
        <div className="flex justify-between items-center px-4 py-3 bg-primary/10 border-b">
          <span className="font-bold text-foreground">Saldo Inicial</span>
          <span className="font-extrabold text-foreground text-lg">{saldoInicial}</span>
        </div>

        {FLUXO_CONFIG.map(({ tipo, label, sinal }) => {
          const total = getTotal(tipo);
          return (
            <div key={tipo} className="flex justify-between items-center px-4 py-2.5 border-b last:border-0">
              <span className="text-sm text-foreground">{sinal === '+' ? '➕' : '➖'} {label}</span>
              <span className={`font-bold text-sm ${sinal === '+' ? 'text-success' : 'text-destructive'}`}>
                {sinal}{total}
              </span>
            </div>
          );
        })}

        {/* Saldo final */}
        <div className="flex justify-between items-center px-4 py-3 bg-primary/10">
          <span className="font-bold text-foreground">Saldo Final</span>
          <span className="font-extrabold text-foreground text-lg">{saldoFinal}</span>
        </div>
      </div>
    </div>
  );
}
