/**
 * VendaModalShell — a Venda como Operação Comercial. Aba de identificação.
 *
 * ⚠ PRIMEIRA DE SEIS. Este arquivo entrega SO a aba "Venda". Negociação, Entrega,
 * Documentos, Financeiro e Auditoria vêm uma por vez, e a sétima — Boitel — só aparece
 * quando o tipo de venda é boitel.
 *
 * ⚠ DIVIDA DECLARADA: QUINTA CASCA DO SISTEMA, SEGUNDA COM FAIXA DE ABAS.
 * As outras quatro são CompraModalShell, LancamentoModalEnvelope (Nascimento e Morte),
 * CompraMetaModalShell e VendaMetaModalShell. Esta nasce irmã do CompraModalShell, e não
 * como parametrização dele, por uma razão de MOMENTO e não de mérito: as cinco abas
 * restantes é que vão dizer o que é comum entre compra e venda, e parametrizar agora
 * seria desenhar a junta antes de conhecer as duas peças.
 *
 * ⚠ O GATILHO DA EXTRACAO, escrito para não se perder:
 * quando as seis abas da venda estiverem prontas, medir linha a linha o que ficou
 * IDENTICO ao CompraModalShell e extrair pelo mesmo método do envelope — move verbatim,
 * com md5 antes e depois. O precedente é PR-ZOO-META-COMPRA-EDICAO-01 / o envelope de
 * PR-ZOO-VENDA-META-01: a extração saiu na TERCEIRA cópia, depois de a duplicação ser
 * medida, e deu certo porque quando saiu já se sabia o que era comum.
 *
 * ⚠ NAO COPIEI O QUE A VENDA NAO USA. Ficaram de fora `compraDetalhes`,
 * `CompraLotesApi`, `CompraPermissoesPorEixo`, o diálogo de detalhes e os gates por eixo
 * — nenhum deles tem consumidor nesta aba. Entram quando a aba que precisar deles chegar.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Calendar, Building2, X, Plus, ArrowRight } from 'lucide-react';
import type { Categoria } from '@/types/cattle';

/* ⚠ "RECEBIMENTO" CHAMA-SE ENTREGA NA VENDA — o gado SAI. A coluna do banco já é
   genérica (`entrega_encerrada`), então o vocabulário muda só na tela.
   ⚠ A sétima aba, Boitel, entra por `tipoVenda` e não faz parte desta lista fixa. */
const ABAS_VENDA = [
  { key: 'venda', label: 'Venda', enabled: true },
  { key: 'negociacao', label: 'Negociação', enabled: false },
  { key: 'entrega', label: 'Entrega', enabled: false },
  { key: 'documentos', label: 'Documentos', enabled: false },
  { key: 'financeiro', label: 'Financeiro', enabled: false },
  { key: 'auditoria', label: 'Auditoria', enabled: false },
] as const;

/* Par rotulo-valor do resumo lateral — idioma do `Linha` de ResumoLateralOC (A17).
   ⚠ SEXTA COPIA deste par. Sai na mesma extracao que levar o resumo para lugar unico. */
function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="font-medium text-right truncate">{valor || '—'}</span>
    </div>
  );
}

export interface VendaModalShellProps {
  data: string;
  setData: (v: string) => void;
  /** O COMPRADOR. Contraparte da operação — `contraparte_id` na OC. */
  compradorId: string;
  setCompradorId: (v: string) => void;
  contrapartes: { id: string; nome: string }[];
  onNovoComprador: () => void;
  /** ⚠ A fazenda de ORIGEM: o gado sai dela. */
  vendaFazendaId: string;
  setVendaFazendaId: (v: string) => void;
  fazendasOC: { id: string; nome: string }[];
  /** Texto livre — a propriedade de quem compra, quando se sabe. */
  propriedadeDestino: string;
  setPropriedadeDestino: (v: string) => void;
  vendaTipoVenda: string;
  setVendaTipoVenda: (v: string) => void;
  observacao: string;
  setObservacao: (v: string) => void;
  ocOperacaoId: string | null;
  ocStatusComercial: string | null;
  submitting: boolean;
  onSalvarOperacao: () => void;
  onFechar: () => void;
}

export function VendaModalShell({
  data, setData, compradorId, setCompradorId, contrapartes, onNovoComprador,
  vendaFazendaId, setVendaFazendaId, fazendasOC,
  propriedadeDestino, setPropriedadeDestino,
  vendaTipoVenda, setVendaTipoVenda, observacao, setObservacao,
  ocOperacaoId, ocStatusComercial, submitting, onSalvarOperacao, onFechar,
}: VendaModalShellProps) {
  const [abaAtiva, setAbaAtiva] = useState<string>('venda');
  const compradorNome = contrapartes.find(f => f.id === compradorId)?.nome ?? null;
  const fazendaNome = fazendasOC.find(f => f.id === vendaFazendaId)?.nome ?? null;
  const isBoitel = vendaTipoVenda === 'boitel';

  /* ⚠ A ABA DE BOITEL APARECE E SOME, MAS O DADO NAO. Trocar o tipo esconde a aba;
     o que o operador preencheu continua no estado, e volta se ele voltar ao boitel.
     Nenhum campo desta aba e' limpo por troca de tipo. */
  const abas = isBoitel
    ? [...ABAS_VENDA, { key: 'boitel', label: 'Boitel', enabled: false } as const]
    : ABAS_VENDA;

  const fazendaFalta = !vendaFazendaId;
  const podeSalvar = !!compradorId && !!vendaFazendaId && !!data && !!vendaTipoVenda;

  return (
    <div className="flex flex-col">
      {/* CABECALHO — medidas do CompraModalShell: `px-6 py-2.5`. */}
      <div className="bg-primary text-primary-foreground px-6 py-2.5 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold leading-tight">Venda de animais</h2>
            <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs">OC (novo)</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {data ? data.split('-').reverse().join('/') : '—'}</span>
            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {fazendaNome ?? '—'}</span>
          </div>
        </div>
        <button type="button" onClick={onFechar} className="text-white/80 hover:text-white shrink-0"
          title="Fechar" aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>

      {/* BARRA DE ABAS — template do CompraModalShell (bg-card, border-b, px-6 py-3). */}
      <div className="bg-card border-b px-6 py-3 flex items-center gap-1">
        {abas.map(a => {
          const active = a.key === abaAtiva && a.enabled;
          return (
            <button key={a.key} type="button" disabled={!a.enabled}
              onClick={() => a.enabled && setAbaAtiva(a.key)}
              title={a.enabled ? undefined : 'em breve'}
              className={`h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                active ? 'bg-primary/10 text-primary'
                : a.enabled ? 'text-muted-foreground hover:bg-muted/50'
                : 'text-muted-foreground/40 cursor-not-allowed'}`}>
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:grid-rows-[minmax(0,1fr)] gap-3 p-4 h-[69vh] overflow-y-auto lg:overflow-hidden bg-muted/30">
        <div className="space-y-2 min-w-0 lg:min-h-0 lg:overflow-y-auto">
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
            <div className="text-[15px] font-medium text-foreground">Identificação da venda</div>

            {/* FAIXA DE TOPO — rotulo 11px/400, valor 20px/500. */}
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Comprador</div>
                <div className="mt-1 text-[20px] font-medium leading-none truncate">{compradorNome ?? '—'}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Data da venda</div>
                <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                  {data ? data.split('-').reverse().join('/') : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </div>
            <Separator />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Comprador <span className="text-destructive">*</span></Label>
                <div className="mt-[3px] flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      value={compradorId || '__all__'}
                      onValueChange={(v) => setCompradorId(v === '__all__' ? '' : v)}
                      options={contrapartes.map(f => ({ value: f.id, label: f.nome }))}
                      placeholder="Selecione ou cadastre o comprador"
                      allLabel="Nenhum selecionado"
                      allValue="__all__"
                      className="[&_button]:h-8 [&_button]:text-[12px] [&_button]:px-2.5"
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onNovoComprador}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Data da venda <span className="text-destructive">*</span></Label>
                {/* A20 — DatePicker do sistema, nunca `<input type="date">`. */}
                <DatePicker value={data} onChange={setData} className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
              <div className="min-w-0">
                {/* ⚠ ORIGEM, e nao destino: numa venda o gado SAI da fazenda. */}
                <Label className="text-[10px] text-muted-foreground">Fazenda de origem <span className="text-destructive">*</span></Label>
                <Select value={vendaFazendaId} onValueChange={setVendaFazendaId}>
                  <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${fazendaFalta ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="Selecione a fazenda" />
                  </SelectTrigger>
                  <SelectContent>
                    {fazendasOC.map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {fazendaFalta && (
                  <p className="mt-[3px] text-[10px] text-destructive">Selecione a fazenda de origem.</p>
                )}
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Propriedade de destino</Label>
                <Input value={propriedadeDestino} onChange={e => setPropriedadeDestino(e.target.value)} placeholder="Opcional"
                  className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Tipo de venda <span className="text-destructive">*</span></Label>
                <Select value={vendaTipoVenda} onValueChange={setVendaTipoVenda}>
                  <SelectTrigger className="mt-[3px] h-8 px-2.5 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gado_adulto" className="text-[12px]">Gado adulto</SelectItem>
                    <SelectItem value="desmama" className="text-[12px]">Desmama</SelectItem>
                    <SelectItem value="boitel" className="text-[12px]">Boitel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 lg:col-span-2">
                <Label className="text-[10px] text-muted-foreground">Observações / Lote</Label>
                <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional"
                  className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
            </div>
          </div>
        </div>

        {/* RESUMO LATERAL — idioma do ResumoLateralOC. */}
        <div className="lg:min-h-0 lg:overflow-y-auto">
          <aside className="bg-card rounded-md border shadow-sm overflow-hidden self-start text-[10px]">
            <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
              Resumo da operação
            </div>
            <div className="pb-1">
              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Identificação</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Comprador" valor={compradorNome} />
                <LinhaResumo rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
                <LinhaResumo rotulo="Fazenda" valor={fazendaNome} />
                <LinhaResumo rotulo="Tipo" valor={vendaTipoVenda === 'gado_adulto' ? 'Gado adulto' : vendaTipoVenda === 'desmama' ? 'Desmama' : vendaTipoVenda === 'boitel' ? 'Boitel' : null} />
              </div>

              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Negociação</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Lotes" valor={null} />
                <LinhaResumo rotulo="Valor acordado" valor={null} />
              </div>

              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Entrega</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Entregue" valor={null} />
                <LinhaResumo rotulo="Saldo a entregar" valor={null} />
              </div>

              {/* ⚠ A RECEBER, e nao "Lancado". Numa venda o dinheiro ENTRA — o vocabulario
                  do financeiro inverte junto com o sentido da operacao. */}
              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Financeiro</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="A receber" valor={null} />
                <LinhaResumo rotulo="Recebido" valor={null} />
                <LinhaResumo rotulo="Saldo" valor={null} />
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="bg-primary px-6 py-2 flex items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onFechar}
          className="text-white/90 hover:bg-white/10 hover:text-white" title="Fechar sem salvar" aria-label="Fechar">
          Fechar
        </Button>
        <Button type="button" onClick={onSalvarOperacao} disabled={submitting || !podeSalvar || ocStatusComercial === 'cancelada'}
          className="bg-white text-primary hover:bg-white/90 font-bold gap-1.5 disabled:opacity-60"
          title={podeSalvar ? undefined : 'Informe comprador, data, fazenda e tipo de venda'}>
          {submitting ? 'Salvando...'
            : ocOperacaoId ? 'Salvar alterações'
            : (<>Salvar e continuar para Negociação <ArrowRight className="h-4 w-4" /></>)}
        </Button>
      </div>
    </div>
  );
}
