/**
 * O modal de negociação de UM lote, num cenário.
 *
 * ⚠ SUBSTITUI o formulário inline da aba (`AbaNegociacaoAbate`), que morreu por
 * substituição — ABATE-UX-01c. O gesto mudou: antes o operador rolava uma coluna com
 * todos os lotes abertos ao mesmo tempo; agora abre o lote que quer negociar e vê só ele.
 *
 * ⚠ AS REGRAS DE UNIDADE VIERAM VERBATIM, e é isso que importa: `ParDeUnidade`,
 * `ParConvertido` e `round2` são os mesmos de `855baf21`, movidos sem uma vírgula de
 * diferença. A unidade vem da ARITMÉTICA da lib, nunca do nome do campo — foi um nome
 * lido como unidade que já custou uma migration.
 *
 * ⚠ TRÊS ABAS E UM RESULTADO FIXO — ABATE-UX-01g. Desempenho, Preço e Bônus mudam à
 * esquerda; a tabela do resultado fica à direita em todas, porque é contra ela que o
 * produtor confere cada número que digita. Sem ela visível, conferir vira ir e voltar.
 *
 * ⚠ PREÇO PELO TOTAL GRAVA `valorBaseOverride`, e é o conserto de um defeito medido:
 * digitar 306.520,00 devolvia 306.520,01. A tela convertia para R$/@, arredondava a duas
 * casas (375,00) e recalculava o total — o centavo nascia do arredondamento do meio. Com
 * a fonte `total`, o total digitado É a base e vai inteiro para `valor_base_override`
 * (coluna que já existia e que a lib já consumia, `abate.ts:123`); `precoArroba` passa a
 * ser derivado com 4 casas, exibido com 2. Com a fonte `arroba`, base = @ × preço e o
 * override volta a `null`.
 *
 * ⚠ O PAR VALOR+FONTE VIROU UM CAMPO E UM TOGGLE — ABATE-UX-01e, e só o DESENHO mudou.
 * Dois campos por bônus davam ~160px de altura cada e empurravam o rodapé para fora da
 * tela; o que se persiste continua sendo `{valor, fonte}`, idêntico. Trocar o toggle com
 * o campo preenchido NÃO converte o número: ele passa a significar a outra unidade, que é
 * o que o par sempre quis dizer — o valor é o que foi digitado NAQUELA unidade.
 *
 * ⚠ O QUE SE GRAVA CONTINUA CANÔNICO: `pesoCarcacaKg` é o TOTAL do lote e `precoArroba`
 * é R$/@, qualquer que tenha sido o lado digitado; a fonte só lembra por onde se entrou.
 * `Aplicar` devolve a linha ao rascunho do pai — quem persiste é o rodapé do shell, na
 * ordem lotes → abate → confirmar.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { X } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { buildAbateCalculation } from '@/lib/calculos/abate';
import { paraCalculo, linhaVazia, type LoteAbate } from '@/components/abate/calculoDoLote';
import { BlocoResumoLote } from '@/components/abate/AbaLotesAbate';
import type { LinhaAbate, CenarioAbate } from '@/hooks/useOperacaoAbate';

/* Duas casas em TODA conversão: é o que faz a ida e volta cabeça↔total fechar. Sem
   isso, 4500 / 18 = 250,00000000000003 volta ao campo e o operador vê o número mudar. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const H = 'h-8 text-xs';
const LBL = 'text-[10px] text-muted-foreground';


/**
 * Traduz a linha gravada para a entrada da lib.
 *
 * ⚠ A FONTE DECIDE EM QUAL CAMPO O VALOR ENTRA, e é só isso que ela faz. `'arroba'`
 * alimenta o campo por-arroba da lib; `'reais'`, o campo de total. Mandar o mesmo número
 * nos dois faria a lib somar duas vezes — ela usa o primeiro que for maior que zero.
 */

/** Peso sempre com duas casas — A15. */
const kg2 = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;



/** Segmentado de unidade. 96px nas linhas grandes, 46px ao lado do campo do par. */
function Toggle({ valor, opcoes, onChange, somenteLeitura, largura = 'w-[96px]', fonte = 'text-[11px]' }: {
  valor: string; opcoes: { v: string; label: string }[];
  onChange: (v: string) => void; somenteLeitura?: boolean; largura?: string; fonte?: string;
}) {
  return (
    <div className={`h-[30px] ${largura} flex shrink-0 overflow-hidden rounded-md border`}>
      {opcoes.map(o => (
        <button key={o.v} type="button" disabled={somenteLeitura} onClick={() => onChange(o.v)}
          className={`flex-1 ${fonte} leading-none ${o.v === valor
            ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A19 + A22: dinheiro alinhado à direita, uma linha só, encolhendo antes de quebrar. */
const CAMPO = 'h-[30px] text-right text-[12px] whitespace-nowrap overflow-hidden min-w-0';

/** Derivado sem card: rótulo à esquerda, valor 14px/600, nada quebra (A22). */
function Derivado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">{rotulo}</span>
      <b className="whitespace-nowrap text-[14px] font-semibold tabular-nums">{valor}</b>
    </>
  );
}

/** Um bônus/desconto: campo + toggle de 46px, com as leituras derivadas embaixo. */
function CampoComUnidade({ rotulo, valor, fonteA, rotuloA, total, arrobas, cabecas, onChange, somenteLeitura, vermelho, subExtra }: {
  rotulo: string;
  valor: { valor: number | null; fonte: string | null };
  fonteA: string; rotuloA: string;
  total: number; arrobas: number; cabecas: number;
  onChange: (v: { valor: number | null; fonte: string | null }) => void;
  somenteLeitura?: boolean; vermelho?: boolean; subExtra?: string | null;
}) {
  const fonte = valor.fonte ?? 'reais';
  const cor = vermelho ? 'text-destructive' : 'text-muted-foreground';
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <Label className={`whitespace-nowrap text-[10px] ${cor}`}>{rotulo}</Label>
      <div className="flex min-w-0 gap-1">
        <CampoMoeda valor={valor.valor} className={`${CAMPO} flex-1`} disabled={somenteLeitura}
          onChange={n => onChange(n == null ? { valor: null, fonte: null } : { valor: n, fonte })} />
        <Toggle largura="w-[46px]" fonte="text-[9px]" valor={fonte} somenteLeitura={somenteLeitura}
          opcoes={[{ v: fonteA, label: rotuloA }, { v: 'reais', label: 'R$' }]}
          onChange={f => onChange({ valor: valor.valor, fonte: valor.valor == null ? null : f })} />
      </div>
      {/* ⚠ UMA LEITURA POR LINHA, e não separadas por ` · `: a coluna tem ~150px e o par
          "R$ 10,29/@ · R$ 205,12/cab" quebraria no meio de um número (A22). */}
      <div className={`text-[10px] leading-[1.3] ${cor}`}>
        {valor.valor == null ? '—' : (<>
          {subExtra && <>{subExtra}<br /></>}
          {formatMoeda(arrobas > 0 ? total / arrobas : 0)}/@<br />
          {formatMoeda(cabecas > 0 ? total / cabecas : 0)}/cab
        </>)}
      </div>
    </div>
  );
}

/** Uma linha da tabela do resultado. `forte` marca Bruto e Líquido. */
function LinhaResultado({ rotulo, total, porArroba, cor, forte }: {
  rotulo: string; total: string; porArroba?: string; cor?: string; forte?: boolean;
}) {
  const base = forte ? 'text-[12px] font-semibold text-foreground' : `text-[11px] ${cor ?? ''}`;
  const celulaAt = forte ? 'text-[11px] font-medium text-foreground' : `text-[10px] ${cor ?? 'text-muted-foreground'}`;
  return (
    <tr className={forte ? 'border-t' : ''}>
      <td className={`whitespace-nowrap px-2.5 py-1 text-left ${forte ? base : `text-[11px] ${cor ?? 'text-muted-foreground'}`}`}>{rotulo}</td>
      <td className={`whitespace-nowrap px-2.5 py-1 text-right tabular-nums ${base}`}>{total}</td>
      <td className={`whitespace-nowrap px-2.5 py-1 text-right tabular-nums ${celulaAt}`}>{porArroba ?? ''}</td>
    </tr>
  );
}

type AbaModal = 'desempenho' | 'preco' | 'bonus';

export function ModalNegociarLote({ lote, linha, cenario, onAplicar, onFechar, somenteLeitura }: {
  lote: LoteAbate;
  linha: LinhaAbate | undefined;
  cenario: CenarioAbate;
  onAplicar: (proxima: LinhaAbate) => void;
  onFechar: () => void;
  somenteLeitura?: boolean;
}) {
  const [aba, setAba] = useState<AbaModal>('desempenho');
  /* ⚠ RASCUNHO LOCAL: o modal edita uma cópia e só devolve no Aplicar. Fechar pelo X ou
     pelo Esc descarta, que é o que "Cancelar" significa — mesmo contrato do LoteDialog. */
  const [atual, setAtual] = useState<LinhaAbate>(linha ?? linhaVazia(lote.id));
  const c = useMemo(() => buildAbateCalculation(paraCalculo(atual, lote)), [atual, lote]);

  /**
   * Aplica a mudança e reescreve os TRÊS derivados persistidos.
   *
   * ⚠ `precoArroba` ENTROU NESSA LISTA. Com a fonte `total`, ele deixa de ser digitado e
   * passa a sair da base sobre as arrobas — e precisa ser recalculado quando a CARCAÇA
   * muda, não só quando o preço muda: mais arrobas pelo mesmo total significam outro
   * R$/@. Quatro casas de propósito; arredondar a duas aqui é exatamente o que criava o
   * centavo de diferença no total.
   */
  const trocar = (patch: Partial<LinhaAbate>) => {
    const proxima = { ...atual, ...patch };
    const calc = buildAbateCalculation(paraCalculo(proxima, lote));
    const arrobas = calc.totalArrobas;
    const precoDerivado = proxima.precoFonte === 'total' && proxima.valorBaseOverride != null && arrobas > 0
      ? Math.round((proxima.valorBaseOverride / arrobas) * 10000) / 10000
      : proxima.precoArroba;
    setAtual({
      ...proxima,
      precoArroba: precoDerivado,
      rendimentoCarcacaPct: calc.rendCalc > 0 ? calc.rendCalc : null,
      valorLiquido: buildAbateCalculation(paraCalculo({ ...proxima, precoArroba: precoDerivado }, lote)).valorLiquido,
    });
  };

  const carcacaPorCab = atual.pesoCarcacaKg != null && lote.quantidade > 0
    ? round2(atual.pesoCarcacaKg / lote.quantidade) : null;
  const fonteCarcaca = atual.pesoCarcacaFonte ?? 'cabeca';
  const fontePreco = atual.precoFonte ?? 'arroba';

  const num = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const porArroba = (v: number) => (c.totalArrobas > 0 ? formatMoeda(v / c.totalArrobas) : '—');
  const neg = (v: number) => (v === 0 ? `− ${formatMoeda(0)}` : `− ${formatMoeda(Math.abs(v))}`);
  const negAt = (v: number) => (c.totalArrobas > 0 ? `− ${formatMoeda(Math.abs(v) / c.totalArrobas)}` : '—');

  const ABAS: { v: AbaModal; label: string }[] = [
    { v: 'desempenho', label: 'Desempenho' },
    { v: 'preco', label: 'Preço' },
    { v: 'bonus', label: 'Bônus, descontos e impostos' },
  ];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="flex h-[400px] max-w-[820px] flex-col p-0 gap-0 overflow-hidden">
        <div className="shrink-0 bg-primary px-4 py-2.5 text-primary-foreground flex items-center gap-3">
          <DialogTitle className="text-[14px] font-semibold">
            Negociar lote · {lote.categoriaLabel} · {lote.quantidade} cab
          </DialogTitle>
          <span className="ml-auto text-[12px] text-white/90">Cenário <b className="capitalize">{cenario}</b></span>
          <button type="button" onClick={onFechar} title="Fechar" aria-label="Fechar"
            className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <DialogDescription className="sr-only">
          Informe carcaça, preço, bônus e descontos deste lote no cenário {cenario}.
        </DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_330px]">
          {/* ── ESQUERDA: as três abas ─────────────────────────────────────── */}
          <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 gap-1 border-b bg-card px-3.5 pt-2">
              {ABAS.map(a => (
                <button key={a.v} type="button" onClick={() => setAba(a.v)}
                  className={`rounded-t-md px-3 py-1.5 text-[12px] font-medium ${
                    aba === a.v ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/50'}`}>
                  {a.label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
              {aba === 'desempenho' && (<>
                <div className="grid grid-cols-[130px_96px] items-end gap-2">
                  <div className="flex flex-col gap-[3px]">
                    <Label className={LBL}>Carcaça</Label>
                    <Input type="number" step="0.01" inputMode="decimal" disabled={somenteLeitura}
                      className={CAMPO}
                      value={(fonteCarcaca === 'cabeca' ? carcacaPorCab : atual.pesoCarcacaKg) ?? ''}
                      onChange={e => {
                        const n = e.target.value === '' ? null : Number(e.target.value);
                        trocar(n == null
                          ? { pesoCarcacaKg: null, pesoCarcacaFonte: null }
                          : {
                            pesoCarcacaKg: fonteCarcaca === 'cabeca' ? round2(n * lote.quantidade) : round2(n),
                            pesoCarcacaFonte: fonteCarcaca === 'cabeca' ? 'cabeca' : 'total',
                          });
                      }} />
                  </div>
                  <div className="flex flex-col gap-[3px]">
                    <Label className={LBL}>&nbsp;</Label>
                    <Toggle valor={fonteCarcaca} somenteLeitura={somenteLeitura}
                      opcoes={[{ v: 'cabeca', label: 'cabeça' }, { v: 'total', label: 'total' }]}
                      onChange={v => trocar({ pesoCarcacaFonte: v === 'total' ? 'total' : 'cabeca' })} />
                  </div>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-[3px]">
                  <Derivado rotulo="Por cabeça" valor={carcacaPorCab == null ? '—' : kg2(carcacaPorCab)} />
                  <Derivado rotulo="@ por cabeça" valor={c.pesoArrobaCab > 0 ? `${num(c.pesoArrobaCab)} @` : '—'} />
                  <Derivado rotulo="Arrobas totais" valor={c.totalArrobas > 0 ? `${c.totalArrobas.toFixed(4)} @` : '—'} />
                  {/* Vem do cadastro do lote; sem ele não há rendimento, e o traço diz isso. */}
                  <Derivado rotulo="Peso vivo" valor={lote.pesoMedioKg > 0 ? `${num(lote.pesoMedioKg)} kg/cab` : '—'} />
                  <Derivado rotulo="Rendimento" valor={c.rendCalc > 0 ? `${num(c.rendCalc)}%` : '—'} />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Inserir o peso total da carcaça ou o peso médio por cabeça, em kg.
                </p>
              </>)}

              {aba === 'preco' && (<>
                <div className="grid grid-cols-[150px_96px] items-end gap-2">
                  <div className="flex flex-col gap-[3px]">
                    <Label className={LBL}>Preço base</Label>
                    <CampoMoeda className={CAMPO} disabled={somenteLeitura}
                      valor={fontePreco === 'total' ? atual.valorBaseOverride : atual.precoArroba}
                      onChange={n => trocar(n == null
                        ? { precoArroba: null, precoFonte: null, valorBaseOverride: null }
                        : fontePreco === 'total'
                          /* O total digitado É a base — nada de voltar por R$/@. */
                          ? { valorBaseOverride: n, precoFonte: 'total' }
                          : { precoArroba: n, precoFonte: 'arroba', valorBaseOverride: null })} />
                  </div>
                  <div className="flex flex-col gap-[3px]">
                    <Label className={LBL}>&nbsp;</Label>
                    <Toggle valor={fontePreco} somenteLeitura={somenteLeitura}
                      opcoes={[{ v: 'arroba', label: 'R$/@' }, { v: 'total', label: 'total' }]}
                      onChange={v => {
                        /* Trocar de lado leva o número consigo: o que estava na tela vira a
                           base, ou a base vira R$/@. Ninguém redigita o que já informou. */
                        if (v === 'total') {
                          trocar({ precoFonte: 'total', valorBaseOverride: c.valorBase > 0 ? c.valorBase : null });
                        } else {
                          trocar({ precoFonte: 'arroba', valorBaseOverride: null });
                        }
                      }} />
                  </div>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-[3px]">
                  <Derivado rotulo="R$/@" valor={c.precoArroba > 0 ? formatMoeda(c.precoArroba) : (c.totalArrobas > 0 && c.valorBase > 0 ? formatMoeda(c.valorBase / c.totalArrobas) : '—')} />
                  <Derivado rotulo="Por cabeça" valor={lote.quantidade > 0 && c.valorBase > 0 ? formatMoeda(c.valorBase / lote.quantidade) : '—'} />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Inserir o preço base total ou o preço médio da arroba.
                </p>
              </>)}

              {aba === 'bonus' && (<>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bônus</div>
                <div className="grid grid-cols-3 gap-2.5">
                  <CampoComUnidade rotulo="Precoce" fonteA="arroba" rotuloA="@" somenteLeitura={somenteLeitura}
                    valor={atual.bonusPrecoce} total={c.bonusPrecoceTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
                    onChange={v => trocar({ bonusPrecoce: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
                  <CampoComUnidade rotulo="Qualidade" fonteA="arroba" rotuloA="@" somenteLeitura={somenteLeitura}
                    valor={atual.bonusQualidade} total={c.bonusQualidadeTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
                    onChange={v => trocar({ bonusQualidade: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
                  <CampoComUnidade rotulo="Lista / trace" fonteA="arroba" rotuloA="@" somenteLeitura={somenteLeitura}
                    valor={atual.bonusListaTrace} total={c.bonusListaTraceTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
                    onChange={v => trocar({ bonusListaTrace: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
                </div>
                {/* ⚠ O TÍTULO FICA CINZA e só o CONTEÚDO é vermelho: um título vermelho lê
                    como alarme, e desconto informado não é erro — é o que foi combinado. */}
                <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Descontos e impostos
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <CampoComUnidade rotulo="Desconto qualidade" fonteA="arroba" rotuloA="@" vermelho somenteLeitura={somenteLeitura}
                    valor={atual.descontoQualidade} total={c.descQualidadeTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
                    onChange={v => trocar({ descontoQualidade: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
                  <CampoComUnidade rotulo="Outros descontos" fonteA="arroba" rotuloA="@" vermelho somenteLeitura={somenteLeitura}
                    valor={atual.outrosDescontos} total={c.descOutrosTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
                    onChange={v => trocar({ outrosDescontos: { valor: v.valor, fonte: v.fonte === 'reais' || v.fonte === 'arroba' ? v.fonte : null } })} />
                  {/* ⚠ O FUNRURAL É PERCENTUAL, não R$/@ — e a sub-linha mostra o percentual
                      efetivo sobre o bruto, que é como ele se confere na nota. */}
                  <CampoComUnidade rotulo="Funrural + SENAR" fonteA="pct" rotuloA="%" vermelho somenteLeitura={somenteLeitura}
                    valor={atual.funrural} total={c.funruralTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
                    subExtra={c.valorBruto > 0 ? `${num((c.funruralTotal / c.valorBruto) * 100)}%` : null}
                    onChange={v => trocar({ funrural: { valor: v.valor, fonte: v.fonte === 'pct' || v.fonte === 'reais' ? v.fonte : null } })} />
                </div>
              </>)}
            </div>
          </div>

          {/* ── DIREITA: o resultado, fixo em todas as abas ─────────────────── */}
          <div className="flex min-h-0 flex-col border-l bg-card">
            <div className="shrink-0 border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wide">
              Resultado do lote
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border-b px-2.5 pb-0.5 pt-1 text-left text-[10px] font-normal text-muted-foreground" />
                    <th className="border-b px-2.5 pb-0.5 pt-1 text-right text-[10px] font-normal text-muted-foreground">Total</th>
                    <th className="border-b px-2.5 pb-0.5 pt-1 text-right text-[10px] font-normal text-muted-foreground">por @</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ⚠ SEM FÓRMULA NO RÓTULO: "Preço base", nunca "Base (817,3867 @ × …)".
                      A fórmula rouba a largura do número, que é o que se confere. */}
                  <LinhaResultado rotulo="Preço base" total={formatMoeda(c.valorBase)} porArroba={porArroba(c.valorBase)} />
                  <LinhaResultado rotulo="(+) Bônus" cor="text-emerald-600"
                    total={formatMoeda(c.totalBonus)} porArroba={porArroba(c.totalBonus)} />
                  <LinhaResultado rotulo="(−) Descontos" cor="text-destructive"
                    total={neg(c.totalDescontos)} porArroba={negAt(c.totalDescontos)} />
                  <LinhaResultado rotulo="Bruto" forte
                    total={formatMoeda(c.valorBruto)} porArroba={porArroba(c.valorBruto)} />
                  <LinhaResultado rotulo="(−) Funrural e impostos" cor="text-destructive"
                    total={neg(c.funruralTotal)} porArroba={negAt(c.funruralTotal)} />
                  <LinhaResultado rotulo="Líquido do lote" forte
                    total={formatMoeda(c.valorLiquido)} porArroba={porArroba(c.valorLiquido)} />
                  <LinhaResultado rotulo="por cabeça"
                    total={lote.quantidade > 0 ? formatMoeda(c.valorLiquido / lote.quantidade) : '—'} />
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 border-t bg-card px-4 py-2">
          <span className="text-[11px] text-muted-foreground">Líquido é derivado e gravado, nunca digitado.</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button type="button" disabled={somenteLeitura}
              onClick={() => { onAplicar(atual); onFechar(); }}>Aplicar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
