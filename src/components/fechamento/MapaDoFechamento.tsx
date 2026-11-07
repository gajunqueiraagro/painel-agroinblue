/**
 * MAPA-LOTES-01 (C2) — a vista "Mapa" do Fechamento de pastos: o mapa da fazenda com cada pasto do mês pintado pela situação do card
 * (a MESMA `getPastoStatus` da grade, recebida pronta) e o clique que abre o MESMO modal do card (`onAbrir` = `useModalDoPasto.abrir`).
 * Pasto do mês sem polígono vai para a faixa "Sem desenho no mapa": cada nome abre o card dele.
 * ⚠ A geometria só se lê com esta vista na tela (o componente só monta no modo Mapa): a grade de Cards não paga a leitura.
 * ⚠ O quadro tem ALTURA (até o fim da janela, `useAlturaAteOFim`): a faixa dos sem desenho tem 24px reservados, com ou sem nome.
 */
import { useMemo } from 'react';
import { usePastoGeometrias } from '@/hooks/usePastoGeometrias';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { MapaDosPastos } from '@/components/mapa-geo/MapaDosPastos';
import {
  COR_DA_SITUACAO, NOME_DA_SITUACAO, ORDEM_DA_LEGENDA, pastosSemDesenho, type SituacaoDoCard,
} from '@/lib/fechamento/vistaDoFechamento';

interface PastoDoMapa { id: string; nome: string }

interface Props<P extends PastoDoMapa> {
  pastos: readonly P[];
  situacaoDe: (pasto: P) => SituacaoDoCard;
  cabecasDe: (pasto: P) => number;
  onAbrir: (pasto: P) => void;
}

const LEGENDA = ORDEM_DA_LEGENDA.map(s => ({ cor: COR_DA_SITUACAO[s], texto: NOME_DA_SITUACAO[s] }));

export function MapaDoFechamento<P extends PastoDoMapa>({ pastos, situacaoDe, cabecasDe, onAbrir }: Props<P>) {
  const { geometrias, loading } = usePastoGeometrias();
  const quadro = useAlturaAteOFim({ folga: 16, minimo: 320 });
  const porId = useMemo(() => new Map(pastos.map(p => [p.id, p])), [pastos]);
  const ids = useMemo(() => new Set(porId.keys()), [porId]);
  const semDesenho = useMemo(() => pastosSemDesenho(pastos, geometrias), [pastos, geometrias]);
  const corDe = useMemo(() => (id: string) => {
    const p = porId.get(id);
    return p ? COR_DA_SITUACAO[situacaoDe(p)] : '#C9CED6';
  }, [porId, situacaoDe]);
  const dicaDe = useMemo(() => (id: string) => {
    const p = porId.get(id);
    if (!p) return '';
    const cab = cabecasDe(p);
    return `${p.nome} · ${cab > 0 ? `${cab} cab.` : 'sem cabeças'} · ${NOME_DA_SITUACAO[situacaoDe(p)]}`;
  }, [porId, cabecasDe, situacaoDe]);
  const abrirPorId = (id: string) => { const p = porId.get(id); if (p) onAbrir(p); };

  return (
    <div ref={quadro.ref} style={{ height: quadro.altura }} className="flex min-h-[320px] flex-col gap-1" data-testid="vista-mapa">
      <div className="flex h-6 flex-none items-center gap-1 overflow-x-auto whitespace-nowrap text-[10px]" data-testid="faixa-sem-desenho">
        {semDesenho.length > 0 && (
          <>
            <span className="flex-none font-semibold text-muted-foreground">Sem desenho no mapa ({semDesenho.length}):</span>
            {semDesenho.map(p => (
              <button key={p.id} type="button" onClick={() => onAbrir(p)} title={`Abrir o card de ${p.nome}`}
                className="h-5 flex-none rounded border px-1.5 font-medium hover:bg-muted">
                {p.nome}
              </button>
            ))}
          </>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {!loading && geometrias.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded border border-dashed text-[11px] text-muted-foreground">
            Esta fazenda ainda não tem o mapa importado (Geo pastos).
          </div>
        ) : (
          <MapaDosPastos geometrias={geometrias} pastoIds={ids} corDe={corDe} dicaDe={dicaDe} onPastoClick={abrirPorId} legenda={LEGENDA} />
        )}
      </div>
    </div>
  );
}
