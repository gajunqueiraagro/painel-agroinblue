/**
 * LOTE-PADRAO-V3 · L2 — qual assistente abre: lote NOVO e lote de categoria FIXA = o v3 (`AssistenteDoLoteV3`); lote de antes (categoria
 * do cliente, `categoriaFixa` nula) = o de sempre (`AssistenteDoLote`), até a limpeza de→para da L6. As mesmas props nos dois.
 */
import { AssistenteDoLote, type PropsDoAssistente } from '@/components/lotes/AssistenteDoLote';
import { AssistenteDoLoteV3 } from '@/components/lotes/AssistenteDoLoteV3';
import { usaV3 } from '@/lib/lotes/assistenteV3';

export function AssistenteDoLotePadrao(props: PropsDoAssistente) {
  return usaV3(props.editar) ? <AssistenteDoLoteV3 {...props} /> : <AssistenteDoLote {...props} />;
}
