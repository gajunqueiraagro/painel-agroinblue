/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — "Notas da Receita" (mock ui-validar/notas-receita-f34.html, aprovado 16/11 15:15; Chat 20:05).
 * A casca é a da caixa de boletos (cabeçalho azul, abas com contagem reservada, quadro com rolagem própria, rodapé azul com o total).
 * SÓ LEITURA: lista o que a busca gravou; "Lançar" entrega o XML ao "Da nota fiscal" de hoje (D1), "PDF" baixa o XML (D3), a linha
 * abre os dados ("Ver"). Dar ciência (F3.3) e Ignorar (RPC nova) não entram nesta fatia.
 * NOTA-RECEITA-CASAR-01 (mock aprovado 17/11, D1–D4): "Lançar" numa nota com candidatos mostra ANTES o quadro "pode já estar lançada";
 * "Vincular a este" leva o XML à porta 2 do "+ Da nota" a partir do lançamento escolhido (o Anexar de hoje: valor, datas, conta, status
 * e conciliação NÃO mudam); nunca casa sozinho.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { RODAPE_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { lerXmlDaReceita, type DadosDaReceita } from '@/hooks/useNotasDaReceita';
import { abrirAbaDoDanfe, mostrarDanfe } from '@/lib/fiscal/abrirDanfe';
import {
  ABAS_DA_RECEITA, arquivoDoXml, candidatoPreMarcado, filtrarBusca, nomeDoXml, seloDaNota, totalDaLista, type AbaDaReceita,
  type ClasseDoCandidato, type NotaNaLista,
} from '@/lib/fiscal/notasDaReceita';
import { ehBemDeTerceiro } from '@/lib/fiscal/classeDaNota';
import { Ajuda } from '@/components/ui/ajuda';
import type { PreviaDoBem } from '@/hooks/useNotasDaReceita';

/* NOTAS-RECEITA-SEM-LANCAMENTO-01 — o que FAZER com cada classe (o "como fazer" do ⓘ) e a ação ligada da linha */
type RespostaDoBem = PreviaDoBem | { ok: false; frase: string };
function oQueFazer(n: NotaNaLista): string {
  if (n.sit === 'venda_titular') return 'Confira no abate/venda (OC) do comprador. Não lance como compra.';
  if (n.sit === 'cancelada') return n.substituta ? `Use a NF ${n.substituta}, que a substituiu.` : 'Nada a lançar.';
  if (n.classe.classe !== 'nao_financeira') return '';
  if (ehBemDeTerceiro(n.classe)) return 'Clique em "Registrar bem": ele fica em Patrimônio › Bens de terceiros até voltar.';
  if (n.classe.motivo === 'entrega_futura') return n.citadas.length ? `Lance a NF de faturamento ${n.citadas.join(', ')} (se ainda não estiver); esta só confirma a entrega.` : 'Lance a NF de faturamento (5922) do mesmo pedido; esta só confirma a entrega.';
  if (n.classe.motivo === 'devolucao') return 'Abata do fornecedor: ligue à nota original e ao lançamento dela (o gesto de baixa).';
  return 'Nada a lançar: fica aqui para consulta.';
}
const ehAcaoFaturamento = (n: NotaNaLista) => n.sit === 'nao_financeira' && n.classe.classe === 'nao_financeira' && n.classe.motivo === 'entrega_futura';
const ehAcaoBem = (n: NotaNaLista) => n.sit === 'nao_financeira' && ehBemDeTerceiro(n.classe);

const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');
const TH_NUM = cn(TH, 'text-right');
const LINHA = 'h-[19px] border-b border-border/40';
const BOTAO = 'h-[16px] rounded-[3px] px-1 text-[9.5px] leading-none';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const horaBR = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export function baixarArquivo(arquivo: File) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url; a.download = arquivo.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function NotasDaReceitaDialog({ clienteNome, dados, carregando, erro, aoFechar, aoLancar, aoVincular, lerXml = lerXmlDaReceita,
  abrirDanfe = abrirAbaDoDanfe, mostrarNaAba = mostrarDanfe, registrarBem }: {
  clienteNome?: string | null;
  dados: DadosDaReceita | undefined;
  carregando: boolean;
  erro: string | null;
  aoFechar: () => void;
  /** D1 — o XML vai para o "Da nota fiscal" de hoje (o mesmo caminho do arquivo solto) */
  aoLancar: (arquivo: File) => void;
  /** NOTA-RECEITA-CASAR-01 — o XML vai à porta 2 do "+ Da nota" a partir do lançamento escolhido; devolve a frase quando não abre */
  aoVincular: (arquivo: File, lancamentoId: string) => Promise<string | null>;
  /** a bancada injeta o leitor; a tela usa o banco */
  lerXml?: (id: string) => Promise<string>;
  /** NOTA-DANFE-01 — o "PDF" abre o DANFE do XML numa aba (a aba nasce no clique); os testes injetam */
  abrirDanfe?: () => Window | null;
  mostrarNaAba?: (aba: Window | null, arquivo: File) => Promise<void>;
  /** NOTAS-RECEITA-SEM-LANCAMENTO-01 — "Registrar bem de terceiro" (simular = a prévia); sem ele, o botão não aparece */
  registrarBem?: (chave: string, previsao: string | null, observacao: string | null, simular: boolean) => Promise<RespostaDoBem>;
}) {
  const [aba, setAba] = useState<AbaDaReceita>('todas');
  const [busca, setBusca] = useState('');
  const [titular, setTitular] = useState<string | null>(null);
  const [aberta, setAberta] = useState<NotaNaLista | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [casar, setCasar] = useState<NotaNaLista | null>(null);
  const [bem, setBem] = useState<NotaNaLista | null>(null);

  const todas = useMemo(() => filtrarBusca(dados?.lista ?? [], busca, titular), [dados, busca, titular]);
  const filtro = ABAS_DA_RECEITA.find((a) => a.valor === aba)?.filtro ?? (() => true);
  const linhas = todas.filter(filtro);
  const pedemCiencia = todas.filter((n) => n.sit === 'pede_ciencia').length;
  const aLancar = todas.filter((n) => n.sit === 'nova' || n.sit === 'pode_estar').length;

  const comXml = async (n: NotaNaLista, fazer: (f: File) => void | Promise<void>) => {
    setOcupada(n.id); setAviso(null);
    try { await fazer(arquivoDoXml(n.chave, await lerXml(n.id))); } catch (e) { setAviso(e instanceof Error ? e.message : 'Não consegui ler o XML.'); } finally { setOcupada(null); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(560px,calc(100vh-16px))] w-[min(1100px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="notas-da-receita">
        <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={clienteNome ?? undefined}>Notas da Receita{clienteNome ? ` · ${clienteNome}` : ''}</DialogTitle>
          <DialogDescription className="shrink-0 text-[10px] text-primary-foreground/85" data-testid="receita-relogio">
            <TextoReservado alinhar="direita" reserva="última busca 00/00, 00:00 · próxima a partir de 00/00, 00:00"
              texto={`última busca ${horaBR(dados?.ultimaBusca ?? null)}${dados?.proximaBusca ? ` · próxima a partir de ${horaBR(dados.proximaBusca)}` : ''}`} />
          </DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2">
          <div className="flex h-[26px] shrink-0 items-center gap-2">
            <Segmentado valor={aba} onEscolher={setAba} fonte={10}
              opcoes={ABAS_DA_RECEITA.map((a) => ({
                valor: a.valor,
                rotulo: <span>{a.rotulo} <TextoReservado texto={dados ? String(todas.filter(a.filtro).length) : '—'} reserva="999" /></span>,
              }))} />
            <span className="flex-1" />
            <select className="h-[24px] max-w-[170px] rounded-md border bg-card px-1 text-[10px]" value={titular ?? ''} aria-label="Produtor"
              onChange={(e) => setTitular(e.target.value || null)} data-testid="receita-produtor">
              <option value="">Produtor: todos</option>
              {(dados?.titulares ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busca emitente, nº"
              className="h-[24px] w-[160px] bg-card px-1.5 text-[10px]" data-testid="receita-busca" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card" data-testid="quadro-da-receita" data-desloca-livre>
            {/* NOTAS-RECEITA-SEM-LANCAMENTO-01: a 1ª ação passa a ter 92px numa linha ("Ver faturamento", "Registrar bem" inteiros) e a Situação 118 (selo + ⓘ) */}
            <table className="w-full min-w-[920px] table-fixed border-collapse">
              <colgroup>
                <col style={{ width: 70 }} /><col /><col style={{ width: 116 }} /><col style={{ width: 72 }} /><col style={{ width: 80 }} />
                <col style={{ width: 92 }} /><col style={{ width: 118 }} /><col style={{ width: 118 }} /><col style={{ width: 168 }} />
              </colgroup>
              <thead><tr className="h-[22px]">
                <th className={TH}>Emissão</th><th className={TH}>Emitente</th><th className={TH}>CNPJ/CPF</th><th className={TH_NUM}>Nº</th>
                <th className={TH_NUM}>Valor</th><th className={TH}>Tipo</th><th className={TH}>Recebeu</th><th className={TH}>Situação</th><th className={TH}>Ações</th>
              </tr></thead>
              <tbody>
                {linhas.map((n) => {
                  const s = seloDaNota(n);
                  const fazer = oQueFazer(n);
                  const apagada = n.sit === 'cancelada' || n.sit === 'ignorada';
                  const temXml = n.tipo === 'completa';
                  const podeLancar = temXml && (n.sit === 'nova' || n.sit === 'pode_estar');
                  return (
                    <tr key={n.id} className={cn(LINHA, 'cursor-pointer hover:bg-muted/60', apagada && 'text-muted-foreground')} data-testid="receita-linha"
                      data-situacao={n.sit} onClick={() => setAberta(n)}>
                      <td className={TD_REGUA}>{dataBR(n.emissao)}</td>
                      <td className={TD_REGUA_TEXTO} title={n.emitenteNome ?? undefined}>{n.emitenteNome ?? '—'}</td>
                      <td className={cn(TD_REGUA, 'tabular-nums')}>{n.emitenteNaTabela || '—'}</td>
                      <td className={TD_REGUA_NUM} title={`série ${n.serie}`}>{n.numero}</td>
                      <td className={cn(TD_REGUA_NUM, apagada && 'line-through')}>{n.valorCent == null ? '—' : brl(n.valorCent)}</td>
                      <td className={cn(TD_REGUA, 'whitespace-nowrap')} title={n.eventos.length ? n.eventos.map((e) => e.descricao ?? e.tpEvento).join(' · ') : undefined}>
                        {n.tipo === 'completa' ? 'Completa' : 'Resumo'}{n.eventos.length ? <span className="text-muted-foreground"> +{n.eventos.length} ev.</span> : null}
                      </td>
                      <td className={TD_REGUA_TEXTO} title={n.titularNome}>{n.titularNome}</td>
                      <td className={TD_REGUA} title={s.dica} onClick={fazer ? (e) => e.stopPropagation() : undefined}>
                        <span className="inline-flex items-center gap-1">
                          <span className={cn('whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9px] font-semibold', s.cor)} data-testid="receita-selo">{s.rotulo}</span>
                          {fazer && <Ajuda titulo={s.rotulo} oQueE={s.dica} porQue="Lido da própria nota (o CFOP e a natureza da operação), automático pelo XML." comoFazer={fazer} />}
                        </span>
                      </td>
                      <td className={TD_REGUA} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {ehAcaoBem(n) && registrarBem ? (
                            <button type="button" className={cn(BOTAO, 'w-[92px] whitespace-nowrap border border-primary/40 bg-card font-semibold text-primary hover:bg-muted')}
                              data-testid="receita-registrar-bem" title="Registrar como bem de terceiro (Patrimônio › Bens de terceiros)"
                              onClick={() => setBem(n)}>Registrar bem</button>
                          ) : ehAcaoFaturamento(n) ? (
                            <button type="button" className={cn(BOTAO, 'w-[92px] whitespace-nowrap border border-primary/40 bg-card font-semibold text-primary hover:bg-muted')}
                              data-testid="receita-ver-faturamento" title={n.citadas.length ? `A NF de faturamento citada: ${n.citadas.join(', ')}` : 'A nota não cita o faturamento'}
                              onClick={() => setAberta(n)}>Ver faturamento</button>
                          ) : (
                          <button type="button" className={cn(BOTAO, 'w-[92px] whitespace-nowrap', podeLancar ? 'bg-[#E7C873] font-semibold text-foreground hover:bg-[#D9B95F]' : 'invisible')}
                            disabled={!podeLancar || ocupada === n.id} data-testid="receita-lancar"
                            title='Abre o "Da nota fiscal" com este XML (o mesmo caminho do arquivo solto)'
                            onClick={() => (n.candidatos.length ? setCasar(n) : void comXml(n, aoLancar))}>Lançar</button>
                          )}
                          <button type="button" className={cn(BOTAO, 'w-[34px] border', temXml ? 'bg-card hover:bg-muted' : 'cursor-not-allowed text-muted-foreground/50')}
                            disabled={!temXml || ocupada === n.id} data-testid="receita-pdf"
                            title={temXml ? 'Abre o DANFE da nota numa aba (imprimir ou salvar em PDF)' : 'Sem XML ainda: só o resumo da Receita'}
                            onClick={() => { const aba = abrirDanfe(); void comXml(n, (f) => mostrarNaAba(aba, f)); }}>PDF</button>
                          <button type="button" className={cn(BOTAO, 'w-[30px] border bg-card hover:bg-muted')} data-testid="receita-ver"
                            title="Ver os dados da nota" onClick={() => setAberta(n)}>Ver</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {linhas.length === 0 && (
                  <tr className={LINHA}><td colSpan={9} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')} data-testid="receita-vazia">
                    {erro ?? (carregando ? 'Carregando…' : 'Nenhuma nota aqui.')}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={cn(RODAPE_REGUA, 'flex h-[23px] items-center gap-3 rounded-md px-2')} data-testid="receita-rodape">
            <span className="tabular-nums">{linhas.length} notas</span>
            <span className="tabular-nums">Total R$ {brl(totalDaLista(linhas))} (sem canceladas)</span>
            <span className="flex-1" />
            <span className="tabular-nums">{pedemCiencia} pedem ciência · {aLancar} a lançar</span>
          </div>
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" data-testid="receita-aviso" title={aviso ?? undefined}>
            {aviso ?? 'Só leitura: nada aqui muda lançamento sem o "Da nota fiscal". Dar ciência e Ignorar vêm na próxima fatia.'}
          </span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
        </div>
        {aberta && <DadosDaNota n={aberta} aoFechar={() => setAberta(null)} />}
        {bem && registrarBem && <RegistrarBemDeTerceiro n={bem} registrar={registrarBem} aoFechar={(frase) => { setBem(null); if (frase) setAviso(frase); }} />}
        {casar && <PodeEstarLancada n={casar} ocupada={ocupada === casar.id} aviso={aviso} aoFechar={() => setCasar(null)}
          aoLancarNova={() => { const n = casar; setCasar(null); void comXml(n, aoLancar); }}
          aoVincular={async (id) => {
            const n = casar;
            setOcupada(n.id); setAviso(null);
            try {
              const frase = await aoVincular(arquivoDoXml(n.chave, await lerXml(n.id)), id);
              if (frase) setAviso(frase); else setCasar(null);
            } catch (e) { setAviso(e instanceof Error ? e.message : 'Não consegui ler o XML.'); } finally { setOcupada(null); }
          }} />}
      </DialogContent>
    </Dialog>
  );
}

/** "Ver": os dados que a Receita mandou, em linhas fixas (nada de XML na tela) */
function DadosDaNota({ n, aoFechar }: { n: NotaNaLista; aoFechar: () => void }) {
  const s = seloDaNota(n);
  const campos: [string, string][] = [
    ['Emitente', n.emitenteNome ?? '—'], ['CNPJ/CPF', n.emitenteNaTabela || '—'], ['Emissão', dataBR(n.emissao)],
    ['Nº · série', `${n.numero} · ${n.serie}`], ['Valor', n.valorCent == null ? '—' : `R$ ${brl(n.valorCent)}`],
    ['Tipo', n.tipo === 'completa' ? 'Completa (XML inteiro)' : 'Resumo da Receita'], ['Situação', `${s.rotulo} — ${s.dica}`],
    ['Recebeu', n.titularNome], ['Chave', n.chave.replace(/(\d{4})(?=\d)/g, '$1 ')], ['Arquivo', n.tipo === 'completa' ? nomeDoXml(n.chave) : '—'],
    ['Eventos', n.eventos.length ? n.eventos.map((e) => e.descricao ?? e.tpEvento).join(' · ') : 'nenhum'],
    /* NOTAS-RECEITA-SEM-LANCAMENTO-01 — as ligações que a própria nota dá */
    ['Cita a NF', n.citadas.length ? n.citadas.join(', ') : '—'],
    ...(n.substituta ? [['Substituída por', `NF ${n.substituta}`] satisfies [string, string]] : []),
  ];
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="w-[min(520px,calc(100vw-16px))] max-w-none gap-0 p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="receita-dados">
        <div className="flex h-[34px] items-center bg-primary px-3 pr-10">
          <DialogTitle className="truncate text-[11px] font-semibold text-primary-foreground">Nota {n.numero} · {n.emitenteNome ?? '—'}</DialogTitle>
          <DialogDescription className="sr-only">Os dados da nota que a Receita mandou.</DialogDescription>
        </div>
        <dl className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 p-3 text-[10.5px]">
          {campos.map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words tabular-nums">{v}</dd></Fragment>))}
        </dl>
        <div className="flex justify-end border-t px-3 py-1.5">
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SELO_DA_CLASSE: Record<ClasseDoCandidato, { rotulo: string; cor: string; dica: string }> = {
  mesmo_cnpj: { rotulo: 'mesmo CNPJ', cor: 'bg-emerald-100 text-emerald-800', dica: 'o fornecedor do lançamento tem o CNPJ do emitente' },
  sem_fornecedor: { rotulo: 'sem fornecedor', cor: 'bg-amber-100 text-amber-800', dica: 'o lançamento não tem fornecedor, ou o cadastro não tem CNPJ' },
  outro_fornecedor: { rotulo: 'outro fornecedor', cor: 'bg-zinc-200 text-zinc-700', dica: 'o fornecedor do lançamento é outro: a troca só marcada, na prévia' },
};
const TD_C = cn(TD_REGUA, 'h-[22px]');

/** NOTA-RECEITA-CASAR-01 — o quadro do mock: os lançamentos sem nota com o mesmo valor (−15/+60 dias); nunca casa sozinho */
function PodeEstarLancada({ n, ocupada, aviso, aoFechar, aoVincular, aoLancarNova }: {
  n: NotaNaLista; ocupada: boolean; aviso: string | null; aoFechar: () => void; aoVincular: (lancamentoId: string) => void; aoLancarNova: () => void;
}) {
  const [escolhido, setEscolhido] = useState<string | null>(() => candidatoPreMarcado(n.candidatos));
  const mesmo = n.candidatos.filter((c) => c.classe === 'mesmo_cnpj').length;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex w-[min(1060px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="receita-casar">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10">
          <DialogTitle className="truncate text-[11px] font-semibold text-primary-foreground">Lançar nota da Receita · NF {n.numero}</DialogTitle>
          <DialogDescription className="sr-only">Os lançamentos sem nota que podem ser esta nota.</DialogDescription>
        </div>
        <div className="flex flex-col gap-2 bg-muted p-3">
          <div className="grid grid-cols-[90px_1fr_150px_120px] items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-[10.5px]">
            <div><div className="text-[9.5px] text-muted-foreground">Emissão</div>{dataBR(n.emissao)}</div>
            <div className="min-w-0"><div className="text-[9.5px] text-muted-foreground">Emitente</div><div className="truncate" title={n.emitenteNome ?? undefined}>{n.emitenteNome ?? '—'}</div></div>
            <div><div className="text-[9.5px] text-muted-foreground">CNPJ/CPF</div><span className="tabular-nums">{n.emitenteNaTabela || '—'}</span></div>
            <div className="text-right"><div className="text-[9.5px] text-muted-foreground">Valor</div><span className="tabular-nums">R$ {n.valorCent == null ? '—' : brl(n.valorCent)}</span></div>
          </div>
          <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[10.5px] text-amber-900" data-testid="receita-casar-aviso">
            Esta nota pode já estar lançada: veja os lançamentos sem nota com o mesmo valor (de 15 dias antes a 60 depois da emissão). Criar de novo duplica a despesa.
          </div>
          <div className="max-h-[260px] overflow-auto rounded-md border bg-card">
            <table className="w-full min-w-[900px] table-fixed border-collapse">
              <colgroup><col style={{ width: 28 }} /><col style={{ width: 84 }} /><col style={{ width: 84 }} /><col style={{ width: 150 }} /><col />
                <col style={{ width: 160 }} /><col style={{ width: 90 }} /><col style={{ width: 84 }} /><col style={{ width: 112 }} /></colgroup>
              <thead><tr className="h-[22px]">
                <th className={TH} /><th className={TH}>Competência</th><th className={TH}>Pagamento</th><th className={TH}>Conta</th><th className={TH}>Descrição</th>
                <th className={TH}>Fornecedor</th><th className={TH_NUM}>Valor</th><th className={TH}>Status</th><th className={TH}>Por que</th>
              </tr></thead>
              <tbody>
                {n.candidatos.map((c) => {
                  const selo = SELO_DA_CLASSE[c.classe];
                  return (
                    <tr key={c.id} className={cn('cursor-pointer border-b border-border/40', escolhido === c.id && 'bg-sky-50')} data-testid="receita-candidato"
                      data-classe={c.classe} onClick={() => setEscolhido(c.id)}>
                      <td className={TD_C}><input type="radio" name="candidato" aria-label={`escolher ${c.descricao ?? c.id}`} checked={escolhido === c.id}
                        onChange={() => setEscolhido(c.id)} /></td>
                      <td className={TD_C}>{dataBR(c.competencia)}</td>
                      <td className={TD_C}>{dataBR(c.pagamento ?? c.vencimento)}</td>
                      <td className={cn(TD_REGUA_TEXTO, 'h-[22px]')} title={c.conta ?? undefined}>{c.conta ?? '—'}</td>
                      <td className={cn(TD_REGUA_TEXTO, 'h-[22px]')} title={c.descricao ?? undefined}>{c.descricao ?? '—'}</td>
                      <td className={cn(TD_REGUA_TEXTO, 'h-[22px]')} title={c.fornecedorNome ?? undefined}>{c.fornecedorNome ?? '—'}</td>
                      <td className={cn(TD_REGUA_NUM, 'h-[22px]')}>{brl(c.valorCent)}</td>
                      <td className={TD_C}>{c.conciliado ? 'Conciliado' : c.status === 'realizado' ? 'Realizado' : c.status === 'programado' ? 'Programado' : (c.status ?? '—')}</td>
                      <td className={TD_C} title={selo.dica}><span className={cn('whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9.5px]', selo.cor)}>{selo.rotulo}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rounded-md border bg-card px-2.5 py-1.5 text-[10.5px]">
            <b className="text-primary">Vincular a este</b>: o lançamento recebe o nº e a chave da NF, o XML anexado e os itens; o fornecedor, se faltar ou for outro, é
            oferecido na prévia. <b>Valor, datas, conta, status e conciliação não mudam</b>: quem manda é o pagamento.
          </div>
        </div>
        <div className="flex h-[38px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <span className={cn('min-w-0 flex-1 truncate text-[10px]', aviso ? 'text-destructive' : 'text-muted-foreground')} data-testid="receita-casar-rodape"
            title={aviso ?? undefined}>
            {aviso ?? <>{n.candidatos.length} {n.candidatos.length === 1 ? 'candidato' : 'candidatos'} · valor exato{mesmo ? ` · ${mesmo} do mesmo CNPJ` : ''}</>}
          </span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" disabled={ocupada} onClick={aoLancarNova} data-testid="receita-lancar-nova">É outra compra: lançar nova</Button>
          <Button size="sm" className="h-[24px] text-[10px]" disabled={!escolhido || ocupada} onClick={() => escolhido && aoVincular(escolhido)}
            data-testid="receita-vincular">Vincular a este</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** NOTAS-RECEITA-SEM-LANCAMENTO-01 — "Registrar bem de terceiro": a PRÉVIA pela nota (motivo, de quem, quando, os itens) e só grava no
 *  "Registrar" (a mesma RPC com p_simular). A recusa do banco fica escrita no modal. */
function RegistrarBemDeTerceiro({ n, registrar, aoFechar }: {
  n: NotaNaLista; registrar: (chave: string, previsao: string | null, observacao: string | null, simular: boolean) => Promise<RespostaDoBem>;
  aoFechar: (frase: string | null) => void;
}) {
  const [previa, setPrevia] = useState<RespostaDoBem | null>(null);
  const [previsao, setPrevisao] = useState('');
  const [obs, setObs] = useState('');
  const [gravando, setGravando] = useState(false);
  /* a prévia ao abrir (a mesma RPC com p_simular); a resposta de uma nota antiga não escreve depois de fechar */
  useEffect(() => {
    let vivo = true;
    void registrar(n.chave, null, null, true).then((r) => { if (vivo) setPrevia(r); });
    return () => { vivo = false; };
  }, [n.chave, registrar]);
  const MOTIVO: Record<string, string> = { comodato: 'Comodato — o bem é do fornecedor, emprestado', demonstracao: 'Demonstração — volta ao fornecedor', conserto: 'Conserto — vai e volta' };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(null); }}>
      <DialogContent className="w-[min(600px,calc(100vw-16px))] max-w-none gap-0 p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="receita-bem">
        <div className="flex h-[34px] items-center bg-primary px-3 pr-10">
          <DialogTitle className="truncate text-[11px] font-semibold text-primary-foreground">Registrar bem de terceiro · NF {n.numero}</DialogTitle>
          <DialogDescription className="sr-only">A prévia pela nota de remessa; nada grava antes de Registrar.</DialogDescription>
        </div>
        <div className="space-y-2 bg-muted p-3 text-[10.5px]">
          {!previa && <div className="text-muted-foreground">Lendo a nota…</div>}
          {previa && previa.ok === false && <div className="text-destructive" data-testid="receita-bem-recusa">{previa.frase}</div>}
          {previa && previa.ok && (<>
            <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-2 gap-y-1">
              <span className="text-muted-foreground">Motivo</span><span className="font-semibold">{MOTIVO[previa.motivo] ?? previa.motivo}</span>
              <span className="text-muted-foreground">De</span><span className="truncate" title={previa.fornecedor ?? undefined}>{previa.fornecedor ?? '—'} · {n.emitenteNaTabela || '—'}</span>
              <span className="text-muted-foreground">Recebido em</span><span className="tabular-nums">{dataBR(previa.data)}</span>
              <span className="text-muted-foreground">Previsão de devolução</span>
              <div className="w-[150px]" data-testid="receita-bem-previsao"><DatePicker value={previsao} onChange={setPrevisao} className="h-[24px] text-[10px]" /></div>
              <span className="text-muted-foreground">Observação</span>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="onde está, contrato…" className="h-[24px] bg-card px-1.5 text-[10px]" />
            </div>
            <table className="w-full table-fixed border-collapse rounded-md bg-card">
              <colgroup><col style={{ width: 30 }} /><col /><col style={{ width: 60 }} /><col style={{ width: 120 }} /></colgroup>
              <thead><tr className="h-[22px]"><th className={TH}>#</th><th className={TH}>Bem (da nota)</th><th className={TH_NUM}>Qtd.</th><th className={TH_NUM}>Valor de referência</th></tr></thead>
              <tbody>{previa.itens.map((i) => (
                <tr key={i.n} className={LINHA} data-testid="receita-bem-item"><td className={TD_REGUA}>{i.n}</td><td className={TD_REGUA_TEXTO} title={i.descricao}>{i.descricao}</td>
                  <td className={TD_REGUA_NUM}>{i.quantidade == null ? '—' : i.quantidade.toLocaleString('pt-BR')}</td>
                  <td className={TD_REGUA_NUM}>{i.valor == null ? '—' : brl(Math.round(i.valor * 100))}</td></tr>))}</tbody>
            </table>
            <div className="text-muted-foreground">Não entra no patrimônio do cliente (nem na depreciação nem no valor dos bens). Fica em Bens de terceiros até a nota de retorno.</div>
          </>)}
        </div>
        <div className="flex h-[34px] items-center justify-end gap-2 border-t bg-card px-3">
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={() => aoFechar(null)}>Cancelar</Button>
          <Button size="sm" className="h-[24px] text-[10px]" disabled={!previa || previa.ok === false || gravando} data-testid="receita-bem-registrar"
            onClick={async () => {
              setGravando(true);
              const r = await registrar(n.chave, previsao || null, obs.trim() || null, false);
              setGravando(false);
              if (r.ok === false) setPrevia(r); else aoFechar(`Registrado: ${r.itens.length} ${r.itens.length === 1 ? 'bem' : 'bens'} da NF ${r.nf} em Bens de terceiros.`);
            }}>Registrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
