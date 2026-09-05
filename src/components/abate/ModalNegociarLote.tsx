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
import { useState } from 'react';
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


/** O segmentado de unidade. `largura` muda entre a linha grande (92px) e o par (64px). */
function Toggle({ valor, opcoes, onChange, somenteLeitura, largura = 'w-[92px]' }: {
  valor: string; opcoes: { v: string; label: string }[];
  onChange: (v: string) => void; somenteLeitura?: boolean; largura?: string;
}) {
  return (
    <div className={`${H} ${largura} flex shrink-0 overflow-hidden rounded-md border`}>
      {opcoes.map(o => (
        <button key={o.v} type="button" disabled={somenteLeitura} onClick={() => onChange(o.v)}
          className={`flex-1 text-[11px] leading-none ${o.v === valor
            ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Campo derivado: o idioma canônico de travado — fundo muted e borda tracejada. */
function Travado({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div>
      <Label className={LBL}>{rotulo}</Label>
      <div className={`${H} mt-0.5 flex items-center justify-end rounded-md border border-dashed border-border/60 bg-muted px-2 text-[12px] text-muted-foreground tabular-nums`}
           title={dica ?? 'Derivado — não é digitável nem gravado.'}>
        {valor}
      </div>
    </div>
  );
}

/** Título de seção — 11px/500 uppercase, o separador que substitui os cards. */
function Secao({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</div>;
}

/**
 * Um bônus, desconto ou imposto: UM campo, UM toggle e a leitura derivada embaixo.
 *
 * ⚠ AS DUAS LEITURAS SÃO O PONTO. O mesmo valor vira R$/@ para comparar com o preço e
 * R$/cab para comparar com o boleto — traço quando não há valor, porque zero afirmaria
 * um bônus que ninguém informou.
 */
function CampoComUnidade({ rotulo, valor, fonteA, rotuloA, total, arrobas, cabecas, onChange, somenteLeitura }: {
  rotulo: string;
  valor: { valor: number | null; fonte: string | null };
  fonteA: string; rotuloA: string;
  total: number; arrobas: number; cabecas: number;
  onChange: (v: { valor: number | null; fonte: string | null }) => void;
  somenteLeitura?: boolean;
}) {
  const fonte = valor.fonte ?? 'reais';
  return (
    <div className="min-w-0">
      <Label className={LBL}>{rotulo}</Label>
      <div className="mt-0.5 flex gap-1">
        <CampoMoeda valor={valor.valor} className={`${H} min-w-0 flex-1 text-right`} disabled={somenteLeitura}
          onChange={n => onChange(n == null ? { valor: null, fonte: null } : { valor: n, fonte })} />
        <Toggle largura="w-[64px]" valor={fonte} somenteLeitura={somenteLeitura}
          opcoes={[{ v: fonteA, label: rotuloA }, { v: 'reais', label: 'R$' }]}
          onChange={f => onChange({ valor: valor.valor, fonte: valor.valor == null ? null : f })} />
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground tabular-nums">
        {valor.valor == null ? '—'
          : `${formatMoeda(arrobas > 0 ? total / arrobas : 0)}/@ · ${formatMoeda(cabecas > 0 ? total / cabecas : 0)}/cab`}
      </div>
    </div>
  );
}

export function ModalNegociarLote({ lote, linha, cenario, onAplicar, onFechar, somenteLeitura }: {
  lote: LoteAbate;
  linha: LinhaAbate | undefined;
  cenario: CenarioAbate;
  onAplicar: (proxima: LinhaAbate) => void;
  onFechar: () => void;
  somenteLeitura?: boolean;
}) {
  /* ⚠ RASCUNHO LOCAL: o modal edita uma cópia e só devolve no Aplicar. Fechar pelo X ou
     pelo Esc descarta, que é o que "Cancelar" significa — mesmo contrato do LoteDialog. */
  const [atual, setAtual] = useState<LinhaAbate>(linha ?? linhaVazia(lote.id));
  const c = buildAbateCalculation(paraCalculo(atual, lote));

  const trocar = (patch: Partial<LinhaAbate>) => {
    const proxima = { ...atual, ...patch };
    const calc = buildAbateCalculation(paraCalculo(proxima, lote));
    /* Os dois derivados persistidos viajam com toda mudança — mesma regra de sempre. */
    setAtual({
      ...proxima,
      rendimentoCarcacaPct: calc.rendCalc > 0 ? calc.rendCalc : null,
      valorLiquido: calc.valorLiquido,
    });
  };

  const carcacaPorCab = atual.pesoCarcacaKg != null && lote.quantidade > 0
    ? round2(atual.pesoCarcacaKg / lote.quantidade) : null;
  const fonteCarcaca = atual.pesoCarcacaFonte ?? 'cabeca';
  const fontePreco = atual.precoFonte ?? 'arroba';
  const totalDoLote = atual.precoArroba != null ? round2(atual.precoArroba * c.totalArrobas) : null;
  const num = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      {/* ⚠ A21 NO MODAL: altura no container, cabeçalho e rodapé `shrink-0`, só o corpo
          rola. Sem isto o modal cresce com o conteúdo e o rodapé — onde vive o Aplicar —
          sai da tela, que foi exatamente o que a homologação encontrou. */}
      <DialogContent className="flex max-h-[85vh] max-w-[640px] flex-col p-0 gap-0 overflow-hidden">
        <div className="shrink-0 bg-primary px-4 py-2.5 text-primary-foreground flex items-center justify-between">
          <DialogTitle className="text-[14px] font-semibold">
            Negociar lote · {lote.categoriaLabel} · {lote.quantidade} cab
          </DialogTitle>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/80">Cenário <b className="capitalize">{cenario}</b></span>
            <button type="button" onClick={onFechar} title="Fechar" aria-label="Fechar"
              className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <DialogDescription className="sr-only">
          Informe carcaça, preço, bônus e descontos deste lote no cenário {cenario}.
        </DialogDescription>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 px-4 py-3">
          <Secao>Carcaça</Secao>
          <div className="grid grid-cols-[120px_92px_110px_110px] items-end gap-2">
            <div>
              <Label className={LBL}>Carcaça</Label>
              <Input type="number" step="0.01" inputMode="decimal" disabled={somenteLeitura}
                className={`${H} mt-0.5 text-right`}
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
            <div>
              <Label className={LBL}>&nbsp;</Label>
              <div className="mt-0.5">
                <Toggle valor={fonteCarcaca} somenteLeitura={somenteLeitura}
                  opcoes={[{ v: 'cabeca', label: 'cabeça' }, { v: 'total', label: 'total' }]}
                  onChange={v => trocar({ pesoCarcacaFonte: v === 'total' ? 'total' : 'cabeca' })} />
              </div>
            </div>
            <Travado rotulo="Por cabeça" valor={carcacaPorCab == null ? '—' : kg2(carcacaPorCab)} />
            <Travado rotulo="@ por cabeça" valor={c.pesoArrobaCab > 0 ? `${num(c.pesoArrobaCab)} @` : '—'} />
          </div>

          {/* ⚠ FORA DE CARD: são os dois números que o produtor confere contra o papel do
              frigorífico antes de aceitar o preço. */}
          <div className="flex gap-7 px-0.5">
            <span><span className="text-[10px] text-muted-foreground">Rendimento </span>
              <b className="text-[15px] font-semibold tabular-nums">{c.rendCalc > 0 ? `${num(c.rendCalc)}%` : '—'}</b></span>
            <span><span className="text-[10px] text-muted-foreground">Arrobas totais </span>
              <b className="text-[15px] font-semibold tabular-nums">{c.totalArrobas > 0 ? `${c.totalArrobas.toFixed(4)} @` : '—'}</b></span>
          </div>

          <Secao>Preço</Secao>
          <div className="grid grid-cols-[120px_92px_140px] items-end gap-2">
            <div>
              <Label className={LBL}>Preço</Label>
              <CampoMoeda className={`${H} mt-0.5 text-right`} disabled={somenteLeitura}
                valor={fontePreco === 'arroba' ? atual.precoArroba : totalDoLote}
                onChange={n => trocar(n == null
                  ? { precoArroba: null, precoFonte: null }
                  : {
                    precoArroba: fontePreco === 'total'
                      ? (c.totalArrobas > 0 ? round2(n / c.totalArrobas) : null)
                      : round2(n),
                    precoFonte: fontePreco === 'total' ? 'total' : 'arroba',
                  })} />
            </div>
            <div>
              <Label className={LBL}>&nbsp;</Label>
              <div className="mt-0.5">
                <Toggle valor={fontePreco} somenteLeitura={somenteLeitura}
                  opcoes={[{ v: 'arroba', label: 'R$/@' }, { v: 'total', label: 'total' }]}
                  onChange={v => trocar({ precoFonte: v === 'total' ? 'total' : 'arroba' })} />
              </div>
            </div>
            <Travado rotulo="Total do lote"
              dica={c.totalArrobas > 0 ? undefined : 'Informe a carcaça primeiro'}
              valor={c.totalArrobas > 0 && totalDoLote != null ? formatMoeda(totalDoLote) : '—'} />
          </div>

          <Secao>Bônus (valores totais do lote)</Secao>
          <div className="grid grid-cols-3 gap-3">
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

          <Secao>Descontos e impostos</Secao>
          <div className="grid grid-cols-3 gap-3">
            <CampoComUnidade rotulo="Desconto qualidade" fonteA="arroba" rotuloA="@" somenteLeitura={somenteLeitura}
              valor={atual.descontoQualidade} total={c.descQualidadeTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
              onChange={v => trocar({ descontoQualidade: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
            <CampoComUnidade rotulo="Outros descontos" fonteA="arroba" rotuloA="@" somenteLeitura={somenteLeitura}
              valor={atual.outrosDescontos} total={c.descOutrosTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
              onChange={v => trocar({ outrosDescontos: { valor: v.valor, fonte: v.fonte === 'reais' || v.fonte === 'arroba' ? v.fonte : null } })} />
            {/* ⚠ O FUNRURAL É PERCENTUAL, não R$/@ — vocabulário próprio, e foi ler o nome
                em vez da conta que já custou uma migration. */}
            <CampoComUnidade rotulo="Funrural + SENAR" fonteA="pct" rotuloA="%" somenteLeitura={somenteLeitura}
              valor={atual.funrural} total={c.funruralTotal} arrobas={c.totalArrobas} cabecas={lote.quantidade}
              onChange={v => trocar({ funrural: { valor: v.valor, fonte: v.fonte === 'pct' || v.fonte === 'reais' ? v.fonte : null } })} />
          </div>

          <BlocoResumoLote c={c} />
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 border-t bg-card px-4 py-2.5">
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
