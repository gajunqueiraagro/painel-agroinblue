/**
 * FIN-FINANC-28 · TELA DO CONTRATO v3 (mock aprovado pelo Gabriel 18/10/2026, caso NJ PR-78.179) — o TOPO do contrato de crédito
 * (financiamento, empréstimo, consórcio) e as abas Pagamentos e Histórico. Compra parcelada não passa por aqui.
 *
 *  · linha do título: "← Financiamentos" · "<nº> · <descrição>" 13px/600 · selo da situação · selo vermelho das vencidas · ações
 *    (Editar · lugar RESERVADO do "Juntar" — FIN-CONTRATO-JUNTAR-01 o acende · Dar baixa em dourado);
 *  · bloco "Contrato" em duas colunas (rótulo de largura fixa + valor colado, 11px; uma informação por campo; o que falta é
 *    "não cadastrado" em laranja) + bloco "Resumo" de 250px (números da fonte única: `fn_financiamento_saldo` e os cartões da situação);
 *  · bloco "A resolver": uma linha por pendência, com a bolinha, o texto, o valor e o botão que resolve; sem pendência, some.
 * ⚠ SÓ DESENHA: nada é somado aqui — totais, "a identificar", taxa a.a. e as pendências vêm de `fn_contrato_tela`.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BLOCO_FORMULARIO, TituloDoBloco } from '@/components/ui/bloco-formulario';
import type { SaldoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import {
  NAO_CADASTRADO, ROTULO_DA_ACAO, ROTULO_DA_SITUACAO, dataBr, textoDaAtividade, textoDaCarencia, textoDaTaxa, textoDaTaxaAa, textoDasVencidas, textoDoSistema,
  type AcaoDoPendente, type PendenteDoContrato, type TelaDoContrato,
} from '@/lib/financiamentos/telaDoContrato';

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reais = (v: number) => `R$ ${num2(v)}`;
const LARANJA = 'text-amber-700';

/* ═══ linha de leitura: rótulo de largura fixa (100px, 11px cinza) + o valor colado (11px/500). Nunca rótulo à esquerda e valor
   encostado à direita com o vazio no meio. */
export function LinhaDeLeitura({ rotulo, children, testId }: { rotulo: string; children: ReactNode; testId?: string }) {
  return (
    <div className="grid h-[18px] min-w-0 grid-cols-[100px_minmax(0,1fr)] items-center gap-2" data-testid={testId}>
      <span className="truncate text-[11px] text-muted-foreground" title={rotulo}>{rotulo}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium">{children}</span>
    </div>
  );
}
const NaoCadastrado = () => <span className={LARANJA} data-testid="nao-cadastrado">{NAO_CADASTRADO}</span>;
const ouNaoCadastrado = (v: string | null) => (v === null ? <NaoCadastrado /> : <span className="truncate" title={v}>{v}</span>);
const SeloAConfirmar = () => (
  <span className="rounded-full bg-amber-100 px-1.5 text-[9.5px] font-medium leading-[14px] text-amber-800" data-testid="selo-a-confirmar"
    title="a liberação não tem o lançamento de entrada vinculado">a confirmar</span>
);
function Marco({ m }: { m: TelaDoContrato['contrato']['primeiraLiberacao'] }) {
  if (!m) return <span className={LARANJA} title="nenhuma liberação gravada">—</span>;
  return <><span className="tabular-nums">{dataBr(m.data)}</span>{m.aConfirmar && <SeloAConfirmar />}</>;
}

const SITUACAO_TOM: Record<string, string> = {
  ativo: 'bg-primary/10 text-primary', prorrogado: 'bg-primary/10 text-primary', quitado: 'bg-emerald-100 text-emerald-800',
  rolado: 'bg-muted text-muted-foreground', cancelado: 'bg-muted text-muted-foreground',
};

export function TopoDoContrato({ numero, descricao, status, saldo, vencido, tela, onVoltar, onEditar, acaoDeBaixa, onResolver }: {
  numero: string | null; descricao: string; status: string | null; saldo: SaldoDoContrato | null | undefined; vencido: number | null;
  tela: TelaDoContrato | null; onVoltar?: () => void; onEditar: () => void; acaoDeBaixa?: ReactNode;
  onResolver: (acao: AcaoDoPendente, p: PendenteDoContrato) => void;
}) {
  const s = saldo ?? null;
  const semLiberacao = s !== null && s.liberado === null;
  const c = tela?.contrato ?? null; const k = tela?.condicoes ?? null;
  const vencidas = textoDasVencidas(c?.vencidas ?? 0);
  const titulo = `${numero || 'sem nº'} · ${descricao}`;
  const pend = tela?.aResolver ?? [];
  return (
    <div className="space-y-2" data-testid="topo-do-contrato">
      {/* 1 — LINHA DO TÍTULO */}
      <div className="flex h-[26px] min-w-0 items-center gap-2" data-testid="linha-do-titulo-credito">
        <button type="button" onClick={onVoltar} className="flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline" title="Voltar à lista">
          <ArrowLeft className="size-3.5" /> Financiamentos
        </button>
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground" title={titulo} data-testid="titulo-do-contrato">{titulo}</span>
        {status && (
          <span className={`shrink-0 rounded-full px-2 text-[10px] font-medium leading-[16px] ${SITUACAO_TOM[status] ?? 'bg-muted text-muted-foreground'}`}
            data-testid="selo-da-situacao">{ROTULO_DA_SITUACAO[status] ?? status}</span>
        )}
        {vencidas && <span className="shrink-0 rounded-full bg-destructive/10 px-2 text-[10px] font-medium leading-[16px] text-[#b91c1c]" data-testid="selo-das-vencidas">{vencidas}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1" data-testid="botoes-do-credito">
          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10.5px]" onClick={onEditar}><Pencil className="size-3" /> Editar</Button>
          {/* FIN-CONTRATO-JUNTAR-01 — o lugar do "Juntar" é reservado (nada se move quando ele acender) */}
          <span className="inline-block h-6 w-[58px]" aria-hidden="true" data-testid="lugar-do-juntar" />
          {acaoDeBaixa}
        </div>
      </div>

      {/* 2 — CONTRATO + RESUMO (abaixo de 600px empilha; acima, nunca) */}
      <div className="flex flex-col gap-2 min-[600px]:flex-row" data-testid="linha-de-blocos">
        <section className={`${BLOCO_FORMULARIO} min-[600px]:flex-1`} data-testid="bloco-contrato">
          <TituloDoBloco nome="Contrato" />
          <div className="grid grid-cols-1 gap-x-7 gap-y-0.5 min-[600px]:grid-cols-2">
            <div className="min-w-0 space-y-0.5">
              <LinhaDeLeitura rotulo="Data do contrato" testId="campo-data-do-contrato"><span className="tabular-nums">{dataBr(c?.dataContrato ?? null) ?? '—'}</span></LinhaDeLeitura>
              <LinhaDeLeitura rotulo="1ª liberação" testId="campo-primeira-liberacao"><Marco m={c?.primeiraLiberacao ?? null} /></LinhaDeLeitura>
              <LinhaDeLeitura rotulo="Última liberação" testId="campo-ultima-liberacao"><Marco m={c?.ultimaLiberacao ?? null} /></LinhaDeLeitura>
              <LinhaDeLeitura rotulo="Vencimento final"><span className="tabular-nums">{dataBr(c?.vencimentoFinal ?? null) ?? '—'}</span></LinhaDeLeitura>
              <LinhaDeLeitura rotulo="Atividade">{ouNaoCadastrado(textoDaAtividade(c?.atividade ?? null))}</LinhaDeLeitura>
            </div>
            <div className="min-w-0 space-y-0.5">
              <LinhaDeLeitura rotulo="Credor" testId="campo-credor">
                {c?.credor ? <span className="min-w-0 truncate whitespace-nowrap" title={c.credor} data-testid="credor-do-contrato">{c.credor}</span> : <NaoCadastrado />}
              </LinhaDeLeitura>
              <LinhaDeLeitura rotulo="CNPJ/CPF" testId="campo-documento">{c?.credorDocumento ? <span className="tabular-nums">{c.credorDocumento}</span> : <NaoCadastrado />}</LinhaDeLeitura>
              <LinhaDeLeitura rotulo="Taxa" testId="campo-taxa">{k ? ouNaoCadastrado(textoDaTaxa(k)) : '…'}</LinhaDeLeitura>
              <LinhaDeLeitura rotulo="Taxa a.a." testId="campo-taxa-aa">{k ? ouNaoCadastrado(textoDaTaxaAa(k)) : '…'}</LinhaDeLeitura>
              <LinhaDeLeitura rotulo="Sistema" testId="campo-sistema">{k ? ouNaoCadastrado(textoDoSistema(k.sistema)) : '…'}</LinhaDeLeitura>
              <LinhaDeLeitura rotulo="Carência" testId="campo-carencia">{k ? ouNaoCadastrado(textoDaCarencia(k.carenciaAte)) : '…'}</LinhaDeLeitura>
            </div>
          </div>
        </section>
        <section className={`${BLOCO_FORMULARIO} min-[600px]:w-[250px] min-[600px]:shrink-0`} data-testid="bloco-resumo">
          <TituloDoBloco nome="Resumo" />
          <LinhaDoResumo rotulo="Contratado" valor={s?.contratado ?? null} />
          <LinhaDoResumo rotulo="Liberado" valor={s?.liberado ?? null} interrogacao={semLiberacao} title={semLiberacao ? 'Nenhuma liberação gravada.' : undefined} />
          <LinhaDoResumo rotulo="Principal pago" valor={s?.amortizado ?? null} />
          <LinhaDoResumo rotulo="Saldo devedor" valor={s?.saldo ?? null} interrogacao={semLiberacao}
            title={semLiberacao ? 'Sem liberação gravada: o saldo devedor não se deduz do contratado.' : 'liberado − principal pago (fn_financiamento_saldo)'} />
          {(vencido ?? 0) > 0 && <LinhaDoResumo rotulo="Vencido" valor={vencido} vermelho />}
        </section>
      </div>

      {/* 3 — A RESOLVER (some sem pendência) */}
      {pend.length > 0 && (
        <section className={BLOCO_FORMULARIO} data-testid="bloco-a-resolver">
          <TituloDoBloco nome="A resolver" />
          {pend.map((p) => (
            <div key={p.chave} className="flex h-[22px] min-w-0 items-center gap-2" data-testid={`pendente-${p.chave}`}>
              <span className={`size-2 shrink-0 rounded-full ${p.tom === 'vencido' ? 'bg-[#b91c1c]' : 'bg-amber-500'}`} />
              <span className={`min-w-0 flex-1 truncate text-[11px] ${p.tom === 'vencido' ? 'text-[#b91c1c]' : ''}`} title={p.texto}>{p.texto}</span>
              <span className="w-[110px] shrink-0 text-right text-[11px] font-medium tabular-nums">{p.valor === null ? '' : num2(p.valor)}</span>
              <Button variant="outline" size="sm" className="h-5 w-[118px] shrink-0 px-2 text-[10px]" onClick={() => onResolver(p.acao, p)}
                data-testid={`resolver-${p.chave}`}>{ROTULO_DA_ACAO[p.acao]}</Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function LinhaDoResumo({ rotulo, valor, interrogacao, vermelho, title }: { rotulo: string; valor: number | null; interrogacao?: boolean; vermelho?: boolean; title?: string }) {
  return (
    <div className={`flex h-[20px] items-center justify-between gap-2 ${vermelho ? 'text-[#b91c1c]' : ''}`} title={title} data-testid={`resumo-${rotulo}`}>
      <span className={`text-[11px] ${vermelho ? '' : 'text-muted-foreground'}`}>{rotulo}</span>
      <span className={`whitespace-nowrap text-[13px] font-bold tabular-nums ${interrogacao ? LARANJA : ''}`}>{interrogacao ? '?' : valor === null ? '—' : reais(valor)}</span>
    </div>
  );
}

/* ═══ ABAS PAGAMENTOS e HISTÓRICO — a régua de tabela da casa, cabeçalho e total presos (só o corpo rola) ═══════════════ */
const TH = 'sticky top-0 z-10 h-[22px] bg-primary px-2 text-left text-[9.5px] font-semibold text-primary-foreground whitespace-nowrap';
const TH_R = `${TH} text-right`;
const TD = 'h-[22px] px-2 text-[10.5px] whitespace-nowrap overflow-hidden text-ellipsis';
const TD_D = `${TD} text-[10px] tabular-nums`;
const TD_R = `${TD} text-right tabular-nums`;
const TF = 'sticky bottom-0 z-10 h-[24px] bg-[#E8E6DF] px-2 text-[10.5px] font-bold whitespace-nowrap';

export function TabelaDePagamentos({ tela, onAbrirLancamento }: { tela: TelaDoContrato | null; onAbrirLancamento: (id: string) => void }) {
  const linhas = tela?.pagamentos ?? null; const t = tela?.pagamentosTotal;
  return (
    <div className="h-full min-h-0 overflow-y-auto rounded-md border" data-testid="area-que-rola-pagamentos">
      <table className="w-full table-fixed border-collapse" data-testid="tabela-pagamentos">
        <colgroup><col style={{ width: 72 }} /><col /><col style={{ width: 96 }} /><col style={{ width: 88 }} /><col style={{ width: 88 }} /><col style={{ width: 100 }} /><col style={{ width: 140 }} /><col style={{ width: 72 }} /></colgroup>
        <thead data-testid="cabecalho-pagamentos"><tr>
          <th className={TH}>Pago em</th><th className={TH}>Item</th><th className={TH_R}>Principal</th><th className={TH_R}>Juros</th>
          <th className={TH_R}>Encargos</th><th className={TH_R}>Total</th><th className={TH}>Conta</th><th className={TH}>Lançamento</th>
        </tr></thead>
        <tbody>
          {linhas === null && <tr><td colSpan={8} className={`${TD} text-muted-foreground`}>…</td></tr>}
          {linhas !== null && linhas.length === 0 && <tr><td colSpan={8} className={`${TD} text-muted-foreground`}>Nenhum pagamento identificado.</td></tr>}
          {(linhas ?? []).map((p, i) => (
            <tr key={`${p.item}-${i}`} className="border-b" data-testid="linha-pagamento">
              <td className={TD_D}>{dataBr(p.data) ?? '—'}</td>
              <td className={TD} title={p.item}>{p.item}</td>
              <td className={TD_R}>{p.principal ? num2(p.principal) : ''}</td>
              <td className={TD_R}>{p.juros ? num2(p.juros) : ''}</td>
              <td className={TD_R}>{p.encargos ? num2(p.encargos) : ''}</td>
              <td className={`${TD_R} font-medium`}>{num2(p.total)}</td>
              <td className={TD} title={p.conta ?? undefined}>{p.conta ?? '—'}</td>
              <td className={TD}>{p.lancamentoId
                ? <button type="button" className="text-primary hover:underline" onClick={() => onAbrirLancamento(p.lancamentoId!)}>↔ abrir</button>
                : <span className="text-muted-foreground" title="parcela paga sem lançamento no Financeiro">sem lançamento</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot data-testid="total-pagamentos"><tr>
          <td className={TF} colSpan={2}>Total{t ? ` · ${t.qtde} ${t.qtde === 1 ? 'pagamento' : 'pagamentos'}` : ''}</td>
          <td className={`${TF} text-right tabular-nums`}>{t ? num2(t.principal) : '…'}</td>
          <td className={`${TF} text-right tabular-nums`}>{t ? num2(t.juros) : '…'}</td>
          <td className={`${TF} text-right tabular-nums`}>{t ? num2(t.encargos) : '…'}</td>
          <td className={`${TF} text-right tabular-nums`}>{t ? num2(t.total) : '…'}</td>
          <td className={TF} colSpan={2} />
        </tr></tfoot>
      </table>
    </div>
  );
}

export function TabelaDoHistorico({ tela }: { tela: TelaDoContrato | null }) {
  const linhas = tela?.historico ?? null;
  return (
    <div className="h-full min-h-0 overflow-y-auto rounded-md border" data-testid="area-que-rola-historico">
      <table className="w-full table-fixed border-collapse" data-testid="tabela-historico">
        <colgroup><col style={{ width: 80 }} /><col /><col style={{ width: 120 }} /></colgroup>
        <thead><tr><th className={TH}>Data</th><th className={TH}>Evento</th><th className={TH_R}>Valor</th></tr></thead>
        <tbody>
          {linhas === null && <tr><td colSpan={3} className={`${TD} text-muted-foreground`}>…</td></tr>}
          {linhas !== null && linhas.length === 0 && <tr><td colSpan={3} className={`${TD} text-muted-foreground`}>Nenhum evento.</td></tr>}
          {(linhas ?? []).map((e, i) => (
            <tr key={`${e.evento}-${i}`} className="border-b" data-testid="linha-historico">
              <td className={TD_D}>{dataBr(e.data) ?? '—'}</td>
              <td className={TD} title={e.evento}>{e.evento}</td>
              <td className={TD_R}>{e.valor === null ? '' : num2(e.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
