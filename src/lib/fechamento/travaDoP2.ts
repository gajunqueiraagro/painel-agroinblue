/* FECH-P2-TRAVA-AVISO-01 (Gabriel 31/10) — o que trava os pastos de um mês e as frases que a tela mostra.
   A regra é a do banco (`_fn_fechamento_p2_travado`): o mês trava com o Valor do Rebanho VALIDADO
   (`valor_rebanho_realizado_validado.status = 'validado'`) OU com o P2 FECHADO (`valor_rebanho_fechamento.status =
   'fechado'`), sempre por fazenda. A tela só lê as duas marcas para avisar ANTES de digitar; quem recusa é o banco. */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mesCurto } from '@/lib/pecuaria/fechamentoGlobal';

export interface EstadoDoP2 {
  /** o salvar dos pastos deste mês é recusado pelo banco */
  travado: boolean;
  /** o mês já foi validado e a validação caiu (reaberto): depois de mexer nos pastos, pedir para revalidar */
  revalidar: boolean;
}

export type LeituraDoP2 = { ok: true; valor: EstadoDoP2 } | { ok: false; motivo: string };

/** As duas marcas como o banco as decide. Sem linha = nada validado nem fechado. */
export function estadoDoP2(validadoStatus: string | null, fechamentoStatus: string | null): EstadoDoP2 {
  const travado = validadoStatus === 'validado' || fechamentoStatus === 'fechado';
  return { travado, revalidar: !travado && validadoStatus !== null };
}

export async function lerEstadoDoP2(fazendaId: string, anoMes: string): Promise<LeituraDoP2> {
  const [val, fech] = await Promise.all([
    (supabase as any).from('valor_rebanho_realizado_validado').select('status')
      .eq('fazenda_id', fazendaId).eq('ano_mes', anoMes).maybeSingle(),
    supabase.from('valor_rebanho_fechamento').select('status')
      .eq('fazenda_id', fazendaId).eq('ano_mes', anoMes).maybeSingle(),
  ]);
  if (val.error || fech.error) {
    const erro = val.error ?? fech.error;
    console.error('[travaDoP2] leitura do Valor do Rebanho falhou', erro);
    return { ok: false, motivo: 'Não consegui verificar o Valor do Rebanho deste mês.' };
  }
  const statusDe = (d: unknown): string | null =>
    d && typeof d === 'object' && 'status' in d && typeof d.status === 'string' ? d.status : null;
  return { ok: true, valor: estadoDoP2(statusDe(val.data), statusDe(fech.data)) };
}

/** a recusa do banco (salvar/reabrir pasto e os itens) traz esta frase */
export function ehRecusaDaTravaDoP2(erro: string | null | undefined): boolean {
  return !!erro && erro.includes('possui Valor do Rebanho validado ou P2 fechado');
}

export const fraseDaTravaDoPasto = (anoMes: string) =>
  `O Valor do Rebanho de ${mesCurto(anoMes)} está validado. Reabra-o para editar os pastos deste mês.`;

export const rotuloReabrirValorRebanho = (anoMes: string) => `Reabrir Valor do Rebanho de ${mesCurto(anoMes)}`;

export const fraseDaTravaAoReabrirMes = (anoMes: string) =>
  `O Valor do Rebanho de ${mesCurto(anoMes)} está validado: para salvar mudanças nos pastos, reabra-o também.`;

export const fraseRevalidarValorRebanho = (anoMes: string) =>
  `Revalide o Valor do Rebanho de ${mesCurto(anoMes)} (o peso mudou).`;

/* FECH-REVALIDAR-AVISO-01 (Gabriel 04/11 13:19) — a pendência "revalidar" é UM estado, não um aviso a cada Salvar: a linha do Valor do
   Rebanho que já foi validada e caiu (`status = 'invalidado'`, a mesma marca de `estadoDoP2`: validado != null e não 'validado'). A Visão
   Geral mostra um item por fazenda × mês; a tela do Valor do Rebanho já mostra a faixa do mês. Some quando revalidar (o status volta a
   'validado'). Falhou a leitura = a frase, nunca "nada pendente" (P146). */
export interface ValorRebanhoARevalidar { fazendaId: string; anoMes: string }

export function lerARevalidar(linhas: unknown): ValorRebanhoARevalidar[] {
  if (!Array.isArray(linhas)) return [];
  const out: ValorRebanhoARevalidar[] = [];
  for (const l of linhas) {
    if (!l || typeof l !== 'object' || !('fazenda_id' in l) || !('ano_mes' in l) || !('status' in l)) continue;
    if (l.status !== 'invalidado' || typeof l.fazenda_id !== 'string' || typeof l.ano_mes !== 'string') continue;
    out.push({ fazendaId: l.fazenda_id, anoMes: l.ano_mes });
  }
  return out.sort((a, b) => a.anoMes.localeCompare(b.anoMes) || a.fazendaId.localeCompare(b.fazendaId));
}

export const fraseARevalidar = (anoMes: string) => `Valor do Rebanho de ${mesCurto(anoMes)} a revalidar`;
export const FRASE_ARREVALIDAR_FALHOU = 'Não consegui verificar o Valor do Rebanho a revalidar.';

export function useValorRebanhoARevalidar(fazendaIds: readonly string[]) {
  const ids = useMemo(() => [...fazendaIds].filter((x) => x && x !== '__global__').sort(), [fazendaIds]);
  const q = useQuery({
    queryKey: ['valor-rebanho-a-revalidar', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('valor_rebanho_realizado_validado')
        .select('fazenda_id, ano_mes, status').in('fazenda_id', ids).eq('status', 'invalidado');
      if (error) { console.error('[travaDoP2] leitura do Valor do Rebanho a revalidar falhou', error); throw new Error(FRASE_ARREVALIDAR_FALHOU); }
      return lerARevalidar(data);
    },
  });
  return { pendentes: q.data ?? [], carregando: q.isLoading, erro: q.error ? FRASE_ARREVALIDAR_FALHOU : null };
}

/**
 * REVALIDAR-BG-SET26 (Gabriel 05/11) — revalidar o Valor do Rebanho do mês É o "Salvar e Fechar" (o mesmo gravador): regrava os itens,
 * fecha o mês e volta o snapshot a `validado`. O botão do aviso nunca fica mudo: quando não pode, diz o porquê (o primeiro que barra).
 * Quem recusa de verdade é o banco (a guarda do P1 no fechamento, a RLS, o perfil leitura) — e a recusa dele aparece com a mensagem dele.
 */
export function motivoParaRevalidar(e: {
  podeEditar: boolean; pastosOficiais: boolean; semPreco: readonly string[]; anoMes: string;
}): string | null {
  if (!e.podeEditar) return 'Só quem edita o Valor do Rebanho revalida.';
  if (!e.pastosOficiais) return `Feche os pastos de ${mesCurto(e.anoMes)} primeiro.`;
  if (e.semPreco.length > 0) return `Falta o preço de: ${e.semPreco.join(', ')}.`;
  return null;
}
