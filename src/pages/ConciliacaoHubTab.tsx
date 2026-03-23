import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FechamentoTab } from './FechamentoTab';
import { ConciliacaoTab } from './ConciliacaoTab';
import { ResumoPastosTab } from './ResumoPastosTab';
import { MapaPastosTab } from './MapaPastosTab';

export function ConciliacaoHubTab() {
  return (
    <Tabs defaultValue="fechamento" className="w-full">
      <TabsList className="w-full grid grid-cols-4 mx-4 mt-2" style={{ maxWidth: 'calc(100% - 2rem)' }}>
        <TabsTrigger value="fechamento">Fechamento</TabsTrigger>
        <TabsTrigger value="mapa">Mapa</TabsTrigger>
        <TabsTrigger value="conciliacao">Conciliação</TabsTrigger>
        <TabsTrigger value="resumo">Resumo</TabsTrigger>
      </TabsList>
      <TabsContent value="fechamento"><FechamentoTab /></TabsContent>
      <TabsContent value="mapa"><MapaPastosTab /></TabsContent>
      <TabsContent value="conciliacao"><ConciliacaoTab /></TabsContent>
      <TabsContent value="resumo"><ResumoPastosTab /></TabsContent>
    </Tabs>
  );
}
