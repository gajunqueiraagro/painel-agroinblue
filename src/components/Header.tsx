import { ReactNode } from 'react';
import { LogOut, KeyRound } from 'lucide-react';
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

export function Header({ title, clienteNome, fazendaNome, periodo, rightAction }: HeaderProps) {
  const { signOut } = useAuth();

  return (
    <header className="z-40 bg-primary px-4 md:px-6 py-1.5 md:py-2 shadow-md shrink-0">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img src={logo} alt="AgroInBlue" className="h-5 md:h-7 w-auto shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xs md:text-base font-bold text-primary-foreground tracking-wide truncate leading-tight">
                Painel de Controle
              </h1>
              <p className="text-[8px] md:text-[10px] text-primary-foreground/50 font-medium tracking-wider leading-tight">
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
                  className="text-primary-foreground hover:bg-primary-foreground/10 h-7 w-7"
                  title="Alterar Senha"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-primary-foreground hover:bg-primary-foreground/10 h-7 w-7"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {(clienteNome || fazendaNome || periodo) && (
          <div className="flex items-center gap-3 text-[10px] md:text-[11px] text-primary-foreground/60 pl-7 md:pl-9 -mt-0.5">
            {clienteNome && <span className="truncate">🏢 {clienteNome}</span>}
            {fazendaNome && <span className="truncate">📍 {fazendaNome}</span>}
            {periodo && <span className="shrink-0">📅 {periodo}</span>}
          </div>
        )}
      </div>
    </header>
  );
}
