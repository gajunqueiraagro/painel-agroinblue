/**
 * NascimentoModalShell — o modal do Nascimento, um só, para criar e para editar.
 *
 * Nasceu inline no ramo `isNascimento` do LancamentosTab (PR-UI-NASCIMENTO-SHELL-02)
 * e saiu de lá em PR-ZOO-EDICAO-NO-MODAL-01, sem uma alteração de marcação: o corpo
 * abaixo é o mesmo bloco, movido byte a byte, com o estado trocado por props. O
 * precedente é o CompraModalShell, que também recebe um prop-bag montado pelo caller.
 *
 * ⚠ MESMO SHELL, DOIS MODOS. A edição abria uma gaveta lateral com layout próprio
 * (EditNascimentoSheet): título sobre fundo branco, cabeçalho com emoji, rótulos em
 * negrito, `input type="date"` nativo e botão amarelo. Criar e editar o mesmo
 * lançamento pareciam dois sistemas. Agora é um.
 *
 * ⚠ A FAZENDA FICA TRAVADA NA EDIÇÃO, e isso é decisão de produto, não limitação de
 * tela: `editarLancamento` não toca `fazenda_id` — mover um lançamento entre fazendas
 * depois de gravado mexe no saldo de dois rebanhos, em dois fechamentos e na guarda P1,
 * que é por fazenda. Um seletor que não muda o que grava é controle que mente.
 * A liberação é de PR-ZOO-LANCAMENTO-FAZENDA-03, que carrega a decisão.
 *
 * ⚠ SEM SELETOR DE CENÁRIO, nos dois modos. Este caminho é de realizado; meta tem
 * caminho próprio. A gaveta oferecia Realizado/Meta e o modal de criação já não
 * oferece — na edição, `cenario` e `statusOperacional` saem do payload, e omitir em
 * `editarLancamento` PRESERVA o valor gravado (o hook só envia campo `!== undefined`).
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import type { Categoria } from '@/types/cattle';
import { META_VISUAL } from '@/lib/statusOperacional';
import { LancamentoModalEnvelope } from '@/components/lancamento/LancamentoModalEnvelope';

/* Par rotulo-valor do resumo lateral do Nascimento — mesmo idioma do `Linha` de
   ResumoLateralOC (A17): rotulo cinza a esquerda, valor a direita, traco no vazio.
   Copia deliberada: importar de la puxaria um componente de outra tela para dentro
   deste arquivo, e a unificacao dos resumos e' de PR-UI-LANCAMENTOS-SIMPLES-PADRAO-02. */
function LinhaResumoNasc({ rotulo, valor }: { rotulo: string; valor: string | null }) {
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
function LinhaResumoNascFazenda({ valor, falta }: { valor: string | null; falta: boolean }) {
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

export interface NascimentoModalShellProps {
  /** 'criacao' registra um lançamento novo; 'edicao' salva um já gravado. */
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
  nascFazendaId: string;
  setNascFazendaId: (v: string) => void;
  fazendasOC: { id: string; nome: string }[];
  nascFazendaNome: string | null;
  nascFazendaFalta: boolean;
  nascQtd: number;
  nascPeso: number;
  /** Cenário DO REGISTRO. Fonte única: dele saem o rótulo da pílula E a cor da faixa.
   *  ⚠ Eram duas coisas separadas e foi assim que a pílula passou a mentir — um
   *  literal 'Realizado' num caminho que grava meta. Com uma fonte só, rótulo e cor
   *  não têm como discordar. */
  cenario?: 'meta' | 'realizado';
  submitting: boolean;
  handleRequestRegister: () => void;
  fecharModalOCComAutosave: () => void;
}

/* ⚠ IDIOMA CANONICO DE CAMPO TRAVADO, copiado do CompraModalShell (CAMPO_TRAVADO).
   Um campo travado tem de PARECER travado em toda tela do sistema; inventar um
   cinza proprio aqui faria a mesma trava ler diferente em duas telas. */
const CAMPO_TRAVADO = 'bg-muted border-border/60 text-muted-foreground';

export function NascimentoModalShell({
  modo, data, setData, qtdInput, pesoInput, categoria, setCategoria,
  categoriasDisponiveis, observacao, setObservacao,
  nascFazendaId, setNascFazendaId, fazendasOC, nascFazendaNome, nascFazendaFalta,
  nascQtd, nascPeso, cenario = 'realizado', submitting, handleRequestRegister, fecharModalOCComAutosave,
}: NascimentoModalShellProps) {
  const isEdicao = modo === 'edicao';
  /* ⚠ SO OS SINAIS MUDAM: faixa, pilula, rotulo de data, titulo do resumo e botao.
     O corpo do formulario continua igual — meta e' rotina, e tela colorida inteira
     cansa quem lanca o dia todo. */
  /* ⚠ SO `isMeta` FICA AQUI. A cor da faixa e o rotulo da pilula passaram para o
     LancamentoModalEnvelope em PR-ZOO-META-ENVELOPE-01 — eram identicos nos dois
     shells. O que sobra e' o que muda POR TIPO: rotulo de data, titulo do resumo,
     texto do botao e a linha "Cenário". */
  const isMeta = cenario === 'meta';
  /* ── RESUMO DO NASCIMENTO (PR-UI-NASCIMENTO-SHELL-02) ────────────────────────
     ⚠ AUSENCIA E' TRACO. `nascPesoTotal` e' NULL quando falta quantidade ou peso —
     nao zero. "Peso total: 0,00 kg" afirmaria que se multiplicou e deu zero, quando o
     que ha e' um formulario pela metade. Nenhum `?? 0` no caminho. */
  const nascPesoTotal = nascQtd > 0 && nascPeso > 0 ? nascQtd * nascPeso : null;
  const fmtNum2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <LancamentoModalEnvelope
      titulo="Nascimento"
      cenario={cenario}
      data={data}
      fazendaNome={nascFazendaNome}
      onFechar={fecharModalOCComAutosave}
      resumo={<>
                {/* ⚠ FAIXA DE BLOCO EM 10px, e NAO nos 9px do ResumoLateralOC. O piso de
                    leitura do A21 e' 10px, e copiar o idioma nao pode significar copiar
                    uma violacao — ela se espalharia por cada tela nova. A divergencia de
                    1px contra a OC esta declarada; quem unificar decide o lado. */}
                <div className="pb-1">
                  <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Identificação</span>
                  </div>
                  <div className="px-3 space-y-0.5">
                    <LinhaResumoNasc rotulo="Tipo" valor="Nascimento" />
                    <LinhaResumoNasc rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
                    <LinhaResumoNascFazenda valor={nascFazendaNome} falta={nascFazendaFalta} />
                    <LinhaResumoNasc rotulo="Categoria" valor={categoriasDisponiveis.find(c => c.value === categoria)?.label ?? null} />
                    {/* ⚠ SO EM META. No realizado a linha nao aparece: repetir "Cenário:
                        Realizado" em toda tela vira ruido, e o que precisa de aviso e' o
                        caminho que NAO e' o padrao. */}
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
                  {/* ⚠ AUSENCIA E' TRACO, NUNCA ZERO. Sem quantidade ou sem peso nao ha
                      peso total — nao ha "peso total de zero". `LinhaResumoNasc` imprime
                      "—" para null, e nenhum `?? 0` tapa buraco no caminho.
                      ⚠ ARROBA POR PESO VIVO: peso total / 30. A divisao por 15 e' de
                      CARCACA e vale so no abate; usa-la aqui dobraria o numero. */}
                  <div className="px-3 space-y-0.5">
                    <LinhaResumoNasc rotulo="Cabeças" valor={nascQtd > 0 ? `${nascQtd} cab` : null} />
                    <LinhaResumoNasc rotulo="Peso médio" valor={nascPeso > 0 ? `${fmtNum2(nascPeso)} kg` : null} />
                    <LinhaResumoNasc rotulo="Peso total" valor={nascPesoTotal != null ? `${fmtNum2(nascPesoTotal)} kg` : null} />
                    <LinhaResumoNasc rotulo="Arrobas" valor={nascPesoTotal != null ? `${fmtNum2(nascPesoTotal / 30)} @` : null} />
                  </div>

                  <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Financeiro</span>
                  </div>
                  <div className="px-3 text-muted-foreground leading-tight">
                    Nascimento não tem impacto financeiro.
                  </div>
                </div>
      </>}
      acao={<>
            {/* ⚠ O BOTAO DIZ O QUE FAZ. Registrar cria um lancamento que nao existia;
                salvar altera um que ja esta gravado. Mesmo botao com o mesmo texto nos
                dois modos faria a edicao parecer que registra de novo. */}
            <Button type="button" onClick={handleRequestRegister} disabled={submitting || nascFazendaFalta}
              className="bg-white text-primary hover:bg-white/90 font-bold disabled:opacity-60"
              title={nascFazendaFalta ? 'Selecione a fazenda do lançamento' : isEdicao ? 'Salvar as alterações do nascimento' : 'Registrar o nascimento'}
              aria-label={isEdicao ? 'Salvar alterações' : 'Registrar nascimento'}>
              {isEdicao
                ? (submitting ? 'Salvando…' : 'Salvar alterações')
                : (submitting ? 'Registrando…' : isMeta ? 'Registrar meta' : 'Registrar nascimento')}
            </Button>
      </>}
    >
              <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
                {/* Titulo no idioma da "Identificação da compra": 15px, peso 500, cor padrao. */}
                <div className="text-[15px] font-medium text-foreground">Identificação do nascimento</div>

                {/* FAIXA DE TOPO — o que se le de relance, no idioma da Compra.
                    ⚠ Fazenda sem valor sai em `text-destructive`, e nao com o traco
                    cinza de dado ausente: aqui a ausencia BLOQUEIA o registro, entao ela
                    e' erro a resolver, nao informacao a aceitar. */}
                <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
                  <div className="min-w-0">
                    <div className="text-[11px] font-normal text-muted-foreground leading-none">Fazenda</div>
                    <div className={`mt-1 text-[20px] font-medium leading-none truncate ${nascFazendaFalta ? 'text-destructive' : ''}`}>
                      {nascFazendaNome ?? '—'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-normal text-muted-foreground leading-none">{isMeta ? 'Data prevista' : 'Data do nascimento'}</div>
                    <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                      {data ? data.split('-').reverse().join('/') : <span className="text-muted-foreground">—</span>}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
                  {/* ⚠ FAZENDA E' ESCOLHA, e o payload a carrega — `Lancamento.fazendaId`
                      vence a do contexto em `adicionarLancamento`. Antes o seletor nao
                      existia e a fazenda era heranca silenciosa; em Global o lancamento
                      era recusado sem que a tela dissesse nada. */}
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Fazenda{!isEdicao && <span className="text-destructive"> *</span>}</Label>
                    {/* ⚠ NA EDICAO NAO HA SELETOR, e nao e' esquecimento: `editarLancamento`
                        nao envia `fazenda_id`. Oferecer a escolha aqui seria controle que
                        mente — a licao de 5b523790. Campo travado, no idioma canonico. */}
                    {isEdicao ? (
                      <Input readOnly value={nascFazendaNome ?? '—'} title="A fazenda do lançamento não muda por aqui"
                        className={`mt-[3px] h-8 px-2.5 text-[12px] ${CAMPO_TRAVADO}`} />
                    ) : (
                    <Select value={nascFazendaId} onValueChange={setNascFazendaId}>
                      <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${nascFazendaFalta ? 'border-destructive' : ''}`}>
                        <SelectValue placeholder="Selecione a fazenda" />
                      </SelectTrigger>
                      <SelectContent>
                        {fazendasOC.map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    )}
                    {nascFazendaFalta && (
                      <p className="mt-[3px] text-[10px] text-destructive">Selecione a fazenda do lançamento.</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">{isMeta ? 'Data prevista' : 'Data do nascimento'} <span className="text-destructive">*</span></Label>
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
                    <Label className="text-[10px] text-muted-foreground">Peso médio <span className="text-destructive">*</span></Label>
                    <Input inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus}
                      placeholder="0,00" className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Observações / Lote</Label>
                    <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional"
                      className="mt-[3px] h-8 px-2.5 text-[12px]" />
                  </div>
                </div>
              </div>
    </LancamentoModalEnvelope>
  );
}
