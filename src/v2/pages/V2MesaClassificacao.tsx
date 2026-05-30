import { MesaClassificacaoTab } from '@/v2/components/mesa/MesaClassificacaoTab';

export function V2MesaClassificacao() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Mesa de Classificação</h1>
        <p className="text-sm text-muted-foreground">
          Classifique lançamentos financeiros a partir da planilha do cliente. Cada linha é conciliada manualmente com lançamentos existentes.
        </p>
      </div>
      <MesaClassificacaoTab />
    </div>
  );
}
