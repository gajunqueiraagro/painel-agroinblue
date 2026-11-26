/**
 * LANC-FILTROS-02a (Gabriel 25/11, mock lancamentos-filtros-ref/mock-aprovado.html) — o RESUMO da lista de Lançamentos, abaixo dos filtros,
 * em DOIS blocos com rótulo vertical:
 *   · Caixa — Entradas · Saídas · Transferências · Resultado;
 *   · A pagar — Documentos prontos "x de y" + barra · Faltando · N lanç. (D4) · Aprovação (D3: "—", com "sem BPO" quando o cliente não tem).
 * ⚠ OS NÚMEROS SÃO DO BANCO: os `totais` e o `pronto_pagar` da `fn_fin_v2_lista_pagina` (a mesma resposta da grade). O Resultado é
 *   Entradas − Saídas desses dois números (a tela não soma lançamento nenhum). Sem a resposta, "—" (nunca zero inventado).
 * ⚠ LAYOUT NÃO DEPENDE DO DADO: colunas de LARGURA FIXA (frações da grade, `minmax(0, …)`), valor numa linha só; o número inteiro vai no
 *   `title`. A soma das duas caixas é a largura da tela — um valor de 9 dígitos não empurra nada.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { TotaisDaListaV2 } from '@/lib/financeiro/totaisDaListaV2';
import type { ResumoPronto } from '@/lib/financeiro/prontoParaPagar';

/** O bloco Caixa a partir dos totais do banco (`saidas` vem positiva, pelo `abs`). Nulo = sem resposta. */
export function caixaDoResumo(t: Pick<TotaisDaListaV2, 'entradas' | 'saidas' | 'transferencias'> | null):
  { entradas: number; saidas: number; transferencias: number; resultado: number } | null {
  if (!t) return null;
  return { entradas: t.entradas, saidas: -Math.abs(t.saidas), transferencias: t.transferencias, resultado: t.entradas - Math.abs(t.saidas) };
}

/** O bloco A pagar a partir do `pronto_pagar` do banco. Nulo = o banco não mandou. */
export function aPagarDoResumo(p: ResumoPronto | null): { prontos: number; total: number; faltando: number; faltandoValor: number; fracaoPronta: number } | null {
  if (!p) return null;
  const total = p.prontos + p.faltando;
  return { prontos: p.prontos, total, faltando: p.faltando, faltandoValor: p.faltandoValor, fracaoPronta: total > 0 ? p.prontos / total : 0 };
}

/** A cor do valor: negativo vermelho, positivo verde, zero cinza. */
export const corDoValor = (v: number) => (v < 0 ? 'text-[#c03030]' : v > 0 ? 'text-[#1f8a3e]' : 'text-[#8b96aa]');

/** O valor em reais com o sinal de menos tipográfico (−R$ 1,00), como no mock. */
export const moedaComSinal = (v: number) => (v < 0 ? `−${formatMoeda(Math.abs(v))}` : formatMoeda(v));

function Card({ rotulo, valor, cor, title, testid, children }: { rotulo: ReactNode; valor: ReactNode; cor?: string; title?: string; testid: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden whitespace-nowrap border-r border-[#eef1f5] px-2 py-[3px] last:border-r-0" data-testid={testid} title={title}>
      <span className="block text-[10px] leading-[13px] text-[#5b6577]">{rotulo}</span>
      <b className={cn('block text-[11.5px] leading-[15px] tabular-nums', cor)} data-testid={`${testid}-valor`}>{valor}</b>
      {children}
    </div>
  );
}

function Bloco({ rotulo, colunas, testid, children }: { rotulo: string; colunas: string; testid: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 overflow-hidden rounded-[10px] border border-[#c5cdd9] bg-white" style={{ gridTemplateColumns: colunas }} data-testid={testid}>
      <span className="flex items-center justify-center border-r border-[#e3e7ee] bg-[#f3f5f8] text-[9.5px] text-[#5b6577] [writing-mode:vertical-rl] rotate-180">{rotulo}</span>
      {children}
    </div>
  );
}

export function ResumoDaListaV2({ totais, pronto, bpoAtivo, peloExtrato }: {
  totais: Pick<TotaisDaListaV2, 'entradas' | 'saidas' | 'transferencias'> | null;
  pronto: ResumoPronto | null;
  bpoAtivo: boolean;
  /** o atalho "pelo extrato" do Faltando (FORN-FORMA-PELO-EXTRATO-01), sempre desenhado */
  peloExtrato: ReactNode;
}) {
  const c = caixaDoResumo(totais);
  const p = aPagarDoResumo(pronto);
  const v = (n: number | undefined) => (n === undefined ? '—' : moedaComSinal(n));
  return (
    /* de 1100px para cima, os dois blocos numa linha (o mock, a 1126/1280/1366); abaixo, um sobre o outro — 9 dígitos não cabem em
       4 colunas de 1024 (gate: −R$ 301.361.003,58 passava 7,6px). A largura decide, nunca o dado. */
    <div className="grid shrink-0 grid-cols-1 gap-1 min-[1100px]:grid-cols-[4fr_2.75fr]" data-testid="resumo-da-lista">
      <Bloco rotulo="Caixa" colunas="18px repeat(4, minmax(0, 1fr))" testid="resumo-caixa">
        <Card rotulo="Entradas" valor={v(c?.entradas)} cor={c ? corDoValor(c.entradas) : undefined} title={c ? moedaComSinal(c.entradas) : undefined} testid="resumo-entradas" />
        <Card rotulo="Saídas" valor={v(c?.saidas)} cor={c ? corDoValor(c.saidas) : undefined} title={c ? moedaComSinal(c.saidas) : undefined} testid="resumo-saidas" />
        <Card rotulo="Transferências" valor={v(c?.transferencias)} cor="text-[#8b96aa]" testid="resumo-transferencias"
          title="Transferências entre contas do próprio cliente: não são entrada nem saída do caixa, por isso ficam fora do Resultado." />
        <Card rotulo="Resultado" valor={v(c?.resultado)} cor={c ? corDoValor(c.resultado) : undefined} title="Entradas − Saídas" testid="resumo-resultado" />
      </Bloco>
      <Bloco rotulo="A pagar" colunas="18px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.75fr)" testid="resumo-a-pagar">
        <Card rotulo="Documentos prontos" valor={p ? `${p.prontos.toLocaleString('pt-BR')} de ${p.total.toLocaleString('pt-BR')}` : '—'} testid="resumo-prontos"
          title="Saídas ainda a pagar neste recorte com o que a forma de pagamento precisa (boleto ligado, chave PIX, dados bancários).">
          <span className="mt-[2px] flex h-[5px] w-full max-w-[120px] overflow-hidden rounded-[3px] bg-[#eef1f5]" aria-hidden>
            {p && p.total > 0 && <>
              <i className="h-full bg-[#1f8a3e]" style={{ width: `${p.fracaoPronta * 100}%` }} />
              <i className="h-full bg-[#e0a024]" style={{ width: `${(1 - p.fracaoPronta) * 100}%` }} />
            </>}
          </span>
        </Card>
        {/* o "pelo extrato" na 3ª linha, como a barra dos prontos (na linha do rótulo ele passava da caixa: gate 1126/1280) */}
        <Card rotulo={`Faltando · ${p ? p.faltando.toLocaleString('pt-BR') : '—'} lanç.`}
          valor={p ? moedaComSinal(p.faltandoValor) : '—'} cor={p && p.faltando > 0 ? 'text-[#a86a00]' : 'text-[#8b96aa]'} testid="resumo-faltando"
          title="Saídas a pagar em que falta algo: a forma, o boleto, a chave PIX ou os dados bancários.">
          <span className="block h-[13px] text-[10px] leading-[13px]">{peloExtrato}</span>
        </Card>
        <Card rotulo="Aprovação" cor="text-[#8b96aa]" testid="resumo-aprovacao"
          valor={<>—{!bpoAtivo && <small className="ml-1 text-[10px] font-normal text-[#5b6577]">sem BPO</small>}</>}
          title={bpoAtivo ? 'A contagem da aprovação entra no LANC-FILTROS-02b (a tela Aprovar pagamentos mostra a fila).' : 'Este cliente não usa a aprovação do BPO.'} />
      </Bloco>
    </div>
  );
}
