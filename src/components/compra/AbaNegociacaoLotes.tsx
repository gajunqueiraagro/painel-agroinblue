/* ═══ TRES PADROES DO SISTEMA — valem em QUALQUER tela, nao so aqui ════════════
   Definidos pelo Gabriel em 28/08 e registrados aqui como referencia, porque
   estavam sendo pedidos caso a caso em vez de valer por padrao.

   (a) PESO SEMPRE COM DUAS CASAS. "200,00", nunca "200" — na entrada e na exibicao.
       Peso e' medida, e medida sem casa decimal parece arredondada quando nao e'.
   (b) CAMPOS DO MESMO FORMULARIO TEM A MESMA ALTURA. Nunca misturar h-6 com h-8 na
       mesma linha: a diferenca le como defeito, ainda que ninguem saiba dizer o que
       esta errado.
   (c) PAR ROTULO-VALOR EM COLUNA ALINHADA, nunca texto corrido com pontos separando.
       Referencia viva: o "Resumo da operacao" (ResumoLateralOC) — rotulo cinza a
       esquerda, valor a direita, uma linha por par. Texto corrido obriga a LER para
       comparar; coluna deixa COMPARAR sem ler. */
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { parseNumericValue } from '@/lib/calculos/abate';
import { pesoMedioPorCabeca, valorPorKgNegociado } from '@/hooks/useCompraLotes';
import type { CompraLotesApi, CriterioValor } from '@/hooks/useCompraLotes';

// Aba Negociação.
//   • Modo OC (lotesApi): grade EDITÁVEL de múltiplos lotes — fonte única = camada OC
//     (zoo_operacao_lotes via oc_salvar_lotes). Totais derivados só no frontend. Sem lancamentos.
//   • Modo legado (sem lotesApi): mantém a linha read-only atual (Compra é dona dos dados).
interface Props {
  // legado (read-only)
  categoria: string;
  categoriasDisponiveis: { value: string; label: string }[];
  quantidadeNum: number;
  pesoKgNum: number;
  darkSelectClass: string;
  // modo OC (COM-3)
  modoOC?: boolean;
  operacaoPronta?: boolean;      // já existe operacao_id (salvo na aba Compra)
  lotesApi?: CompraLotesApi;
  somenteLeitura?: boolean;      // OPEN-01: abertura de operação existente — grade read-only
  /** Recebimento ativo: o FISICO congela (categoria, quantidade, peso) e some o
      botao de adicionar/remover lote, mas CRITERIO e VALOR seguem editaveis.
      ⚠ `somenteLeitura` TEM PRECEDENCIA: com ele tudo trava, sem excecao. Os
      dois nao sao alternativos — um e' "a operacao inteira esta fechada", o
      outro e' "o fisico ja aconteceu". */
  fisicoBloqueado?: boolean;
  onVoltarCompra?: () => void;   // navegar de volta à aba Compra
}

const CRITERIOS: { value: CriterioValor; label: string; unidade: string }[] = [
  { value: 'kg', label: 'Por kg', unidade: 'R$/kg' },
  { value: 'cabeca', label: 'Por cabeça', unidade: 'R$/cabeça' },
  { value: 'total', label: 'Valor total', unidade: 'Valor total' },
];

const GRID_LEG = 'grid grid-cols-[1.3fr_0.7fr_0.9fr_1fr_1.1fr_1fr_1fr] gap-2';

const brl = (n: number) => (n > 0 ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ —');
// Regra (a) do topo: peso SEMPRE com duas casas.
const fmtKg = (n: number) => (n > 0 ? `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : '—');

function loteTotal(criterio: CriterioValor, quantidade: string, pesoMedioKg: string, valorInformado: string): number {
  const q = parseNumericValue(quantidade) || 0;
  const pm = parseNumericValue(pesoMedioKg) || 0;
  const v = parseNumericValue(valorInformado) || 0;
  const pt = q * pm;
  return criterio === 'kg' ? pt * v : criterio === 'cabeca' ? q * v : v;
}

/* ⚠ `loteTotal` acima e a SEGUNDA implementacao da regra
   do valor do lote — a primeira e `_oc_valor_do_lote`, no banco, consumida por
   `oc_salvar_lotes` e pela ponte em `oc_registrar_movimentacao`.
   A duplicacao e DELIBERADA e nao da para eliminar: este calculo e o preview
   durante a DIGITACAO, quando o lote ainda nao foi salvo e a funcao de banco
   nao tem o que ler.
   O comentario anterior dizia "sem novo calculo de negocio". Nao era verdade —
   a regra esta reescrita aqui, e agora esta declarado.
   ⚠ SE VOCE MUDAR UMA, MUDE A OUTRA e rode o teste de concordancia
   (supabase/tests/pr_oc_valor_02_concordancia.sql), que compara as duas nos
   lotes existentes. Ele ja pegou uma divergencia: a guarda `total > 0` da
   linha do R$/cab, que o banco nao tinha — sem ela um lote de valor zero
   produzia R$ 0,00/cab e a ponte gravaria zero no lancamento.

   ⚠ A GUARDA `total > 0` do R$/cab, citada acima, continua valendo mesmo sem
   `resumoLote`: quem imprime e' `brl`, que devolve 'R$ —' para qualquer valor <= 0.
   Nao ha caminho que produza "R$ 0,00/cab" na tela. */

// Campo Valor — apresentação monetária pt-BR SEM prejudicar a edição (format-on-blur):
//   foco → string crua editável (a que é persistida); blur → exibe brl(valor). O valor persistido
//   (valorInformado) NUNCA é reformatado; cursor, arredondamento, unidade e cálculo permanecem intactos.
function ValorInput({ value, onChange, disabled, placeholder, className }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string;
  /* Regra (b): a altura vem de QUEM USA. Fixa-la aqui era o motivo de o Valor ficar
     mais baixo que os vizinhos dentro do modal. O default preserva a grade legada. */
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const num = parseNumericValue(value) || 0;
  const display = focused ? value : (num > 0 ? brl(num) : '');
  return (
    <Input inputMode="decimal" value={display} onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      placeholder={placeholder} disabled={disabled}
      className={className ?? 'h-6 text-[11px] text-right tabular-nums'} />
  );
}

export function AbaNegociacaoLotes({
  categoria, categoriasDisponiveis, quantidadeNum, pesoKgNum, darkSelectClass,
  modoOC, operacaoPronta, lotesApi, somenteLeitura, fisicoBloqueado, onVoltarCompra,
}: Props) {
  /* ── MODO OC — delegado a um componente PROPRIO (PR-OC-UX-LOTE-C2-01) ──────
     O modal de lote precisa de estado (qual lote esta aberto), e hook nao pode
     morar dentro de `if`. Extrair era a unica saida correta — e e' o mesmo padrao
     que `NegociacaoLegado` ja seguia logo abaixo. */
  if (modoOC && lotesApi) {
    return (
      <NegociacaoOC
        lotesApi={lotesApi}
        categoriasDisponiveis={categoriasDisponiveis}
        darkSelectClass={darkSelectClass}
        operacaoPronta={!!operacaoPronta}
        somenteLeitura={!!somenteLeitura}
        fisicoBloqueado={!!fisicoBloqueado}
        onVoltarCompra={onVoltarCompra}
      />
    );
  }

/* ═══ MODO OC — LISTA COMPACTA + MODAL POR LOTE (PR-OC-UX-LOTE-C2-01) ═══════════
   Antes: grade de 8 colunas editaveis inline, todos os lotes editaveis ao mesmo
   tempo, mais 6 caixas de totais embaixo. A tela pedia atencao para tudo de uma vez.
   Agora: uma linha somente-leitura por lote; a edicao acontece num modal, um lote
   de cada vez, com espaco para respirar.

   ⚠ O MODAL NAO GRAVA NO BANCO, e isso e' deliberado. Ele edita o ESTADO LOCAL, que
   e' exatamente o que a grade fazia: quem persiste continua sendo `lotesApi.salvar()`,
   acionado pelos botoes do rodape ("Salvar rascunho" / "Concluir lotes e continuar").
   Duas razoes:
     1. Contrato — nao criar caminho novo de escrita.
     2. Armadilha real — `salvar` e' `useCallback` sobre `lotes`; chama-lo logo apos
        `editarLote` no mesmo clique persistiria a lista ANTERIOR, sem a edicao. E' a
        mesma familia do bug de closure que ja custou correcao nesta tela.
   Por isso o botao do modal diz "Aplicar", nao "Salvar": dizer Salvar sem gravar
   seria mentir para o operador. */
function NegociacaoOC({
  lotesApi, categoriasDisponiveis, darkSelectClass, operacaoPronta, somenteLeitura, fisicoBloqueado, onVoltarCompra,
}: {
  lotesApi: NonNullable<Props['lotesApi']>;
  categoriasDisponiveis: Props['categoriasDisponiveis'];
  darkSelectClass?: string;
  operacaoPronta: boolean;
  somenteLeitura: boolean;
  fisicoBloqueado: boolean;
  onVoltarCompra?: () => void;
}) {
  const { lotes, adicionarLote, editarLote, removerLote, totais, loading } = lotesApi;
  /* Um so lugar decide o congelamento do fisico, para as tres colunas nao divergirem
     entre si numa edicao futura. Mantido do desenho anterior — e' regra de negocio
     (PR-OC-LOTE-VALOR-01), nao detalhe visual, e vale igual dentro do modal. */
  const fisicoRO = somenteLeitura || fisicoBloqueado;
  const pesoMedio = pesoMedioPorCabeca(totais);
  const valorKg = valorPorKgNegociado(totais);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const emEdicao = lotes.find(l => l.idLocal === editandoId) ?? null;

  /* ABERTURA DIRETA. "Adicionar lote" cria E abre, num gesto so — `adicionarLote`
     devolve o id. Antes isso passava por um efeito que observava a lista crescer, e
     na homologacao o modal simplesmente nao abriu: o operador via a linha vazia
     aparecer e nao tinha como saber que precisava clicar nela. */
  const abrirNovo = () => setEditandoId(adicionarLote());

  const rotuloCategoria = (slug: string) =>
    categoriasDisponiveis.find(c => c.value === slug)?.label || slug || 'Sem categoria';

  const GRID_LISTA = 'grid grid-cols-[minmax(0,1.4fr)_0.7fr_1fr_1.1fr_0.9fr_1.1fr_auto] gap-2 items-center';

  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-1.5 min-w-0">
      {/* TOTAIS NO TOPO — sao o cabecalho da aba: dizem onde a negociacao esta antes
          de o olho descer para o detalhe de cada lote. */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">Lotes</div><div className="font-bold text-[12px] tabular-nums">{totais.lotes || '—'}</div></div>
        <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">Animais</div><div className="font-bold text-[12px] tabular-nums">{totais.animais || '—'}</div></div>
        <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">Peso Méd.</div><div className="font-bold text-[12px] tabular-nums">{pesoMedio == null ? '—' : fmtKg(pesoMedio)}</div></div>
        <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">R$/cab Méd.</div><div className="font-bold text-[12px] tabular-nums">{totais.animais > 0 ? brl(totais.valorNegociado / totais.animais) : '—'}</div></div>
        <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">R$/kg Méd.</div><div className="font-bold text-[12px] tabular-nums">{valorKg == null ? '—' : brl(valorKg)}</div></div>
        <div className="rounded-md border-2 border-primary/40 bg-primary/5 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">Valor Principal</div><div className="font-bold text-[13px] text-primary tabular-nums">{brl(totais.valorNegociado)}</div></div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div>
          <div className="text-[12px] font-semibold text-foreground">Negociação dos Lotes</div>
          <div className="text-[11px] text-muted-foreground">Clique num lote para editar.</div>
        </div>
        {!fisicoRO && (
          <Button type="button" variant="outline" size="sm" disabled={!operacaoPronta} onClick={abrirNovo}
            className="h-7 text-[11px] gap-1" title={operacaoPronta ? undefined : 'Salve a operação na aba Compra primeiro'}>
            <Plus className="h-3 w-3" /> Adicionar lote
          </Button>
        )}
      </div>

      {!operacaoPronta ? (
        <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center space-y-2">
          <div className="text-[11px] text-muted-foreground">Salve a identificação da compra para adicionar os lotes da negociação.</div>
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={onVoltarCompra}>Voltar para Compra</Button>
        </div>
      ) : lotes.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-center text-[11px] text-muted-foreground">
          {loading ? 'Carregando lotes…' : 'Nenhum lote. Clique em "Adicionar lote".'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[560px] space-y-0.5">
            {/* Regra (c) — COLUNAS ALINHADAS. Antes era texto corrido separado por
                pontos, que obriga a LER cada linha para comparar duas. */}
            <div className={`${GRID_LISTA} px-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground`}>
              <span>Categoria</span>
              <span className="text-right">Qtde</span>
              <span className="text-right">Peso méd.</span>
              <span className="text-right">R$/cab</span>
              <span className="text-right">R$/kg</span>
              <span className="text-right">Total</span>
              <span className="w-4" />
            </div>
            {lotes.map(l => {
              const q = parseNumericValue(l.quantidade) || 0;
              const pm = parseNumericValue(l.pesoMedioKg) || 0;
              const pt = q * pm;
              const total = loteTotal(l.criterioValor, l.quantidade, l.pesoMedioKg, l.valorInformado);
              const semPeso = pm <= 0;
              return (
                <div key={l.idLocal}
                  onClick={() => setEditandoId(l.idLocal)}
                  className={`${GRID_LISTA} rounded-md border bg-muted/20 px-2 py-1 cursor-pointer hover:bg-muted/40 text-[11px]`}>
                  <div className="min-w-0 truncate font-medium">
                    {rotuloCategoria(l.categoria)}
                    {/* O lote invalido se anuncia na LISTA: quem tem cinco precisa ver
                        qual esta pendente sem abrir os cinco. */}
                    {semPeso && <span className="text-destructive font-normal"> · sem peso</span>}
                  </div>
                  <div className="text-right tabular-nums">{q || '—'}</div>
                  <div className={`text-right tabular-nums ${semPeso ? 'text-destructive' : ''}`}>{fmtKg(pm)}</div>
                  <div className="text-right tabular-nums text-muted-foreground">{q > 0 ? brl(total / q) : '—'}</div>
                  <div className="text-right tabular-nums text-muted-foreground">{pt > 0 ? brl(total / pt) : '—'}</div>
                  <div className="text-right tabular-nums font-semibold">{brl(total)}</div>
                  <div className="w-4 flex justify-end">
                    {!fisicoRO && (
                      <button type="button" aria-label="Remover lote"
                        onClick={(e) => { e.stopPropagation(); removerLote(l.idLocal); }}
                        className="text-muted-foreground/60 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {emEdicao && (
        <LoteDialog
          /* ⚠ `key` NAO E' DECORACAO. O estado do modal e' inicializado no MOUNT a
             partir do lote. Sem a key, "Aplicar e adicionar outro" mantinha o
             componente montado e o lote NOVO abriria com os valores do ANTERIOR —
             o usuario cadastraria o segundo lote por cima do primeiro sem perceber. */
          key={emEdicao.idLocal}
          lote={emEdicao}
          categoriasDisponiveis={categoriasDisponiveis}
          darkSelectClass={darkSelectClass}
          fisicoRO={fisicoRO}
          somenteLeitura={somenteLeitura}
          rotuloCategoria={rotuloCategoria}
          onAplicar={(patch) => { editarLote(emEdicao.idLocal, patch); setEditandoId(null); }}
          onAplicarEAdicionar={(patch) => { editarLote(emEdicao.idLocal, patch); abrirNovo(); }}
          onFechar={() => setEditandoId(null)}
        />
      )}
    </div>
  );
}

  // ── MODO LEGADO: linha read-only (inalterado) ──
  return <NegociacaoLegado categoria={categoria} categoriasDisponiveis={categoriasDisponiveis} quantidadeNum={quantidadeNum} pesoKgNum={pesoKgNum} darkSelectClass={darkSelectClass} />;
}

/* Par rotulo-valor do resumo do lote — regra (c) do topo, mesmo tratamento do
   "Resumo da operacao": rotulo cinza a esquerda, valor a direita, tabular. */
function ParLote({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 leading-tight">
      <span className="text-[10px] text-muted-foreground">{rotulo}</span>
      <span className="text-[11px] font-medium tabular-nums">{valor}</span>
    </div>
  );
}

/* O MODAL DE UM LOTE. Densidade do padrao canonico do sistema (modal Novo Lancamento
   do Financeiro): rotulo `text-[10px]` sem negrito, campo `h-8`.
   Edita um RASCUNHO local e so devolve o patch ao aplicar — fechar pelo X ou pelo Esc
   descarta, que e' o que "Cancelar" significa. */
function LoteDialog({
  lote, categoriasDisponiveis, darkSelectClass, fisicoRO, somenteLeitura, rotuloCategoria,
  onAplicar, onAplicarEAdicionar, onFechar,
}: {
  lote: NonNullable<Props['lotesApi']>['lotes'][number];
  categoriasDisponiveis: Props['categoriasDisponiveis'];
  darkSelectClass?: string;
  fisicoRO: boolean;
  somenteLeitura: boolean;
  rotuloCategoria: (slug: string) => string;
  onAplicar: (patch: Partial<NonNullable<Props['lotesApi']>['lotes'][number]>) => void;
  onAplicarEAdicionar: (patch: Partial<NonNullable<Props['lotesApi']>['lotes'][number]>) => void;
  onFechar: () => void;
}) {
  const [categoria, setCategoria] = useState(lote.categoria);
  const [quantidade, setQuantidade] = useState(lote.quantidade);
  const [pesoMedioKg, setPesoMedioKg] = useState(lote.pesoMedioKg);
  const [criterioValor, setCriterioValor] = useState<CriterioValor>(lote.criterioValor);
  const [valorInformado, setValorInformado] = useState(lote.valorInformado);

  const pm = parseNumericValue(pesoMedioKg) || 0;
  const qtdNum = parseNumericValue(quantidade) || 0;
  const pesoTotal = qtdNum * pm;
  const semPeso = pm <= 0;
  const unidade = CRITERIOS.find(c => c.value === criterioValor)?.unidade || 'Valor';
  const total = loteTotal(criterioValor, quantidade, pesoMedioKg, valorInformado);
  const patch = { categoria, quantidade, pesoMedioKg, criterioValor, valorInformado };

  /* PESO OBRIGATORIO na porta do modal, e nao so no salvar: `oc_salvar_lotes` recusa a
     OPERACAO INTEIRA por um lote sem peso (PR-OC-PESO-OBRIGATORIO-01), entao deixar o
     lote sair daqui invalido so adia a recusa para o rodape, longe de onde se corrige.
     A mensagem nomeia o lote pela categoria, como a do banco. */
  const podeAplicar = !semPeso;
  const motivoBloqueio = semPeso
    ? `Informe o peso médio do lote ${rotuloCategoria(categoria)}. Lote sem peso não pode ser salvo.`
    : undefined;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      {/* Cabecalho AZUL, o mesmo dos demais modais do sistema (CompraModalShell).
          `p-0 gap-0` + faixa propria: o padding default do DialogContent deixaria a
          faixa flutuando dentro de uma borda branca. */}
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="bg-primary px-4 py-2.5 space-y-0.5">
          <DialogTitle className="text-[13px] text-primary-foreground">{rotuloCategoria(categoria)}</DialogTitle>
          <DialogDescription className="text-[11px] text-primary-foreground/80">
            {fisicoRO
              ? 'Esta compra já teve recebimento: categoria, quantidade e peso ficam bloqueados. Critério e valor seguem editáveis.'
              : 'Os campos do lote negociado.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 px-4 pt-3">
          {/* Categoria nao precisa da largura inteira; e Qtde/Peso guardam 3 digitos,
              entao nao merecem coluna larga. Regra (b): TODOS h-8 nesta tela. */}
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
            <div>
              <Label className="text-[10px]">Categoria <span className="text-destructive">*</span></Label>
              <Select value={categoria || undefined} onValueChange={setCategoria} disabled={fisicoRO}>
                <SelectTrigger className="h-8 text-[12px] mt-0.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className={`${darkSelectClass} max-h-[60vh] overflow-y-auto`}>
                  {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px]">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Quantidade <span className="text-destructive">*</span></Label>
              <Input inputMode="numeric" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="0"
                disabled={fisicoRO} className="h-8 text-[12px] mt-0.5 text-right tabular-nums" />
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)] gap-2">
            <div>
              <Label className="text-[10px]">Peso méd. (kg) <span className="text-destructive">*</span></Label>
              <Input inputMode="decimal" value={pesoMedioKg} onChange={e => setPesoMedioKg(e.target.value)}
                onBlur={() => { const n = parseNumericValue(pesoMedioKg); if (n) setPesoMedioKg(n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }}
                placeholder="0,00" disabled={fisicoRO} title={motivoBloqueio}
                className={`h-8 text-[12px] mt-0.5 text-right tabular-nums ${semPeso ? 'border-destructive focus-visible:ring-destructive' : ''}`} />
            </div>
            <div>
              <Label className="text-[10px]">Critério</Label>
              <Select value={criterioValor} onValueChange={v => setCriterioValor(v as CriterioValor)} disabled={somenteLeitura}>
                <SelectTrigger className="h-8 text-[12px] mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent className={darkSelectClass}>
                  {CRITERIOS.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px]">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Valor <span className="text-destructive">*</span></Label>
              <div className="mt-0.5">
                {/* Regra (b) — a altura vem daqui, nao do componente. */}
                <ValorInput value={valorInformado} onChange={setValorInformado} placeholder={unidade}
                  disabled={somenteLeitura} className="h-8 text-[12px] text-right tabular-nums" />
              </div>
            </div>
          </div>

          {/* Derivados AO VIVO, em PARES ALINHADOS (regra `c` do topo). Antes era uma
              frase corrida com pontos separando: para comparar dois lotes era preciso
              LER a frase inteira duas vezes. */}
          <div className="rounded-md border bg-muted/20 px-2 py-1.5 space-y-0.5">
            <ParLote rotulo="Quantidade" valor={qtdNum > 0 ? `${qtdNum} cab` : '—'} />
            <ParLote rotulo="Peso médio" valor={fmtKg(pm)} />
            <ParLote rotulo="Peso total" valor={fmtKg(pesoTotal)} />
            <ParLote rotulo="R$/cab" valor={qtdNum > 0 ? brl(total / qtdNum) : '—'} />
            <ParLote rotulo="R$/kg" valor={pesoTotal > 0 ? brl(total / pesoTotal) : '—'} />
            <div className="flex items-baseline justify-between gap-2 border-t pt-1 mt-1">
              <span className="text-[10px] text-muted-foreground">Total do lote</span>
              <span className="text-[13px] font-bold text-primary tabular-nums">{brl(total)}</span>
            </div>
          </div>

          {semPeso && <div className="text-[10px] text-destructive leading-tight">{motivoBloqueio}</div>}
        </div>

        <DialogFooter className="gap-1.5 sm:gap-1.5 px-4 pb-4 pt-3">
          <span className="mr-auto text-[10px] text-muted-foreground leading-tight self-center">
            Gravado ao salvar a negociação.
          </span>
          <Button variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          {!fisicoRO && (
            <Button variant="secondary" size="sm" disabled={!podeAplicar} title={motivoBloqueio}
              onClick={() => onAplicarEAdicionar(patch)}>
              Aplicar e adicionar outro
            </Button>
          )}
          <Button size="sm" disabled={!podeAplicar} title={motivoBloqueio} onClick={() => onAplicar(patch)}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NegociacaoLegado({ categoria, categoriasDisponiveis, quantidadeNum, pesoKgNum, darkSelectClass }: Pick<Props, 'categoria' | 'categoriasDisponiveis' | 'quantidadeNum' | 'pesoKgNum' | 'darkSelectClass'>) {
  const [criterio, setCriterio] = useState<CriterioValor>('kg');
  const [valorInformado, setValorInformado] = useState('');
  const catLabel = categoriasDisponiveis.find(c => c.value === categoria)?.label || '—';
  const pesoTotal = quantidadeNum > 0 && pesoKgNum > 0 ? quantidadeNum * pesoKgNum : 0;
  const unidade = CRITERIOS.find(c => c.value === criterio)?.unidade || 'Valor';
  const temLote = quantidadeNum > 0 && !!categoria;
  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-1 min-w-0">
      <div>
        <div className="text-[12px] font-semibold text-foreground">Negociação dos Lotes</div>
        <div className="text-[11px] text-muted-foreground">Defina o critério e o valor negociado para cada lote da compra.</div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className={`${GRID_LEG} px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground`}>
            <span>Categoria</span><span className="text-right">Qtde</span><span className="text-right">Peso Méd.</span>
            <span className="text-right">Peso Tot.</span><span>Critério</span><span className="text-right">Valor</span><span className="text-right">Total</span>
          </div>
          {temLote ? (
            <div className={`${GRID_LEG} items-center rounded-md border bg-muted/20 px-1 py-0.5`}>
              <div className="text-[11px] truncate">{catLabel}</div>
              <div className="text-[11px] text-right tabular-nums">{quantidadeNum}</div>
              <div className="text-[11px] text-right tabular-nums">{fmtKg(pesoKgNum)}</div>
              <div className="text-[11px] text-right tabular-nums">{fmtKg(pesoTotal)}</div>
              <Select value={criterio} onValueChange={v => setCriterio(v as CriterioValor)}>
                <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent className={darkSelectClass}>
                  {CRITERIOS.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={valorInformado} onChange={e => setValorInformado(e.target.value)} inputMode="decimal" placeholder={unidade} className="h-6 text-[11px] text-right tabular-nums" />
              <Input value="R$ —" readOnly tabIndex={-1} className="h-6 text-[11px] text-right tabular-nums bg-muted cursor-default" />
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-4 text-center text-[11px] text-muted-foreground">
              Preencha um lote na aba Compra para negociar.
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
        <div className="rounded-md border bg-muted/20 px-2 py-1"><div className="text-[10px] text-muted-foreground">Lotes</div><div className="font-bold text-[12px]">{temLote ? 1 : '—'}</div></div>
        <div className="rounded-md border bg-muted/20 px-2 py-1"><div className="text-[10px] text-muted-foreground">Animais</div><div className="font-bold text-[12px]">{quantidadeNum > 0 ? quantidadeNum : '—'}</div></div>
        <div className="rounded-md border bg-muted/20 px-2 py-1"><div className="text-[10px] text-muted-foreground">Peso total</div><div className="font-bold text-[12px]">{fmtKg(pesoTotal)}</div></div>
        <div className="rounded-md border bg-muted/20 px-2 py-1"><div className="text-[10px] text-muted-foreground">Valor total negociado</div><div className="font-bold text-[12px] text-primary">R$ —</div></div>
      </div>
    </div>
  );
}
