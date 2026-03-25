import { ReactNode } from 'react';
import { LogOut, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.png';

interface HeaderProps {
  title: string;
  fazendaNome?: string;
  periodo?: string;
  onBack?: () => void;
  rightAction?: ReactNode;
}

export function Header({ title, fazendaNome, periodo, onBack, rightAction }: HeaderProps) {
  const { signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-primary px-4 py-2 shadow-md">
      <div className="max-w-lg mx-auto space-y-0.5">
        {/* Linha 1: Back + Logo + Título + Ações */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button onClick={onBack} className="p-1 rounded-md hover:bg-primary/80 transition-colors shrink-0">
                <ArrowLeft className="h-5 w-5 text-primary-foreground" />
              </button>
            )}
            <img src={logo} alt="AgroInBlue" className="h-7 w-auto shrink-0" />
            <h1 className="text-base font-extrabold text-primary-foreground tracking-wide truncate">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {rightAction}
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-primary-foreground hover:bg-primary/80 h-8 w-8"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Linha 2: Fazenda + Período */}
        {(fazendaNome || periodo) && (
          <div className="flex items-center gap-3 text-xs text-primary-foreground/80 pl-1">
            {fazendaNome && (
              <span className="truncate">📍 {fazendaNome}</span>
            )}
            {periodo && (
              <span className="shrink-0">📅 {periodo}</span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
