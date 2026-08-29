/**
 * VendaMetaModalShell — a Venda em cenário META, no formulário simples.
 *
 * PR-ZOO-VENDA-META-01, no padrão do CompraMetaModalShell. Uma projeção de venda não tem
 * nota fiscal emitida, recebimento nem parcelas liquidadas — tem cabeças, peso, preço
 * esperado e comprador previsto.
 *
 * ⚠ ESTE SHELL NAO SERVE O BOITEL. Boitel tem planejamento próprio (BoitelPlanningDialog),
 * ramo próprio na trava do registro e resumo próprio; ele continua no formulário genérico
 * até ganhar aba na OC. O predicado `vendaMetaNoEnvelope` no caller o exclui.
 *
 * ⚠ NENHUMA OPERACAO COMERCIAL E CRIADA AQUI. A venda nunca virou OC — nem em realizado.
 * Medido: as 32 linhas de `zoo_operacoes_comerciais` são todas de compra.
 *
 * ⚠ O PRECO NAO PRECISOU DE CONSERTO NO WRITER, ao contrário da compra. `calc.valorBruto`
 * da venda já usa `vendaPrecoInput` × `vendaTipoPreco`, ambos estado da página — e
 * `valorTotalFinal` já o consome. O que faltava era só trazer os dois controles para cá,
 * e eles vieram extraídos, não reescritos: `CampoPrecoVenda`.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { CampoPrecoVenda } from '@/components/venda/CampoPrecoVenda';
import type { Categoria, BasePrecoVenda } from '@/types/cattle';
import { LancamentoModalEnvelope } from '@/components/lancamento/LancamentoModalEnvelope';

/* A fazenda no resumo pode estar FALTANDO e bloquear o registro — traco cinza diria
   "ausente, tudo bem"; aqui a ausencia e' erro a resolver. */
function LinhaResumoFazenda({ valor, falta }: { valor: string | null; falta: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">Fazenda</span>
      <span className={`font-medium text-right truncate ${falta ? 'text-destructive' : ''}`}>{valor || '—'}</span>
    </div>
  );
}

/* Par rotulo-valor do resumo lateral — idioma do `Linha` de ResumoLateralOC (A17).
   ⚠ QUINTA COPIA deste par (Nascimento, Morte, Compra meta, aqui). Sai na mesma extracao
   que levar o resumo para o envelope — divida no topo do MorteModalShell. */
function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="font-medium text-right truncate">{valor || '—'}</span>
    </div>
  );
}

interface MascaraInput {
  displayValue: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onFocus: () => void;
}

export interface VendaMetaModalShellProps {
  modo?: 'criacao' | 'edicao';
  data: string;
  setData: (v: string) => void;
  qtdInput: MascaraInput;
  pesoInput: MascaraInput;
  categoria: string;
  setCategoria: (v: Categoria) => void;
  categoriasDisponiveis: { value: string; label: string }[];
  observacao: string;
  setObservacao: (v: string) => void;
  /** O COMPRADOR. Na venda a contraparte compra; o campo e o mesmo `fornecedorId`. */
  compradorId: string;
  setCompradorId: (v: string) => void;
  contrapartes: { id: string; nome: string }[];
  /** Só na edição — ver CompraMetaModalShell: o modal soberano não carrega a lista. */
  clienteIdParaContraparte?: string;
  notaFiscal: string;
  setNotaFiscal: (v: string) => void;
  vendaTipoPreco: BasePrecoVenda;
  setVendaTipoPreco: (v: BasePrecoVenda) => void;
  vendaPrecoInput: string;
  setVendaPrecoInput: (v: string) => void;
  /** Tipo de venda: desmama ou gado adulto. Boitel não chega aqui. */
  vendaTipoVenda: string;
  setVendaTipoVenda: (v: string) => void;
  /** ⚠ Na venda a fazenda e' ORIGEM — o gado sai dela. */
  vendaFazendaId: string;
  setVendaFazendaId: (v: string) => void;
  fazendasOC: { id: string; nome: string }[];
  vendaFazendaNome: string | null;
  vendaFazendaFalta: boolean;
  vendaQtd: number;
  vendaPeso: number;
  /** O MESMO numero que o writer grava — `calc.valorBruto`. O shell não recalcula. */
  valorPrevisto: number | null;
  submitting: boolean;
  handleRequestRegister: () => void;
  fecharModalOCComAutosave: () => void;
}

export function VendaMetaModalShell({
  modo = 'criacao', data, setData, qtdInput, pesoInput, categoria, setCategoria,
  categoriasDisponiveis, observacao, setObservacao,
  compradorId, setCompradorId, contrapartes, clienteIdParaContraparte,
  notaFiscal, setNotaFiscal,
  vendaTipoPreco, setVendaTipoPreco, vendaPrecoInput, setVendaPrecoInput,
  vendaTipoVenda, setVendaTipoVenda,
  vendaFazendaId, setVendaFazendaId, fazendasOC, vendaFazendaNome, vendaFazendaFalta,
  vendaQtd, vendaPeso, valorPrevisto, submitting,
  handleRequestRegister, fecharModalOCComAutosave,
}: VendaMetaModalShellProps) {
  const isEdicao = modo === 'edicao';
  /* ⚠ AUSENCIA E' TRACO. Sem quantidade ou sem peso nao ha peso total.
     ⚠ ARROBA POR PESO VIVO: peso total / 30. A divisao por 15 e' de carcaca, so' no abate. */
  const pesoTotal = vendaQtd > 0 && vendaPeso > 0 ? vendaQtd * vendaPeso : null;
  const fmtNum2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const compradorNome = contrapartes.find(f => f.id === compradorId)?.nome ?? null;
  const CAMPO_TRAVADO = 'bg-muted border-border/60 text-muted-foreground';

  return (
    <LancamentoModalEnvelope
      titulo="Venda em pé"
      cenario="meta"
      data={data}
      fazendaNome={vendaFazendaNome}
      onFechar={fecharModalOCComAutosave}
      resumo={<>
        <div className="pb-1">
          <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Identificação</span>
          </div>
          <div className="px-3 space-y-0.5">
            <LinhaResumo rotulo="Tipo" valor="Venda em pé" />
            <LinhaResumo rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
            <LinhaResumoFazenda valor={vendaFazendaNome} falta={vendaFazendaFalta} />
            <LinhaResumo rotulo="Categoria" valor={categoriasDisponiveis.find(c => c.value === categoria)?.label ?? null} />
            <LinhaResumo rotulo="Comprador" valor={compradorNome} />
            <LinhaResumo rotulo="Tipo de venda" valor={vendaTipoVenda === 'desmama' ? 'Desmama' : vendaTipoVenda === 'gado_adulto' ? 'Gado adulto' : null} />
            <div className="flex items-baseline justify-between gap-1.5 leading-tight">
              <span className="text-muted-foreground shrink-0">Cenário</span>
              <span className="font-medium text-right text-amber-800 dark:text-amber-400">Meta</span>
            </div>
          </div>

          <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Rebanho</span>
          </div>
          <div className="px-3 space-y-0.5">
            <LinhaResumo rotulo="Cabeças" valor={vendaQtd > 0 ? `${vendaQtd} cab` : null} />
            <LinhaResumo rotulo="Peso médio" valor={vendaPeso > 0 ? `${fmtNum2(vendaPeso)} kg` : null} />
            <LinhaResumo rotulo="Peso total" valor={pesoTotal != null ? `${fmtNum2(pesoTotal)} kg` : null} />
            <LinhaResumo rotulo="Arrobas" valor={pesoTotal != null ? `${fmtNum2(pesoTotal / 30)} @` : null} />
          </div>

          <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Financeiro</span>
          </div>
          <div className="px-3 space-y-0.5">
            <LinhaResumo rotulo="Valor previsto" valor={valorPrevisto != null ? brl(valorPrevisto) : null} />
          </div>
          <div className="px-3 pt-1 text-muted-foreground leading-tight">
            Projeção — não gera lançamento financeiro nem operação comercial.
          </div>
        </div>
      </>}
      acao={<>
        <Button type="button" onClick={handleRequestRegister} disabled={submitting || vendaFazendaFalta}
          className="bg-white text-primary hover:bg-white/90 font-bold disabled:opacity-60"
          title={vendaFazendaFalta ? 'Selecione a fazenda do lançamento'
            : isEdicao ? 'Salvar as alterações da venda planejada' : 'Registrar a venda planejada'}
          aria-label={isEdicao ? 'Salvar alterações' : 'Registrar meta'}>
          {isEdicao
            ? (submitting ? 'Salvando…' : 'Salvar alterações')
            : (submitting ? 'Registrando…' : 'Registrar meta')}
        </Button>
      </>}
    >
      <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
        <div className="text-[15px] font-medium text-foreground">Identificação da venda</div>

        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
          <div className="min-w-0">
            <div className="text-[11px] font-normal text-muted-foreground leading-none">Fazenda</div>
            <div className={`mt-1 text-[20px] font-medium leading-none truncate ${vendaFazendaFalta ? 'text-destructive' : ''}`}>
              {vendaFazendaNome ?? '—'}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-normal text-muted-foreground leading-none">Data prevista</div>
            <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
              {data ? data.split('-').reverse().join('/') : <span className="text-muted-foreground">—</span>}
            </div>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Fazenda{!isEdicao && <span className="text-destructive"> *</span>}</Label>
            {/* ⚠ NA EDICAO NAO HA SELETOR: `editarLancamento` nao envia `fazenda_id`. */}
            {isEdicao ? (
              <Input readOnly value={vendaFazendaNome ?? '—'} title="A fazenda do lançamento não muda por aqui"
                className={`mt-[3px] h-8 px-2.5 text-[12px] ${CAMPO_TRAVADO}`} />
            ) : (
              <Select value={vendaFazendaId} onValueChange={setVendaFazendaId}>
                <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${vendaFazendaFalta ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="Selecione a fazenda" />
                </SelectTrigger>
                <SelectContent>
                  {fazendasOC.map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {vendaFazendaFalta && (
              <p className="mt-[3px] text-[10px] text-destructive">Selecione a fazenda do lançamento.</p>
            )}
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Data prevista <span className="text-destructive">*</span></Label>
            {/* A20 — DatePicker do sistema, nunca `<input type="date">`. */}
            <DatePicker value={data} onChange={setData} className="mt-[3px] h-8 px-2.5 text-[12px]" />
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Qtd. cabeças <span className="text-destructive">*</span></Label>
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
            {/* ⚠ SEM BOITEL. Ele nao chega a este shell — ver `vendaMetaNoEnvelope`. */}
            <Label className="text-[10px] text-muted-foreground">Tipo de venda</Label>
            <Select value={vendaTipoVenda} onValueChange={setVendaTipoVenda}>
              <SelectTrigger className="mt-[3px] h-8 px-2.5 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desmama" className="text-[12px]">Desmama</SelectItem>
                <SelectItem value="gado_adulto" className="text-[12px]">Gado adulto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            {/* ⚠ O COMPRADOR, e nao o fornecedor. O campo e' o mesmo — `fornecedorId` —,
                e o sentinel '[META] Planejamento' serve igual: e' a contraparte de
                projecao, e nao importa se ela compra ou vende. */}
            <Label className="text-[10px] text-muted-foreground">Comprador</Label>
            <div className="mt-[3px]">
              {isEdicao && clienteIdParaContraparte ? (
                <FornecedorSelect
                  fornecedorId={compradorId || null}
                  onFornecedorChange={(id) => setCompradorId(id ?? '')}
                  clienteId={clienteIdParaContraparte}
                  placeholder="Selecione o comprador"
                />
              ) : (
                <SearchableSelect
                  value={compradorId || '__all__'}
                  onValueChange={(v) => setCompradorId(v === '__all__' ? '' : v)}
                  options={contrapartes.map(f => ({ value: f.id, label: f.nome }))}
                  placeholder="Selecione o comprador"
                  allLabel="Nenhum selecionado"
                  allValue="__all__"
                  className="[&_button]:h-8 [&_button]:text-[12px] [&_button]:px-2.5"
                />
              )}
            </div>
          </div>
          <div className="min-w-0 lg:col-span-2 space-y-1.5">
            {/* ⚠ CONTROLE EXTRAIDO do VendaFinanceiroPanel, nao reescrito. A tipografia
                do envelope entra por prop; o painel nao passa nada e continua igual. */}
            <Label className="text-[10px] text-muted-foreground">Preço previsto</Label>
            <CampoPrecoVenda
              vendaTipoPreco={vendaTipoPreco}
              onVendaTipoPrecoChange={setVendaTipoPreco}
              vendaPrecoInput={vendaPrecoInput}
              onVendaPrecoInputChange={setVendaPrecoInput}
              alturaBotao="h-8"
              classeCampo="h-8 px-2.5 text-[12px] text-right tabular-nums"
              classeRotulo="text-[10px] text-muted-foreground"
            />
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Nota Fiscal</Label>
            <Input value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="Opcional"
              className="mt-[3px] h-8 px-2.5 text-[12px]" />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <Label className="text-[10px] text-muted-foreground">Observações / Lote</Label>
            <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional"
              className="mt-[3px] h-8 px-2.5 text-[12px]" />
          </div>
        </div>
      </div>
    </LancamentoModalEnvelope>
  );
}
