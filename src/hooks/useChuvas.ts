import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';

export interface Chuva {
  id: string;
  fazendaId: string;
  data: string; // YYYY-MM-DD
  milimetros: number;
  observacao?: string;
}

/**
 * @param fazendaEscolhidaId Fazenda escolhida NA TELA, quando o filtro está em Global —
 *   [OC-PADRAO-01] 114c.
 *
 * ⚠ ESCOLHER AQUI NÃO TROCA O FILTRO DO APP. O operador em Global que quer lançar chuva
 * de uma fazenda escolhe qual, lança, e continua em Global — mudar o contexto por baixo
 * dele o levaria para outra tela ao voltar. Por isso a fazenda entra por parâmetro, e não
 * por `setFazendaAtual`.
 * ⚠ E ELA NÃO É "A FAZENDA DO USUÁRIO": fora do Global o parâmetro é ignorado, porque lá
 * quem manda é o filtro. Duas fontes para a mesma pergunta discordariam no primeiro
 * gesto.
 */
export function useChuvas(fazendaEscolhidaId?: string | null) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const [chuvas, setChuvas] = useState<Chuva[]>([]);
  const [loading, setLoading] = useState(true);

  /* Em Global com escolha, ela manda; nos demais casos, o filtro. */
  const escolhida = isGlobal && fazendaEscolhidaId ? fazendaEscolhidaId : null;
  const fazendaId = escolhida ?? fazendaAtual?.id;
  /* A leitura de TODAS as fazendas só vale no Global SEM escolha — com escolha, a
     planilha é daquela fazenda e mostrar as outras seria a soma no lugar do dado. */
  const lendoTodas = isGlobal && !escolhida;

  const loadData = useCallback(async () => {
    if (!fazendaId) { setChuvas([]); setLoading(false); return; }
    setLoading(true);

    const query = lendoTodas
      ? supabase.from('chuvas').select('*').in('fazenda_id', fazendas.map(f => f.id))
      : supabase.from('chuvas').select('*').eq('fazenda_id', fazendaId);

    const { data, error } = await query.order('data', { ascending: false });

    if (data) {
      setChuvas(data.map((c: any) => ({
        id: c.id,
        fazendaId: c.fazenda_id,
        data: c.data,
        milimetros: Number(c.milimetros),
        observacao: c.observacao ?? undefined,
      })));
    }
    if (error) toast.error('Erro ao carregar chuvas');
    setLoading(false);
  }, [fazendaId, lendoTodas, fazendas]);

  useEffect(() => { loadData(); }, [loadData]);

  const salvarChuva = async (data: string, milimetros: number, observacao?: string) => {
    /* ⚠ A REGRA CONTINUA: chuva é de UMA estação, e não se lança "no Global". O que mudou
       é que agora existe um jeito de escolher a estação sem sair do Global — e o bloqueio
       passa a valer só quando ninguém escolheu. */
    if (!fazendaId || fazendaId === '__global__' || (isGlobal && !escolhida)) {
      toast.error('Escolha a fazenda para lançar a chuva.');
      return;
    }
    const clienteId = (escolhida
      ? fazendas.find(f => f.id === escolhida)?.cliente_id
      : fazendaAtual?.cliente_id);
    if (!clienteId) {
      console.error('[useChuvas] cliente_id ausente em fazendaAtual', { fazendaAtual });
      toast.error('Fazenda sem cliente vinculado — contate o suporte.');
      return;
    }

    // NOTE: coluna `observacao` ausente no schema cache do Supabase — não enviar
    // no payload até que migration confirme a coluna. Parâmetro mantido na
    // assinatura para preservar compat de chamada (input do dialog inalterado).
    void observacao;
    const { error } = await supabase.from('chuvas').upsert({
      fazenda_id: fazendaId,
      cliente_id: clienteId,
      data,
      milimetros,
    }, { onConflict: 'fazenda_id,data' });

    if (error) {
      console.error('[useChuvas] erro ao salvar chuva', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload: { fazenda_id: fazendaId, cliente_id: clienteId, data, milimetros },
      });
      toast.error(`Erro ao salvar chuva: ${error.message}`);
      return;
    }
    toast.success('Chuva registrada');
    await loadData();
  };

  const removerChuva = async (id: string) => {
    const { error } = await supabase.from('chuvas').delete().eq('id', id);
    if (!error) {
      setChuvas(prev => prev.filter(c => c.id !== id));
    }
  };

  return { chuvas, loading, salvarChuva, removerChuva, loadData };
}
