import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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

/**
 * ROTA FORA DO V2 SO' PARA O ADMIN DO AGROinBLUE — ACESSOS-02b.
 *
 * ⚠ `/caderno-importacao`, `/v3`, `/layout-lab` e `/resumo-operacional` nao passam pelo `V2Index`, entao a guarda de tela dele
 *   (`nivelDaTela`) nao as alcanca: qualquer usuario logado as abria digitando o endereco. Quem nao e' admin vai para o sistema
 *   ("/"), onde o `V2Index` o leva a' primeira tela permitida. Para o admin, como sempre.
 * ⚠ NAO PISCA: o `AppRouter` so' desenha as rotas depois de o `ClienteContext` carregar (o "Carregando fazendas..." acima), e o
 *   `isAdmin` e' resolvido no mesmo carregamento — aqui ele ja' e' o de verdade.
 */
export function SoAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useCliente();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

/** O endereco antigo: `/v2` e `/v2/qualquer-coisa`. */
export const ehEnderecoV2 = (pathname: string): boolean => /^\/v2(\/|$)/.test(pathname);

export default function AppRouter() {
  const { user, loading: authLoading } = useAuth();
  const { loading: loadingCliente } = useCliente();
  const { fazendaAtual, loading: fazendaLoading } = useFazenda();
  /* ═══ O ENDERECO SEM /v2 — ACESSOS-02b ═════════════════════════════════════════════════════════════════════════════════
     O sistema abre e navega em "/". `/v2` e `/v2/...` (favoritos, links ja' enviados, e os ~20 pontos do codigo que ainda escrevem
     `/v2?...`) continuam ABRINDO a mesma tela e sao trocados por "/" na barra, com a query string e o hash intactos.
     ⚠ TROCA DE ENDERECO, NAO DESMONTE: as duas rotas montam o MESMO `<V2Index />` na mesma posicao, e isto aqui so' reescreve a
       barra (`replace`). Um `<Navigate>` no lugar da rota `/v2` desmontaria o `V2Index` a cada `navigate('/v2?flancId=…')` de
       dentro do sistema, e a secao de origem (estado dele, que nao vive na URL) se perderia no caminho.
     ⚠ O HOOK FICA ANTES DOS `return` ANTECIPADOS (regra dos hooks). */
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (ehEnderecoV2(location.pathname)) navigate({ pathname: '/', search: location.search, hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

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
      {/* ACESSOS-02b — as quatro rotas fora do V2 so' para o admin (`SoAdmin`, acima). */}
      <Route path="/caderno-importacao" element={<SoAdmin><CadernoImportTab /></SoAdmin>} />
      <Route path="/v3" element={<SoAdmin><V3Index /></SoAdmin>} />
      <Route path="/v3/*" element={<SoAdmin><V3Index /></SoAdmin>} />
      <Route path="/layout-lab" element={<SoAdmin><LayoutLab /></SoAdmin>} />
      <Route path="/resumo-operacional" element={<SoAdmin><ResumoOperacionalPage /></SoAdmin>} />
      {/* O endereco antigo monta a MESMA tela; o efeito acima troca a barra para "/" sem desmontar. */}
      <Route path="/v2" element={<V2Index />} />
      <Route path="/v2/*" element={<V2Index />} />
      {/* ⚠ "/" LEVA AO /v2 — PR-BARRA-UNICA-01a. Ele levava a `pages/Index.tsx`, o shell v1
          completo: quem abria o sistema sem caminho caía na tela antiga. `replace` para o
          "voltar" do navegador não devolver a raiz e reentrar no redirecionamento.
          ⚠ `Index.tsx` CONTINUA NO REPO, de propósito: deixa de ser rota, não some. Apagar
          900 linhas e as ~24 telas que só ele monta é decisão de produto, não efeito
          colateral de uma troca de rota. */}
      {/* ⚠ E DESDE O ACESSOS-02b "/" E' O SISTEMA, sem redirecionar: o `/v2` e' que virou o endereco antigo. */}
      <Route path="/" element={<V2Index />} />
      {/* ⚠ E O "*" DEIXA DE SER O v1. Uma URL inventada abria o sistema inteiro na tela
          antiga — o oposto de dizer que o endereço não existe. */}
      <Route path="*" element={<V2NaoEncontrada />} />
    </Routes>
  );
}
