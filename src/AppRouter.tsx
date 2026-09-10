import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import AuthPage from '@/pages/AuthPage';
import FazendaSetup from '@/pages/FazendaSetup';
/* ⚠ O IMPORT DE `pages/Index` SAIU, o ARQUIVO NÃO — PR-BARRA-UNICA-01a. Ele deixou de ser
   rota; mantê-lo importado sem uso deixaria o v1 inteiro no bundle por um símbolo morto. */
import CadernoImportTab from '@/pages/CadernoImportTab';
import ResumoOperacionalPage from '@/pages/ResumoOperacionalPage';
import V2Index from '@/v2/V2Index';
import V2NaoEncontrada from '@/v2/pages/V2NaoEncontrada';
import V3Index from '@/v3/V3Index';
import LayoutLab from '@/pages/LayoutLab';

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
      <Route path="/v2" element={<V2Index />} />
      <Route path="/v2/*" element={<V2Index />} />
      <Route path="/v3" element={<V3Index />} />
      <Route path="/v3/*" element={<V3Index />} />
      <Route path="/layout-lab" element={<LayoutLab />} />
      <Route path="/resumo-operacional" element={<ResumoOperacionalPage />} />
      {/* ⚠ "/" LEVA AO /v2 — PR-BARRA-UNICA-01a. Ele levava a `pages/Index.tsx`, o shell v1
          completo: quem abria o sistema sem caminho caía na tela antiga. `replace` para o
          "voltar" do navegador não devolver a raiz e reentrar no redirecionamento.
          ⚠ `Index.tsx` CONTINUA NO REPO, de propósito: deixa de ser rota, não some. Apagar
          900 linhas e as ~24 telas que só ele monta é decisão de produto, não efeito
          colateral de uma troca de rota. */}
      <Route path="/" element={<Navigate to="/v2" replace />} />
      {/* ⚠ E O "*" DEIXA DE SER O v1. Uma URL inventada abria o sistema inteiro na tela
          antiga — o oposto de dizer que o endereço não existe. */}
      <Route path="*" element={<V2NaoEncontrada />} />
    </Routes>
  );
}
