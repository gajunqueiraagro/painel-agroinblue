import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { parseNumericValue } from '@/lib/calculos/abate';
import { formatMed2 } from '@/lib/calculos/formatters';
import type { RecebimentoApi, LoteRecebimento } from '@/hooks/useOperacaoRecebimento';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import { DocumentoFormOC, FORM_VAZIO } from './DocumentoFormOC';
import { EntregasVendaTabela, EnviarTodosDialog } from '@/components/venda/EntregasVendaTabela';
import type { LadoContaCorrente } from '@/lib/oc/contaCorrente';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { totaisDaEntrega, VOCABULARIO_ENTREGA, type VocabularioEntrega } from '@/lib/oc/entregasPorLote';
import { formatNum } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';

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
  /* ⚠ A DATA PADRAO DO REGISTRO E A DA OPERACAO, e nao a de hoje — PR-OC-VENDA-ENTREGA-01C.
     Vale para os DOIS tipos: o registro pertence à operação, não ao dia em que alguém
     clicou. Uma compra de 13/05 aberta em 30/08 trazia 30/08 e dependia de o operador
     lembrar de corrigir — e data errada só aparece meses depois, no fechamento.
     Sem a prop, o comportamento antigo (hoje) continua. */
  dataOperacao?: string | null;
  somenteLeitura?: boolean;     // OPEN-01: abertura de operação existente — aba read-only
  /* ACESSOS-OC-03a — POR QUE a aba esta' so' leitura, quando o motivo nao e' o de sempre (operacao cancelada). O financeiro
     nao move gado: a aba abre igual, sem gesto, e diz isto no lugar da frase do titulo financeiro. Sem a prop, a frase de hoje. */
  motivoSomenteLeitura?: string;
  onVoltarNegociacao?: () => void;
  /* OC-ENTREGA-COMPACTA-01 — o LADO decide as palavras (`VOCABULARIO_ENTREGA`, um dicionario so'; o `rotulos` que cada shell
     passava saiu). Sem a prop: o da `adocao`, senao compra/venda pelo `isCompra`. O abate passa 'abate'. */
  lado?: LadoContaCorrente;
  /* OC-VENDA-ENTREGAS-01a — venda e compra ADOTAM a saida/entrada ja' lancada ("Adotar … já lançada" na linha que falta);
     o abate registra direto. Os nomes vao so' para o texto do seletor. */
  adocao?: { fazendaNome: string | null; contraparteNome: string | null; lado?: LadoContaCorrente };
}

/* ⚠ AS GRADES DE LOTE SAIRAM (PR-OC-A18-RECEBIMENTO-01, PR-OC-RECEB-REGISTRO-02), e no OC-ENTREGA-COMPACTA-01 sairam tambem a
   lista de lotes em duas linhas e a tabela "Movimentacoes registradas": a aba e' uma faixa de 26px, um aviso de 20px e UMA
   tabela (`EntregasVendaTabela`), nos tres tipos e nos dois estados. O modal nunca muda de tamanho. */
export const ALTURA_FAIXA_ENTREGA = 26;
export const ALTURA_AVISO_ENTREGA = 20;

/* MODAL DE UM LOTE (PR-OC-RECEB-REGISTRO-02). Mesmo padrao que a Negociacao adotou em
   PR-OC-UX-LOTE-C2-01: a linha vira leitura e a edicao acontece num lugar so, com espaco.
   ⚠ NAO GRAVA. Devolve os valores por `onGravar`; quem escreve e' `registrar`, no pai —
   o caminho unico. Criar um segundo aqui seria duas regras de validacao para a mesma
   coisa, e a segunda envelheceria calada.
   ⚠ ESTADO INICIALIZADO NO MOUNT, e o pai monta com `key={loteId}`: sem isso, abrir o
   lote B depois do A traria os numeros do A. E' a mesma armadilha que a Negociacao ja
   documentou no seu proprio modal. */
function ReceberLoteDialog({ lote, rotulo, pesoSugerido, hoje, saving, onGravar, onFechar, v }: {
  lote: LoteRecebimento; rotulo: string; pesoSugerido: string; hoje: string;
  saving: boolean; v: VocabularioEntrega;
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
        <DialogHeader><DialogTitle className="text-[12px]">{`${v.Verbo} · ${rotulo}`}</DialogTitle></DialogHeader>
        <div className="text-[11px] text-muted-foreground">
          negociado {lote.qtdNegociada ?? '—'} · já {v.feito} {lote.qtdRecebida === 0 ? '—' : lote.qtdRecebida}
        </div>
        {/* A16 — os tres campos com a MESMA altura. */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Quantidade</label>
            <Input inputMode="numeric" value={quantidade} onChange={e => setQuantidade(e.target.value)}
              placeholder="0" className="mt-0.5 h-6 text-[11px] text-right tabular-nums" />
          </div>
          {/* A15 — peso em kg com duas casas; o sugerido e' o peso medio NEGOCIADO do
              lote, e e' EDITAVEL: o embarque real diverge do negociado com frequencia.
              ⚠ TAMBEM NA VENDA — PR-OC-VENDA-ENTREGA-01F: os derivados da lista de vendas dependem dele. */}
          <div>
            <label className="text-[10px] text-muted-foreground">Peso médio (kg)</label>
            <Input inputMode="decimal" value={pesoMedio} onChange={e => setPesoMedio(e.target.value)}
              onBlur={() => { const n = parseNumericValue(pesoMedio); if (n) setPesoMedio(formatMed2(n)); }}
              placeholder="—" className="mt-0.5 h-6 text-[11px] text-right tabular-nums" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-muted-foreground">Data</label>
            <DatePicker value={data} onChange={setData} className="mt-0.5 h-6 text-[11px]" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium " onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium " disabled={!podeGravar}
            title={podeGravar ? undefined : `Informe a quantidade ${v.quantidadeFeita}`}
            aria-label={`Registrar ${v.mov} do lote ${rotulo}`}
            onClick={() => onGravar({ quantidade, pesoMedio, data })}>
            {saving ? 'Registrando…' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BOTAO_FAIXA = 'h-[20px] px-2 text-[10px] font-medium';

export function AbaRecebimentoLotes({ api, operacaoPronta, concluida, encerrada, isCompra, categoriasDisponiveis, documentosApi, dataOperacao, somenteLeitura, motivoSomenteLeitura, onVoltarNegociacao, lado, adocao }: Props) {
  const ladoEfetivo: LadoContaCorrente = lado ?? adocao?.lado ?? (isCompra ? 'compra' : 'venda');
  const v = VOCABULARIO_ENTREGA[ladoEfetivo];
  const [receberLoteId, setReceberLoteId] = useState<string | null>(null);
  const [docLoteId, setDocLoteId] = useState<string | null>(null);   // lote-contexto do registro rápido de documento
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [motivoEncerrar, setMotivoEncerrar] = useState('');
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const [enviarTodosOpen, setEnviarTodosOpen] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);
  const hoje = hojeLocal();
  /* O que o campo de data traz aberto. Editavel: o operador corrige quando a saida (ou a
     chegada) nao aconteceu no dia da operacao. */
  const dataPadrao = dataOperacao || hoje;
  // OPEN-01: abertura existente = read-only (equivale ao "encerrada" para fins de escrita/exibição).
  const readOnly = encerrada || somenteLeitura;
  // Tradução slug -> nome oficial (mesmo catálogo usado na Negociação p/ escolher a categoria;
  //   por isso todo slug persistido resolve para um label; nunca exibir slug cru).
  const catLabel = (slug: string | null | undefined) => (slug ? (categoriasDisponiveis.find(c => c.value === slug)?.label ?? slug) : '—');

  if (!operacaoPronta) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center space-y-2">
        <div className="text-[11px] text-muted-foreground">Salve a operação e informe os lotes na aba Negociação.</div>
        {onVoltarNegociacao && <Button type="button" variant="outline" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium " onClick={onVoltarNegociacao}>Voltar para Negociação</Button>}
      </div>
    );
  }
  // Entrega encerrada tem precedência de exibição sobre a negociação não concluída: uma operação
  //   programada+encerrada mostra os lotes em consulta + "Reabrir". Só quando NÃO encerrada
  //   e negociação não concluída é que exibimos o aviso de indisponibilidade (estado pós-reabertura).
  if (!concluida && !encerrada) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center space-y-1">
        <div className="text-[11px] font-semibold text-foreground">{`${v.Aba} indisponível — negociação ainda não concluída`}</div>
        <div className="text-[11px] text-muted-foreground">{`Conclua a negociação (botão “Concluir negociação”) para registrar ${v.artigoAba} ${v.fisico}.`}</div>
      </div>
    );
  }

  // Valor INICIAL do input Peso méd. = peso médio negociado oficial do lote (por loteId; nunca por
  //   ordem/categoria/posição). Ausência → vazio (nunca 0). Só inicializa: não persiste sozinho.
  const pesoInicial = (l: LoteRecebimento) =>
    (l.pesoMedioNegociadoKg != null && Number.isFinite(l.pesoMedioNegociadoKg)) ? formatMed2(l.pesoMedioNegociadoKg) : '';

  /* ⚠ CAMINHO UNICO DE ESCRITA desta tela. O modal nao chama `api.registrar`: ele devolve os valores e quem grava e' esta
     funcao (os valores viajam por PARAMETRO, nunca por estado — a armadilha de closure de `setX` + `registrar` no mesmo clique). */
  const registrar = (l: LoteRecebimento, dados: { quantidade: string; pesoMedio: string; data: string }) => {
    const q = parseNumericValue(dados.quantidade) || 0;
    if (q <= 0) return;
    // valor efetivo: o que o operador digitou; se não tocou, o negociado que inicializa o campo.
    const pm = parseNumericValue(dados.pesoMedio || pesoInicial(l));
    void api.registrar(l.loteId, {
      data: dados.data || dataPadrao,
      categoria: l.categoria ?? '',
      quantidade: Math.trunc(q),
      /* ⚠ SEM `isCompra` — PR-OC-VENDA-ENTREGA-01F. O peso vale nos dois sentidos. Null so' quando nao ha numero. */
      pesoMedio: pm || null,
      observacao: '',
    });
  };

  const receberLote = api.lotes.find(l => l.loteId === receberLoteId) ?? null;

  /* OS NUMEROS SAO DO DONO (`totaisDaEntrega`): a faixa, o total da tabela e o dialogo de encerrar leem a mesma conta. */
  const tot = totaisDaEntrega(api.lotes, api.movimentacoes);
  const totalNegociado = tot.negociado;
  const totalRecebido = tot.entregue;
  const diferencaTotal = totalNegociado - totalRecebido;
  const zeroRecebido = totalRecebido === 0;
  /* SALDO — nao confundir com o gate de leitura. `readOnly` responde "pode escrever?"; isto, "sobrou o que mover?". */
  const algumLoteComSaldo = tot.saldo > 0 || api.lotes.some(l => l.qtdNegociada == null && l.estado !== 'completo');

  const motivoEncerrarObrigatorio = diferencaTotal !== 0 || zeroRecebido;
  const podeEncerrar = !api.saving && (!motivoEncerrarObrigatorio || motivoEncerrar.trim() !== '');
  const podeReabrir = !api.saving && motivoReabrir.trim() !== '';

  // Fecha o dialog ANTES de disparar (nunca congela); o hook cuida de toast/refetch/versão.
  const submitEncerrar = () => {
    if (!podeEncerrar) return;
    const m = motivoEncerrar.trim();
    setEncerrarOpen(false); setMotivoEncerrar('');
    void api.encerrar(m || v.motivoEncerrarPadrao);
  };
  const submitReabrir = () => {
    if (!podeReabrir) return;
    const m = motivoReabrir.trim();
    setReabrirOpen(false); setMotivoReabrir('');
    void api.reabrir(m);
  };

  /* ⚠ RECEBIDO ZERO E' AUSENCIA, NAO NUMERO: "— / 10 cab" diz que ainda nao comecou; sem lote nenhum, tudo "—". */
  const quadro = tot.semLote ? `${v.Feito} — · Saldo — · Kg méd. — · Última ${v.mov} —`
    : `${v.Feito} ${totalRecebido === 0 ? '—' : totalRecebido} / ${totalNegociado} cab · Saldo ${tot.saldo} · Kg méd. ${tot.kgMedio != null ? formatNum(tot.kgMedio, 2) : '—'} · Última ${v.mov} ${tot.ultimaData ? `${tot.ultimaData.slice(8, 10)}/${tot.ultimaData.slice(5, 7)}/${tot.ultimaData.slice(0, 4)}` : '—'}`;
  const avisoTexto = recusa
    ?? (somenteLeitura ? (motivoSomenteLeitura ?? 'Operação fechada com título financeiro. Para editar, estorne o lançamento na aba Financeiro e reabra a operação.')
      : encerrada ? `${v.encerradaTexto} · só leitura · para corrigir, reabra`
        : `${v.abertaTexto} · uma linha por ${v.mov}; o que falta aparece em amarelo`);

  return (
    <div className="rounded-md border bg-card p-1.5 shadow-sm space-y-1.5 min-w-0">
      {/* ── FAIXA DO TOPO (26px, uma linha): os numeros a' esquerda; os gestos a' direita num LUGAR RESERVADO — nada se move quando
          um botao some. No abate, os cartoes do shell sairam: esta faixa e' o unico lugar desses numeros. */}
      <div data-testid="faixa-entrega" className="flex items-center gap-2" style={{ height: ALTURA_FAIXA_ENTREGA }}>
        <div data-testid="quadro-entrega" title={quadro}
          className="uma-linha-que-rola h-full min-w-0 flex-1 rounded-md border bg-muted/20 px-2 text-[10.5px] leading-[24px] tabular-nums text-foreground">
          {quadro}
        </div>
        <div data-testid="gestos-entrega" className="flex w-[220px] shrink-0 items-center justify-end gap-1.5">
          {!readOnly && algumLoteComSaldo && (
            <Button type="button" variant="outline" size="sm" className={BOTAO_FAIXA} disabled={api.saving}
              title="Registrar em todos os lotes a quantidade negociada" aria-label={`${v.Verbo} todos conforme negociado`}
              onClick={() => { if (adocao) setEnviarTodosOpen(true); else void api.receberTodos(); }}>
              {v.Verbo} todos
            </Button>
          )}
          {!readOnly && (
            <Button type="button" size="sm" className={BOTAO_FAIXA} disabled={api.saving}
              onClick={() => { setMotivoEncerrar(''); setEncerrarOpen(true); }}>Encerrar</Button>
          )}
          {encerrada && !somenteLeitura && (
            <Button type="button" variant="outline" size="sm" className={BOTAO_FAIXA} disabled={api.saving}
              onClick={() => { setMotivoReabrir(''); setReabrirOpen(true); }}>Reabrir</Button>
          )}
        </div>
      </div>

      {/* ── AVISO (20px, uma linha): o estado da aba, o motivo da leitura, ou a recusa do banco (sempre aqui, nunca em toast). */}
      <div data-testid={somenteLeitura && motivoSomenteLeitura && !recusa ? 'entrega-somente-leitura' : 'aviso-entrega'} title={avisoTexto}
        className={cn('uma-linha-que-rola text-[10px] leading-[20px]', recusa ? 'text-destructive' : 'text-muted-foreground')}
        role={recusa ? 'alert' : undefined} style={{ height: ALTURA_AVISO_ENTREGA }}>
        {avisoTexto}
      </div>

      <EntregasVendaTabela
        api={api}
        catLabel={catLabel}
        readOnly={!!readOnly}
        lado={ladoEfetivo}
        comAdocao={!!adocao}
        fazendaNome={adocao?.fazendaNome ?? null}
        contraparteNome={adocao?.contraparteNome ?? null}
        onRegistrarNova={setReceberLoteId}
        onEstornar={(id) => void api.estornar(id, v.motivoEstornoPadrao)}
        /* o 📎 fica onde ja' existia (sem adocao: o abate); com a entrega encerrada so' ele resta, salvo somente leitura */
        onDocumento={!adocao && documentosApi && !somenteLeitura ? setDocLoteId : undefined}
        onRecusa={setRecusa}
      />

      {/* ⚠ MESMO CAMINHO DE GRAVACAO: o modal devolve os valores e quem grava e' `registrar`. */}
      {receberLote && (
        <ReceberLoteDialog
          key={receberLote.loteId}
          lote={receberLote}
          rotulo={catLabel(receberLote.categoria)}
          pesoSugerido={pesoInicial(receberLote)}
          hoje={dataPadrao}
          v={v}
          saving={api.saving}
          onFechar={() => setReceberLoteId(null)}
          onGravar={(dados) => { registrar(receberLote, dados); setReceberLoteId(null); }}
        />
      )}

      {enviarTodosOpen && (
        <EnviarTodosDialog
          lotes={api.lotes}
          dataPadrao={dataPadrao}
          catLabel={catLabel}
          saving={api.saving}
          lado={ladoEfetivo}
          onFechar={() => setEnviarTodosOpen(false)}
          onConfirmar={(datas) => { setEnviarTodosOpen(false); void api.receberTodos(datas); }}
        />
      )}

      {/* Encerramento com consequência EXPLÍCITA. Motivo obrigatório quando há diferença ou zero movimentado. */}
      <Dialog open={encerrarOpen} onOpenChange={o => { if (!o) setEncerrarOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[12px]">{`Encerrar ${v.Aba.toLowerCase()}`}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-[11px]">
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded border bg-muted/30 px-1.5 py-1"><div className="text-[10px] text-muted-foreground">Negociado</div><div className="font-semibold tabular-nums">{totalNegociado}</div></div>
              <div className="rounded border bg-muted/30 px-1.5 py-1"><div className="text-[10px] text-muted-foreground">{v.Feito}</div><div className="font-semibold tabular-nums">{totalRecebido}</div></div>
              <div className={`rounded border px-1.5 py-1 ${diferencaTotal !== 0 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/30'}`}><div className="text-[10px] text-muted-foreground">Diferença</div><div className={`font-semibold tabular-nums ${diferencaTotal !== 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>{diferencaTotal}</div></div>
            </div>
            {zeroRecebido ? (
              <div className="flex items-start gap-1.5 rounded border border-destructive bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{`Nenhum animal foi ${v.feito}. Deseja encerrar ${v.artigoAba} mesmo assim?`}</span>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                {`Após encerrar, novas ${v.movs} ficarão bloqueadas e a reabertura exigirá justificativa.`}
              </div>
            )}
            <div>
              <div className="text-[11px] font-medium">Motivo{motivoEncerrarObrigatorio ? ' *' : ' (opcional)'}</div>
              <Textarea value={motivoEncerrar} onChange={e => setMotivoEncerrar(e.target.value)} rows={2}
                className="mt-0.5 text-[11px]" placeholder={motivoEncerrarObrigatorio ? `Justifique a diferença / ausência de ${v.movs}` : 'Opcional'} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium " onClick={() => setEncerrarOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium " variant={zeroRecebido ? 'destructive' : 'default'} disabled={!podeEncerrar} onClick={submitEncerrar}>
              {`Encerrar ${v.Aba.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reabertura AUDITADA (não altera a negociação). Motivo obrigatório. */}
      <Dialog open={reabrirOpen} onOpenChange={o => { if (!o) setReabrirOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[12px]">{`Reabrir ${v.Aba.toLowerCase()}`}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-[11px]">
            <div className="text-[11px] text-muted-foreground">
              Esta ação é <b>auditada</b>: reabre {v.artigoAba} para novas {v.movs} e fica registrada com o motivo informado. <b>Não</b> altera a negociação — se a operação estiver programada, {v.artigoAba} seguirá indisponível até a negociação ser concluída.
            </div>
            <div>
              <div className="text-[11px] font-medium">Motivo *</div>
              <Textarea value={motivoReabrir} onChange={e => setMotivoReabrir(e.target.value)} rows={2}
                className="mt-0.5 text-[11px]" placeholder="Justifique a reabertura" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium " onClick={() => setReabrirOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium " disabled={!podeReabrir} onClick={submitReabrir}>Reabrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registro rápido de documento no contexto do lote — reutiliza o cadastro OFICIAL (DocumentoFormOC)
          com a instância única documentosApi. A aba Documentos segue sendo a tela oficial. */}
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
