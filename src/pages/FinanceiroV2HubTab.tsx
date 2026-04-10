import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import {
  ListChecks, Building2, Users, BookOpen, Wallet, ChevronRight, FileText, Scale, Landmark, Construction, SearchCheck, UserCircle,
} from 'lucide-react';

interface Props {
  onTabChange: (tab: TabId) => void;
}

const CADASTRO_ITEMS = [
  { label: 'Contratos / Recorrências', tab: 'contratos' as TabId, icon: FileText, description: 'Compromissos recorrentes com geração automática' },
  { label: 'Contas Bancárias', tab: 'fin_v2_contas' as TabId, icon: Building2, description: 'Cadastro e manutenção de contas' },
  { label: 'Fornecedores', tab: 'fin_v2_fornecedores' as TabId, icon: Users, description: 'Cadastro de fornecedores e favorecidos' },
  { label: 'Plano de Contas', tab: 'fin_v2_plano' as TabId, icon: BookOpen, description: 'Subcentros, centros e macro custos' },
  { label: 'Dividendos', tab: 'fin_v2_dividendos' as TabId, icon: UserCircle, description: 'Cadastro de nomes para distribuição' },
];

export function FinanceiroV2HubTab({ onTabChange }: Props) {
  return (
    <div className="w-full px-4 animate-fade-in pb-20">
      <div className="p-4 space-y-5">
        {/* Page title */}
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Lançamentos Financeiros</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Painel de módulos do sistema financeiro</p>
        </div>

        {/* Top row: 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* LEFT column */}
          <div className="flex flex-col gap-3">
            {/* Primary CTA – Lançamentos */}
            <button
              onClick={() => onTabChange('financeiro_v2')}
              className="group text-left"
            >
              <Card className="border-primary/30 shadow-sm hover:shadow-md transition-shadow h-full">
                <CardContent className="p-5 flex flex-col justify-center gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-md bg-primary/10 p-2">
                      <ListChecks className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-foreground leading-tight">Lançamentos</p>
                      <p className="text-[10px] text-muted-foreground">Manuais e em lote</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Registre despesas, receitas e movimentações financeiras do período.</p>
                  <span className="text-[10px] font-medium text-primary group-hover:underline mt-1 flex items-center gap-1">
                    Acessar <ChevronRight className="h-3 w-3" />
                  </span>
                </CardContent>
              </Card>
            </button>

            {/* Secondary – Conciliação + Saldos */}
            <button
              onClick={() => onTabChange('conciliacao_bancaria' as TabId)}
              className="group text-left"
            >
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Scale className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Conciliação Bancária</p>
                      <p className="text-[10px] text-muted-foreground">Conciliação mensal entre sistema e extrato</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                </CardContent>
              </Card>
            </button>

            <button
              onClick={() => onTabChange('fin_v2_saldos' as TabId)}
              className="group text-left"
            >
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Wallet className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Saldos Mensais</p>
                      <p className="text-[10px] text-muted-foreground">Saldos bancários para fechamento mensal</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                </CardContent>
              </Card>
            </button>
          </div>

          {/* CENTER column – Cadastros */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Cadastros Financeiros</h3>
              <p className="text-[10px] text-muted-foreground mb-2">Estrutura e configurações do módulo</p>
              <div className="space-y-1">
                {CADASTRO_ITEMS.map(item => (
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

          {/* RIGHT column – Financiamentos (coming soon) */}
          <Card className="border-dashed border-muted-foreground/20 opacity-60">
            <CardContent className="p-5 flex flex-col items-center justify-center text-center gap-3 h-full min-h-[140px]">
              <div className="rounded-md bg-muted p-2.5">
                <Construction className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-muted-foreground">Financiamentos</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Em construção</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onTabChange('conta_boitel' as TabId)}
            className="group text-left flex-1 min-w-[200px] max-w-[33%]"
          >
            <Card className="hover:shadow-sm transition-shadow border-muted-foreground/15">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Conta Boitel</p>
                    <p className="text-[10px] text-muted-foreground">Controle financeiro por lote de boitel</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
              </CardContent>
            </Card>
          </button>

          <button
            onClick={() => onTabChange('auditoria_duplicidade' as TabId)}
            className="group text-left flex-1 min-w-[200px] max-w-[33%]"
          >
            <Card className="hover:shadow-sm transition-shadow border-muted-foreground/15">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <SearchCheck className="h-4 w-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Auditoria de Duplicidade</p>
                    <p className="text-[10px] text-muted-foreground">Revisão de lançamentos sinalizados como duplicados</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
              </CardContent>
            </Card>
          </button>
        </div>
      </div>
    </div>
  );
}
