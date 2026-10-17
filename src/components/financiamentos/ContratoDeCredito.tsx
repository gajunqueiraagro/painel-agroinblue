/**
 * FIN-FINANC-28 · PASSO 4 — A TELA DO CONTRATO DE CRÉDITO (financiamento / empréstimo), mock `docs/mocks/mock-financiamentos-v1_2.html`
 * seção 2. Compra parcelada NÃO passa por aqui (segue a tela aprovada do `FinanciamentoDetalhe`).
 *
 * Peças: o CABEÇALHO (título + subtítulo + seis cartões), LIBERAÇÕES, DESTINAÇÕES, os AVISOS DO CRONOGRAMA e os DOCUMENTOS DO
 * CONTRATO. O cronograma (a tabela) continua no `FinanciamentoDetalhe`, na régua de sempre (`reguaDasParcelas`).
 *
 * ⚠ ESTA PEÇA SÓ DESENHA: os números são do banco (`fn_financiamento_saldo`, os cartões da situação) e dos donos puros
 *   (`contratoDeCredito.ts`, `resumoDoContratoNaLista`). Nada de soma aqui (preso por teste de fonte).
 * ⚠ TODO GESTO QUE GRAVA É UMA RPC e tem o contrário: remover liberação (cancela, o vínculo com o lançamento acaba junto), remover
 *   destinação, remover documento (cancela; o arquivo fica no bucket). A recusa do banco fica ESCRITA no diálogo, nunca em toast.
 * ⚠ DIÁLOGOS DE TAMANHO FIXO: o campo que depende da forma (lançamento / fornecedor / contrato anterior) ocupa SEMPRE a mesma linha.
 */
import { TituloDoBloco } from '@/components/ui/bloco-formulario';
import { forwardRef, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, Paperclip, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { REGRA_ARQUIVO_DO_DOCUMENTO } from '@/hooks/useLancamentoDocumentos';
import { tamanhoPorExtenso } from '@/lib/arquivo/aceitarArquivo';
import type { CaptacaoLivre, ContratoAnterior, PedidoDeLiberacao, useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import {
  ESPECIES_DO_CONTRATO, FORMAS_DA_LIBERACAO, ROTULO_DA_ESPECIE, ROTULO_DA_FORMA,
  contaOuFornecedor, encargosDoContrato, estadoDoExtrato, faltaCedula, resumoDasDestinacoes, totalDasLiberacoes,
  type EspecieDoContrato, type FormaDaLiberacao, type LiberacaoDoContrato,
} from '@/lib/financiamentos/contratoDeCredito';
import type { SaldoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import { BuscarEntradasDialog } from '@/components/financiamentos/BuscarNoContrato';

type ApiDoContrato = ReturnType<typeof useContratoDeCredito>;

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');

/* a régua de tabela da casa: cabeçalho navy 9,5px, linha de 25px a 10px, `table-fixed` com larguras explícitas */
const TH = 'h-[22px] bg-primary px-2 text-left text-[9.5px] font-semibold text-primary-foreground whitespace-nowrap overflow-hidden text-ellipsis';
const TH_R = `${TH} text-right`;
const TD = 'h-[25px] px-2 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis';
const TD_R = `${TD} text-right tabular-nums`;
const TOTAL = 'h-[25px] px-2 text-[10px] font-bold bg-[#E8E6DF] whitespace-nowrap';

export const TEXTO_SALDO_SEM_LIBERACAO = 'Sem liberação gravada: o saldo devedor não se deduz do contratado.';

/* ═══ CABEÇALHO ══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
export function CabecalhoDoCredito({
  numero, credor, documento, credorTitle, descricao, subtitulo, saldo, jurosAVencer, proxVencimento, valorDaProx, onVoltar, onEditar, onDocumentos, acaoDeBaixa,
}: {
  numero: string | null; credor: string | null; documento: string | null; credorTitle: string; descricao: string; subtitulo: string;
  saldo: SaldoDoContrato | null | undefined; jurosAVencer: number | null; proxVencimento: string | null; valorDaProx: number | null;
  onVoltar?: () => void; onEditar: () => void; onDocumentos: () => void;
  /** passo 5: o "Dar baixa ▾" / "Desfazer baixa" (`BotaoDarBaixa`), montado por quem tem o hook */
  acaoDeBaixa?: React.ReactNode;
}) {
  const s = saldo ?? null;
  const semLiberacao = s !== null && s.liberado === null;
  return (
    <div className="space-y-1.5" data-testid="cabecalho-do-credito">
      <div className="flex h-[26px] min-w-0 items-center gap-2" data-testid="linha-do-titulo-credito">
        <button type="button" onClick={onVoltar} className="flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline" title="Voltar à lista">
          <ArrowLeft className="size-3.5" /> Financiamentos
        </button>
        <span className="shrink-0 text-[13px] font-semibold text-primary" data-testid="numero-do-contrato">{numero || 'sem nº'}</span>
        <span className="text-muted-foreground">·</span>
        {/* o credor pelo NOME DO CADASTRO, inteiro, + o CNPJ/CPF (FIN-FINANC-28-P3-FIX4); sem lugar, corta com "Nome · documento" no title */}
        <span className="min-w-0 max-w-[40%] shrink truncate text-[12px] font-medium" title={credorTitle} data-testid="credor-do-contrato">{credor ?? 'sem credor'}</span>
        {documento && <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground" data-testid="documento-do-credor">{documento}</span>}
        <span className="text-muted-foreground">·</span>
        <span className="min-w-0 flex-1 truncate text-[12px]" title={descricao}>{descricao}</span>
        <div className="flex shrink-0 items-center gap-1" data-testid="botoes-do-credito">
          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10.5px]" onClick={onEditar}><Pencil className="size-3" /> Editar contrato</Button>
          {acaoDeBaixa}
          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10.5px]" onClick={onDocumentos} data-testid="ir-para-documentos">
            <Paperclip className="size-3" /> Documentos
          </Button>
        </div>
      </div>
      <div className="h-[14px] truncate text-[10px] leading-[14px] text-muted-foreground" title={subtitulo} data-testid="subtitulo-do-contrato">{subtitulo || '—'}</div>
      <div className="grid grid-cols-6 gap-2" data-testid="cartoes-do-credito">
        <Cartao rotulo="Contratado" valor={s?.contratado ?? null} />
        <Cartao rotulo={`Liberado (${s?.liberacoes ?? 0})`} testId="cartao-liberado" valor={s?.liberado ?? null} interrogacao={semLiberacao}
          title={semLiberacao ? 'Nenhuma liberação gravada.' : undefined} />
        <Cartao rotulo="Amortizado" valor={s?.amortizado ?? null} />
        <Cartao rotulo="Saldo devedor" testId="cartao-saldo" valor={s?.saldo ?? null} interrogacao={semLiberacao}
          title={semLiberacao ? TEXTO_SALDO_SEM_LIBERACAO : 'liberado − amortizado (fn_financiamento_saldo)'} />
        <Cartao rotulo="Juros a vencer" valor={jurosAVencer} title="juros das parcelas em aberto do cronograma" />
        {/* "Próx." para a data caber a 1.126 (148px de cartão); por extenso no title */}
        <Cartao rotulo={`Próx. parcela${proxVencimento ? ` · ${br(proxVencimento)}` : ''}`} testId="cartao-proxima" valor={valorDaProx}
          title={proxVencimento ? `Próxima parcela em aberto: vence ${br(proxVencimento)}` : 'Nenhuma parcela em aberto'} />
      </div>
    </div>
  );
}

function Cartao({ rotulo, valor, interrogacao, title, testId }: { rotulo: string; valor: number | null; interrogacao?: boolean; title?: string; testId?: string }) {
  return (
    <div className="h-[40px] min-w-0 rounded-md border px-2 py-1" title={title} data-testid={testId ?? `cartao-${rotulo}`}>
      <div className="truncate text-[10px] leading-[12px] text-muted-foreground">{rotulo}</div>
      <div className={`mt-[2px] whitespace-nowrap text-[13px] font-semibold leading-[16px] tabular-nums ${interrogacao ? 'text-amber-700' : ''}`}>
        {interrogacao ? '?' : valor === null ? '—' : reais(valor)}
      </div>
    </div>
  );
}

/* ═══ LIBERAÇÕES ═════════════════════════════════════════════════════════════════════════════════════════════════════════ */
export function BlocoLiberacoes({ api, contaDoContrato, onAbrirLancamento, clienteId }: {
  api: ApiDoContrato; contaDoContrato: string | null; onAbrirLancamento: (id: string) => void; clienteId: string;
}) {
  const libs = api.liberacoes;
  const [editando, setEditando] = useState<LiberacaoDoContrato | 'nova' | null>(null);
  const [removendo, setRemovendo] = useState<LiberacaoDoContrato | null>(null);
  const [buscando, setBuscando] = useState(false);
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-card px-2 pb-1.5 pt-1" data-testid="bloco-liberacoes">
      <Titulo nome="Liberações" dica="em conta casa com o extrato · direto ao fornecedor = dívida + investimento sem caixa"
        acao={<div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-[20px] px-2 text-[10px]" onClick={() => setBuscando(true)} data-testid="buscar-entradas-botao"
            title="Entradas do cliente que podem ser a captação deste contrato (e os encargos do credor perto delas)">Buscar entradas</Button>
          <Button variant="outline" size="sm" className="h-[20px] gap-1 px-2 text-[10px]" onClick={() => setEditando('nova')} data-testid="nova-liberacao"><Plus className="size-3" /> liberação</Button>
        </div>} />
      <table className="w-full table-fixed border-collapse">
        <colgroup><col style={{ width: 64 }} /><col style={{ width: 92 }} /><col style={{ width: 118 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 44 }} /></colgroup>
        <thead><tr><th className={TH}>Data</th><th className={TH_R}>Valor</th><th className={TH}>Forma</th><th className={TH}>Conta ou fornecedor</th><th className={TH}>Extrato / lançamento</th><th className={TH} /></tr></thead>
        <tbody>
          {libs === null && <tr><td colSpan={6} className={`${TD} text-muted-foreground`}>…</td></tr>}
          {libs !== null && libs.length === 0 && (
            <tr><td colSpan={6} className={`${TD} text-muted-foreground`} data-testid="liberacoes-vazio">Nenhuma liberação gravada.</td></tr>
          )}
          {(libs ?? []).map((l) => {
            const cf = contaOuFornecedor(l, contaDoContrato);
            const ex = estadoDoExtrato(l);
            return (
              <tr key={l.id} className="border-b" data-testid="linha-liberacao">
                <td className={`${TD} tabular-nums`}>{br(l.data)}</td>
                <td className={TD_R}>{num2(l.valor)}</td>
                <td className={TD} title={ROTULO_DA_FORMA[l.forma]}>{ROTULO_DA_FORMA[l.forma]}</td>
                <td className={TD} title={cf.title}>{cf.texto}</td>
                <td className={TD}>
                  {ex === 'vinculado' && l.lancamentoId ? (
                    <button type="button" className="text-primary hover:underline" onClick={() => onAbrirLancamento(l.lancamentoId!)}
                      title={`${l.lancamento?.descricao ?? 'lançamento'} · abrir no Financeiro`} data-testid="liberacao-vinculada">↔ {br(l.lancamento?.data ?? l.data)}</button>
                  ) : ex === 'a_casar' ? <span className="text-amber-700" title="sem lançamento ligado: casa com a entrada quando ela existir">a casar</span>
                    : <span className="text-muted-foreground" title="não passa pela conta do cliente">sem caixa</span>}
                </td>
                <td className={`${TD} text-right`}>
                  <button type="button" className="mr-1 align-middle text-muted-foreground hover:text-foreground" title="Editar liberação" onClick={() => setEditando(l)}><Pencil className="size-3" /></button>
                  <button type="button" className="align-middle text-muted-foreground hover:text-destructive" title="Remover liberação" onClick={() => setRemovendo(l)} data-testid="remover-liberacao"><X className="size-3" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><td className={TOTAL}>Total</td><td className={`${TOTAL} text-right tabular-nums`} data-testid="total-liberacoes">{libs ? num2(totalDasLiberacoes(libs)) : '…'}</td><td colSpan={4} className={`${TOTAL} font-normal text-muted-foreground`}>{libs ? `${libs.length} ${libs.length === 1 ? 'liberação' : 'liberações'}` : ''}</td></tr>
        </tfoot>
      </table>
      {editando && (
        <LiberacaoDialog api={api} clienteId={clienteId} atual={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />
      )}
      {buscando && <BuscarEntradasDialog api={api} aoFechar={() => setBuscando(false)} />}
      {removendo && (
        <RemoverDialog titulo="Remover liberação" comMotivo
          frase={`${br(removendo.data)} · ${reais(removendo.valor)} · ${ROTULO_DA_FORMA[removendo.forma]}. A liberação é cancelada${removendo.lancamentoId ? ' e o lançamento deixa de estar ligado ao contrato' : ''}; o saldo devedor é relido.`}
          aoConfirmar={(motivo) => api.removerLiberacao(removendo.id, motivo)} aoFechar={() => setRemovendo(null)} />
      )}
    </div>
  );
}

/* ═══ DESTINAÇÕES ════════════════════════════════════════════════════════════════════════════════════════════════════════ */
export function BlocoDestinacoes({ api }: { api: ApiDoContrato }) {
  const [editando, setEditando] = useState<{ id: string; descricao: string; orcado: number } | 'nova' | null>(null);
  const [removendo, setRemovendo] = useState<{ id: string; descricao: string } | null>(null);
  const dests = api.destinacoes;
  const resumo = dests && api.liberacoes ? resumoDasDestinacoes(dests, api.liberacoes) : null;
  const enc = encargosDoContrato(api.encargos);
  const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} %`);
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-card px-2 pb-1.5 pt-1" data-testid="bloco-destinacoes">
      <Titulo nome="Destinações" dica="para onde vai o dinheiro · orçado × liberado"
        acao={<Button variant="outline" size="sm" className="h-[20px] gap-1 px-2 text-[10px]" onClick={() => setEditando('nova')} data-testid="nova-destinacao"><Plus className="size-3" /> destinação</Button>} />
      <table className="w-full table-fixed border-collapse">
        <colgroup><col /><col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 48 }} /><col style={{ width: 44 }} /></colgroup>
        <thead><tr><th className={TH}>Destinação</th><th className={TH_R}>Orçado</th><th className={TH_R}>Liberado</th><th className={TH_R}>%</th><th className={TH} /></tr></thead>
        <tbody>
          {resumo === null && <tr><td colSpan={5} className={`${TD} text-muted-foreground`}>…</td></tr>}
          {resumo !== null && resumo.linhas.length === 0 && (
            <tr><td colSpan={5} className={`${TD} text-muted-foreground`} data-testid="destinacoes-vazio">Nenhuma destinação: diga para onde vai o dinheiro em "+ destinação".</td></tr>
          )}
          {(resumo?.linhas ?? []).map((d) => (
            <tr key={d.id} className="border-b" data-testid="linha-destinacao">
              <td className={TD} title={d.descricao}>{d.descricao}</td>
              <td className={TD_R}>{num2(d.orcado)}</td>
              <td className={TD_R}>{num2(d.liberado)}</td>
              <td className={TD_R}>{pct(d.pct)}</td>
              <td className={`${TD} text-right`}>
                <button type="button" className="mr-1 align-middle text-muted-foreground hover:text-foreground" title="Editar destinação" onClick={() => setEditando(d)}><Pencil className="size-3" /></button>
                <button type="button" className="align-middle text-muted-foreground hover:text-destructive" title="Remover destinação" onClick={() => setRemovendo(d)} data-testid="remover-destinacao"><X className="size-3" /></button>
              </td>
            </tr>
          ))}
          {enc && (
            <tr className="border-b" data-testid="linha-encargos">
              <td className={`${TD} text-muted-foreground`} title={enc.papeis}>Encargos: {enc.papeis}</td>
              <td className={`${TD_R} text-muted-foreground`}>—</td>
              <td className={`${TD_R} text-muted-foreground`}>{num2(enc.total)}</td>
              <td className={TD} /><td className={TD} />
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr><td className={TOTAL}>Total</td><td className={`${TOTAL} text-right tabular-nums`}>{resumo ? num2(resumo.total.orcado) : '…'}</td><td className={`${TOTAL} text-right tabular-nums`}>{resumo ? num2(resumo.total.liberado) : '…'}</td><td className={`${TOTAL} text-right tabular-nums`}>{resumo ? pct(resumo.total.pct) : ''}</td><td className={TOTAL} /></tr>
        </tfoot>
      </table>
      {editando && <DestinacaoDialog api={api} atual={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
      {removendo && (
        <RemoverDialog titulo="Remover destinação" frase={`"${removendo.descricao}" sai do contrato. Se alguma liberação aponta para ela, o banco recusa e diz quantas.`}
          aoConfirmar={() => api.removerDestinacao(removendo.id)} aoFechar={() => setRemovendo(null)} />
      )}
    </div>
  );
}

/* ═══ AVISOS DO CRONOGRAMA (só informam) ═════════════════════════════════════════════════════════════════════════════════ */
export function AvisosDoCronograma({ avisos }: { avisos: readonly string[] }) {
  if (avisos.length === 0) return null;
  return (
    <div className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] leading-[14px] text-amber-800" data-testid="avisos-do-cronograma">
      {avisos.map((a) => <div key={a}>⚠ {a}</div>)}
    </div>
  );
}

/* ═══ DOCUMENTOS DO CONTRATO ═════════════════════════════════════════════════════════════════════════════════════════════ */
interface Pendente { chave: string; arquivo: File; especie: EspecieDoContrato | ''; recusa: string | null }
export const BlocoDocumentos = forwardRef<HTMLDivElement, { api: ApiDoContrato }>(function BlocoDocumentos({ api }, ref) {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<{ id: string; nome: string } | null>(null);
  const docs = api.documentos;
  const receber = (arquivos: File[], vereditos: { arquivo: File; motivo: string | null }[]) => {
    setRecado(null);
    const novos = vereditos.length > 0 ? vereditos : arquivos.map((a) => ({ arquivo: a, motivo: null }));
    setPendentes((p) => [...p, ...novos.map((v, i) => ({ chave: `${Date.now()}-${i}-${v.arquivo.name}`, arquivo: v.arquivo, especie: '' as const, recusa: v.motivo }))]);
  };
  const prontos = pendentes.filter((p) => !p.recusa && p.especie !== '');
  const enviar = async () => {
    setEnviando(true); setRecado(null);
    const falhas: string[] = [];
    for (const p of prontos) {
      if (p.especie === '') continue;
      const erro = await api.enviarDocumento(p.arquivo, p.especie);
      if (erro) falhas.push(erro);
    }
    setPendentes((ps) => ps.filter((x) => !prontos.includes(x)));
    setEnviando(false);
    if (falhas.length) setRecado(falhas.join(' · '));
  };
  const abrir = async (caminho: string | null) => {
    if (!caminho) { setRecado('Documento sem arquivo.'); return; }
    const url = await api.urlDoDocumento(caminho);
    if (url) window.open(url, '_blank', 'noopener'); else setRecado('Não foi possível abrir o arquivo.');
  };
  return (
    <div ref={ref} className="flex min-w-0 scroll-mt-2 flex-col rounded-lg border bg-card px-2 pb-1.5 pt-1" data-testid="bloco-documentos">
      <Titulo nome="Documentos do contrato" dica="a cédula, os aditivos, os demonstrativos e os comprovantes" />
      <AreaDeArquivo regra={REGRA_ARQUIVO_DO_DOCUMENTO} modo="lote" onArquivos={receber} className="h-[36px]" testId="area-documentos"
        convite="Clique ou arraste os documentos do contrato" desabilitado={enviando} motivoDesabilitado="Enviando…" />
      {pendentes.length > 0 && (
        <div className="mt-1 rounded border border-dashed px-2 py-1" data-testid="documentos-pendentes">
          {pendentes.map((p) => (
            <div key={p.chave} className="flex h-[24px] items-center gap-2 text-[10px]" data-testid="documento-pendente">
              <div className="w-[170px] shrink-0">
                {p.recusa ? <span className="text-destructive">recusado</span> : (
                  <SearchableSelect value={p.especie} onValueChange={(v) => setPendentes((ps) => ps.map((x) => (x.chave === p.chave ? { ...x, especie: ESPECIES_DO_CONTRATO.find((e) => e === v) ?? '' } : x)))}
                    options={ESPECIES_DO_CONTRATO.map((e) => ({ value: e, label: ROTULO_DA_ESPECIE[e] }))} semTodos placeholder="Espécie *" dense />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate" title={p.arquivo.name}>{p.arquivo.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{p.recusa ?? tamanhoPorExtenso(p.arquivo.size)}</span>
              <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" title="Tirar da lista" onClick={() => setPendentes((ps) => ps.filter((x) => x.chave !== p.chave))}><X className="size-3" /></button>
            </div>
          ))}
          <div className="flex h-[24px] items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{pendentes.some((p) => !p.recusa && p.especie === '') ? 'Escolha a espécie de cada documento.' : ''}</span>
            <Button size="sm" className="ml-auto h-[20px] px-2 text-[10px]" disabled={prontos.length === 0 || enviando} onClick={() => void enviar()} data-testid="enviar-documentos">
              {enviando ? 'Enviando…' : `Enviar ${prontos.length}`}
            </Button>
          </div>
        </div>
      )}
      <table className="mt-1 w-full table-fixed border-collapse">
        <colgroup><col style={{ width: 160 }} /><col /><col style={{ width: 64 }} /><col style={{ width: 130 }} /><col style={{ width: 100 }} /></colgroup>
        <thead><tr><th className={TH}>Espécie</th><th className={TH}>Arquivo</th><th className={TH}>Data</th><th className={TH}>Enviado por</th><th className={TH} /></tr></thead>
        <tbody>
          {docs !== null && faltaCedula(docs) && (
            <tr className="border-b" data-testid="falta-cedula"><td className={`${TD} font-medium text-orange-600`}>Cédula / Contrato</td><td className={`${TD} text-orange-600`} colSpan={4}>falta — anexe a cédula do contrato</td></tr>
          )}
          {docs === null && <tr><td colSpan={5} className={`${TD} text-muted-foreground`}>…</td></tr>}
          {(docs ?? []).map((d) => (
            <tr key={d.id} className="border-b" data-testid="linha-documento">
              <td className={TD} title={ROTULO_DA_ESPECIE[d.especie]}>{ROTULO_DA_ESPECIE[d.especie]}</td>
              <td className={TD} title={d.nome}>{d.nome}</td>
              <td className={`${TD} tabular-nums`}>{br(d.criadoEm.slice(0, 10))}</td>
              <td className={TD} title={d.enviadoPor ?? undefined}>{d.enviadoPor ?? '—'}</td>
              <td className={`${TD} text-right`}>
                <button type="button" className="mr-2 text-primary hover:underline" onClick={() => void abrir(d.storagePath)}>abrir</button>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setRemovendo({ id: d.id, nome: d.nome })} data-testid="remover-documento">remover</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-[14px] truncate text-[10px] leading-[14px] text-destructive" title={recado ?? undefined} data-testid="recado-documentos">{recado ?? ''}</div>
      {removendo && (
        <RemoverDialog titulo="Remover documento" comMotivo frase={`"${removendo.nome}" deixa de valer no contrato. O registro é cancelado com o motivo; o arquivo fica guardado.`}
          aoConfirmar={(motivo) => api.removerDocumento(removendo.id, motivo)} aoFechar={() => setRemovendo(null)} />
      )}
    </div>
  );
});

/* ═══ PEÇAS ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
/* O bloco e o título moram na primitiva da casa (UI-MODAL-BLOCOS-01 passo 0): `src/components/ui/bloco-formulario.tsx`. */
const Titulo = TituloDoBloco;

function Rotulo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <div className="grid h-[28px] grid-cols-[150px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[10px] text-muted-foreground">{texto}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Diálogo de tamanho fixo: cabeçalho navy 34px, corpo, lugar da recusa (14px, sempre presente), rodapé 40px. */
function Casca({ titulo, aoFechar, children, rodape, altura, testId }: { titulo: string; aoFechar: () => void; children: React.ReactNode; rodape: React.ReactNode; altura: number; testId: string }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex w-[560px] max-w-[560px] flex-col gap-0 overflow-hidden p-0" style={{ height: altura }} data-testid={testId}>
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{titulo}</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 px-3 py-2">{children}</div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t px-3">{rodape}</div>
      </DialogContent>
    </Dialog>
  );
}

function LiberacaoDialog({ api, atual, aoFechar, clienteId }: { api: ApiDoContrato; atual: LiberacaoDoContrato | null; aoFechar: () => void; clienteId: string }) {
  const [data, setData] = useState(atual?.data ?? '');
  const [valor, setValor] = useState<number | null>(atual?.valor ?? null);
  const [forma, setForma] = useState<FormaDaLiberacao>(atual?.forma ?? 'conta');
  const [lancamentoId, setLancamentoId] = useState(atual?.lancamentoId ?? '');
  const [fornecedorId, setFornecedorId] = useState(atual?.fornecedorId ?? '');
  const [contratoId, setContratoId] = useState(atual?.contratoLiquidadoId ?? '');
  const [destinacaoId, setDestinacaoId] = useState(atual?.destinacaoId ?? '');
  const [observacao, setObservacao] = useState(atual?.observacao ?? '');
  const [captacoes, setCaptacoes] = useState<CaptacaoLivre[] | null>(null);
  const [contratos, setContratos] = useState<ContratoAnterior[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  useEffect(() => { void api.lerCaptacoesLivres().then(setCaptacoes); void api.lerContratosAnteriores().then(setContratos); }, [api.lerCaptacoesLivres, api.lerContratosAnteriores]);

  /* o lançamento já ligado (em edição) não está entre as livres: entra na lista para o campo mostrar o nome */
  const opcoesLanc: OpcaoSearchable[] = [
    ...(atual?.lancamentoId && !(captacoes ?? []).some((c) => c.id === atual.lancamentoId)
      ? [{ value: atual.lancamentoId, label: `${br(atual.lancamento?.data ?? null)} · ${reais(atual.valor)} · ${atual.lancamento?.descricao ?? 'lançamento ligado'}`, sub: atual.lancamento?.conta ?? undefined }] : []),
    ...(captacoes ?? []).map((c) => ({ value: c.id, label: `${br(c.data)} · ${reais(c.valor)} · ${c.descricao ?? '—'}`, sub: c.conta ?? undefined, busca: String(c.valor) })),
  ];
  const opcoesContrato: OpcaoSearchable[] = (contratos ?? []).map((c) => ({ value: c.id, label: c.numero || 'sem nº', sub: c.descricao ?? undefined }));
  const opcoesDest: OpcaoSearchable[] = (api.destinacoes ?? []).map((d) => ({ value: d.id, label: d.descricao }));

  const gravar = async () => {
    if (!data) { setErro('Informe a data da liberação.'); return; }
    if (!valor || valor <= 0) { setErro('Informe o valor da liberação (maior que zero).'); return; }
    if (forma === 'fornecedor' && !fornecedorId) { setErro('Escolha o fornecedor que recebeu direto.'); return; }
    if (forma === 'liquidacao' && !contratoId) { setErro('Escolha o contrato anterior que esta liberação liquida.'); return; }
    setGravando(true); setErro(null);
    const pedido: PedidoDeLiberacao = {
      id: atual?.id ?? null, data, valor, forma, lancamentoId: lancamentoId || null, fornecedorId: fornecedorId || null,
      contratoLiquidadoId: contratoId || null, destinacaoId: destinacaoId || null, observacao: observacao.trim() || null,
    };
    const r = await api.salvarLiberacao(pedido);
    setGravando(false);
    if (r) setErro(r); else aoFechar();
  };
  return (
    <Casca titulo={atual ? 'Editar liberação' : 'Nova liberação'} aoFechar={aoFechar} altura={330} testId="dialogo-liberacao"
      rodape={<><span className="min-w-0 flex-1 truncate text-[10px] text-destructive" title={erro ?? undefined} data-testid="erro-liberacao">{erro ?? ''}</span>
        <Button variant="outline" size="sm" className="h-[24px] text-[11px]" onClick={aoFechar}>Cancelar</Button>
        <Button size="sm" className="h-[24px] text-[11px]" disabled={gravando} onClick={() => void gravar()} data-testid="salvar-liberacao">{gravando ? 'Gravando…' : 'Salvar'}</Button></>}>
      <Rotulo texto="Data *"><DatePicker value={data} onChange={setData} size="compact" /></Rotulo>
      <Rotulo texto="Valor *"><CampoMoeda valor={valor} onChange={setValor} className="h-[24px] text-[11px]" /></Rotulo>
      <Rotulo texto="Forma *">
        <Segmentado valor={forma} onEscolher={setForma} altura={22} opcoes={FORMAS_DA_LIBERACAO.map((f) => ({ valor: f, rotulo: ROTULO_DA_FORMA[f] }))} />
      </Rotulo>
      {/* a MESMA linha para os três: o diálogo não muda de altura ao trocar a forma */}
      {forma === 'conta' && (
        <Rotulo texto="Lançamento da captação">
          <SearchableSelect value={lancamentoId} onValueChange={setLancamentoId} options={opcoesLanc} semTodos dense
            placeholder={captacoes === null ? 'Lendo as entradas…' : 'a casar (sem lançamento)'} />
        </Rotulo>
      )}
      {forma === 'fornecedor' && (
        <Rotulo texto="Fornecedor *"><FavorecidoSelect value={fornecedorId} onChange={setFornecedorId} clienteId={clienteId} linhaDoDocumento={false} size="compact" /></Rotulo>
      )}
      {forma === 'liquidacao' && (
        <Rotulo texto="Contrato anterior *">
          <SearchableSelect value={contratoId} onValueChange={setContratoId} options={opcoesContrato} semTodos dense placeholder="Escolha o contrato que esta liberação liquida" />
        </Rotulo>
      )}
      <Rotulo texto="Destinação"><SearchableSelect value={destinacaoId} onValueChange={setDestinacaoId} options={opcoesDest} semTodos dense placeholder="sem destinação" /></Rotulo>
      <Rotulo texto="Observação"><Input value={observacao} onChange={(e) => setObservacao(e.target.value)} className="h-[24px] text-[11px]" /></Rotulo>
      <p className="mt-1 text-[10px] leading-[14px] text-muted-foreground">
        {forma === 'conta' ? 'Em conta: aponta para a entrada que já existe no Financeiro (não cria lançamento). Sem ela, fica "a casar".'
          : forma === 'fornecedor' ? 'Direto ao fornecedor: é dívida e investimento, sem passar pela conta.' : 'Liquidação do anterior: o novo contrato paga o anterior, sem caixa.'}
      </p>
    </Casca>
  );
}

function DestinacaoDialog({ api, atual, aoFechar }: { api: ApiDoContrato; atual: { id: string; descricao: string; orcado: number } | null; aoFechar: () => void }) {
  const [descricao, setDescricao] = useState(atual?.descricao ?? '');
  const [orcado, setOrcado] = useState<number | null>(atual?.orcado ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const gravar = async () => {
    if (!descricao.trim()) { setErro('Informe a destinação.'); return; }
    if (orcado === null || orcado < 0) { setErro('Informe o valor orçado (zero ou mais).'); return; }
    const r = await api.salvarDestinacao(atual?.id ?? null, descricao.trim(), orcado);
    if (r) setErro(r); else aoFechar();
  };
  return (
    <Casca titulo={atual ? 'Editar destinação' : 'Nova destinação'} aoFechar={aoFechar} altura={170} testId="dialogo-destinacao"
      rodape={<><span className="min-w-0 flex-1 truncate text-[10px] text-destructive" title={erro ?? undefined}>{erro ?? ''}</span>
        <Button variant="outline" size="sm" className="h-[24px] text-[11px]" onClick={aoFechar}>Cancelar</Button>
        <Button size="sm" className="h-[24px] text-[11px]" onClick={() => void gravar()} data-testid="salvar-destinacao">Salvar</Button></>}>
      <Rotulo texto="Destinação *"><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="h-[24px] text-[11px]" /></Rotulo>
      <Rotulo texto="Orçado *"><CampoMoeda valor={orcado} onChange={setOrcado} className="h-[24px] text-[11px]" /></Rotulo>
    </Casca>
  );
}

/** O gesto contrário, com o que acontece escrito; motivo obrigatório quando o banco o guarda. A recusa fica no diálogo. */
export function RemoverDialog({ titulo, frase, comMotivo, aoConfirmar, aoFechar }: {
  titulo: string; frase: string; comMotivo?: boolean; aoConfirmar: (motivo: string) => Promise<string | null>; aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const confirmar = async () => {
    if (comMotivo && !motivo.trim()) { setErro('Informe o motivo.'); return; }
    setGravando(true);
    const r = await aoConfirmar(motivo.trim());
    setGravando(false);
    if (r) setErro(r); else aoFechar();
  };
  return (
    <Casca titulo={titulo} aoFechar={aoFechar} altura={comMotivo ? 190 : 150} testId="dialogo-remover"
      rodape={<><span className="min-w-0 flex-1 truncate text-[10px] text-destructive" title={erro ?? undefined} data-testid="erro-remover">{erro ?? ''}</span>
        <Button variant="outline" size="sm" className="h-[24px] text-[11px]" onClick={aoFechar}>Voltar</Button>
        <Button variant="destructive" size="sm" className="h-[24px] text-[11px]" disabled={gravando} onClick={() => void confirmar()} data-testid="confirmar-remover">{gravando ? 'Removendo…' : 'Remover'}</Button></>}>
      <p className="text-[10.5px] leading-[15px]">{frase}</p>
      {comMotivo && <Rotulo texto="Motivo *"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-[24px] text-[11px]" data-testid="motivo-remover" /></Rotulo>}
    </Casca>
  );
}
