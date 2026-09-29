import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { parseNumericValue } from '@/lib/calculos/abate';
import { rotuloDaConta } from '@/lib/financeiro/rotuloConta';
import {
  barraDaDiferenca, contaComNumero, corDoSaldo, dataCurta, efeitoNoSaldo, rotuloDoSaldo, rotuloExplicacao, rotuloRecebimento,
  totalDoRascunho, ROTULO_STATUS, TIPOS_EXPLICACAO_DO_LADO,
  type DespesaOperacao, type LadoContaCorrente, type LinhaContaCorrente, type TipoExplicacao,
} from '@/lib/oc/contaCorrente';
import type {
  ContaParaExplicacao, ExplicacaoRascunho, LoteParaAjuste, OcContaCorrenteApi, RecebimentoVinculavel,
} from '@/hooks/useOcContaCorrente';

/* OC-VENDA-ENTREGAS-01c — a aba Financeiro da venda no modelo CONTA CORRENTE, em formato de EXTRATO LIDO PELO CAIXA DA FAZENDA
   (mock docs/mocks/oc_conta_corrente_mock_v7.html, ADR-2026-21): recebimento soma (verde), entrega abate (vermelho), explicacao
   soma quando reduz o que falta receber; o Saldo corre linha a linha — negativo falta receber, positivo adiantado, zero quitado.
   O saldo e' do banco (`oc_conta_corrente`); esta tela nao soma nada.
   ⚠ PADRAO DE TABELA (regra permanente, 28/09/2026): 10px nas linhas, 9,5px no cabecalho, linha de 18px, datas dd/mm/aa; cabecalho
     navy nos dois niveis; cards, titulo, cabecalho, Total e barra congelados — so' as linhas rolam; uma informacao por coluna;
     divisor vertical entre grupos; fundo por tipo de linha; cor pelo sinal; cabecalho centralizado, numero a direita; nada truncado.
   ⚠ D6: status e' o que o dado diz ("sem conta" em ambar), nunca um "conciliado" inventado.
   ⚠ RECUSA AO LADO DO BOTAO, nunca em toast (UX-TOAST-01); motivo obrigatorio em vermelho inline (UX-OBRIGATORIOS-01). */

const TH = 'sticky h-[17px] whitespace-nowrap bg-[#2E4B6E] px-[4px] text-center text-[9.5px] font-semibold text-white';
const THG = 'sticky top-0 z-20 h-[17px] whitespace-nowrap bg-primary px-[4px] text-center text-[9.5px] font-semibold text-white';
const TD = 'h-[18px] whitespace-nowrap border-b border-[#eceae4] px-[4px] text-[10px]';
const NUM = `${TD} text-right tabular-nums`;
const DV = 'border-l-2 border-l-[#9aa7b6]';
const TF = 'sticky bottom-0 z-10 h-[19px] whitespace-nowrap border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[4px] text-[10px] tabular-nums';
const COR = { neg: 'text-[#b91c1c]', pos: 'text-[#15803d]', zero: '' };
const FUNDO: Record<LinhaContaCorrente['tipo'], string> = {
  entrega: 'bg-white', recebimento: 'bg-[#EAF1F9]', explicacao: 'bg-[#fffbeb]',
};
const BOTAO = 'h-[22px] px-[9px] text-[10px] font-medium';

const rotuloCategoria = (slug: string | null) => (slug ? (CATEGORIAS.find(c => c.value === slug)?.label ?? slug) : '—');
/* Valor de tabela como no mock v7: sem "R$" (a coluna ja diz que e' dinheiro) e com o sinal de menos tipografico. */
const num2 = (v: number) => {
  const t = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(v * 100) < 0 ? `\u2212${t}` : t;
};
const moeda = (v: number | null) => (v === null ? '' : num2(v));

/* OC-CONTA-CORRENTE-TODOS-01a — os textos de cada lado (mock oc_conta_corrente_compra_abate_mock_v1). A venda fala do comprador e
   da entrega; a compra, do fornecedor e da entrada do gado. O extrato da compra e' o ESPELHO do da venda: entrada positiva, pagamento
   negativo, saldo positivo = falta pagar. O sinal vem do banco (`oc_conta_corrente` ja' o vira); aqui so' os rotulos e os totais. */
const TEXTOS: Record<LadoContaCorrente, {
  cardEntrega: string; cardDinheiro: string; titulo: string; buscar: string; programar: string; grupoSaldo: string;
  colEntrega: string; colDinheiro: string; vazio: string; seloEntrega: string; seloDinheiro: string; verbo: string;
  pendente1: string; pendenteN: (n: number) => string; atualizar: string;
}> = {
  venda: {
    cardEntrega: 'Entregue · vai para o DRE', cardDinheiro: 'Recebido · caixa', titulo: 'Conta corrente do comprador',
    buscar: '+ Buscar recebimento no Financeiro', programar: '+ Programar recebimento futuro', grupoSaldo: 'Comprador',
    colEntrega: 'Entrega (DRE)', colDinheiro: 'Recebido (caixa)', vazio: 'Nenhuma entrega nem recebimento ainda.',
    seloEntrega: 'Entrega', seloDinheiro: 'Recebimento', verbo: 'Venda',
    pendente1: '1 saída ainda não virou entrega no financeiro.', pendenteN: n => `${n} saídas ainda não viraram entrega no financeiro.`,
    atualizar: 'Atualizar entregas',
  },
  compra: {
    cardEntrega: 'Entrada do gado · custo no DRE', cardDinheiro: 'Pago · caixa', titulo: 'Conta corrente do fornecedor',
    buscar: '+ Buscar pagamento no Financeiro', programar: '+ Programar pagamento futuro', grupoSaldo: 'Fornecedor',
    colEntrega: 'Entrada (DRE)', colDinheiro: 'Pago (caixa)', vazio: 'Nenhuma entrada nem pagamento ainda.',
    seloEntrega: 'Entrada', seloDinheiro: 'Pagamento', verbo: 'Compra',
    pendente1: '1 entrada de gado ainda não virou lançamento no financeiro.',
    pendenteN: n => `${n} entradas de gado ainda não viraram lançamento no financeiro.`,
    atualizar: 'Atualizar entradas',
  },
};

interface Props {
  api: OcContaCorrenteApi;
  somenteLeitura: boolean;
  /** De que lado a conta corrente fala. Padrao: venda (a tela de antes, sem nenhuma mudanca). */
  lado?: LadoContaCorrente;
}

export function AbaContaCorrenteOC({ api, somenteLeitura, lado = 'venda' }: Props) {
  const cc = api.contaCorrente;
  const t = TEXTOS[lado];
  /* sinal da coluna da entrega no total: a venda mostra o gado que saiu negativo; a compra, o que entrou positivo */
  const sinalEntrega = lado === 'compra' ? 1 : -1;
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<'buscar' | 'programar' | 'explicar' | null>(null);

  if (!cc) {
    return (
      <div className="py-10 text-center text-[11px] text-muted-foreground">
        {api.erro ? <span className="text-destructive" role="alert">{api.erro}</span> : 'Carregando…'}
      </div>
    );
  }

  const barra = barraDaDiferenca(cc, lado);
  const corSaldo = corDoSaldo(cc.saldo);
  const atualizarEntregas = async () => {
    setErroAcao(null);
    const erro = await api.sincronizarEntregas();
    if (erro) setErroAcao(erro);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-[5px]" data-testid="conta-corrente-oc">
      <div className="grid flex-none grid-cols-3 gap-[5px]">
        <Card rotulo={t.cardEntrega} valor={cc.entregue} cor={COR.pos} testid={lado === 'compra' ? 'card-entrega' : undefined} />
        <Card rotulo={t.cardDinheiro} valor={-sinalEntrega * cc.recebido} cor={lado === 'compra' ? COR.neg : COR.pos} testid={lado === 'compra' ? 'card-dinheiro' : undefined} />
        <Card rotulo={rotuloDoSaldo(cc.saldo, lado)} valor={cc.saldo} cor={COR[corSaldo]} destaque={corSaldo !== 'zero'} testid="card-saldo" />
      </div>

      {cc.saidasSemEntrega > 0 && (
        <div className="flex flex-none items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 text-[10.5px] text-amber-800">
          <span>{cc.saidasSemEntrega === 1 ? t.pendente1 : t.pendenteN(cc.saidasSemEntrega)}</span>
          <Button type="button" size="sm" className={`${BOTAO} ml-auto`} disabled={somenteLeitura || api.ocupado} onClick={atualizarEntregas}>
            {t.atualizar}
          </Button>
        </div>
      )}

      <div className="flex flex-none items-center gap-1.5">
        <span className="text-[10.5px] font-semibold">{t.titulo}</span>
        <span className="ml-auto flex gap-[5px]">
          <Button type="button" variant="outline" size="sm" className={BOTAO} disabled={somenteLeitura || api.ocupado}
            onClick={() => { setErroAcao(null); setDialogo('buscar'); }}>
            {t.buscar}
          </Button>
          <Button type="button" variant="outline" size="sm" className={BOTAO} disabled={somenteLeitura || api.ocupado}
            onClick={() => { setErroAcao(null); setDialogo('programar'); }}>
            {t.programar}
          </Button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border" data-testid="conta-corrente-rolagem">
        <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums" data-testid="conta-corrente-tabela">
          <colgroup>
            {/* Larguras MEDIDAS no modal (1024px por decisao do MODAIS-PADRAO-01b; a tabela tem 766): pior texto de cada coluna +
                8 de padding, com o total em negrito. A Descricao leva o resto. ⚠ Por isso a Conta vai SEM o numero do plano:
                com ele, "1120 Venda de Desmama Machos" pedia 171px e a linha nao cabia sem quebrar ou cortar numero. */}
            <col style={{ width: 56 }} /><col style={{ width: 28 }} /><col style={{ width: 30 }} /><col style={{ width: 80 }} />
            <col /><col style={{ width: 148 }} /><col style={{ width: 58 }} />
            <col style={{ width: 84 }} /><col style={{ width: 86 }} /><col style={{ width: 88 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={THG} colSpan={7}>Evento</th>
              <th className={`${THG} ${DV}`} colSpan={2}>Movimento</th>
              <th className={`${THG} ${DV}`}>{t.grupoSaldo}</th>
            </tr>
            <tr>
              {['Data', 'Lote', 'Cab', 'Evento', 'Descrição', 'Conta', 'Banco'].map(h => (
                <th key={h} className={`${TH} top-[17px] z-20`}>{h}</th>
              ))}
              <th className={`${TH} top-[17px] z-20 ${DV}`}>{t.colEntrega}</th>
              <th className={`${TH} top-[17px] z-20`}>{t.colDinheiro}</th>
              <th className={`${TH} top-[17px] z-20 ${DV}`}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {cc.linhas.map(l => <LinhaExtrato key={l.parteId} l={l} linhas={cc.linhas} lado={lado} />)}
            {cc.linhas.length === 0 && (
              <tr><td colSpan={10} className={`${TD} py-4 text-center text-muted-foreground`}>{t.vazio}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className={TF}>Total</td>
              <td className={TF} />
              <td className={`${TF} text-right`}>{cc.cabEntregue}</td>
              <td className={TF} colSpan={4} />
              <td className={`${TF} text-right ${lado === 'compra' ? COR.pos : COR.neg} ${DV}`}>{num2(sinalEntrega * cc.entregue)}</td>
              <td className={`${TF} text-right ${lado === 'compra' ? COR.neg : COR.pos}`}>{num2(-sinalEntrega * cc.recebido)}</td>
              <td className={`${TF} text-right ${COR[corSaldo]} ${DV}`} data-testid="total-saldo">{num2(cc.saldo)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {barra && (
        <div className="flex h-6 flex-none items-center gap-2 rounded border border-[#fde68a] bg-[#fffbeb] px-2 text-[10.5px]" data-testid="barra-diferenca">
          <b>{barra.frase}</b>
          <span className="text-muted-foreground">A OC fecha mesmo assim; o saldo fica pendente até ser explicado.</span>
          <Button type="button" size="sm" className={`${BOTAO} ml-auto`} disabled={somenteLeitura || api.ocupado}
            onClick={() => { setErroAcao(null); setDialogo('explicar'); }}>
            Explicar diferença
          </Button>
        </div>
      )}
      {/* A compra mostra o "Quitado." do mock mesmo sem explicacao (o botao de explicar fica a' mao); a venda segue como era. */}
      {!barra && lado === 'compra' && cc.explicacoes.length === 0 && cc.linhas.some(l => l.tipo === 'entrega') && (
        <div className="flex h-6 flex-none items-center gap-2 rounded border border-[#bbf7d0] bg-[#f0fdf4] px-2 text-[10.5px]" data-testid="barra-quitado">
          <b>Quitado.</b>
          <span className="text-muted-foreground">Com saldo positivo aparece "Falta pagar"; negativo, "Adiantado ao fornecedor".</span>
          <Button type="button" variant="outline" size="sm" className={`${BOTAO} ml-auto`} disabled={somenteLeitura || api.ocupado}
            onClick={() => { setErroAcao(null); setDialogo('explicar'); }}>
            Explicar diferença
          </Button>
        </div>
      )}
      {!barra && cc.explicacoes.length > 0 && (
        <div className="flex h-6 flex-none items-center gap-2 rounded border border-[#bbf7d0] bg-[#f0fdf4] px-2 text-[10.5px]">
          <b>Diferença explicada.</b>
          <Button type="button" variant="outline" size="sm" className={`${BOTAO} ml-auto`} disabled={somenteLeitura || api.ocupado}
            onClick={() => { setErroAcao(null); setDialogo('explicar'); }}>
            Ver explicação
          </Button>
        </div>
      )}

      {/* OC-CRIAR-DO-LEGADO-01b: as despesas aparecem tambem na venda (a comissao do modal antigo ligada a' OC criada do legado).
          Sem despesa, o quadro nao aparece — a venda de sempre fica igual. */}
      <QuadroDespesas despesas={cc.despesas} />

      {erroAcao && <div className="flex-none text-[10px] text-destructive" role="alert">{erroAcao}</div>}

      {dialogo === 'buscar' && <DialogoBuscarRecebimento api={api} lado={lado} onFechar={() => setDialogo(null)} />}
      {dialogo === 'programar' && (
        <DialogoProgramarRecebimento api={api} lado={lado} onFechar={() => setDialogo(null)}
          sugerido={lado === 'compra' ? (cc.saldo > 0 ? cc.saldo : null) : (cc.saldo < 0 ? -cc.saldo : null)} />
      )}
      {dialogo === 'explicar' && <DialogoExplicarDiferenca api={api} somenteLeitura={somenteLeitura} lado={lado} onFechar={() => setDialogo(null)} />}
    </div>
  );
}

function Card({ rotulo, valor, cor, destaque, testid }: { rotulo: string; valor: number; cor: string; destaque?: boolean; testid?: string }) {
  return (
    <div className={`flex h-6 items-center justify-between rounded border px-[7px] ${destaque ? 'border-[#fde68a] bg-[#fffbeb]' : ''}`} data-testid={testid}>
      <span className="text-[9.5px] text-muted-foreground">{rotulo}</span>
      <span className={`text-[11.5px] font-bold tabular-nums ${cor}`}>{formatMoeda(valor)}</span>
    </div>
  );
}

/* ─── Despesas da operacao (compra e venda): pagas a terceiros, fora do saldo — o quadro de baixo do mock ─── */
function QuadroDespesas({ despesas }: { despesas: readonly DespesaOperacao[] }) {
  if (despesas.length === 0) return null;
  return (
    <div className="flex-none" data-testid="despesas-operacao">
      <div className="mb-[3px] text-[10.5px] font-semibold">Despesas da operação · pagas a terceiros, fora do saldo</div>
      <div className="rounded border">
        <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
          {/* a Conta fica com o que sobra: com 170px ela nao cabia "Investimento Frete/Comissão Compra Bovinos" e invadia o Valor
              (visto na 1337bb2d) — a celula nao quebra, e' uma linha por registro (A31) */}
          <colgroup><col style={{ width: 58 }} /><col style={{ width: 58 }} /><col style={{ width: 170 }} /><col style={{ width: 180 }} /><col /><col style={{ width: 84 }} /></colgroup>
          <thead>
            <tr>{['Comp.', 'Pgto.', 'Descrição', 'Favorecido', 'Conta', 'Valor'].map(h => <th key={h} className={`${THG} static`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {despesas.map((d, i) => (
              <tr key={d.parteId} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F5F4F0]'} data-despesa={d.componente ?? ''}>
                <td className={`${TD} text-center`}>{dataCurta(d.competencia)}</td>
                <td className={`${TD} text-center`}>{dataCurta(d.pagamento)}</td>
                <td className={`${TD} whitespace-normal break-words`}>{d.descricao ?? '—'}</td>
                <td className={`${TD} whitespace-normal break-words`}>{d.favorecido ?? '—'}</td>
                <td className={`${TD} whitespace-normal break-words`} title={contaComNumero(d.contaOrdem, d.conta)}>{rotuloDaConta(d.conta) ?? '—'}</td>
                <td className={`${NUM} ${COR[corDoSaldo(d.valor)]}`}>{num2(d.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Selo({ tipo, lado }: { tipo: LinhaContaCorrente['tipo']; lado: LadoContaCorrente }) {
  const estilo = tipo === 'entrega' ? 'bg-[#f0fdf4] text-[#15803d]' : tipo === 'recebimento' ? 'bg-[#dbe7f6] text-[#1d4ed8]' : 'bg-[#fde68a] text-[#b45309]';
  const texto = tipo === 'entrega' ? TEXTOS[lado].seloEntrega : tipo === 'recebimento' ? TEXTOS[lado].seloDinheiro : 'Explicação';
  return <span className={`rounded-[3px] px-[5px] text-[9.5px] font-semibold ${estilo}`}>{texto}</span>;
}

function LinhaExtrato({ l, linhas, lado }: { l: LinhaContaCorrente; linhas: readonly LinhaContaCorrente[]; lado: LadoContaCorrente }) {
  const descricao = l.tipo === 'entrega' ? `${TEXTOS[lado].verbo} ${rotuloCategoria(l.categoria)}`
    : l.tipo === 'recebimento' ? rotuloRecebimento(linhas, l.parteId, lado)
    : (l.subtipo ? rotuloExplicacao(l.subtipo, lado) : 'Explicação');
  const banco = l.tipo === 'recebimento' || l.subtipo === 'devolucao_comprador'
    ? (l.banco ?? (l.status === 'programado' ? ROTULO_STATUS.programado : ROTULO_STATUS.sem_conta_bancaria))
    : '';
  const bancoAmbar = !l.banco && (l.tipo === 'recebimento' || l.subtipo === 'devolucao_comprador');
  const cSaldo = corDoSaldo(l.saldo);
  return (
    <tr className={FUNDO[l.tipo]} data-tipo={l.tipo} data-status={l.status}>
      <td className={`${TD} text-center`}>{dataCurta(l.data)}</td>
      <td className={`${TD} text-center`}>{l.loteOrdem ?? ''}</td>
      <td className={`${NUM}`}>{l.cab ?? ''}</td>
      <td className={`${TD} text-center`}><Selo tipo={l.tipo} lado={lado} /></td>
      <td className={`${TD} whitespace-normal break-words`}>{descricao}</td>
      <td className={`${TD} whitespace-normal break-words`} title={contaComNumero(l.contaOrdem, l.conta)}>{rotuloDaConta(l.conta) ?? '—'}</td>
      <td className={`${TD} text-center ${bancoAmbar ? 'text-[#b45309]' : ''}`}>{banco}</td>
      <td className={`${NUM} ${DV} ${COR[corDoSaldo(l.movEntrega)]}`}>{moeda(l.movEntrega)}</td>
      <td className={`${NUM} ${l.noSaldo ? COR[corDoSaldo(l.movRecebido)] : 'text-muted-foreground'}`}>{moeda(l.movRecebido)}</td>
      <td className={`${NUM} ${DV} font-bold ${COR[cSaldo]}`}>{num2(l.saldo)}</td>
    </tr>
  );
}

/* ─── Buscar recebimento no Financeiro (vincular recebimento ja lancado) ─── */
function DialogoBuscarRecebimento({ api, lado, onFechar }: { api: OcContaCorrenteApi; lado: LadoContaCorrente; onFechar: () => void }) {
  const compra = lado === 'compra';
  const [itens, setItens] = useState<RecebimentoVinculavel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const { listarVinculaveis } = api;

  useEffect(() => {
    let vivo = true;
    void listarVinculaveis().then(r => { if (vivo) { setItens(r.itens); setErro(r.erro); } });
    return () => { vivo = false; };
  }, [listarVinculaveis]);

  const faltaMotivo = tentou && !motivo.trim();
  const faltaEscolha = tentou && !escolhido;
  const vincular = async () => {
    setTentou(true);
    if (!escolhido || !motivo.trim()) return;
    const e = await api.vincularRecebimento(escolhido, motivo);
    if (e) { setErro(e); return; }
    onFechar();
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="text-[12px]">{compra ? 'Buscar pagamento no Financeiro' : 'Buscar recebimento no Financeiro'}</DialogTitle></DialogHeader>
        <div className="text-[10px] text-muted-foreground">
          {compra
            ? 'O lançamento fica na conta da compra e sai do DRE pela OC (o custo entrou pela entrada do gado). Valor, datas, conta bancária e conciliação não mudam.'
            : 'O lançamento fica na conta da venda e sai do DRE pela OC (a receita entrou pela entrega). Valor, datas, conta bancária e conciliação não mudam.'}
        </div>
        <div className="max-h-[50vh] overflow-auto rounded border">
          <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
            <colgroup><col style={{ width: 28 }} /><col style={{ width: 62 }} /><col /><col style={{ width: 180 }} /><col style={{ width: 90 }} /><col style={{ width: 96 }} /></colgroup>
            <thead>
              <tr>
                <th className={`${THG}`} /><th className={THG}>Pagamento</th><th className={THG}>Descrição</th>
                <th className={THG}>Conta atual</th><th className={THG}>Banco</th><th className={THG}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens === null && <tr><td colSpan={6} className={`${TD} text-center text-muted-foreground`}>Carregando…</td></tr>}
              {itens?.length === 0 && <tr><td colSpan={6} className={`${TD} text-center text-muted-foreground`}>{compra ? 'Nenhuma saída do cliente disponível para vincular.' : 'Nenhuma entrada do cliente disponível para vincular.'}</td></tr>}
              {itens?.map(r => (
                <tr key={r.lancamentoId} className={`cursor-pointer ${escolhido === r.lancamentoId ? 'bg-primary/10' : 'bg-white'}`}
                  onClick={() => setEscolhido(r.lancamentoId)} data-lancamento={r.lancamentoId}>
                  <td className={`${TD} text-center`}>
                    <input type="radio" aria-label={`Escolher ${r.descricao ?? r.lancamentoId}`} checked={escolhido === r.lancamentoId}
                      onChange={() => setEscolhido(r.lancamentoId)} />
                  </td>
                  <td className={`${TD} text-center`}>{dataCurta(r.data)}</td>
                  <td className={`${TD} whitespace-normal break-words`}>{r.descricao ?? '—'}{!r.mesmoFavorecido ? ' · outro favorecido' : ''}</td>
                  <td className={`${TD} whitespace-normal break-words`}>{rotuloDaConta(r.subcentro) ?? '—'}</td>
                  <td className={`${TD} text-center ${r.semContaBancaria ? 'text-[#b45309]' : ''}`}>{r.conciliado ? 'conciliado' : (r.semContaBancaria ? 'sem conta' : (r.status ?? '—'))}</td>
                  <td className={`${NUM} ${compra ? COR.neg : COR.pos}`}>{formatMoeda(compra ? -r.valor : r.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {faltaEscolha && <div className="text-[10px] text-destructive">{compra ? 'Escolha o pagamento.' : 'Escolha o recebimento.'}</div>}
        <CampoMotivo id="motivo-buscar-recebimento" valor={motivo} onChange={setMotivo} falta={faltaMotivo} />
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto text-[10px] text-destructive" role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className={BOTAO} disabled={api.ocupado} onClick={vincular}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampoMotivo({ id, valor, onChange, falta }: { id: string; valor: string; onChange: (v: string) => void; falta: boolean }) {
  return (
    <div>
      <label className="text-[10px] font-medium" htmlFor={id}>Motivo *</label>
      <Textarea id={id} value={valor} onChange={e => onChange(e.target.value)} rows={2}
        className={`text-[11px] ${falta ? 'border-destructive' : ''}`} />
      {falta && <div className="text-[10px] text-destructive">Informe o motivo.</div>}
    </div>
  );
}

/* ─── Programar recebimento futuro: compromisso sem lote na conta da OC (a categoria do lote de maior valor), fora do DRE ─── */
function DialogoProgramarRecebimento({ api, lado, sugerido, onFechar }: { api: OcContaCorrenteApi; lado: LadoContaCorrente; sugerido: number | null; onFechar: () => void }) {
  const compra = lado === 'compra';
  const [valor, setValor] = useState(sugerido ? sugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  const [vencimento, setVencimento] = useState('');
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const v = parseNumericValue(valor);
  const faltaValor = tentou && !(v > 0);
  const faltaVenc = tentou && !vencimento;
  const salvar = async () => {
    setTentou(true);
    if (!(v > 0) || !vencimento) return;
    const e = await api.programarRecebimento(v, vencimento);
    if (e) { setErro(e); return; }
    onFechar();
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-[12px]">{compra ? 'Programar pagamento futuro' : 'Programar recebimento futuro'}</DialogTitle></DialogHeader>
        <div className="text-[10px] text-muted-foreground">
          {compra
            ? 'Nasce um pagamento programado na conta da compra (a do lote de maior valor), fora do DRE. Ele entra no saldo quando for pago.'
            : 'Nasce um recebimento programado na conta da venda (a do lote de maior valor), fora do DRE. Ele entra no saldo quando for pago.'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium" htmlFor="valor-programar">Valor *</label>
            <Input id="valor-programar" value={valor} onChange={e => setValor(e.target.value)} className={`h-7 text-right text-[11px] ${faltaValor ? 'border-destructive' : ''}`} />
            {faltaValor && <div className="text-[10px] text-destructive">Informe o valor.</div>}
          </div>
          <div>
            <span className="text-[10px] font-medium">Vencimento *</span>
            <DatePicker value={vencimento} onChange={setVencimento} size="compact" className={faltaVenc ? 'border-destructive' : ''} />
            {faltaVenc && <div className="text-[10px] text-destructive">Informe o vencimento.</div>}
          </div>
        </div>
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto text-[10px] text-destructive" role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className={BOTAO} disabled={api.ocupado} onClick={salvar}>Programar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Explicar diferenca (mock v7): uma linha por explicacao; salvas, viram linhas ambar no extrato ─── */
interface Rascunho { chave: number; tipo: TipoExplicacao; valor: string; loteId: string; contaId: string; motivo: string; vencimento: string }

export function DialogoExplicarDiferenca({ api, somenteLeitura, lado = 'venda', onFechar }: {
  api: OcContaCorrenteApi; somenteLeitura: boolean; lado?: LadoContaCorrente; onFechar: () => void;
}) {
  const TIPOS = TIPOS_EXPLICACAO_DO_LADO[lado];
  const cc = api.contaCorrente;
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([]);
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lotes, setLotes] = useState<LoteParaAjuste[]>([]);
  const [contasSaida, setContasSaida] = useState<ContaParaExplicacao[]>([]);
  const [contasEntrada, setContasEntrada] = useState<ContaParaExplicacao[]>([]);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [motivoRemover, setMotivoRemover] = useState('');
  const [tentouRemover, setTentouRemover] = useState(false);
  const { listarLotes, listarContas } = api;

  useEffect(() => {
    let vivo = true;
    void listarLotes().then(l => { if (vivo) setLotes(l); });
    void listarContas('2-Saídas').then(c => { if (vivo) setContasSaida(c); });
    void listarContas('1-Entradas').then(c => { if (vivo) setContasEntrada(c); });
    return () => { vivo = false; };
  }, [listarLotes, listarContas]);

  if (!cc) return null;
  const itens: ExplicacaoRascunho[] = rascunhos.map(r => ({
    tipo: r.tipo, valor: parseNumericValue(r.valor), loteId: r.loteId || null, planoContaId: r.contaId || null,
    motivo: r.motivo, vencimento: r.vencimento || null,
  }));
  const explicadoRascunho = totalDoRascunho(itens, lado);
  const explicadoTotal = Math.round((cc.explicado + explicadoRascunho) * 100) / 100;
  const falta = Math.round((cc.saldoAExplicar + explicadoTotal) * 100) / 100;

  /* TODOS os campos que faltam na linha, nao so' o primeiro: cada um fica vermelho (UX-OBRIGATORIOS-01). */
  const pendencias = (r: Rascunho): string[] => [
    ...(r.tipo === 'ajuste_preco' && !r.loteId ? ['lote'] : []),
    ...((r.tipo === 'permuta_despesa' || r.tipo === 'outra_receita') && !r.contaId ? ['conta'] : []),
    ...(r.tipo === 'devolucao_comprador' && !r.vencimento ? ['vencimento'] : []),
    ...(!r.motivo.trim() ? ['motivo'] : []),
    ...(!(parseNumericValue(r.valor) > 0) ? ['valor'] : []),
  ];
  const faltando = rascunhos.flatMap(r => pendencias(r));
  const adicionar = (tipo: TipoExplicacao) => {
    /* o valor nasce com o que falta explicar, no sinal do tipo — valor sugerido e' valor aceito, e fica marcado em ambar */
    const sugerido = efeitoNoSaldo(tipo, 1, lado) > 0 ? Math.max(0, -falta) : Math.max(0, falta);
    setRascunhos(prev => [...prev, { chave: Date.now() + prev.length, tipo, valor: sugerido > 0 ? sugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
      loteId: '', contaId: '', motivo: '', vencimento: '' }]);
  };
  const alterar = (chave: number, campo: Partial<Rascunho>) =>
    setRascunhos(prev => prev.map(r => (r.chave === chave ? { ...r, ...campo } : r)));
  const salvar = async () => {
    setTentou(true);
    setErro(null);
    if (rascunhos.length === 0) { onFechar(); return; }
    if (faltando.length > 0) return;
    const e = await api.explicarSaldo(itens);
    if (e) { setErro(e); return; }
    onFechar();
  };
  const remover = async (parteId: string) => {
    setTentouRemover(true);
    if (!motivoRemover.trim()) return;
    const e = await api.desfazerExplicacao(parteId, motivoRemover);
    if (e) { setErro(e); return; }
    setRemovendo(null); setMotivoRemover(''); setTentouRemover(false);
  };
  const contasDoTipo = (t: TipoExplicacao) => (t === 'outra_receita' ? contasEntrada : contasSaida);

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-[820px]" data-testid="dialogo-explicar">
        <DialogHeader><DialogTitle className="text-[12px]">Explicar diferença</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-[5px]">
          <Card rotulo="Saldo a explicar" valor={cc.saldoAExplicar} cor={COR[corDoSaldo(cc.saldoAExplicar)]} testid="card-saldo-a-explicar" />
          <Card rotulo="Explicado" valor={explicadoTotal} cor={COR[corDoSaldo(explicadoTotal)]} testid="card-explicado" />
          <Card rotulo="Falta explicar" valor={falta} cor={COR[corDoSaldo(falta)]} testid="card-falta-explicar" />
        </div>
        <div className="max-h-[45vh] overflow-auto rounded border">
          <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
            <colgroup><col style={{ width: 140 }} /><col style={{ width: 70 }} /><col style={{ width: 190 }} /><col /><col style={{ width: 100 }} /><col style={{ width: 64 }} /></colgroup>
            <thead>
              <tr>{['Tipo', 'Lote', 'Conta', 'Motivo', 'Valor', ''].map((h, i) => <th key={i} className={THG}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {cc.explicacoes.map(e => (
                <tr key={e.parteId} className="bg-[#fffbeb]" data-explicacao={e.tipo}>
                  <td className={TD}>{rotuloExplicacao(e.tipo, lado)}</td>
                  <td className={`${TD} text-center`}>{e.loteOrdem ?? ''}</td>
                  <td className={`${TD} whitespace-normal break-words`}>{contaComNumero(e.contaOrdem, rotuloDaConta(e.conta))}</td>
                  <td className={`${TD} whitespace-normal break-words`}>{e.motivo ?? ''}</td>
                  <td className={`${NUM} ${COR[corDoSaldo(e.valor)]}`}>{formatMoeda(e.valor)}</td>
                  <td className={`${TD} text-center`}>
                    {!somenteLeitura && (
                      <button type="button" className="text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => { setRemovendo(e.parteId); setMotivoRemover(''); setTentouRemover(false); }}>remover</button>
                    )}
                  </td>
                </tr>
              ))}
              {rascunhos.map(r => {
                const p = tentou ? pendencias(r) : [];
                const verm = (campo: string) => (p.includes(campo) ? 'border-destructive' : '');
                return (
                  <tr key={r.chave} className="bg-white" data-rascunho={r.tipo}>
                    <td className={TD}>{rotuloExplicacao(r.tipo, lado)}</td>
                    <td className={`${TD} text-center`}>
                      {r.tipo === 'ajuste_preco' ? (
                        <Select value={r.loteId} onValueChange={v => alterar(r.chave, { loteId: v })}>
                          <SelectTrigger className={`h-[18px] px-1 text-[10px] ${verm('lote')}`} aria-label="Lote do ajuste"><SelectValue placeholder="lote" /></SelectTrigger>
                          <SelectContent>
                            {lotes.map(l => <SelectItem key={l.id} value={l.id} className="text-[10px]">{`${l.ordem} · ${rotuloCategoria(l.categoria)}`}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : ''}
                    </td>
                    <td className={TD}>
                      {r.tipo === 'permuta_despesa' || r.tipo === 'outra_receita' ? (
                        <Select value={r.contaId} onValueChange={v => alterar(r.chave, { contaId: v })}>
                          <SelectTrigger className={`h-[18px] px-1 text-[10px] ${verm('conta')}`} aria-label="Conta da explicação"><SelectValue placeholder="conta" /></SelectTrigger>
                          <SelectContent>
                            {contasDoTipo(r.tipo).map(c => <SelectItem key={c.id} value={c.id} className="text-[10px]">{contaComNumero(c.ordem, c.subcentro)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : r.tipo === 'devolucao_comprador' ? (
                        <DatePicker value={r.vencimento} onChange={v => alterar(r.chave, { vencimento: v })} size="compact" className={verm('vencimento')} />
                      ) : (
                        <span>{r.tipo === 'desconto_comercial' ? '5020 Deduções Outras Operações Pecuária' : lado === 'compra' ? 'compra do lote' : 'venda do lote'}</span>
                      )}
                    </td>
                    <td className={TD}>
                      <Input value={r.motivo} onChange={e => alterar(r.chave, { motivo: e.target.value })} aria-label="Motivo *"
                        className={`h-[18px] px-1 text-[10px] ${verm('motivo')}`} />
                    </td>
                    <td className={TD}>
                      <Input value={r.valor} onChange={e => alterar(r.chave, { valor: e.target.value })} aria-label="Valor"
                        className={`h-[18px] px-1 text-right text-[10px] ${verm('valor')}`} />
                    </td>
                    <td className={`${TD} text-center`}>
                      <button type="button" className="text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => setRascunhos(prev => prev.filter(x => x.chave !== r.chave))}>tirar</button>
                    </td>
                  </tr>
                );
              })}
              {cc.explicacoes.length === 0 && rascunhos.length === 0 && (
                <tr><td colSpan={6} className={`${TD} text-center text-muted-foreground`}>Nenhuma explicação ainda. Escolha um tipo abaixo.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={4} className="sticky bottom-0 h-[19px] border-t-2 border-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-[10px]">Total explicado</td>
                <td className={`sticky bottom-0 h-[19px] border-t-2 border-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-right text-[10px] ${COR[corDoSaldo(explicadoTotal)]}`}>{formatMoeda(explicadoTotal)}</td>
                <td className="sticky bottom-0 border-t-2 border-[#9aa7b6] bg-[#E8E6DF]" />
              </tr>
            </tfoot>
          </table>
        </div>
        {tentou && faltando.length > 0 && (
          <div className="text-[10px] text-destructive">Complete cada linha: {faltando.join(', ')}.</div>
        )}
        {removendo && (
          <div className="rounded border border-destructive/40 p-2">
            <CampoMotivo id="motivo-remover-explicacao" valor={motivoRemover} onChange={setMotivoRemover} falta={tentouRemover && !motivoRemover.trim()} />
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={() => setRemovendo(null)}>Voltar</Button>
              <Button type="button" variant="destructive" size="sm" className={BOTAO} disabled={api.ocupado} onClick={() => remover(removendo)}>Remover explicação</Button>
            </div>
          </div>
        )}
        {!somenteLeitura && (
          <div className="flex flex-wrap gap-[5px]">
            {TIPOS.map(t => (
              <Button key={t} type="button" variant="outline" size="sm" className={BOTAO} onClick={() => adicionar(t)}>+ {rotuloExplicacao(t, lado)}</Button>
            ))}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          {lado === 'compra'
            ? <>Ajuste de preço muda o valor da entrada do lote (desconto do fornecedor; R$/kg derivado). Permuta lança sem caixa na conta
              escolhida, com competência na data da última entrada ({dataCurta(cc.ultimaEntrega)}). Devolução do fornecedor programa uma
              entrada de caixa na conta da compra, fora do DRE.</>
            : <>Ajuste de preço muda o valor da entrega do lote (R$/kg derivado). Os outros tipos lançam sem caixa na conta escolhida, com
          competência na data da última entrega ({dataCurta(cc.ultimaEntrega)}). Devolver ao comprador programa um pagamento de caixa.</>}
        </div>
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto text-[10px] text-destructive" role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={onFechar}>Cancelar</Button>
          {!somenteLeitura && (
            <Button type="button" size="sm" className={`${BOTAO} bg-[#15803d] hover:bg-[#15803d]/90`} disabled={api.ocupado} onClick={salvar}>Salvar explicação</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
