/**
 * "PARCELAR ESTE LANÇAMENTO" — P74 B (NOTA-CARTAO-PARCELADO-01; o mock aprovado, vistas 2 e 3). Na aba Pagamento do Editar lançamento,
 * para o lançamento À VISTA (sem parcelamento/financiamento): o bloco "Parcelamento · hoje: à vista (1/1)" e o botão. Clicado: Nº de
 * parcelas, 1º vencimento (no cartão, a MESMA sugestão da prévia da nota: o dia mais frequente do cartão, no mês seguinte à competência)
 * e a GradeDeParcelas de sempre ("Igual todo mês" / "Parcelas livres") com a coluna Situação. "Parcelar em N" abre a confirmação antes →
 * depois (AlertDialog, nunca `confirm()`); confirmar grava pela RPC (`parcelarEsteLancamento`).
 * ⚠ PAGO OU CONCILIADO: o botão fica APAGADO com a frase no `title` e embaixo — nunca some.
 * ⚠ ALTURA: fechado, uma linha; aberto, a grade tem altura fixa (só a lista rola).
 * P143 (Gabriel 29/10 11:35) — a PARCELA SOLTA mostra as irmãs na tabela das parcelas (`ParcelasNoPagamento`, a mesma do parcelamento), diz
 * "soltas, sem parcelamento" e oferece "Juntar num parcelamento": a junção que já existe (`juntarParcelas`, P96a), com a prévia do banco
 * e a recusa dele em frase; só com as N frações achadas. Sem a nota lida não há emissão: a junção daqui não muda a competência.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { TituloDoBloco, BLOCO_FORMULARIO } from '@/components/ui/bloco-formulario';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GradeDeParcelas, type ModoDasParcelas } from '@/components/financiamentos/GradeDeParcelas';
import { brCentavos, motivoNaoSalva, parcelasDoMensal, type ParcelaLivre } from '@/lib/financiamentos/parcelasLivres';
import {
  MAX_PARCELAS_DO_CARTAO, MIN_PARCELAS_DO_CARTAO, diaMaisFrequente, parcelasDoCartao, primeiraFatura, rotuloDaSugestao,
} from '@/lib/financeiro/pagamentoNoCartao';
import { diasDoCartao } from '@/lib/financeiro/diasDoCartao';
import {
  fraseDaConfirmacao, parcelarEsteLancamento, travaDoParcelar, type GravadoresDoParcelar, type LancamentoParaParcelar,
} from '@/lib/financeiro/parcelarLancamento';
import { cn } from '@/lib/utils';
import { TOLERANCIA_DA_IRMA_CENT, buscarIrmasDaNota, buscarIrmasSoltas, fraseDaParcelaSolta, numeroDaNota, parcelaSolta, type CandidataIrma } from '@/lib/financeiro/parcelaSolta';
import { idsParaJuntar, linhasDaNota, linhasDasSoltas } from '@/lib/financeiro/parcelasNoPagamento';
import { GRAVADORES_DA_JUNCAO, gravarJuncao, simularJuncao, type GravadoresDaJuncao, type Juncao } from '@/lib/financeiro/juntarParcelas';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { ParcelasNoPagamento } from './ParcelasNoPagamento';

const dataBR = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function ParcelarEsteLancamento({ clienteId, lancamento, situacao, vencimentoAtual, conta, onParcelado, gravadores, buscarIrmas = buscarIrmasSoltas,
  onAbrirParcela, juncao = GRAVADORES_DA_JUNCAO, numeroDocumento = null, buscarIrmasNota = buscarIrmasDaNota, onParcelaSolta }: {
  clienteId: string;
  lancamento: LancamentoParaParcelar;
  /** o que trava: status, pagamento e conciliação GRAVADOS */
  situacao: { status: string | null | undefined; dataPagamento: string | null | undefined; conciliadoEm: string | null | undefined };
  vencimentoAtual: string | null;
  /** a conta do lançamento (o cartão sugere o 1º vencimento) */
  conta: { id: string; nome: string; cartao: boolean } | null;
  onParcelado: () => void;
  /** só para teste */
  gravadores?: GravadoresDoParcelar;
  /** P104 — as candidatas a irmãs da parcela solta (padrão: o banco); só para teste */
  buscarIrmas?: typeof buscarIrmasSoltas;
  /** P143 — abrir outra parcela no mesmo modal (o hospedeiro troca o lançamento); sem ele, a tabela só se lê */
  onAbrirParcela?: (lancamentoId: string) => void;
  /** P143 — a junção (padrão: o banco); só para teste */
  juncao?: GravadoresDaJuncao;
  /** P143 — o nº da nota do lançamento: sem "k/N" na descrição, as irmãs saem pela MESMA nota do mesmo fornecedor ("Parcela 3 - None") */
  numeroDocumento?: string | null;
  /** P143 — as irmãs pela nota (padrão: o banco); só para teste */
  buscarIrmasNota?: typeof buscarIrmasDaNota;
  /** P143 — a fração achada (pela descrição ou pela nota) para o Resumo do modal; nulo = à vista */
  onParcelaSolta?: (f: { k: number; n: number } | null) => void;
}) {
  /* P104 — a PARCELA SOLTA ("… - 6/6", lançada à mão sem parcelamento) não se parcela de novo: o bloco diz o que ela é e quantas irmãs há */
  const solta = parcelaSolta(lancamento.descricao);
  const [candidatas, setCandidatas] = useState<CandidataIrma[] | null>(null);
  useEffect(() => {
    let vivo = true;
    setCandidatas(null);
    if (!solta || !lancamento.favorecidoId) return;
    void buscarIrmas(clienteId, lancamento.favorecidoId, solta.n).then((c) => { if (vivo && c) setCandidatas(c); }, () => undefined);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, lancamento.id, lancamento.favorecidoId, lancamento.valorCent, solta?.k, solta?.n, buscarIrmas]);
  /* P143 — as irmãs na tabela: a própria (o que o modal tem) + as achadas, pela MESMA regra do "achadas X de N" */
  const linhasSoltas = useMemo(() => (solta && candidatas ? linhasDasSoltas(
    { id: lancamento.id, descricao: lancamento.descricao, valorCent: lancamento.valorCent, vencimento: vencimentoAtual,
      pagamento: situacao.dataPagamento ?? null, status: situacao.status ?? null, conta: conta?.nome ?? null },
    candidatas, hojeLocal(), TOLERANCIA_DA_IRMA_CENT) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [candidatas, lancamento.id, lancamento.descricao, lancamento.valorCent, vencimentoAtual, situacao.dataPagamento, situacao.status, conta?.nome]);
  /* P143 (Gabriel 29/10 15:03, "Parcela 3 - None" da NF 4964) — sem "k/N", as irmãs PELA NOTA: o mesmo fornecedor e o mesmo nº de nota;
     N = quantas são, a parcela = a posição no vencimento. Nenhuma irmã = à vista de verdade (o bloco de parcelar de sempre) */
  const notaDasIrmas = solta ? null : numeroDaNota(numeroDocumento);
  const [irmasDaNota, setIrmasDaNota] = useState<CandidataIrma[] | null>(null);
  useEffect(() => {
    let vivo = true;
    setIrmasDaNota(null);
    if (!notaDasIrmas || !lancamento.favorecidoId) return;
    void buscarIrmasNota(clienteId, lancamento.favorecidoId, notaDasIrmas).then((c) => { if (vivo && c) setIrmasDaNota(c); }, () => undefined);
    return () => { vivo = false; };
  }, [clienteId, lancamento.id, lancamento.favorecidoId, notaDasIrmas, buscarIrmasNota]);
  const linhasPelaNota = useMemo(() => (notaDasIrmas && irmasDaNota ? linhasDaNota(
    { id: lancamento.id, descricao: lancamento.descricao, valorCent: lancamento.valorCent, vencimento: vencimentoAtual,
      pagamento: situacao.dataPagamento ?? null, status: situacao.status ?? null, conta: conta?.nome ?? null },
    irmasDaNota, hojeLocal()) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [irmasDaNota, notaDasIrmas, lancamento.id, lancamento.descricao, lancamento.valorCent, vencimentoAtual, situacao.dataPagamento, situacao.status, conta?.nome]);
  const pelaNota = linhasPelaNota && linhasPelaNota.length >= 2 ? linhasPelaNota : null;
  const fracao = solta ?? (pelaNota ? { k: pelaNota.findIndex((l) => l.lancamentoId === lancamento.id) + 1, n: pelaNota.length } : null);
  const linhasDaTabela = solta ? linhasSoltas : pelaNota;
  useEffect(() => { onParcelaSolta?.(fracao ? { k: fracao.k, n: fracao.n } : null); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [fracao?.k, fracao?.n]);
  const achadas = linhasDaTabela ? linhasDaTabela.length : null;
  const idsDaJuncao = linhasDaTabela ? idsParaJuntar(linhasDaTabela) : null;
  const [previaDaJuncao, setPreviaDaJuncao] = useState<Juncao | null>(null);
  const [juntando, setJuntando] = useState(false);
  const [erroDaJuncao, setErroDaJuncao] = useState<string | null>(null);
  const abrirJuncao = async () => {
    if (!idsDaJuncao) return;
    setJuntando(true); setErroDaJuncao(null);
    try { setPreviaDaJuncao(await simularJuncao(clienteId, idsDaJuncao, null, juncao)); } finally { setJuntando(false); }
  };
  const juntar = async () => {
    if (!idsDaJuncao) return;
    setJuntando(true); setErroDaJuncao(null);
    try {
      const r = await gravarJuncao(clienteId, idsDaJuncao, null, juncao);
      if (r.ok === false) { setErroDaJuncao(r.erro); return; }
      toast.success(`Parcelas juntadas num parcelamento de ${idsDaJuncao.length}`);
      setPreviaDaJuncao(null);
      onParcelado();
    } finally { setJuntando(false); }
  };
  const trava = travaDoParcelar(situacao);
  const [aberto, setAberto] = useState(false);
  const [nTexto, setNTexto] = useState('');
  const [primeira, setPrimeira] = useState('');
  const [editada, setEditada] = useState(false);
  const [dia, setDia] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoDasParcelas>('mensal');
  const [livres, setLivres] = useState<ParcelaLivre[]>([]);
  const [base, setBase] = useState<ParcelaLivre[] | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!aberto || !conta?.cartao) { setDia(null); return; }
    void diasDoCartao(conta.id).then((d) => { if (vivo) setDia(diaMaisFrequente(d)); }, () => { if (vivo) setDia(null); });
    return () => { vivo = false; };
  }, [aberto, conta?.id, conta?.cartao]);
  const sugerida = dia ? primeiraFatura(lancamento.dataCompetencia, dia) : '';
  useEffect(() => { if (!editada) setPrimeira(sugerida); }, [sugerida, editada]);
  const sugeridaAtiva = !!sugerida && !editada && primeira === sugerida;

  const n = /^\d+$/.test(nTexto.trim()) ? Number(nTexto.trim()) : 0;
  const nValido = n >= MIN_PARCELAS_DO_CARTAO && n <= MAX_PARCELAS_DO_CARTAO;
  const mensal = useMemo(() => (nValido && primeira
    ? parcelasDoMensal(parcelasDoCartao(lancamento.valorCent, n, primeira).map((x) => ({ numero: Number(x.numero), dataVencimento: x.vencimento, valor: x.valorCent / 100 })))
    : []), [nValido, primeira, lancamento.valorCent, n]);
  const grade = modo === 'livres' ? livres : mensal;
  const nGrade = grade.length;
  const motivo = modo === 'livres' ? (livres.length < MIN_PARCELAS_DO_CARTAO ? 'O parcelado pede ao menos duas parcelas.' : motivoNaoSalva(livres, lancamento.valorCent, 'o lançamento'))
    : !nValido ? `Informe o nº de parcelas (${MIN_PARCELAS_DO_CARTAO} a ${MAX_PARCELAS_DO_CARTAO}).` : !primeira ? 'Informe o 1º vencimento.' : null;
  const trocarModo = (m: ModoDasParcelas) => {
    if (m === 'livres') { setLivres(mensal); setBase(mensal); } else { setLivres([]); setBase(null); }
    setModo(m);
  };
  const nomeDaConta = conta?.nome ?? 'a mesma conta';

  const gravar = async () => {
    setGravando(true); setErro(null);
    try {
      const r = await parcelarEsteLancamento(clienteId, lancamento, grade.map((x) => ({ vencimento: x.vencimento, valorCent: x.valorCent })), gravadores);
      if (r.ok === false) { setErro(r.erro); setConfirmar(false); return; }
      if (r.erroDosDocumentos) toast.error(r.erroDosDocumentos); else toast.success(`Lançamento parcelado em ${r.parcelas}`);
      setConfirmar(false);
      onParcelado();
    } finally { setGravando(false); }
  };

  if (fracao) return (
    <section className={cn(BLOCO_FORMULARIO, 'gap-1')} data-testid="parcela-solta">
      <TituloDoBloco nome="Parcelamento" dica="soltas, sem parcelamento" acao={(
        <Button type="button" size="sm" variant="outline" className="h-[22px] px-2 text-[10.5px]" disabled={!idsDaJuncao || juntando}
          title={idsDaJuncao ? `Juntar as ${idsDaJuncao.length} parcelas num parcelamento (prévia antes)` : `Para juntar, as ${fracao.n} parcelas têm de estar lançadas: achadas ${achadas ?? '…'} de ${fracao.n}`}
          onClick={() => { void abrirJuncao(); }} data-testid="parcela-solta-juntar">Juntar num parcelamento</Button>
      )} />
      <p className="text-[10.5px] leading-[14px] text-foreground" data-testid="parcela-solta-frase">{solta ? fraseDaParcelaSolta(solta, achadas)
        : `Parcela ${fracao.k} de ${fracao.n} da NF ${notaDasIrmas ?? ''} lançada solta (sem parcelamento)`}</p>
      {linhasDaTabela && (
        <ParcelasNoPagamento linhas={linhasDaTabela} abertaId={lancamento.id} onAbrir={onAbrirParcela}
          rodape={<span>{solta ? `soltas, sem parcelamento · achadas ${linhasDaTabela.length} de ${solta.n}`
            : `soltas, sem parcelamento · ${linhasDaTabela.length} lançamentos da NF ${notaDasIrmas ?? ''}`}</span>} />
      )}
      <AlertDialog open={!!previaDaJuncao} onOpenChange={(o) => { if (!o && !juntando) { setPreviaDaJuncao(null); setErroDaJuncao(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Juntar num parcelamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {previaDaJuncao?.ok === true
                ? `As ${previaDaJuncao.parcelas} parcelas ficam como estão (valor, vencimento, pagamento e status) e passam a ser uma compra parcelada: “${previaDaJuncao.descricao}”, R$ ${brCentavos(previaDaJuncao.somaCent)}.`
                : 'O banco não aceitou juntar estas parcelas.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* as N que o banco vai juntar, uma a uma: a regra das irmãs (P95) não compara a descrição, então a lista se confere antes */}
          {previaDaJuncao?.ok === true && previaDaJuncao.lista.length > 0 && (
            <table className="w-full table-fixed border-collapse text-[10.5px]" data-testid="parcela-solta-juntar-lista">
              <colgroup><col style={{ width: 44 }} /><col /><col style={{ width: 84 }} /><col style={{ width: 84 }} /></colgroup>
              <thead className="bg-primary text-primary-foreground"><tr><th className="h-[19px] px-1.5 text-left font-medium">Parc.</th>
                <th className="px-1.5 text-left font-medium">Descrição</th><th className="px-1.5 text-left font-medium">Vencimento</th>
                <th className="px-1.5 text-right font-medium">Valor</th></tr></thead>
              <tbody>
                {previaDaJuncao.lista.map((x) => (
                  <tr key={x.lancamentoId} className="border-b" data-testid="parcela-solta-juntar-linha">
                    <td className="px-1.5 tabular-nums">{x.numero}/{previaDaJuncao.parcelas}</td>
                    <td className="truncate px-1.5" title={x.descricao ?? undefined}>{x.descricao ?? '—'}</td>
                    <td className="px-1.5 tabular-nums">{dataBR(x.vencimento)}</td>
                    <td className="px-1.5 text-right tabular-nums">{brCentavos(x.valorCent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {previaDaJuncao?.ok === false && <p className="text-[10.5px] text-destructive" data-testid="parcela-solta-recusa">{previaDaJuncao.frase}</p>}
          {erroDaJuncao && <p className="text-[10.5px] text-destructive" data-testid="parcela-solta-erro">{erroDaJuncao}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={juntando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={juntando || previaDaJuncao?.ok !== true} data-testid="parcela-solta-juntar-gravar"
              onClick={(e) => { e.preventDefault(); void juntar(); }}>{juntando ? 'Juntando…' : 'Juntar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );

  return (
    <section className={cn(BLOCO_FORMULARIO, 'gap-1')} data-testid="parcelar-este">
      <TituloDoBloco nome="Parcelamento" dica="hoje: à vista (1/1)" acao={!aberto ? (
        <Button type="button" size="sm" variant="outline" className="h-[22px] px-2 text-[10.5px]" disabled={!!trava} title={trava ?? undefined}
          onClick={() => setAberto(true)} data-testid="parcelar-este-abrir">Parcelar este lançamento</Button>
      ) : undefined} />
      {trava && <p className="text-[10px] text-muted-foreground" data-testid="parcelar-este-trava">{trava}</p>}
      {aberto && !trava && (
        /* P104 — a coluna tem ao menos 260px e os dois rótulos ocupam duas linhas RESERVADAS, fonte menor: nunca rolam escondidos no lugar
           ("1º vencimento · sugeric…" no print do Gabriel, a 1750px); lado a lado, o bloco não passa da altura da grade */
        <div className="grid min-w-0 gap-2" style={{ gridTemplateColumns: 'minmax(260px, 36%) minmax(0, 1fr)' }}>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="campos-uma-linha grid gap-1.5" style={{ gridTemplateColumns: '64px minmax(0, 1fr)' }}>
              <div className="min-w-0">
                <span className={cn('mb-0.5 block h-[26px] overflow-hidden whitespace-normal text-[9.5px] font-normal leading-[13px] text-muted-foreground',
                  modo === 'mensal' && !nValido && 'text-destructive')}>Nº de parcelas *</span>
                <Input value={modo === 'livres' ? String(livres.length) : nTexto} onChange={(e) => setNTexto(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  disabled={modo === 'livres'} inputMode="numeric" placeholder={`${MIN_PARCELAS_DO_CARTAO} a ${MAX_PARCELAS_DO_CARTAO}`} data-testid="parcelar-este-n"
                  className={cn('h-[22px] px-2 text-[10.5px] tabular-nums', modo === 'mensal' && !nValido && 'border-destructive')} />
              </div>
              <div className="min-w-0">
                <span className={cn('mb-0.5 block h-[26px] overflow-hidden whitespace-normal break-words text-[9.5px] font-normal leading-[13px] text-muted-foreground',
                  sugeridaAtiva && 'text-amber-800', modo === 'mensal' && !primeira && 'text-destructive')} data-testid="parcelar-este-rotulo-venc">
                  {sugeridaAtiva && dia && conta ? rotuloDaSugestao(conta.nome, dia).replace('1ª fatura', '1º vencimento') : '1º vencimento'}</span>
                <DatePicker value={modo === 'livres' ? (livres[0]?.vencimento ?? '') : primeira} disabled={modo === 'livres'} data-testid="parcelar-este-venc"
                  onChange={(v) => { setPrimeira(v); setEditada(true); }}
                  className={cn('h-[22px] text-[10.5px]', sugeridaAtiva && 'border-amber-400 bg-amber-50', modo === 'mensal' && !primeira && 'border-destructive')} />
              </div>
            </div>
            <p className="rounded bg-sky-50 px-2 py-1 text-[10px] leading-snug text-sky-900" data-testid="parcelar-este-recado">
              {nGrade >= 2
                ? <>Este lançamento <b>vira a 1/{nGrade}</b> (mesmo lançamento, mesmos documentos, mesma classificação). Nascem {nGrade === 2 ? 'a 2/2' : `da 2/${nGrade} à ${nGrade}/${nGrade}`} em {nomeDaConta}. Competência {dataBR(lancamento.dataCompetencia)} nas {nGrade}.</>
                : 'Escolha o nº de parcelas e o 1º vencimento.'}
            </p>
            {/* P104 — a frase do que falta tem LINHA PRÓPRIA (duas linhas reservadas), acima dos botões: nunca cortada ao lado deles */}
            <p className="mt-auto h-[26px] overflow-hidden text-[10px] leading-[13px] text-destructive" data-testid="parcelar-este-motivo">{erro ?? motivo ?? ''}</p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" onClick={() => { setAberto(false); setErro(null); }}>Cancelar</Button>
              <Button type="button" size="sm" className="h-[24px] w-[120px] shrink-0 px-2.5 text-[10.5px]" disabled={!!motivo || nGrade < 2}
                onClick={() => setConfirmar(true)} data-testid="parcelar-este-confirmar">{nGrade >= 2 ? `Parcelar em ${nGrade}` : 'Parcelar'}</Button>
            </div>
          </div>
          <GradeDeParcelas modo={modo} onModo={trocarModo} parcelas={grade} onParcelas={setLivres} compraCent={lancamento.valorCent}
            oQue={{ frase: 'o lançamento', rotulo: 'Valor', passaAValer: 'O lançamento vale' }} base={base} rotuloVoltar="Desfazer edições"
            recado={grade.length && grade.every((x) => x.valorCent === grade[0].valorCent) ? `${grade.length} × ${brCentavos(grade[0].valorCent)} = R$ ${brCentavos(lancamento.valorCent)}` : null}
            altura={190} compacta extras={[{ titulo: 'Situação', largura: 96, celula: (k) => (k === 1 ? 'este lançamento' : <span className="text-violet-700">nova</span>) }]} />
        </div>
      )}

      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!o && !gravando) setConfirmar(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parcelar este lançamento em {nGrade}?</AlertDialogTitle>
            <AlertDialogDescription>{lancamento.descricao} · {nomeDaConta}</AlertDialogDescription>
          </AlertDialogHeader>
          <table className="w-full table-fixed border-collapse text-[10.5px]" data-testid="parcelar-este-antes-depois">
            <colgroup><col style={{ width: 62 }} /><col /><col style={{ width: 92 }} /><col style={{ width: 100 }} /></colgroup>
            <thead className="bg-primary text-primary-foreground"><tr><th className="h-[19px] px-1.5 text-left font-medium" /><th className="px-1.5 text-left font-medium">Parcela</th>
              <th className="px-1.5 text-left font-medium">Vencimento</th><th className="px-1.5 text-right font-medium">Valor</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="px-1.5 text-muted-foreground">Antes</td><td className="px-1.5 tabular-nums">1/1</td>
                <td className="px-1.5 tabular-nums">{dataBR(vencimentoAtual)}</td>
                <td className="px-1.5 text-right tabular-nums text-destructive">−{brCentavos(lancamento.valorCent)}</td></tr>
              {grade.map((x, i) => (
                <tr key={x.chave} className="border-b" data-testid="parcelar-este-depois">
                  <td className="px-1.5 font-semibold">{i === 0 ? 'Depois' : ''}</td>
                  <td className="px-1.5 tabular-nums">{i + 1}/{nGrade} {i === 0 ? <span className="text-muted-foreground">(este)</span> : <span className="text-violet-700">nova</span>}</td>
                  <td className="px-1.5 tabular-nums">{dataBR(x.vencimento)}</td>
                  <td className="px-1.5 text-right tabular-nums text-destructive">−{brCentavos(x.valorCent)}</td>
                </tr>
              ))}
              <tr className="bg-muted/60 font-semibold"><td className="px-1.5">Total</td><td className="px-1.5">igual ao antes</td><td className="px-1.5" />
                <td className="px-1.5 text-right tabular-nums text-destructive">−{brCentavos(grade.reduce((s, x) => s + x.valorCent, 0))}</td></tr>
            </tbody>
          </table>
          <p className="text-[10.5px] text-muted-foreground">{fraseDaConfirmacao(nGrade)}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gravando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={gravando} data-testid="parcelar-este-gravar" onClick={(e) => { e.preventDefault(); void gravar(); }}>
              {gravando ? 'Parcelando…' : `Parcelar em ${nGrade}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
