/**
 * Visão Operacional — dashboard direto com sub-abas: Indicadores | DRE | Gráficos
 */
import { useState } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { TabId } from '@/components/BottomNav';

type SubTab = 'indicadores' | 'dre' | 'graficos';

interface Props {
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal?: { ano: string; mes: number };
}

const MESES_FILTRO = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

export function LancarFinHubTab({ onTabChange, filtroGlobal }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('indicadores');
  const { fazendaAtual } = useFazenda();

  const [localAno, setLocalAno] = useState(filtroGlobal?.ano || String(new Date().getFullYear()));
  const [localMes, setLocalMes] = useState(filtroGlobal?.mes || new Date().getMonth() + 1);

  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = Array.from({ length: 5 }, (_, i) => String(anoAtual - i));

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'indicadores', label: 'Indicadores' },
    { id: 'dre', label: 'DRE' },
    { id: 'graficos', label: 'Gráficos' },
  ];

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-20">
      {/* ── Topo fixo: filtros ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        {/* Filtros de ano e mês */}
        <div className="flex gap-2 px-4 pb-2">
          <Select value={localAno} onValueChange={setLocalAno}>
            <SelectTrigger className="w-24 h-8 text-xs font-bold">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(localMes)} onValueChange={v => setLocalMes(Number(v))}>
            <SelectTrigger className="w-36 h-8 text-xs font-bold">
              <SelectValue placeholder="Até o mês" />
            </SelectTrigger>
            <SelectContent>
              {MESES_FILTRO.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  Até {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sub-abas horizontais */}
        <div className="flex gap-0 px-4 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                subTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="p-4">
        {subTab === 'indicadores' && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">📊 Indicadores operacionais — em construção</p>
            </CardContent>
          </Card>
        )}
        {subTab === 'dre' && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">📋 DRE — em construção</p>
            </CardContent>
          </Card>
        )}
        {subTab === 'graficos' && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">📈 Gráficos — em construção</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
