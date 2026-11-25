/**
 * NOTA-ENTREGA-FUTURA-01 (3) — mock aprovado pelo Gabriel 25/11 07:24 (`ui-validar/nota-outra-nf-ref/mock-aprovado.html`): a etapa 1 quando
 * o achado é do mesmo fornecedor e valor mas JÁ TEM OUTRA NF (`achadoComOutraNota`). Uma seção própria: a frase "esta nota ainda não está
 * em nenhum lançamento", a tabela do achado nas colunas da lista do Financeiro (Comp. · Venc. · Pgto. · Descrição · Fornecedor · Faz.·Ativ. ·
 * Plano de contas · Conta · NF · Valor · Status; a NF diferente em âmbar), a explicação e "O que fazer" com 2 opções. Só desenho: o que
 * cada opção grava é do `NotaFiscalDialog` (trocar = o completar de sempre; criar = o Novo lançamento padrão).
 */
import { cn } from '@/lib/utils';
/* a RÉGUA NOVA de tela nova (Gabriel 25/11 07:44): tabela 11px, datas e rótulos 10px, título 13px, campos e botões 11px com 26px de altura */
const TH = 'h-[24px] px-1.5 py-0 text-[10px] font-medium text-primary-foreground whitespace-nowrap';
const TD = 'h-[24px] px-1.5 py-0 text-[11px] leading-none';
const TD_TEXTO = `${TD} truncate`;
const TD_NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const TD_DATA = 'h-[24px] px-1.5 py-0 text-[10px] leading-none tabular-nums whitespace-nowrap';
import { reais } from '@/lib/financeiro/nfe/formatos';

export type EscolhaDaOutraNota = 'trocar' | 'criar';

export interface LinhaDaOutraNota {
  id: string;
  competencia: string | null;
  vencimento: string | null;
  pagamento: string | null;
  descricao: string | null;
  fornecedor: string | null;
  fazAtiv: string | null;
  /** o nome inteiro da fazenda (o title da Faz.·Ativ.) */
  fazendaNome: string | null;
  plano: string | null;
  conta: string | null;
  nf: string;
  valorCent: number;
  status: string;
}

const dataBr = (x: string | null) => (x && /^\d{4}-\d{2}-\d{2}/.test(x) ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : '—');
/* as larguras do mock (px medidos para o conteúdo inteiro); a Descrição divide o resto */
const COLUNAS: readonly [string, number | null, 'n' | ''][] = [
  ['Comp.', 72, ''], ['Venc.', 72, ''], ['Pgto.', 72, ''], ['Descrição', null, ''], ['Fornecedor', 140, ''], ['Faz.·Ativ.', 76, ''],
  ['Plano de contas', 150, ''], ['Conta', 104, ''], ['NF', 66, ''], ['Valor', 104, 'n'], ['Status', 84, ''],
];

export function SecaoOutraNota({ nfDaNota, outras, linhas, faturamento, escolha, onEscolher, onProcurar }: {
  /** a NF que está entrando, já falada ("30.150") */
  nfDaNota: string;
  /** as outras NF, faladas ("30.436") */
  outras: readonly string[];
  linhas: readonly LinhaDaOutraNota[];
  /** a nota que entra é o simples faturamento (5922/6922): a outra é a remessa da mesma compra */
  faturamento: boolean;
  escolha: EscolhaDaOutraNota;
  onEscolher: (e: EscolhaDaOutraNota) => void;
  onProcurar: () => void;
}) {
  const outra = outras.join(', ');
  const umaOutra = outras.length === 1;
  const opcoes: { valor: EscolhaDaOutraNota; titulo: string; meta: string }[] = [
    { valor: 'trocar', titulo: `É a mesma compra: trocar para a NF ${nfDaNota}`,
      meta: `recomendado · a ${outra} fica anexada${faturamento ? ' como remessa' : ''}` },
    { valor: 'criar', titulo: 'Não é esta compra: criar lançamento novo',
      meta: `o lançamento da ${outra} continua como está` },
  ];
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-md border bg-card p-2.5" data-testid="nota-outra-nf">
      <p className="h-[18px] shrink-0 text-[11px] text-muted-foreground" data-testid="nota-outra-nf-frase">
        Esta nota (NF {nfDaNota}) <b className="font-semibold text-foreground">ainda não está</b> em nenhum lançamento.</p>
      <h4 className="flex h-[20px] shrink-0 items-center text-[13px] font-semibold">
        Lançamento do mesmo fornecedor e valor, com <span className="ml-1 text-amber-700">{umaOutra ? 'outra nota' : 'outras notas'}</span></h4>
      {/* estreita (750–1000) a tabela rola de lado DENTRO do quadro (as colunas da lista não espremem); de 1126 para cima cabe inteira */}
      <div className="shrink-0 overflow-x-auto overflow-y-hidden rounded border" data-testid="nota-outra-nf-rolagem">
        <table className="w-full min-w-[1050px] table-fixed border-collapse" data-testid="nota-outra-nf-tabela">
          <colgroup>{COLUNAS.map(([h, w]) => <col key={h} style={w === null ? undefined : { width: w }} />)}</colgroup>
          <thead className="bg-primary"><tr>{COLUNAS.map(([h, , a]) => <th key={h} className={cn(TH, a === 'n' ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-border/50" data-testid="nota-outra-nf-linha">
                <td className={TD_DATA}>{dataBr(l.competencia)}</td>
                <td className={TD_DATA}>{dataBr(l.vencimento)}</td>
                <td className={cn(TD_DATA, 'text-muted-foreground')}>{dataBr(l.pagamento)}</td>
                <td className={TD_TEXTO} title={l.descricao ?? undefined} data-reticencias-com-title="">{l.descricao || '—'}</td>
                <td className={TD_TEXTO} title={l.fornecedor ?? undefined} data-reticencias-com-title="">{l.fornecedor || '—'}</td>
                <td className={TD_TEXTO} title={l.fazendaNome ?? undefined} data-reticencias-com-title="">{l.fazAtiv || '—'}</td>
                <td className={TD_TEXTO} title={l.plano ?? undefined} data-reticencias-com-title="">{l.plano || '—'}</td>
                <td className={TD_TEXTO} title={l.conta ?? undefined} data-reticencias-com-title="">{l.conta || '—'}</td>
                <td className={cn(TD_NUM, 'text-left font-semibold text-amber-700')} data-testid="nota-outra-nf-numero">{l.nf}</td>
                <td className={cn(TD_NUM, 'font-semibold')}>{reais(l.valorCent)}</td>
                <td className={TD_TEXTO} title={l.status}>{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] leading-[16px] text-blue-900" data-testid="nota-outra-nf-porque">
        {faturamento
          ? <>A NF {outra} {umaOutra ? 'é a' : 'são'} <b>remessa</b> (a entrega da mercadoria) desta mesma compra. A compra é a NF {nfDaNota}, que você está lançando agora.</>
          : <>{umaOutra ? 'Este lançamento já está' : 'Estes lançamentos já estão'} com a NF {outra}. Se for a mesma compra, troque para a NF {nfDaNota}: a {outra} continua anexada.</>}
      </p>
      <h4 className="mt-1 h-[20px] shrink-0 text-[13px] font-semibold">O que fazer</h4>
      <div role="radiogroup" aria-label="O que fazer" className="flex shrink-0 flex-col gap-1.5">
        {opcoes.map((o) => {
          const on = escolha === o.valor;
          return (
            <button key={o.valor} type="button" role="radio" aria-checked={on} onClick={() => onEscolher(o.valor)}
              className={cn('flex h-[26px] items-center gap-2 rounded-md border px-2.5 text-left text-[11px]', on ? 'border-primary bg-blue-50/60' : 'border-border hover:bg-muted/40')}
              data-testid={`nota-outra-nf-${o.valor}`}>
              <span aria-hidden className={cn('h-3 w-3 shrink-0 rounded-full border-[1.5px]', on ? 'border-[4px] border-primary' : 'border-slate-400')} />
              <b className="shrink-0 font-semibold">{o.titulo}</b>
              <span className="ml-auto min-w-0 truncate text-[10px] text-muted-foreground" title={o.meta} data-reticencias-com-title="">{o.meta}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="h-[26px] w-fit shrink-0 text-[11px] text-primary hover:underline" onClick={onProcurar} data-testid="nota-outra-nf-procurar">
        + Procurar outro lançamento do fornecedor</button>
    </section>
  );
}
