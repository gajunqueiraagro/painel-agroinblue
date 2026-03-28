import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

type SubTab = '001' | '002' | '003' | '004';

const TABS: { id: SubTab; label: string }[] = [
  { id: '001', label: '001' },
  { id: '002', label: '002' },
  { id: '003', label: '003' },
  { id: '004', label: '004' },
];

const MESES_FILTRO = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

export function AnaliseConsultorTab() {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const [subTab, setSubTab] = useState<SubTab>('001');
  const [ano, setAno] = useState(String(anoAtual));
  const [mes, setMes] = useState(mesAtual);

  const anos = [String(anoAtual), String(anoAtual - 1), String(anoAtual - 2)];

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-20">
      {/* ── Header fixo ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 pt-3 pb-0 space-y-2">
        {/* Linha 1: filtros */}
        <div className="flex items-center gap-2">
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-24 h-7 text-xs font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="bottom">
              {anos.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-28 h-7 text-xs font-bold">
              <SelectValue placeholder="Até o mês" />
            </SelectTrigger>
            <SelectContent side="bottom">
              {MESES_FILTRO.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  Até {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Linha 2: sub-abas horizontais */}
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 text-[11px] font-bold whitespace-nowrap border-b-2 transition-colors ${
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
        <Card>
          <CardContent className="py-8 flex flex-col items-center justify-center gap-3 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground">{subTab}</p>
            <p className="text-[10px] text-muted-foreground">
              Área reservada para análise técnica — conteúdo será preenchido em breve.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
