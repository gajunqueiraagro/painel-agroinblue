import { AbaLiquidacaoOC } from './AbaLiquidacaoOC';
import { AbaCompromissosOC } from './AbaCompromissosOC';
import { useOcCompromissos } from '@/hooks/useOcCompromissos';
import { AlertTriangle } from 'lucide-react';
import type { LiquidacaoApi } from '@/hooks/useOperacaoLiquidacao';

// Aba Financeiro (PR-OC-UI-FIN-VIEW) — ROTEADOR por modo (soberano da view, nunca inferido):
//   'legado' → fluxo atual intacto (AbaLiquidacaoOC via useOperacaoLiquidacao), sem retrofit.
//   'nova_vazia' | 'novo_modelo' → Blocos A/B/C (AbaCompromissosOC via useOcCompromissos).
//   'misto_inconsistente' → banner + visão somente-leitura dos blocos novos.
//   carregando → placeholder. O gate de escrita do modelo novo NÃO reusa o somenteLeitura legado
//   (que é RO em qualquer operação existente); segue os writers: rascunho/cancelada bloqueiam.
interface Props {
  api: LiquidacaoApi;
  operacaoPronta: boolean;
  darkSelectClass: string;
  somenteLeitura?: boolean;
  onIrParaDocumentos?: () => void;
  // wiring mínimo do modelo novo (vindo do CompraModalShell)
  operacaoId?: string | null;
  clienteId?: string | null;
  rascunho?: boolean;
  statusComercial?: string | null;
}

export function AbaFinanceiroOC(props: Props) {
  const { api, operacaoId, clienteId, rascunho, statusComercial } = props;
  const ocApi = useOcCompromissos({
    operacaoId: operacaoId ?? null,
    clienteId: clienteId ?? null,
    enabled: !!operacaoId && !!clienteId,
  });
  const modo = ocApi.resumoOperacao?.modo;

  const legado = (
    <AbaLiquidacaoOC
      api={api}
      operacaoPronta={props.operacaoPronta}
      darkSelectClass={props.darkSelectClass}
      somenteLeitura={props.somenteLeitura}
      onIrParaDocumentos={props.onIrParaDocumentos}
    />
  );

  if (!operacaoId || !clienteId) return legado;
  if (ocApi.loading && !ocApi.resumoOperacao) {
    return <div className="py-10 text-center text-[12px] text-muted-foreground">Carregando…</div>;
  }
  if (modo === 'legado') return legado;
  if (modo === 'misto_inconsistente') {
    return (
      <div className="space-y-3 min-w-0">
        <div className="rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-2 text-[12px] text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Operação inconsistente (compromissos e partes legadas). Visão somente leitura.
        </div>
        <AbaCompromissosOC ocApi={ocApi} bloqueado clienteId={clienteId} tipoOperacao={api.tipoOperacao} fornecedores={api.fornecedores} darkSelectClass={props.darkSelectClass} />
      </div>
    );
  }
  // nova_vazia | novo_modelo — gate do modelo novo: rascunho/cancelada bloqueiam; 'fechada' permite.
  const bloqueado = rascunho === true || statusComercial === 'cancelada';
  return (
    <AbaCompromissosOC ocApi={ocApi} bloqueado={bloqueado} clienteId={clienteId} tipoOperacao={api.tipoOperacao} fornecedores={api.fornecedores} darkSelectClass={props.darkSelectClass} />
  );
}
