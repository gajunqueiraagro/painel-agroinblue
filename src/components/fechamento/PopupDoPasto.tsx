/**
 * POPUP-PASTO-01 (Gabriel 04/11 13:24) — o popup do pasto, UM componente só: o mesmo no card do Fechamento Área e no hover do pasto no
 * mapa. Só DESENHA o que recebe: quem chama passa os dados do mês pela MESMA fonte do Fechamento (os itens do card do mês), nunca uma
 * conta própria.
 * FECH-BARRA-HOVER-01 (Gabriel 07/11 17:44, mock docs/mocks/fech-barra-hover.html):
 *   · cabeçalho: o nome do pasto GRANDE (18px) e a área do mês à direita ("34,8 ha");
 *   · o meio, em colunas alinhadas: categoria · cab · kg (algarismos tabulares, zero = célula vazia, sem peso = "—");
 *   · rodapé: "27 cab · 290,0 kg" (total e peso médio) à esquerda e "0,50 UA/ha" à direita;
 *   · sai a linha do lote; cabeçalho e rodapé em azul leve e transparente, meio branco transparente, blur leve; 200px.
 * Adendo (Gabriel 07/11 18:00, "escurecer não… transparente"): a categoria pelo NOME COMPLETO (nada corta; 220px); as MESMAS cores do mock
 * com a opacidade a 0,55 (azul e branco) e blur de 6px — o pasto e os cards aparecem por trás, o texto segue legível.
 * Sem cabeças: só o cabeçalho; se recebe o lote de outro pasto (FECH-ROTACAO-01), o rodapé diz a origem.
 */
import { formatNum } from '@/lib/calculos/formatters';

/** `nome` = o nome COMPLETO da categoria (Mamotes M, Novilhas…), da fonte única `categorias_rebanho`; nunca a sigla */
export interface CategoriaDoPopup { nome: string; cab: number; pesoMedioKg: number | null }

export interface DadosDoPopupDoPasto {
  nome: string;
  /** a área do mês (ha); nula = "— ha" */
  areaHa: number | null;
  totalCab: number;
  pesoMedioKg: number | null;
  categorias: readonly CategoriaDoPopup[];
  /** a lotação do mês (UA/ha); nula = "— UA/ha" */
  uaHa: number | null;
  /** os pastos de onde este recebe o lote no mês (FECH-ROTACAO-01) */
  recebeDe?: readonly string[];
}

/* as cores do mock, mais transparentes: azul rgba(52,96,160,.55) e branco a 55% */
const FAIXA = 'bg-[rgba(52,96,160,0.55)] text-white';
const MEIO = 'bg-white/55 text-slate-900';

export function PopupDoPasto({ d }: { d: DadosDoPopupDoPasto }) {
  const comGado = d.totalCab > 0;
  const recebe = d.recebeDe && d.recebeDe.length > 0 ? d.recebeDe.join(', ') : null;
  const ua = <span className="shrink-0 tabular-nums"><b className="text-[13px]">{d.uaHa != null ? formatNum(d.uaHa, 2) : '—'}</b> UA/ha</span>;
  return (
    <div className="w-[220px] overflow-hidden rounded-lg text-[10px] shadow-[0_6px_18px_rgba(15,23,42,0.22)] backdrop-blur-[6px]"
      data-testid="popup-do-pasto">
      <div className={`${FAIXA} flex items-baseline gap-2 px-2 py-1`} data-testid="popup-do-pasto-cabecalho">
        <span className="min-w-0 flex-1 truncate text-[18px] font-bold leading-6" title={d.nome}>{d.nome}</span>
        <span className="shrink-0 tabular-nums text-[11px]">{d.areaHa != null ? formatNum(d.areaHa, 1) : '—'} ha</span>
      </div>
      {comGado && d.categorias.length > 0 && (
        <table className={`w-full table-fixed ${MEIO}`} data-testid="popup-do-pasto-categorias">
          <colgroup><col /><col className="w-[44px]" /><col className="w-[48px]" /></colgroup>
          <thead>
            <tr className="text-[9.5px] text-slate-600">
              <th className="px-2 pt-1 text-left font-medium">Categoria</th>
              <th className="px-2 pt-1 text-right font-medium">cab</th>
              <th className="px-2 pt-1 text-right font-medium">kg</th>
            </tr>
          </thead>
          <tbody>
            {d.categorias.map((c) => (
              <tr key={c.nome} className="h-[17px] text-[11px]">
                <td className="whitespace-nowrap px-2">{c.nome}</td>
                <td className="px-2 text-right tabular-nums">{c.cab > 0 ? formatNum(c.cab, 0) : ''}</td>
                <td className="px-2 text-right tabular-nums">{c.pesoMedioKg != null ? formatNum(c.pesoMedioKg, 0) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {comGado ? (
        <div className={`${FAIXA} flex items-baseline gap-2 px-2 py-1 text-[11px]`} data-testid="popup-do-pasto-rodape">
          <span className="min-w-0 flex-1 tabular-nums">
            <b>{formatNum(d.totalCab, 0)}</b> cab · <b>{d.pesoMedioKg != null ? formatNum(d.pesoMedioKg, 1) : '—'}</b> kg
          </span>
          {ua}
        </div>
      ) : recebe && d.uaHa != null ? (
        <div className={`${FAIXA} flex items-baseline gap-2 px-2 py-1 text-[11px]`} data-testid="popup-do-pasto-rodape">
          <span className="min-w-0 flex-1 truncate" title={`Recebe o lote do ${recebe}`}>Recebe o lote do {recebe}</span>
          {ua}
        </div>
      ) : null}
    </div>
  );
}
