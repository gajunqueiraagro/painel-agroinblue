/**
 * O MODAL DE UMA CARGA DE COLHEITA — AGRI-COLHEITA-MODAL-04.
 *
 * ⚠ CASCA REUSADA, NÃO ESCRITA: `LancamentoModalEnvelope` é a casca padrão da casa (faixa
 * azul, data e fazenda no topo, resumo lateral à direita, rodapé de ação), já usada por
 * Nascimento, Morte, Abate, Venda e Compra-meta. O `CompraModalShell` — o "shell da OC" que o
 * briefing citou — NÃO serve: são setenta props de compra de gado (categoria, fornecedor,
 * lotes, liquidação, eventos), a tela inteira e não um envelope.
 * ⚠ O ENVELOPE JÁ RESERVA A ALTURA DA FAIXA DE ABAS (`69vh + 38px`, com o comentário dizendo
 * que é "a faixa de abas que esta tela não tem"). Aqui ela existe, e por isso o modal fecha
 * exatamente na altura da Compra.
 * ⚠ O TOGGLE kg ↔ sc É SÓ DE ENTRADA. O banco guarda quilo sempre; deixar a saca virar peso
 * daria à mesma carga dois números de origem — o da balança e o da conversão — sem jeito de
 * saber qual está no papel.
 */
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { CampoNumero, CampoMoeda } from '@/components/ui/campo-moeda';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { LancamentoModalEnvelope } from '@/components/lancamento/LancamentoModalEnvelope';
import {
  LIMITE_AFLATOXINA, faixaAflatoxina, sacasDoPeso, pesoDasSacas, quebraKg, unidadeDaCultura,
  type CargaForm,
} from '@/lib/agri/colheita';

/** As duas unidades em que o operador pode digitar um peso. */
type Unidade = 'kg' | 'sc';

/**
 * ⚠ FOCO FINO, SEM O HALO DE 4px. O `Input` da casa traz `ring-2` com `ring-offset-2`: dois
 * pixels de anel mais dois de folga, um halo azul grosso que num formulário de treze campos
 * densos vira a coisa mais visível da tela. A COR continua a do sistema (`ring-ring`) — o que
 * muda é a espessura, e só aqui dentro.
 */
const FOCO = 'focus-visible:ring-1 focus-visible:ring-offset-0 focus:ring-1 focus:ring-offset-0';

/* ⚠ O MESMO PARSER DA REGRA (`parseMoeda`): o resumo lateral tem de ler "26.560" igual ao
   validador, senão a lateral mostra 26,56 enquanto a gravação salva 26.560. */
const num = (t: string): number | null => (t.trim() ? parseMoeda(t) : null);
const comoTexto = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));

/**
 * ⚠ `numerico` NÃO É SÓ ALINHAMENTO: ele troca o `<Input>` cru pelo `CampoNumero`, que formata
 * em pt-BR ao sair do campo e usa o parser que sabe distinguir milhar de decimal. Era um
 * `<Input>` com `inputMode="decimal"` — o teclado certo e o parse errado.
 */
function Campo({ rotulo, valor, onChange, numerico, casas = 2, obrigatorio, dica, tipo }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  numerico?: boolean; casas?: number; obrigatorio?: boolean; dica?: string; tipo?: string;
}) {
  return (
    <div>
      <Label className="text-[10px]">
        {rotulo}{obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      {numerico ? (
        <CampoNumero valor={valor} onChange={onChange} casas={casas} title={dica}
          className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
      ) : (
        <Input value={valor} onChange={e => onChange(e.target.value)} title={dica} type={tipo}
          className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
      )}
    </div>
  );
}

/**
 * Um peso que se digita em quilo OU em saca.
 *
 * ⚠ O VALOR DO FORM É SEMPRE O QUILO. O toggle converte o que está na caixa ao trocar de
 * unidade, para o número na tela continuar querendo dizer a mesma coisa — trocar de unidade
 * não é apagar o que se digitou.
 */
function CampoPeso({ rotulo, valorKg, onChangeKg, cultura, dica }: {
  rotulo: string; valorKg: string; onChangeKg: (kg: string) => void;
  cultura: string; dica?: string;
}) {
  const [unidade, setUnidade] = useState<Unidade>('kg');
  const temSaca = unidadeDaCultura(cultura).kgPorSaca != null;
  const emSaca = unidade === 'sc' && temSaca;

  /* O que a caixa mostra: o quilo cru, ou ele convertido em saca. */
  const visivel = emSaca ? comoTexto(sacasDoPeso(num(valorKg), cultura)) : valorKg;

  const digitou = (v: string) => {
    if (!emSaca) { onChangeKg(v); return; }
    onChangeKg(comoTexto(pesoDasSacas(num(v), cultura)));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-1">
        <Label className="text-[10px]">{rotulo}</Label>
        {temSaca && (
          <div className="inline-flex overflow-hidden rounded border">
            {(['kg', 'sc'] as const).map(u => (
              <button key={u} type="button" onClick={() => setUnidade(u)}
                title={u === 'kg' ? 'Digitar em quilos' : `Digitar em sacas de ${unidadeDaCultura(cultura).kgPorSaca} kg`}
                className={cn('px-1.5 py-0.5 text-[9px] font-medium transition-colors',
                  unidade === u ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                {u}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* ⚠ A CHAVE É A UNIDADE: trocar de kg para sc refaz o texto a partir do quilo guardado,
          e sem `key` o `CampoNumero` manteria na tela o número da unidade anterior. */}
      <CampoNumero key={unidade} valor={visivel} onChange={digitou} casas={2} title={dica}
        className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
      {/* A outra unidade fica escrita embaixo: conferir o romaneio não deve exigir trocar o toggle. */}
      <div className="mt-0.5 text-right text-[9px] text-muted-foreground">
        {emSaca
          ? (valorKg.trim() ? `${formatNum(num(valorKg) ?? 0, 2)} kg` : '—')
          : (temSaca && valorKg.trim() ? `${formatNum(sacasDoPeso(num(valorKg), cultura) ?? 0, 2)} sc` : ' ')}
      </div>
    </div>
  );
}

/**
 * Um número que a tela CALCULA — moldura tracejada, sem caixa de digitação.
 *
 * ⚠ A BORDA TRACEJADA É O AVISO de que aquilo não se digita: um campo derivado com cara de
 * `<input>` convida a corrigir o que o sistema deduziu, e a correção não teria onde ser
 * gravada — nem a quebra de secagem nem a de transporte têm coluna no banco.
 */
function Derivado({ rotulo, valor, cor }: { rotulo: string; valor: number | null; cor?: string }) {
  return (
    <div>
      <Label className="text-[10px]">{rotulo}</Label>
      <div className={cn('mt-0.5 flex h-8 items-center justify-end rounded-md border border-dashed',
        'bg-muted/30 px-2 font-mono text-[12px] tabular-nums',
        valor == null ? 'text-muted-foreground' : cor)}>
        {valor != null ? formatNum(valor, 2) : '—'}
      </div>
    </div>
  );
}

/** Um par rótulo–valor do resumo lateral, no idioma do `ResumoLateralOC`. */
function Par({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    /* ⚠ `py-0.5`: com `py-1` os dezesseis pares não cabiam e a Renda líquida ficava cortada
       embaixo — o resumo lateral não rola, ele cabe. */
    <div className="flex items-baseline justify-between gap-2 px-3 py-0.5">
      <span className="text-[10px] text-muted-foreground">{rotulo}</span>
      <span className={cn('tabular-nums', forte ? 'text-[12px] font-bold text-foreground' : 'text-[11px] text-foreground')}>
        {valor}
      </span>
    </div>
  );
}

export function CargaModal({
  aberto, form, cultura, talhaoRotulo, safraRotulo, fazendaNome, salvando,
  areas, areaId, onAreaChange, onChange, onFechar, onSalvar,
}: {
  aberto: boolean;
  /** `null` quando não há carga aberta — o modal não monta. */
  form: CargaForm | null;
  cultura: string;
  talhaoRotulo: string;
  /** O código da safra — ela amarra o lançamento, e o cabeçalho tem de dizê-la. */
  safraRotulo: string;
  fazendaNome: string | null;
  salvando: boolean;
  /**
   * AS ÁREAS ENTRE AS QUAIS A CARGA PODE ANDAR — PR-TALHAO-NO-MODAL-12.
   *
   * ⚠ SÓ AS DA CULTURA CORRENTE, e é decisão de produto: `safra_area_id` amarra safra, cultura
   * e talhão numa FK só, então mover a carga para outra cultura mudaria o que ela é — e o
   * rateio de área, a produtividade e a classificação junto. Corrigir o talhão é rotina;
   * trocar a cultura é outro gesto, e ele não deve caber num dropdown de correção.
   */
  areas: readonly { id: string; pastoNome: string; area_plantada_ha: number }[];
  /** `''` quando ainda não se escolheu — em "Todos os talhões" a carga nova começa assim. */
  areaId: string;
  onAreaChange: (id: string) => void;
  onChange: (campo: keyof CargaForm, valor: string) => void;
  onFechar: () => void;
  onSalvar: () => void;
}) {
  if (!form) return null;

  const verde = num(form.pesoVerdeKg);
  const seco = num(form.pesoSecoKg);
  const ppb = num(form.aflatoxinaPpb);
  const quebra = quebraKg(verde, seco);
  /* A MESMA função das duas: quanto se perdeu entre duas pesagens. Ver a nota em `quebraKg`. */
  const quebraTransporte = quebraKg(num(form.pesoFazendaKg), verde);
  const faixa = faixaAflatoxina(ppb);
  const traco = (v: number | null, casas = 2, sufixo = '') =>
    (v == null ? '—' : `${formatNum(v, casas)}${sufixo}`);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ESTA CLASSE É A CANÔNICA DA CASA, copiada de `LancamentosTab` (o ramo
          `usaEnvelopeProprio`), e cada pedaço dela conserta um defeito medido:
          · `p-0 gap-0 overflow-hidden` — sem eles o `DialogContent` entra com
            `overflow-y-auto p-4` e o modal INTEIRO rola, rodapé incluído;
          · `[&>button.absolute]:hidden` — o `DialogContent` EMBUTE um `<Close>` com X em
            `absolute right-4 top-4`, e o envelope tem o dele no cabeçalho. Eram os DOIS X
            sobrepostos. Quem fecha é o do cabeçalho, o padrão da casa;
          · `max-w-5xl` (1024px) é o teto dos modais de lançamento — eu havia escrito
            `max-w-4xl`, 128px a menos que o resto do sistema, e com o resumo lateral de
            280px o que sobrava para os campos não cabia.
          ⚠ CLIQUE FORA NÃO FECHA, como nos outros modais de lançamento: aqui há treze
          campos digitados do romaneio, e perdê-los por um clique ao lado é caro. */}
      <DialogContent
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        className="max-w-5xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <LancamentoModalEnvelope
          /* ⚠ A SAFRA NO TÍTULO, e não só no resumo: é ela que amarra a carga — a mesma
             cultura no mesmo talhão existe em safras diferentes, e o cabeçalho era a única
             parte do modal que não dizia em qual se está gravando. */
          titulo={`Carga · ${labelDaCultura(cultura)}${safraRotulo ? ` · Safra ${safraRotulo}` : ''}`}
          data={form.dataColheita}
          fazendaNome={fazendaNome}
          onFechar={onFechar}
          acao={(
            /* ⚠ VERDE DE AÇÃO, pela variante `acao` — não cor solta no JSX. O botão era branco
               sobre a faixa azul do envelope, e branco-sobre-branco já custou um "Exportar"
               invisível nesta mesma frente. Verde separa o gesto que GRAVA do resto. */
            <Button type="button" variant="acao" onClick={onSalvar} disabled={salvando}
              className="gap-1">
              <Save className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Salvar carga'}
            </Button>
          )}
          resumo={(
            <div className="divide-y">
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Talhão
                </div>
                <Par rotulo="Área" valor={areas.find(a => a.id === areaId)
                  ? `${areas.find(a => a.id === areaId)?.pastoNome} · ${formatNum(areas.find(a => a.id === areaId)?.area_plantada_ha ?? 0, 2)} ha`
                  : talhaoRotulo} />
                <Par rotulo="Ticket" valor={form.ticketBalanca.trim() || '—'} />
              </div>
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Peso
                </div>
                {/* ⚠ OS TRÊS PESOS EM ORDEM DE TEMPO, com as perdas entre eles: é a mesma
                    história da cadeia da análise de produção, do tamanho do resumo. */}
                <Par rotulo="Na fazenda" valor={traco(num(form.pesoFazendaKg), 2, ' kg')} />
                <Par rotulo="Quebra transporte" valor={traco(quebraTransporte, 2, ' kg')} />
                <Par rotulo="Verde" valor={traco(verde, 2, ' kg')} forte />
                <Par rotulo="Seco" valor={traco(seco, 2, ' kg')} forte />
                {/* ⚠ A QUEBRA SÓ APARECE COM OS DOIS PESOS: enquanto o seco não voltou da
                    cooperativa ela não é zero — ainda não aconteceu. */}
                <Par rotulo="Quebra secagem" valor={traco(quebra, 2, ' kg')} />
                <Par rotulo="Umidade" valor={traco(num(form.umidadePct), 2, '%')} />
              </div>
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Classificação
                </div>
                <Par rotulo="Sacas boas" valor={traco(num(form.sacasBoas), 2, ' sc')} forte />
                <Par rotulo="Aflatoxina" valor={traco(ppb, 2, ' ppb')} />
                <Par rotulo="Faixa"
                  valor={faixa === 'ate' ? `até ${LIMITE_AFLATOXINA} ppb`
                    : faixa === 'acima' ? `acima de ${LIMITE_AFLATOXINA} ppb`
                      /* ⚠ SEM LAUDO NÃO É "ATÉ 20" — a carga ainda não foi classificada. */
                      : 'sem laudo'} />
                <Par rotulo="Grão de roça" valor={traco(num(form.graoRocaSacas), 2, ' sc')} />
                <Par rotulo="Renda líquida" valor={traco(num(form.rendaLiquidaPct), 2, '%')} />
                <Par rotulo="Secagem" valor={num(form.valorSecagem) != null
                  ? `R$ ${formatNum(num(form.valorSecagem), 2)}` : '—'} />
              </div>
            </div>
          )}>

          <Tabs defaultValue="cadastro" className="flex min-h-0 flex-col">
            {/* ⚠ O DESTAQUE VEM DO `data-[state=active]` DO PRÓPRIO PRIMITIVO, reforçado —
                não de um estilo novo. O padrão já traz `bg-background` e `shadow-sm`; sobre o
                `bg-muted` da faixa isso é uma diferença de dois tons, e não se via qual aba
                estava aberta. Aqui o ativo ganha também a cor e o peso do texto, que é o que
                a casa usa para "selecionado" no resto das telas. */}
            {/* ⚠ VISUAL DE PASTA, E SÓ AQUI. O primitivo serve oito telas e não se fragmenta
                por causa de uma; o desenho vem por `className` sobre o mesmo
                `data-[state=active]`. A ativa ganha fundo do corpo, borda em cima e nos lados,
                NENHUMA embaixo, e desce 1px (`-mb-px`) sobre a linha da faixa — é isso que a
                "conecta" ao conteúdo. As inativas ficam sem fundo e apagadas.
                ⚠ `rounded-none` NA LISTA e fundo transparente: o `bg-muted` arredondado do
                padrão é o que fazia duas abas parecerem a mesma coisa. */}
            <TabsList className="h-auto w-full shrink-0 justify-start gap-1 rounded-none border-b bg-transparent p-0">
              {([['cadastro', 'Saída'], ['producao', 'Recebimento'], ['classificacao', 'Classificação']] as const)
                .map(([valor, rotulo]) => (
                  <TabsTrigger key={valor} value={valor}
                    className="-mb-px rounded-b-none rounded-t-md border border-transparent px-3 py-1.5 text-[11px]
                      text-muted-foreground data-[state=active]:border-border data-[state=active]:border-b-background
                      data-[state=active]:bg-background data-[state=active]:font-bold data-[state=active]:text-primary
                      data-[state=active]:shadow-none">
                    {rotulo}
                  </TabsTrigger>
                ))}
            </TabsList>

            {/* ⚠ `data-[state=…]` NO DISPLAY, nunca `flex` solto: o Radix deixa o painel
                inativo no fluxo com `hidden`, e `.flex` sobrescreve `[hidden]{display:none}`.
                Foi o defeito do drawer do DRE, medido e corrigido no PR-DRILL-14. */}
            {/* ⚠ O CORPO GANHA FUNDO E BORDA: sem eles a aba ativa e o conteúdo eram a mesma
                cor, e a "pasta" não se via — o que distingue a aba aberta é justamente ela ser
                a continuação do card. */}
            <TabsContent value="cadastro"
              className="mt-0 flex-col gap-2 rounded-b-md rounded-tr-md border bg-card p-2.5 data-[state=active]:flex data-[state=inactive]:hidden">
              {/* ⚠ O TALHÃO É CAMPO DA CARGA, não do contexto — e era a peça que faltava para
                  corrigir um lançamento errado sem apagá-lo. Mudar aqui troca o
                  `safra_area_id`: a carga sai de um talhão e entra no outro, e os dois
                  consolidados se ajustam na mesma gravação. */}
              <div>
                <Label className="text-[10px]">Talhão <span className="text-destructive">*</span></Label>
                <Select value={areaId} onValueChange={onAreaChange}>
                  <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]', FOCO)}>
                    <SelectValue placeholder="Escolha o talhão desta carga" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map(a => (
                      <SelectItem key={a.id} value={a.id} className="text-[12px]">
                        {safraRotulo && `${safraRotulo} · `}{labelDaCultura(cultura)} · {a.pastoNome}
                        {' · '}{formatNum(a.area_plantada_ha, 2)} ha
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* ⚠ LARGURA PELO CONTEÚDO, NÃO PELA TELA (A18): data e hora cabem em cinco
                  caracteres, e um campo de data ocupando meia linha faz o formulário parecer
                  vazio e obriga a rolar por nada. As frações da grade são o tamanho do que
                  entra em cada campo. */}
              <div className="grid grid-cols-[1.6fr_1fr_0.8fr_1.2fr] gap-2">
                <div>
                  <Label className="text-[10px]">Data <span className="text-destructive">*</span></Label>
                  <DatePicker value={form.dataColheita} onChange={v => onChange('dataColheita', v)}
                    className="mt-0.5" />
                </div>
                {/* ⚠ `type="time"` É NATIVO E ESTÁ NA MIRA DO GATE DE UI — mas o gate cobre
                    `type="date"` e `<select>`, e não existe componente de hora na casa. Um
                    campo de texto livre aceitaria "14h55" e "2:55 pm", que o Postgres recusa
                    em `time`. Fica o nativo, com a dívida anotada: PR-UI-TIMEPICKER. */}
                <Campo rotulo="Hora" valor={form.horaChegada} tipo="time"
                  dica="A hora que o romaneio registra na balança."
                  onChange={v => onChange('horaChegada', v)} />
                {/* ⚠ O PESO DA FAZENDA É O PRIMEIRO DOS TRÊS, e é o único que se sabe AQUI —
                    os outros dois a cooperativa devolve depois. Guardá-lo é o que torna a
                    quebra de transporte mensurável. */}
                <div className="col-span-2">
                  <CampoPeso rotulo="Peso na fazenda" valorKg={form.pesoFazendaKg} cultura={cultura}
                    dica="O que a balança da fazenda ou do posto pesou na saída."
                    onChangeKg={v => onChange('pesoFazendaKg', v)} />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-2">
                <Campo rotulo="Ticket balança" valor={form.ticketBalanca} onChange={v => onChange('ticketBalanca', v)} />
                <Campo rotulo="NF produtor" valor={form.nfProdutor} onChange={v => onChange('nfProdutor', v)} />
                <Campo rotulo="Filial" valor={form.filial} onChange={v => onChange('filial', v)} />
              </div>
              <div>
                <Label className="text-[10px]">Observações</Label>
                <Input value={form.observacoes} onChange={e => onChange('observacoes', e.target.value)}
                  className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
              </div>
            </TabsContent>

            <TabsContent value="producao"
              className="mt-0 flex-col gap-2 rounded-b-md rounded-tr-md border bg-card p-2.5 data-[state=active]:flex data-[state=inactive]:hidden">
              <div className="grid grid-cols-2 gap-2">
                <CampoPeso rotulo="Peso verde (Casul)" valorKg={form.pesoVerdeKg} cultura={cultura}
                  dica="O que a cooperativa reconheceu na chegada." onChangeKg={v => onChange('pesoVerdeKg', v)} />
                <CampoPeso rotulo="Peso seco" valorKg={form.pesoSecoKg} cultura={cultura}
                  dica="O que a cooperativa devolveu depois de secar — fica em branco até chegar."
                  onChangeKg={v => onChange('pesoSecoKg', v)} />
              </div>
              <div className="grid grid-cols-[0.8fr_1fr_1fr_1fr] gap-2">
                <Campo rotulo="Umidade (%)" valor={form.umidadePct} numerico onChange={v => onChange('umidadePct', v)} />
                <Campo rotulo="Sacas boas" valor={form.sacasBoas} numerico
                  dica="Calculado do peso seco — pode ser corrigido, e a correção não se desfaz."
                  onChange={v => onChange('sacasBoas', v)} />
                {/* ⚠ A QUEBRA DE TRANSPORTE PODE SER NEGATIVA, e isso NÃO é erro: a cooperativa
                    às vezes reconhece MAIS peso do que a balança da fazenda mediu. O sinal
                    aparece; nada é bloqueado por causa dele. */}
                <Derivado rotulo="Quebra transporte (kg)" valor={quebraTransporte}
                  cor={quebraTransporte != null && quebraTransporte < 0 ? 'text-success' : 'text-destructive'} />
                <Derivado rotulo="Quebra secagem (kg)" valor={quebra} cor="text-destructive" />
              </div>
            </TabsContent>

            <TabsContent value="classificacao"
              className="mt-0 flex-col gap-2 rounded-b-md rounded-tr-md border bg-card p-2.5 data-[state=active]:flex data-[state=inactive]:hidden">
              <div className="grid grid-cols-4 gap-2">
                <Campo rotulo="Aflatoxina (ppb)" valor={form.aflatoxinaPpb} numerico
                  dica={`O corte da cooperativa é ${LIMITE_AFLATOXINA} ppb — o número entra como veio do laudo.`}
                  onChange={v => onChange('aflatoxinaPpb', v)} />
                <Campo rotulo="Renda líquida (%)" valor={form.rendaLiquidaPct} numerico
                  onChange={v => onChange('rendaLiquidaPct', v)} />
                <Campo rotulo="Grão de roça (kg)" valor={form.graoRocaKg} numerico
                  onChange={v => onChange('graoRocaKg', v)} />
                <Campo rotulo="Grão de roça (sc)" valor={form.graoRocaSacas} numerico
                  dica="Calculado do grão de roça em quilos — pode ser corrigido."
                  onChange={v => onChange('graoRocaSacas', v)} />
              </div>
              {/* ⚠ A SECAGEM É CUSTO, e por ora SÓ REGISTRO: os dois números vêm do romaneio e
                  ficam aqui e no consolidado da safra, sem tocar o DRE. Virar lançamento no
                  subcentro "Secagem e Beneficiamento" (13180) é frente própria —
                  PR-COLHEITA-SECAGEM-FINANCEIRO.
                  ⚠ SÃO DOIS CAMPOS DIGITADOS, nenhum derivado do outro: a taxa é o quanto a
                  cooperativa cobra e o valor é o que aquela carga pagou. Multiplicar um pelo
                  outro criaria um terceiro número que o papel não tem. */}
              <div className="grid grid-cols-[1fr_1.2fr_2fr] gap-2">
                <Campo rotulo="Taxa de secagem" valor={form.taxaSecagem} numerico
                  dica="Como a cooperativa cobra — R$ por saca ou percentual, do romaneio."
                  onChange={v => onChange('taxaSecagem', v)} />
                {/* ⚠ `CampoMoeda`, NÃO `CampoNumero`: a secagem é dinheiro, e o campo tem de
                    escrever "R$ 1.445,14" como todo valor do sistema. A taxa ao lado continua
                    número — ela é R$/saca ou percentual, e o "R$" ali diria o preço errado.
                    ⚠ A PONTE É O TEXTO: o form guarda string (como os treze campos), então o
                    campo recebe o número parseado e devolve o número de volta como texto. */}
                <div>
                  <Label className="text-[10px]">Valor da secagem</Label>
                  <CampoMoeda valor={num(form.valorSecagem)}
                    onChange={n => onChange('valorSecagem', n == null ? '' : String(n))}
                    className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
                </div>
                <div />
              </div>
              {/* ⚠ PREÇO NÃO ENTRA, e não é esquecimento: `agri_colheita` não tem coluna de
                  preço nenhuma (conferido no banco). Preço é venda de grão, frente própria —
                  inventar o campo aqui criaria um valor sem dono e sem contrapartida
                  financeira. */}
              <p className="text-[10px] leading-snug text-muted-foreground">
                O preço não se lança aqui: esta tela registra o físico da colheita. A venda do
                grão é outra frente, e é lá que o valor encontra o financeiro.
              </p>
            </TabsContent>
          </Tabs>
        </LancamentoModalEnvelope>
      </DialogContent>
    </Dialog>
  );
}
