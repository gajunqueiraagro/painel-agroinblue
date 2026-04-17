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
import CadernoImportTab from "./pages/CadernoImportTab";

const queryClient = new QueryClient();

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
                <Route path="/caderno-importacao" element={<CadernoImportTab />} />
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
