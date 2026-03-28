import { ReactNode } from 'react';
import { LogOut, ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { AlterarSenhaDialog } from '@/components/AlterarSenhaDialog';
import logo from '@/assets/logo.png';

interface HeaderProps {
  title: string;
  clienteNome?: string;
  fazendaNome?: string;
  periodo?: string;
  
  rightAction?: ReactNode;
}

export function Header({ title, clienteNome, fazendaNome, periodo, onBack, rightAction }: HeaderProps) {
  const { signOut } = useAuth();

  return (
    <header className="z-40 bg-primary px-4 md:px-6 py-2.5 md:py-4 shadow-md shrink-0">
      <div className="max-w-5xl mx-auto space-y-0.5 md:space-y-1">
        {/* Row 1: Back + Logo + Title + Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {onBack && (
              <button onClick={onBack} className="p-1 rounded-md hover:bg-primary-foreground/10 transition-colors shrink-0">
                <ArrowLeft className="h-5 w-5 text-primary-foreground" />
              </button>
            )}
            <img src={logo} alt="AgroInBlue" className="h-6 md:h-9 w-auto shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-xl font-bold text-primary-foreground tracking-wide truncate leading-tight">
                Painel de Controle
              </h1>
              <p className="text-[9px] md:text-xs text-primary-foreground/60 font-medium tracking-wider leading-tight">
                Agroinblue · Gestão Pecuária e Financeira
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {rightAction}
            <AlterarSenhaDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8"
                  title="Alterar Senha"
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: Cliente + Fazenda + Período */}
        {(clienteNome || fazendaNome || periodo) && (
          <div className="flex items-center gap-3 text-[11px] md:text-xs text-primary-foreground/70 pl-1 md:pl-12">
            {clienteNome && <span className="truncate">🏢 {clienteNome}</span>}
            {fazendaNome && <span className="truncate">📍 {fazendaNome}</span>}
            {periodo && <span className="shrink-0">📅 {periodo}</span>}
          </div>
        )}
      </div>
    </header>
  );
}
