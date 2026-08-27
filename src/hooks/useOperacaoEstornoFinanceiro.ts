import { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { OcCompromissoError, normalizarErroRpc } from './useOcCompromissos';

/* ESTORNO FINANCEIRO DA OC — os tres writers que desfazem o modelo novo, um por
   nivel. O backend ja os tinha inteiros; nenhum estava ligado a interface, e por
   isso um compromisso criado com valor errado ficava preso para sempre.

   ⚠ A ORDEM E' FOLHA -> RAIZ, e nao e' convencao: o banco recusa cancelar a
   programacao com parcela materializada, e recusa cancelar o compromisso com
   programacao ativa. A UI so deve OFERECER a acao cujo estado ja permite —
   oferecer o que sera recusado e' o defeito que esta frente existe para nao
   repetir.
     materializacao -> parcela volta a PREVISTA; titulo cancelado, parte cancelada
     programacao    -> parcelas canceladas; programacao cancelada; compromisso ABERTO
     compromisso    -> compromisso cancelado

   ⚠⚠ REHIDRATACAO ENTRE CHAMADAS e' o ponto de maior risco. Cada RPC INCREMENTA
   a versao da operacao; encadear as tres com a versao inicial faz a segunda
   morrer com 40001. Por isso cada writer devolve a versao nova E o chamador
   passa `onSucesso`, que aqui e ligado ao `recarregar()` do `useOcCompromissos`
   — ele rele `zoo_operacoes_comerciais.versao` do banco e ressincroniza listas e
   versao de uma vez. Nao se propaga versao "na mao" entre as tres.

   ⚠ NAO HA `fn_zoot_cache_rebuild` aqui, diferente do estorno de RECEBIMENTO:
   nenhuma destas RPCs toca lancamento zootecnico. Chamar o rebuild seria ~850ms
   por ano gastos para nao mudar nada.

   ⚠ GUARD E3 E' FRONTEIRA, NAO OBSTACULO: titulo 'realizado'/'conciliado', com
   `conciliado_em`, ou com liquidacao ativa faz o banco recusar com P0001. A
   mensagem sobe VERBATIM ao usuario via `normalizarErroRpc`. Nao existe caminho
   alternativo aqui — quem precisa passar disso estorna a liquidacao antes. E' o
   limite que o ADR-2026-18 registra. */

export interface EstornoFinanceiroApi {
  saving: boolean;
  /** Parcela materializada -> prevista. Devolve a versao nova da operacao. */
  estornarMaterializacao: (versaoEsperada: number, programacaoId: string, parcelaId: string, motivo: string) => Promise<number>;
  /** Programacao ativa -> cancelada; compromisso volta a aberto. */
  cancelarProgramacao: (versaoEsperada: number, programacaoId: string, motivo: string) => Promise<number>;
  /** Compromisso sem efeitos -> cancelado. */
  cancelarCompromisso: (versaoEsperada: number, compromissoId: string, motivo: string) => Promise<number>;
}

interface Params {
  operacaoId: string | null;
  clienteId: string | null;
  /** Chamado APOS cada sucesso. Ligar ao `recarregar` do `useOcCompromissos`:
      e' ele que rele a versao do banco e evita o 40001 na chamada seguinte. */
  onSucesso: () => void | Promise<void>;
}

export function useOperacaoEstornoFinanceiro({ operacaoId, clienteId, onSucesso }: Params): EstornoFinanceiroApi {
  const [saving, setSaving] = useState(false);

  /* Um executor so para as tres: elas diferem apenas no nome da RPC e nos
     argumentos proprios. Repetir o try/catch tres vezes faria as mensagens
     divergirem no primeiro ajuste. */
  const executar = useCallback(async (
    fn: string, args: Record<string, unknown>, motivo: string, sucesso: string,
  ): Promise<number> => {
    if (!operacaoId || !clienteId) {
      const e = new OcCompromissoError('operacao_inexistente', 'Operação não iniciada.');
      toast.error(e.message); throw e;
    }
    const m = motivo.trim();
    if (m === '') {
      const e = new OcCompromissoError('regra_negocio', 'Informe o motivo do estorno.');
      toast.error(e.message); throw e;
    }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
      const { data, error } = await (supabase as any).rpc(fn, {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, ...args, p_motivo: m,
      });
      if (error) throw normalizarErroRpc(error);
      const nova = Number(data?.operacao_versao);
      if (!Number.isFinite(nova)) {
        throw new OcCompromissoError('erro_desconhecido', 'A operação foi estornada, mas a nova versão não voltou. Recarregue antes de continuar.');
      }
      toast.success(sucesso);
      await onSucesso();
      return nova;
    } catch (e) {
      const norm = e instanceof OcCompromissoError
        ? e
        : new OcCompromissoError('erro_desconhecido', e instanceof Error ? e.message : 'Falha ao estornar.');
      /* ⚠ IDEMPOTENCIA (guard E5) e' AVISO, nao falha: a cadeia ja estava
         revertida, entao o estado desejado ja vale. Mostrar erro vermelho aqui
         faria o usuario desfazer de novo o que ja esta desfeito.
         As TRES mensagens do banco (P0001, verbatim) sao distintas e o regex
         precisa das tres — medido no proto:
           'A materializacao ja esta estornada'
           'Programacao ja cancelada'
           'Compromisso ja cancelado'
         Nao confundir com 'Operacao cancelada; recupere-a antes', que nao tem
         'ja' e continua sendo erro de verdade. */
      if (/j[áa] (est[áa] estornad|cancelad)/i.test(norm.message)) {
        toast.warning(norm.message);
        await onSucesso();
      } else {
        toast.error(norm.message);
        if (norm.code === 'versao_conflito') await onSucesso();
      }
      throw norm;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, onSucesso]);

  const estornarMaterializacao = useCallback(
    (versaoEsperada: number, programacaoId: string, parcelaId: string, motivo: string) =>
      executar('oc_estornar_materializacao',
        { p_versao_esperada: versaoEsperada, p_programacao_id: programacaoId, p_parcela_id: parcelaId },
        motivo, 'Materialização estornada: a parcela voltou a prevista.'),
    [executar]);

  const cancelarProgramacao = useCallback(
    (versaoEsperada: number, programacaoId: string, motivo: string) =>
      executar('oc_cancelar_programacao',
        { p_versao_esperada: versaoEsperada, p_programacao_id: programacaoId },
        motivo, 'Programação cancelada: o compromisso voltou a aberto.'),
    [executar]);

  const cancelarCompromisso = useCallback(
    (versaoEsperada: number, compromissoId: string, motivo: string) =>
      executar('oc_cancelar_compromisso',
        { p_versao_esperada: versaoEsperada, p_compromisso_id: compromissoId },
        motivo, 'Compromisso cancelado.'),
    [executar]);

  return useMemo(() => ({ saving, estornarMaterializacao, cancelarProgramacao, cancelarCompromisso }),
    [saving, estornarMaterializacao, cancelarProgramacao, cancelarCompromisso]);
}
