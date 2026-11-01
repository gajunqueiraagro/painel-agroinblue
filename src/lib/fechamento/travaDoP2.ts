/* FECH-P2-TRAVA-AVISO-01 (Gabriel 31/10) — o que trava os pastos de um mês e as frases que a tela mostra.
   A regra é a do banco (`_fn_fechamento_p2_travado`): o mês trava com o Valor do Rebanho VALIDADO
   (`valor_rebanho_realizado_validado.status = 'validado'`) OU com o P2 FECHADO (`valor_rebanho_fechamento.status =
   'fechado'`), sempre por fazenda. A tela só lê as duas marcas para avisar ANTES de digitar; quem recusa é o banco. */
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
