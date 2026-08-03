import { AbaLiquidacaoOC } from './AbaLiquidacaoOC';
import { AbaCompromissosOC } from './AbaCompromissosOC';
import { useOcCompromissos } from '@/hooks/useOcCompromissos';
import { AlertTriangle } from 'lucide-react';
import type { LiquidacaoApi } from '@/hooks/useOperacaoLiquidacao';

// Aba Financeiro (PR-OC-UI-FIN-VIEW) — ROTEADOR por modo (soberano da view, nunca inferido):
//   'legado' → fluxo atual intacto (AbaLiquidacaoOC via useOperacaoLiquidacao), sem retrofit.
//   'nova_vazia' | 'novo_modelo' → Blocos A/B/C (AbaCompromissosOC via useOcCompromissos).
//   'misto_inconsistente' → banner + visão somente-leitura dos blocos novos.
//   carregando → placeholder. PR-OC-CONSOLIDACAO-A1: os gates de escrita (legado e novo) chegam PRONTOS
//   por prop do CompraModalShell (fonte única por eixo); esta aba NÃO reconstrói permissão.
interface Props {
  api: LiquidacaoApi;
  operacaoPronta: boolean;
  darkSelectClass: string;
  financeiroLegadoReadOnly: boolean;   // gate do fluxo legado (AbaLiquidacaoOC)
  financeiroNovoReadOnly: boolean;     // gate do modelo novo (AbaCompromissosOC) — já calculado no shell
  onIrParaDocumentos?: () => void;
  // wiring mínimo do modelo novo (vindo do CompraModalShell)
  operacaoId?: string | null;
  clienteId?: string | null;
  dataOperacao?: string | null;   // FIX item 6 — data da compra
  dataChegada?: string | null;    // FIX item 6 — data de chegada (recebimento)
}

export function AbaFinanceiroOC(props: Props) {
  const { api, operacaoId, clienteId } = props;
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
      somenteLeitura={props.financeiroLegadoReadOnly}
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
        <AbaCompromissosOC ocApi={ocApi} bloqueado clienteId={clienteId} tipoOperacao={api.tipoOperacao} fornecedores={api.fornecedores}
          valorAcordado={api.valorAcordado} lotes={api.lotes} contraparteId={api.contraparteId} dataOperacao={props.dataOperacao ?? null} dataChegada={props.dataChegada ?? null}
          darkSelectClass={props.darkSelectClass} recarregarDados={api.recarregar} />
      </div>
    );
  }
  // nova_vazia | novo_modelo — gate do modelo novo vem PRONTO do shell (financeiroNovoReadOnly).
  return (
    <AbaCompromissosOC ocApi={ocApi} bloqueado={props.financeiroNovoReadOnly} clienteId={clienteId} tipoOperacao={api.tipoOperacao} fornecedores={api.fornecedores}
      valorAcordado={api.valorAcordado} lotes={api.lotes} contraparteId={api.contraparteId} dataOperacao={props.dataOperacao ?? null} dataChegada={props.dataChegada ?? null}
      darkSelectClass={props.darkSelectClass} recarregarDados={api.recarregar} />
  );
}
