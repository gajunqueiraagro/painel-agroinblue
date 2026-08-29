/**
 * VendaModalShell — a Venda como Operação Comercial. Aba de identificação.
 *
 * ⚠ PRIMEIRA DE SEIS. Este arquivo entrega SO a aba "Venda". Negociação, Entrega,
 * Documentos, Financeiro e Auditoria vêm uma por vez. São seis, e não sete: o boitel
 * NÃO ganha aba própria — ele é a Negociação com campos a mais. Ver a nota em
 * `ABAS_VENDA`.
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
import type { CompraLotesApi } from '@/hooks/useCompraLotes';
import { AbaNegociacaoLotes } from '@/components/compra/AbaNegociacaoLotes';
import { BoitelBaseOperacional, BoitelResultadoCompacto } from '@/components/venda/BoitelNegociacaoDerivado';
import { BoitelBlocosModais, faltamDosCinco, type BoitelEdicao } from '@/components/venda/BoitelBlocosModais';

/* ⚠ "RECEBIMENTO" CHAMA-SE ENTREGA NA VENDA — o gado SAI. A coluna do banco já é
   genérica (`entrega_encerrada`), então o vocabulário muda só na tela.
   ⚠ NAO HA SETIMA ABA. O boitel chegou a ter uma e ela saiu: o boitel E' a negociacao,
   com campos a mais. Quantidade, peso, preco por arroba e valor total sao exatamente o
   que a Negociacao pergunta — uma aba separada deixaria a Negociacao vazia numa venda
   boitel, ou duplicada.
   ⚠ ONDE ELE FICOU: a aba de Negociacao BIFURCA por tipo de venda — lotes na venda
   comum, lotes MAIS a base operacional e o painel de resultado no boitel. Mesmo padrao
   do `AbaRecebimentoLotes`, ja bifurcado entre encerrado e aberto. Feito em
   PR-OC-VENDA-BOITEL-01A; a ENTRADA de dado do boitel e' do 01B. */
const ABAS_VENDA = [
  { key: 'venda', label: 'Venda', enabled: true },
  { key: 'negociacao', label: 'Negociação', enabled: true },
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
  /** Lotes da negociação — o mesmo hook da compra, que opera sobre `zoo_operacao_lotes`. */
  lotesApi?: CompraLotesApi;
  /** O planejamento do boitel EM MEMORIA. Os quatro modais o editam; quem persiste e' o
   *  botao da venda, numa chamada so' a `oc_salvar_boitel` — PR-OC-VENDA-BOITEL-01B. */
  boitelData?: BoitelEdicao | null;
  onBoitelChange?: (proximo: BoitelEdicao) => void;
  categoria: string;
  categoriasDisponiveis: { value: string; label: string }[];
  quantidadeNum: number;
  pesoKgNum: number;
  submitting: boolean;
  /* ⚠ DEVOLVE O QUE GRAVOU, e por isso nao e' `() => void`: o botao promete "continuar
     para Negociacao" e so' pode continuar se souber que a gravacao deu certo. Falsy = nao
     gravou, e a aba nao muda. */
  onSalvarOperacao: () => void | Promise<unknown>;
  /* ⚠ O RODAPE MUDA DE FUNCAO CONFORME A ABA. Na Venda ele grava a operacao; na
     Negociacao grava os lotes (e o planejamento do boitel, quando houver). Um botao so',
     duas acoes, porque e' sempre "salvar o que esta' na tela" — e e' o mesmo desenho do
     CompraModalShell, cujo rodape de Negociacao chama `lotesApi.salvar()`. */
  onSalvarNegociacao: () => void | Promise<unknown>;
  onFechar: () => void;
}

export function VendaModalShell({
  data, setData, compradorId, setCompradorId, contrapartes, onNovoComprador,
  vendaFazendaId, setVendaFazendaId, fazendasOC,
  propriedadeDestino, setPropriedadeDestino,
  vendaTipoVenda, setVendaTipoVenda, observacao, setObservacao,
  ocOperacaoId, ocStatusComercial, lotesApi, boitelData = null, onBoitelChange, categoria, categoriasDisponiveis,
  quantidadeNum, pesoKgNum, submitting, onSalvarOperacao, onSalvarNegociacao, onFechar,
}: VendaModalShellProps) {
  const [abaAtiva, setAbaAtiva] = useState<string>('venda');
  const compradorNome = contrapartes.find(f => f.id === compradorId)?.nome ?? null;
  const fazendaNome = fazendasOC.find(f => f.id === vendaFazendaId)?.nome ?? null;

  /* ⚠ O DADO PERSISTE NA TROCA DE TIPO, e isso nao mudou com a saida da aba: nenhum
     campo e' limpo quando o operador troca o tipo de venda. O que era guardado continua
     guardado — muda apenas ONDE vai aparecer, e sera' dentro da Negociacao. */

  const fazendaFalta = !vendaFazendaId;
  const identificacaoPronta = !!compradorId && !!vendaFazendaId && !!data && !!vendaTipoVenda;

  /* ⚠ A BIFURCACAO DA NEGOCIACAO, de PR-OC-VENDA-BOITEL-01A. O boitel NAO tem aba
     propria: ele e' a Negociacao com mais coisa. Venda comum mostra os lotes como
     sempre; venda boitel mostra os MESMOS lotes mais a base operacional e o painel de
     resultado. O elemento dos lotes e' construido UMA VEZ e usado nos dois ramos — os
     dois ramos com a mesma lista de props seria a mesma armadilha que fez o `brl`
     chegar a seis copias. */
  const ehBoitel = vendaTipoVenda === 'boitel';

  /* ⚠ A REGRA NAO E DAQUI. `faltamDosCinco` espelha a lista de `oc_salvar_boitel` para o
     botao poder impedir ANTES da chamada — a licao de 45a7352b, onde o operador so'
     descobria o impedimento no fim. Se as duas divergirem, quem manda e' a RPC, e o texto
     que o operador veria seria o dela. */
  const faltamBoitel = ehBoitel ? faltamDosCinco(boitelData) : [];
  const naNegociacao = abaAtiva === 'negociacao';

  /* ⚠ O BOITEL SO TRAVA NA ABA ONDE ELE E EDITADO. Ate' aqui a trava valia no rodape
     inteiro, e o efeito era o oposto do pretendido: numa venda boitel o operador nao
     conseguia nem CRIAR a operacao, porque os cinco campos moram na aba de Negociacao —
     que so' existe depois da operacao criada. */
  const podeSalvar = naNegociacao
    ? !!ocOperacaoId && faltamBoitel.length === 0
    : identificacaoPronta;
  const motivoNaoSalva = naNegociacao
    ? (!ocOperacaoId ? 'Salve a operação na aba Venda primeiro'
       : faltamBoitel.length > 0 ? `Planejamento do boitel incompleto. Falta ${faltamBoitel.join(', ')}.`
       : undefined)
    : (identificacaoPronta ? undefined : 'Informe comprador, data, fazenda e tipo de venda');

  /* A MESMA ABA DA COMPRA, com quatro textos trocados por prop. O lote e' identico nos
     dois: categoria, quantidade, peso, criterio e valor. Nenhum rotulo de CAMPO muda — o
     lote nao e' comprado nem vendido na tela, ele e' descrito. Vale igual para o boitel:
     o que ele acrescenta fica FORA deste elemento, nao dentro dele. */
  const abaLotes = (
    <AbaNegociacaoLotes
      categoria={categoria}
      categoriasDisponiveis={categoriasDisponiveis}
      quantidadeNum={quantidadeNum}
      pesoKgNum={pesoKgNum}
      darkSelectClass=""
      modoOC
      operacaoPronta={!!ocOperacaoId}
      lotesApi={lotesApi}
      somenteLeitura={ocStatusComercial === 'cancelada'}
      onVoltarCompra={() => setAbaAtiva('venda')}
      rotulos={{
        salveIdentificacao: 'Salve a identificação da venda para adicionar os lotes da negociação.',
        voltarParaIdentificacao: 'Voltar para Venda',
        salveOperacaoPrimeiro: 'Salve a operação na aba Venda primeiro',
        fisicoBloqueado: 'Esta venda já teve entrega: categoria, quantidade e peso ficam bloqueados. Critério e valor seguem editáveis.',
      }}
    />
  );

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
        {ABAS_VENDA.map(a => {
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
          {abaAtiva === 'negociacao' ? (
            ehBoitel ? (
              /* ⚠ AQUI NAO SE DIGITA O BOITEL. Base operacional e painel de resultado
                 sao LEITURA do que ja esta gravado. Os quatro modais de entrada de dado
                 sao de PR-OC-VENDA-BOITEL-01B — este PR nao os traz, e por isso a tela
                 diz em ambar o que falta em vez de oferecer onde preencher. */
              <div className="space-y-2 min-w-0">
                <BoitelBaseOperacional boitelData={boitelData} />
                {/* PR-BOITEL-ACORDEAO-01 — 1.5fr / 1fr, gap 14px. O acordeao a' esquerda, o
                    resultado a' direita. */}
                <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-[14px] items-start">
                  <div className="min-w-0 space-y-2">
                    {/* ⚠ O LOTE VEM PRIMEIRO, e a ordem nao e' estetica: ele e' o comeco da
                        negociacao. Sem lote nao ha cabecas nem peso, e os quatro blocos do
                        boitel nao tem sobre o que calcular — a base operacional do painel
                        deriva dele. Estava invertido, e a aba abria mostrando Adiantamento
                        antes de existir o que adiantar. */}
                    {abaLotes}
                    {/* ⚠ AS QUATRO SECOES SO APARECEM COM VALOR E COM ONCHANGE. Sem os dois
                        nao ha o que editar, e uma secao que nao abre nada seria a promessa
                        nao cumprida que o proprio botao desta tela ja evitou. A pendencia
                        aparece em ambar na LINHA FECHADA de cada secao. */}
                    {boitelData && onBoitelChange && (
                      <BoitelBlocosModais
                        valor={boitelData}
                        onChange={onBoitelChange}
                        somenteLeitura={ocStatusComercial === 'cancelada'}
                      />
                    )}
                  </div>
                  {/* ⚠ A21 — NAO ROLA COM A LISTA. `sticky top-0` dentro da coluna que rola;
                      o painel fica a' vista enquanto o operador percorre as secoes, que e' o
                      ponto: mexer na diaria OLHANDO a margem. */}
                  <div className="xl:sticky xl:top-0">
                    <BoitelResultadoCompacto boitelData={boitelData} />
                  </div>
                </div>
              </div>
            ) : abaLotes
          ) : (
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
          )}
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
        <Button type="button"
          onClick={async () => {
            if (naNegociacao) { await onSalvarNegociacao(); return; }
            /* ⚠ SO NA CRIACAO. Editando, o botao diz "Salvar alteracoes" e nao promete ir
               a lugar nenhum — mudar de aba ali seria tirar o operador de onde ele estava. */
            const criando = !ocOperacaoId;
            const gravou = await onSalvarOperacao();
            if (criando && gravou) setAbaAtiva('negociacao');
          }}
          disabled={submitting || !podeSalvar || ocStatusComercial === 'cancelada'}
          className="bg-white text-primary hover:bg-white/90 font-bold gap-1.5 disabled:opacity-60"
          title={motivoNaoSalva}>
          {/* O TEXTO VOLTOU AO DO MOCKUP em PR-OC-VENDA-ABA-NEGOCIACAO-01, porque agora
              ha para onde ir. Ele ficou em "Salvar operação" enquanto a Negociacao nao
              existia: promessa nao cumprida ensina a desconfiar do botao, do mesmo modo
              que alarme falso ensina a ignorar o alarme. */}
          {submitting ? 'Salvando...'
            : naNegociacao ? 'Salvar negociação'
            : ocOperacaoId ? 'Salvar alterações'
            : (<>Salvar e continuar para Negociação <ArrowRight className="h-4 w-4" /></>)}
        </Button>
      </div>
    </div>
  );
}
