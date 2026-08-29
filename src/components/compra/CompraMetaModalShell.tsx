/**
 * CompraMetaModalShell — a Compra em cenário META, no formulário simples.
 *
 * ⚠ POR QUE EXISTE UM SEGUNDO SHELL DE COMPRA. No realizado, comprar É abrir uma
 * Operação Comercial: contraparte, documento, recebimento, liquidação — e o
 * `CompraModalShell` com suas abas. Em meta nada disso tem sentido: uma projeção não tem
 * nota fiscal nem pagamento. Quando a Compra migrou para a OC, o caminho de meta dela
 * sumiu da tela — e mesmo assim há 9 compras de meta gravadas, por um caminho que
 * existia e deixou de existir. Este shell devolve esse caminho.
 *
 * ⚠ NENHUMA OPERAÇÃO COMERCIAL É CRIADA AQUI. É lançamento em `lancamentos`, como
 * nascimento e morte. A criação de OC é governada por `modoOCCompra` (parâmetro de URL
 * `oc_compra=1`), que a rota de meta não aciona. Medido: as 32 linhas de
 * `zoo_operacoes_comerciais` são todas de cenário realizado.
 *
 * ⚠ CAMPOS PRESERVADOS, NÃO REDESENHADOS. Os onze campos abaixo são os que o formulário
 * antigo pedia a uma compra — medidos no ramo genérico do LancamentosTab antes de montar
 * esta tela. Nada foi acrescentado e nada foi tirado; o que muda é a casca.
 * Forma de Pagamento e Comissão/Frete não aparecem porque já não apareciam em meta:
 * são condicionadas a `isConfirmado || isConciliado`, ambos falsos ali.
 *
 * ⚠ SEM O DIÁLOGO "Completar Compra". O funil exigia `compraDetalhes` em todo cenário
 * enquanto a linha seguinte já dispensava meta — duas exigências contraditórias no mesmo
 * lugar. Agora as duas perguntam `exigeDetalheFinanceiro`. O preço em meta vem dos campos
 * desta tela (R$/kg base, Bônus, Descontos), que são os mesmos de antes.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { Categoria } from '@/types/cattle';
import { LancamentoModalEnvelope } from '@/components/lancamento/LancamentoModalEnvelope';

/* A fazenda no resumo tem um estado que os outros pares nao tem: ela pode estar FALTANDO
   e bloquear o registro. Traco cinza diria "ausente, tudo bem"; aqui a ausencia e' erro a
   resolver, e a cor precisa dizer isso. */
function LinhaResumoFazenda({ valor, falta }: { valor: string | null; falta: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">Fazenda</span>
      <span className={`font-medium text-right truncate ${falta ? 'text-destructive' : ''}`}>{valor || '—'}</span>
    </div>
  );
}

/* Par rotulo-valor do resumo lateral — mesmo idioma do `Linha` de ResumoLateralOC (A17).
   ⚠ Quarta copia deste par, junto com a do Nascimento e a da Morte. Sai na mesma
   extracao que levar o resumo para o envelope — ver a divida no topo do
   MorteModalShell. */
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

export interface CompraMetaModalShellProps {
  data: string;
  setData: (v: string) => void;
  qtdInput: MascaraInput;
  pesoInput: MascaraInput;
  categoria: string;
  setCategoria: (v: Categoria) => void;
  categoriasDisponiveis: { value: string; label: string }[];
  observacao: string;
  setObservacao: (v: string) => void;
  /** Texto livre — no formulário antigo o rótulo é "Fornecedor / Fazenda Origem". */
  fazendaOrigem: string;
  setFazendaOrigem: (v: string) => void;
  compraFornecedorId: string;
  setCompraFornecedorId: (v: string) => void;
  fornecedores: { id: string; nome: string }[];
  notaFiscal: string;
  setNotaFiscal: (v: string) => void;
  precoKgBase: string;
  setPrecoKgBase: (v: string) => void;
  bonus: string;
  setBonus: (v: string) => void;
  descontos: string;
  setDescontos: (v: string) => void;
  /* ⚠ A COMPRA GANHOU SELETOR DE FAZENDA em PR-ZOO-META-COMPRA-FAZENDA-01. Antes ela
     herdava do contexto em silencio, e por isso era a unica do envelope que nao podia
     ser lancada em modo Global — Nascimento e Morte ja podiam. */
  compraFazendaId: string;
  setCompraFazendaId: (v: string) => void;
  fazendasOC: { id: string; nome: string }[];
  compraFazendaNome: string | null;
  compraFazendaFalta: boolean;
  compraQtd: number;
  compraPeso: number;
  submitting: boolean;
  handleRequestRegister: () => void;
  fecharModalOCComAutosave: () => void;
}

export function CompraMetaModalShell({
  data, setData, qtdInput, pesoInput, categoria, setCategoria, categoriasDisponiveis,
  observacao, setObservacao, fazendaOrigem, setFazendaOrigem,
  compraFornecedorId, setCompraFornecedorId, fornecedores,
  notaFiscal, setNotaFiscal, precoKgBase, setPrecoKgBase,
  bonus, setBonus, descontos, setDescontos,
  compraFazendaId, setCompraFazendaId, fazendasOC, compraFazendaNome, compraFazendaFalta,
  compraQtd, compraPeso, submitting,
  handleRequestRegister, fecharModalOCComAutosave,
}: CompraMetaModalShellProps) {
  /* ⚠ AUSENCIA E' TRACO. Sem quantidade ou sem peso nao ha peso total — nao ha "peso
     total de zero". Nenhum `?? 0` no caminho.
     ⚠ ARROBA POR PESO VIVO: peso total / 30. A divisao por 15 e' de CARCACA e vale so
     no abate. */
  const pesoTotal = compraQtd > 0 && compraPeso > 0 ? compraQtd * compraPeso : null;
  const fmtNum2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fornecedorNome = fornecedores.find(f => f.id === compraFornecedorId)?.nome ?? null;

  /* Valor previsto = peso total × R$/kg base, mais bonus, menos descontos — a mesma
     composicao dos campos do formulario antigo. NULL quando nao ha o que multiplicar. */
  const precoKgNum = Number(String(precoKgBase).replace(',', '.')) || 0;
  const valorPrevisto = pesoTotal != null && precoKgNum > 0
    ? pesoTotal * precoKgNum + (Number(bonus) || 0) - (Number(descontos) || 0)
    : null;
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <LancamentoModalEnvelope
      titulo="Compra"
      cenario="meta"
      data={data}
      fazendaNome={compraFazendaNome}
      onFechar={fecharModalOCComAutosave}
      resumo={<>
        <div className="pb-1">
          <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Identificação</span>
          </div>
          <div className="px-3 space-y-0.5">
            <LinhaResumo rotulo="Tipo" valor="Compra" />
            <LinhaResumo rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
            <LinhaResumoFazenda valor={compraFazendaNome} falta={compraFazendaFalta} />
            <LinhaResumo rotulo="Categoria" valor={categoriasDisponiveis.find(c => c.value === categoria)?.label ?? null} />
            <LinhaResumo rotulo="Fornecedor" valor={fornecedorNome} />
            <div className="flex items-baseline justify-between gap-1.5 leading-tight">
              <span className="text-muted-foreground shrink-0">Cenário</span>
              <span className="font-medium text-right text-amber-800 dark:text-amber-400">Meta</span>
            </div>
          </div>

          <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Rebanho</span>
          </div>
          <div className="px-3 space-y-0.5">
            <LinhaResumo rotulo="Cabeças" valor={compraQtd > 0 ? `${compraQtd} cab` : null} />
            <LinhaResumo rotulo="Peso médio" valor={compraPeso > 0 ? `${fmtNum2(compraPeso)} kg` : null} />
            <LinhaResumo rotulo="Peso total" valor={pesoTotal != null ? `${fmtNum2(pesoTotal)} kg` : null} />
            <LinhaResumo rotulo="Arrobas" valor={pesoTotal != null ? `${fmtNum2(pesoTotal / 30)} @` : null} />
          </div>

          <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Financeiro</span>
          </div>
          <div className="px-3 space-y-0.5">
            <LinhaResumo rotulo="R$/kg base" valor={precoKgNum > 0 ? brl(precoKgNum) : null} />
            <LinhaResumo rotulo="Valor previsto" valor={valorPrevisto != null ? brl(valorPrevisto) : null} />
          </div>
          <div className="px-3 pt-1 text-muted-foreground leading-tight">
            Projeção — não gera lançamento financeiro nem operação comercial.
          </div>
        </div>
      </>}
      acao={<>
        <Button type="button" onClick={handleRequestRegister} disabled={submitting || !compraFornecedorId || compraFazendaFalta}
          className="bg-white text-primary hover:bg-white/90 font-bold disabled:opacity-60"
          title={compraFazendaFalta ? 'Selecione a fazenda do lançamento'
            : !compraFornecedorId ? 'Selecione o fornecedor' : 'Registrar a compra planejada'}
          aria-label="Registrar meta">
          {submitting ? 'Registrando…' : 'Registrar meta'}
        </Button>
      </>}
    >
      <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
        <div className="text-[15px] font-medium text-foreground">Identificação da compra</div>

        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
          <div className="min-w-0">
            <div className="text-[11px] font-normal text-muted-foreground leading-none">Fazenda</div>
            <div className={`mt-1 text-[20px] font-medium leading-none truncate ${compraFazendaFalta ? 'text-destructive' : ''}`}>
              {compraFazendaNome ?? '—'}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Fazenda <span className="text-destructive">*</span></Label>
            <Select value={compraFazendaId} onValueChange={setCompraFazendaId}>
              <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${compraFazendaFalta ? 'border-destructive' : ''}`}>
                <SelectValue placeholder="Selecione a fazenda" />
              </SelectTrigger>
              <SelectContent>
                {fazendasOC.map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {compraFazendaFalta && (
              <p className="mt-[3px] text-[10px] text-destructive">Selecione a fazenda do lançamento.</p>
            )}
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Data prevista <span className="text-destructive">*</span></Label>
            {/* A20 — DatePicker do sistema, nunca `<input type="date">`. */}
            <DatePicker value={data} onChange={setData} className="mt-[3px] h-8 px-2.5 text-[12px]" />
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
            <Label className="text-[10px] text-muted-foreground">Qtd. cabeças <span className="text-destructive">*</span></Label>
            <Input inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus}
              placeholder="0" className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Peso médio <span className="text-destructive">*</span></Label>
            <Input inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus}
              placeholder="0,00" className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
          </div>
          <div className="min-w-0">
            {/* ⚠ ABRE COM O SENTINEL '[META] Planejamento' do cliente, e continua EDITAVEL.
                Uma projecao nao tem fornecedor real; o sentinel e' a contraparte de
                sistema criada em PR-ZOO-META-FORNECEDOR-SENTINEL-01. Travar o campo
                impediria projetar uma compra de fornecedor ja conhecido. */}
            <Label className="text-[10px] text-muted-foreground">Fornecedor <span className="text-destructive">*</span></Label>
            <div className="mt-[3px]">
              <SearchableSelect
                value={compraFornecedorId || '__all__'}
                onValueChange={(v) => setCompraFornecedorId(v === '__all__' ? '' : v)}
                options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
                placeholder="Selecione o fornecedor"
                allLabel="Nenhum selecionado"
                allValue="__all__"
                className="[&_button]:h-8 [&_button]:text-[12px] [&_button]:px-2.5"
              />
            </div>
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Fornecedor / Fazenda Origem</Label>
            <Input value={fazendaOrigem} onChange={e => setFazendaOrigem(e.target.value)} placeholder="Opcional"
              className="mt-[3px] h-8 px-2.5 text-[12px]" />
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">R$/kg (preço base)</Label>
            <Input inputMode="decimal" value={precoKgBase} onChange={e => setPrecoKgBase(e.target.value)} placeholder="0,00"
              className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Nota Fiscal</Label>
            <Input value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="Opcional"
              className="mt-[3px] h-8 px-2.5 text-[12px]" />
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Bônus</Label>
            <Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} placeholder="0"
              className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
          </div>
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Descontos</Label>
            <Input type="number" value={descontos} onChange={e => setDescontos(e.target.value)} placeholder="0"
              className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
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
