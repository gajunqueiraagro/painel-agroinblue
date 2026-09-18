/**
 * CANCELAR UM MOVIMENTO DO EXTRATO — e desfazer o cancelamento. PR-EXTRATO-CANCELAR-MOVIMENTO-01.
 *
 * ⚠ NASCE DE UM CASO REAL, em 18/09/2026: o Itaú reexportou um movimento da Vera Ligia com
 * descrição E documento diferentes, a dedupe da importação não o reconheceu, ele entrou duas
 * vezes — e não havia porta na tela para arrumar. Foi resolvido no banco, por quem tem acesso
 * ao banco, que é exatamente o que este PR existe para acabar.
 *
 * ⚠ CANCELAR NÃO É IGNORAR, e o hook não os mistura. A doutrina está escrita em
 * `useConciliacaoDoMes.ts`: cancelado é o movimento que NÃO EXISTE; ignorado é o que existe e
 * foi desconsiderado. Duplicata de reimportação é o primeiro, e ela some da vida do extrato —
 * some do saldo, das sugestões, da prévia, de tudo. O ignorar continua sendo outra coisa, com
 * outra RPC e outro lugar na tela.
 *
 * ⚠ A MENSAGEM DO POSTGRES VAI PARA A TELA SEM TRADUZIR, e por isso as RPCs escrevem em
 * português de operador: as recusas previstas (movimento conciliado, já cancelado, motivo em
 * branco) precisam dizer o que fazer ANTES, e traduzir aqui só criaria um segundo texto para a
 * mesma regra.
 */
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Um movimento que saiu da vida do extrato — para a lista de conferência do mês. */
export interface MovimentoCancelado {
  id: string;
  data: string | null;
  descricao: string | null;
  documento: string | null;
  valor: number;
  canceladoEm: string | null;
  motivo: string | null;
}

/**
 * Os motivos que a tela oferece, o primeiro sendo o caso que originou a frente.
 *
 * ⚠ LISTA CURTA + TEXTO LIVRE, e não só texto livre: motivo aberto vira "erro", "teste" e
 * "duplicado?" — três grafias para o mesmo fato, e a auditoria deixa de responder "quantas
 * reimportações duplicaram movimento este mês". A opção "outro" cobre o que a lista não
 * previu, e é ela que impede a lista de virar camisa de força.
 */
export const MOTIVOS_DE_CANCELAMENTO = [
  'Duplicado na reimportação',
  'Não pertence a esta conta',
  'Lançado em duplicidade pelo banco',
  'Importado no mês errado',
] as const;

/** A mensagem crua do Postgres, com o código — a mesma decisão do `useConciliarMes`. */
function mensagemDaRpc(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; code?: unknown };
    const msg = typeof o.message === 'string' && o.message.trim() !== '' ? o.message : null;
    const cod = typeof o.code === 'string' && o.code ? ` (${o.code})` : '';
    if (msg) return msg + cod;
  }
  return e instanceof Error ? e.message : 'Falha ao cancelar o movimento.';
}

export function useCancelarMovimento(clienteId: string | null, contaId: string | null, anoMes: string) {
  const qc = useQueryClient();
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Os cancelados DESTE mês e desta conta.
   * ⚠ LEITURA DIRETA, NÃO RPC: são as próprias colunas da linha, e a RLS por tenant já
   * responde pelo recorte. Uma RPC aqui só acrescentaria um lugar para a regra divergir.
   */
  const cancelados = useQuery({
    queryKey: ['extrato-cancelados', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<MovimentoCancelado[]> => {
      const [ano, mes] = anoMes.split('-').map(Number);
      const primeiro = `${anoMes}-01`;
      const seguinte = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
      const { data, error } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('id, data_movimento, descricao, documento, valor, cancelado_em, cancelado_motivo')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .not('cancelado_em', 'is', null)
        .gte('data_movimento', primeiro)
        .lt('data_movimento', seguinte)
        .order('data_movimento');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas da tabela, fora de types.ts
      return (data ?? []).map((r: any) => ({
        id: String(r.id),
        data: r.data_movimento ?? null,
        descricao: r.descricao ?? null,
        documento: r.documento ?? null,
        valor: Number(r.valor ?? 0),
        canceladoEm: r.cancelado_em ?? null,
        motivo: r.cancelado_motivo ?? null,
      }));
    },
  });

  /* ⚠ AS TRÊS LEITURAS DO MÊS PRECISAM SABER — a linha sai do extrato, e quem não ouvir
     continua somando um movimento que deixou de existir. */
  const recarregarTudo = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['extrato-do-mes', clienteId, contaId, anoMes] }),
      qc.invalidateQueries({ queryKey: ['extrato-cancelados', clienteId, contaId, anoMes] }),
      qc.invalidateQueries({ queryKey: ['espelho-conciliacao', clienteId, contaId, anoMes] }),
      qc.invalidateQueries({ queryKey: ['extrato-bancario-v2'] }),
    ]);
  }, [qc, clienteId, contaId, anoMes]);

  const cancelar = useCallback(async (extratoId: string, motivo: string): Promise<boolean> => {
    setGravando(true);
    setErro(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_cancelar_movimento_extrato', {
        p_extrato_id: extratoId, p_motivo: motivo,
      });
      if (error) throw error;
      await recarregarTudo();
      return true;
    } catch (e) {
      setErro(mensagemDaRpc(e));
      return false;
    } finally {
      setGravando(false);
    }
  }, [recarregarTudo]);

  const reverter = useCallback(async (extratoId: string): Promise<boolean> => {
    setGravando(true);
    setErro(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_reverter_cancelamento_extrato', {
        p_extrato_id: extratoId,
      });
      if (error) throw error;
      await recarregarTudo();
      return true;
    } catch (e) {
      setErro(mensagemDaRpc(e));
      return false;
    } finally {
      setGravando(false);
    }
  }, [recarregarTudo]);

  return { cancelados: cancelados.data ?? [], carregandoCancelados: cancelados.isLoading, cancelar, reverter, gravando, erro };
}
