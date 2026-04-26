import { Route, Routes } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import AuthPage from '@/pages/AuthPage';
import FazendaSetup from '@/pages/FazendaSetup';
import Index from '@/pages/Index';
import CadernoImportTab from '@/pages/CadernoImportTab';
import ResumoOperacionalPage from '@/pages/ResumoOperacionalPage';

export default function AppRouter() {
  const { user, loading: authLoading } = useAuth();
  const { loading: loadingCliente } = useCliente();
  const { fazendaAtual, loading: fazendaLoading } = useFazenda();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <span className="text-5xl animate-pulse">🐂</span>
          <p className="text-muted-foreground mt-2 font-semibold">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (loadingCliente || fazendaLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <span className="text-5xl animate-pulse">🏡</span>
          <p className="text-muted-foreground mt-2 font-semibold">Carregando fazendas...</p>
        </div>
      </div>
    );
  }

  if (!fazendaAtual) return <FazendaSetup />;

  return (
    <Routes>
      <Route path="/caderno-importacao" element={<CadernoImportTab />} />
      <Route path="/resumo-operacional" element={<ResumoOperacionalPage />} />
      <Route path="/" element={<Index />} />
      <Route path="*" element={<Index />} />
    </Routes>
  );
}
