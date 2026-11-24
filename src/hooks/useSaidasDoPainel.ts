/**
 * CONC-PAINEL-02 (Gabriel 23/11 17:11, NJ BB out/26) — NAV-VOLTA-ORIGEM-01 NO PAINEL DA CONTA: todo botão que SAI do painel volta para ele
 * (a mesma conta e o mesmo mês, o passo de onde saiu, a mesma rolagem). Era: "Conferência lado a lado" FECHAVA o painel e trocava a aba; ao
 * fechar a Conferência o operador caía na aba "Casar lançamentos".
 * A peça é a da casa (`useCamadas`): o painel é a camada de baixo e NUNCA desmonta enquanto outra está por cima.
 *   · Conferência lado a lado → a camada 'conferencia' sobre 'painel' (o modal da Conferência mora na aba Casar: a vista vai para lá por
 *     baixo do painel e VOLTA para a de origem quando a Conferência fecha);
 *   · Importar banco → 'importar' sobre 'painel': a prévia é a aba Importar, então o painel se ESCONDE (montado, com o passo) e volta pelo
 *     "← voltar ao painel da conta";
 *   · ✎ Informar o saldo → 'saldo' sobre 'painel' (o `SaldoRealDialog` abre por cima; fechar = o painel de novo).
 *   (O lote do mês e o "Ver os lançamentos do mês" já abrem POR CIMA do painel, dentro dele.)
 * ⚠ NÃO É A CAMADA DE PASSAGEM: a passagem fecha junto só quando a de cima volta 'salvou'; aqui a volta é ao painel nos dois casos (fechou ou
 *   salvou) — a aba de baixo não é camada, é só onde o modal mora, e a vista de origem é restaurada.
 */
import { useCallback, useRef, useState } from 'react';
import { useCamadas } from '@/components/ui/camadas';

export type CamadaDaConciliacao = 'painel' | 'conferencia' | 'importar' | 'saldo';
export type VistaDaConciliacao = 'importar' | 'enriquecer_sistema' | 'enriquecer' | 'gerencial' | 'conciliacao';

export function useSaidasDoPainel(o: {
  vista: VistaDaConciliacao;
  irParaVista: (v: VistaDaConciliacao) => void;
  escolherConta: (contaId: string) => void;
  abrirConferencia: () => void;
}) {
  const camadas = useCamadas<CamadaDaConciliacao>();
  const [contaId, setContaId] = useState<string | null>(null);
  const vistaDeOrigem = useRef<VistaDaConciliacao>('conciliacao');
  const atual = useRef(o);
  atual.current = o;

  const abrirPainel = useCallback((id: string) => { setContaId(id); camadas.abrir('painel'); }, [camadas]);
  const fecharPainel = useCallback(() => { setContaId(null); camadas.fechar('painel'); }, [camadas]);
  const sair = useCallback((camada: Exclude<CamadaDaConciliacao, 'painel'>, vista: VistaDaConciliacao | null) => {
    vistaDeOrigem.current = atual.current.vista;
    camadas.abrir(camada, 'painel');
    if (vista) atual.current.irParaVista(vista);
  }, [camadas]);
  const conferencia = useCallback((id: string) => { atual.current.escolherConta(id); atual.current.abrirConferencia(); sair('conferencia', 'enriquecer_sistema'); }, [sair]);
  const importar = useCallback((id: string) => { atual.current.escolherConta(id); sair('importar', 'importar'); }, [sair]);
  const saldo = useCallback(() => sair('saldo', null), [sair]);
  /** a camada de cima fechou: volta ao painel (e à vista de onde ele foi aberto). Não estava aberta = `false` (nada muda). */
  const voltar = useCallback((camada: Exclude<CamadaDaConciliacao, 'painel'>): boolean => {
    if (!camadas.aberta(camada)) return false;
    camadas.fechar(camada);
    if (camada !== 'saldo') atual.current.irParaVista(vistaDeOrigem.current);
    return true;
  }, [camadas]);

  return {
    contaId, aberto: contaId !== null,
    /** a aba Importar está na frente: o painel fica montado e escondido */
    escondido: contaId !== null && camadas.aberta('importar'),
    vindoDoPainel: (c: Exclude<CamadaDaConciliacao, 'painel'>) => camadas.aberta(c),
    abrirPainel, fecharPainel, trocarConta: setContaId, conferencia, importar, saldo, voltar,
  };
}
