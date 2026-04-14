import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FinanciamentosListaPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Financiamentos</h1>
        <Button size="sm" className="gap-1" onClick={() => navigate('/financiamentos/novo')}>
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Lista de financiamentos será implementada no P3.</p>
    </div>
  );
}
