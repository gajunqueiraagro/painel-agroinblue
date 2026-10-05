import { AbaLiquidacaoOC } from './AbaLiquidacaoOC';
import type { PropostaCompromisso } from '@/components/compra/DialogoGerarCompromissos';
import { AbaCompromissosOC, type LinhaPrevisao, type RotulosCompromissos } from './AbaCompromissosOC';
import { useOcCompromissos, type OcCompromissosApi } from '@/hooks/useOcCompromissos';
import { useOcContaCorrente, type OcContaCorrenteApi } from '@/hooks/useOcContaCorrente';
import { AbaContaCorrenteOC, type SubAbaContaCorrente } from '@/components/venda/AbaContaCorrenteOC';
import { paramsAbrirLancamentoDaOC } from '@/lib/oc/abrirLancamentoDaOC';
import { linhasDeDespesa, totaisDeDespesa } from '@/lib/oc/despesasDaOperacao';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { LiquidacaoApi } from '@/hooks/useOperacaoLiquidacao';

// Aba Financeiro (PR-OC-UI-FIN-VIEW) — ROTEADOR por modo (soberano da view, nunca inferido):
//   'legado' → fluxo atual intacto (AbaLiquidacaoOC via useOperacaoLiquidacao), sem retrofit.
//   'nova_vazia' | 'novo_modelo' → Blocos A/B/C (AbaCompromissosOC via useOcCompromissos).
//   'misto_inconsistente' → banner + visão somente-leitura dos blocos novos.
//   carregando → placeholder. PR-OC-CONSOLIDACAO-A1: os gates de escrita (legado e novo) chegam PRONTOS
//   por prop do CompraModalShell (fonte única por eixo); esta aba NÃO reconstrói permissão.
interface Props {
  /** Versão da operação e setter, quando quem monta é dono dela. */
  ocVersao?: number | null;
  onOcVersaoChange?: (v: number) => void;
  api: LiquidacaoApi;
  operacaoPronta: boolean;
  darkSelectClass: string;
  financeiroLegadoReadOnly: boolean;   // gate do fluxo legado (AbaLiquidacaoOC)
  financeiroNovoReadOnly: boolean;     // gate do modelo novo (AbaCompromissosOC) — já calculado no shell
  onIrParaDocumentos?: () => void;
  /** OC-CC-ACOES-LINHA-02 — a aba da entrega (venda) / do recebimento do gado (compra): o "Ir para a entrega" da linha do extrato. */
  onIrParaEntrega?: () => void;
  /** ACESSOS-OC-03a — repassado ao conta corrente (ver `AbaContaCorrenteOC`). */
  motivoAtualizarEntregas?: string | null;
  // wiring mínimo do modelo novo (vindo do CompraModalShell)
  operacaoId?: string | null;
  clienteId?: string | null;
  dataOperacao?: string | null;   // FIX item 6 — data da compra
  dataChegada?: string | null;    // FIX item 6 — data de chegada (recebimento)
  /* ⚠ ADITIVOS, so a venda passa — PR-OC-VENDA-FIN-PREVISAO-01. Sem eles a compra e'
     identica: nao ha botao de gerar, nem selo, nem dicionario. Este roteador apenas
     repassa; quem sabe da previsao e' o shell da venda. */
  linhasPrevisao?: LinhaPrevisao[];
  /** Repassado a `AbaCompromissosOC` — ver a nota la' (OC-BOITEL-VALOR-01 A3). */
  bloqueioPrevisao?: string | null;
  /** A venda é por boitel? Decide o subcentro da principal (1150, não 1140) — só o shell
      da venda sabe, e este roteador apenas repassa. */
  ehBoitel?: boolean;
  /** Obrigações que só o tipo sabe montar — repassadas à aba de compromissos. */
  propostasExtras?: PropostaCompromisso[];
  /** As linhas do "Gerar compromissos" montadas inteiras pelo tipo — repassadas (BOITEL-ABATE-PRODUTOR-01c). */
  propostasDoMotor?: PropostaCompromisso[];
  /** Vindo do rodapé: acabou de concluir, ofereça a geração. */
  abrirGerarAoMontar?: boolean;
  seloProjecao?: ReactNode;
  /** FIN-V2-CANCEL-MOTIVO-01 (b) — motivo da reabertura desta sessao (venda/abate), sugerido no "Atualizar compromisso". */
  motivoReabertura?: string | null;
  rotulos?: RotulosCompromissos;
  /* ⚠ A INSTANCIA VEM DE FORA QUANDO O SHELL JA A TEM — B-10 item 4. O resumo lateral da
     venda precisa dos mesmos totais por sentido que esta aba consome, e montar o hook nos
     DOIS lugares daria duas instancias lendo as MESMAS tres views para a mesma operacao.
     E' a licao que os catalogos do `AbaCompromissosOC` ja tinham ensinado: subir, e nao
     duplicar. A compra nao passa nada e segue montando a sua — comportamento identico. */
  ocApiExterno?: OcCompromissosApi;
  /** OC-VENDA-ENTREGAS-01c — a conta corrente tambem vem de fora quando o shell da venda a tem (resumo lateral e cancelar
      leem a MESMA instancia). A compra nao passa e o hook daqui segue desligado para ela. */
  ccApiExterno?: OcContaCorrenteApi;
}

export function AbaFinanceiroOC(props: Props) {
  const { api, operacaoId, clienteId } = props;
  /* ⚠ O HOOK E SEMPRE CHAMADO — regra dos hooks —, mas `enabled` o desliga quando a
     instancia veio pronta de fora. Assim nao ha consulta duplicada e nao ha chamada
     condicional. */
  /* ⚠ A VERSÃO VEM DE FORA quando este componente monta o hook — só acontece sem
     `ocApiExterno`, e nesse caso quem o monta é dono da operação inteira. Sem as
     props, o fallback local mantém o comportamento anterior para montagens que
     ainda não as forneçam; com elas, a fonte é única. */
  const [versaoLocal, setVersaoLocal] = useState<number | null>(null);
  const ocApiProprio = useOcCompromissos({
    operacaoId: operacaoId ?? null,
    clienteId: clienteId ?? null,
    enabled: !props.ocApiExterno && !!operacaoId && !!clienteId,
    versao: props.ocVersao ?? versaoLocal,
    onVersaoChange: props.onOcVersaoChange ?? setVersaoLocal,
  });
  const ocApi = props.ocApiExterno ?? ocApiProprio;
  const modo = ocApi.resumoOperacao?.modo;
  /* OC-VENDA-ENTREGAS-01b — o MODELO decide antes do modo: venda em conta corrente nao tem compromisso nem titulo por
     parcela, tem entregas e recebimentos (ADR-2026-21). O modelo vem do banco (`oc_conta_corrente.modelo`), nunca inferido
     das partes. Hook sempre chamado; so' liga na venda. */
  const ccApiProprio = useOcContaCorrente({
    operacaoId: operacaoId ?? null,
    /* OC-CONTA-CORRENTE-TODOS-01a — a compra tambem pode estar em conta corrente (o abate e' o PR 2). */
    enabled: !props.ccApiExterno && !!operacaoId && (api.tipoOperacao === 'venda' || api.tipoOperacao === 'compra'),
    versao: props.ocVersao ?? versaoLocal,
    onVersaoChange: props.onOcVersaoChange ?? setVersaoLocal,
  });
  const ccApi = props.ccApiExterno ?? ccApiProprio;
  /* OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — a SUB-ABA mora na URL (`oc_sub`): abrir um lancamento pelas despesas desmonta o modal, e
     a volta do drill a reescreve (`returnOcSub` -> `abrirOperacaoOC`). Sem o parametro, o extrato do comprador. */
  const [searchParams, setSearchParams] = useSearchParams();
  const subAba: SubAbaContaCorrente = searchParams.get('oc_sub') === 'despesas' ? 'despesas' : 'conta';
  const escolherSubAba = (s: SubAbaContaCorrente) => {
    const next = new URLSearchParams(window.location.search);
    if (s === 'despesas') next.set('oc_sub', 'despesas'); else next.delete('oc_sub');
    setSearchParams(next, { replace: true });
  };
  /* OC-CC-ACOES-LINHA-02 — o extrato abre o lancamento pelo MESMO dono das despesas (`paramsAbrirLancamentoDaOC`): na sub-aba
     Conta corrente nao ha' `oc_sub`, e a volta do drill abre no extrato. */
  const abrirLancamento = (lancamentoId: string) => {
    setSearchParams(paramsAbrirLancamentoDaOC(searchParams, { tituloId: lancamentoId, ocId: operacaoId ?? null, tipoOperacao: api.tipoOperacao }),
      { replace: true });
  };

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
  if (ccApi.contaCorrente?.modelo === 'conta_corrente') {
    /* OC-VENDA-FINANCEIRO-COMPLETO-01a — as despesas da operacao voltam vivas embaixo do extrato: a lista de compromissos no modo
       so' despesas. ⚠ NENHUMA PROP DE PRINCIPAL vai para ela — sem `linhasPrevisao`, `propostasExtras`, `propostasDoMotor` nem
       `abrirGerarAoMontar` —, e o modo ainda os recusa por dentro. Os cards somam os mesmos compromissos (`totaisDeDespesa`);
       enquanto eles nao chegaram, "—". */
    const despesasLidas = !(ocApi.loading && !ocApi.resumoOperacao);
    return (
      <AbaContaCorrenteOC api={ccApi} somenteLeitura={props.financeiroNovoReadOnly}
        lado={api.tipoOperacao === 'compra' ? 'compra' : 'venda'}
        totaisDespesas={despesasLidas ? totaisDeDespesa(ocApi.compromissos) : null}
        /* o contador conta as MESMAS linhas que a tabela mostra (`linhasDeDespesa`; os titulos so' mudam status, nao quantas) */
        qtdDespesas={despesasLidas ? linhasDeDespesa(ocApi.compromissos, ocApi.parcelas, null).length : null}
        subAba={subAba} onSubAba={escolherSubAba}
        onAbrirLancamento={abrirLancamento} onIrParaEntrega={props.onIrParaEntrega}
        motivoAtualizarEntregas={props.motivoAtualizarEntregas ?? null}
        despesas={({ host, topo }) => (
          <AbaCompromissosOC ocApi={ocApi} soDespesas bloqueado={props.financeiroNovoReadOnly} clienteId={clienteId}
            tipoOperacao={api.tipoOperacao} fornecedores={api.fornecedores} valorAcordado={api.valorAcordado} lotes={api.lotes}
            contraparteId={api.contraparteId} dataOperacao={props.dataOperacao ?? null} dataChegada={props.dataChegada ?? null}
            darkSelectClass={props.darkSelectClass} recarregarDados={api.recarregar} rotulos={props.rotulos}
            motivoReabertura={props.motivoReabertura ?? null} hostBotoesDespesa={host} topoFixo={topo} />
        )} />
    );
  }
  if ((api.tipoOperacao === 'venda' || api.tipoOperacao === 'compra') && !ccApi.contaCorrente && !ccApi.erro) {
    return <div className="py-10 text-center text-[11px] text-muted-foreground">Carregando…</div>;
  }
  if (ocApi.loading && !ocApi.resumoOperacao) {
    return <div className="py-10 text-center text-[11px] text-muted-foreground">Carregando…</div>;
  }
  if (modo === 'legado') return legado;
  if (modo === 'misto_inconsistente') {
    return (
      <div className="space-y-3 min-w-0">
        <div className="rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-2 text-[11px] text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Operação inconsistente (compromissos e partes legadas). Visão somente leitura.
        </div>
        <AbaCompromissosOC ocApi={ocApi} bloqueado clienteId={clienteId} tipoOperacao={api.tipoOperacao} fornecedores={api.fornecedores} ehBoitel={props.ehBoitel}
          valorAcordado={api.valorAcordado} lotes={api.lotes} contraparteId={api.contraparteId} dataOperacao={props.dataOperacao ?? null} dataChegada={props.dataChegada ?? null}
          darkSelectClass={props.darkSelectClass} recarregarDados={api.recarregar}
          seloProjecao={props.seloProjecao} propostasExtras={props.propostasExtras} propostasDoMotor={props.propostasDoMotor}
          abrirGerarAoMontar={props.abrirGerarAoMontar} rotulos={props.rotulos} />
      </div>
    );
  }
  // nova_vazia | novo_modelo — gate do modelo novo vem PRONTO do shell (financeiroNovoReadOnly).
  return (
    <AbaCompromissosOC ocApi={ocApi} bloqueado={props.financeiroNovoReadOnly} clienteId={clienteId} tipoOperacao={api.tipoOperacao} fornecedores={api.fornecedores} ehBoitel={props.ehBoitel}
      valorAcordado={api.valorAcordado} lotes={api.lotes} contraparteId={api.contraparteId} dataOperacao={props.dataOperacao ?? null} dataChegada={props.dataChegada ?? null}
      darkSelectClass={props.darkSelectClass} recarregarDados={api.recarregar}
      linhasPrevisao={props.linhasPrevisao} bloqueioPrevisao={props.bloqueioPrevisao} seloProjecao={props.seloProjecao}
      propostasExtras={props.propostasExtras} propostasDoMotor={props.propostasDoMotor} abrirGerarAoMontar={props.abrirGerarAoMontar}
      rotulos={props.rotulos} motivoReabertura={props.motivoReabertura ?? null} />
  );
}
