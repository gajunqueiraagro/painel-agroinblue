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
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { DatePicker } from '@/components/ui/date-picker';
import { Paperclip, Pencil, Ban, Plus, X } from 'lucide-react';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { ajudaDaRegra } from '@/lib/arquivo/aceitarArquivo';
import { formatMoeda } from '@/lib/calculos/formatters';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import {
  ESPECIES_LANC_DOC, rotuloEspecieDoc, type EspecieLancDoc, type LancDocumento, type LancDocPayload,
  type LancamentoDocumentosApi, type DestinoDocumento, REGRA_ARQUIVO_DO_DOCUMENTO,
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

/**
 * A GRADE DA LISTA — FIN-DOCUMENTOS-LAYOUT-01 (mock do Gabriel, 04/10/2026): Documento · Emitente · Emissão · Valor ·
 * Situação · ações. A grade é UMA, na tabela (`GRADE_DOCUMENTOS`); o cabeçalho e cada linha são SUBGRADES dela
 * (`LINHA_DOCUMENTOS`), então as colunas alinham por construção — inclusive a de Documento, cuja largura é a do maior
 * conteúdo entre todas as linhas.
 *
 * ⚠ UMA LINHA POR REGISTRO, SEMPRE (UI-LINHA-UNICA-01, Gabriel 04/10/2026): Documento é `max-content` e não quebra nem corta —
 *   identidade e selos sempre inteiros; Emitente (e o "motivo: …" do cancelado) fica com o resto e CORTA na célula com "…",
 *   com o texto inteiro no `title` — a linha tem 22px, nunca mais. As quatro últimas são fixas; o respiro de
 *   10px das bordas mora na primeira e na última célula (padding numa subgrade encolheria as trilhas das pontas), por
 *   isso a última trilha tem 72 = 62 + 10.
 */
const GRADE_DOCUMENTOS = 'grid grid-cols-[max-content_minmax(0,1fr)_70px_92px_66px_72px] gap-x-[10px]';
const LINHA_DOCUMENTOS = 'col-span-full grid [grid-template-columns:subgrid] items-center';

export function AbaDocumentosLancamento({ api, somenteLeitura, fornecedores, onAnexarBoletosDasParcelas, sugestao }: {
  api: LancamentoDocumentosApi;
  somenteLeitura?: boolean;
  fornecedores: FornecedorDoDocumento[];
  /** O que o lançamento SALVO já diz, para o documento NOVO nascer preenchido — FIN-DOCUMENTO-FORM-01. É a MESMA sugestão do
   *  lançamento novo, montada no mesmo ponto do `LancamentoV2Dialog`. Editar um documento existente nunca a recebe. */
  sugestao?: SugestaoDocumento;
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
  /* ⚠ CANCELADO NÃO FICA NA LISTA — FIN-DOCUMENTOS-LAYOUT-01 (pedido do Gabriel, 29/09 e 04/10: "quando eu cancelo um, ele não
     some, fica poluindo a tela"). Ele é história: sai da vista e fica atrás do "mostrar" do rodapé, o mesmo padrão das contas
     ocultas de "Saldos por conta". Estado local: não persiste e volta a ocultar quando o modal fecha. */
  const cancelados = api.documentos.filter(d => d.cancelado);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const linhas = mostrarCancelados ? [...ativos, ...cancelados] : ativos;

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
    <div className="space-y-1.5">
      {/* ── TOPO: o confronto, vindo do banco ─────────────────────────────────── */}
      {/* ⚠ UMA FAIXA DE LINHA ÚNICA — FIN-DOCUMENTOS-LAYOUT-01. Era rótulo de 11px sobre valor de 20px, com 11px de respiro:
          o confronto ocupava mais altura que a lista que ele resume. Rótulo 10px e valor 12px lado a lado; em largura
          estreita os grupos QUEBRAM de linha (`flex-wrap`), não cortam. */}
      <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1 rounded-md border bg-muted/20 px-3.5 py-[5px] leading-[14px]" data-testid="topo-confronto">
        {/* ⚠ COM A NF DA COMPRA, A CONFERÊNCIA É PELA COMPRA — FIN-NFE-PARCELAS-01 PR 2b: a nota contra a
            soma das parcelas ATIVAS (o banco já responde, chaves `grupo_*`). Sem ela, como sempre. */}
        <span className="inline-flex items-baseline gap-[5px] whitespace-nowrap">
          <span className="text-[10px] text-muted-foreground">{c?.grupo ? 'Nota da compra' : 'Documentado'}</span>
          <span className="text-[12px] font-semibold tabular-nums" data-testid="topo-documentado">
            {c ? formatMoeda(c.grupo ? c.grupo.valorDocumento : c.valorDocumentado) : '—'}
          </span>
        </span>
        <span className="inline-flex items-baseline gap-[5px] whitespace-nowrap">
          <span className="text-[10px] text-muted-foreground">
            {c?.grupo ? `Parcelas ativas (${c.grupo.qtd})` : 'Valor do lançamento'}
          </span>
          <span className="text-[12px] font-semibold tabular-nums" data-testid="topo-valor">
            {c ? formatMoeda(c.grupo ? c.grupo.somaLancamentos : c.valorLancamento) : '—'}
          </span>
        </span>
        {c && c.docsComValor > 0 && (
          c.confere
            ? <span className="whitespace-nowrap text-[11px] font-medium text-emerald-600">confere</span>
            : <span className="whitespace-nowrap text-[11px] font-medium text-amber-700">
                {formatMoeda(Math.abs(c.diferenca))} {c.diferenca > 0 ? 'a mais' : 'a menos'}
              </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {ativos.length === 0 ? 'Nenhum documento anexado'
            : `${ativos.length} ${ativos.length === 1 ? 'documento' : 'documentos'}`}
          {/* O destino do PRÓXIMO documento, dito antes do clique — nunca depois. */}
          {api.operacaoId && ' · o próximo documento nasce na operação comercial'}
        </span>
        <span className="flex items-center gap-1.5">
          {onAnexarBoletosDasParcelas && (
            <Button type="button" size="sm" variant="outline" className="h-[22px] px-2 text-[10px]" data-testid="anexar-boletos-parcelas"
              disabled={somenteLeitura} onClick={onAnexarBoletosDasParcelas}>
              Anexar boletos das parcelas
            </Button>
          )}
          <Button type="button" size="sm" className="h-[22px] gap-1 px-2 text-[10px]"
            disabled={somenteLeitura} onClick={() => { setEditando(null); setFormAberto(true); }}>
            <Plus className="h-3 w-3" /> Adicionar documento
          </Button>
        </span>
      </div>

      {/* ── A TABELA DOS DOCUMENTOS ───────────────────────────────────────────── */}
      {/* ⚠ TABELA COMPACTA DE LINHA ÚNICA — FIN-DOCUMENTOS-LAYOUT-01 (padrão de tabela da casa: cabeçalho navy 9,5px, linha
          10px). Era um cartão de duas linhas por documento (12px + 10px), com emitente e data dividindo a segunda; agora
          cada informação tem a sua coluna e a linha tem 22px, sempre (o emitente corta, não quebra). Cabeçalho e linhas são
          subgrades da grade da tabela (`GRADE_DOCUMENTOS`). */}
      {api.documentos.length > 0 && (
        <div className={`${GRADE_DOCUMENTOS} overflow-hidden rounded-md border`} data-testid="tabela-documentos">
          <div className={`${LINHA_DOCUMENTOS} h-[18px] bg-primary text-[9.5px] font-medium leading-none text-primary-foreground/85`} data-testid="cabecalho-documentos">
            <span className="pl-[10px]">Documento</span>
            <span>Emitente</span>
            <span>Emissão</span>
            <span className="text-right">Valor</span>
            <span className="text-center">Situação</span>
            <span />
          </div>
          {linhas.map(d => {
            const nome = identidade(d);
            /* Na linha cancelada a coluna Emitente diz POR QUE saiu (o motivo); sem motivo, o emitente. */
            const emitente = d.cancelado && d.canceladoMotivo ? `motivo: ${d.canceladoMotivo}` : (d.emitenteNome || '');
            const semArquivo = !d.url && !d.cancelado;
            return (
            <div key={d.id} data-testid="linha-documento" data-cancelado={d.cancelado ? 'sim' : undefined}
              className={`${LINHA_DOCUMENTOS} h-[22px] border-t text-[10px] leading-none ${d.cancelado ? 'bg-muted/40 text-muted-foreground/70' : ''}`}>
              <div className="flex items-center gap-1.5 whitespace-nowrap pl-[10px]">
                <span className={d.cancelado ? 'line-through' : 'font-semibold text-foreground'} data-testid="doc-nome">{nome}</span>
                {/* ⚠ A PÍLULA DIZ DE QUEM É O PAPEL, e o clique leva até ele. Sem ela, a
                    NF da operação pareceria um documento do lançamento — e o operador
                    anexaria a segunda cópia da mesma nota, que é justamente o que esta
                    frente existe para impedir. */}
                {/* PR 2b — a NF da compra, ligada às parcelas: o selo diz a quantas. Irmão do "da operação". */}
                {(d.ligadoAQtd ?? 1) > 1 && (
                  <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-px text-[9.5px] text-sky-800" data-testid="selo-parcelas"
                    title="Esta nota está em várias parcelas da mesma compra">
                    {d.ligadoAQtd} parcelas
                  </span>
                )}
                {d.origem === 'operacao' && (
                  <button type="button"
                    title="Este documento é da operação comercial — abrir a OC na aba Documentos"
                    onClick={() => abrirOperacao(d)}
                    className="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[9.5px] text-blue-700 underline-offset-2 hover:underline dark:bg-blue-900/40 dark:text-blue-300">
                    da operação
                  </button>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground" data-testid="cel-emitente">
                {/* ⚠ SEM ARQUIVO É AVISO, NÃO ERRO: registrar primeiro e anexar depois é
                    um caminho legítimo, e a linha diz o que falta em vez de esconder.
                    Fica ANTES do emitente e não encolhe; quem corta é o emitente. */}
                {semArquivo && <span className="shrink-0 whitespace-nowrap text-amber-700">sem arquivo</span>}
                <span className={`min-w-0 truncate ${d.cancelado ? 'text-muted-foreground/70' : ''}`} title={emitente || undefined} data-testid="doc-emitente-texto">{emitente || (semArquivo ? '' : '—')}</span>
              </div>
              <span className={`whitespace-nowrap ${d.cancelado ? '' : 'text-muted-foreground'}`} data-testid="doc-emissao">{dataBr(d.dataEmissao) ?? '—'}</span>
              <span className="whitespace-nowrap text-right tabular-nums" data-testid="doc-valor">
                {d.valorDocumento == null ? '—' : formatMoeda(d.valorDocumento)}
              </span>
              <span className="text-center">
                {d.cancelado ? (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[9.5px] text-muted-foreground"
                    title={d.canceladoMotivo ?? undefined}>Cancelado</span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[9.5px] text-emerald-700">Ativo</span>
                )}
              </span>
              {/* Documento cancelado não tem ações: é história, não trabalho pendente. */}
              {d.cancelado ? <span /> : (
                <div className="flex items-center justify-end gap-2 pr-[10px] text-muted-foreground">
                  <button type="button" title={d.url ? 'Abrir arquivo' : 'Sem arquivo anexado'}
                    aria-label="Abrir arquivo" disabled={!d.url}
                    onClick={() => abrirArquivo(d)}
                    className="hover:text-foreground disabled:opacity-30">
                    <Paperclip className="h-3 w-3" />
                  </button>
                  <button type="button" title="Editar documento" aria-label="Editar documento"
                    disabled={somenteLeitura} onClick={() => { setEditando(d); setFormAberto(true); }}
                    className="hover:text-foreground disabled:opacity-30">
                    <Pencil className="h-3 w-3" />
                  </button>
                  {/* ⚠ NF DA COMPRA NÃO SE CANCELA PELO CARTÃO (decisão do Gabriel, PR 2b): ela está em N
                      parcelas, e o caminho é o lápis, que avisa e pede o motivo. */}
                  {(d.ligadoAQtd ?? 1) <= 1 && (
                    <button type="button" title="Cancelar documento" aria-label="Cancelar documento"
                      disabled={somenteLeitura} onClick={() => { setCancelando(d); setMotivo(''); }}
                      className="hover:text-destructive disabled:opacity-30">
                      <Ban className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
          {/* O rodapé dos cancelados — só exibição, estado local, não persiste. */}
          {cancelados.length > 0 && (
            <div className="col-span-full flex h-5 items-center border-t px-[10px] text-[10px] leading-none text-muted-foreground" data-testid="rodape-cancelados">
              {cancelados.length} {cancelados.length === 1 ? 'documento cancelado' : 'documentos cancelados'}
              {!mostrarCancelados && (cancelados.length === 1 ? ' oculto' : ' ocultos')}
              {' · '}
              <button type="button" className="ml-1 underline hover:text-foreground cursor-pointer"
                onClick={() => setMostrarCancelados(v => !v)}>
                {mostrarCancelados ? 'ocultar' : 'mostrar'}
              </button>
            </div>
          )}
        </div>
      )}

      {formAberto && (
        <FormDocumento api={api} documento={editando} fornecedores={fornecedores} sugestao={sugestao}
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
/**
 * O que o lançamento já diz, para o documento NOVO nascer preenchido — FIN-NFE-PARCELAS-01 PR 2b-fix1.
 * Nº Documento do lançamento -> Número; competência -> Emissão; valor -> Valor; favorecido -> Emitente.
 * Tudo editável; editar aqui NÃO muda o lançamento (são colunas de tabelas diferentes).
 */
export interface SugestaoDocumento {
  numero: string | null;
  dataEmissao: string | null;
  valor: number | null;
  emitenteId: string | null;
  /** A data de PAGAMENTO do lançamento: é a data sugerida quando o documento é um COMPROVANTE (FIN-DOCUMENTO-FORM-01). */
  dataPagamento?: string | null;
}

/**
 * QUAIS CAMPOS CADA TIPO DE DOCUMENTO TEM, E COMO SE CHAMAM — FIN-DOCUMENTO-FORM-01 (Gabriel, 04/10/2026).
 *
 * ⚠ NASCE DE UMA QUEIXA: trocar de Nota fiscal para Boleto, Recibo ou Comprovante mantinha Número, Série, Data de emissão e
 *   Valor do documento "como se fosse tudo nota fiscal". Recibo não tem série, comprovante não tem emitente, e a data de um
 *   comprovante é a do PAGAMENTO.
 * ⚠ UM DONO SÓ: o formulário desenha por esta tabela e o payload zera por ela — nenhum `if (especie === …)` espalhado. O que o
 *   tipo NÃO tem vai NULO no payload (série e chave fora da NF; emitente no Comprovante), inclusive ao editar um documento
 *   existente e mudar o tipo.
 * ⚠ AS COLUNAS SÃO AS DE SEMPRE (numero, serie, chave_acesso, data_emissao, valor_documento, emitente): só o RÓTULO e a
 *   PRESENÇA mudam. Linha digitável, vencimento do boleto, "referente a" do recibo e autenticação como campo próprio pedem
 *   coluna nova — FIN-DOCUMENTO-FORM-02.
 */
/** O fornecedor como o formulário o lê. `ativo` ausente conta como ativo (a regra do `FavorecidoSelect`: `ativo !== false`). */
export interface FornecedorDoDocumento { id: string; nome: string; ativo?: boolean | null }

export const CAMPOS_POR_ESPECIE: Record<EspecieLancDoc, {
  numero: string; data: string; valor: string;
  /** O rótulo do emitente; `null` = o tipo não tem emitente. */
  emitente: string | null;
  serie: boolean; chave: boolean;
  /** Como a data é chamada na faixa "Preenchido com o que o lançamento diz". */
  dataNaSugestao: string;
}> = {
  nf: { numero: 'Número', data: 'Data de emissão', valor: 'Valor da nota', emitente: 'Emitente', serie: true, chave: true, dataNaSugestao: 'emissão' },
  boleto: { numero: 'Nº do documento', data: 'Data do documento', valor: 'Valor do boleto', emitente: 'Beneficiário', serie: false, chave: false, dataNaSugestao: 'data' },
  recibo: { numero: 'Nº do recibo', data: 'Data do recibo', valor: 'Valor recebido', emitente: 'Quem recebeu (emitente)', serie: false, chave: false, dataNaSugestao: 'data' },
  comprovante: { numero: 'Autenticação / ID da transação', data: 'Data do pagamento', valor: 'Valor pago', emitente: null, serie: false, chave: false, dataNaSugestao: 'data do pagamento' },
  outro: { numero: 'Identificação', data: 'Data', valor: 'Valor', emitente: 'Emitente', serie: false, chave: false, dataNaSugestao: 'data' },
};

export function FormDocumento({ api, documento, fornecedores, onFechar, pendente, semBoleto, sugestao }: {
  api: LancamentoDocumentosApi;
  documento: LancDocumento | null;
  fornecedores: FornecedorDoDocumento[];
  onFechar: () => void;
  pendente?: boolean;
  /** Documento da COMPRA no parcelado: o boleto é por parcela, na grade de parcelas (PR 2b). */
  semBoleto?: boolean;
  /** Só no documento NOVO: semeia número, emissão, valor e emitente (PR 2b-fix1). Ignorada na edição. */
  sugestao?: SugestaoDocumento;
}) {
  /* ⚠ SUGESTÃO NÃO ENTRA EM REGISTRO JÁ GRAVADO (RECLASS-PESO-01): com `documento`, vale o que ele tem. */
  const sug = documento ? null : (sugestao ?? null);
  /* ⚠ SÓ FORNECEDOR ATIVO NA LISTA DO EMITENTE (a regra do `FavorecidoSelect`), MAIS o que já está gravado no documento em
     edição, mesmo inativo — senão o valor atual sumiria do campo. Digitar "pant" trazia quatro cadastros do mesmo fornecedor,
     três deles inativos. */
  const fornecedoresDaLista = fornecedores.filter(f => f.ativo !== false || f.id === documento?.emitenteId);
  const emitenteSugerido = sug?.emitenteId && fornecedoresDaLista.some(f => f.id === sug.emitenteId) ? sug.emitenteId : null;
  const [especie, setEspecie] = useState<EspecieLancDoc>(documento?.especie ?? 'nf');
  const [numero, setNumero] = useState(documento?.numero ?? sug?.numero ?? '');
  const [serie, setSerie] = useState(documento?.serie ?? '');
  const [dataEmissao, setDataEmissao] = useState(documento?.dataEmissao ?? sug?.dataEmissao ?? '');
  const [valor, setValor] = useState<number | null>(documento?.valorDocumento ?? sug?.valor ?? null);
  const [emitenteId, setEmitenteId] = useState(documento?.emitenteId ?? emitenteSugerido ?? '');
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
  /* VALOR SUGERIDO É VALOR ACEITO: o que veio do lançamento fica âmbar enquanto ninguém mexer. */
  const campos = CAMPOS_POR_ESPECIE[especie];
  /* A data que o lançamento sugere depende do TIPO: no comprovante é a do PAGAMENTO — e, sem pagamento, NENHUMA (a competência
     não é data de comprovante); nos outros, a de sempre. */
  const dataSugeridaPara = (e: EspecieLancDoc) => (e === 'comprovante' ? (sug?.dataPagamento ?? '') : (sug?.dataEmissao ?? ''));
  const dataSugerida = dataSugeridaPara(especie);
  const sugNumero = !!sug?.numero && numero === sug.numero;
  const sugData = !!dataSugerida && dataEmissao === dataSugerida;
  const sugValor = sug?.valor != null && valor === sug.valor;
  /* a sugestão só vale para campo que o tipo MOSTRA */
  const sugEmitente = !!campos.emitente && !!emitenteSugerido && emitenteId === emitenteSugerido;
  const AMBAR = ' bg-amber-50 border-amber-300';
  /* ⚠ TROCAR O TIPO TROCA OS CAMPOS E PRESERVA O DIGITADO: número, data, valor, observação e emitente ficam no estado (o
     emitente volta a aparecer se o operador voltar a um tipo que o tem). Só a DATA AINDA SUGERIDA acompanha o tipo. */
  const trocarEspecie = (nova: EspecieLancDoc) => {
    if (sug && dataEmissao === dataSugerida) setDataEmissao(dataSugeridaPara(nova));
    setEspecie(nova);
  };

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
    /* ⚠ O QUE O TIPO NÃO TEM VAI NULO (`CAMPOS_POR_ESPECIE`): série e chave só existem em nota fiscal — guardá-las noutro
       tipo seria dado sem dono. No documento da OPERAÇÃO a espécie daqui é só leitura e pode ser tradução do vocabulário da
       OC: o que não aparece é PRESERVADO como está, nunca zerado por uma tela que não o mostra. */
    serie: campos.serie ? (serie.trim() || null) : (especieSoLeitura ? (documento?.serie ?? null) : null),
    chaveAcesso: campos.chave ? (chave.trim() || null) : (especieSoLeitura ? (documento?.chaveAcesso ?? null) : null),
    dataEmissao: dataEmissao || null,
    /* `undefined` não sobe (ver `paraJson`): na OC o valor não é campo, e mandar `null`
       apagaria o que os componentes dizem. */
    valorDocumento: destinoOC ? undefined : valor,
    observacao: observacao.trim() || null,
    ...(campos.emitente ? {
      emitenteId: emitenteEhOutro ? null : (emitenteId || null),
      emitenteNome: emitenteEhOutro ? (emitenteNome.trim() || null)
        : (fornecedores.find(f => f.id === emitenteId)?.nome ?? null),
      emitenteDocumento: emitenteEhOutro ? (emitenteDoc.trim() || null) : null,
    } : especieSoLeitura ? {
      emitenteId: documento?.emitenteId ?? null, emitenteNome: documento?.emitenteNome ?? null,
      emitenteDocumento: documento?.emitenteDocumento ?? null,
    } : { emitenteId: null, emitenteNome: null, emitenteDocumento: null }),
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
          Escolha o tipo e informe os dados do documento deste lançamento.
        </DialogDescription>

        <div className="min-h-0 flex-1 overflow-auto">
        {compartilhada && (
          <p className="mx-4 mt-3 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-900" data-testid="aviso-nota-compartilhada">
            Esta nota está em {documento?.ligadoAQtd} parcelas; a alteração vale para todas.
          </p>
        )}

        {(sugNumero || sugData || sugValor || sugEmitente) && (
          <p className="mx-4 mt-3 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900" data-testid="sugestao-do-lancamento">
            Preenchido com o que o lançamento diz ({[sugNumero && 'número', sugData && campos.dataNaSugestao, sugValor && 'valor', sugEmitente && 'emitente'].filter(Boolean).join(', ')}) — confira. Mudar aqui não muda o lançamento.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          {/* ── O TIPO VEM PRIMEIRO, e é ele que decide os campos abaixo (`CAMPOS_POR_ESPECIE`) ── */}
          <div className="col-span-2">
            <Label className="text-[10px]">Tipo de documento <span className="text-destructive">*</span></Label>
            <Segmentado valor={especie} onEscolher={trocarEspecie} altura={26} className="mt-0.5 flex w-full [&>button]:flex-1"
              opcoes={especiesDoForm.map(e => ({ valor: e.value, rotulo: e.label, desabilitada: especieSoLeitura }))} />
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
          {/* ── linha 1: os dois campos principais — na NF, Número e Série; nos demais, data e valor ── */}
          {campos.serie && (<>
            <div>
              <Label className="text-[10px]">{campos.numero}</Label>
              <Input value={numero} onChange={e => setNumero(e.target.value)} data-testid="doc-numero"
                className={`h-8 text-[12px] mt-0.5${sugNumero ? AMBAR : ''}`} placeholder="Opcional" />
            </div>
            <div>
              <Label className="text-[10px]">Série</Label>
              <Input value={serie} onChange={e => setSerie(e.target.value)} data-testid="doc-serie"
                className="h-8 text-[12px] mt-0.5" placeholder="Opcional" />
            </div>
          </>)}
          <div>
            <Label className="text-[10px]">{campos.data}</Label>
            <DatePicker value={dataEmissao} onChange={setDataEmissao} className={`h-8 text-[12px] mt-0.5${sugData ? AMBAR : ''}`} />
          </div>
          {/* ⚠ NA OC, O VALOR DO DOCUMENTO NÃO É UM CAMPO — DOC-UMA-FONTE-01. Lá ele é a
              soma dos COMPONENTES (acréscimo, desconto comercial, retenção), que mexem na
              liquidação da operação. Um campo aqui aceitaria um número que a RPC descarta,
              e o documento apareceria valendo zero sem ninguém entender por quê. Dizer
              onde ele mora é a resposta honesta; escolher uma natureza de componente por
              conta própria seria decidir dinheiro. */}
          {destinoOC ? (
            <div data-testid="doc-valor-da-oc">
              <Label className="text-[10px] text-muted-foreground">{campos.valor}</Label>
              <p className="mt-0.5 h-8 text-[10px] leading-tight text-muted-foreground">
                Vem dos componentes, na aba Documentos da operação.
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-[10px]">{campos.valor}</Label>
              <CampoMoeda valor={valor} onChange={setValor} className={`h-8 text-[12px] mt-0.5 text-right${sugValor ? AMBAR : ''}`} />
            </div>
          )}
          {/* fora da NF o número não é a identidade do papel: vem depois, em largura inteira */}
          {!campos.serie && (
            <div className="col-span-2">
              <Label className="text-[10px]">{campos.numero}</Label>
              <Input value={numero} onChange={e => setNumero(e.target.value)} data-testid="doc-numero"
                className={`h-8 text-[12px] mt-0.5${sugNumero ? AMBAR : ''}`} placeholder="Opcional" />
            </div>
          )}
          {/* ── EMITENTE COM BUSCA — o `SearchableSelect` da casa (UI-DROPDOWN-PADRAO-01): digita e procura. Era um Select
              com a lista inteira dos fornecedores, sem busca. "Outro" é a ação do rodapé da lista. ── */}
          {campos.emitente && (
            <div className="col-span-2" data-testid="doc-emitente">
              <Label className="text-[10px]">{campos.emitente}</Label>
              <SearchableSelect dense semTodos
                value={emitenteEhOutro ? '' : emitenteId} allValue=""
                allLabel={emitenteEhOutro ? 'Outro (informar nome e CNPJ/CPF)' : 'Selecione'}
                onValueChange={setEmitenteId}
                options={fornecedoresDaLista.map(f => ({ value: f.id, label: f.nome }))}
                placeholder="Digite para buscar…"
                acaoFinal={{ label: 'Outro (informar nome e CNPJ/CPF)', onSelect: () => setEmitenteId(OUTRO) }}
                className={`mt-0.5${sugEmitente ? ' [&>button]:border-amber-300 [&>button]:bg-amber-50' : ''}`} />
            </div>
          )}
          {campos.emitente && emitenteEhOutro && (<>
            <div>
              <Label className="text-[10px]">Nome do emitente</Label>
              <Input value={emitenteNome} onChange={e => setEmitenteNome(e.target.value)} data-testid="doc-emitente-nome"
                className="h-8 text-[12px] mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px]">CNPJ / CPF do emitente</Label>
              <Input value={emitenteDoc} onChange={e => setEmitenteDoc(e.target.value)} data-testid="doc-emitente-documento"
                className="h-8 text-[12px] mt-0.5" />
            </div>
          </>)}
          {campos.chave && (
            <div className="col-span-2">
              <Label className="text-[10px]">Chave de acesso</Label>
              <Input value={chave} onChange={e => setChave(e.target.value)} data-testid="doc-chave"
                className="h-8 text-[12px] mt-0.5 font-mono" placeholder="44 dígitos" />
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-[10px]">Observação</Label>
            <Input value={observacao} onChange={e => setObservacao(e.target.value)}
              className="h-8 text-[12px] mt-0.5" placeholder="Opcional" />
          </div>
          {/* ── ARQUIVO: a área verde, "melhor para identificar" (Gabriel). O `<input type="file">` é o de sempre (mesmos
              `accept` e regras) — só deixou de ser a cara do campo. Soltar um arquivo aqui entra pelo MESMO input. ── */}
          <div className="col-span-2">
            <Label className="text-[10px]">Arquivo</Label>
            {/* UI-ARRASTAR-ARQUIVO-01a — a área é a do sistema (`AreaDeArquivo`): clicar ou arrastar, realce verde, e o tipo
                errado é recusado AO ESCOLHER, na própria área (a conferência ao gravar continua, pelo mesmo dono). Altura fixa
                de 40px: o nome longo corta com o inteiro no `title`. */}
            <AreaDeArquivo regra={REGRA_ARQUIVO_DO_DOCUMENTO} testId="area-arquivo" inputTestId="doc-arquivo" className="mt-0.5 h-10"
              onArquivos={([f]) => setArquivo(f ?? null)}
              conteudo={arquivo
                ? <span data-testid="arquivo-escolhido">{arquivo.name}</span>
                : documento?.url ? <>arquivo anexado · <span className="underline underline-offset-2">substituir</span></> : undefined}
              tituloDoConteudo={arquivo ? arquivo.name : documento?.url ? 'arquivo anexado · clique ou arraste outro para substituir' : undefined}
              onRemover={arquivo ? () => setArquivo(null) : undefined} />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {ajudaDaRegra(REGRA_ARQUIVO_DO_DOCUMENTO)}. Pode ficar para depois — o documento aparece na lista dizendo “sem arquivo”.
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
