/**
 * POPUP-PASTO-01 (Gabriel 04/11 13:24) — o popup do pasto, UM componente só: o mesmo no card do Fechamento Área e no hover do pasto no
 * Geo pastos (mapa). Só DESENHA o que recebe: quem chama passa os dados do mês pela MESMA fonte do Fechamento (os itens do card do mês),
 * nunca uma conta própria.
 *   · cabeçalho em faixa navy (`bg-primary`): nome do pasto, lote e "121 cab · 241,7 kg" (número em negrito);
 *   · o meio claro, em colunas alinhadas: categoria · cab · kg (algarismos tabulares, zero = célula vazia, sem peso = "—");
 *   · rodapé em faixa navy: "Lotação 0,82 UA/ha" com o número grande em negrito.
 * Sem cabeças: só o cabeçalho (lote "—" quando não há) e, se recebe o lote de outro pasto, o rodapé com a origem.
 * POPUP-MINI-01 (Gabriel 08/11 08:18) — o layout e a cor abaixo, mas na METADE do tamanho e FIXO (120px; as medidas no corpo). Antes:
 * POPUP-ORIGINAL-COR (Gabriel 08/11 07:58) — de volta ao original (este arquivo, de 81b1c650): o MESMO layout, as mesmas fontes, a mesma
 * LARGURA FIXA de 220px (igual para todo pasto) e a mesma altura de linha. Muda só a COR: cabeçalho e rodapé em azul mais leve e
 * transparente (rgba(52,96,160,.72)), o meio branco transparente (rgba(255,255,255,.80)), blur leve. Ficam, a pedido: a categoria pelo
 * NOME COMPLETO (Mamotes M, Vacas…, de `categorias_rebanho`) e a linha do LOTE (o mesmo texto do campo Lote do modal; comprido corta só
 * ele, com o texto inteiro no title).
 */
import { formatNum } from '@/lib/calculos/formatters';

/** `nome` = o nome COMPLETO da categoria (Mamotes M, Vacas…), da fonte única `categorias_rebanho`; nunca a sigla */
export interface CategoriaDoPopup { nome: string; cab: number; pesoMedioKg: number | null }

export interface DadosDoPopupDoPasto {
  nome: string;
  /** o lote do mês (o texto do campo Lote do modal); vazio/nulo = "—" */
  lote: string | null;
  totalCab: number;
  pesoMedioKg: number | null;
  categorias: readonly CategoriaDoPopup[];
  /** a lotação do mês (UA/ha); null = sem rodapé */
  uaHa: number | null;
  /** os pastos de onde este recebe o lote no mês (FECH-ROTACAO-01) */
  recebeDe?: readonly string[];
  /** FECH-CARDS-QUEBRA-01: o pasto vedado no mês — sem gado é "0 cab" (zero de verdade), como no card; nos outros, "—" */
  vedado?: boolean;
}

/* as cores (07:58): azul mais leve e transparente nas faixas, o meio branco transparente */
const FAIXA = 'bg-[rgba(52,96,160,0.72)] text-white';
const MEIO = 'bg-[rgba(255,255,255,0.80)] text-slate-900';

export function PopupDoPasto({ d }: { d: DadosDoPopupDoPasto }) {
  const lote = (d.lote ?? '').trim() || '—';
  const comGado = d.totalCab > 0;
  const recebe = d.recebeDe && d.recebeDe.length > 0 ? d.recebeDe.join(', ') : null;
  return (
    /* POPUP-MINI-01 — a metade do original e FIXO: 120px para todo pasto, folga 3px 6px, cantos 6px; a altura é só o conteúdo. A fonte e a
       altura de linha são do popup (Inter): o card não herda as do tooltip do Radix nem o mapa a Helvetica do Leaflet */
    <div className="w-[120px] overflow-hidden rounded-[6px] font-sans text-[8.5px] leading-[11px] backdrop-blur-[3px]" data-testid="popup-do-pasto">
      <div className={`${FAIXA} px-[6px] py-[3px]`} data-testid="popup-do-pasto-cabecalho">
        {/* o nome nunca corta (fora de tabela, nada de "…"): sem lugar ao lado, o "cab · kg" desce para a linha de baixo e o nome longo quebra */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-1">
          <span className="min-w-0 break-words text-[11px] font-bold leading-[13px]" title={d.nome}>{d.nome}</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums text-[8.5px] opacity-90">
            {comGado ? <><b>{formatNum(d.totalCab, 0)}</b> cab</> : d.vedado ? <><b>0</b> cab</> : '—'}
            {comGado && d.pesoMedioKg != null && <> · <b>{formatNum(d.pesoMedioKg, 1)}</b> kg</>}
          </span>
        </div>
        <div className="truncate text-[8px] leading-[10px] opacity-80" title={lote}>Lote {lote}</div>
      </div>
      {comGado && d.categorias.length > 0 && (
        <table className={`w-full table-fixed ${MEIO}`} data-testid="popup-do-pasto-categorias">
          <colgroup><col /><col className="w-[20px]" /><col className="w-[28px]" /></colgroup>
          <thead>
            <tr className="text-[8px] leading-[11px] text-slate-600">
              <th className="pl-[6px] pt-[2px] text-left font-medium">Categoria</th>
              <th className="pt-[2px] text-right font-medium">cab</th>
              <th className="pr-[6px] pt-[2px] text-right font-medium">kg</th>
            </tr>
          </thead>
          <tbody>
            {d.categorias.map((c) => (
              <tr key={c.nome} className="h-[11px] leading-[11px]">
                <td className="whitespace-nowrap pl-[6px]">{c.nome}</td>
                <td className="text-right tabular-nums">{c.cab > 0 ? formatNum(c.cab, 0) : ''}</td>
                <td className="pr-[6px] text-right tabular-nums">{c.pesoMedioKg != null ? formatNum(c.pesoMedioKg, 0) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.uaHa != null && (comGado || recebe) && (
        <div className={`${FAIXA} flex items-baseline justify-between gap-1 px-[6px] py-[3px]`} data-testid="popup-do-pasto-rodape">
          <span className="min-w-0 truncate text-[8.5px] opacity-90" title={recebe ? `Recebe o lote do ${recebe}` : undefined}>
            {recebe && !comGado ? `Recebe o lote do ${recebe}` : 'Lotação'}
          </span>
          <b className="shrink-0 whitespace-nowrap tabular-nums text-[10px]">{formatNum(d.uaHa, 2)} UA/ha</b>
        </div>
      )}
    </div>
  );
}
