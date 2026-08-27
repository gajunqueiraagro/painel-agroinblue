import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { parseNumericValue } from '@/lib/calculos/abate';
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
const GRID_OC = 'grid grid-cols-[1.2fr_0.7fr_0.8fr_0.9fr_1.5fr_1fr_1fr_0.5fr] gap-2';

const brl = (n: number) => (n > 0 ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ —');
const fmtKg = (n: number) => (n > 0 ? `${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kg` : '—');

function loteTotal(criterio: CriterioValor, quantidade: string, pesoMedioKg: string, valorInformado: string): number {
  const q = parseNumericValue(quantidade) || 0;
  const pm = parseNumericValue(pesoMedioKg) || 0;
  const v = parseNumericValue(valorInformado) || 0;
  const pt = q * pm;
  return criterio === 'kg' ? pt * v : criterio === 'cabeca' ? q * v : v;
}

/* ⚠ `loteTotal` acima e `resumoLote` abaixo sao a SEGUNDA implementacao da regra
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

   Resumo compacto por lote — cada indicador so aparece quando sua base existe;
   ausencia nunca vira zero (parte omitida). String vazia → nenhuma linha. */
function resumoLote(criterio: CriterioValor, quantidade: string, pesoMedioKg: string, valorInformado: string): string {
  const q = parseNumericValue(quantidade) || 0;
  const pm = parseNumericValue(pesoMedioKg) || 0;
  const pt = q * pm;
  const total = loteTotal(criterio, quantidade, pesoMedioKg, valorInformado);
  // PR-OC-UX-DENSIDADE-01 item 3 — linha rotulada compacta (Qtd · Peso méd. · R$/cab · R$/kg).
  const parts: string[] = [];
  if (q > 0) parts.push(`Qtd: ${q.toLocaleString('pt-BR')} cab`);
  if (pm > 0) parts.push(`Peso méd.: ${pm.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`);
  if (q > 0 && total > 0) parts.push(`R$/cab: ${brl(total / q)}`);
  if (pt > 0 && total > 0) parts.push(`R$/kg: ${brl(total / pt)}`);
  return parts.join(' · ');
}

// Campo Valor — apresentação monetária pt-BR SEM prejudicar a edição (format-on-blur):
//   foco → string crua editável (a que é persistida); blur → exibe brl(valor). O valor persistido
//   (valorInformado) NUNCA é reformatado; cursor, arredondamento, unidade e cálculo permanecem intactos.
function ValorInput({ value, onChange, disabled, placeholder }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const num = parseNumericValue(value) || 0;
  const display = focused ? value : (num > 0 ? brl(num) : '');
  return (
    <Input inputMode="decimal" value={display} onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      placeholder={placeholder} disabled={disabled}
      className="h-6 text-[11px] text-right tabular-nums" />
  );
}

export function AbaNegociacaoLotes({
  categoria, categoriasDisponiveis, quantidadeNum, pesoKgNum, darkSelectClass,
  modoOC, operacaoPronta, lotesApi, somenteLeitura, fisicoBloqueado, onVoltarCompra,
}: Props) {
  // ── MODO OC: grade editável de múltiplos lotes ──
  if (modoOC && lotesApi) {
    const { lotes, adicionarLote, editarLote, removerLote, totais, loading } = lotesApi;
    /* Um so lugar decide o congelamento do fisico, para as tres colunas nao
       divergirem entre si numa edicao futura. */
    const fisicoRO = !!somenteLeitura || !!fisicoBloqueado;
    return (
      <div className="rounded-md border bg-card p-2 shadow-sm space-y-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[12px] font-semibold text-foreground">Negociação dos Lotes</div>
            <div className="text-[11px] text-muted-foreground">Cadastre, edite e precifique cada lote da compra.</div>
          </div>
          {!fisicoRO && (
            <Button type="button" variant="outline" size="sm" disabled={!operacaoPronta} onClick={adicionarLote}
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
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`${GRID_OC} px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground`}>
                <span className="text-center">Categoria</span><span className="text-center">Qtde</span><span className="text-center">Peso Méd.</span>
                <span className="text-center">Peso Tot.</span><span className="text-center">Critério</span><span className="text-center">Valor</span>
                <span className="text-center">Total</span><span className="text-center">Ações</span>
              </div>
              {lotes.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-center text-[11px] text-muted-foreground">
                  {loading ? 'Carregando lotes…' : 'Nenhum lote. Clique em "Adicionar lote".'}
                </div>
              ) : lotes.map(l => {
                const pt = (parseNumericValue(l.quantidade) || 0) * (parseNumericValue(l.pesoMedioKg) || 0);
                const unidade = CRITERIOS.find(c => c.value === l.criterioValor)?.unidade || 'Valor';
                const resumo = resumoLote(l.criterioValor, l.quantidade, l.pesoMedioKg, l.valorInformado);
                return (
                  <div key={l.idLocal} className="rounded-md border bg-muted/20 px-1 py-0.5">
                    <div className={`${GRID_OC} items-center`}>
                      <Select value={l.categoria || undefined} onValueChange={v => editarLote(l.idLocal, { categoria: v })} disabled={fisicoRO}>
                        <SelectTrigger className="h-6 text-[11px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                        <SelectContent className={`${darkSelectClass} max-h-[70vh] overflow-y-auto`}>
                          {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1">{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input inputMode="numeric" value={l.quantidade} onChange={e => editarLote(l.idLocal, { quantidade: e.target.value })} placeholder="0" disabled={fisicoRO} className="h-6 text-[11px] text-right tabular-nums" />
                      <Input inputMode="decimal" value={l.pesoMedioKg} onChange={e => editarLote(l.idLocal, { pesoMedioKg: e.target.value })} placeholder="0,00" disabled={fisicoRO} className="h-6 text-[11px] text-right tabular-nums" />
                      <div className="text-[11px] text-right tabular-nums text-muted-foreground">{fmtKg(pt)}</div>
                      <Select value={l.criterioValor} onValueChange={v => editarLote(l.idLocal, { criterioValor: v as CriterioValor })} disabled={somenteLeitura}>
                        <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent className={darkSelectClass}>
                          {CRITERIOS.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1">{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <ValorInput value={l.valorInformado} onChange={v => editarLote(l.idLocal, { valorInformado: v })} placeholder={unidade} disabled={somenteLeitura} />
                      <div className="text-[11px] text-right tabular-nums font-semibold">{brl(loteTotal(l.criterioValor, l.quantidade, l.pesoMedioKg, l.valorInformado))}</div>
                      <div className="text-center">
                        {!fisicoRO && (
                          <button type="button" onClick={() => removerLote(l.idLocal)} className="text-muted-foreground/60 hover:text-destructive" aria-label="Remover lote">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {resumo && <div className="text-[10px] text-muted-foreground leading-tight pl-1 pt-0.5">{resumo}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PR-OC-UX-DENSIDADE-01 item 4 — cards compactos em UMA linha; destaque só p/ Valor Principal.
            Médias derivadas dos totais (sem alterar cálculo/estado): peso méd, R$/cab méd, R$/kg méd. */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
          <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">Lotes</div><div className="font-bold text-[12px] tabular-nums">{totais.lotes || '—'}</div></div>
          <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">Animais</div><div className="font-bold text-[12px] tabular-nums">{totais.animais || '—'}</div></div>
          <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">Peso Méd.</div><div className="font-bold text-[12px] tabular-nums">{totais.animais > 0 ? fmtKg(totais.pesoTotal / totais.animais) : '—'}</div></div>
          <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">R$/cab Méd.</div><div className="font-bold text-[12px] tabular-nums">{totais.animais > 0 ? brl(totais.valorNegociado / totais.animais) : '—'}</div></div>
          <div className="rounded-md border bg-muted/20 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">R$/kg Méd.</div><div className="font-bold text-[12px] tabular-nums">{totais.pesoTotal > 0 ? brl(totais.valorNegociado / totais.pesoTotal) : '—'}</div></div>
          <div className="rounded-md border-2 border-primary/40 bg-primary/5 px-1.5 py-0.5"><div className="text-[9px] text-muted-foreground leading-none">Valor Principal</div><div className="font-bold text-[13px] text-primary tabular-nums">{brl(totais.valorNegociado)}</div></div>
        </div>
      </div>
    );
  }

  // ── MODO LEGADO: linha read-only (inalterado) ──
  return <NegociacaoLegado categoria={categoria} categoriasDisponiveis={categoriasDisponiveis} quantidadeNum={quantidadeNum} pesoKgNum={pesoKgNum} darkSelectClass={darkSelectClass} />;
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
