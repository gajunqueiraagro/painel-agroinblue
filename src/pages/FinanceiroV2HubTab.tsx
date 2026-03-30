import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import {
  ListChecks, Building2, Users, BookOpen, Wallet, ChevronRight, FileText, Scale,
} from 'lucide-react';

interface Props {
  onTabChange: (tab: TabId) => void;
}

interface HubItem {
  label: string;
  tab: TabId;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const ITEMS: HubItem[] = [
  { label: 'Lançamentos', tab: 'financeiro_v2', icon: ListChecks, description: 'Lançamentos financeiros manuais e em lote' },
  { label: 'Contratos / Recorrências', tab: 'contratos', icon: FileText, description: 'Compromissos recorrentes com geração automática' },
  { label: 'Contas Bancárias', tab: 'fin_v2_contas' as TabId, icon: Building2, description: 'Cadastro e manutenção de contas' },
  { label: 'Fornecedores', tab: 'fin_v2_fornecedores' as TabId, icon: Users, description: 'Cadastro de fornecedores e favorecidos' },
  { label: 'Plano de Contas', tab: 'fin_v2_plano' as TabId, icon: BookOpen, description: 'Subcentros, centros e macro custos' },
  { label: 'Saldos Mensais', tab: 'fin_v2_saldos' as TabId, icon: Wallet, description: 'Saldos bancários para fechamento mensal' },
];

export function FinanceiroV2HubTab({ onTabChange }: Props) {
  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-20">
      <div className="p-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              💰 Financeiro v2
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Módulos do sistema financeiro
            </p>
            <div className="space-y-1">
              {ITEMS.map(item => (
                <button
                  key={item.tab}
                  onClick={() => onTabChange(item.tab)}
                  className="w-full flex items-center justify-between bg-muted/40 hover:bg-muted/70 rounded-lg px-3 py-2.5 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <item.icon className="h-4 w-4 text-primary shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
