/**
 * A aba Documentos de um lançamento financeiro.
 *
 * ⚠ IRMÃ DE `AbaDocumentosOC`, NÃO A MESMA — decisão do Gabriel (97b, opção b). O
 * documento da OC tem componentes (acréscimo, desconto comercial, retenção) e lotes; o do
 * lançamento é uma linha com um valor. Unificar as duas telas obrigaria a tornar opcional
 * metade do que aquele componente é, e Compra/Venda/Abate pagariam por uma tela que não é
 * delas. O que se duplica aqui é APARÊNCIA (padrão A18); a REGRA — o confronto — mora no
 * banco e é lida, nunca recalculada.
 *
 * ⚠ O TOPO NUNCA SOMA. `fin_documento_confronto` devolve documentado, valor do lançamento,
 * diferença e o `confere`; a tela só formata. Somar aqui criaria a segunda resposta para a
 * mesma pergunta.
 *
 * ⚠ DIFERENÇA É INFORMAÇÃO, NÃO ALARME. Nota complementar, adiantamento e frete por fora
 * fazem o documentado divergir do lançado sem que nada esteja errado — por isso âmbar e
 * uma frase, não vermelho e um bloqueio.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { DatePicker } from '@/components/ui/date-picker';
import { Paperclip, Pencil, Ban, Plus, X } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import {
  ESPECIES_LANC_DOC, especieValida, rotuloEspecieDoc, type EspecieLancDoc, type LancDocumento, type LancDocPayload,
  type LancamentoDocumentosApi, type DestinoDocumento,
} from '@/hooks/useLancamentoDocumentos';

/** A identidade da linha — A18: sem número próprio, o rótulo do tipo SOBE para cá. */
function identidade(d: LancDocumento): string {
  /* OC-DOC-ESPECIE-01: das duas origens — a NF da OC aparecia "Outro", e a complementar some sem a crua. */
  const base = rotuloEspecieDoc(d);
  if (!d.numero) return base;
  /* PR 2b — padrão da casa: NF no formato 000.000.000 */
  const numero = d.especie === 'nf' ? (formatNFNumber(d.numero) || d.numero) : d.numero;
  return d.serie ? `${base} ${numero} · série ${d.serie}` : `${base} ${numero}`;
}

const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : null);

export function AbaDocumentosLancamento({ api, somenteLeitura, fornecedores, onAnexarBoletosDasParcelas }: {
  api: LancamentoDocumentosApi;
  somenteLeitura?: boolean;
  fornecedores: { id: string; nome: string }[];
  /** Presente só quando o lançamento é parcela de um parcelamento — abre "Anexar vários boletos" (PR 2b). */
  onAnexarBoletosDasParcelas?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<LancDocumento | null>(null);
  const [cancelando, setCancelando] = useState<LancDocumento | null>(null);
  const [motivo, setMotivo] = useState('');

  const c = api.confronto;
  const ativos = api.documentos.filter(d => !d.cancelado);

  /**
   * Abre a OC na aba Documentos — DOC-UMA-FONTE-01.
   *
   * ⚠ MESMA CONVENÇÃO DE `abrirOperacaoOC`, copiada dela: três parâmetros mutuamente
   * exclusivos (`oc_compra`/`oc_venda`/`oc_abate`), e apagar os outros dois não é higiene —
   * dois ligados ao mesmo tempo abrem dois shells no mesmo render. O tipo vem do banco
   * porque um id sem tipo é meio endereço.
   */
  const abrirOperacao = (d: LancDocumento) => {
    if (!d.operacaoId) return;
    const p = new URLSearchParams(searchParams);
    const tipo = api.operacaoTipo;
    if (tipo === 'venda') { p.set('oc_venda', '1'); p.delete('oc_compra'); p.delete('oc_abate'); }
    else if (tipo === 'abate') { p.set('oc_abate', '1'); p.delete('oc_compra'); p.delete('oc_venda'); }
    else { p.set('oc_compra', '1'); p.delete('oc_venda'); p.delete('oc_abate'); }
    p.set('oc_id', d.operacaoId);
    p.set('oc_aba', 'documentos');
    setSearchParams(p);
  };

  const abrirArquivo = async (d: LancDocumento) => {
    if (!d.url) return;
    const url = await api.urlAssinada(d.url, d.origem);
    if (!url) { toast.error('Não foi possível abrir o arquivo.'); return; }
    window.open(url, '_blank', 'noopener');
  };

  const confirmarCancelamento = async () => {
    if (!cancelando) return;
    /* ⚠ MOTIVO OBRIGATÓRIO: cancelar um documento é o que a auditoria vai mostrar daqui a
       um ano, e "cancelado sem motivo" é um registro que não explica nada. */
    if (!motivo.trim()) { toast.error('Informe o motivo do cancelamento.'); return; }
    try {
      await api.cancelar(cancelando.id, motivo.trim());
      toast.success('Documento cancelado.');
      setCancelando(null); setMotivo('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar o documento.');
    }
  };

  return (
    <div className="space-y-2">
      {/* ── TOPO: o confronto, vindo do banco ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
        {/* ⚠ COM A NF DA COMPRA, A CONFERÊNCIA É PELA COMPRA — FIN-NFE-PARCELAS-01 PR 2b: a nota contra a
            soma das parcelas ATIVAS (o banco já responde, chaves `grupo_*`). Sem ela, como sempre. */}
        <div>
          <div className="text-[11px] text-muted-foreground leading-none">{c?.grupo ? 'Nota da compra' : 'Documentado'}</div>
          <div className="mt-1 text-[20px] font-medium leading-none tabular-nums" data-testid="topo-documentado">
            {c ? formatMoeda(c.grupo ? c.grupo.valorDocumento : c.valorDocumentado) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground leading-none">
            {c?.grupo ? `Parcelas ativas (${c.grupo.qtd})` : 'Valor do lançamento'}
          </div>
          <div className="mt-1 text-[20px] font-medium leading-none tabular-nums" data-testid="topo-valor">
            {c ? formatMoeda(c.grupo ? c.grupo.somaLancamentos : c.valorLancamento) : '—'}
          </div>
        </div>
        {c && c.docsComValor > 0 && (
          c.confere
            ? <div className="text-[11px] font-medium text-emerald-600">confere</div>
            : <div className="text-[11px] font-medium text-amber-700">
                {formatMoeda(Math.abs(c.diferenca))} {c.diferenca > 0 ? 'a mais' : 'a menos'}
              </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {ativos.length === 0 ? 'Nenhum documento anexado'
            : `${ativos.length} ${ativos.length === 1 ? 'documento' : 'documentos'}`}
          {/* O destino do PRÓXIMO documento, dito antes do clique — nunca depois. */}
          {api.operacaoId && ' · o próximo documento nasce na operação comercial'}
        </span>
        <span className="flex items-center gap-1.5">
          {onAnexarBoletosDasParcelas && (
            <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" data-testid="anexar-boletos-parcelas"
              disabled={somenteLeitura} onClick={onAnexarBoletosDasParcelas}>
              Anexar boletos das parcelas
            </Button>
          )}
          <Button type="button" size="sm" className="h-7 gap-1 px-2.5 text-[11px]"
            disabled={somenteLeitura} onClick={() => { setEditando(null); setFormAberto(true); }}>
            <Plus className="h-3.5 w-3.5" /> Adicionar documento
          </Button>
        </span>
      </div>

      {/* ── LISTA A18 ─────────────────────────────────────────────────────────── */}
      {api.documentos.length > 0 && (
        <div className="divide-y rounded-md border">
          {api.documentos.map(d => (
            <div key={d.id} className="flex items-center gap-2 px-3.5 py-[7px] leading-[1.35]">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[12px] font-medium text-foreground">{identidade(d)}</span>
                  {/* ⚠ A PÍLULA DIZ DE QUEM É O PAPEL, e o clique leva até ele. Sem ela, a
                      NF da operação pareceria um documento do lançamento — e o operador
                      anexaria a segunda cópia da mesma nota, que é justamente o que esta
                      frente existe para impedir. */}
                  {/* PR 2b — a NF da compra, ligada às parcelas: o selo diz a quantas. Irmão do "da operação". */}
                  {(d.ligadoAQtd ?? 1) > 1 && (
                    <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-px text-[10px] text-sky-800" data-testid="selo-parcelas"
                      title="Esta nota está em várias parcelas da mesma compra">
                      {d.ligadoAQtd} parcelas
                    </span>
                  )}
                  {d.origem === 'operacao' && (
                    <button type="button"
                      title="Este documento é da operação comercial — abrir a OC na aba Documentos"
                      onClick={() => abrirOperacao(d)}
                      className="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[10px] text-blue-700 underline-offset-2 hover:underline dark:bg-blue-900/40 dark:text-blue-300">
                      da operação
                    </button>
                  )}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {/* ⚠ SEM ARQUIVO É AVISO, NÃO ERRO: registrar primeiro e anexar depois é
                      um caminho legítimo, e a linha diz o que falta em vez de esconder. */}
                  {!d.url && !d.cancelado
                    ? <span className="text-amber-700">sem arquivo</span>
                    : [d.emitenteNome, dataBr(d.dataEmissao)].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div className="shrink-0 text-right text-[12px] font-medium tabular-nums">
                {d.valorDocumento == null ? '—' : formatMoeda(d.valorDocumento)}
              </div>
              {d.cancelado ? (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground"
                  title={d.canceladoMotivo ?? undefined}>Cancelado</span>
              ) : (
                <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] text-emerald-700">Ativo</span>
              )}
              {/* Documento cancelado não tem ações: é história, não trabalho pendente. */}
              {!d.cancelado && (
                <div className="flex shrink-0 items-center gap-2.5 text-muted-foreground">
                  <button type="button" title={d.url ? 'Abrir arquivo' : 'Sem arquivo anexado'}
                    aria-label="Abrir arquivo" disabled={!d.url}
                    onClick={() => abrirArquivo(d)}
                    className="hover:text-foreground disabled:opacity-30">
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" title="Editar documento" aria-label="Editar documento"
                    disabled={somenteLeitura} onClick={() => { setEditando(d); setFormAberto(true); }}
                    className="hover:text-foreground disabled:opacity-30">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {/* ⚠ NF DA COMPRA NÃO SE CANCELA PELO CARTÃO (decisão do Gabriel, PR 2b): ela está em N
                      parcelas, e o caminho é o lápis, que avisa e pede o motivo. */}
                  {(d.ligadoAQtd ?? 1) <= 1 && (
                    <button type="button" title="Cancelar documento" aria-label="Cancelar documento"
                      disabled={somenteLeitura} onClick={() => { setCancelando(d); setMotivo(''); }}
                      className="hover:text-destructive disabled:opacity-30">
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {formAberto && (
        <FormDocumento api={api} documento={editando} fornecedores={fornecedores}
          onFechar={() => { setFormAberto(false); setEditando(null); }} />
      )}

      {cancelando && (
        <Dialog open onOpenChange={(o) => { if (!o) { setCancelando(null); setMotivo(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogTitle className="text-[14px]">Cancelar documento</DialogTitle>
            <DialogDescription className="text-[11px]">
              {identidade(cancelando)} — o documento sai do confronto e fica registrado como cancelado.
            </DialogDescription>
            <Textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo do cancelamento" className="text-[12px]" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost"
                onClick={() => { setCancelando(null); setMotivo(''); }}>Voltar</Button>
              <Button type="button" onClick={confirmarCancelamento} disabled={api.saving}>Cancelar documento</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** O formulário — registrar ou editar. O arquivo entra depois que o documento existe.
 *  ⚠ EXPORTADO para os documentos PENDENTES do "Novo lançamento" (FIN-NFE-PARCELAS-01): a mesma tela,
 *  com uma `api` que guarda em memória. `pendente` só troca o texto do botão e cala o toast de
 *  "registrado" — o documento ainda não foi a lugar nenhum. */
export function FormDocumento({ api, documento, fornecedores, onFechar, pendente, semBoleto }: {
  api: LancamentoDocumentosApi;
  documento: LancDocumento | null;
  fornecedores: { id: string; nome: string }[];
  onFechar: () => void;
  pendente?: boolean;
  /** Documento da COMPRA no parcelado: o boleto é por parcela, na grade de parcelas (PR 2b). */
  semBoleto?: boolean;
}) {
  const [especie, setEspecie] = useState<EspecieLancDoc>(documento?.especie ?? 'nf');
  const [numero, setNumero] = useState(documento?.numero ?? '');
  const [serie, setSerie] = useState(documento?.serie ?? '');
  const [dataEmissao, setDataEmissao] = useState(documento?.dataEmissao ?? '');
  const [valor, setValor] = useState<number | null>(documento?.valorDocumento ?? null);
  const [emitenteId, setEmitenteId] = useState(documento?.emitenteId ?? '');
  const [emitenteNome, setEmitenteNome] = useState(documento?.emitenteNome ?? '');
  const [emitenteDoc, setEmitenteDoc] = useState(documento?.emitenteDocumento ?? '');
  const [chave, setChave] = useState(documento?.chaveAcesso ?? '');
  const [observacao, setObservacao] = useState(documento?.observacao ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  /* UX-TOAST-01 — PR 2b: a recusa (arquivo em formato errado, RPC) fica AO LADO do botão, não num toast. */
  const [erroForm, setErroForm] = useState<string | null>(null);
  /* PR 2b — NF da compra (em N parcelas): cancelar pelo lápis, com motivo, sai das N de uma vez. */
  const compartilhada = (documento?.ligadoAQtd ?? 1) > 1;
  const [cancelandoNota, setCancelandoNota] = useState(false);
  const [motivoNota, setMotivoNota] = useState('');
  const especiesDoForm = semBoleto ? ESPECIES_LANC_DOC.filter(e => e.value !== 'boleto') : ESPECIES_LANC_DOC;

  const OUTRO = '__outro__';
  const emitenteEhOutro = emitenteId === OUTRO;
  /* O documento que está sendo criado/editado pertence à OC? Documento novo segue o
     lançamento (`api.operacaoId`); documento existente segue a própria origem. */
  const destinoOC = documento ? documento.origem === 'operacao' : !!api.operacaoId;
  /* ⚠ DOCUMENTO DA OC: ESPECIE SO' LEITURA AQUI — OC-DOC-ESPECIE-01. O vocabulario da OC distingue NF
     principal de complementar, e o daqui nao; mandar a traducao por cima rebaixaria a complementar.
     Quem troca a especie de documento da OC e' a aba da OC. Sem `especie` no payload, o banco preserva. */
  const especieSoLeitura = documento?.origem === 'operacao';

  const payload = (): LancDocPayload => ({
    especie: especieSoLeitura ? undefined : especie,
    numero: numero.trim() || null,
    serie: serie.trim() || null,
    /* A chave só existe em nota fiscal — guardá-la noutra espécie seria dado sem dono. */
    chaveAcesso: especie === 'nf' ? (chave.trim() || null) : null,
    dataEmissao: dataEmissao || null,
    /* `undefined` não sobe (ver `paraJson`): na OC o valor não é campo, e mandar `null`
       apagaria o que os componentes dizem. */
    valorDocumento: destinoOC ? undefined : valor,
    observacao: observacao.trim() || null,
    emitenteId: emitenteEhOutro ? null : (emitenteId || null),
    emitenteNome: emitenteEhOutro ? (emitenteNome.trim() || null)
      : (fornecedores.find(f => f.id === emitenteId)?.nome ?? null),
    emitenteDocumento: emitenteEhOutro ? (emitenteDoc.trim() || null) : null,
  });

  const cancelarNota = async () => {
    if (!documento) return;
    if (!motivoNota.trim()) { setErroForm('Informe o motivo do cancelamento da nota.'); return; }
    setEnviando(true);
    setErroForm(null);
    try {
      await api.cancelar(documento.id, motivoNota.trim());
      onFechar();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Falha ao cancelar a nota.');
    } finally {
      setEnviando(false);
    }
  };

  const salvar = async () => {
    setEnviando(true);
    setErroForm(null);
    try {
      let id = documento?.id ?? null;
      let versao = documento?.versao ?? 1;
      /* ⚠ O ENDERECO DO DOCUMENTO VAI EXPLICITO PARA O ANEXO — OC-DOC-ESPECIE-01: o do documento em
         edicao, ou o que o `registrar` devolveu. Nunca a lista em memoria, que neste clique ainda e' a
         do render anterior e nao conhece o documento que acabou de nascer. */
      let destino: DestinoDocumento | null = documento
        ? { origem: documento.origem, operacaoId: documento.operacaoId } : null;
      if (documento) {
        await api.editar(documento.id, documento.versao, payload());
        versao = documento.versao + 1;
      } else {
        const criado = await api.registrar(payload());
        if (!criado) { setErroForm('Não foi possível registrar o documento.'); return; }
        id = criado.id;
        destino = { origem: criado.origem, operacaoId: criado.operacaoId };
        versao = 1;
      }
      if (arquivo && id && destino) await api.anexar(id, versao, arquivo, destino);
      if (!pendente) toast.success(documento ? 'Documento atualizado.' : 'Documento registrado.');
      onFechar();
    } catch (e) {
      /* ⚠ A MENSAGEM DA RPC, INTEIRA: ela nomeia o que recusou (espécie inválida, versão
         em conflito, lançamento cancelado). Trocá-la por "erro ao salvar" apagaria a única
         pista que o operador tem. */
      setErroForm(e instanceof Error ? e.message : 'Falha ao salvar o documento.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      {/* PR 2b — cabeçalho e rodapé fixos, só o corpo rola: com o aviso da nota compartilhada e o motivo do
          cancelamento, o formulário passava da altura da tela e o cabeçalho sumia (visto na prova na tela). */}
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex max-h-[calc(100vh-32px)] flex-col">
        <div className="bg-primary px-4 py-2.5 text-primary-foreground flex shrink-0 items-center justify-between">
          <DialogTitle className="text-[14px] font-semibold">
            {documento ? 'Editar documento' : 'Novo documento'}
          </DialogTitle>
          <button type="button" onClick={onFechar} title="Fechar" aria-label="Fechar"
            className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <DialogDescription className="sr-only">
          Informe espécie, número, data, valor e emitente do documento deste lançamento.
        </DialogDescription>

        <div className="min-h-0 flex-1 overflow-auto">
        {compartilhada && (
          <p className="mx-4 mt-3 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-900" data-testid="aviso-nota-compartilhada">
            Esta nota está em {documento?.ligadoAQtd} parcelas; a alteração vale para todas.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <div>
            <Label className="text-[10px]">Espécie <span className="text-destructive">*</span></Label>
            <Select value={especie} onValueChange={v => setEspecie(especieValida(v))} disabled={especieSoLeitura}>
              <SelectTrigger className="h-8 text-[12px] mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {especiesDoForm.map(e => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* ⚠ O VOCABULÁRIO DA OC É MENOR, e o operador precisa saber ANTES de salvar.
                Lá só existem `nf_principal`, `nf_complementar`, `recibo` e `outro`: boleto e
                comprovante viram "Outro", e a espécie escolhida se perde. Avisar aqui é
                mais barato que descobrir abrindo a operação. */}
            {especieSoLeitura && (
              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground" data-testid="especie-da-oc">
                {documento ? `${rotuloEspecieDoc(documento)} · a espécie de documento da operação se troca na aba da OC` : null}
              </p>
            )}
            {destinoOC && !especieSoLeitura && (especie === 'boleto' || especie === 'comprovante') && (
              <p className="mt-0.5 text-[10px] leading-tight text-amber-700 dark:text-amber-300">
                Na operação comercial esta espécie é registrada como "Outro".
              </p>
            )}
          </div>
          <div>
            <Label className="text-[10px]">Número</Label>
            <Input value={numero} onChange={e => setNumero(e.target.value)}
              className="h-8 text-[12px] mt-0.5" placeholder="Opcional" />
          </div>
          <div>
            <Label className="text-[10px]">Série</Label>
            <Input value={serie} onChange={e => setSerie(e.target.value)}
              className="h-8 text-[12px] mt-0.5" placeholder="Opcional" />
          </div>
          <div>
            <Label className="text-[10px]">Data de emissão</Label>
            <DatePicker value={dataEmissao} onChange={setDataEmissao} className="h-8 text-[12px] mt-0.5" />
          </div>
          {/* ⚠ NA OC, O VALOR DO DOCUMENTO NÃO É UM CAMPO — DOC-UMA-FONTE-01. Lá ele é a
              soma dos COMPONENTES (acréscimo, desconto comercial, retenção), que mexem na
              liquidação da operação. Um campo aqui aceitaria um número que a RPC descarta,
              e o documento apareceria valendo zero sem ninguém entender por quê. Dizer
              onde ele mora é a resposta honesta; escolher uma natureza de componente por
              conta própria seria decidir dinheiro. */}
          {destinoOC ? (
            <div>
              <Label className="text-[10px] text-muted-foreground">Valor do documento</Label>
              <p className="mt-0.5 h-8 text-[10px] leading-tight text-muted-foreground">
                Vem dos componentes, na aba Documentos da operação.
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-[10px]">Valor do documento</Label>
              <CampoMoeda valor={valor} onChange={setValor} className="h-8 text-[12px] mt-0.5 text-right" />
            </div>
          )}
          <div>
            <Label className="text-[10px]">Emitente</Label>
            <Select value={emitenteId || undefined} onValueChange={setEmitenteId}>
              <SelectTrigger className="h-8 text-[12px] mt-0.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {fornecedores.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
                <SelectItem value={OUTRO}>Outro (informar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {emitenteEhOutro && (<>
            <div>
              <Label className="text-[10px]">Nome do emitente</Label>
              <Input value={emitenteNome} onChange={e => setEmitenteNome(e.target.value)}
                className="h-8 text-[12px] mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px]">CNPJ / CPF do emitente</Label>
              <Input value={emitenteDoc} onChange={e => setEmitenteDoc(e.target.value)}
                className="h-8 text-[12px] mt-0.5" />
            </div>
          </>)}
          {especie === 'nf' && (
            <div className="col-span-2">
              <Label className="text-[10px]">Chave de acesso</Label>
              <Input value={chave} onChange={e => setChave(e.target.value)}
                className="h-8 text-[12px] mt-0.5 font-mono" placeholder="44 dígitos" />
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-[10px]">Observação</Label>
            <Input value={observacao} onChange={e => setObservacao(e.target.value)}
              className="h-8 text-[12px] mt-0.5" placeholder="Opcional" />
          </div>
          <div className="col-span-2">
            <Label className="text-[10px]">Arquivo</Label>
            <Input type="file" accept="application/pdf,image/jpeg,image/png"
              onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              className="h-8 text-[11px] mt-0.5 file:text-[11px]" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              PDF, JPG ou PNG, até 10 MB. Pode ficar para depois — o documento aparece na lista dizendo “sem arquivo”.
            </p>
          </div>
        </div>

        {compartilhada && cancelandoNota && (
          <div className="mx-4 mb-2 space-y-1 rounded border border-red-200 bg-red-50 px-2 py-1.5" data-testid="cancelar-nota">
            <Label className="text-[10px]">Motivo do cancelamento da nota <span className="text-destructive">*</span></Label>
            <Input value={motivoNota} onChange={e => setMotivoNota(e.target.value)} className="h-8 text-[12px]"
              placeholder={`A nota sai das ${documento?.ligadoAQtd} parcelas`} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="h-7 text-[11px]" onClick={() => { setCancelandoNota(false); setMotivoNota(''); setErroForm(null); }}>Voltar</Button>
              <Button type="button" variant="destructive" className="h-7 text-[11px]" disabled={enviando} onClick={cancelarNota}
                data-testid="confirmar-cancelar-nota">
                Cancelar nota
              </Button>
            </div>
          </div>
        )}

        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-card px-4 py-2.5">
          {erroForm && (
            <span className="mr-auto text-[10px] leading-tight text-destructive" data-testid="erro-form-documento">{erroForm}</span>
          )}
          {compartilhada && !cancelandoNota && (
            <Button type="button" variant="outline" className={`${erroForm ? '' : 'mr-auto'} text-destructive`}
              onClick={() => { setCancelandoNota(true); setErroForm(null); }} data-testid="abrir-cancelar-nota">
              Cancelar nota (sai das {documento?.ligadoAQtd} parcelas)
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={enviando || api.saving}>
            {pendente ? (documento ? 'Salvar na lista' : 'Adicionar à lista') : (documento ? 'Salvar documento' : 'Registrar documento')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
