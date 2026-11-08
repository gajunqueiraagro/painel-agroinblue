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

/* FECH-REABRIR-JUNTO-01 (Gabriel 07/11 13:54) — editar um pasto num mês com o Valor do Rebanho validado é UM gesto no próprio modal: o
   aviso diz o que acontece e o "Reabrir e editar" reabre o Valor do Rebanho pela MESMA função da tela dele (`fn_valor_rebanho_reabrir`:
   abre o P2, o mês fica "a revalidar", a trilha leva o autor) e, se o pasto estava fechado, reabre o pasto. Quem recusa é o banco. */
export const fraseReabrirJunto = (anoMes: string) =>
  `O Valor do Rebanho de ${mesCurto(anoMes)} volta para aberto. Valide de novo depois do ajuste.`;
export const ROTULO_REABRIR_E_EDITAR = 'Reabrir e editar';
export const FRASE_REABRIR_JUNTO_FALHOU = 'Não consegui reabrir o Valor do Rebanho deste mês.';

/** o motivo da trilha: o digitado (opcional) depois do pasto — nunca vazio */
export function motivoReabrirJunto(pastoNome: string, digitado: string): string {
  const extra = digitado.trim();
  return `Reabrir e editar o pasto ${pastoNome}${extra ? `: ${extra}` : ''}`;
}

export type ReabriuJunto = { ok: true } | { ok: false; motivo: string };

export async function reabrirValorRebanhoJunto(fazendaId: string, anoMes: string, motivo: string): Promise<ReabriuJunto> {
  const { error } = await (supabase as any).rpc('fn_valor_rebanho_reabrir', {
    p_fazenda_id: fazendaId, p_ano_mes: anoMes, p_motivo: motivo,
  });
  if (error) {
    console.error('[travaDoP2] reabrir o Valor do Rebanho pelo pasto falhou', error);
    return { ok: false, motivo: FRASE_REABRIR_JUNTO_FALHOU };
  }
  return { ok: true };
}

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
/**
 * BG-SET26-REVALIDAR (Gabriel 08/11 06:40) — QUEM pode revalidar: fazenda (não Global), mês do sistema ao vivo (o Valor do Rebanho do mês
 * ABERTO: `fonteMes === 'live'`) e não futuro. ⚠ A trava de tela do `useMasterLock` NÃO entra: ela dá o mês como somente leitura quando
 * todos os pastos estão fechados e há preço gravado — exatamente o estado de um mês a revalidar (o P1 fechado é condição do revalidar).
 * Com ela, o Revalidar ficava desabilitado para TODOS ("Só quem edita…") no cliente sem master (Vera, BG set/26). Revalidar não edita
 * preço: regrava os mesmos preços com o rebanho de agora (o "Salvar e Fechar"); quem recusa de verdade segue sendo o banco.
 */
export function podeRevalidarOMes(e: { global: boolean; fonteMes: string; mesFuturo: boolean }): boolean {
  return !e.global && e.fonteMes === 'live' && !e.mesFuturo;
}

export function motivoParaRevalidar(e: {
  podeEditar: boolean; pastosOficiais: boolean; semPreco: readonly string[]; anoMes: string;
}): string | null {
  if (!e.podeEditar) return 'Só quem edita o Valor do Rebanho revalida.';
  if (!e.pastosOficiais) return `Feche os pastos de ${mesCurto(e.anoMes)} primeiro.`;
  if (e.semPreco.length > 0) return `Falta o preço de: ${e.semPreco.join(', ')}.`;
  return null;
}
