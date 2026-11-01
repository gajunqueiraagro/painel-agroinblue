/**
 * MAPA-ATIVIDADE-LAVOURA-01 — os registros de LAVOURA dos pastos da fazenda (`agri_safra_area` ativos + a safra de `financeiro_safras`),
 * só leitura, uma ida por fazenda. A escolha da safra do mês é a lib (`lavouraDoPastoNoMes`, D4).
 * ⚠ RLS por tenant: a leitura filtra pelo cliente (`cliente_id`) e pela fazenda (pelo pasto). Leitura que chega depois de a fazenda
 * mudar não escreve (OC-ABRIR-LENTO-01). Erro não vai a toast: fica em `erro`, e a lavoura vira "não consegui ler", nunca "sem lavoura".
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RegistroDeLavoura } from '@/lib/mapa/lavouraDoMes';

function texto(v: unknown): string | null { return typeof v === 'string' ? v : null; }
function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function lerRegistrosDeLavoura(dado: unknown): RegistroDeLavoura[] {
  if (!Array.isArray(dado)) return [];
  return dado.flatMap(l => {
    if (typeof l !== 'object' || l === null) return [];
    const pasto = texto(Reflect.get(l, 'pasto_id')); const safraId = texto(Reflect.get(l, 'safra_id'));
    if (!pasto || !safraId) return [];
    const s = Reflect.get(l, 'safra');
    const daSafra = (k: string) => (typeof s === 'object' && s !== null ? texto(Reflect.get(s, k)) : null);
    return [{
      pasto_id: pasto, safra_id: safraId,
      cultura: texto(Reflect.get(l, 'cultura')), variedade: texto(Reflect.get(l, 'variedade')),
      area_plantada_ha: numero(Reflect.get(l, 'area_plantada_ha')),
      data_plantio: texto(Reflect.get(l, 'data_plantio')), data_colheita_prevista: texto(Reflect.get(l, 'data_colheita_prevista')),
      data_colheita_real: texto(Reflect.get(l, 'data_colheita_real')), status: texto(Reflect.get(l, 'status')),
      safra_nome: daSafra('nome'), safra_inicio: daSafra('data_inicio'), safra_fim: daSafra('data_fim'),
    }];
  });
}

export function useLavouraDaFazenda(fazendaId: string | undefined, clienteId: string | null | undefined) {
  const [lidos, setLidos] = useState<{ chave: string; registros: RegistroDeLavoura[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const chave = `${fazendaId ?? ''}|${clienteId ?? ''}`;

  useEffect(() => {
    if (!fazendaId || !clienteId) { setLidos(null); return; }
    let vivo = true;
    setErro(null);
    (async () => {
      const { data, error } = await supabase
        .from('agri_safra_area')
        .select('pasto_id, safra_id, cultura, variedade, area_plantada_ha, data_plantio, data_colheita_prevista, data_colheita_real, status, safra:financeiro_safras(nome, data_inicio, data_fim), pasto:pastos!inner(fazenda_id)')
        .eq('cliente_id', clienteId)
        .eq('pasto.fazenda_id', fazendaId)
        .eq('ativo', true);
      if (!vivo) return;
      if (error) {
        console.error('[useLavouraDaFazenda]', error);
        setErro('Não consegui ler a lavoura da fazenda.');
        setLidos(null);
        return;
      }
      setLidos({ chave, registros: lerRegistrosDeLavoura(data) });
    })();
    return () => { vivo = false; };
  }, [fazendaId, clienteId, chave]);

  const atual = lidos && lidos.chave === chave ? lidos.registros : null;
  /* sem fazenda/cliente a leitura não acontece: dizer, em vez de "lendo" para sempre */
  return { registros: atual ?? [], lido: atual != null, erro: !fazendaId || !clienteId ? 'A lavoura não está disponível nesta vista.' : erro };
}
