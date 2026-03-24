/**
 * Drawer de auditoria do GMD — "Explicando o GMD"
 * Extraído de IndicadoresTab para manter o componente principal enxuto.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { GmdAbertura, EstoqueCategoriaDetalhe, FontePeso } from '@/hooks/useIndicadoresZootecnicos';
import { formatNum } from '@/lib/calculos/formatters';

interface Props {
  abertura: GmdAbertura;
  mesLabel: string;
  anoLabel: string;
}

const FONTE_LABEL: Record<FontePeso, string> = {
  fechamento: 'Fechamento de pasto',
  lancamento: 'Último lançamento',
  saldo_inicial: 'Saldo inicial',
  nenhuma: 'Sem dados',
};
const FONTE_LABEL_SHORT: Record<FontePeso, string> = {
  fechamento: 'fech.',
  lancamento: 'lanç.',
  saldo_inicial: 'ini.',
  nenhuma: '?',
};

export function GmdDetalheSheet({ abertura, mesLabel, anoLabel }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="text-xs text-primary underline-offset-2 hover:underline mt-1 text-left">
          Entender cálculo →
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Explicando o GMD — {mesLabel}/{anoLabel}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* Resultado */}
          <div className="text-center py-3 border rounded-lg bg-muted/30">
            <span className="text-3xl font-bold text-foreground">
              {abertura.gmd !== null ? formatNum(abertura.gmd, 2) : '—'}
            </span>
            <span className="text-sm text-muted-foreground ml-1">kg/dia</span>
            {!abertura.baseCompleta && (
              <p className="text-xs text-amber-500 mt-1">⚠ Base incompleta — faltam dados de peso</p>
            )}
          </div>

          {/* Conta aberta */}
          <div className="space-y-1.5 text-sm">
            <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider mb-2">Conta aberta</h4>
            <LinhaCalculo label="Peso final do estoque" valor={abertura.pesoFinalEstoque} />
            <LinhaCalculo label="(-) Peso inicial do estoque" valor={abertura.pesoInicialEstoque} negativo />
            <LinhaCalculo label="(-) Peso das entradas" valor={abertura.pesoEntradas} negativo />
            <LinhaCalculo label="(+) Peso das saídas" valor={abertura.pesoSaidas} />
            <div className="border-t pt-1.5 mt-1.5">
              <LinhaCalculo label="= Ganho líquido" valor={abertura.ganhoLiquido} destaque />
            </div>
            <div className="border-t pt-1.5 mt-1.5 space-y-1">
              <LinhaCalculo label="Dias no mês" valor={abertura.dias} isInt />
              <LinhaCalculo label="Cabeças médias" valor={abertura.cabMedia} decimals={1} />
            </div>
            <div className="border-t pt-1.5 mt-1.5 bg-muted/20 rounded px-2 py-1.5">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-foreground">GMD = ganho / (dias × cab)</span>
                <span className="font-bold text-foreground">
                  {abertura.gmd !== null ? formatNum(abertura.gmd, 3) : '—'} kg/dia
                </span>
              </div>
            </div>
          </div>

          {/* Estoque Final por Categoria */}
          {abertura.estoqueFinalDetalhe.length > 0 && (
            <EstoqueDetalheSection title="Estoque Final do Mês" itens={abertura.estoqueFinalDetalhe} />
          )}

          {/* Estoque Inicial por Categoria */}
          {abertura.estoqueInicialDetalhe.length > 0 && (
            <EstoqueDetalheSection title="Estoque Inicial do Mês" itens={abertura.estoqueInicialDetalhe} />
          )}

          {/* Detalhamento Entradas */}
          {abertura.entradasDetalhe.length > 0 && (
            <GmdMovSection title="Detalhamento das Entradas" itens={abertura.entradasDetalhe} />
          )}

          {/* Detalhamento Saídas */}
          {abertura.saidasDetalhe.length > 0 && (
            <GmdMovSection title="Detalhamento das Saídas" itens={abertura.saidasDetalhe} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes internos
// ---------------------------------------------------------------------------

function LinhaCalculo({
  label, valor, negativo, destaque, isInt, decimals = 0,
}: {
  label: string;
  valor: number;
  negativo?: boolean;
  destaque?: boolean;
  isInt?: boolean;
  decimals?: number;
}) {
  const formatted = isInt
    ? String(valor)
    : formatNum(valor, decimals || (valor >= 1000 ? 0 : 1)) + ' kg';
  return (
    <div className={`flex justify-between items-baseline ${destaque ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
      <span className={negativo ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={destaque ? 'text-foreground' : ''}>{formatted}</span>
    </div>
  );
}

function GmdMovSection({ title, itens }: { title: string; itens: { tipo: string; label: string; quantidade: number; pesoTotalKg: number }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider py-1.5 hover:text-foreground transition-colors">
          <span>{title}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 text-sm pl-1">
          {itens.map(item => (
            <div key={item.tipo} className="flex justify-between text-muted-foreground">
              <span>{item.label}</span>
              <span>{item.quantidade} cab · {formatNum(item.pesoTotalKg, 0)} kg</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EstoqueDetalheSection({ title, itens }: { title: string; itens: EstoqueCategoriaDetalhe[] }) {
  const [open, setOpen] = useState(false);
  const totalCab = itens.reduce((s, i) => s + i.cabecas, 0);
  const totalPeso = itens.reduce((s, i) => s + i.pesoTotalKg, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider py-1.5 hover:text-foreground transition-colors">
          <span>{title}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </CollapsibleTrigger>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{formatNum(totalCab)} cab</span>
        <span>{formatNum(totalPeso, 0)} kg total</span>
      </div>
      <CollapsibleContent>
        <div className="space-y-1 text-sm pl-1">
          {itens.map(item => (
            <div key={item.categoria} className="flex justify-between text-muted-foreground gap-2">
              <span className="truncate">{item.categoria}</span>
              <span className="whitespace-nowrap flex items-center gap-1">
                {item.cabecas} cab · {item.pesoMedioKg !== null ? formatNum(item.pesoMedioKg, 1) : '?'} kg/cab · {formatNum(item.pesoTotalKg, 0)} kg
                {item.fontePeso && item.fontePeso !== 'nenhuma' && (
                  <span className="text-[10px] text-muted-foreground/60" title={`Fonte: ${FONTE_LABEL[item.fontePeso]}`}>
                    ({FONTE_LABEL_SHORT[item.fontePeso]})
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
