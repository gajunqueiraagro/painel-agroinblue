import { useCallback, useState, type ReactNode } from 'react';
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';
import type { CategoriaRebanho, Pasto, usePastos } from '@/hooks/usePastos';
import type { FechamentoPasto, useFechamento } from '@/hooks/useFechamento';
import type { useLoteDoMes } from '@/hooks/useLoteDoMes';
import { comAreaDoMes } from '@/lib/pastos/areaDoPastoNoMes';

type AcoesDoCard = Pick<ReturnType<typeof useFechamento>, 'criarFechamento' | 'fecharPasto' | 'copiarMesAnterior'>;

export interface EntradaDoModalDoPasto {
  anoMes: string;
  /** os cards do mês já lidos (sem o card, `abrir` cria pelo mesmo `fn_obter_ou_criar_fechamento_pasto` do Fechamento) */
  fechamentos: readonly FechamentoPasto[];
  categorias: CategoriaRebanho[];
  /** para recusar nome repetido no renomear */
  pastosDaFazenda: readonly Pasto[];
  /** o grupo de pastejo e a área do mês (`useLoteDoMes`): o modal salva com a alocação do grupo e mostra a área DO MÊS */
  lote: Pick<ReturnType<typeof useLoteDoMes>, 'contextoDoLote' | 'areaDe'>;
  acoes: AcoesDoCard;
  editarPasto: ReturnType<typeof usePastos>['editarPasto'];
  /** o modal fechou: quem abriu relê o mês (cards, mapa) — sem F5 */
  aoFechar: () => void;
  /** LOTES-03: o código da fazenda do card (o assistente do lote escreve "na PUR"); sem ele, vazio, como no modal de antes */
  rotuloDaFazenda?: (fazendaId: string) => string;
}

/**
 * MAPA-LOTES-01 fatia 1 (A) — UM jeito de abrir o modal do pasto do P1: o Fechamento, o Mapa de pastos e o Geo pastos montam o
 * MESMO `FechamentoPastoDialog`, com as MESMAS props (o contexto do lote inclusive; a trava P2 se resolve no próprio modal, FECH-REABRIR-JUNTO-01). O modal grava só pelas
 * RPCs do card; o mês fechado se trava pelo próprio modal e pelo banco — quem abre não decide nada.
 */
export function useModalDoPasto(e: EntradaDoModalDoPasto): { abrir: (pasto: Pasto) => Promise<void>; aberto: Pasto | null; modal: ReactNode } {
  const { anoMes, fechamentos, categorias, pastosDaFazenda, lote, acoes, editarPasto, aoFechar, rotuloDaFazenda } = e;
  const [aberto, setAberto] = useState<{ pasto: Pasto; fechamento: FechamentoPasto } | null>(null);

  const abrir = useCallback(async (pasto: Pasto) => {
    const fech = fechamentos.find(f => f.pasto_id === pasto.id) ?? await acoes.criarFechamento(pasto.id, anoMes);
    if (!fech) return;
    /* a área do pasto é a DO MÊS (PASTO-AREA-OFICIAL-02b), venha ele de onde vier */
    setAberto({ pasto: comAreaDoMes([pasto], anoMes, lote.areaDe)[0], fechamento: fech });
  }, [fechamentos, acoes, anoMes, lote.areaDe]);

  const modal = aberto ? (
    <FechamentoPastoDialog
      open
      fazendaRotulo={rotuloDaFazenda?.(aberto.fechamento.fazenda_id) ?? ''}
      onOpenChange={(o) => { if (!o) { setAberto(null); aoFechar(); } }}
      pasto={aberto.pasto}
      fechamento={aberto.fechamento}
      categorias={categorias}
      onFechar={async () => acoes.fecharPasto(aberto.fechamento.id)}
      pastosDaFazenda={pastosDaFazenda}
      onRenomear={async (nome, aoRecusar) => editarPasto(aberto.pasto.id, { nome }, { aoRecusar })}
      onCopiar={async () => acoes.copiarMesAnterior(aberto.pasto.id, anoMes, categorias)}
      lote={lote.contextoDoLote(aberto.pasto, aberto.fechamento.id)}
    />
  ) : null;

  return { abrir, aberto: aberto?.pasto ?? null, modal };
}
