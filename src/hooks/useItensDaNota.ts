/**
 * OS ITENS DA NOTA DE UM LANCAMENTO — ITENS-NOTA-01. A nota e' do DOCUMENTO (a chave), nao da parcela: o lancamento acha os itens pela
 * chave dos documentos dele (os ligados as N parcelas inclusive). No lancamento NOVO que nasce de uma nota, os itens sao lidos do proprio
 * arquivo (ainda nao gravados). `null` = sem nota lida -> a aba nao aparece.
 */
import { useEffect, useState } from 'react';
import { chavesGuardadas, lerItensGuardados, notaComItensDoArquivo } from '@/lib/financeiro/itensDaNotaBanco';
import { ehChaveDeNota } from '@/lib/financeiro/nfe/formatos';
import type { CabecalhoDaNota, ItensLidos } from '@/lib/financeiro/nfe/itensDaNota';

export interface NotaComItens { cabecalho: CabecalhoDaNota; lidos: ItensLidos }

export function useItensDaNota({ clienteId, chaves, arquivo }: { clienteId: string | null; chaves: readonly string[]; arquivo: File | null }): NotaComItens | null {
  const [nota, setNota] = useState<NotaComItens | null>(null);
  const chave = chaves.filter(ehChaveDeNota).sort().join(',');
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (arquivo) {
          const lida = await notaComItensDoArquivo(await arquivo.arrayBuffer());
          if (vivo) setNota(lida);
          return;
        }
        if (!clienteId || !chave) { setNota(null); return; }
        const g = await lerItensGuardados(clienteId, chave.split(','));
        if (vivo) setNota(g);
      } catch {
        if (vivo) setNota(null);
      }
    })();
    return () => { vivo = false; };
  }, [clienteId, chave, arquivo]);
  return nota;
}

/** As chaves (das listadas) que ja' tem itens guardados — para a aba Documentos da OC oferecer "Itens da nota". */
export function useChavesComItens(clienteId: string | null | undefined, chaves: readonly (string | null | undefined)[]): ReadonlySet<string> {
  const [com, setCom] = useState<ReadonlySet<string>>(new Set());
  const lista = [...new Set(chaves.filter(ehChaveDeNota))].sort().join(',');
  useEffect(() => {
    let vivo = true;
    if (!clienteId || !lista) { setCom(new Set()); return; }
    void chavesGuardadas(clienteId, lista.split(',')).then((s) => { if (vivo) setCom(s); });
    return () => { vivo = false; };
  }, [clienteId, lista]);
  return com;
}
