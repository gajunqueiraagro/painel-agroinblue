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

/**
 * Ajuste 12 (Gabriel 29/10 14:13) — a aba Itens da nota JÁ LANÇADA abre UMA vez, na versão final: os itens GUARDADOS pela chave (o XML manda sobre o
 * PDF) e, sem eles, os do PRÓPRIO arquivo (PDF ou XML). `carregando` = ainda não respondeu (a tela mostra o esqueleto da versão final, nunca a simples).
 */
export function useItensDaNotaDaTela({ clienteId, chave, arquivo }: { clienteId: string | null; chave: string | null; arquivo: File | null }): {
  nota: NotaComItens | null; carregando: boolean;
} {
  const [estado, setEstado] = useState<{ nota: NotaComItens | null; carregando: boolean }>({ nota: null, carregando: true });
  const chaveValida = chave && /^\d{44}$/.test(chave) ? chave : null;
  useEffect(() => {
    let vivo = true;
    setEstado({ nota: null, carregando: true });
    (async () => {
      try {
        const guardada = clienteId && chaveValida ? await lerItensGuardados(clienteId, [chaveValida]) : null;
        if (guardada) { if (vivo) setEstado({ nota: guardada, carregando: false }); return; }
        const doArquivo = arquivo ? await notaComItensDoArquivo(await arquivo.arrayBuffer()) : null;
        if (vivo) setEstado({ nota: doArquivo, carregando: false });
      } catch (e) {
        console.error('[useItensDaNotaDaTela]', e);
        if (vivo) setEstado({ nota: null, carregando: false });
      }
    })();
    return () => { vivo = false; };
  }, [clienteId, chaveValida, arquivo]);
  return estado;
}
