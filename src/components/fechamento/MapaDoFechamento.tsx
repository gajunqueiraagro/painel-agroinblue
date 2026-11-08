/**
 * MAPA-LOTES-01 (C2) — a vista "Mapa" do Fechamento de pastos: o mapa da fazenda com cada pasto do mês pintado pela situação do card
 * (a MESMA `getPastoStatus` da grade, recebida pronta) e o clique que abre o MESMO modal do card (`onAbrir` = `useModalDoPasto.abrir`).
 * Pasto do mês sem polígono vai para a faixa "Sem desenho no mapa": cada nome abre o card dele.
 * ⚠ A geometria só se lê com esta vista na tela (o componente só monta no modo Mapa): a grade de Cards não paga a leitura.
 * ⚠ O quadro tem ALTURA (até o fim da janela, `useAlturaAteOFim`): a faixa dos sem desenho tem 24px reservados, com ou sem nome.
 * FECH-TOPO-02 (Gabriel 07/11 17:52): a linha de 24px começa pelo seletor "Cards | Mapa" (`seletor`, o mesmo lugar da vista Cards) e a
 * dica do pasto é o MESMO popup dos cards (`PopupDoPasto`, com os dados de `popupDe` = a mesma conta do card). Adendo 2 (18:03): o
 * rótulo no pasto igual ao do Geo (a mesma camada): o nome e, embaixo, "55 cab" (sem cabeças, só o nome).
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PopupDoPasto, type DadosDoPopupDoPasto } from '@/components/fechamento/PopupDoPasto';
import { formatNum } from '@/lib/calculos/formatters';
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
  /** os dados do popup do pasto: a MESMA conta do card do mês */
  popupDe: (pasto: P) => DadosDoPopupDoPasto;
  onAbrir: (pasto: P) => void;
  /** FECH-PASTO-UNIDADE-01 — piquete → pai: o polígono do piquete pinta e abre o card do PAI (o piquete não tem card) */
  paiDe?: ReadonlyMap<string, string>;
  /** o seletor "Cards | Mapa", no começo da linha de 24px */
  seletor?: ReactNode;
}

const LEGENDA = ORDEM_DA_LEGENDA.map(s => ({ cor: COR_DA_SITUACAO[s], texto: NOME_DA_SITUACAO[s] }));
/* a caixa da dica do Leaflet sem fundo, borda, folga nem seta: quem desenha é o popup */
const CLASSE_DA_DICA = '!rounded-lg !border-0 !bg-transparent !p-0 !shadow-none before:!hidden';

export function MapaDoFechamento<P extends PastoDoMapa>({ pastos, situacaoDe, popupDe, onAbrir, paiDe, seletor }: Props<P>) {
  const { geometrias: lidas, loading } = usePastoGeometrias();
  const geometrias = useMemo(
    () => (paiDe && paiDe.size > 0 ? lidas.map(g => { const pai = g.pasto_id ? paiDe.get(g.pasto_id) : undefined; return pai ? { ...g, pasto_id: pai } : g; }) : lidas),
    [lidas, paiDe],
  );
  const quadro = useAlturaAteOFim({ folga: 16, minimo: 320 });
  const porId = useMemo(() => new Map(pastos.map(p => [p.id, p])), [pastos]);
  const ids = useMemo(() => new Set(porId.keys()), [porId]);
  const semDesenho = useMemo(() => pastosSemDesenho(pastos, geometrias), [pastos, geometrias]);
  const corDe = useMemo(() => (id: string) => {
    const p = porId.get(id);
    return p ? COR_DA_SITUACAO[situacaoDe(p)] : '#C9CED6';
  }, [porId, situacaoDe]);
  /* ⚠ `popupDe` chega nova a cada render do Fechamento: a dica e o rótulo seguem a ASSINATURA dos dados (o mapa só se redesenha quando
     o que ele mostra muda; sem isso, todo render da tela limpava e refazia os polígonos, a dica e os rótulos) */
  const popupRef = useRef(popupDe);
  popupRef.current = popupDe;
  const assinatura = pastos.map(p => JSON.stringify(popupDe(p))).join('|');
  const dicaDe = useMemo(() => (id: string) => {
    const p = porId.get(id);
    if (!p) return '';
    return renderToStaticMarkup(<PopupDoPasto d={popupRef.current(p)} />);
  }, [porId, assinatura]);
  const rotuloDe = useMemo(() => (id: string) => {
    const p = porId.get(id);
    if (!p) return null;
    const cab = popupRef.current(p).totalCab;
    return { nome: p.nome, sub: cab > 0 ? `${formatNum(cab, 0)} cab` : '' };
  }, [porId, assinatura]);
  const abrirPorId = (id: string) => { const p = porId.get(id); if (p) onAbrir(p); };

  return (
    <div ref={quadro.ref} style={{ height: quadro.altura }} className="flex min-h-[320px] flex-col gap-1" data-testid="vista-mapa">
      <div className="flex h-6 flex-none items-center gap-2" data-testid="linha-da-vista">
      {seletor}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-[10px]" data-testid="faixa-sem-desenho">
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
      </div>
      <div className="min-h-0 flex-1">
        {!loading && geometrias.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded border border-dashed text-[11px] text-muted-foreground">
            Esta fazenda ainda não tem o mapa importado (Geo pastos).
          </div>
        ) : (
          <MapaDosPastos geometrias={geometrias} pastoIds={ids} corDe={corDe} dicaDe={dicaDe} classeDaDica={CLASSE_DA_DICA}
            rotuloDe={rotuloDe} onPastoClick={abrirPorId} legenda={LEGENDA} />
        )}
      </div>
    </div>
  );
}
