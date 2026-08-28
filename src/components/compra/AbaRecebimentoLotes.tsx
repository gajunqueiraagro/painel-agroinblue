import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Undo2, Lock, FileText, AlertTriangle } from 'lucide-react';
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

/* GRADES DA ABA. `minmax(0,Nfr)` e nao `Nfr` puro em TODAS as trilhas: `fr` tem
   minimo automatico de conteudo, entao o mesmo grid resolvia larguras diferentes
   no cabecalho e na linha — la empurrado pela palavra ("NEGOCIADO"), aqui pelo
   input e pelo DatePicker. Com o minimo em 0 a trilha depende so da largura do
   container, que e' a mesma nos dois, e as colunas coincidem (f3f55e43).

   OS PESOS SAO PIXELS MEDIDOS / 100, e o `min-w` e' a soma desses pixels mais os
   gaps. Assim, no minimo, cada coluna recebe EXATAMENTE o que seu conteudo pede;
   acima disso todas crescem juntas. Antes as trilhas eram arbitrarias: Data levava
   1.34fr (131px) para um dd/mm/aaaa, e sobrava min-w-[840px] que nao cabia no modal
   e forcava rolagem horizontal.
     #  26 · Categoria 110 · Negociado 64 · Recebido 57 · Diferenca 66
     Data 95 · Qtd. a receber 55 · Peso med. 66 · Estado 74 · Acoes 105  = 718 (+54 de gap)
   Negociado/Recebido/Diferenca/Estado sao ditados pelo ROTULO, nao pela celula;
   Acoes pelo par "Receber" + "Doc."; Categoria leva folga por causa dos nomes. */
const GRID = 'grid grid-cols-[minmax(0,0.26fr)_minmax(0,1.1fr)_minmax(0,0.64fr)_minmax(0,0.57fr)_minmax(0,0.66fr)_minmax(0,0.95fr)_minmax(0,0.55fr)_minmax(0,0.66fr)_minmax(0,0.74fr)_minmax(0,1.05fr)] gap-1.5';
/* ⚠ PR-OC-UX-RECEBIMENTO-01 — teto = piso, pela MESMA razao que ja valia para as
   movimentacoes (ver o bloco de MINW_MOV abaixo): `min-w` e' piso, o wrapper e' bloco
   e ocupava a largura inteira do modal, e as colunas `fr` esticavam para preencher.
   Negociado, Recebido e Diferenca guardam de 1 a 3 digitos e ficavam em colunas de
   ~200px. O C1 corrigiu a grade de baixo e deixou esta — mesmo defeito, dois lugares. */
const MINW = 'min-w-[772px] max-w-[772px]';
/* ENTREGA ENCERRADA: Data, Qtd. a receber, Peso med. e Acoes so teriam travessao —
   nao ha mais o que fazer. A COLUNA INTEIRA sai, nao a celula: coluna vazia ocupa
   espaco e ainda sugere que falta preencher algo. Sobram as que informam. */
const GRID_ENC = 'grid grid-cols-[minmax(0,0.26fr)_minmax(0,1.1fr)_minmax(0,0.64fr)_minmax(0,0.57fr)_minmax(0,0.66fr)_minmax(0,0.74fr)] gap-1.5';
const MINW_ENC = 'min-w-[427px] max-w-[427px]';
/* MOVIMENTACOES: era texto corrido separado por bolinhas, que nao alinha coluna
   nenhuma. Mesmas regras de cima. Acoes some junto com o "Estornar" que ela abriga
   — em somente leitura a coluna nao existe, pelo mesmo motivo do GRID_ENC.
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
const TONE: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'bg-slate-100 text-slate-600',
  parcial: 'bg-amber-100 text-amber-700',
  completo: 'bg-emerald-100 text-emerald-700',
  excedente: 'bg-rose-100 text-rose-700',
};
const LABEL: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'Não iniciado', parcial: 'Parcial', completo: 'Completo', excedente: 'Excedente',
};

export function AbaRecebimentoLotes({ api, operacaoPronta, concluida, encerrada, isCompra, categoriasDisponiveis, documentosApi, somenteLeitura, onVoltarNegociacao }: Props) {
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [peso, setPeso] = useState<Record<string, string>>({});
  const [dataReb, setDataReb] = useState<Record<string, string>>({});
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

  const registrar = (l: LoteRecebimento) => {
    const q = parseNumericValue(qtd[l.loteId] ?? '') || 0;
    if (q <= 0) return;
    // valor efetivo: o que o operador digitou; se não tocou, o negociado que inicializa o campo.
    const pm = parseNumericValue(peso[l.loteId] ?? pesoInicial(l));
    void api.registrar(l.loteId, {
      data: dataReb[l.loteId] || hoje,
      categoria: l.categoria ?? '',
      quantidade: Math.trunc(q),
      pesoMedio: isCompra && pm ? pm : null,
      observacao: '',
    }).then(() => { setQtd(s => ({ ...s, [l.loteId]: '' })); setPeso(s => { const n = { ...s }; delete n[l.loteId]; return n; }); });
  };

  const movsAtivas = api.movimentacoes.filter(m => !m.cancelado);

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
      <div className="flex items-center justify-between gap-2">
        <div>
          {/* "na fazenda" desfaz a confusao com recebimento FINANCEIRO, que e' outra
              coisa inteiramente e mora na aba Financeiro. */}
          <div className="text-[12px] font-semibold text-foreground">Recebimento por lote na fazenda</div>
          {/* Uma linha dizendo O QUE a tabela compara, para quem abre a tela pela
              primeira vez. Sem jargao: "chegou" e "negociado" sao as palavras que o
              operador usa. O aviso de encerrado segue abaixo, em tom secundario. */}
          <div className="text-[11px] text-muted-foreground">Confira o que chegou na fazenda contra o que foi negociado, por categoria.</div>
          {/* Bloqueio informa MOTIVO e CAMINHO, nao so o estado: "Somente leitura." dizia
              o que o operador ja via na tela e nao dizia como sair de la.

              ⚠ O SEGUNDO RAMO ESTA INALCANCAVEL HOJE, e o texto ficou como o briefing
              pediu para nao inventar outro. Nesta aba `somenteLeitura` vem de
              `recebimentoReadOnly`, que e' SO `status_comercial === 'cancelada'`
              (CompraModalShell:189, que documenta: "titulo materializado NAO bloqueia a
              chegada fisica"). E operacao cancelada nao chega ate aqui: `concluida` e'
              false e o early return de "negociacao ainda nao concluida" pega antes.
              Ou seja: fechada-com-titulo NAO deixa esta aba em leitura — ela segue
              editavel, medido na OC 6a44fb9b. Reportado; a decisao e' do briefing. */}
          <div className="text-[11px] text-muted-foreground">
            {encerrada
              ? 'Recebimento encerrado. Use Reabrir recebimento para registrar mais movimentações.'
              : somenteLeitura
                ? 'Operação fechada com título financeiro. Para editar, estorne o lançamento na aba Financeiro e reabra a operação.'
                : 'Registre a quantidade efetivamente recebida por lote.'}
          </div>
        </div>
        {!readOnly && algumLoteComSaldo && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving} onClick={() => void api.receberTodos()}>
            <Check className="h-3 w-3" /> Receber todos conforme negociado
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className={encerrada ? MINW_ENC : MINW}>
          {/* ⚠ O CABECALHO ACOMPANHA A CELULA, coluna a coluna. As celulas numericas ja
              eram `text-right`; era o cabecalho que vinha todo centralizado por
              `[&>span]:text-center`, e rotulo centrado sobre numero a direita le como
              desalinhamento. Categoria a esquerda, numeros a direita, o resto centrado. */}
          <div className={`${encerrada ? GRID_ENC : GRID} ${CX_CAB} pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground`}>
            <span className="text-center">#</span><span className="text-left">Categoria</span><span className="text-right">Negociado</span>
            <span className="text-right">Recebido</span><span className="text-right">Diferença</span>
            {!encerrada && (<><span className="text-center">Data</span><span className="text-right">Qtd. a receber</span><span className="text-right">Peso méd.</span></>)}
            <span className="text-center">Estado</span>
            {!encerrada && <span className="text-center">Ações</span>}
          </div>
          {api.lotes.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-center text-[11px] text-muted-foreground">
              {api.loading ? 'Carregando…' : 'Nenhum lote negociado.'}
            </div>
          ) : api.lotes.map(l => (
            <div key={l.loteId} className={`${encerrada ? GRID_ENC : GRID} items-center rounded-md ${CX_LIN} bg-muted/20 py-0.5`}>
              <div className="text-[11px] text-center text-muted-foreground tabular-nums">{l.ordem}</div>
              <div className="text-[11px] break-words">{catLabel(l.categoria)}</div>
              <div className="text-[11px] text-right tabular-nums">{l.qtdNegociada ?? '—'}</div>
              <div className="text-[11px] text-right tabular-nums font-semibold">{l.qtdRecebida}</div>
              <div className={`text-[11px] text-right tabular-nums ${l.diferenca !== 0 ? 'text-amber-600' : ''}`}>{l.diferenca}</div>
              {!encerrada && (<>
                {/* Data (default hoje, editável, enviada no payload existente) */}
                {readOnly ? (
                  <div className="text-[11px] text-center text-muted-foreground">—</div>
                ) : (
                  <DatePicker value={dataReb[l.loteId] ?? hoje} onChange={v => setDataReb(s => ({ ...s, [l.loteId]: v }))}
                    className="h-6 text-[10px]" />
                )}
                {/* Qtd. a receber */}
                {readOnly ? (
                  <div className="text-[11px] text-center text-muted-foreground">—</div>
                ) : (
                  <Input inputMode="numeric" value={qtd[l.loteId] ?? ''} onChange={e => setQtd(s => ({ ...s, [l.loteId]: e.target.value }))}
                    placeholder="0" className="h-6 w-full text-[11px] text-right tabular-nums" />
                )}
                {/* Peso méd. — em leitura NAO e' campo, mas o peso medio negociado EXISTE:
                    imprimi-lo como texto, e nao '—'. Travessao e' dado ausente, e este
                    nao esta ausente; so nao e' editavel. '—' fica para quando for null. */}
                {readOnly || !isCompra ? (
                  <div className="text-[11px] text-right tabular-nums text-muted-foreground">{pesoInicial(l) || '—'}</div>
                ) : (
                  <Input inputMode="decimal" value={peso[l.loteId] ?? pesoInicial(l)} onChange={e => setPeso(s => ({ ...s, [l.loteId]: e.target.value }))}
                    placeholder="—" className="h-6 w-full text-[11px] text-right tabular-nums" />
                )}
              </>)}
              {/* Estado (coluna própria) */}
              <div className="text-center">
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE[l.estado]}`}>{LABEL[l.estado]}</span>
              </div>
              {/* Ações */}
              {!encerrada && (
              <div className="flex items-center justify-center gap-1">
                {!readOnly && !semSaldo(l) && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={api.saving} onClick={() => registrar(l)}>
                    Receber
                  </Button>
                )}
                {!readOnly && documentosApi && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground" onClick={() => setDocLoteId(l.loteId)} title="Registrar documento deste lote">
                    <FileText className="h-3 w-3" /> Doc.
                  </Button>
                )}
              </div>
              )}
            </div>
          ))}
        </div>
      </div>

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
                  <div className="text-[11px] text-center tabular-nums">{m.data ? m.data.split('-').reverse().join('/') : '—'}</div>
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
