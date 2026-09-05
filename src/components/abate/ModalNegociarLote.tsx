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

/**
 * O par bidirecional: uma entrada por unidade, e só a preenchida é gravada.
 *
 * ⚠ O LADO NÃO PREENCHIDO MOSTRA O DERIVADO EM CINZA, e não um campo vazio. Campo vazio
 * ao lado de um preenchido convida a preencher os dois — e aí não há mais fonte única.
 */
function ParDeUnidade({
  rotulo, unidadeA, unidadeB, rotuloA, rotuloB, valor, derivadoA, derivadoB, onChange, somenteLeitura,
}: {
  rotulo: string;
  unidadeA: string; unidadeB: string;
  rotuloA: string; rotuloB: string;
  valor: { valor: number | null; fonte: string | null };
  derivadoA: number; derivadoB: number;
  onChange: (v: { valor: number | null; fonte: string | null }) => void;
  somenteLeitura?: boolean;
}) {
  const ehA = valor.fonte === unidadeA;
  const ehB = valor.fonte === unidadeB;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
      <Label className={LBL}>{rotulo}</Label>
      <div className="w-[120px]">
        <Label className={LBL}>{rotuloA}</Label>
        {ehB ? (
          <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
               title="Derivado do outro lado — não é digitável nem gravado.">
            {formatMoeda(derivadoA)}
          </div>
        ) : (
          <CampoMoeda
            valor={ehA ? valor.valor : null}
            onChange={(n) => onChange(n == null ? { valor: null, fonte: null } : { valor: n, fonte: unidadeA })}
            className={`${H} text-right`}
            disabled={somenteLeitura}
          />
        )}
      </div>
      <div className="w-[130px]">
        <Label className={LBL}>{rotuloB}</Label>
        {ehA ? (
          <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
               title="Derivado do outro lado — não é digitável nem gravado.">
            {formatMoeda(derivadoB)}
          </div>
        ) : (
          <CampoMoeda
            valor={ehB ? valor.valor : null}
            onChange={(n) => onChange(n == null ? { valor: null, fonte: null } : { valor: n, fonte: unidadeB })}
            className={`${H} text-right`}
            disabled={somenteLeitura}
          />
        )}
      </div>
    </div>
  );
}

/**
 * O par CONVERTIDO — carcaça e preço.
 *
 * ⚠ IRMÃO DE `ParDeUnidade`, NÃO O MESMO, e a diferença é o que se grava. Nos bônus o
 * banco guarda o número digitado e a fonte diz em que unidade ele está. Aqui o banco
 * guarda SEMPRE o canônico — `peso_carcaca_kg` é o total do lote, `preco_arroba` é R$/@ —
 * e a fonte só lembra por onde o operador entrou. Por isso os dois lados são calculados
 * a partir do canônico, e digitar em qualquer um deles reescreve o canônico.
 *
 * ⚠ O DESENHO É O MESMO DE PROPÓSITO: mesma grade, mesmas larguras, mesma borda tracejada
 * no lado derivado. Dois padrões visuais para a mesma ideia ensinariam o operador a
 * desconfiar de qual deles vale.
 */
function ParConvertido({ rotulo, ladoA, ladoB, fonte, onDigitar, somenteLeitura }: {
  rotulo: string;
  ladoA: LadoConvertido;
  ladoB: LadoConvertido;
  fonte: string | null;
  onDigitar: (unidade: string, n: number | null) => void;
  somenteLeitura?: boolean;
}) {
  /* Sem fonte gravada, o lado A é o de entrada: linha antiga não sabe por onde foi
     digitada, e supor o outro lado trocaria o número na cara de quem abre a tela. */
  const ativo = fonte === ladoB.unidade ? ladoB.unidade : ladoA.unidade;
  const campo = (lado: LadoConvertido, largura: string) => {
    const ehAtivo = ativo === lado.unidade;
    return (
      <div className={largura}>
        <Label className={LBL}>{lado.rotulo}</Label>
        {!ehAtivo || lado.bloqueio ? (
          <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
               title={lado.bloqueio ?? 'Derivado do outro lado — não é digitável nem gravado.'}>
            {lado.bloqueio ? '—' : lado.moeda ? formatMoeda(lado.valor ?? 0) : kg2(lado.valor)}
          </div>
        ) : lado.moeda ? (
          <CampoMoeda valor={lado.valor} className={`${H} text-right`} disabled={somenteLeitura}
            onChange={n => onDigitar(lado.unidade, n)} />
        ) : (
          <Input type="number" step="0.01" inputMode="decimal" className={`${H} text-right`}
            disabled={somenteLeitura}
            value={lado.valor ?? ''}
            onChange={e => onDigitar(lado.unidade, e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>
    );
  };
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
      <Label className={LBL}>{rotulo}</Label>
      {campo(ladoA, 'w-[120px]')}
      {campo(ladoB, 'w-[130px]')}
    </div>
  );
}

type LadoConvertido = {
  unidade: string;
  rotulo: string;
  valor: number | null;
  moeda?: boolean;
  /** Motivo pelo qual este lado não pode receber número — vira `—` e vai no `title`. */
  bloqueio?: string | null;
};


/** Um derivado travado ao lado do campo — mesmo desenho do lado não preenchido do par. */
function Travado({ rotulo, valor, largura, dica }: {
  rotulo: string; valor: string; largura: string; dica?: string;
}) {
  return (
    <div className={largura}>
      <Label className={LBL}>{rotulo}</Label>
      <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
           title={dica ?? 'Derivado — não é digitável nem gravado.'}>
        {valor}
      </div>
    </div>
  );
}

/** O seletor de unidade: dois lados, o ativo em bg-primary. */
function Toggle({ valor, opcoes, onChange, somenteLeitura }: {
  valor: string; opcoes: { v: string; label: string }[];
  onChange: (v: string) => void; somenteLeitura?: boolean;
}) {
  return (
    <div className={`${H} w-[92px] flex overflow-hidden rounded-md border`}>
      {opcoes.map(o => (
        <button key={o.v} type="button" disabled={somenteLeitura} onClick={() => onChange(o.v)}
          className={`flex-1 text-[11px] ${o.v === valor
            ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** O par de um bônus/desconto, com o derivado por @ e por cabeça sob o campo. */
function LinhaBonus({ rotulo, valor, totalDoBonus, arrobas, cabecas, onChange, unidadeA, rotuloA, somenteLeitura }: {
  rotulo: string; valor: { valor: number | null; fonte: string | null };
  totalDoBonus: number; arrobas: number; cabecas: number;
  onChange: (v: { valor: number | null; fonte: string | null }) => void;
  unidadeA: string; rotuloA: string; somenteLeitura?: boolean;
}) {
  return (
    <div>
      <ParDeUnidade
        rotulo={rotulo} unidadeA={unidadeA} unidadeB="reais" rotuloA={rotuloA} rotuloB="R$ total"
        valor={valor}
        derivadoA={arrobas > 0 ? totalDoBonus / arrobas : 0}
        derivadoB={totalDoBonus}
        onChange={onChange} somenteLeitura={somenteLeitura}
      />
      {/* ⚠ AS DUAS LEITURAS QUE O PRODUTOR USA. O mesmo bônus vira R$/@ para comparar com
          o preço e R$/cab para comparar com o boleto — traço quando não há valor, porque
          zero afirmaria um bônus que ninguém informou. */}
      <div className="mt-0.5 text-right text-[10px] text-muted-foreground tabular-nums">
        {valor.valor == null ? '—' : `${formatMoeda(arrobas > 0 ? totalDoBonus / arrobas : 0)}/@ · ${formatMoeda(cabecas > 0 ? totalDoBonus / cabecas : 0)}/cab`}
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

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-[640px] p-0 gap-0 overflow-hidden">
        <div className="bg-primary px-4 py-2.5 text-primary-foreground flex items-center justify-between">
          {/* ⚠ `DialogTitle` DE VERDADE, não um `div` com cara de título: o Radix o usa
              como nome acessível do diálogo e avisa no console quando falta. A descrição
              fica oculta — ela existe para o leitor de tela, não para a tela. */}
          <DialogTitle className="text-[14px] font-semibold">
            Negociar lote · {lote.categoriaLabel} · {lote.quantidade} cab
          </DialogTitle>
          <DialogDescription className="sr-only">
            Informe carcaça, preço, bônus e descontos deste lote no cenário {cenario}.
          </DialogDescription>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] capitalize">{cenario}</span>
            <button type="button" onClick={onFechar} title="Fechar" aria-label="Fechar"
              className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
          {/* ── CARCAÇA: campo + unidade + os dois derivados, na mesma linha ── */}
          <div className="flex items-end gap-1.5">
            <div className="w-[120px]">
              <Label className={LBL}>Carcaça</Label>
              <Input type="number" step="0.01" inputMode="decimal" disabled={somenteLeitura}
                className={`${H} text-right`}
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
            <Toggle valor={fonteCarcaca} somenteLeitura={somenteLeitura}
              opcoes={[{ v: 'cabeca', label: 'cab' }, { v: 'total', label: 'total' }]}
              onChange={(v) => {
                /* ⚠ TROCAR DE LADO NÃO MUDA O NÚMERO GRAVADO: o canônico continua o total;
                   só muda por qual porta se digita. Converter aqui seria mexer no dado
                   por causa de um clique de leitura. */
                if (atual.pesoCarcacaKg == null) { trocar({ pesoCarcacaFonte: v as 'cabeca' | 'total' }); return; }
                trocar({ pesoCarcacaFonte: v as 'cabeca' | 'total' });
              }} />
            <Travado rotulo="Por cabeça" largura="w-[110px]"
              valor={carcacaPorCab == null ? '—' : `${carcacaPorCab.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`} />
            <Travado rotulo="@ por cabeça" largura="w-[110px]"
              valor={c.pesoArrobaCab > 0 ? c.pesoArrobaCab.toFixed(2) : '—'} />
          </div>

          {/* ⚠ FORA DE CARD e em corpo maior: são os dois números que o produtor confere
              contra o papel do frigorífico antes de aceitar o preço. */}
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div className="text-[15px] font-semibold tabular-nums">
              <span className="mr-1.5 text-[10px] font-normal uppercase text-muted-foreground">Rendimento</span>
              {c.rendCalc > 0 ? `${c.rendCalc.toFixed(2)}%` : '—'}
            </div>
            <div className="text-[15px] font-semibold tabular-nums">
              <span className="mr-1.5 text-[10px] font-normal uppercase text-muted-foreground">Arrobas totais</span>
              {c.totalArrobas > 0 ? `${c.totalArrobas.toFixed(4)} @` : '—'}
            </div>
          </div>

          {/* ── PREÇO ── */}
          <div className="flex items-end gap-1.5">
            <div className="w-[120px]">
              <Label className={LBL}>Preço</Label>
              <CampoMoeda className={`${H} text-right`} disabled={somenteLeitura}
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
            <Toggle valor={fontePreco} somenteLeitura={somenteLeitura}
              opcoes={[{ v: 'arroba', label: 'R$/@' }, { v: 'total', label: 'total' }]}
              onChange={(v) => trocar({ precoFonte: v as 'arroba' | 'total' })} />
            <Travado rotulo="Total do lote" largura="w-[140px]"
              dica={c.totalArrobas > 0 ? undefined : 'Informe a carcaça primeiro — sem ela não há arrobas para converter.'}
              valor={c.totalArrobas > 0 && totalDoLote != null ? formatMoeda(totalDoLote) : '—'} />
          </div>

          {/* ── BÔNUS, DESCONTOS E IMPOSTOS ── */}
          <div className="space-y-2 border-t pt-2">
            <LinhaBonus rotulo="Bônus precoce" unidadeA="arroba" rotuloA="R$/@"
              valor={atual.bonusPrecoce} totalDoBonus={c.bonusPrecoceTotal}
              arrobas={c.totalArrobas} cabecas={lote.quantidade} somenteLeitura={somenteLeitura}
              onChange={v => trocar({ bonusPrecoce: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
            <LinhaBonus rotulo="Bônus qualidade" unidadeA="arroba" rotuloA="R$/@"
              valor={atual.bonusQualidade} totalDoBonus={c.bonusQualidadeTotal}
              arrobas={c.totalArrobas} cabecas={lote.quantidade} somenteLeitura={somenteLeitura}
              onChange={v => trocar({ bonusQualidade: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
            <LinhaBonus rotulo="Bônus lista/trace" unidadeA="arroba" rotuloA="R$/@"
              valor={atual.bonusListaTrace} totalDoBonus={c.bonusListaTraceTotal}
              arrobas={c.totalArrobas} cabecas={lote.quantidade} somenteLeitura={somenteLeitura}
              onChange={v => trocar({ bonusListaTrace: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
            <LinhaBonus rotulo="Desconto qualidade" unidadeA="arroba" rotuloA="R$/@"
              valor={atual.descontoQualidade} totalDoBonus={c.descQualidadeTotal}
              arrobas={c.totalArrobas} cabecas={lote.quantidade} somenteLeitura={somenteLeitura}
              onChange={v => trocar({ descontoQualidade: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })} />
            <LinhaBonus rotulo="Outros descontos" unidadeA="reais" rotuloA="R$ total"
              valor={atual.outrosDescontos} totalDoBonus={c.descOutrosTotal}
              arrobas={c.totalArrobas} cabecas={lote.quantidade} somenteLeitura={somenteLeitura}
              onChange={v => trocar({ outrosDescontos: { valor: v.valor, fonte: v.fonte === 'reais' || v.fonte === 'arroba' ? v.fonte : null } })} />
            {/* ⚠ O FUNRURAL É PERCENTUAL, não R$/@ — vocabulário próprio, e foi ler o nome
                em vez da conta que já custou uma migration. */}
            <ParDeUnidade
              rotulo="Funrural e impostos" unidadeA="pct" unidadeB="reais"
              rotuloA="%" rotuloB="R$ total" valor={atual.funrural}
              derivadoA={c.valorBruto > 0 ? (c.funruralTotal / c.valorBruto) * 100 : 0}
              derivadoB={c.funruralTotal} somenteLeitura={somenteLeitura}
              onChange={v => trocar({ funrural: { valor: v.valor, fonte: v.fonte === 'pct' || v.fonte === 'reais' ? v.fonte : null } })} />
          </div>
        </div>

        {/* ── RODAPÉ: o MESMO bloco-resumo do cartão ── */}
        <div className="border-t bg-card px-4 py-2.5">
          <BlocoResumoLote c={c} />
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button type="button" disabled={somenteLeitura}
              onClick={() => { onAplicar(atual); onFechar(); }}>Aplicar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
