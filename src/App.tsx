import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClienteProvider } from "@/contexts/ClienteContext";
import { FazendaProvider } from "@/contexts/FazendaContext";
import AppRouter from "./AppRouter";
import NotFound from "./pages/NotFound.tsx";
import { lazy, Suspense } from "react";

const FinanciamentoCadastro = lazy(() => import("./pages/FinanciamentoCadastro"));
const FinanciamentosListaPage = lazy(() => import("./pages/FinanciamentosListaPage"));
const FinanciamentoDetalhe = lazy(() => import("./pages/FinanciamentoDetalhe"));

const queryClient = new QueryClient();

const LoadingFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <span className="text-3xl animate-pulse">💰</span>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ClienteProvider>
          <FazendaProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<AppRouter />} />
                <Route path="/financiamentos" element={<Suspense fallback={<LoadingFallback />}><FinanciamentosListaPage /></Suspense>} />
                <Route path="/financiamentos/novo" element={<Suspense fallback={<LoadingFallback />}><FinanciamentoCadastro /></Suspense>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </FazendaProvider>
        </ClienteProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
