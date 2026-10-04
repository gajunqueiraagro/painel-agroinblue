/**
 * A LEITURA DO DONO DO RESUMO — PR-CONC-SALDO-UMA-REGUA-02.
 *
 * ⚠ DOIS HOOKS, DUAS CHAVES, NENHUM CÁLCULO: `useResumoMes` lê `fn_conciliacao_resumo_mes` (todas as contas com
 *   `contaIds` nulo; uma só, com os dias e a lista do sistema, com `[conta]`), `useStatusAno` lê
 *   `fn_conciliacao_status_ano`. As telas desenham o que vem daqui — a Conciliação, o quadro do topo e a aba Sistema
 *   do Casar. A invalidação depois de um gesto que grava é o CONC-SEM-F5-01: `invalidarDono`, pelo canal e ao voltar à vista.
 */
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { lerResumo, lerStatusAno, type LinhaResumo, type StatusAnoDono } from '@/lib/conciliacao/resumoDoDono';

export const CHAVE_RESUMO_MES = 'conciliacao-resumo-mes';
export const CHAVE_STATUS_ANO = 'conciliacao-status-ano';

/**
 * `servirDoCache` (PR-CONC-SALDO-UMA-REGUA-02b, D1): o observador aceita o resumo já no cache por 60 s sem reler ao montar.
 * É o que deixa o painel do Importar, o "Conciliar o mês" e o lápis abrirem a conta que o Casar já leu SEM uma segunda ida
 * ao dono (com o `staleTime` 0 padrão, cada montagem relia). Fica fresco pelo gatilho, não pelo relógio: os gestos desta
 * tela invalidam a chave (`useReleDonoAoMudarLancamentos`, salvar o saldo); os das outras seções, o retorno à vista
 * (`useReleDonoAoVoltarAVista`), que invalida também esta chave por conta.
 */
export function useResumoMes(
  clienteId: string | null | undefined, anoMes: string, contaIds: readonly string[] | null,
  opcoes?: { servirDoCache?: boolean },
) {
  const contas = contaIds ? [...contaIds].sort() : null;
  return useQuery({
    queryKey: [CHAVE_RESUMO_MES, clienteId, anoMes, contas],
    ...(opcoes?.servirDoCache ? { staleTime: 60_000 } : {}),
    enabled: !!clienteId && /^\d{4}-\d{2}$/.test(anoMes) && (contas === null || contas.length > 0),
    queryFn: async (): Promise<LinhaResumo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_conciliacao_resumo_mes', {
        p_cliente_id: clienteId, p_ano_mes: anoMes, p_conta_ids: contas,
      });
      if (error) throw error;
      return lerResumo(data);
    },
  });
}

export function useStatusAno(clienteId: string | null | undefined, ano: number) {
  return useQuery({
    queryKey: [CHAVE_STATUS_ANO, clienteId, ano],
    enabled: !!clienteId && Number.isInteger(ano),
    queryFn: async (): Promise<StatusAnoDono[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_conciliacao_status_ano', {
        p_cliente_id: clienteId, p_ano: ano,
      });
      if (error) throw error;
      return lerStatusAno(data);
    },
  });
}

/**
 * INVALIDAR O DONO DESTE CLIENTE — CONC-SEM-F5-01. As DUAS chaves, pelo prefixo: o resumo (todas as contas E cada chave por conta,
 * as do `servirDoCache` inclusive — invalidar vence o `staleTime`) e a régua do ano. Quem está montado relê; quem não está fica
 * marcado e relê ao montar.
 * ⚠ `cancelRefetch: false`: se a releitura daquela chave já está em curso (o react-query relê sozinho ao montar e no foco da
 *   janela), não se abre uma segunda — uma chamada do resumo e uma da régua por retorno, nunca duas.
 * ⚠ NÃO ESVAZIA A TELA: invalidar mantém o dado anterior no cache enquanto o novo não chega.
 */
export function invalidarDono(qc: QueryClient, clienteId: string | null | undefined) {
  if (!clienteId) return;
  void qc.invalidateQueries({ queryKey: [CHAVE_RESUMO_MES, clienteId] }, { cancelRefetch: false });
  void qc.invalidateQueries({ queryKey: [CHAVE_STATUS_ANO, clienteId] }, { cancelRefetch: false });
}

/**
 * RELER O DONO QUANDO OS LANÇAMENTOS MUDAM — PR-CONC-SALDO-UMA-REGUA-02b (D6), completado no CONC-SEM-F5-01: o canal
 * (`inscreverEmLancamentos`) invalida o resumo E a régua do cliente. Todo gesto que grava com a Conciliação montada avisa o
 * canal (o casar e a Conferência, o criar pela linha, importar e desfazer extrato, a Mesa do Enriquecer, editar e excluir).
 */
export function useReleDonoAoMudarLancamentos(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => invalidarDono(qc, clienteId));
  }, [clienteId, qc]);
}

/** Retornos colados (o foco e a visibilidade da janela chegam juntos) valem UMA releitura. */
export const JANELA_DO_RETORNO_MS = 1000;

/**
 * RELER O DONO AO VOLTAR À VISTA — CONC-SEM-F5-01 (a rede de segurança: F5 nunca é necessário). O gesto feito em OUTRA seção
 * não alcança a Conciliação pelo canal (ela está desmontada, e o canal só fala com quem está montado); quando ela volta a ficar
 * à vista, relê. Três retornos: ENTRAR na seção (montar com `aVista`), TROCAR para a aba interna "Conciliação" (`aVista` passa
 * a verdadeiro) e a JANELA do navegador voltar a ter foco ou visibilidade.
 * ⚠ UMA RELEITURA POR RETORNO: os eventos colados contam um só (`JANELA_DO_RETORNO_MS`), e `invalidarDono` não duplica a
 *   releitura que já estiver em curso. Fora de vista (outra aba interna aberta), o foco da janela não dispara nada daqui.
 */
export function useReleDonoAoVoltarAVista(clienteId: string | null | undefined, aVista: boolean) {
  const qc = useQueryClient();
  const ultimo = useRef(0);
  useEffect(() => {
    if (!clienteId || !aVista) return;
    const reler = () => {
      const agora = Date.now();
      if (agora - ultimo.current < JANELA_DO_RETORNO_MS) return;
      ultimo.current = agora;
      invalidarDono(qc, clienteId);
    };
    reler();
    const aoVoltar = () => { if (document.visibilityState === 'visible') reler(); };
    window.addEventListener('focus', aoVoltar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.removeEventListener('focus', aoVoltar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [clienteId, aVista, qc]);
}
