import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  SessaoCompleta,
  MesaSessaoRow,
  MesaParRow,
  MesaOfxValidacaoRow,
} from './types';

/**
 * Busca a sessão existente para (cliente, conta, mês), se houver.
 * NÃO cria sessão automaticamente — criação é explícita via criarOuRecuperarSessao.
 */
export function useMesaSessao(
  clienteId: string | null,
  contaBancariaId: string | null,
  anoMes: string | null,
) {
  return useQuery<SessaoCompleta | null>({
    queryKey: ['mesa-sessao', clienteId, contaBancariaId, anoMes],
    enabled: !!clienteId && !!contaBancariaId && !!anoMes,
    staleTime: 0,
    queryFn: async (): Promise<SessaoCompleta | null> => {
      // Cast em supabase: tabelas novas do PR5 ainda não estão nos tipos
      // gerados; regeneração de types fica em frente separada.
      const sb = supabase as any;

      const sessaoRes = await sb
        .from('mesa_sessao')
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaBancariaId)
        .eq('ano_mes', anoMes)
        .maybeSingle();

      if (sessaoRes.error) throw sessaoRes.error;
      if (!sessaoRes.data) return null;

      const sessao = sessaoRes.data as MesaSessaoRow;

      const [paresRes, ofxValRes] = await Promise.all([
        sb.from('mesa_par').select('*').eq('sessao_id', sessao.id),
        sb.from('mesa_ofx_validacao').select('*').eq('sessao_id', sessao.id),
      ]);

      if (paresRes.error) throw paresRes.error;
      if (ofxValRes.error) throw ofxValRes.error;

      return {
        sessao,
        pares: ((paresRes.data ?? []) as unknown) as MesaParRow[],
        ofxValidacoes: ((ofxValRes.data ?? []) as unknown) as MesaOfxValidacaoRow[],
      };
    },
  });
}
