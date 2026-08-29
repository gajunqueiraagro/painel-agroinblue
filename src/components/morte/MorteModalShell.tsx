/**
 * MorteModalShell — o modal da Morte, um só, para registrar e para editar.
 *
 * ⚠ DIVIDA DECLARADA: O ENVELOPE ESTA EM TRES LUGARES.
 * O cabeçalho azul (`bg-primary px-6 py-2.5`), o corpo em
 * `grid lg:grid-cols-[1fr_280px]` com `h-[calc(69vh + 38px)]` e as duas colunas de
 * rolagem própria, e o rodapé azul (`bg-primary px-6 py-2`) são os MESMOS medidos em
 * PR-OC-MODAL-TAMANHO-01 e copiados em PR-UI-NASCIMENTO-SHELL-02. Esta é a terceira
 * cópia, e ela é deliberada: extrair o envelope agora exigiria mexer no shell do
 * Nascimento, que ainda não passou por homologação de tela.
 * Quando houver massa que justifique — um quarto tipo, ou o
 * PR-UI-LANCAMENTOS-SIMPLES-PADRAO-02, que leva os demais tipos a este padrão — o
 * envelope sai para um componente só e os três passam a consumi-lo. Até lá, mudança
 * de medida no envelope exige mexer NOS TRES.
 * ⚠ O que NÃO se copia é o miolo: campos, resumo e regras são por tipo, e é por isso
 * que o shell não virou um componente com prop de tipo — seriam quatro slots para
 * dois usuários.
 *
 * DIFERENÇAS REAIS CONTRA O NASCIMENTO, e por quê:
 *  - oito campos em quatro linhas, não seis em três: entram Motivo (obrigatório) e
 *    Valor (opcional, monetário);
 *  - o resumo ganha `Motivo` na Identificação e o bloco Financeiro deixa de ser frase
 *    fixa para carregar o Valor;
 *  - o peso NÃO tem padrão. Os 30,00 kg são sugestão de bezerro recém-nascido; num
 *    animal morto o peso é o que era, e sugerir número seria inventar dado.
 *
 * ⚠ SEM SELETOR DE CENÁRIO, como no Nascimento: este caminho registra realizado, e
 * meta tem caminho próprio. A pílula do cabeçalho é ROTULO, não controle — e por isso
 * ela diz o cenário REAL (ver `cenarioRotulo`), nunca um "Realizado" cravado.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda, brl } from '@/components/ui/campo-moeda';
import { Calendar, Building2, X } from 'lucide-react';
import type { Categoria } from '@/types/cattle';
import { META_VISUAL } from '@/lib/statusOperacional';

/* Par rotulo-valor do resumo lateral — mesmo idioma do `Linha` de ResumoLateralOC
   (A17): rotulo cinza a esquerda, valor a direita, traco no vazio.
   ⚠ TERCEIRA COPIA deste par, junto com a do Nascimento. Sai na mesma extracao do
   envelope — ver a divida declarada no topo do arquivo. */
function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="font-medium text-right truncate">{valor || '—'}</span>
    </div>
  );
}

/* A fazenda no resumo tem um estado que os outros pares nao tem: ela pode estar
   FALTANDO e bloquear o registro. Traco cinza diria "ausente, tudo bem"; aqui a
   ausencia e' erro a resolver, e a cor precisa dizer isso. */
function LinhaResumoFazenda({ valor, falta }: { valor: string | null; falta: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">Fazenda</span>
      <span className={`font-medium text-right truncate ${falta ? 'text-destructive' : ''}`}>{valor || '—'}</span>
    </div>
  );
}

/** Campo de máscara (useIntegerInput / useDecimalInput). */
interface MascaraInput {
  displayValue: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onFocus: () => void;
}

export interface MorteModalShellProps {
  modo: 'criacao' | 'edicao';
  data: string;
  setData: (v: string) => void;
  qtdInput: MascaraInput;
  pesoInput: MascaraInput;
  categoria: string;
  setCategoria: (v: Categoria) => void;
  categoriasDisponiveis: { value: string; label: string }[];
  observacao: string;
  setObservacao: (v: string) => void;
  morteFazendaId: string;
  setMorteFazendaId: (v: string) => void;
  fazendasOC: { id: string; nome: string }[];
  morteFazendaNome: string | null;
  morteFazendaFalta: boolean;
  /** Motivo escolhido na lista, ou o sentinel '__custom__'. */
  motivoMorte: string;
  setMotivoMorte: (v: string) => void;
  motivoMorteCustom: string;
  setMotivoMorteCustom: (v: string) => void;
  motivosDisponiveis: string[];
  /** Valor de referência. NULL = não informado, e grava null — nunca zero. */
  valorMorte: number | null;
  setValorMorte: (v: number | null) => void;
  morteQtd: number;
  mortePeso: number;
  /** Cenário DO REGISTRO. Fonte única: dele saem o rótulo da pílula E a cor da faixa.
   *  ⚠ Eram duas coisas separadas e foi assim que a pílula do Nascimento passou a
   *  mentir — um literal 'Realizado' num caminho que grava meta. Com uma fonte só,
   *  rótulo e cor não têm como discordar. */
  cenario?: 'meta' | 'realizado';
  submitting: boolean;
  handleRequestRegister: () => void;
  fecharModalOCComAutosave: () => void;
}

/* ⚠ IDIOMA CANONICO DE CAMPO TRAVADO, copiado do CompraModalShell (CAMPO_TRAVADO).
   Um campo travado tem de PARECER travado em toda tela do sistema. */
const CAMPO_TRAVADO = 'bg-muted border-border/60 text-muted-foreground';

export function MorteModalShell({
  modo, data, setData, qtdInput, pesoInput, categoria, setCategoria,
  categoriasDisponiveis, observacao, setObservacao,
  morteFazendaId, setMorteFazendaId, fazendasOC, morteFazendaNome, morteFazendaFalta,
  motivoMorte, setMotivoMorte, motivoMorteCustom, setMotivoMorteCustom, motivosDisponiveis,
  valorMorte, setValorMorte,
  morteQtd, mortePeso, cenario = 'realizado', submitting,
  handleRequestRegister, fecharModalOCComAutosave,
}: MorteModalShellProps) {
  const isEdicao = modo === 'edicao';
  /* ⚠ SO OS SINAIS MUDAM: faixa, pilula, rotulo de data, titulo do resumo e botao.
     O corpo do formulario continua igual — meta e' rotina, e tela colorida inteira
     cansa quem lanca o dia todo. */
  const isMeta = cenario === 'meta';
  const faixa = isMeta ? META_VISUAL.faixa : 'bg-primary';
  const cenarioRotulo = isMeta ? META_VISUAL.label : 'Realizado';

  /* ⚠ AUSENCIA E' TRACO. Sem quantidade ou sem peso nao ha peso total — nao ha "peso
     total de zero". Nenhum `?? 0` no caminho.
     ⚠ ARROBA POR PESO VIVO: peso total / 30. A divisao por 15 e' de CARCACA e vale so
     no abate; usa-la aqui dobraria o numero. */
  const mortePesoTotal = morteQtd > 0 && mortePeso > 0 ? morteQtd * mortePeso : null;
  const fmtNum2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Motivo efetivo: o texto digitado quando a escolha foi "Outro". */
  const motivoEfetivo = motivoMorte === '__custom__'
    ? (motivoMorteCustom || null)
    : (motivoMorte || null);
  const motivoFalta = !motivoEfetivo;

  return (
    <div className="flex flex-col">
      <div className={`${faixa} text-primary-foreground px-6 py-2.5 flex items-start justify-between`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* ⚠ SEM EMOJI. O titulo antigo era "💀 Morte"; nenhuma outra tela do
                sistema carrega emoji no titulo, e aqui ele ainda ilustrava a perda
                de um animal para quem vive dela. */}
            <h2 className="text-lg font-bold leading-tight">Morte</h2>
            {/* ⚠ ROTULO, NAO CONTROLE — e por isso ele tem de dizer a VERDADE.
                A rota `lancamentos-meta-zoo` abre esta tela com o cenario ja' em
                'meta'; cravar "Realizado" aqui faria a pilula mentir sobre o que
                sera' gravado. */}
            <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs">{cenarioRotulo}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {data ? data.split('-').reverse().join('/') : '—'}</span>
            {/* A FAZENDA ESCOLHIDA, nao a do contexto — sem escolha, o mesmo traco de
                ausencia que a faixa de topo usa. */}
            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {morteFazendaNome ?? '—'}</span>
          </div>
        </div>
        <button type="button" onClick={fecharModalOCComAutosave} className="text-white/80 hover:text-white shrink-0"
          title="Fechar" aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>

      {/* ⚠ `+38px` E' A FAIXA DE ABAS QUE ESTA TELA NAO TEM — mesma medida do
          Nascimento, pelo mesmo motivo. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:grid-rows-[minmax(0,1fr)] gap-3 p-4 h-[calc(69vh_+_38px)] overflow-y-auto lg:overflow-hidden bg-muted/30">
        <div className="space-y-2 min-w-0 lg:min-h-0 lg:overflow-y-auto">
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
            <div className="text-[15px] font-medium text-foreground">Identificação da morte</div>

            {/* FAIXA DE TOPO — o que se le de relance. Fazenda sem valor sai em
                `text-destructive`: aqui a ausencia BLOQUEIA o registro. */}
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Fazenda</div>
                <div className={`mt-1 text-[20px] font-medium leading-none truncate ${morteFazendaFalta ? 'text-destructive' : ''}`}>
                  {morteFazendaNome ?? '—'}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">{isMeta ? 'Data prevista' : 'Data da morte'}</div>
                <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                  {data ? data.split('-').reverse().join('/') : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Fazenda{!isEdicao && <span className="text-destructive"> *</span>}</Label>
                {/* ⚠ NA EDICAO NAO HA SELETOR: `editarLancamento` nao envia `fazenda_id`.
                    Oferecer a escolha seria controle que mente — a licao de 5b523790. */}
                {isEdicao ? (
                  <Input readOnly value={morteFazendaNome ?? '—'} title="A fazenda do lançamento não muda por aqui"
                    className={`mt-[3px] h-8 px-2.5 text-[12px] ${CAMPO_TRAVADO}`} />
                ) : (
                  <Select value={morteFazendaId} onValueChange={setMorteFazendaId}>
                    <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${morteFazendaFalta ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Selecione a fazenda" />
                    </SelectTrigger>
                    <SelectContent>
                      {fazendasOC.map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {morteFazendaFalta && (
                  <p className="mt-[3px] text-[10px] text-destructive">Selecione a fazenda do lançamento.</p>
                )}
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">{isMeta ? 'Data prevista' : 'Data da morte'} <span className="text-destructive">*</span></Label>
                {/* A20 — DatePicker do sistema, nunca `<input type="date">`. */}
                <DatePicker value={data} onChange={setData} className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Quantidade <span className="text-destructive">*</span></Label>
                <Input inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus}
                  placeholder="0" className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Categoria <span className="text-destructive">*</span></Label>
                <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
                  <SelectTrigger className="mt-[3px] h-8 px-2.5 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent className="max-h-52 overflow-y-auto">
                    {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px]">{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                {/* ⚠ SEM ASTERISCO E SEM PADRAO. Os 30,00 kg sao sugestao de bezerro
                    recem-nascido, do Nascimento. Aqui o peso e' o que o animal tinha,
                    e sugerir numero seria inventar dado. */}
                <Label className="text-[10px] text-muted-foreground">Peso médio</Label>
                <Input inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus}
                  placeholder="0,00" className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Motivo da morte <span className="text-destructive">*</span></Label>
                <Select value={motivoMorte} onValueChange={setMotivoMorte}>
                  <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${motivoFalta ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent className="max-h-52 overflow-y-auto">
                    {motivosDisponiveis.map(m => <SelectItem key={m} value={m} className="text-[12px]">{m}</SelectItem>)}
                    <SelectItem value="__custom__" className="text-[12px]">Outro (digitar)</SelectItem>
                  </SelectContent>
                </Select>
                {motivoMorte === '__custom__' && (
                  <Input value={motivoMorteCustom} onChange={e => setMotivoMorteCustom(e.target.value)} placeholder="Digite o motivo"
                    className="mt-[3px] h-8 px-2.5 text-[12px]" />
                )}
                {motivoFalta && (
                  <p className="mt-[3px] text-[10px] text-destructive">Informe o motivo da morte.</p>
                )}
              </div>
              <div className="min-w-0">
                {/* ⚠ REFERENCIA, NAO CAIXA. O valor grava em `valor_total` e NAO gera
                    lancamento financeiro: nenhum zootecnico tem contraparte em
                    financeiro_lancamentos_v2 (medido: zero em 3.938). Nao movimenta
                    caixa nem compoe DRE.
                    ⚠ NULL QUANDO VAZIO, nunca zero. `CampoMoeda` ja devolve null, e o
                    payload manda `undefined`, que a lista branca de
                    `adicionarLancamento` omite. */}
                <Label className="text-[10px] text-muted-foreground">Valor</Label>
                <CampoMoeda valor={valorMorte} onChange={setValorMorte} placeholder="R$ 0,00"
                  className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Observações / Lote</Label>
                <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional"
                  className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
            </div>
          </div>
        </div>

        {/* RESUMO LATERAL — idioma do ResumoLateralOC: faixa de titulo, blocos com
            faixa, pares rotulo-valor alinhados a direita, traco no vazio. */}
        <div className="lg:min-h-0 lg:overflow-y-auto">
          <aside className="bg-card rounded-md border shadow-sm overflow-hidden self-start text-[10px]">
            <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
              {isMeta ? 'Resumo da meta' : 'Resumo do lançamento'}
            </div>
            <div className="pb-1">
              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Identificação</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Tipo" valor="Morte" />
                <LinhaResumo rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
                <LinhaResumoFazenda valor={morteFazendaNome} falta={morteFazendaFalta} />
                <LinhaResumo rotulo="Categoria" valor={categoriasDisponiveis.find(c => c.value === categoria)?.label ?? null} />
                <LinhaResumo rotulo="Motivo" valor={motivoEfetivo} />
                {/* ⚠ SO EM META — ver o mesmo comentario no NascimentoModalShell. */}
                {isMeta && (
                  <div className="flex items-baseline justify-between gap-1.5 leading-tight">
                    <span className="text-muted-foreground shrink-0">Cenário</span>
                    <span className={`font-medium text-right ${META_VISUAL.texto}`}>{META_VISUAL.label}</span>
                  </div>
                )}
              </div>

              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Rebanho</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Cabeças" valor={morteQtd > 0 ? `${morteQtd} cab` : null} />
                <LinhaResumo rotulo="Peso médio" valor={mortePeso > 0 ? `${fmtNum2(mortePeso)} kg` : null} />
                <LinhaResumo rotulo="Peso total" valor={mortePesoTotal != null ? `${fmtNum2(mortePesoTotal)} kg` : null} />
                <LinhaResumo rotulo="Arrobas" valor={mortePesoTotal != null ? `${fmtNum2(mortePesoTotal / 30)} @` : null} />
              </div>

              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Financeiro</span>
              </div>
              <div className="px-3 space-y-0.5">
                {/* ⚠ ZERO E' VALOR, AUSENCIA E' TRACO. Uma morte pode valer R$ 0,00 por
                    decisao de quem lanca; a que nao tem valor informado mostra "—".
                    Das 1.678 mortes ativas, 894 tem valor e as outras nao — e essa
                    diferenca e' informacao, nao ruido. */}
                <LinhaResumo rotulo="Valor" valor={valorMorte != null ? brl(valorMorte) : null} />
              </div>
              <div className="px-3 pt-1 text-muted-foreground leading-tight">
                Morte não movimenta caixa nem compõe o DRE.
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className={`${faixa} px-6 py-2 flex items-center justify-end gap-3`}>
        <Button type="button" variant="ghost" onClick={fecharModalOCComAutosave}
          className="text-white/90 hover:bg-white/10 hover:text-white" title="Fechar sem registrar" aria-label="Fechar">
          Fechar
        </Button>
        {/* O botao diz o que faz: registrar cria, salvar altera. */}
        <Button type="button" onClick={handleRequestRegister} disabled={submitting || morteFazendaFalta || motivoFalta}
          className="bg-white text-primary hover:bg-white/90 font-bold disabled:opacity-60"
          title={morteFazendaFalta ? 'Selecione a fazenda do lançamento'
            : motivoFalta ? 'Informe o motivo da morte'
            : isEdicao ? 'Salvar as alterações da morte' : 'Registrar a morte'}
          aria-label={isEdicao ? 'Salvar alterações' : 'Registrar morte'}>
          {isEdicao
            ? (submitting ? 'Salvando…' : 'Salvar alterações')
            : (submitting ? 'Registrando…' : isMeta ? 'Registrar meta' : 'Registrar morte')}
        </Button>
      </div>
    </div>
  );
}
