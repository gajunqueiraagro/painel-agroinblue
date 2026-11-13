/**
 * A TABELA DA LISTA DE LANÇAMENTOS FINANCEIROS — CONC-SUGESTOES-TABELA-01 (Gabriel 04/11: "(a) extrair a tabela do Financeiro num
 * componente e usar nos dois"). As peças saíram VERBATIM de `src/pages/FinanceiroV2Tab.tsx` (a casca da tabela, a linha, o cabeçalho e as
 * células que as outras listas também mostram); a lista do Financeiro passou a desenhá-las daqui, com o MESMO HTML (prova: o `outerHTML`
 * do quadro igual antes × depois em 24 variantes da bancada, e o `desloca --so financeiro` sem troca). Quem usa: Lançamentos Financeiros e
 * as "Sugestões para casar" + "Procurar no histórico" da Conciliação.
 *
 * ⚠ AS FONTES SÃO AS DA CLASSE `.table-financeiro` (index.css): 8px no cabeçalho, 9px na linha, 8px nas datas, no Doc. e no Status — a
 *   exceção declarada ao piso, "Lancamentos Financeiros". Quem usa esta tabela herda as mesmas.
 * ⚠ AS COLUNAS CONGELADAS: a caixinha (0) e as três datas (28/74/120) são `sticky` — a cadeia é a soma das larguras 28 + 46 + 46. Quem
 *   mudar uma dessas larguras refaz a cadeia (os números moram em `ESQUERDA_DA_DATA`).
 */
import type { MouseEvent, ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { STATUS_FILTRO_COR, STATUS_FILTRO_LABEL, STATUS_FILTRO_PILULA, STATUS_PILULA_BASE } from '@/lib/financeiro/statusFinanceiro';

export function fmtDate(d: string | null) {
  if (!d) return '-';
  /* FIN-V2-DESEMPENHO-01b (FIN-V2-SEM-CORTE-01): a data da casa é dd/mm/aaaa, inclusive nesta lista */
  try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; }
}

/** A casca: a tabela de régua fixa, as larguras (`colgroup`, em px medido), o cabeçalho navy preso e o corpo. `cabecalhoPreso` = false: o
 *  quadro que não rola (preso num quadro que não rola é vão — a regra do gate, P153); o Financeiro não o passa (preso sempre). */
/*  CONC-SUGESTOES-FONTE-01 (Gabriel 08/11 10:26): a variante GRANDE de 04/11 (12px, linha de 26px) SAIU — foi erro, o pedido era fonte
    menor. As listas da Conciliação desenham esta tabela no tamanho da lista do Financeiro, sem exceção. */
export function TabelaDaLista({ larguras, cabecalho, cabecalhoPreso = true, children }: {
  larguras: readonly (number | null)[]; cabecalho: ReactNode; cabecalhoPreso?: boolean; children: ReactNode;
}) {
  return (
    <table className="table-financeiro w-full caption-bottom text-sm border-collapse"
      style={{ tableLayout: 'fixed' }}>
      <colgroup>
        {larguras.map((w, i) => <col key={i} style={w == null ? undefined : { width: w }} />)}
      </colgroup>
      <thead className={cabecalhoPreso ? '[&_tr]:border-b sticky top-0 z-20 bg-primary' : '[&_tr]:border-b z-20 bg-primary'}>
        <tr className="border-b !h-auto">
          {cabecalho}
        </tr>
      </thead>
      <tbody className="[&_tr:last-child]:border-0">
        {children}
      </tbody>
    </table>
  );
}

const ALINHAMENTO_DO_TH: Readonly<Record<'left' | 'center' | 'right', string>> = { left: 'text-left', center: 'text-center', right: 'text-right' };

/** O `th` da lista: o recuo (`px-…`), o clique que ordena e, nas congeladas, o `sticky` + fundo. `semTexto` = a caixinha e o clipe. */
export function ThDaLista({ recuo, ordenar, fixa, semTexto = false, separador = false, alinhar = 'center', children, ...resto }: {
  recuo: 'px-0' | 'px-0.5' | 'px-1'; ordenar?: () => void; fixa?: string; semTexto?: boolean; children?: ReactNode;
  /** UI-FONTE-GATE-01 (Gabriel 12/11) — o rótulo alinhado como a coluna (texto à esquerda, número à direita). Sem ele, centro: a lista do
   *  Financeiro segue igual. */
  alinhar?: 'left' | 'center' | 'right';
  /** DOC-ANEXO-E-IMPORT-01 F2 — o separador de GRUPO à esquerda (mock: antes de Anexo e de Status) */
  separador?: boolean;
  title?: string; 'aria-label'?: string; 'data-testid'?: string;
}) {
  return (
    <th className={`${recuo} py-[3px] ${ALINHAMENTO_DO_TH[alinhar]} align-middle${semTexto ? '' : ' text-[8px] uppercase leading-tight font-semibold text-primary-foreground'}${ordenar ? ' cursor-pointer select-none' : ''}${fixa ? ` ${fixa}` : ''}${separador ? ' border-l border-white/30' : ''}`}
      {...resto} onClick={ordenar}>{children}</th>
  );
}

/** A linha: clicável (abre) ou não, e marcada pela caixinha. `testid`/`dadoAcao`: só as listas da Conciliação (o Financeiro não os passa). */
export function LinhaDaLista({ marcada, abrir, testid, dadoAcao, children }: { marcada: boolean; abrir?: () => void; testid?: string; dadoAcao?: string; children: ReactNode }) {
  return (
    <tr className={`linha-da-lista border-b hover:bg-muted/50 transition-colors${abrir ? ' cursor-pointer' : ''} ${marcada ? 'bg-primary/5' : ''}`}
      onClick={abrir} data-testid={testid} data-acao={dadoAcao}>
      {children}
    </tr>
  );
}

/** A caixinha (congelada à esquerda): o clique nela não abre a linha. `solta`: as listas da Conciliação (o quadro delas nem sempre rola, e
 *  coluna presa num quadro que não rola é vão — a regra do gate), sem o `sticky`. */
export function CelulaCaixinha({ marcada, alternar, desabilitada, solta = false }: { marcada: boolean; alternar: () => void; desabilitada?: boolean; solta?: boolean }) {
  return (
    <td className={solta ? 'px-1 py-1 align-middle text-center bg-background' : 'px-1 py-1 align-middle text-center sticky left-0 z-10 bg-background'}
      onClick={(e) => e.stopPropagation()}>
      <Checkbox checked={marcada} onCheckedChange={alternar} disabled={desabilitada} className="h-3 w-3" />
    </td>
  );
}

type ColunaDeData = 'comp' | 'venc' | 'pgto';
const ESQUERDA_DA_DATA: Readonly<Record<ColunaDeData, string>> = { comp: 'left-[28px]', venc: 'left-[74px]', pgto: 'left-[120px]' };

/** Uma das três datas (Comp. · Venc. · Pgto.), congelada; vencida = vermelha (só a de Venc.). `solta`: as listas da Conciliação, sem o `sticky`. */
export function CelulaData({ iso, coluna, vencido = false, solta = false }: { iso: string | null; coluna: ColunaDeData; vencido?: boolean; solta?: boolean }) {
  return (
    <td className={`celula-data tabular-nums px-[1px] py-1 align-middle leading-tight ${solta ? '' : `sticky ${ESQUERDA_DA_DATA[coluna]} z-10 `}bg-background text-center ${vencido ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
      title={vencido ? 'Vencido e não pago' : undefined}>{fmtDate(iso)}</td>
  );
}

/** Produto / Descrição: uma linha, "…" e o inteiro no `title`. `quebra` (UI-FONTE-GATE-01, Gabriel 12/11 — só as listas da Conciliação):
 *  o nome NUNCA corta — quebra na própria célula e a linha cresce. A lista do Financeiro (linhas de 19px, virtual) não o passa. */
const TEXTO_QUE_QUEBRA = 'whitespace-normal break-words [overflow-wrap:anywhere]';
export function CelulaProduto({ title, quebra = false, children }: { title: string; quebra?: boolean; children: ReactNode }) {
  return <td className={`${quebra ? TEXTO_QUE_QUEBRA : 'truncate'} px-1 py-1 align-middle text-[12px] font-medium leading-tight`} title={title}>{children}</td>;
}

/** Fornecedor: só o nome numa linha ("…"); CNPJ, cidade e "inativo" no `title` (FIN-V2-FORNECEDOR-SEM-SUFIXO-01). */
export function CelulaFornecedor({ title, quebra = false, children }: { title: string; quebra?: boolean; children: ReactNode }) {
  return (
    <td className={`${quebra ? TEXTO_QUE_QUEBRA : 'truncate'} px-1 py-1 align-middle text-[12px] leading-tight text-muted-foreground`}
      title={title} data-testid="celula-fornecedor">{children}</td>
  );
}

/** O nome do fornecedor dentro da célula (o recuo que deixa o "…" fora da borda). */
export function NomeNaCelula({ nome }: { nome: string }) {
  return <span className="flex min-w-0"><span className="truncate pr-0.5">{nome}</span></span>;
}

/** Faz.: o CÓDIGO (PUR, RET, ADM); o nome no `title`. */
export function CelulaFaz({ codigo, nome }: { codigo: string | null | undefined; nome: string | null | undefined }) {
  return <td className="whitespace-nowrap px-0.5 py-1 align-middle text-center text-[11px] font-medium leading-tight text-muted-foreground" title={nome || ''}>{codigo || '-'}</td>;
}

/** Valor: à direita, negrito, o fundo das datas; a cor e o sinal vêm de quem chama (`classe`). */
export function CelulaValor({ classe, children }: { classe: string; children: ReactNode }) {
  return (
    <td className={`celula-valor text-right font-semibold whitespace-nowrap px-1 py-1 align-middle text-[12px] leading-tight bg-background ${classe}`}
      data-testid="celula-valor">{children}</td>
  );
}

/** Doc. / NF: à direita ("NF 000.000.518"); o que tem no `title`. */
export function CelulaDoc({ rotulo, titulo }: { rotulo: string | null | undefined; titulo: string | null | undefined }) {
  return (
    <td className="celula-doc tabular-nums text-muted-foreground text-right px-1 py-1 align-middle text-[10px] leading-tight truncate" data-testid="celula-doc"
        title={titulo || undefined}>{rotulo || '-'}</td>
  );
}

/** Status: a célula (o rótulo vem de `RotuloDoStatus`, às vezes dentro de um botão). */
export function CelulaStatus({ title, onClick, separador = false, children }: { title: string | undefined; onClick?: (e: MouseEvent) => void;
  /** DOC-ANEXO-E-IMPORT-01 F2 — o separador de grupo à esquerda (o Status fecha o grupo Anexo · Doc.) */
  separador?: boolean; children: ReactNode }) {
  return (
    <td className={`celula-status px-0.5 py-1 text-center align-middle leading-tight${separador ? ' border-l border-[#c9d1dc]' : ''}`} data-testid="celula-status"
        title={title}
        onClick={onClick}>
      {children}
    </td>
  );
}

/**
 * ⚠ CONCILIADO É DERIVADO, e é por isso que a chave se
 * calcula aqui em vez de vir do banco: existe vínculo ativo →
 * conciliado; não existe → o status persistido, intocado. A
 * coluna `status_transacao` continua guardando o que sempre
 * guardou, e nenhum writer muda por causa disto.
 * ⚠ SÓ REALIZADO VIRA CONCILIADO. Previsto com vínculo seria
 * contradição — dinheiro que ainda não andou não se concilia
 * —, e mascarar o previsto esconderia o defeito em vez de
 * mostrá-lo.
 * ⚠ A PÍLULA AZUL VEM DO VÍNCULO, e o `stCru === 'conciliado'`
 * NÃO a herda: 574 linhas têm esse status gravado sem vínculo
 * nenhum — legado de 10/04/2026. Elas caem no rótulo
 * "Conciliado (legado)", muted, distinguível do fato.
 */
export function statusDaLinha(statusTransacao: string | null | undefined, temVinculo: boolean) {
  const stCru = (statusTransacao || '').toLowerCase();
  const stKey = temVinculo && stCru === 'realizado' ? 'conciliado_real' : stCru;
  const stLabel = STATUS_FILTRO_LABEL[stKey] || statusTransacao || '-';
  const stColor = STATUS_FILTRO_COR[stKey] || 'text-muted-foreground';
  const stPilula = STATUS_FILTRO_PILULA[stKey];
  /* Os estágios sem caixa levam o mesmo peso da pílula; o legado fica no muted normal. */
  const stEstagio = stKey === 'previsto' || stKey === 'programado' || stKey === 'agendado';
  return { stCru, stKey, stLabel, stColor, stPilula, stEstagio };
}

/** O rótulo do status: caixa só em realizado e conciliado; previsto, programado e agendado são texto colorido. */
export function RotuloDoStatus({ st }: { st: ReturnType<typeof statusDaLinha> }) {
  return st.stPilula
    ? <span className={cn(STATUS_PILULA_BASE, st.stPilula)} data-status={st.stKey}>{st.stLabel}</span>
    : <span className={cn('block truncate pr-0.5', st.stColor, st.stEstagio && 'font-semibold')} data-status={st.stKey}>{st.stLabel}</span>;
}
