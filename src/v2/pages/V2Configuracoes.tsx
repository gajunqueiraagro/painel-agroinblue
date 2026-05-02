import { Building2, Landmark, ShieldCheck, MapPin } from 'lucide-react';
import type { V2Section } from '@/v2/lib/navGrupos';

interface Props {
  onNavigate: (s: V2Section) => void;
}

interface ConfigCard {
  section: V2Section;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
}

const CARDS: ConfigCard[] = [
  {
    section: 'config-clientes',
    icon: Building2,
    label: 'Clientes',
    desc: 'Cadastrar e gerenciar clientes',
  },
  {
    section: 'config-fazendas',
    icon: MapPin,
    label: 'Fazendas',
    desc: 'Dados cadastrais, áreas e pastos',
  },
  {
    section: 'config-bancario',
    icon: Landmark,
    label: 'Bancário',
    desc: 'Contas bancárias do cliente',
  },
  {
    section: 'config-auditoria',
    icon: ShieldCheck,
    label: 'Auditoria',
    desc: 'Log de ações no sistema',
  },
];

export function V2Configuracoes({ onNavigate }: Props) {
  return (
    <div className="px-4 py-5 max-w-2xl">
      <h2 className="text-sm font-bold text-foreground mb-1">Configurações</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Cadastros e configurações do sistema.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {CARDS.map(({ section, icon: Icon, label, desc }) => (
          <button
            key={section}
            onClick={() => onNavigate(section)}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors text-left"
          >
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
