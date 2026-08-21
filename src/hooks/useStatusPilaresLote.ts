/**
 * Hook: useStatusPilaresLote
 *
 * Status de fechamento de VÁRIAS fazendas no mesmo mês, para a faixa da Visão Geral.
 *
 * POR QUE N CHAMADAS E NÃO UMA RPC AGREGADA.
 * A lógica de status continua morando SÓ no banco, numa função só —
 * get_status_pilares_fechamento —, que a Visão Geral chama uma vez por fazenda.
 * São 3 a 12 fazendas por cliente. Uma RPC agregada seria um segundo lugar onde a
 * regra de "mês fechado" existiria, e dois lugares divergem.
 * Se um dia forem 50 fazendas, troca-se por RPC agregada. Otimizar antes disso seria
 * repetir o erro do gate `fazendaEspecifica` do extrato, que sobreviveu dois anos por
 * causa de uma restrição imaginária.
 *
 * POR QUE ESTE HOOK EXISTE, EM VEZ DE REUSAR useStatusPilares.
 * Aquele devolve DEFAULT_STATUS quando fazendaId === '__global__' (useStatusPilares.ts),
 * porque a RPC é por fazenda. No modo global não há o que perguntar ao banco: é preciso
 * perguntar fazenda a fazenda. O TIPO StatusPilar é importado de lá, não redeclarado —
 * o vocabulário tem que ser o mesmo nos dois.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { StatusPilar } from '@/hooks/useStatusPilares';

export interface StatusFazenda {
  fazendaId: string;
  nome: string;
  p1: StatusPilar;
  p2: StatusPilar;
}

/* Falta de resposta NUNCA vira 'oficial'. Valor que não pertence ao contrato entra como
   pendente: afirmar fechamento por silêncio é o pior erro possível aqui.
   'nao_aplicavel' e 'nao_iniciado' SÃO do contrato — mês sem pasto de pecuária e mês sem
   card — e não podem cair no fallback só por serem novos. Foi assim que a tela chegou a
   cobrar rebanho de fazenda que não tem gado.

   PR-STATUS-ANO-HOOK-01 — o MIOLO virou função exportada porque agora há dois leitores
   da mesma RPC: este hook (mês corrente, objeto {status}) e useStatusPilaresAno (grade
   anual, texto solto). Duas listas brancas divergiriam no próximo estado novo — foi
   exatamente esse o defeito que 'nao_aplicavel' e 'nao_iniciado' expuseram. */
export function normalizarStatusPilar(valor: unknown): StatusPilar {
  return valor === 'oficial' || valor === 'pendente' || valor === 'nao_aplicavel'
      || valor === 'nao_iniciado' || valor === 'nao_implementado' || valor === 'bloqueado'
    ? valor : 'pendente';
}

export function lerStatus(bruto: unknown): StatusPilar {
  if (!bruto || typeof bruto !== 'object') return 'pendente';
  const s = normalizarStatusPilar((bruto as Record<string, unknown>).status);
  /* A FAIXA da Visão Geral ainda dobra 'nao_iniciado' em 'pendente', e isso é
     DELIBERADO até o PR da régua. A faixa conta "fechada" como "nenhum pilar pendente":
     sem esta linha, um mês que ninguém abriu contaria como FECHADO e a tela afirmaria
     "Rebanho 2/2" sobre trabalho que não começou. Coagir para pendente é conservador —
     nunca afirma fechamento. A régua, que sabe distinguir os dois, lê pela função
     exportada acima e não passa por aqui. */
  return s === 'nao_iniciado' ? 'pendente' : s;
}

export function useStatusPilaresLote(
  fazendas: { id: string; nome: string }[],
  anoMes: string | undefined,
  enabled = true,
): { data: StatusFazenda[]; loading: boolean; error: string | null } {
  const [data, setData] = useState<StatusFazenda[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* A lista chega como array NOVA a cada render do pai. Depender dela no useEffect é
     loop infinito garantido. A dependência é a chave derivada (ids concatenados); a
     lista em si é lida por ref dentro do efeito, nunca observada. */
  const alvos = useMemo(
    () => fazendas.filter(f => f.id && f.id !== '__global__'),
    [fazendas],
  );
  const chave = useMemo(() => alvos.map(f => f.id).join(','), [alvos]);
  const alvosRef = useRef(alvos);
  alvosRef.current = alvos;

  const buscar = useCallback(async (cancelado: () => boolean) => {
    const lista = alvosRef.current;
    if (!enabled || !anoMes || lista.length === 0) {
      if (!cancelado()) { setData([]); setLoading(false); setError(null); }
      return;
    }

    setLoading(true);
    setError(null);

    // Uma falha não derruba as outras: cada promessa resolve com o que conseguiu.
    const falhas: string[] = [];
    const resultados = await Promise.all(
      lista.map(async (f): Promise<StatusFazenda> => {
        try {
          const { data: r, error: err } = await supabase.rpc(
            'get_status_pilares_fechamento',
            { _fazenda_id: f.id, _ano_mes: anoMes },
          );
          if (err) {
            falhas.push(`${f.nome}: ${err.message}`);
            return { fazendaId: f.id, nome: f.nome, p1: 'pendente', p2: 'pendente' };
          }
          const obj = (r && typeof r === 'object') ? (r as Record<string, unknown>) : {};
          return {
            fazendaId: f.id,
            nome: f.nome,
            p1: lerStatus(obj.p1_mapa_pastos),
            p2: lerStatus(obj.p2_valor_rebanho),
          };
        } catch (e) {
          falhas.push(`${f.nome}: ${String(e)}`);
          return { fazendaId: f.id, nome: f.nome, p1: 'pendente', p2: 'pendente' };
        }
      }),
    );

    // Guarda de corrida: mês ou lista mudaram durante o fetch → resultado obsoleto.
    if (cancelado()) return;
    setData(resultados);
    setError(falhas.length > 0 ? falhas.join(' · ') : null);
    setLoading(false);
  }, [enabled, anoMes]);

  useEffect(() => {
    let cancelled = false;
    buscar(() => cancelled);
    return () => { cancelled = true; };
    // `chave` entra na dependência para reagir a mudança de fazendas sem observar o array.
  }, [buscar, chave]);

  return { data, loading, error };
}
