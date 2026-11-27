/**
 * FOLHA-01 · PR B (telas) — VER um documento da folha (ficha e Histórico): PDF no Visualizador ÚNICO (`VisualizadorDeDocumento`,
 * VISUALIZADOR-PDF-01); imagem/planilha em aba nova pelo endereço assinado (60 s). Uma peça só para as duas abas.
 */
import { useState, type ReactNode } from 'react';
import { VisualizadorDeDocumento } from '@/components/financeiro-v2/VisualizadorDeDocumento';
import { useFolhaApi } from '@/hooks/useFolha';
import type { ArquivoAberto } from '@/lib/folha/folhaApi';

export function useVerDocumento(onErro: (frase: string) => void): { ver: (bucket: string, caminho: string | null, nome: string) => Promise<void>; visualizador: ReactNode } {
  const api = useFolhaApi();
  const [vendo, setVendo] = useState<ArquivoAberto | null>(null);
  const ver = async (bucket: string, caminho: string | null, nome: string) => {
    if (!caminho) { onErro('Este documento não tem arquivo.'); return; }
    const a = await api.abrirArquivo(bucket, caminho, nome);
    if (!a) { onErro('Não consegui abrir o arquivo.'); return; }
    if (a.ehPdf && a.bytes) setVendo(a); else if (a.url) window.open(a.url, '_blank', 'noopener');
  };
  const bytes = vendo?.bytes ?? null;
  const visualizador = vendo && bytes ? (
    <VisualizadorDeDocumento open onFechar={() => setVendo(null)} bytes={bytes} nome={vendo.nome}
      onNovaAba={() => {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }} />
  ) : null;
  return { ver, visualizador };
}
