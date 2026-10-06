/**
 * GRADE DE PARCELAS — "Igual todo mês" × "Parcelas livres" (PARC-LIVRES-01, Gabriel 06/10/2026).
 *
 * UMA grade para os três lugares: o Novo lançamento parcelado, a tela de Parcelamentos e (passo 2) o Editar obrigação.
 * ⚠ A GRADE NÃO SOMA E NÃO DECIDE: N, soma, valor da compra e diferença vêm de `resumoDasParcelas`; o que trava o Salvar vem
 *   de `motivoNaoSalva` (o hospedeiro lê a MESMA função); cada gesto é uma função pura de `parcelasLivres.ts`.
 * ⚠ O SISTEMA NÃO ESCOLHE COMO FECHAR A DIFERENÇA: ele a escreve e oferece os DOIS gestos — pôr na última parcela, ou a
 *   compra passar a valer a soma.
 * ⚠ LAYOUT FIXO: altura do bloco declarada pelo hospedeiro (`altura`); só a lista rola, com o cabeçalho preso nela; o rodapé
 *   de totais e a faixa de aviso (18px, sempre presente) ficam fora da rolagem. Uma linha por parcela, 19px; data e valor
 *   nunca cortam.
 */
import { useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Segmentado } from '@/components/ui/segmentado';
import { DatePicker } from '@/components/ui/date-picker';
import { COR_SINAL } from '@/lib/oc/contaCorrente';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { FRASE_DA_CONTA, calcularConta, contaOk, ehConta } from '@/lib/calculos/contaNoCampo';
import {
  acrescentarParcela, brCentavos, deOndeVeio, editarValor, editarVencimento, fraseSomaNaoFecha, houveEdicao,
  indiceQueRecebeADiferenca, motivoDaPaga, mudancaDaParcela, porDiferencaNaUltima, resumoDasParcelas, retirarParcela,
  type ParcelaLivre,
} from '@/lib/financiamentos/parcelasLivres';

export type ModoDasParcelas = 'mensal' | 'livres';

/** A régua, em px (a coluna "De onde veio" fica com o resto). */
export const REGUA_PARCELAS = { numero: 30, vencimento: 104, valor: 112, tirar: 22 } as const;

const TH = 'sticky top-0 z-[2] h-[18px] whitespace-nowrap bg-primary px-1.5 py-0 text-[9.5px] font-medium text-primary-foreground';
const TD = 'h-[19px] border-b border-border px-1.5 py-0 text-[10px] leading-none align-middle';
const CAMPO = 'h-[17px] rounded-[3px] text-[10px]';
const AMBAR = 'border-amber-400 bg-amber-50';
const dataBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');

/**
 * O VALOR DA PARCELA: texto livre enquanto digita; ao sair (ou Enter) vira centavos. Aceita a conta direto no campo
 * ("110000-33000", "12.833,33*6") pelo dono da conta (`contaNoCampo.ts`) — guarda-se só o resultado.
 */
function CampoValorDaParcela({ valorCent, onValor, ambar, rotulo }: {
  valorCent: number; onValor: (cent: number) => void; ambar: boolean; rotulo: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const aplicar = () => {
    if (texto === null) return;
    const t = texto.trim();
    if (t === '') { setTexto(null); setRecusa(null); onValor(0); return; }
    if (ehConta(t)) {
      const r = calcularConta(t);
      if (contaOk(r)) { onValor(Math.round(r.valor * 100)); setTexto(null); setRecusa(null); }
      else if (r.ok === false) { setRecusa(FRASE_DA_CONTA[r.motivo]); setTexto(null); }
      return;
    }
    const n = parseMoeda(t);
    if (n === null || !(n >= 0)) { setRecusa('valor inválido'); setTexto(null); return; }
    onValor(Math.round(n * 100)); setTexto(null); setRecusa(null);
  };
  return (
    <input type="text" inputMode="decimal" aria-label={rotulo} data-testid="valor-da-parcela"
      value={texto ?? (valorCent > 0 ? brCentavos(valorCent) : '')}
      placeholder="0,00" title={recusa ?? undefined} aria-invalid={recusa ? true : undefined}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => { setTexto(e.target.value); setRecusa(null); }}
      onBlur={aplicar}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicar(); } }}
      className={`${CAMPO} w-full border px-1 text-right tabular-nums outline-none focus:ring-1 focus:ring-primary ${
        recusa ? 'border-destructive' : ambar ? AMBAR : 'border-input bg-background'}`} />
  );
}

/** Valor com sinal e cor na diferença: "0,00 ✓" verde; ▲ a soma passa da compra; ▼ a soma não chega. */
function Diferenca({ cent }: { cent: number }) {
  if (cent === 0) return <span className="font-semibold tabular-nums text-success" data-testid="diferenca" data-fecha="sim">0,00 ✓</span>;
  return (
    <span className={`font-semibold tabular-nums whitespace-nowrap ${COR_SINAL.neg}`} data-testid="diferenca" data-fecha="nao">
      {cent > 0 ? '▲' : '▼'}&nbsp;{cent > 0 ? '' : '−'}{brCentavos(Math.abs(cent))}
    </span>
  );
}

export interface GradeDeParcelasProps {
  modo: ModoDasParcelas;
  /** Trocar de modo. O hospedeiro monta a lista de partida das livres (e a devolve ao mensal). Ausente = sem seletor (passo 2). */
  onModo?: (m: ModoDasParcelas) => void;
  /** As parcelas da tela: no mensal, a prévia (só leitura); nas livres, a lista editável. */
  parcelas: readonly ParcelaLivre[];
  onParcelas: (p: ParcelaLivre[]) => void;
  /** O valor contra o qual a soma fecha, em centavos. */
  compraCent: number;
  /** "a compra" / "o contrato" — entra na frase e no rótulo do rodapé. */
  oQue?: { frase: string; rotulo: string; passaAValer: string };
  /** "A compra vale {soma}": o hospedeiro troca o valor total. Ausente = o gesto fica apagado com o motivo. */
  onCompraVale?: (somaCent: number) => void;
  /** O ponto de partida das livres (as duplicatas da nota, as parcelas gravadas): habilita o "voltar". */
  base?: readonly ParcelaLivre[] | null;
  rotuloVoltar?: string;
  /** A frase que explica de onde a lista veio (ex.: a da nota), escrita na faixa de aviso quando a soma fecha. */
  recado?: string | null;
  /** Altura FIXA do bloco: px, ou uma expressão CSS presa à janela (nunca ao conteúdo). */
  altura?: number | string;
  travado?: boolean;
  /** Colunas a mais, à direita de "De onde veio" (nota fiscal, boleto): cabeçalho e célula por número de parcela. */
  extras?: { titulo: string; largura: number; celula: (numero: number) => ReactNode; rodape?: ReactNode }[];
}

const PADRAO = { frase: 'a compra', rotulo: 'Valor da compra', passaAValer: 'A compra vale' };

export function GradeDeParcelas({
  modo, onModo, parcelas, onParcelas, compraCent, oQue = PADRAO, onCompraVale, base = null, rotuloVoltar = 'Voltar às duplicatas da nota',
  recado = null, altura = 236, travado = false, extras = [],
}: GradeDeParcelasProps) {
  const [perguntaVoltarAoMensal, setPerguntaVoltarAoMensal] = useState(false);
  const livres = modo === 'livres';
  const r = resumoDasParcelas(parcelas, compraCent);
  const editada = livres && !!base && houveEdicao(parcelas, base);
  const iUltima = indiceQueRecebeADiferenca(parcelas);
  const comDiferenca = porDiferencaNaUltima(parcelas, compraCent);

  const pedirModo = (m: ModoDasParcelas) => {
    if (!onModo || m === modo) return;
    /* voltar ao "Igual todo mês" joga fora o que foi editado: pergunta ANTES, na linha */
    if (m === 'mensal' && (editada || (!base && parcelas.length > 0 && parcelas.some((p) => p.origem === 'nova' || mudancaDaParcela(p).valor || mudancaDaParcela(p).vencimento)))) {
      setPerguntaVoltarAoMensal(true); return;
    }
    onModo(m);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded border border-border bg-background" style={{ height: altura }} data-testid="grade-de-parcelas" data-modo={modo}>
      {/* barra: o modo e os gestos de lista — 26px, fora da rolagem */}
      <div className="flex h-[26px] shrink-0 items-center gap-2 border-b border-border px-1.5">
        {onModo && (
          <Segmentado<ModoDasParcelas> altura={22} valor={modo} onEscolher={pedirModo}
            opcoes={[{ valor: 'mensal', rotulo: 'Igual todo mês' }, { valor: 'livres', rotulo: 'Parcelas livres' }]} />
        )}
        {perguntaVoltarAoMensal ? (
          <span className="flex min-w-0 items-center gap-2 text-[10px]" data-testid="pergunta-voltar-ao-mensal">
            <span className="min-w-0 truncate font-medium text-amber-700" title="Voltar para Igual todo mês? As edições das parcelas se perdem.">
              Voltar para Igual todo mês? As edições se perdem.
            </span>
            <button type="button" className="shrink-0 font-semibold text-primary underline underline-offset-2" data-testid="voltar-ao-mensal-sim"
              onClick={() => { setPerguntaVoltarAoMensal(false); onModo?.('mensal'); }}>Sim</button>
            <button type="button" className="shrink-0 text-muted-foreground underline underline-offset-2" data-testid="voltar-ao-mensal-nao"
              onClick={() => setPerguntaVoltarAoMensal(false)}>Não</button>
          </span>
        ) : <span className="min-w-0 flex-1" />}
        {livres && !travado && base && (
          <button type="button" disabled={!editada} onClick={() => onParcelas([...base])}
            title={editada ? 'Desfaz as edições desta lista' : 'Nada foi editado'}
            className="shrink-0 whitespace-nowrap text-[10px] text-primary underline underline-offset-2 disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
            data-testid="voltar-a-base">{rotuloVoltar}</button>
        )}
        {livres && !travado && (
          <button type="button" onClick={() => onParcelas(acrescentarParcela(parcelas))}
            className="inline-flex h-[20px] shrink-0 items-center gap-0.5 whitespace-nowrap rounded border border-border px-1.5 text-[10px] hover:bg-muted"
            data-testid="mais-parcela"><Plus className="h-3 w-3" aria-hidden /> Parcela</button>
        )}
      </div>

      {/* a lista — o único scrollport; o cabeçalho gruda nela */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" data-testid="lista-de-parcelas">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: REGUA_PARCELAS.numero }} />
            <col style={{ width: REGUA_PARCELAS.vencimento }} />
            <col style={{ width: REGUA_PARCELAS.valor }} />
            <col />
            {extras.map((x) => <col key={x.titulo} style={{ width: x.largura }} />)}
            <col style={{ width: REGUA_PARCELAS.tirar }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${TH} text-center`}>#</th>
              <th className={`${TH} text-center`}>Vencimento</th>
              <th className={`${TH} text-right`}>Valor (R$)</th>
              <th className={`${TH} text-left`}>De onde veio</th>
              {extras.map((x) => <th key={x.titulo} className={`${TH} text-center`}>{x.titulo}</th>)}
              <th className={TH} aria-label="Tirar" />
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p, i) => {
              const m = mudancaDaParcela(p);
              const paga = motivoDaPaga(p);
              const editavel = livres && !travado && !p.paga;
              const veio = deOndeVeio(p);
              return (
                <tr key={p.chave} className={p.paga ? 'opacity-50' : i % 2 === 1 ? 'bg-muted/30' : ''} title={paga ?? undefined}
                    data-testid="linha-da-parcela" data-paga={p.paga ? 'sim' : undefined}>
                  <td className={`${TD} text-center tabular-nums`}>{i + 1}</td>
                  <td className={`${TD} text-center whitespace-nowrap tabular-nums`} data-testid="cel-vencimento">
                    {editavel
                      ? <DatePicker size="compact" value={p.vencimento} onChange={(v) => onParcelas(editarVencimento(parcelas, p.chave, v))}
                          className={`${CAMPO} pl-1 pr-5 ${m.vencimento ? AMBAR : ''}`} />
                      : dataBR(p.vencimento)}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap tabular-nums`} data-testid="cel-valor">
                    {editavel
                      ? <CampoValorDaParcela valorCent={p.valorCent} ambar={m.valor} rotulo={`Valor da parcela ${i + 1}`}
                          onValor={(c) => onParcelas(editarValor(parcelas, p.chave, c))} />
                      : brCentavos(p.valorCent)}
                  </td>
                  <td className={`${TD} overflow-hidden text-ellipsis whitespace-nowrap ${m.valor || m.vencimento ? 'text-amber-700' : 'text-muted-foreground'}`}
                      title={veio} data-testid="cel-de-onde-veio">{veio}</td>
                  {extras.map((x) => <td key={x.titulo} className={`${TD} text-center`}>{x.celula(i + 1)}</td>)}
                  <td className={`${TD} px-0 text-center`}>
                    {editavel && (
                      <button type="button" aria-label={`Tirar a parcela ${i + 1}`} title="Tirar esta parcela"
                        onClick={() => onParcelas(retirarParcela(parcelas, p.chave))}
                        className="text-muted-foreground hover:text-destructive" data-testid="tirar-parcela"><X className="h-3 w-3" /></button>
                    )}
                  </td>
                </tr>
              );
            })}
            {parcelas.length === 0 && (
              <tr><td colSpan={5 + extras.length} className={`${TD} text-muted-foreground`}>Nenhuma parcela.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* rodapé de totais — congelado, em tabela */}
      <table className="w-full shrink-0 border-collapse border-t-2 border-[#9aa7b6] bg-[#E8E6DF] text-[10px]" style={{ tableLayout: 'fixed' }} data-testid="rodape-de-parcelas">
        <tbody>
          <tr className="h-[20px]">
            <td className="px-1.5 font-bold whitespace-nowrap" data-testid="rodape-n">{r.n} {r.n === 1 ? 'parcela' : 'parcelas'}</td>
            <td className="px-1.5 text-right whitespace-nowrap"><span className="text-muted-foreground">Soma das parcelas&nbsp;</span><span className="font-bold tabular-nums" data-testid="rodape-soma">{brCentavos(r.somaCent)}</span></td>
            <td className="px-1.5 text-right whitespace-nowrap"><span className="text-muted-foreground">{oQue.rotulo}&nbsp;</span><span className="font-bold tabular-nums" data-testid="rodape-compra">{brCentavos(r.compraCent)}</span></td>
            <td className="px-1.5 text-right whitespace-nowrap"><span className="text-muted-foreground">Diferença&nbsp;</span><Diferenca cent={r.diferencaCent} /></td>
          </tr>
        </tbody>
      </table>

      {/* a faixa de aviso — 18px, SEMPRE presente: a soma que não fecha, com os DOIS gestos; senão, o recado */}
      <div className="flex h-[18px] shrink-0 items-center gap-2 px-1.5 text-[10px]" data-testid="aviso-de-parcelas">
        {r.diferencaCent !== 0 && parcelas.length > 0 ? (
          <>
            <span className="min-w-0 truncate font-medium text-destructive" title={fraseSomaNaoFecha(oQue.frase)} data-testid="frase-nao-fecha">{fraseSomaNaoFecha(oQue.frase)}</span>
            {livres && !travado && (
              <>
                <button type="button" disabled={!comDiferenca}
                  title={comDiferenca ? undefined : iUltima < 0 ? 'não há parcela em aberto para receber a diferença' : 'a parcela ficaria zerada ou negativa'}
                  onClick={() => { if (comDiferenca) onParcelas(comDiferenca); }}
                  className="shrink-0 whitespace-nowrap text-primary underline underline-offset-2 disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
                  data-testid="por-na-ultima">
                  Pôr {r.diferencaCent > 0 ? '−' : '+'}{brCentavos(Math.abs(r.diferencaCent))} na parcela {iUltima >= 0 ? iUltima + 1 : '—'}
                </button>
                <button type="button" disabled={!onCompraVale || !(r.somaCent > 0)}
                  title={onCompraVale ? undefined : 'o valor total não se altera por aqui'}
                  onClick={() => onCompraVale?.(r.somaCent)}
                  className="shrink-0 whitespace-nowrap text-primary underline underline-offset-2 disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
                  data-testid="compra-vale">
                  {oQue.passaAValer} {brCentavos(r.somaCent)}
                </button>
              </>
            )}
          </>
        ) : recado ? <span className="min-w-0 truncate text-amber-800" title={recado} data-testid="recado-de-parcelas">{recado}</span> : null}
      </div>
    </div>
  );
}
