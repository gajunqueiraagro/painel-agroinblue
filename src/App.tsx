import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClienteProvider } from "@/contexts/ClienteContext";
import { FazendaProvider } from "@/contexts/FazendaContext";
import AppRouter from "./AppRouter";
import NotFound from "./pages/NotFound.tsx";
import { useEffect } from "react";
import { protegerSoltarFora } from "@/lib/arquivo/protegerSoltarFora";
import { AvisoVersaoNova } from "@/components/app/AvisoVersaoNova";

const queryClient = new QueryClient();

/* UI-ARRASTAR-ARQUIVO-01a — a proteção é do SHELL e é uma só: arquivo solto fora de uma área não navega nem abre o arquivo. */
const App = () => {
  useEffect(() => protegerSoltarFora(), []);
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      {/* ⚠ UM TOASTER SÓ — PR-TOAST-POSICAO-01. Havia dois montados: este `Sonner` e o
          `Toaster` do shadcn/radix. Dois sistemas de aviso significam duas posições, duas
          durações e dois lugares para configurar — e configurar um não mexia no outro, que
          é como um toast podia continuar no topo depois de alguém "já ter mudado" a
          posição. Medido: 147 arquivos usavam o `sonner` e UM usava o outro (`V2AreasMeta`,
          convertido no mesmo PR). Fica o que o sistema de fato usa. */}
      <Sonner />
      {/* APP-VERSAO-NOVA-01 — pedaço que não chega (página aberta antes de uma publicação): aviso fixo, com X e "Recarregar".
          NUNCA recarrega sozinho. Ouve o `vite:preloadError` e o aviso do dono (`importarDoApp`). */}
      <AvisoVersaoNova />
      <AuthProvider>
        <ClienteProvider>
          <FazendaProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/*" element={<AppRouter />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </FazendaProvider>
        </ClienteProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
