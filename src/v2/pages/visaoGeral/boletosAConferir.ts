/**
 * VISAO-GERAL-PENDENCIAS-01 — "Boletos a conferir" da Visão Geral: a MESMA leitura da caixa de boletos (`caixaApiDoBanco.lista`,
 * `fn_boletos_lista`) e o MESMO contador da porta (`contadorDaPorta`: na caixa + sem par). "Chegando" é só da sessão aberta da caixa (nada
 * gravado) e não se conta. Falha na leitura = `null` (a linha não aparece; nunca vira zero).
 */
import { useQuery } from '@tanstack/react-query';
import { caixaApiDoBanco } from '@/lib/financeiro/boleto/caixaApi';
import { contadorDaPorta } from '@/lib/financeiro/boleto/caixaDeBoletos';

export function useBoletosAConferir(clienteId: string | null | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ['vg-boletos-a-conferir', clienteId],
    enabled: !!clienteId,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const r = await caixaApiDoBanco.lista(String(clienteId));
      return r.ok ? contadorDaPorta(r.dados) : null;
    },
  });
  return { aConferir: data ?? null, carregando: isLoading };
}
