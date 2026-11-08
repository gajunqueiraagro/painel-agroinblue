/**
 * POPUP-PASTO-01 (Gabriel 04/11 13:24) — o popup do pasto, UM componente só: o mesmo no card do Fechamento Área e no hover do pasto no
 * Geo pastos (mapa). Só DESENHA o que recebe: quem chama passa os dados do mês pela MESMA fonte do Fechamento (os itens do card do mês),
 * nunca uma conta própria.
 *   · cabeçalho em faixa navy (`bg-primary`): nome do pasto, lote e "121 cab · 241,7 kg" (número em negrito);
 *   · o meio claro, em colunas alinhadas: categoria · cab · kg (algarismos tabulares, zero = célula vazia, sem peso = "—");
 *   · rodapé em faixa navy: "Lotação 0,82 UA/ha" com o número grande em negrito.
 * Sem cabeças: só o cabeçalho (lote "—" quando não há) e, se recebe o lote de outro pasto, o rodapé com a origem.
 */
import { formatNum } from '@/lib/calculos/formatters';

export interface CategoriaDoPopup { sigla: string; cab: number; pesoMedioKg: number | null }

export interface DadosDoPopupDoPasto {
  nome: string;
  /** o lote do mês; vazio/nulo = "—" */
  lote: string | null;
  totalCab: number;
  pesoMedioKg: number | null;
  categorias: readonly CategoriaDoPopup[];
  /** a lotação do mês (UA/ha); null = sem rodapé */
  uaHa: number | null;
  /** os pastos de onde este recebe o lote no mês (FECH-ROTACAO-01) */
  recebeDe?: readonly string[];
}

const FAIXA = 'bg-primary text-primary-foreground';

export function PopupDoPasto({ d }: { d: DadosDoPopupDoPasto }) {
  const lote = (d.lote ?? '').trim() || '—';
  const comGado = d.totalCab > 0;
  const recebe = d.recebeDe && d.recebeDe.length > 0 ? d.recebeDe.join(', ') : null;
  return (
    <div className="w-[220px] overflow-hidden rounded-md text-[10px]" data-testid="popup-do-pasto">
      <div className={`${FAIXA} px-2 py-1.5`} data-testid="popup-do-pasto-cabecalho">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[12px] font-bold" title={d.nome}>{d.nome}</span>
          <span className="shrink-0 tabular-nums opacity-90">
            {comGado ? <><b className="text-[12px]">{formatNum(d.totalCab, 0)}</b> cab</> : '—'}
            {comGado && d.pesoMedioKg != null && <> · <b className="text-[12px]">{formatNum(d.pesoMedioKg, 1)}</b> kg</>}
          </span>
        </div>
        <div className="truncate opacity-80" title={lote}>Lote {lote}</div>
      </div>
      {comGado && d.categorias.length > 0 && (
        <table className="w-full table-fixed bg-popover text-popover-foreground" data-testid="popup-do-pasto-categorias">
          <colgroup><col /><col className="w-[52px]" /><col className="w-[56px]" /></colgroup>
          <thead>
            <tr className="text-[9px] text-muted-foreground">
              <th className="px-2 pt-1 text-left font-medium">Categoria</th>
              <th className="px-2 pt-1 text-right font-medium">cab</th>
              <th className="px-2 pt-1 text-right font-medium">kg</th>
            </tr>
          </thead>
          <tbody>
            {d.categorias.map((c) => (
              <tr key={c.sigla} className="h-[17px]">
                <td className="px-2">{c.sigla}</td>
                <td className="px-2 text-right tabular-nums">{c.cab > 0 ? formatNum(c.cab, 0) : ''}</td>
                <td className="px-2 text-right tabular-nums">{c.pesoMedioKg != null ? formatNum(c.pesoMedioKg, 0) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.uaHa != null && (comGado || recebe) && (
        <div className={`${FAIXA} flex items-baseline justify-between gap-2 px-2 py-1`} data-testid="popup-do-pasto-rodape">
          <span className="min-w-0 truncate opacity-90" title={recebe ? `Recebe o lote do ${recebe}` : undefined}>
            {recebe && !comGado ? `Recebe o lote do ${recebe}` : 'Lotação'}
          </span>
          <span className="shrink-0 tabular-nums"><b className="text-[14px]">{formatNum(d.uaHa, 2)}</b> UA/ha</span>
        </div>
      )}
    </div>
  );
}
