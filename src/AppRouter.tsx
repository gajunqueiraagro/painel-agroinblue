import { Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import AuthPage from '@/pages/AuthPage';
import FazendaSetup from '@/pages/FazendaSetup';
import Index from '@/pages/Index';
import CadernoImportTab from '@/pages/CadernoImportTab';
import ResumoOperacionalPage from '@/pages/ResumoOperacionalPage';
import V2Index from '@/v2/V2Index';
import V3Index from '@/v3/V3Index';
import LayoutLab from '@/pages/LayoutLab';

export default function AppRouter() {
  const { user, loading: authLoading } = useAuth();
  const { loading: loadingCliente, clienteAtual } = useCliente();
  const { fazendaAtual, loading: fazendaLoading, fazendas } = useFazenda();

  // ─── TEMP-PERF: cronometra boot até "fazendas prontas" ───
  const bootStartRef = useRef<number>(performance.now());
  const lastStateRef = useRef<string>('');
  useEffect(() => {
    const state = `auth=${authLoading} user=${!!user} cli=${loadingCliente}/${!!clienteAtual} faz=${fazendaLoading}/${fazendas.length}/${!!fazendaAtual}`;
    if (state !== lastStateRef.current) {
      const t = (performance.now() - bootStartRef.current).toFixed(0);
      console.log(`[PERF][${t}ms] AppRouter state:`, state);
      lastStateRef.current = state;
    }
  });

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
      <Route path="/v2" element={<V2Index />} />
      <Route path="/v2/*" element={<V2Index />} />
      <Route path="/v3" element={<V3Index />} />
      <Route path="/v3/*" element={<V3Index />} />
      <Route path="/layout-lab" element={<LayoutLab />} />
      <Route path="/resumo-operacional" element={<ResumoOperacionalPage />} />
      <Route path="/" element={<Index />} />
      <Route path="*" element={<Index />} />
    </Routes>
  );
}
