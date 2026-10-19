/**
 * FIN-FINANC-28 · TELA DO CONTRATO v4 (mock aprovado pelo Gabriel 18/10 16:11, caso NJ PR-78.179; substitui o visual da v3/B3) — o
 * TOPO do contrato de crédito (financiamento, empréstimo, consórcio) e as abas Pagamentos e Histórico. Compra parcelada não passa aqui.
 *
 *  · linha do título, uma linha: "←" · "<nº> · <descrição>" 14px/600 · selo da situação · selo laranja "N pendências" (abre a aba A
 *    resolver) · ações (Editar · lugar RESERVADO do Juntar · Dar baixa dourado), botões de 26px a 11px;
 *  · A FICHA: um card só — a faixa Resumo (5 células iguais: Contratado · Liberado · Principal pago · Saldo devedor · Vencido / Próximo
 *    pagamento / Quitado em) e os fatos em 3 colunas (rótulo da largura do maior DAQUELA coluna, valor colado a 10px).
 * ⚠ SÓ DESENHA: nada é somado aqui — totais, "a identificar", taxa a.a. e as pendências vêm de `fn_contrato_tela`.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SaldoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import {
  NAO_CADASTRADO, ROTULO_DA_ACAO, ROTULO_DA_SITUACAO, dataBr, textoDaAtividade, textoDaCarencia, textoDaTaxa, textoDaTaxaAa, textoDoSistema,
  type AcaoDoPendente, type PendenteDoContrato, type TelaDoContrato,
} from '@/lib/financiamentos/telaDoContrato';

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* FIN-CONTRATO-TELA-FONTE-01 (Gabriel 19/10/2026) — UMA ESCALA para a tela do contrato, aqui e em `FinanciamentoDetalhe.tsx` (espelho
   declarado): título 13px que quebra em duas linhas reservadas; fatos 11px; cartão rótulo 10px / valor 12px; bloco 11px; tabela
   cabeçalho 10px, célula 10,5px, total 10,5px bold; recado 11px. NUNCA "…": texto longo de uma linha ROLA DENTRO DO LUGAR dele
   (`.uma-linha-que-rola`, a regra do FIN-FILTRO-DOC-01 em `src/index.css`), recado quebra a linha. */
export const ESCALA_DO_CONTRATO = {
  titulo: 'text-[13px] font-semibold leading-[16px]',
  fato: 'text-[11px]',
  cartaoRotulo: 'text-[10px]',
  cartaoValor: 'text-[12px] font-semibold',
  bloco: 'text-[11px] font-semibold',
  th: 'text-[10px]',
  td: 'text-[10.5px]',
  total: 'text-[10.5px] font-bold',
  recado: 'text-[11px]',
  rola: 'uma-linha-que-rola',
};
const E = ESCALA_DO_CONTRATO;
const reais = (v: number) => `R$ ${num2(v)}`;
function LinhaPendente({ p, onResolver }: { p: PendenteDoContrato; onResolver: (acao: AcaoDoPendente, p: PendenteDoContrato) => void }) {
  return (
    <div className="flex min-h-[22px] min-w-0 items-center gap-2 py-0.5" data-testid={`pendente-${p.chave}`}>
      <span className={`size-2 shrink-0 rounded-full ${p.tom === 'vencido' ? 'bg-[#b91c1c]' : 'bg-amber-500'}`} />
      <span className={`min-w-0 flex-1 break-words ${E.recado} leading-[14px] ${p.tom === 'vencido' ? 'text-[#b91c1c]' : ''}`}>{p.texto}</span>
      <span className="w-[110px] shrink-0 text-right text-[11px] font-medium tabular-nums">{p.valor === null ? '' : num2(p.valor)}</span>
      <Button variant="outline" size="sm" className="h-5 w-[118px] shrink-0 px-2 text-[10px]" onClick={() => onResolver(p.acao, p)}
        data-testid={`resolver-${p.chave}`}>{ROTULO_DA_ACAO[p.acao]}</Button>
    </div>
  );
}

/* ═══ TELA DO CONTRATO v4 (Gabriel 18/10 16:11) — a PALETA da tela: rótulo cinza-escuro, valor quase preto, bordas e fundos mais
   firmes ("poluído, cores muito claras"). Laranja e vermelho com fundo próprio. */
export const COR_V4 = {
  rotulo: 'text-[#556070]', valor: 'text-[#111827]', borda: 'border-[#d3dae3]', bordaFina: 'border-[#e3e8ee]', pagina: 'bg-[#e9edf2]',
  laranja: 'text-[#b45309]', fundoLaranja: 'bg-[#fdf0dc]', vermelho: 'text-[#b42318]', fundoVermelho: 'bg-[#fde8e6]',
};
const NaoCadastrado = () => <span className={COR_V4.laranja} data-testid="nao-cadastrado">{NAO_CADASTRADO}</span>;
const ouNaoCadastrado = (v: string | null) => (v === null ? <NaoCadastrado /> : <span className={E.rola}>{v}</span>);
/** a liberação sem lançamento vinculado: a data em laranja, o porquê no `title` (sem selo ao lado) */
function Marco({ m }: { m: TelaDoContrato['contrato']['primeiraLiberacao'] }) {
  if (!m) return <span className={COR_V4.laranja} title="nenhuma liberação gravada">—</span>;
  return m.aConfirmar
    ? <span className={`tabular-nums ${COR_V4.laranja}`} title="a confirmar: liberação sem lançamento vinculado" data-testid="data-a-confirmar">{dataBr(m.data)}</span>
    : <span className="tabular-nums">{dataBr(m.data)}</span>;
}

const SITUACAO_TOM: Record<string, string> = {
  ativo: 'bg-[#e0e9f5] text-[#1d3a5d]', prorrogado: 'bg-[#e0e9f5] text-[#1d3a5d]', quitado: 'bg-[#dcf2e3] text-[#166534]',
  rolado: 'bg-[#e3e8ee] text-[#475569]', cancelado: 'bg-[#e3e8ee] text-[#475569]',
};

/** a 5ª célula do Resumo: Vencido (vermelho) quando há; senão o próximo pagamento; no quitado, a data da quitação. Vem pronta da tela. */
export interface QuintaCelula { rotulo: string; valor: string; title?: string; vermelho?: boolean }

/** uma coluna de fatos: o rótulo tem a largura do MAIOR rótulo DAQUELA coluna (max-content) e o valor cola a 10px */
function ColunaDeFatos({ itens }: { itens: { rotulo: string; testId?: string; valor: ReactNode }[] }) {
  return (
    <div className="grid min-w-0 grid-cols-[max-content_minmax(0,max-content)] content-start gap-x-[10px]" data-testid="coluna-do-contrato">
      {itens.map((f) => (
        <div key={f.rotulo} className="contents" data-testid={f.testId}>
          <span className={`h-[18px] whitespace-nowrap ${E.fato} leading-[18px] ${COR_V4.rotulo}`}>{f.rotulo}</span>
          <span className={`flex h-[18px] min-w-0 items-center whitespace-nowrap ${E.fato} font-medium leading-[18px] ${COR_V4.valor}`}>{f.valor}</span>
        </div>
      ))}
    </div>
  );
}

function CelulaDoResumo({ rotulo, valor, title, vermelho, laranja }: { rotulo: string; valor: string; title?: string; vermelho?: boolean; laranja?: boolean }) {
  return (
    <div className={`min-w-0 border-l px-2 py-1 first:border-l-0 ${COR_V4.bordaFina}`} title={title} data-testid={`resumo-${rotulo.split(' ')[0]}`}>
      <div className={`${E.rola} ${E.cartaoRotulo} leading-[14px] ${vermelho ? COR_V4.vermelho : COR_V4.rotulo}`}>{rotulo}</div>
      <div className={`whitespace-nowrap ${E.cartaoValor} leading-[17px] tabular-nums ${vermelho ? COR_V4.vermelho : laranja ? COR_V4.laranja : COR_V4.valor}`}>{valor}</div>
    </div>
  );
}

export function TopoDoContrato({ numero, descricao, status, saldo, tela, parcelas, quinta, onVoltar, onEditar, acaoDeBaixa, acaoDeJuntar, pendencias, onAbrirPendencias }: {
  numero: string | null; descricao: string; status: string | null; saldo: SaldoDoContrato | null | undefined;
  tela: TelaDoContrato | null; parcelas: { total: number; pagas: number } | null; quinta: QuintaCelula | null;
  onVoltar?: () => void; onEditar: () => void; acaoDeBaixa?: ReactNode;
  /** FIN-CONTRATO-JUNTAR-01: o botão "Juntar", no lugar reservado */
  acaoDeJuntar?: ReactNode;
  /** quantas pendências a aba "A resolver" tem; o selo laranja a abre e some sem pendência */
  pendencias: { qtde: number; vencido: boolean }; onAbrirPendencias: () => void;
}) {
  const s = saldo ?? null;
  const semLiberacao = s !== null && s.liberado === null;
  const c = tela?.contrato ?? null; const k = tela?.condicoes ?? null;
  const titulo = `${numero || 'sem nº'} · ${descricao}`;
  const r = (v: number | null | undefined) => (v === null || v === undefined ? '—' : reais(v));
  return (
    <div className="space-y-2" data-testid="topo-do-contrato">
      {/* 1 — LINHA DO TÍTULO: ← · título 13px que QUEBRA (duas linhas de altura RESERVADA: o título longo não empurra a tela; passou
          de duas, rola dentro do lugar dele) · situação · pendências · ações à direita (botões de 26px, 11px) */}
      <div className="flex h-[34px] min-w-0 items-center gap-2" data-testid="linha-do-titulo-credito">
        <button type="button" onClick={onVoltar} className="flex size-[26px] shrink-0 items-center justify-center rounded text-[#1d3a5d] hover:bg-[#dfe5ec]"
          title="Voltar para Financiamentos" aria-label="Voltar para Financiamentos" data-testid="voltar-do-contrato">
          <ArrowLeft className="size-4" />
        </button>
        <span className={`max-h-[32px] min-w-0 overflow-y-auto break-words ${E.titulo} ${COR_V4.valor}`} data-testid="titulo-do-contrato">{titulo}</span>
        {status && (
          <span className={`shrink-0 rounded-full px-2 text-[10.5px] font-semibold leading-[18px] ${SITUACAO_TOM[status] ?? SITUACAO_TOM.rolado}`}
            data-testid="selo-da-situacao">{ROTULO_DA_SITUACAO[status] ?? status}</span>
        )}
        {pendencias.qtde > 0 && (
          <button type="button" onClick={onAbrirPendencias} title="abrir a aba A resolver" data-testid="selo-das-pendencias"
            className={`shrink-0 rounded-full px-2 text-[10.5px] font-semibold leading-[18px] hover:underline ${COR_V4.fundoLaranja} ${COR_V4.laranja}`}>
            {pendencias.qtde === 1 ? '1 pendência' : `${pendencias.qtde} pendências`}
          </button>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5" data-testid="botoes-do-credito">
          <Button variant="outline" size="sm" className="h-[26px] gap-1 px-2.5 text-[11px]" onClick={onEditar}><Pencil className="size-3" /> Editar</Button>
          {/* FIN-CONTRATO-JUNTAR-01 — o lugar do "Juntar" é reservado (nada se move quando ele acende) */}
          <span className="inline-flex h-[26px] w-[64px] shrink-0" aria-hidden={acaoDeJuntar ? undefined : true} data-testid="lugar-do-juntar">{acaoDeJuntar}</span>
          {acaoDeBaixa}
        </div>
      </div>

      {/* 2 — A FICHA: um card só. Resumo em faixa no topo (5 células iguais) + os fatos em 3 colunas */}
      <section className={`overflow-hidden rounded-lg border bg-white ${COR_V4.borda}`} data-testid="ficha-do-contrato">
        <div className={`grid grid-cols-5 border-b bg-[#f4f6f9] ${COR_V4.bordaFina}`} data-testid="bloco-resumo">
          <CelulaDoResumo rotulo="Contratado" valor={r(s?.contratado)} />
          <CelulaDoResumo rotulo="Liberado" valor={semLiberacao ? '?' : r(s?.liberado)} laranja={semLiberacao} title={semLiberacao ? 'Nenhuma liberação gravada.' : undefined} />
          <CelulaDoResumo rotulo="Principal pago" valor={r(s?.amortizado)} />
          <CelulaDoResumo rotulo="Saldo devedor" valor={semLiberacao ? '?' : r(s?.saldo)} laranja={semLiberacao}
            title={semLiberacao ? 'Sem liberação gravada: o saldo devedor não se deduz do contratado.' : 'liberado − principal pago (fn_financiamento_saldo)'} />
          {quinta ? <CelulaDoResumo rotulo={quinta.rotulo} valor={quinta.valor} title={quinta.title} vermelho={quinta.vermelho} /> : <CelulaDoResumo rotulo="Próx. pgto." valor="—" title="Próximo pagamento" />}
        </div>
        <div className="grid grid-cols-[max-content_minmax(0,max-content)_max-content] justify-between gap-x-6 px-3 py-1.5" data-testid="colunas-do-contrato">
          <ColunaDeFatos itens={[
            { rotulo: 'Data do contrato', testId: 'campo-data-do-contrato', valor: <span className="tabular-nums">{dataBr(c?.dataContrato ?? null) ?? '—'}</span> },
            { rotulo: '1ª liberação', testId: 'campo-primeira-liberacao', valor: <Marco m={c?.primeiraLiberacao ?? null} /> },
            { rotulo: 'Última liberação', testId: 'campo-ultima-liberacao', valor: <Marco m={c?.ultimaLiberacao ?? null} /> },
            { rotulo: 'Vencimento final', valor: <span className="tabular-nums">{dataBr(c?.vencimentoFinal ?? null) ?? '—'}</span> },
          ]} />
          <ColunaDeFatos itens={[
            { rotulo: 'Credor', testId: 'campo-credor', valor: c?.credor
              ? <span className={`min-w-0 max-w-[260px] ${E.rola}`} data-testid="credor-do-contrato">{c.credor}</span> : <NaoCadastrado /> },
            { rotulo: 'CNPJ/CPF', testId: 'campo-documento', valor: c?.credorDocumento ? <span className="tabular-nums">{c.credorDocumento}</span> : <NaoCadastrado /> },
            { rotulo: 'Atividade', testId: 'campo-atividade', valor: ouNaoCadastrado(textoDaAtividade(c?.atividade ?? null)) },
            { rotulo: 'Sistema', testId: 'campo-sistema', valor: k ? ouNaoCadastrado(textoDoSistema(k.sistema)) : '…' },
          ]} />
          <ColunaDeFatos itens={[
            { rotulo: 'Taxa', testId: 'campo-taxa', valor: k ? ouNaoCadastrado(textoDaTaxa(k)) : '…' },
            { rotulo: 'Taxa a.a.', testId: 'campo-taxa-aa', valor: k ? ouNaoCadastrado(textoDaTaxaAa(k)) : '…' },
            { rotulo: 'Carência', testId: 'campo-carencia', valor: k ? ouNaoCadastrado(textoDaCarencia(k.carenciaAte)) : '…' },
            { rotulo: 'Parcelas', testId: 'campo-parcelas', valor: <span className="tabular-nums">{parcelas ? `${parcelas.total} · ${parcelas.pagas} pagas` : '…'}</span> },
          ]} />
        </div>
      </section>
    </div>
  );
}

/* ═══ ABA "A RESOLVER" (B3, Gabriel 18/10): a lista das pendências, uma por linha (bolinha, texto, valor, botão que resolve).
   As do banco (`fn_contrato_tela`) e, por último, os avisos do cronograma (o principal que não fecha com o contratado e a 1ª parcela; só informam). */
export function ListaDePendencias({ pendencias, avisos, onResolver }: {
  pendencias: readonly PendenteDoContrato[]; avisos: readonly string[]; onResolver: (acao: AcaoDoPendente, p: PendenteDoContrato) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto rounded-md border bg-card px-3 py-1.5" data-testid="lista-de-pendencias">
      {pendencias.map((p) => <LinhaPendente key={p.chave} p={p} onResolver={onResolver} />)}
      {avisos.map((a) => (
        <div key={a} className="flex min-h-[22px] min-w-0 items-center gap-2 py-0.5" data-testid="pendente-aviso">
          <span className="size-2 shrink-0 rounded-full bg-amber-500" />
          <span className={`min-w-0 flex-1 break-words ${E.recado}`}>{a}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ ABAS PAGAMENTOS e HISTÓRICO — a régua de tabela da casa, cabeçalho e total presos (só o corpo rola) ═══════════════ */
const TH = `sticky top-0 z-10 h-[22px] bg-primary px-2 text-left ${E.th} font-semibold text-primary-foreground whitespace-nowrap`;
const TH_R = `${TH} text-right`;
const TD = `h-[22px] px-2 ${E.td} whitespace-nowrap`;
const TD_D = `${TD} tabular-nums`;
const TD_R = `${TD} text-right tabular-nums`;
const TF = `sticky bottom-0 z-10 h-[24px] bg-[#E8E6DF] px-2 ${E.total} whitespace-nowrap`;

export function TabelaDePagamentos({ tela, onAbrirLancamento }: { tela: TelaDoContrato | null; onAbrirLancamento: (id: string) => void }) {
  const linhas = tela?.pagamentos ?? null; const t = tela?.pagamentosTotal;
  return (
    <div className="h-full min-h-0 overflow-auto rounded-md border" data-testid="area-que-rola-pagamentos">
      <table className="w-full min-w-[720px] table-fixed border-collapse" data-testid="tabela-pagamentos">
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
              <td className={TD}><span className={E.rola}>{p.item}</span></td>
              <td className={TD_R}>{p.principal ? num2(p.principal) : ''}</td>
              <td className={TD_R}>{p.juros ? num2(p.juros) : ''}</td>
              <td className={TD_R}>{p.encargos ? num2(p.encargos) : ''}</td>
              <td className={`${TD_R} font-medium`}>{num2(p.total)}</td>
              <td className={TD}><span className={E.rola}>{p.conta ?? '—'}</span></td>
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

/** FIN-CONTRATO-JUNTAR-01: o evento de junção viva tem "Desfazer" (o gesto contrário); o resto do Histórico é só leitura */
export function TabelaDoHistorico({ tela, onDesfazerJuncao }: { tela: TelaDoContrato | null; onDesfazerJuncao?: (juncaoId: string, evento: string) => void }) {
  const linhas = tela?.historico ?? null;
  return (
    <div className="h-full min-h-0 overflow-auto rounded-md border" data-testid="area-que-rola-historico">
      <table className="w-full min-w-[480px] table-fixed border-collapse" data-testid="tabela-historico">
        <colgroup><col style={{ width: 80 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 64 }} /></colgroup>
        <thead><tr><th className={TH}>Data</th><th className={TH}>Evento</th><th className={TH_R}>Valor</th><th className={TH} aria-label="ação" /></tr></thead>
        <tbody>
          {linhas === null && <tr><td colSpan={4} className={`${TD} text-muted-foreground`}>…</td></tr>}
          {linhas !== null && linhas.length === 0 && <tr><td colSpan={4} className={`${TD} text-muted-foreground`}>Nenhum evento.</td></tr>}
          {(linhas ?? []).map((e, i) => (
            <tr key={`${e.evento}-${i}`} className="border-b" data-testid="linha-historico">
              <td className={TD_D}>{dataBr(e.data) ?? '—'}</td>
              <td className={TD}><span className={E.rola}>{e.evento}</span></td>
              <td className={TD_R}>{e.valor === null ? '' : num2(e.valor)}</td>
              <td className={TD}>
                {e.juncaoId && e.desfazivel && onDesfazerJuncao && (
                  <button type="button" className="text-[10px] text-primary hover:underline" onClick={() => { if (e.juncaoId) onDesfazerJuncao(e.juncaoId, e.evento); }}
                    title="desfazer a junção: os dois cadastros voltam ao que eram" data-testid="desfazer-juncao">Desfazer</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
