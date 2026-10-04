import type { ReactNode } from 'react';
import { ROTULO_STATUS_DESPESA, type LinhaDespesa, type StatusDespesa } from '@/lib/oc/despesasDaOperacao';
import { STATUS_PALETA, STATUS_PILULA_BASE } from '@/lib/financeiro/statusFinanceiro';

/* OC-VENDA-FINANCEIRO-COMPLETO-01a — a tabela das DESPESAS DA OPERACAO na OC em conta corrente (mock v4, parte de baixo da aba
   Financeiro). So' apresentacao: as linhas vem de `linhasDeDespesa`, os nomes de quem chama e o menu "⋯" tambem — as acoes sao
   as mesmas funcoes da lista de compromissos (`AbaCompromissosOC`), nenhuma escrita nova.
   ⚠ PADRAO DE TABELA (A31): 10px nas linhas, 9,5 no cabecalho navy, datas dd/mm/aa a 9,5px, divisor antes do Banco, cor pelo
     sinal, cabecalho centralizado e numero a' direita.
   ⚠ UMA LINHA POR REGISTRO, SEMPRE (UI-LINHA-UNICA-01, Gabriel 04/10/2026: "eu odeio quando vai empilhando e alongando… pode
     esconder se for texto muito grande, mas nao vai empilhando"). Descricao, Favorecido, Conta e Banco CORTAM na celula (`TDQ`:
     nowrap + ellipsis) com o texto INTEIRO no `title`; data, status e valor NUNCA cortam — a coluna deles tem a largura do pior
     caso. Antes Descricao e Favorecido quebravam em 2-3 linhas ("Rafael Valamede Zagatto (Rota Pagou pelo BB)") e a linha ia a 27px+.
   ⚠ REGUA, soma 764 — a LARGURA INTERNA medida no modal de 1024 com o resumo de 240 (766 menos 1px de borda de cada lado; com
     766 a tabela vazava 2px e o ⋯ encostava na borda — prova de tela, fix1):
     Venc 52 · Pgto 52 · Descricao 150 · Favorecido 144 · Conta 110 · Banco 84 · Status 76 · Valor 74 · ⋯ 22.
     MEDIDA NA TELA (1.133px, 04/10/2026): a data a 9,5px pede 43,8 + 8 de padding = 52 (em 46 ela vazava 2px da celula); a
     pilula mais larga ("Conciliado") pede 62,8 + 8; o valor de sete digitos, 62 + 8; "Itaú Personalite" inteiro pede 81.
     A Conta vai com o nome curto (`rotuloCurtoDaConta`) e o inteiro no `title`. */

export const REGUA_DESPESAS: readonly number[] = [52, 52, 150, 144, 110, 84, 76, 74, 22];

const TH = 'h-[17px] whitespace-nowrap bg-primary px-[4px] text-center text-[9.5px] font-semibold text-white';
const TD = 'h-[19px] whitespace-nowrap border-b border-[#eceae4] px-[4px] text-[10px]';
/* A celula de TEXTO LIVRE: uma linha so', cortada na borda com "…" — o texto inteiro vai no `title` de quem a usa. (Era a celula
   que QUEBRAVA; a regra mudou no UI-LINHA-UNICA-01.) */
const TDQ = `${TD} overflow-hidden text-ellipsis`;
/* Data: 9,5px, numeros alinhados, nunca cortada. */
const TD_DATA = `${TD} text-center text-[9.5px] tabular-nums`;
/* A celula do ⋯ (20px) SEM padding: `${TD} p-0` nao zerava — no CSS gerado o `px-[4px]` do TD vence o `p-0`, a area util ficava em
   12px e o botao de 18 vazava 2px (medido na prova de tela do fix1: scrollWidth 766 x clientWidth 764 com a tabela em 764). */
const TD_MENU = 'h-[19px] whitespace-nowrap border-b border-[#eceae4] p-0 text-center text-[10px] leading-none';
const DV = 'border-l-2 border-l-[#9aa7b6]';
const TF = 'h-[19px] whitespace-nowrap border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[4px] text-[10px] font-bold tabular-nums';
const NEG = 'text-[#b91c1c]';

/* As cinco cores do mock v4 VÊM DA PALETA DO STATUS (`statusFinanceiro.ts`) — PR-FIN-V2-STATUS-PGTO-01: moravam aqui, e a lista
   do Financeiro tinha outras. Só o ambar do "Sem título" é daqui: é estado da despesa da OC, não status de lançamento. */
const PILULA: Record<StatusDespesa, string> = {
  previsto: STATUS_PALETA.previsto.pilula,
  programado: STATUS_PALETA.programado.pilula,
  agendado: STATUS_PALETA.agendado.pilula,
  realizado: STATUS_PALETA.realizado.pilula,
  conciliado: STATUS_PALETA.conciliado.pilula,
  sem_titulo: 'text-[#b45309] bg-[#fffbeb] border-[#fde68a]',
};

export const dataCurtaDespesa = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const num2 = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PilulaStatusDespesa({ status }: { status: StatusDespesa | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`${STATUS_PILULA_BASE} ${PILULA[status]}`}
      data-status={status}>
      {ROTULO_STATUS_DESPESA[status]}
    </span>
  );
}

interface Props {
  linhas: readonly LinhaDespesa[];
  total: number;
  nomeFavorecido: (id: string | null) => string | null;
  /** O nome curto (celula) e o inteiro (`title`) da conta do plano. */
  contaDoPlano: (planoContaId: string | null) => { curto: string; inteiro: string } | null;
  nomeBanco: (contaBancariaId: string | null) => string | null;
  onAbrir: (l: LinhaDespesa) => void;
  menu: (l: LinhaDespesa) => ReactNode;
  /** OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — com ele, cabecalho e total CONGELADOS contra o scrollport do modal: o cabecalho gruda
   *  `topo` px abaixo do alto (a altura do bloco fixo dos cards e sub-abas), o total no pe'. A tabela nao rola por dentro. */
  topo?: number;
}

export function TabelaDespesasOC({ linhas, total, nomeFavorecido, contaDoPlano, nomeBanco, onAbrir, menu, topo }: Props) {
  const fixo = topo !== undefined;
  const th = fixo ? `${TH} sticky z-20` : TH;
  const thTop = fixo ? { top: topo } : undefined;
  const tf = fixo ? `${TF} sticky bottom-0 z-10` : TF;
  return (
    <div className="rounded border" data-testid="despesas-operacao">
      <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums" data-testid="despesas-tabela">
        <colgroup>
          {REGUA_DESPESAS.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            {['Venc.', 'Pgto.', 'Descrição', 'Favorecido', 'Conta'].map(h => <th key={h} className={th} style={thTop}>{h}</th>)}
            <th className={`${th} ${DV}`} style={thTop}>Banco</th>
            <th className={th} style={thTop}>Status</th>
            <th className={th} style={thTop}>Valor R$</th>
            <th className={th} style={thTop} aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            const conta = contaDoPlano(l.planoContaId);
            const banco = nomeBanco(l.contaBancariaId);
            const favorecido = nomeFavorecido(l.favorecidoId);
            return (
              <tr key={l.chave} className={`cursor-pointer hover:bg-[#e8eef6] ${i % 2 === 1 ? 'bg-[#F5F4F0]' : 'bg-white'}`}
                data-despesa={l.compromisso.componente ?? ''} data-tipo={l.tipo}
                title={l.tituloId ? 'Abrir o lançamento no Financeiro' : 'Abrir o compromisso'}
                onClick={() => onAbrir(l)}>
                <td className={`${TD_DATA} ${l.vencimento ? '' : 'text-muted-foreground'}`}>{dataCurtaDespesa(l.vencimento)}</td>
                <td className={`${TD_DATA} ${l.pagamento ? '' : 'text-muted-foreground'}`}>{dataCurtaDespesa(l.pagamento)}</td>
                <td className={TDQ} title={l.descricao ?? undefined} data-celula="descricao">{l.descricao ?? '—'}</td>
                <td className={TDQ} title={favorecido ?? undefined} data-celula="favorecido">{favorecido ?? '—'}</td>
                <td className={TDQ} title={conta?.inteiro} data-celula="conta">{conta?.curto ?? '—'}</td>
                <td className={`${TDQ} ${DV} ${banco ? '' : 'text-center text-muted-foreground'}`} title={banco ?? undefined} data-celula="banco">{banco ?? '—'}</td>
                <td className={`${TD} text-center`}><PilulaStatusDespesa status={l.status} /></td>
                <td className={`${TD} text-right ${NEG}`}>{num2(l.valor)}</td>
                <td className={TD_MENU} onClick={e => e.stopPropagation()}>{menu(l)}</td>
              </tr>
            );
          })}
          {linhas.length === 0 && (
            <tr><td colSpan={9} className={`${TD} py-3 text-center text-muted-foreground`}>Nenhuma despesa nesta operação.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className={tf} colSpan={5}>{linhas.length === 1 ? '1 despesa' : `${linhas.length} despesas`}</td>
            <td className={`${tf} ${DV}`} />
            <td className={tf} />
            <td className={`${tf} text-right ${NEG}`} data-testid="despesas-total">{num2(total)}</td>
            <td className={tf} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
