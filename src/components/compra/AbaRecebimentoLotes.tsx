import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Undo2, Lock, FileText, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { parseNumericValue } from '@/lib/calculos/abate';
import { formatMed2 } from '@/lib/calculos/formatters';
import type { RecebimentoApi, EstadoRecebimento, LoteRecebimento } from '@/hooks/useOperacaoRecebimento';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import { DocumentoFormOC, FORM_VAZIO } from './DocumentoFormOC';

// Aba Recebimento (PR-OC-RECEB-01). Lotes negociados aparecem automaticamente; registro/estorno
//   por lote; "Receber todos conforme negociado"; divergência por lote; encerrar recebimento.
//   Peso médio recebido OPCIONAL (compra); peso negociado só referência. Nunca médio+total juntos.
interface Props {
  api: RecebimentoApi;
  operacaoPronta: boolean;      // ocOperacaoId presente
  concluida: boolean;           // status_comercial='fechada' (negociação concluída)
  encerrada: boolean;           // entrega_encerrada
  isCompra: boolean;
  categoriasDisponiveis: { value: string; label: string }[];  // catálogo oficial (tradução de slugs)
  documentosApi?: DocumentosApi;   // instância ÚNICA — registro rápido reutiliza a persistência oficial
  somenteLeitura?: boolean;     // OPEN-01: abertura de operação existente — aba read-only
  onVoltarNegociacao?: () => void;
}

/* ⚠ AS GRADES DE LOTE SAIRAM. `GRID` (onze colunas, com tres campos de entrada),
   `GRID_ENC` (seis, so leitura) e os seus `min-w`/`max-w` morreram com o cabecalho de
   coluna: PR-OC-A18-RECEBIMENTO-01 trocou a versao encerrada por lista de duas alturas
   e PR-OC-RECEB-REGISTRO-02 fez o mesmo com a aberta, levando os campos para um modal
   por lote. Sem coluna nao ha o que alinhar, e sem largura minima nao ha rolagem
   lateral — que era o defeito que aqueles pesos em pixel tentavam administrar.
   O bloco abaixo permanece porque a grade de MOVIMENTACOES continua sendo tabela. */
/* MOVIMENTACOES: era texto corrido separado por bolinhas, que nao alinha coluna
   nenhuma. Mesmas regras de cima. Acoes some junto com o "Estornar" que ela abriga
   — em somente leitura a coluna nao existe: coluna vazia ocupa espaco e ainda sugere
   que falta preencher algo.
     Data 72 · Categoria 110 · Quantidade 80 · Peso med. 80 · Acoes 90 = 432 (+24 de gap) */
const GRID_MOV = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-1.5';
const GRID_MOV_RO = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-1.5';
/* ⚠ PR-OC-UX-LOTE-C1-01 — `max-w` ENTROU, e e' ele que resolve o espaco em branco.
   `min-w` e' PISO, nao teto: o wrapper e' bloco e ocupava a largura inteira do corpo
   do modal (~1.100px), enquanto as colunas `minmax(0,Nfr)` esticavam para preencher.
   Conteudo de 456px espalhado em ~1.100px = ~130px de vazio POR COLUNA, que era o que
   se via entre Data, Categoria, Quantidade e Peso. O problema NUNCA foi altura de
   linha nem tamanho de fonte — esta aba ja usa text-[10px]/h-6/py-0.5, das mais densas
   do sistema. Com piso = teto a grade fica do tamanho do conteudo, e o
   `overflow-x-auto` do pai continua cobrindo tela estreita. */
/* +28px em cada: a 1a coluna foi de 0.72 para 1.0fr para caber "Recebimento", e a
   largura total acompanha para os outros pesos nao encolherem em troca. */
const MINW_MOV = 'min-w-[484px] max-w-[484px]';
const MINW_MOV_RO = 'min-w-[388px] max-w-[388px]';
// Caixa horizontal COMUM ao cabecalho e a linha: a linha tem `border`, e borda entra
//   na largura. Sem a transparente aqui o cabecalho comeca 1px antes e distribui as
//   colunas sobre 2px a mais.
const CX_CAB = 'border border-transparent px-1';
const CX_LIN = 'border px-1';
/* Formatacao de data do arquivo — UMA so. A copia inline que vivia na grade de
   movimentacoes saiu em PR-OC-RECEB-REGISTRO-02, quando aquele ramo deixou de estar
   congelado. */
const fmtBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : null);

const TONE: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'bg-slate-100 text-slate-600',
  parcial: 'bg-amber-100 text-amber-700',
  completo: 'bg-emerald-100 text-emerald-700',
  excedente: 'bg-rose-100 text-rose-700',
};
const LABEL: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'Não iniciado', parcial: 'Parcial', completo: 'Completo', excedente: 'Excedente',
};

/* MODAL DE UM LOTE (PR-OC-RECEB-REGISTRO-02). Mesmo padrao que a Negociacao adotou em
   PR-OC-UX-LOTE-C2-01: a linha vira leitura e a edicao acontece num lugar so, com espaco.
   ⚠ NAO GRAVA. Devolve os valores por `onGravar`; quem escreve e' `registrar`, no pai —
   o caminho unico. Criar um segundo aqui seria duas regras de validacao para a mesma
   coisa, e a segunda envelheceria calada.
   ⚠ ESTADO INICIALIZADO NO MOUNT, e o pai monta com `key={loteId}`: sem isso, abrir o
   lote B depois do A traria os numeros do A. E' a mesma armadilha que a Negociacao ja
   documentou no seu proprio modal. */
function ReceberLoteDialog({ lote, rotulo, pesoSugerido, hoje, isCompra, saving, onGravar, onFechar }: {
  lote: LoteRecebimento; rotulo: string; pesoSugerido: string; hoje: string;
  isCompra: boolean; saving: boolean;
  onGravar: (dados: { quantidade: string; pesoMedio: string; data: string }) => void;
  onFechar: () => void;
}) {
  /* Falta = o que ainda cabe receber. Negociado desconhecido nao vira zero: o campo
     nasce vazio e o operador digita. */
  const falta = lote.qtdNegociada != null ? Math.max(lote.qtdNegociada - lote.qtdRecebida, 0) : null;
  const [quantidade, setQuantidade] = useState(falta != null && falta > 0 ? String(falta) : '');
  const [pesoMedio, setPesoMedio] = useState(pesoSugerido);
  const [data, setData] = useState(hoje);
  const q = parseNumericValue(quantidade) || 0;
  const podeGravar = q > 0 && !saving;
  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-[13px]">Receber · {rotulo}</DialogTitle></DialogHeader>
        <div className="text-[11px] text-muted-foreground">
          negociado {lote.qtdNegociada ?? '—'} · já recebido {lote.qtdRecebida === 0 ? '—' : lote.qtdRecebida}
        </div>
        {/* A16 — os tres campos com a MESMA altura. */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Quantidade</label>
            <Input inputMode="numeric" value={quantidade} onChange={e => setQuantidade(e.target.value)}
              placeholder="0" className="mt-0.5 h-8 text-[12px] text-right tabular-nums" />
          </div>
          {/* A15 — peso em kg com duas casas; o sugerido e' o peso medio NEGOCIADO do
              lote. Fora de compra nao ha peso a registrar. */}
          {isCompra && (
            <div>
              <label className="text-[10px] text-muted-foreground">Peso médio (kg)</label>
              <Input inputMode="decimal" value={pesoMedio} onChange={e => setPesoMedio(e.target.value)}
                placeholder="—" className="mt-0.5 h-8 text-[12px] text-right tabular-nums" />
            </div>
          )}
          <div className={isCompra ? 'col-span-2' : ''}>
            <label className="text-[10px] text-muted-foreground">Data</label>
            <DatePicker value={data} onChange={setData} className="mt-0.5 h-8 text-[12px]" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" disabled={!podeGravar}
            title={podeGravar ? undefined : 'Informe a quantidade recebida'}
            aria-label={`Registrar recebimento do lote ${rotulo}`}
            onClick={() => onGravar({ quantidade, pesoMedio, data })}>
            {saving ? 'Registrando…' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AbaRecebimentoLotes({ api, operacaoPronta, concluida, encerrada, isCompra, categoriasDisponiveis, documentosApi, somenteLeitura, onVoltarNegociacao }: Props) {
  /* ⚠ AS TRES TABELAS POR LINHA (`qtd`, `peso`, `dataReb`) SAIRAM em
     PR-OC-RECEB-REGISTRO-02. Elas so existiam para alimentar os inputs inline da
     grade de onze colunas; com os campos dentro do modal, os valores viajam por
     PARAMETRO ate `registrar`. Guardar em estado do pai era, alem de sobra, a
     armadilha de closure conhecida: `setX` seguido de `registrar` no MESMO clique
     leria o valor ANTERIOR. */
  const [receberLoteId, setReceberLoteId] = useState<string | null>(null);
  const [docLoteId, setDocLoteId] = useState<string | null>(null);   // lote-contexto do registro rápido de documento
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [motivoEncerrar, setMotivoEncerrar] = useState('');
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const hoje = new Date().toISOString().slice(0, 10);
  // OPEN-01: abertura existente = read-only (equivale ao "encerrada" para fins de escrita/exibição).
  const readOnly = encerrada || somenteLeitura;
  // Tradução slug -> nome oficial (mesmo catálogo usado na Negociação p/ escolher a categoria;
  //   por isso todo slug persistido resolve para um label; nunca exibir slug cru).
  const catLabel = (slug: string | null | undefined) => (slug ? (categoriasDisponiveis.find(c => c.value === slug)?.label ?? slug) : '—');

  if (!operacaoPronta) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center space-y-2">
        <div className="text-[11px] text-muted-foreground">Salve a operação e informe os lotes na aba Negociação.</div>
        {onVoltarNegociacao && <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={onVoltarNegociacao}>Voltar para Negociação</Button>}
      </div>
    );
  }
  // Entrega encerrada tem precedência de exibição sobre a negociação não concluída: uma operação
  //   programada+encerrada mostra os lotes em consulta + "Reabrir recebimento". Só quando NÃO encerrada
  //   e negociação não concluída é que exibimos o aviso de indisponibilidade (estado pós-reabertura).
  if (!concluida && !encerrada) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center space-y-1">
        <div className="text-[12px] font-semibold text-foreground">Recebimento indisponível — negociação ainda não concluída</div>
        <div className="text-[11px] text-muted-foreground">Conclua a negociação (botão “Concluir negociação”) para registrar o recebimento físico.</div>
      </div>
    );
  }

  // Valor INICIAL do input Peso méd. = peso médio negociado oficial do lote (por loteId; nunca por
  //   ordem/categoria/posição). Ausência → vazio (nunca 0). Só inicializa: não persiste sozinho.
  const pesoInicial = (l: LoteRecebimento) =>
    (l.pesoMedioNegociadoKg != null && Number.isFinite(l.pesoMedioNegociadoKg)) ? formatMed2(l.pesoMedioNegociadoKg) : '';

  /* ⚠ CAMINHO UNICO DE ESCRITA desta tela, e continua sendo este. O modal nao chama
     `api.registrar`: ele devolve os valores e quem grava e' esta funcao. O que mudou em
     PR-OC-RECEB-REGISTRO-02 foi de onde os valores vem — antes de tres tabelas de
     estado por linha, agora por parametro. Payload, validacao e chamada intactos. */
  const registrar = (l: LoteRecebimento, dados: { quantidade: string; pesoMedio: string; data: string }) => {
    const q = parseNumericValue(dados.quantidade) || 0;
    if (q <= 0) return;
    // valor efetivo: o que o operador digitou; se não tocou, o negociado que inicializa o campo.
    const pm = parseNumericValue(dados.pesoMedio || pesoInicial(l));
    void api.registrar(l.loteId, {
      data: dados.data || hoje,
      categoria: l.categoria ?? '',
      quantidade: Math.trunc(q),
      pesoMedio: isCompra && pm ? pm : null,
      observacao: '',
    });
  };

  const movsAtivas = api.movimentacoes.filter(m => !m.cancelado);
  const receberLote = api.lotes.find(l => l.loteId === receberLoteId) ?? null;

  /* SALDO — nao confundir com o gate de leitura. `readOnly` responde "pode
     escrever?"; isto responde "sobrou o que receber?". Faltava a segunda, e por
     isso uma entrega 29/29 ainda oferecia "Receber".
     Le o MESMO saldo que a linha exibe (Negociado x Recebido), sem derivar de
     outra fonte. `estado === 'completo'` cobre o que a view ja fechou.
     qtdNegociada NULA e' negociado DESCONHECIDO, nao zero: sem saber o alvo nao
     da' para afirmar que nao ha saldo, entao o botao fica. */
  const semSaldo = (l: LoteRecebimento) =>
    l.estado === 'completo' || (l.qtdNegociada != null && l.qtdRecebida >= l.qtdNegociada);
  const algumLoteComSaldo = api.lotes.some(l => !semSaldo(l));

  // Totais soberanos (soma dos lotes) para o dialog de encerramento. Motivo obrigatório quando há
  //   diferença ou zero recebido — a UI torna a consequência explícita; o writer já exige o motivo.
  const totalNegociado = api.lotes.reduce((s, l) => s + (l.qtdNegociada ?? 0), 0);
  const totalRecebido = api.lotes.reduce((s, l) => s + l.qtdRecebida, 0);
  const diferencaTotal = totalNegociado - totalRecebido;
  const zeroRecebido = totalRecebido === 0;

  /* ── DERIVACOES DA LISTA ENCERRADA (PR-OC-A18-RECEBIMENTO-01) ────────────────
     ⚠ O ESTADO GERAL COMPOE OS VEREDITOS DOS LOTES, nao refaz o limiar.
     `estado_recebimento` vem da VIEW, por lote; recalcular aqui recebido x
     negociado seria a segunda copia de uma regra que ja tem dono. Compor os
     quatro estados existentes nao inventa nenhum quinto. */
  const semLote = api.lotes.length === 0;
  const estadoGeral: EstadoRecebimento | null =
    semLote ? null
    : api.lotes.some(l => l.estado === 'excedente') ? 'excedente'
    : api.lotes.every(l => l.estado === 'completo') ? 'completo'
    : api.lotes.every(l => l.estado === 'nao_iniciado') ? 'nao_iniciado'
    : 'parcial';

  /* Quantas entradas cada lote teve, e a mais recente. `MovimentacaoOC` ja carrega
     `loteId`, entao e' agrupamento do que a aba tem em maos — nenhuma consulta nova.
     Canceladas ficam de fora porque a fonte e' `movsAtivas`, a MESMA lista que a
     grade de movimentacoes exibe.
     ⚠ Comparacao lexicografica sobre a ISO: 'AAAA-MM-DD' ordena como string, sem
     Date e sem fuso. Movimentacao SEM data nao vira "ultima" — ausencia nao ganha
     de data conhecida. */
  const entradasPorLote = new Map<string, { n: number; ultimaIso: string | null }>();
  for (const m of movsAtivas) {
    const a = entradasPorLote.get(m.loteId);
    entradasPorLote.set(m.loteId, {
      n: (a?.n ?? 0) + 1,
      ultimaIso: m.data && (!a?.ultimaIso || m.data > a.ultimaIso) ? m.data : (a?.ultimaIso ?? null),
    });
  }
  const motivoEncerrarObrigatorio = diferencaTotal !== 0 || zeroRecebido;
  const podeEncerrar = !api.saving && (!motivoEncerrarObrigatorio || motivoEncerrar.trim() !== '');
  const podeReabrir = !api.saving && motivoReabrir.trim() !== '';

  // Fecha o dialog ANTES de disparar (nunca congela); o hook cuida de toast/refetch/versão.
  const submitEncerrar = () => {
    if (!podeEncerrar) return;
    const m = motivoEncerrar.trim();
    setEncerrarOpen(false); setMotivoEncerrar('');
    void api.encerrar(m || 'encerramento pela aba Recebimento');
  };
  const submitReabrir = () => {
    if (!podeReabrir) return;
    const m = motivoReabrir.trim();
    setReabrirOpen(false); setMotivoReabrir('');
    void api.reabrir(m);
  };

  return (
    <div className="rounded-md border bg-card p-1.5 shadow-sm space-y-1.5 min-w-0">{/* PR-OC-UX-DENSIDADE-01 item 5 — padding/gap reduzidos */}
      {/* ══ BIFURCACAO POR ESTADO (PR-OC-A18-RECEBIMENTO-01) ══════════════════════
          Os dois estados desta aba sao telas diferentes: ENCERRADO e' consulta, e
          ABERTO e' formulario — dez colunas com DatePicker, dois Inputs e os botoes
          Receber e Doc. por linha. Ate aqui os dois dividiam o MESMO `map`, com
          ternarios e guardas inline; reescrever a linha de um mexia na peca do outro.
          A bifurcacao acontece no CONTAINER: cada ramo monta a sua propria lista, e
          nenhuma peca e' compartilhada entre os dois. */}
      {encerrada ? (
        <>
          {/* ── A21 — TITULO E NUMEROS NAO ROLAM ────────────────────────────────
              ⚠ `-mt-1.5 pt-1.5` e nao `-mt-2 pt-2`: o cartao desta aba e' `p-1.5`
              (PR-OC-UX-DENSIDADE-01), nao `p-2` como o das irmas. A compensacao tem
              de casar com o padding REAL, senao sobra faixa por onde as linhas
              aparecem ao rolar. So no eixo vertical. */}
          <div className="sticky top-0 z-10 -mt-1.5 space-y-1.5 border-b bg-card pt-1.5 pb-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium text-foreground min-w-0 truncate">Recebimento por lote na fazenda</span>
              <span className="text-[11px] font-normal text-muted-foreground shrink-0">encerrado</span>
            </div>
            {/* ── DOIS NUMEROS ────────────────────────────────────────────────
                `totalRecebido` e `totalNegociado` sao os MESMOS que o dialog de
                encerramento ja usa — nao ha soma nova aqui.
                ⚠ SEM LOTE NENHUM os dois imprimem traco. Zero seria mentira: dizer
                "0 / 0" afirma que nada foi recebido de nada negociado, quando o que
                ha e' ausencia de negociacao. */}
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Recebido</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[20px] font-medium tabular-nums leading-none">
                    {semLote ? '—' : `${totalRecebido} / ${totalNegociado}`}
                  </span>
                  {estadoGeral && (
                    <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-normal ${TONE[estadoGeral]}`}>
                      {LABEL[estadoGeral]}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Cabeças</div>
                <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                  {semLote ? '—' : `${totalNegociado} negociadas`}
                </div>
              </div>
            </div>
          </div>

          {/* O aviso permanece com o texto e o comportamento atuais. */}
          <div className="text-[11px] text-muted-foreground">
            Recebimento encerrado. Use Reabrir recebimento para registrar mais movimentações.
          </div>

          {/* ── LISTA A18 ───────────────────────────────────────────────────────
              Sem cabecalho de coluna, sem `#`, sem `min-w`, sem rolagem lateral — a
              grade encerrada carregava `min-w-[427px] max-w-[427px]` e um
              `overflow-x-auto`; nenhum dos dois sobreviveu em lote — o ramo aberto
              perdeu os seus em PR-OC-RECEB-REGISTRO-02.
              ⚠ DIFERENCA ZERO NAO E' RENDERIZADA: "0" numa coluna de diferenca e'
              ruido que o operador aprende a ignorar, e ai deixa de ver o que nao e'
              zero. Havendo falta, ela OCUPA a linha 2 inteira em ambar e a data sai:
              o que falta vale mais que quando chegou. */}
          {api.lotes.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-center text-[11px] text-muted-foreground">
              {api.loading ? 'Carregando…' : 'Nenhum lote negociado.'}
            </div>
          ) : (
            <div className="rounded-md border divide-y divide-border/60">
              {api.lotes.map(l => {
                const ent = entradasPorLote.get(l.loteId);
                const falta = l.qtdNegociada != null ? l.qtdNegociada - l.qtdRecebida : 0;
                const temFalta = falta > 0;
                const contexto = temFalta
                  ? `negociado ${l.qtdNegociada} · recebido ${l.qtdRecebida} · falta ${falta}`
                  : [
                      `negociado ${l.qtdNegociada ?? '—'}`,
                      `recebido ${l.qtdRecebida}`,
                      /* Uma entrada diz so a data; varias dizem quantas foram e a
                         ultima — "3 entradas" sem data nao situa, e a data sozinha
                         esconderia que houve mais de uma remessa. */
                      ent == null ? null
                        : ent.n > 1 ? `${ent.n} entradas, última ${fmtBr(ent.ultimaIso) ?? '—'}`
                        : fmtBr(ent.ultimaIso),
                    ].filter(Boolean).join(' · ');
                return (
                  <div key={l.loteId} className="px-3.5 py-1.5 leading-[1.35]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[12px] font-medium text-foreground">{catLabel(l.categoria)}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-normal ${TONE[l.estado]}`}>
                        {LABEL[l.estado]}
                      </span>
                    </div>
                    <div className={`truncate text-[10px] font-normal ${temFalta ? 'text-amber-700 dark:text-amber-500' : 'text-muted-foreground'}`}>
                      {contexto}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {/* ── A21 — TITULO E NUMEROS NAO ROLAM ────────────────────────────────
              `-mt-1.5 pt-1.5` porque o cartao desta aba e' `p-1.5`, nao `p-2`. */}
          <div className="sticky top-0 z-10 -mt-1.5 space-y-1.5 border-b bg-card pt-1.5 pb-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium text-foreground min-w-0 truncate">Recebimento por lote na fazenda</span>
              {/* ATALHO DO CASO COMUM: resolve a entrega conforme negociada sem abrir
                  modal nenhum. Some quando nao ha saldo — acao que nao faz nada e' pior
                  que acao ausente. */}
              {!readOnly && algumLoteComSaldo && (
                <button type="button" disabled={api.saving} onClick={() => void api.receberTodos()}
                  title="Registrar em todos os lotes a quantidade negociada"
                  aria-label="Receber todos conforme negociado"
                  className="shrink-0 text-[11px] font-normal text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
                  Receber todos conforme negociado
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Recebido</div>
                <div className="mt-1 flex items-baseline gap-2">
                  {/* ⚠ RECEBIDO ZERO E' AUSENCIA, NAO NUMERO. "0 / 10" afirma que se
                      contou e deu zero; "— / 10" diz que ainda nao comecou. */}
                  <span className="text-[20px] font-medium tabular-nums leading-none">
                    {semLote ? '—' : `${totalRecebido === 0 ? '—' : totalRecebido} / ${totalNegociado}`}
                  </span>
                  {estadoGeral && (
                    <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-normal ${TONE[estadoGeral]}`}>
                      {LABEL[estadoGeral]}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Cabeças</div>
                <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                  {semLote ? '—' : `${totalNegociado} negociadas`}
                </div>
              </div>
            </div>
          </div>

          {somenteLeitura && (
            <div className="text-[11px] text-muted-foreground">
              Operação fechada com título financeiro. Para editar, estorne o lançamento na aba Financeiro e reabra a operação.
            </div>
          )}

          {/* ── LISTA A18 ───────────────────────────────────────────────────────
              Eram ONZE colunas, tres delas de entrada. Nao cabiam: a data renderizava
              "28/08/202" com o ano cortado dentro do input, e "QTD. A RECEBER" quebrava
              em duas linhas no cabecalho. Os campos sairam da linha e foram para um
              modal por lote — mesmo caminho que a Negociacao adotou em
              PR-OC-UX-LOTE-C2-01, pela mesma razao.
              ⚠ AMBAR SO ONDE HA DESVIO. Faltar tudo antes de comecar e' o estado normal
              de partida, e pintar isso de ambar ensina o operador a ignorar o ambar —
              ai ele perde o parcial, que e' o caso que importa.
              ⚠ ESTADO E DIFERENCA DIZIAM O MESMO em duas colunas. Sobrou um: a pilula
              aparece quando nao ha mais o que receber; havendo saldo, o lugar e' da
              ACAO, que e' o que o operador precisa ali. */}
          {api.lotes.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-center text-[11px] text-muted-foreground">
              {api.loading ? 'Carregando…' : 'Nenhum lote negociado.'}
            </div>
          ) : (
            <div className="rounded-md border divide-y divide-border/60">
              {api.lotes.map(l => {
                const ent = entradasPorLote.get(l.loteId);
                const falta = l.qtdNegociada != null ? l.qtdNegociada - l.qtdRecebida : null;
                const naoIniciado = l.qtdRecebida === 0;
                const excede = falta != null && falta < 0;
                const temFalta = falta != null && falta > 0;
                const atencao = excede || (temFalta && !naoIniciado);
                const neg = l.qtdNegociada ?? '—';
                const contexto =
                  naoIniciado ? `negociado ${neg} · a receber ${falta ?? neg}`
                  : excede ? `negociado ${neg} · recebido ${l.qtdRecebida} · excedente ${-falta!}`
                  : temFalta ? `negociado ${neg} · recebido ${l.qtdRecebida} · falta ${falta}`
                  : [
                      `negociado ${neg}`, `recebido ${l.qtdRecebida}`,
                      ent == null ? null
                        : ent.n > 1 ? `${ent.n} entradas, última ${fmtBr(ent.ultimaIso) ?? '—'}`
                        : fmtBr(ent.ultimaIso),
                    ].filter(Boolean).join(' · ');
                return (
                  <div key={l.loteId} className="flex items-center gap-3 px-3.5 py-1.5 leading-[1.35]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-foreground">{catLabel(l.categoria)}</div>
                      <div className={`truncate text-[10px] font-normal ${atencao ? 'text-amber-700 dark:text-amber-500' : 'text-muted-foreground'}`}>
                        {contexto}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-[11px]">
                      {!readOnly && !semSaldo(l) ? (
                        <button type="button" disabled={api.saving} onClick={() => setReceberLoteId(l.loteId)}
                          title="Registrar o recebimento deste lote"
                          aria-label={`Receber lote ${catLabel(l.categoria)}`}
                          className="text-[11px] font-normal text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
                          Receber
                        </button>
                      ) : (
                        <span className={`rounded-full px-1.5 py-px text-[10px] font-normal ${TONE[l.estado]}`}>{LABEL[l.estado]}</span>
                      )}
                      {!readOnly && documentosApi && (
                        <button type="button" onClick={() => setDocLoteId(l.loteId)}
                          title="Registrar documento deste lote"
                          aria-label={`Registrar documento do lote ${catLabel(l.categoria)}`}
                          className="text-muted-foreground/70 hover:text-foreground">
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ⚠ MESMO CAMINHO DE GRAVACAO. O modal nao chama `api.registrar` direto: ele
          devolve os valores e quem grava continua sendo `registrar`, a unica funcao de
          escrita desta tela. Ver o comentario dela sobre por que os valores viajam por
          PARAMETRO e nao por estado. */}
      {receberLote && (
        <ReceberLoteDialog
          key={receberLote.loteId}
          lote={receberLote}
          rotulo={catLabel(receberLote.categoria)}
          pesoSugerido={pesoInicial(receberLote)}
          hoje={hoje}
          isCompra={isCompra}
          saving={api.saving}
          onFechar={() => setReceberLoteId(null)}
          onGravar={(dados) => { registrar(receberLote, dados); setReceberLoteId(null); }}
        />
      )}

      {/* Movimentações registradas (com estorno antes do encerramento) */}
      {movsAtivas.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Movimentações registradas</div>
          {/* Era uma frase por movimentacao, com os campos separados por bolinhas: nada
              alinhava com nada e comparar duas linhas exigia ler a frase inteira.
              Vira tabela, com as MESMAS regras da tabela de lotes. */}
          <div className="overflow-x-auto">
            <div className={readOnly ? MINW_MOV_RO : MINW_MOV}>
              <div className={`${readOnly ? GRID_MOV_RO : GRID_MOV} ${CX_CAB} pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground [&>span]:text-center`}>
                {/* "Data" era ambiguo: a mesma operacao tem data de compra, de
                    vencimento e de chegada.
                    ⚠ "Data do recebimento" NAO CABE: a coluna tem ~72px (0.72fr de 432px
                    uteis) e o rotulo pede ~124px a 10px — quebraria em duas linhas.
                    "Recebimento" sozinho ja desambigua e cabe. Abreviar para "Dt. Receb."
                    devolveria a duvida que o rotulo existe para tirar. A coluna foi
                    alargada de 0.72 para 1.0fr para receber o rotulo com folga. */}
                <span>Recebimento</span><span>Categoria</span><span>Quantidade</span><span>Peso méd.</span>
                {!readOnly && <span>Ações</span>}
              </div>
              {movsAtivas.map(m => (
                <div key={m.id} className={`${readOnly ? GRID_MOV_RO : GRID_MOV} items-center rounded-md ${CX_LIN} bg-muted/10 py-0.5`}>
                  <div className="text-[11px] text-center tabular-nums">{fmtBr(m.data) ?? '—'}</div>
                  <div className="text-[11px] break-words">{catLabel(m.categoria)}</div>
                  <div className="text-[11px] text-right tabular-nums">{m.quantidade} cab</div>
                  <div className="text-[11px] text-right tabular-nums">{m.pesoMedio != null ? `${formatMed2(m.pesoMedio)} kg` : '—'}</div>
                  {!readOnly && (
                    <div className="flex items-center justify-center">
                      <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive gap-1"
                        disabled={api.saving} onClick={() => void api.estornar(m.id, 'estorno pela aba Recebimento')}>
                        <Undo2 className="h-3 w-3" /> Estornar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving}
            onClick={() => { setMotivoEncerrar(''); setEncerrarOpen(true); }}>
            <Lock className="h-3 w-3" /> Encerrar recebimento
          </Button>
        </div>
      )}
      {/* Reabertura: só quando a entrega está encerrada e a operação não é somente-leitura (ex.: cancelada).
          Não altera a negociação — se programada, após reabrir volta a "indisponível" pelos gates. */}
      {encerrada && !somenteLeitura && (
        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving}
            onClick={() => { setMotivoReabrir(''); setReabrirOpen(true); }}>
            <Undo2 className="h-3 w-3" /> Reabrir recebimento
          </Button>
        </div>
      )}

      {/* Encerramento com consequência EXPLÍCITA (substitui a confirmação fraca). Motivo obrigatório quando
          há diferença ou zero recebido; alerta forte + botão destrutivo quando nada foi recebido. */}
      <Dialog open={encerrarOpen} onOpenChange={o => { if (!o) setEncerrarOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[13px]">Encerrar recebimento</DialogTitle></DialogHeader>
          <div className="space-y-2 text-[12px]">
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded border bg-muted/30 px-1.5 py-1"><div className="text-[10px] text-muted-foreground">Negociado</div><div className="font-semibold tabular-nums">{totalNegociado}</div></div>
              <div className="rounded border bg-muted/30 px-1.5 py-1"><div className="text-[10px] text-muted-foreground">Recebido</div><div className="font-semibold tabular-nums">{totalRecebido}</div></div>
              <div className={`rounded border px-1.5 py-1 ${diferencaTotal !== 0 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/30'}`}><div className="text-[10px] text-muted-foreground">Diferença</div><div className={`font-semibold tabular-nums ${diferencaTotal !== 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>{diferencaTotal}</div></div>
            </div>
            {zeroRecebido ? (
              <div className="flex items-start gap-1.5 rounded border border-destructive bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Nenhum animal foi recebido. Deseja encerrar esta entrega mesmo assim?</span>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                Após encerrar, novos recebimentos ficarão bloqueados e a reabertura exigirá justificativa.
              </div>
            )}
            <div>
              <div className="text-[11px] font-medium">Motivo{motivoEncerrarObrigatorio ? ' *' : ' (opcional)'}</div>
              <Textarea value={motivoEncerrar} onChange={e => setMotivoEncerrar(e.target.value)} rows={2}
                className="mt-0.5 text-[12px]" placeholder={motivoEncerrarObrigatorio ? 'Justifique a diferença / ausência de recebimento' : 'Opcional'} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setEncerrarOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" variant={zeroRecebido ? 'destructive' : 'default'} disabled={!podeEncerrar} onClick={submitEncerrar}>
              Encerrar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reabertura AUDITADA da entrega (não altera a negociação). Motivo obrigatório. */}
      <Dialog open={reabrirOpen} onOpenChange={o => { if (!o) setReabrirOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[13px]">Reabrir recebimento</DialogTitle></DialogHeader>
          <div className="space-y-2 text-[12px]">
            <div className="text-[11px] text-muted-foreground">
              Esta ação é <b>auditada</b>: reabre a entrega para novos recebimentos e fica registrada com o motivo informado. <b>Não</b> altera a negociação — se a operação estiver programada, o recebimento seguirá indisponível até a negociação ser concluída.
            </div>
            <div>
              <div className="text-[11px] font-medium">Motivo *</div>
              <Textarea value={motivoReabrir} onChange={e => setMotivoReabrir(e.target.value)} rows={2}
                className="mt-0.5 text-[12px]" placeholder="Justifique a reabertura" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setReabrirOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" disabled={!podeReabrir} onClick={submitReabrir}>Reabrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registro rápido de documento no contexto do lote — reutiliza o cadastro OFICIAL (DocumentoFormOC)
          com a instância única documentosApi. Ao salvar: fecha, dados atualizam (mesmo hook) e permanece aqui.
          A aba Documentos segue sendo a tela oficial de consulta/manutenção completa. */}
      {documentosApi && (
        <Dialog open={!!docLoteId} onOpenChange={o => { if (!o) setDocLoteId(null); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[13px]">
                Novo documento{docLoteId ? ` — Lote ${api.lotes.find(l => l.loteId === docLoteId)?.ordem ?? ''}` : ''}
              </DialogTitle>
            </DialogHeader>
            {docLoteId && (
              <DocumentoFormOC
                key={docLoteId}
                api={documentosApi}
                initialForm={{ ...FORM_VAZIO, loteIds: [docLoteId] }}
                hideHeader
                onSaved={() => setDocLoteId(null)}
                onCancel={() => setDocLoteId(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
