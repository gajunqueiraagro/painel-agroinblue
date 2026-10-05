import * as React from 'react';
import { aceitarArquivo, type RegraDeAceite, type VereditoDoArquivo } from '@/lib/arquivo/aceitarArquivo';

/**
 * O GESTO DE SOLTAR ARQUIVO — UMA implementação, para a `AreaDeArquivo` e para a linha que é alvo (UI-ARRASTAR-ARQUIVO-01b).
 *
 * ⚠ NENHUMA TELA ESCREVE `onDrop`/`dataTransfer` POR CONTA PRÓPRIA: quem precisa receber arquivo arrastado usa a
 *   `AreaDeArquivo` ou, quando o alvo não é uma área (uma linha de tabela), espalha os `alvo` deste hook no elemento. Fora
 *   daqui só a proteção global (`protegerSoltarFora`) fala de arrastar — preso por teste de fonte.
 * ⚠ SÓ ARQUIVO: `dataTransfer.types` tem de conter "Files"; texto, link ou linha arrastada não acendem nem são tratados.
 * ⚠ O REALCE NÃO PISCA: `dragenter`/`dragleave` disparam a cada filho do alvo, então conta-se entradas e saídas.
 * ⚠ QUEM JULGA É O DONO (`aceitarArquivo`). Modo "um": recusa devolve o motivo e NÃO chama o destino. Modo "lote": entrega
 *   todos, com o veredito de cada um.
 */
const temArquivo = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export interface OpcoesDeSoltar {
  regra: RegraDeAceite;
  modo?: 'um' | 'lote';
  desabilitado?: boolean;
  /** "um": só os aceitos. "lote": todos (os originais), com o veredito de cada um. */
  onArquivos: (arquivos: File[], porArquivo: VereditoDoArquivo[]) => void;
}

export function useSoltarArquivo({ regra, modo = 'um', desabilitado = false, onArquivos }: OpcoesDeSoltar) {
  const entradas = React.useRef(0);
  const [sobre, setSobre] = React.useState(false);
  const [recusa, setRecusa] = React.useState<string | null>(null);

  /** O arquivo escolhido (seletor) e o solto passam pelo MESMO julgamento. */
  const receber = (lista: ArrayLike<File> | null | undefined) => {
    if (desabilitado || !lista || lista.length === 0) return;
    const aceite = aceitarArquivo(lista, regra);
    if (modo === 'lote') {
      setRecusa(null);
      /* em lote, o que o operador entregou — cada veredito leva o arquivo que segue adiante (`arquivo`) e o `original` */
      onArquivos(aceite.porArquivo.map(v => v.original), aceite.porArquivo);
      return;
    }
    if (aceite.ok === false) { setRecusa(aceite.motivo); return; }
    setRecusa(null);
    onArquivos(aceite.arquivos, aceite.porArquivo);
  };

  const alvo = {
    onDragEnter: (e: React.DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      if (desabilitado) return;
      entradas.current += 1;
      setSobre(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = desabilitado ? 'none' : 'copy';
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!temArquivo(e) || desabilitado) return;
      entradas.current = Math.max(0, entradas.current - 1);
      if (entradas.current === 0) setSobre(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      entradas.current = 0;
      setSobre(false);
      receber(e.dataTransfer.files);
    },
  };

  return { sobre, recusa, limparRecusa: () => setRecusa(null), receber, alvo };
}
