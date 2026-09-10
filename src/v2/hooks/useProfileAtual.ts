/**
 * O NOME DE QUEM ESTÁ LOGADO — PR-BARRA-UNICA-01a.
 *
 * ⚠ A BARRA MOSTRAVA O E-MAIL, e e-mail não é nome: "atendimento@…" no canto de toda tela
 * diz menos sobre quem está operando do que "Gabriel Junqueira". O nome mora em
 * `profiles.nome`, e o repo já o lê em cinco lugares — `useLancamentos:274`,
 * `AuditoriaTab:114`, `AcessosTab:86`, `AbaAuditoriaLancamento:94` e
 * `MinimodalOrigemLancamento:157` — mas SEMPRE por `user_id` de terceiros, para nomear quem
 * fez um lançamento. Nenhum deles lê o nome do PRÓPRIO usuário; esta é a primeira, e por
 * isso é hook e não linha solta: a Auditoria e os minimodais podem passar a usá-la depois.
 *
 * ⚠ `staleTime` LONGO DE PROPÓSITO: o nome de quem está logado não muda durante a sessão, e
 * refazer a leitura a cada montagem de tela seria uma consulta por navegação para responder
 * o que já se sabe.
 *
 * ⚠ FALLBACK É O E-MAIL, NUNCA VAZIO. Perfil ausente, RLS recusando ou rede caída não podem
 * apagar a identidade do canto da tela — o e-mail é o que o `AuthContext` já garante.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ProfileAtual {
  /** `profiles.nome` quando existe; senão o e-mail; senão string vazia. */
  nome: string;
  /** O nome veio mesmo do perfil? Falso quando é o e-mail servindo de fallback. */
  temNome: boolean;
}

export function useProfileAtual(): ProfileAtual {
  const { user } = useAuth();
  const email = user?.email ?? '';

  const { data } = useQuery({
    queryKey: ['profile-atual', user?.id],
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data: p } = await supabase
        .from('profiles').select('nome').eq('user_id', user!.id).maybeSingle();
      const nome = (p as { nome?: string | null } | null)?.nome ?? null;
      return nome && nome.trim() !== '' ? nome.trim() : null;
    },
  });

  return { nome: data ?? email, temNome: !!data };
}
