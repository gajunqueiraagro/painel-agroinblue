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
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { useFornecedoresDoCliente } from '@/hooks/useFornecedoresDoCliente';
import type { FornecedorLido } from '@/lib/fornecedores/leitorDeFornecedores';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { DatePicker } from '@/components/ui/date-picker';
import { BlocoFormulario, CORPO_FORMULARIO } from '@/components/ui/bloco-formulario';
import { Paperclip, Pencil, Ban, Plus, X } from 'lucide-react';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { ajudaDaRegra } from '@/lib/arquivo/aceitarArquivo';
import { formatMoeda } from '@/lib/calculos/formatters';
import { faixaDoConfronto } from '@/lib/financeiro/faixaDoConfronto';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import { QUADRO_REGUA, SECUNDARIA_REGUA, TD_REGUA, TD_REGUA_NUM, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { linhasDosDocumentos, oQueAbrir, type LinhaDeDocumento } from '@/lib/financeiro/notaDosDocumentos';
import { ItensDaNotaDialog } from './ItensDaNotaDialog';
import { lerNota } from '@/lib/financeiro/nfe/lerNota';
import { resolverEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { gravarItensSemTravar } from '@/lib/financeiro/itensDaNotaBanco';
import { completarComANota, desfazerCompletar, fornecedorPeloDocumento } from '@/lib/financeiro/nfeConsultas';
import { camposDaNota, divergenciasDaNota, ehArquivoDeNota, FRASE_NOTA_NAO_LIDA, type CamposDaNota, type CampoDivergente } from '@/lib/financeiro/nfe/documentoDaNota';
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
 * A TABELA DA LISTA — FIN-DOCUMENTOS-LAYOUT-01 (mock do Gabriel, 04/10/2026): Documento · Emitente · Emissão · Valor · Situação · ações;
 * DOC-NOTA-XML-PDF-01 (22/10/2026): na RÉGUA DA CASA (`regua-tabela`, tabela fixa, colgroup em px, linha de 19px, data a 9,5px).
 * ⚠ UMA LINHA POR REGISTRO, SEMPRE (UI-LINHA-UNICA-01): a coluna Documento tem a largura do maior documento da lista (identidade e
 *   selos sempre inteiros); Emitente (e o "motivo: …" do cancelado) fica com o resto e CORTA com "…", com o texto inteiro no `title`.
 */
/** A largura da coluna Documento: o maior "identidade + selos" da lista (10px semibold ≈ 6,2px por caractere; selos medidos). */
function larguraDaColunaDocumento(ls: readonly LinhaDeDocumento[]): number {
  const uma = (l: LinhaDeDocumento) => {
    const d = l.principal;
    const selos = (l.pdf ? 28 : 0) + (l.xml ? 30 : 0) + ((d.ligadoAQtd ?? 1) > 1 ? 66 : 0) + (d.origem === 'operacao' ? 70 : 0);
    return Math.ceil(identidade(d).length * 6.2) + selos + 18;
  };
  return Math.max(96, ...ls.map(uma));
}

/** P164 — o que a nota que CONFERE deixou no lançamento (o modal aberto passa a mostrar isso; senão o Salvar seguinte gravaria por cima) */
export interface FicaNoLancamento { numeroDocumento: string | null; tipoDocumento: string | null; dataCompetencia: string | null; safraId: string | null }
/** P164 — o lançamento SALVO que a nota que confere completa (nº, tipo, competência) e quem fica sabendo do que o banco deixou */
export interface CompletarPelaNota { lancamentoId: string; onCompletado: (fica: FicaNoLancamento) => void }

export function AbaDocumentosLancamento({ api, somenteLeitura, clienteId, onAnexarBoletosDasParcelas, sugestao, semBoleto, onVerOQueANotaMuda, completarPelaNota }: {
  api: LancamentoDocumentosApi;
  completarPelaNota?: CompletarPelaNota;
  /** P127 + P128c — a nota lida no "Novo documento" abre a MESMA prévia do "+ Da nota" partindo deste lançamento (o caminho do "Ler a NF"
   *  do P128a). Devolve a frase pronta do que impediu, ou `null` (a prévia abriu). Ausente = sem o gesto. */
  onVerOQueANotaMuda?: (arquivo: File) => Promise<string | null>;
  /** Sem o tipo Boleto no formulário — PARC-LIVRES-01 passo 6: no CONTRATO esta lista é a dos documentos da COMPRA (valem para
   *  todas as parcelas); o boleto é de UMA parcela e entra pela grade das parcelas, logo abaixo. */
  semBoleto?: boolean;
  somenteLeitura?: boolean;
  /** FORN-SELETOR-PADRAO-01 fatia 2a — o cliente de quem o emitente se escolhe (a lista é a do leitor único, não a do hospedeiro). */
  clienteId: string | null;
  /** O que o lançamento SALVO já diz, para o documento NOVO nascer preenchido — FIN-DOCUMENTO-FORM-01. É a MESMA sugestão do
   *  lançamento novo, montada no mesmo ponto do `LancamentoV2Dialog`. Editar um documento existente nunca a recebe. */
  sugestao?: SugestaoDocumento;
  /** Presente só quando o lançamento é parcela de um parcelamento — abre "Anexar vários boletos" (PR 2b). */
  onAnexarBoletosDasParcelas?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<LancDocumento | null>(null);
  /* DOC-NOTA-XML-PDF-01 — cancelar a LINHA da nota cancela os arquivos dela (o PDF e o XML), com o mesmo motivo */
  const [cancelando, setCancelando] = useState<LinhaDeDocumento | null>(null);
  /* a nota sem PDF abre os itens (a leitura do XML), nunca o XML cru */
  const [itensDe, setItensDe] = useState<LancDocumento | null>(null);
  const [motivo, setMotivo] = useState('');

  const faixa = faixaDoConfronto(api.confronto);
  const ativos = api.documentos.filter(d => !d.cancelado);
  /* ⚠ CANCELADO NÃO FICA NA LISTA — FIN-DOCUMENTOS-LAYOUT-01 (pedido do Gabriel, 29/09 e 04/10: "quando eu cancelo um, ele não
     some, fica poluindo a tela"). Ele é história: sai da vista e fica atrás do "mostrar" do rodapé, o mesmo padrão das contas
     ocultas de "Saldos por conta". Estado local: não persiste e volta a ocultar quando o modal fecha. */
  const cancelados = api.documentos.filter(d => d.cancelado);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  /* DOC-NOTA-XML-PDF-01 — UMA NOTA = UMA LINHA: o PDF e o XML da mesma nota (a regra do banco, `linhasDosDocumentos`) numa linha so',
     com os selos dos arquivos que ela tem. O cancelado nunca se junta. */
  const linhasAtivas = linhasDosDocumentos(ativos);
  const linhas = mostrarCancelados ? [...linhasAtivas, ...linhasDosDocumentos(cancelados)] : linhasAtivas;

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
  /** O PDF; sem PDF, os itens da nota (lidos do XML) — o XML e' dado de importacao, nunca aberto cru. */
  const abrirLinha = (l: LinhaDeDocumento) => {
    const o = oQueAbrir(l);
    if (!o) return;
    if (o.tipo === 'itens') setItensDe(o.doc);
    else void abrirArquivo(o.doc);
  };
  const bytesDoXml = async (d: LancDocumento): Promise<ArrayBuffer | null> => {
    if (!d.url) return null;
    const url = await api.urlAssinada(d.url, d.origem);
    if (!url) return null;
    const r = await fetch(url);
    return r.ok ? r.arrayBuffer() : null;
  };

  const confirmarCancelamento = async () => {
    if (!cancelando) return;
    /* ⚠ MOTIVO OBRIGATÓRIO: cancelar um documento é o que a auditoria vai mostrar daqui a
       um ano, e "cancelado sem motivo" é um registro que não explica nada. */
    if (!motivo.trim()) { toast.error('Informe o motivo do cancelamento.'); return; }
    try {
      for (const m of cancelando.membros) await api.cancelar(m.id, motivo.trim());
      toast.success(cancelando.membros.length > 1 ? 'Nota cancelada (PDF e XML).' : 'Documento cancelado.');
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
        {/* ⚠ O BANCO É O DONO — FIN-DOC-SOMA-01 (Gabriel 19/10/2026). A nota (o que soma) contra a base que o banco escolheu (o
            lançamento, as parcelas do contrato ou as parcelas ligadas), cada boleto/comprovante à parte (não soma) e a nota
            repetida. A frase sai de `faixaDoConfronto`; nenhuma conta aqui. */}
        {faixa === null && (
          <span className="inline-flex items-baseline gap-[5px] whitespace-nowrap">
            <span className="text-[10px] text-muted-foreground">Documentado</span>
            <span className="text-[12px] font-semibold tabular-nums" data-testid="topo-documentado">—</span>
          </span>
        )}
        {faixa !== null && faixa.length === 0 && (
          <span className="text-[10px] text-muted-foreground" data-testid="topo-sem-valor">Nenhum documento com valor a conferir</span>
        )}
        {faixa?.map((p) => (
          <span key={p.chave} className="inline-flex items-baseline gap-[5px] whitespace-nowrap" data-testid={`faixa-${p.chave}`}>
            <span className="text-[11px] font-medium tabular-nums">{p.texto}</span>
            <span className={`text-[11px] font-medium ${p.tom === 'ok' ? 'text-emerald-600' : p.tom === 'info' ? 'text-muted-foreground' : 'text-amber-700'}`}>{p.veredito}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {linhasAtivas.length === 0 ? 'Nenhum documento anexado'
            : `${linhasAtivas.length} ${linhasAtivas.length === 1 ? 'documento' : 'documentos'}`}
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
          cada informação tem a sua coluna e a linha tem altura fixa (o emitente corta, não quebra). Desde DOC-NOTA-XML-PDF-01, a
          régua da casa (19px). */}
      {api.documentos.length > 0 && (
        <div className={cn(QUADRO_REGUA, 'h-auto')} data-testid="tabela-documentos">
          {/* DOC-NOTA-XML-PDF-01 — a RÉGUA DA CASA (`regua-tabela`): tabela fixa, colgroup em px; a coluna Documento tem a largura do
              maior documento da lista (identidade + selos) e nunca corta; o emitente corta com "…" e o texto inteiro no `title` */}
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: larguraDaColunaDocumento(linhas) }} /><col />
              <col style={{ width: 66 }} /><col style={{ width: 88 }} /><col style={{ width: 62 }} /><col style={{ width: 66 }} />
            </colgroup>
            <thead className="bg-primary">
              <tr data-testid="cabecalho-documentos">
                <th className={cn(TH_REGUA, 'pl-[10px] text-left')}>Documento</th>
                <th className={cn(TH_REGUA, 'text-left')}>Emitente</th>
                <th className={cn(TH_REGUA, 'text-left')}>Emissão</th>
                <th className={cn(TH_REGUA, 'text-right')}>Valor</th>
                <th className={cn(TH_REGUA, 'text-center')}>Situação</th>
                <th className={TH_REGUA} />
              </tr>
            </thead>
            <tbody>
          {linhas.map(l => {
            const d = l.principal;
            const nome = identidade(d);
            /* Na linha cancelada a coluna Emitente diz POR QUE saiu (o motivo); sem motivo, o emitente. */
            const emitente = d.cancelado && d.canceladoMotivo ? `motivo: ${d.canceladoMotivo}` : (d.emitenteNome || '');
            const semArquivo = !l.membros.some((m) => m.url) && !d.cancelado;
            const abrir = oQueAbrir(l);
            return (
            <tr key={d.id} data-testid="linha-documento" data-cancelado={d.cancelado ? 'sim' : undefined}
              className={`h-[19px] border-t text-[10px] leading-none ${d.cancelado ? 'bg-muted/40 text-muted-foreground/70' : ''}`}>
              <td className={cn(TD_REGUA, 'pl-[10px]')}>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={d.cancelado ? 'line-through' : 'font-semibold text-foreground'} data-testid="doc-nome">{nome}</span>
                {/* DOC-NOTA-XML-PDF-01 — os arquivos que a nota tem */}
                {l.pdf && <span className="shrink-0 rounded bg-rose-50 px-1 text-[9.5px] font-medium leading-[13px] text-rose-700" data-testid="selo-pdf" title="A nota tem o PDF">PDF</span>}
                {l.xml && <span className="shrink-0 rounded bg-amber-50 px-1 text-[9.5px] font-medium leading-[13px] text-amber-800" data-testid="selo-xml" title="A nota tem o XML (dado de importação: abre como os itens da nota)">XML</span>}
                {/* ⚠ A PÍLULA DIZ DE QUEM É O PAPEL, e o clique leva até ele. Sem ela, a
                    NF da operação pareceria um documento do lançamento — e o operador
                    anexaria a segunda cópia da mesma nota, que é justamente o que esta
                    frente existe para impedir. */}
                {/* PR 2b — a NF da compra, ligada às parcelas: o selo diz a quantas. Irmão do "da operação". */}
                {(d.ligadoAQtd ?? 1) > 1 && (
                  <span className="shrink-0 rounded-full bg-sky-100 px-1.5 text-[9.5px] leading-[13px] text-sky-800" data-testid="selo-parcelas"
                    title="Esta nota está em várias parcelas da mesma compra">
                    {d.ligadoAQtd} parcelas
                  </span>
                )}
                {d.origem === 'operacao' && (
                  <button type="button"
                    title="Este documento é da operação comercial — abrir a OC na aba Documentos"
                    onClick={() => abrirOperacao(d)}
                    className="shrink-0 rounded-full bg-blue-100 px-1.5 text-[9.5px] leading-[13px] text-blue-700 underline-offset-2 hover:underline dark:bg-blue-900/40 dark:text-blue-300">
                    da operação
                  </button>
                )}
              </div>
              </td>
              <td className={TD_REGUA}>
              <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground" data-testid="cel-emitente">
                {/* ⚠ SEM ARQUIVO É AVISO, NÃO ERRO: registrar primeiro e anexar depois é
                    um caminho legítimo, e a linha diz o que falta em vez de esconder.
                    Fica ANTES do emitente e não encolhe; quem corta é o emitente. */}
                {semArquivo && <span className="shrink-0 whitespace-nowrap text-amber-700">sem arquivo</span>}
                <span className={`min-w-0 truncate ${d.cancelado ? 'text-muted-foreground/70' : ''}`} title={emitente || undefined} data-testid="doc-emitente-texto">{emitente || (semArquivo ? '' : '—')}</span>
              </div>
              </td>
              <td className={cn(TD_REGUA, SECUNDARIA_REGUA, 'whitespace-nowrap tabular-nums', d.cancelado ? '' : 'text-muted-foreground')} data-testid="doc-emissao">{dataBr(d.dataEmissao) ?? '—'}</td>
              <td className={TD_REGUA_NUM} data-testid="doc-valor">
                {d.valorDocumento == null ? '—' : formatMoeda(d.valorDocumento)}
              </td>
              <td className={cn(TD_REGUA, 'text-center')}>
                {d.cancelado ? (
                  <span className="rounded-full bg-muted px-1.5 text-[9.5px] leading-[13px] text-muted-foreground"
                    title={d.canceladoMotivo ?? undefined}>Cancelado</span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-1.5 text-[9.5px] leading-[13px] text-emerald-700">Ativo</span>
                )}
              </td>
              {/* Documento cancelado não tem ações: é história, não trabalho pendente. */}
              <td className={cn(TD_REGUA, 'pr-[10px]')}>
              {d.cancelado ? null : (
                <div className="flex items-center justify-end gap-2 text-muted-foreground">
                  <button type="button" title={!abrir ? 'Sem arquivo anexado' : abrir.tipo === 'itens' ? 'Ver os itens da nota (lidos do XML)' : 'Abrir arquivo'}
                    aria-label="Abrir arquivo" disabled={!abrir} data-testid="doc-abrir"
                    onClick={() => abrirLinha(l)}
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
                  {l.membros.every((m) => (m.ligadoAQtd ?? 1) <= 1) && (
                    <button type="button" title="Cancelar documento" aria-label="Cancelar documento"
                      disabled={somenteLeitura} onClick={() => { setCancelando(l); setMotivo(''); }}
                      className="hover:text-destructive disabled:opacity-30">
                      <Ban className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              </td>
            </tr>
            );
          })}
            </tbody>
          </table>
          {/* O rodapé dos cancelados — só exibição, estado local, não persiste. */}
          {cancelados.length > 0 && (
            <div className="flex h-5 items-center border-t px-[10px] text-[10px] leading-none text-muted-foreground" data-testid="rodape-cancelados">
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

      {itensDe && (
        <ItensDaNotaDialog clienteId={clienteId ?? ''} chave={(itensDe.chaveAcesso ?? '').replace(/\D/g, '')} onClose={() => setItensDe(null)}
          lerArquivo={() => bytesDoXml(itensDe)} />
      )}

      {formAberto && (
        <FormDocumento api={api} documento={editando} clienteId={clienteId} sugestao={sugestao} semBoleto={semBoleto}
          onVerOQueANotaMuda={onVerOQueANotaMuda} completarPelaNota={completarPelaNota}
          onFechar={() => { setFormAberto(false); setEditando(null); }} />
      )}

      {cancelando && (
        <Dialog open onOpenChange={(o) => { if (!o) { setCancelando(null); setMotivo(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogTitle className="text-[14px]">Cancelar documento</DialogTitle>
            <DialogDescription className="text-[11px]">
              {identidade(cancelando.principal)}{cancelando.membros.length > 1 ? ' (o PDF e o XML)' : ''} — o documento sai do confronto e fica registrado como cancelado.
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
  /** De onde a sugestão veio, na frase da faixa âmbar ("o lançamento" por padrão; no contrato de parcelamento, "o contrato" — 2a-fix1). */
  origem?: string;
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
/* FORN-SELETOR-PADRAO-01 fatia 2a — a linha fixa do documento sob o campo do emitente (D8). Medida no navegador: ver o CLAUDE.md. */
const LINHA_DO_DOCUMENTO_DO_EMITENTE = true;

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

export function FormDocumento({ api, documento, clienteId, onFechar, pendente, semBoleto, sugestao, onVerOQueANotaMuda, completarPelaNota }: {
  api: LancamentoDocumentosApi;
  /** P164 — o lançamento salvo que a nota que confere completa (ausente = o documento só se registra, como sempre) */
  completarPelaNota?: CompletarPelaNota;
  /** P127 + P128c — "Ver o que a nota muda": a nota lida com itens ou duplicatas abre a prévia do "+ Da nota" partindo do lançamento. */
  onVerOQueANotaMuda?: (arquivo: File) => Promise<string | null>;
  documento: LancDocumento | null;
  /** O cliente de quem o emitente se escolhe — a lista é a do LEITOR ÚNICO (só ativos, com documento). */
  clienteId: string | null;
  onFechar: () => void;
  pendente?: boolean;
  /** Documento da COMPRA no parcelado: o boleto é por parcela, na grade de parcelas (PR 2b). */
  semBoleto?: boolean;
  /** Só no documento NOVO: semeia número, emissão, valor e emitente (PR 2b-fix1). Ignorada na edição. */
  sugestao?: SugestaoDocumento;
}) {
  /* ⚠ SUGESTÃO NÃO ENTRA EM REGISTRO JÁ GRAVADO (RECLASS-PESO-01): com `documento`, vale o que ele tem. */
  const sug = documento ? null : (sugestao ?? null);
  /* ⚠ O EMITENTE É O DONO DO SELETOR DE FORNECEDOR (FORN-SELETOR-PADRAO-01 fatia 2a): só ATIVOS na lista, e o que já está
     gravado no documento em edição, mesmo inativo, continua no campo com a marca "inativo" — não entra mais na lista.
     A sugestão do lançamento é o emitente que ele já tem; o seletor a mostra como qualquer valor gravado. */
  const emitenteSugerido = sug?.emitenteId || null;
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
  /* P127 + P128c — A NOTA LIDA do arquivo (o MESMO leitor do "+ Da nota"): os campos dela, os bytes (os itens se gravam pela chave) e o
     que o formulário tinha ANTES (o que o lançamento diz), para mostrar lado a lado onde divergem. `avisoDaNota`: a nota que não se leu. */
  const [lida, setLida] = useState<{ campos: CamposDaNota; bytes: ArrayBuffer; emitenteId: string | null;
    antes: { numero: string; dataEmissao: string; valor: number | null; emitenteId: string; emitenteNome: string | null } } | null>(null);
  const [avisoDaNota, setAvisoDaNota] = useState<string | null>(null);
  const [lendoANota, setLendoANota] = useState(false);
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
  /* o NOME do emitente escolhido sai do leitor único (o mesmo cache do seletor): entre os ativos, ou o gravado inativo */
  const [buscaEmitente, setBuscaEmitente] = useState('');
  const doLeitor = useFornecedoresDoCliente(clienteId, emitenteEhOutro ? null : (emitenteId || null));
  const nomeDoEmitente = emitenteEhOutro || !emitenteId ? null
    : (doLeitor.fornecedores.find(f => f.id === emitenteId)?.nome ?? (doLeitor.gravado?.id === emitenteId ? doLeitor.gravado.nome : null));
  /* O documento que está sendo criado/editado pertence à OC? Documento novo segue o
     lançamento (`api.operacaoId`); documento existente segue a própria origem. */
  const destinoOC = documento ? documento.origem === 'operacao' : !!api.operacaoId;
  /* ⚠ DOCUMENTO DA OC: ESPECIE SO' LEITURA AQUI — OC-DOC-ESPECIE-01. O vocabulario da OC distingue NF
     principal de complementar, e o daqui nao; mandar a traducao por cima rebaixaria a complementar.
     Quem troca a especie de documento da OC e' a aba da OC. Sem `especie` no payload, o banco preserva. */
  const especieSoLeitura = documento?.origem === 'operacao';

  /* P127 + P128c — o arquivo XML/PDF LÊ A NOTA (`lerNota`, o leitor do "+ Da nota"): os campos passam a ser os da NOTA; o que o formulário
     tinha antes (o lançamento) fica guardado para o "lado a lado". Na OC não (o documento da OC é da aba da OC). A nota que não se lê
     (PDF escaneado) DIZ que não leu — nunca em silêncio (P146) — e o formulário fica para digitar. */
  const lerArquivoDaNota = async (f: File) => {
    /* o "antes" é sempre o que o LANÇAMENTO dizia: uma segunda leitura (outro arquivo, ou o mesmo de novo) não o troca pelos valores que
       já eram da nota — senão o lado a lado sumiria */
    const antesDaNota = lida?.antes ?? null;
    setLida(null); setAvisoDaNota(null);
    if (destinoOC || especieSoLeitura || !ehArquivoDeNota(f.name)) return;
    setLendoANota(true);
    try {
      const bytes = await f.arrayBuffer();
      const r = await lerNota(bytes);
      if (r.ok === false) { setAvisoDaNota(FRASE_NOTA_NAO_LIDA); return; }
      const c = camposDaNota(r.nota);
      const res = resolverEmitente({ documento: c.emitenteDocumento, nome: c.emitenteNome, fantasia: r.nota.emitente.fantasia }, doLeitor.fornecedores, null);
      /* P164 — o EMITENTE SAI DO CNPJ LIDO: a lista do leitor (só ativos, ainda carregando) não o achou → o cadastro pelo CNPJ no banco, antes
         de cair em "Outro" (o documento registrado sem `emitente_id` deixava a linha com "—") */
      let propostoId = res.propostoId;
      if (!propostoId && clienteId && c.emitenteDocumento) {
        const ja = await fornecedorPeloDocumento(clienteId, c.emitenteDocumento);
        if (ja.ok && ja.valor) propostoId = ja.valor.id;
      }
      setLida({ campos: c, bytes, emitenteId: propostoId,
        antes: antesDaNota ?? { numero, dataEmissao, valor, emitenteId: emitenteEhOutro ? '' : emitenteId, emitenteNome: nomeDoEmitente } });
      setEspecie('nf'); setNumero(c.numero); setSerie(c.serie); setDataEmissao(c.emissao); setValor(c.valor); setChave(c.chave);
      if (propostoId) setEmitenteId(propostoId);
      else { setEmitenteId(OUTRO); setEmitenteNome(c.emitenteNome); setEmitenteDoc(c.emitenteDocumento); }
    } catch (e) {
      console.error('ler a nota do documento', e);
      setAvisoDaNota(FRASE_NOTA_NAO_LIDA);
    } finally { setLendoANota(false); }
  };
  /* onde a nota e o lançamento divergem: os dois lado a lado; "usar o do lançamento" troca SÓ aquele campo (e volta) */
  const divergencias = lida ? divergenciasDaNota(lida.campos, {
    numero: lida.antes.numero || null, dataEmissao: lida.antes.dataEmissao || null, valor: lida.antes.valor,
    emitenteId: lida.antes.emitenteId || null, emitenteNome: lida.antes.emitenteNome,
  }, lida.emitenteId) : [];
  const usaANota = (c: CampoDivergente): boolean => {
    if (!lida) return false;
    if (c === 'numero') return numero === lida.campos.numero;
    if (c === 'emissao') return dataEmissao === lida.campos.emissao;
    if (c === 'valor') return valor === lida.campos.valor;
    return lida.emitenteId ? emitenteId === lida.emitenteId : emitenteEhOutro;
  };
  const trocarCampo = (c: CampoDivergente) => {
    if (!lida) return;
    const daNota = !usaANota(c);
    if (c === 'numero') setNumero(daNota ? lida.campos.numero : lida.antes.numero);
    else if (c === 'emissao') setDataEmissao(daNota ? lida.campos.emissao : lida.antes.dataEmissao);
    else if (c === 'valor') setValor(daNota ? lida.campos.valor : lida.antes.valor);
    else if (daNota) {
      if (lida.emitenteId) setEmitenteId(lida.emitenteId);
      else { setEmitenteId(OUTRO); setEmitenteNome(lida.campos.emitenteNome); setEmitenteDoc(lida.campos.emitenteDocumento); }
    } else setEmitenteId(lida.antes.emitenteId);
  };
  /* o campo que mostra o que a NOTA diz: em destaque (o lido é o que vale; o âmbar é o do lançamento) */
  const DA_NOTA = ' bg-sky-50 border-sky-300';
  const daNota = { numero: !!lida && numero === lida.campos.numero, data: !!lida && dataEmissao === lida.campos.emissao,
    valor: !!lida && valor === lida.campos.valor, chave: !!lida && chave === lida.campos.chave, serie: !!lida && serie === lida.campos.serie };
  /* P164 — A NOTA QUE CONFERE (lida com a chave; valor e emitente iguais aos do lançamento) leva ao lançamento o nº "000.000.000", o tipo
     Nota Fiscal e a competência = emissão, pela MESMA gravação do P128b (`fn_nota_completar`; conta, valor, vencimento e status trancados no
     pago). A prévia é a do banco (`simular`) e aparece na faixa da nota; o Registrar grava ANTES do documento (recusou = nada gravado; o
     documento que falhar depois DESFAZ a operação — nada pela metade) */
  const confere = !!lida && !documento && !pendente && !!completarPelaNota && !!clienteId
    && !divergencias.some((d) => d.campo === 'valor' || d.campo === 'emitente');
  const pedidoDaNota = confere && lida && completarPelaNota ? [{ id: completarPelaNota.lancamentoId, numero_documento: formatNFNumber(lida.campos.numero),
    tipo_documento: 'Nota Fiscal', ...(lida.campos.emissao ? { data_competencia: lida.campos.emissao } : {}) }] : null;
  const chaveDoPedido = pedidoDaNota ? JSON.stringify(pedidoDaNota) : '';
  const [previaDaNota, setPreviaDaNota] = useState<{ chave: string; muda: string[]; recusa: string | null } | null>(null);
  useEffect(() => {
    if (!chaveDoPedido || !clienteId || !lida) return;
    let vivo = true;
    void completarComANota(clienteId, JSON.parse(chaveDoPedido), { juntar: false, chave: lida.campos.chave || null, simular: true }).then((r) => {
      if (!vivo) return;
      if (r.ok === false) { setPreviaDaNota({ chave: chaveDoPedido, muda: [], recusa: r.motivo }); return; }
      if (!r.valor.ok) { setPreviaDaNota({ chave: chaveDoPedido, muda: [], recusa: r.valor.recusas[0] ?? 'O banco recusou.' }); return; }
      const c = r.valor.linhas[0]?.campos ?? {};
      const data = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : '—');
      const muda = [c.numero_documento?.muda ? `nº ${String(c.numero_documento.fica ?? '—')}` : null, c.tipo_documento?.muda ? `tipo ${String(c.tipo_documento.fica ?? '—')}` : null,
        c.data_competencia?.muda ? `competência ${data(c.data_competencia.fica)}` : null].filter((x): x is string => !!x);
      setPreviaDaNota({ chave: chaveDoPedido, muda, recusa: null });
    });
    return () => { vivo = false; };
  }, [chaveDoPedido, clienteId, lida]);
  const previaAtual = previaDaNota && previaDaNota.chave === chaveDoPedido ? previaDaNota : null;
  /** grava no lançamento pela função; devolve a operação (para desfazer se o documento falhar) e o que ficou, ou a frase da recusa */
  const completarOLancamento = async (): Promise<{ ok: true; operacao: string | null; fica: FicaNoLancamento | null } | { ok: false; frase: string }> => {
    if (!pedidoDaNota || !clienteId || !lida || (previaAtual && previaAtual.muda.length === 0 && !previaAtual.recusa)) return { ok: true, operacao: null, fica: null };
    const r = await completarComANota(clienteId, pedidoDaNota, { juntar: false, chave: lida.campos.chave || null, simular: false });
    if (r.ok === false) return { ok: false, frase: r.motivo };
    if (!r.valor.ok) return { ok: false, frase: r.valor.recusas[0] ?? 'O banco recusou. Nada foi gravado.' };
    const c = r.valor.linhas[0]?.campos ?? {};
    const t = (x: unknown) => (typeof x === 'string' ? x : null);
    return { ok: true, operacao: r.valor.operacao, fica: { numeroDocumento: t(c.numero_documento?.fica), tipoDocumento: t(c.tipo_documento?.fica),
      dataCompetencia: t(c.data_competencia?.fica), safraId: t(c.safra_id?.fica) } };
  };

  /* "Ver o que a nota muda": a nota lida com itens ou duplicatas, num lançamento que existe (não no pendente) */
  const podeVerOQueMuda = !!lida?.campos.muda && !!onVerOQueANotaMuda && !documento && !pendente && !!arquivo;
  const verOQueMuda = async () => {
    if (!arquivo || !onVerOQueANotaMuda) return;
    setEnviando(true); setErroForm(null);
    try { const frase = await onVerOQueANotaMuda(arquivo); if (frase) setErroForm(frase); } finally { setEnviando(false); }
  };

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
        : nomeDoEmitente,
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
        /* P164 — a nota que confere completa o lançamento ANTES; o documento que não nascer desfaz a operação */
        const lanc = await completarOLancamento();
        if (lanc.ok === false) { setErroForm(lanc.frase); return; }
        const desfazer = async (motivo: string) => {
          if (!lanc.operacao) return motivo;
          const e = await desfazerCompletar(lanc.operacao);
          return e ? `${motivo} E o lançamento NÃO voltou (${e}): confira o nº, o tipo e a competência dele.` : `${motivo} O lançamento voltou ao que era.`;
        };
        let criado: Awaited<ReturnType<typeof api.registrar>> = null;
        try { criado = await api.registrar(payload()); } catch (e) {
          console.error('registrar documento', e);
          setErroForm(await desfazer(e instanceof Error ? e.message : 'Não foi possível registrar o documento.'));
          return;
        }
        if (!criado) { setErroForm(await desfazer('Não foi possível registrar o documento.')); return; }
        if (lanc.fica && completarPelaNota) completarPelaNota.onCompletado(lanc.fica);
        id = criado.id;
        destino = { origem: criado.origem, operacaoId: criado.operacaoId };
        versao = 1;
      }
      if (arquivo && id && destino) await api.anexar(id, versao, arquivo, destino);
      if (!pendente) toast.success(documento ? 'Documento atualizado.' : 'Documento registrado.');
      /* P127 — a nota LIDA guarda os itens pela chave (ITENS-NOTA-01: a mesma função do "Criar"); a falha não trava, mas diz */
      if (lida && !pendente && clienteId && chave === lida.campos.chave) {
        const erroItens = await gravarItensSemTravar(clienteId, lida.bytes);
        if (erroItens) toast.error(`Os itens da nota não foram guardados: ${erroItens}`);
      }
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
      {/* FIN-DOC-MODAL-01 (Gabriel 19/10/2026) — SEM ROLAGEM: a régua de 4 colunas (Número | Série | Data | Valor · Emitente | Chave ·
          Observação | Arquivo) no lugar da coluna única que pedia rolagem para chegar ao Arquivo. Largura da família dos modais do
          lançamento; ALTURA FIXA de 492px (o pior caso medido: NF + aviso da sugestão + emitente "Outro" = 485), a mesma em todo tipo —
          trocar o tipo não muda o tamanho do modal. Teto na janela: só abaixo de ~524px de altura o corpo rola por dentro. */}
      <DialogContent className="max-w-none w-[min(860px,calc(100vw-32px))] p-0 gap-0 overflow-hidden flex h-[min(492px,calc(100dvh-32px))] flex-col">
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

        {/* UI-MODAL-BLOCOS-01 — corpo cinza; os campos num bloco "Documento" com o título na borda; régua 28px/11px. */}
        <div className={`min-h-0 flex-1 overflow-auto ${CORPO_FORMULARIO}`} data-testid="corpo-do-documento">
        {compartilhada && (
          <p className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-900" data-testid="aviso-nota-compartilhada">
            Esta nota está em {documento?.ligadoAQtd} parcelas; a alteração vale para todas.
          </p>
        )}

        {/* P127 + P128c — a NOTA lida (ou a que não se leu) no lugar da faixa do lançamento: o que a nota diz × o que o lançamento diz */}
        {lendoANota ? (
          <p className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] leading-[14px] text-sky-900" data-testid="nota-lendo">Lendo a nota…</p>
        ) : avisoDaNota ? (
          <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] leading-[14px] text-destructive" role="alert" data-testid="nota-nao-lida">
            {avisoDaNota}</p>
        ) : lida ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] leading-[14px] text-sky-900"
            data-testid="nota-lida">
            <span className="font-medium">Lido da nota {lida.campos.numero} (chave conferida){divergencias.length ? ` · difere ${sug ? `do que ${sug.origem ?? 'o lançamento'} diz` : 'do documento'}:` : ` · confere com ${sug?.origem ?? 'o lançamento'}`}</span>
            {previaAtual && (previaAtual.recusa
              ? <span className="text-destructive" data-testid="nota-lancamento-recusa">· o lançamento não muda: {previaAtual.recusa}</span>
              : previaAtual.muda.length > 0 && <span data-testid="nota-lancamento-fica">· ao registrar, o lançamento fica com {previaAtual.muda.join(', ')}</span>)}
            {divergencias.map((d) => (
              <span key={d.campo} className="inline-flex items-center gap-1 whitespace-nowrap" data-testid="nota-divergencia" data-campo={d.campo}>
                {d.rotulo}: <b className={usaANota(d.campo) ? 'text-sky-900' : 'font-normal text-muted-foreground line-through'}>nota {d.nota}</b>
                <span className={usaANota(d.campo) ? 'text-muted-foreground line-through' : 'font-semibold text-foreground'}>· {sug?.origem ?? 'lanç.'} {d.lancamento}</span>
                <button type="button" className="underline underline-offset-2" onClick={() => trocarCampo(d.campo)} data-testid="nota-divergencia-trocar"
                  data-trocar={d.campo}>
                  {usaANota(d.campo) ? `usar o ${sug ? 'do lançamento' : 'do documento'}` : 'usar o da nota'}</button>
              </span>
            ))}
          </div>
        ) : (sugNumero || sugData || sugValor || sugEmitente) && (
          <p className="truncate rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] leading-[14px] text-amber-900" data-testid="sugestao-do-lancamento"
            title={`Preenchido com o que ${sug?.origem ?? 'o lançamento'} diz — confira. Mudar aqui não muda ${sug?.origem ?? 'o lançamento'}.`}>
            Preenchido com o que {sug?.origem ?? 'o lançamento'} diz ({[sugNumero && 'número', sugData && campos.dataNaSugestao, sugValor && 'valor', sugEmitente && 'emitente'].filter(Boolean).join(', ')}) — confira. Mudar aqui não muda {sug?.origem ?? 'o lançamento'}.
          </p>
        )}
        <BlocoFormulario titulo="Documento" testId="bloco-documento">
        <div className="grid grid-cols-4 gap-x-2 gap-y-1" data-testid="grade-do-documento">
          {/* ── O TIPO VEM PRIMEIRO, e é ele que decide os campos abaixo (`CAMPOS_POR_ESPECIE`) ── */}
          <div className="col-span-4">
            <Label className="text-[10px] text-muted-foreground">Tipo de documento <span className="text-destructive">*</span></Label>
            <Segmentado valor={especie} onEscolher={trocarEspecie} altura={22} className="mt-0.5 flex w-full [&>button]:flex-1"
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
              <Label className="text-[10px] text-muted-foreground">{campos.numero}</Label>
              <Input value={numero} onChange={e => setNumero(e.target.value)} data-testid="doc-numero"
                className={`h-7 text-[11px] mt-0.5${daNota.numero ? DA_NOTA : sugNumero ? AMBAR : ''}`} placeholder="Opcional" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Série</Label>
              <Input value={serie} onChange={e => setSerie(e.target.value)} data-testid="doc-serie"
                className={`h-7 text-[11px] mt-0.5${daNota.serie ? DA_NOTA : ''}`} placeholder="Opcional" />
            </div>
          </>)}
          <div>
            <Label className="text-[10px] text-muted-foreground">{campos.data}</Label>
            <DatePicker value={dataEmissao} onChange={setDataEmissao} className={`h-7 text-[11px] mt-0.5${daNota.data ? DA_NOTA : sugData ? AMBAR : ''}`} />
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
              <p className="mt-0.5 h-7 text-[10px] leading-tight text-muted-foreground">
                Vem dos componentes, na aba Documentos da operação.
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-[10px] text-muted-foreground">{campos.valor}</Label>
              <CampoMoeda valor={valor} onChange={setValor} className={`h-7 text-[11px] mt-0.5 text-right${daNota.valor ? DA_NOTA : sugValor ? AMBAR : ''}`} />
            </div>
          )}
          {/* fora da NF o número não é a identidade do papel: vem depois de data e valor, ocupando o lugar de Número + Série */}
          {!campos.serie && (
            <div className="col-span-2">
              <Label className="text-[10px] text-muted-foreground">{campos.numero}</Label>
              <Input value={numero} onChange={e => setNumero(e.target.value)} data-testid="doc-numero"
                className={`h-7 text-[11px] mt-0.5${sugNumero ? AMBAR : ''}`} placeholder="Opcional" />
            </div>
          )}
          {/* ── EMITENTE — o DONO do seletor de fornecedor (FORN-SELETOR-PADRAO-01 fatia 2a): busca por nome e por CNPJ/CPF, só
              ativos, documento à vista. "Outro (informar nome e CNPJ/CPF)" é a ação fixa do pé da lista. ── */}
          {campos.emitente && (
            <div className="col-span-2" data-testid="doc-emitente">
              <Label className="text-[10px] text-muted-foreground">{campos.emitente}</Label>
              <div className="mt-0.5">
                <FavorecidoSelect<FornecedorLido>
                  value={emitenteEhOutro ? '' : emitenteId} onChange={setEmitenteId}
                  clienteId={clienteId} linhaDoDocumento={LINHA_DO_DOCUMENTO_DO_EMITENTE} limpavel
                  search={buscaEmitente} onSearchChange={setBuscaEmitente}
                  placeholder={emitenteEhOutro ? 'Outro (informar nome e CNPJ/CPF)' : 'Selecione'}
                  acaoFinal={{ label: 'Outro (informar nome e CNPJ/CPF)', onSelect: () => setEmitenteId(OUTRO) }}
                  triggerClassName={sugEmitente ? 'h-7 text-[11px] border-amber-300 bg-amber-50' : 'h-7 text-[11px]'} />
              </div>
              {/* "Outro": nome e CNPJ/CPF DENTRO da célula do emitente, um ao lado do outro — a Chave não muda de lugar */}
              {emitenteEhOutro && (
                <div className="mt-1 grid grid-cols-2 gap-x-2" data-testid="emitente-outro">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Nome do emitente</Label>
                    <Input value={emitenteNome} onChange={e => setEmitenteNome(e.target.value)} data-testid="doc-emitente-nome"
                      className="h-7 text-[11px] mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">CNPJ / CPF do emitente</Label>
                    <Input value={emitenteDoc} onChange={e => setEmitenteDoc(e.target.value)} data-testid="doc-emitente-documento"
                      className="h-7 text-[11px] mt-0.5" />
                  </div>
                </div>
              )}
            </div>
          )}
          {campos.chave && (
            <div className="col-span-2" data-testid="lugar-chave">
              <Label className="text-[10px] text-muted-foreground">Chave de acesso</Label>
              <Input value={chave} onChange={e => setChave(e.target.value)} data-testid="doc-chave"
                className={`h-7 text-[11px] mt-0.5 tabular-nums${daNota.chave ? DA_NOTA : ''}`} placeholder="44 dígitos" />
            </div>
          )}
          {/* sem emitente (Comprovante) ou sem chave (fora da NF), a linha 2 guarda o lugar: a linha 3 fica sempre na mesma altura */}
          {!campos.emitente && <div className="col-span-2" aria-hidden />}
          {!campos.chave && <div className="col-span-2" aria-hidden />}
          <div className="col-span-2 self-start" data-testid="lugar-observacao">
            <Label className="text-[10px] text-muted-foreground">Observação</Label>
            <Input value={observacao} onChange={e => setObservacao(e.target.value)}
              className="h-7 text-[11px] mt-0.5" placeholder="Opcional" />
          </div>
          {/* ── ARQUIVO: a área verde, "melhor para identificar" (Gabriel). O `<input type="file">` é o de sempre (mesmos
              `accept` e regras) — só deixou de ser a cara do campo. Soltar um arquivo aqui entra pelo MESMO input. ── */}
          <div className="col-span-2" data-testid="lugar-arquivo">
            <Label className="text-[10px] text-muted-foreground">Arquivo</Label>
            {/* UI-ARRASTAR-ARQUIVO-01a — a área é a do sistema (`AreaDeArquivo`): clicar ou arrastar, realce verde, e o tipo
                errado é recusado AO ESCOLHER, na própria área (a conferência ao gravar continua, pelo mesmo dono). Altura fixa
                de 40px: o nome longo corta com o inteiro no `title`. */}
            <AreaDeArquivo regra={REGRA_ARQUIVO_DO_DOCUMENTO} testId="area-arquivo" inputTestId="doc-arquivo" className="mt-0.5 h-7"
              onArquivos={([f]) => { setArquivo(f ?? null); if (f) void lerArquivoDaNota(f); else { setLida(null); setAvisoDaNota(null); } }}
              conteudo={arquivo
                ? <span data-testid="arquivo-escolhido">{arquivo.name}</span>
                : documento?.url ? <>arquivo anexado · <span className="underline underline-offset-2">substituir</span></> : undefined}
              tituloDoConteudo={arquivo ? arquivo.name : documento?.url ? 'arquivo anexado · clique ou arraste outro para substituir' : undefined}
              onRemover={arquivo ? () => { setArquivo(null); setLida(null); setAvisoDaNota(null); } : undefined} />
            <p className="mt-0.5 truncate text-[10px] leading-[13px] text-muted-foreground" data-testid="ajuda-do-arquivo"
              title={`${ajudaDaRegra(REGRA_ARQUIVO_DO_DOCUMENTO)}. Pode ficar para depois — o documento aparece na lista dizendo “sem arquivo”.`}>
              {ajudaDaRegra(REGRA_ARQUIVO_DO_DOCUMENTO)} · pode ficar para depois
            </p>
          </div>
        </div>
        </BlocoFormulario>

        {compartilhada && cancelandoNota && (
          <div className="space-y-1 rounded border border-red-200 bg-red-50 px-2 py-1.5" data-testid="cancelar-nota">
            <Label className="text-[10px] text-muted-foreground">Motivo do cancelamento da nota <span className="text-destructive">*</span></Label>
            <Input value={motivoNota} onChange={e => setMotivoNota(e.target.value)} className="h-7 text-[11px]"
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

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-card px-4 py-2">
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
          <Button type="button" variant={podeVerOQueMuda ? 'outline' : 'default'} onClick={salvar} disabled={enviando || api.saving || lendoANota}
            data-testid="doc-registrar">
            {pendente ? (documento ? 'Salvar na lista' : 'Adicionar à lista') : (documento ? 'Salvar documento' : 'Registrar documento')}
          </Button>
          {/* P127 + P128c — a nota com itens/duplicatas: o gesto principal é ver o que ela muda (a prévia do "+ Da nota", partindo deste lançamento).
              O LUGAR do botão é reservado sempre que o gesto existe (documento novo de um lançamento salvo): ler a nota não desloca o rodapé. */}
          {onVerOQueANotaMuda && !documento && !pendente && (
            <Button type="button" onClick={() => { void verOQueMuda(); }} disabled={!podeVerOQueMuda || enviando || api.saving}
              className={podeVerOQueMuda ? undefined : 'invisible'} aria-hidden={podeVerOQueMuda ? undefined : true} tabIndex={podeVerOQueMuda ? undefined : -1}
              data-testid="doc-ver-o-que-a-nota-muda">
              Ver o que a nota muda
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
