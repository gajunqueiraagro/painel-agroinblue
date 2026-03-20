import { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.png';

interface HeaderProps {
  title: string;
  rightAction?: ReactNode;
}

export function Header({ title, rightAction }: HeaderProps) {
  const { signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-primary px-4 py-3 shadow-md">
      <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={logo} alt="AgroInBlue" className="h-8 w-auto" />
          <h1 className="text-lg font-extrabold text-primary-foreground tracking-wide truncate">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {rightAction}
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="text-primary-foreground hover:bg-primary/80"
            title="Sair"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
