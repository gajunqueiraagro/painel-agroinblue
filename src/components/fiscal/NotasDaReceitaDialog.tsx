/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — "Notas da Receita" (mock ui-validar/notas-receita-f34.html, aprovado 16/11 15:15; Chat 20:05).
 * A casca é a da caixa de boletos (cabeçalho azul, abas com contagem reservada, quadro com rolagem própria, rodapé azul com o total).
 * SÓ LEITURA: lista o que a busca gravou; "Lançar" entrega o XML ao "Da nota fiscal" de hoje (D1), "PDF" baixa o XML (D3), a linha
 * abre os dados ("Ver"). Dar ciência (F3.3) e Ignorar (RPC nova) não entram nesta fatia.
 * NOTA-RECEITA-CASAR-01 (mock aprovado 17/11, D1–D4): "Lançar" numa nota com candidatos mostra ANTES o quadro "pode já estar lançada";
 * "Vincular a este" leva o XML à porta 2 do "+ Da nota" a partir do lançamento escolhido (o Anexar de hoje: valor, datas, conta, status
 * e conciliação NÃO mudam); nunca casa sozinho.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RetornoDaCamada } from '@/components/ui/camadas';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { RODAPE_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { LigarACompraDialog } from '@/components/fiscal/LigarACompraDialog';
import { lerXmlDaReceita, type DadosDaReceita } from '@/hooks/useNotasDaReceita';
import { abrirAbaDoDanfe, mostrarDanfe } from '@/lib/fiscal/abrirDanfe';
import {
  ABAS_DA_RECEITA, arquivoDoXml, candidatoPreMarcado, dicaDoVenc, filtrarBusca, nomeDoXml, seloDaNota, tomDoVenc, totalDaLista,
  vencidaSemLancamento, fraseDaLigacao, type AbaDaReceita, type ClasseDoCandidato, type NotaNaLista,
  MOTIVOS_IGNORAR, podeIgnorar, fraseDaIgnorada, type MotivoIgnorar,
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
  const lig = ligadaDaDemo(n);
  if (lig) return `Clique em "Ver ${lig.tipo}" para abrir a NF ${lig.outra}. Nada a lançar nesta.`;
  if (n.classe.motivo === 'retorno_demonstracao') return n.demonstracao ? `Nada a lançar: fecha a demonstração NF ${n.demonstracao.outra}.` : 'Nada a lançar: fecha a demonstração.';
  if (ehBemDeTerceiro(n.classe)) return 'Clique em "Registrar bem": ele fica em Patrimônio › Bens de terceiros até voltar ou ser comprado.';
  if (n.classe.motivo === 'entrega_futura') return n.citadas.length ? `Lance a NF de faturamento ${n.citadas.join(', ')} (se ainda não estiver); esta só confirma a entrega.` : 'Lance a NF de faturamento (5922) do mesmo pedido; esta só confirma a entrega.';
  if (n.classe.motivo === 'devolucao') return 'Abata do fornecedor: ligue à nota original e ao lançamento dela (o gesto de baixa).';
  return 'Nada a lançar: fica aqui para consulta.';
}
const ehAcaoFaturamento = (n: NotaNaLista) => n.sit === 'nao_financeira' && n.classe.classe === 'nao_financeira' && n.classe.motivo === 'entrega_futura';
/* NOTA-DEMONSTRACAO-01: a demonstração JÁ LIGADA à compra/ao retorno não registra bem (o bem já saiu): a ação vira "Ver compra"/"Ver retorno" */
const ligadaDaDemo = (n: NotaNaLista) => (n.demonstracao?.papel === 'demo' ? n.demonstracao : null);
const ehAcaoBem = (n: NotaNaLista) => n.sit === 'nao_financeira' && ehBemDeTerceiro(n.classe) && !ligadaDaDemo(n);

/* NOTAS-RECEITA-VENC-01 — as colunas que ordenam (o padrão segue a emissão, a mais nova em cima) */
type ColunaDaReceita = 'emissao' | 'emitente' | 'numero' | 'valor' | 'venc';
const COLUNAS_DA_RECEITA: ColunaOrdenavel<NotaNaLista, ColunaDaReceita>[] = [
  { coluna: 'emissao', tipo: 'data', valor: (n) => n.emissao },
  { coluna: 'emitente', tipo: 'texto', valor: (n) => n.emitenteNome },
  { coluna: 'numero', tipo: 'numero', valor: (n) => Number(n.numero.replace(/\D/g, '')) || null },
  { coluna: 'valor', tipo: 'numero', valor: (n) => n.valorCent },
  { coluna: 'venc', tipo: 'data', valor: (n) => n.venc.proxima?.vencimento ?? null },
];

/** a coluna "Parc." ao lado (ALINHAMENTO SOBERANO: a data sozinha na coluna dela): "k/N" com várias, "à vista" sem duplicata, vazio com 1 */
function CelulaParcela({ n }: { n: NotaNaLista }) {
  const v = n.venc;
  if (!v.proxima) return v.aVista ? <span className="text-muted-foreground">à vista</span> : null;
  return v.todas.length > 1 ? <span className={cn('tabular-nums', !tomDoVenc(n) && 'text-muted-foreground')}>{v.indice}/{v.todas.length}</span> : null;
}

/** a célula "Venc.": a data da próxima duplicata; o clique abre todas (nº · venc · valor) */
function CelulaVenc({ n }: { n: NotaNaLista }) {
  const v = n.venc;
  const tom = tomDoVenc(n);
  if (!v.proxima) return <span className="text-muted-foreground">—</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn('tabular-nums hover:underline',
          tom === 'vencida' && 'font-semibold text-red-700', tom === 'perto' && 'font-semibold text-amber-700')}
          title={dicaDoVenc(n) ?? 'Ver as parcelas da nota'} data-testid="receita-venc" data-tom={tom ?? ''} onClick={(e) => e.stopPropagation()}>
          {dataBR(v.proxima.vencimento)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[230px] p-1.5" onClick={(e) => e.stopPropagation()} data-testid="receita-parcelas">
        <p className="mb-1 text-[10px] font-semibold">Parcelas da NF {n.numero}</p>
        <table className="w-full table-fixed border-collapse text-[10px] tabular-nums">
          <colgroup><col style={{ width: 44 }} /><col style={{ width: 78 }} /><col /></colgroup>
          <thead><tr className="h-[18px]"><th className={TH}>Nº</th><th className={TH}>Venc.</th><th className={TH_NUM}>Valor</th></tr></thead>
          <tbody>
            {v.todas.map((d, i) => (
              <tr key={`${d.numero}-${i}`} className={cn(LINHA, i + 1 === v.indice && 'bg-muted font-semibold')}>
                <td className={TD_REGUA}>{d.numero}</td><td className={TD_REGUA}>{dataBR(d.vencimento)}</td><td className={TD_REGUA_NUM}>{brl(d.valorCent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  );
}

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

export function NotasDaReceitaDialog({ clienteNome, dados, carregando, erro, aoFechar, aoLancar, aoVincular, lerXml = lerXmlDaReceita, abaInicial,
  abrirDanfe = abrirAbaDoDanfe, mostrarNaAba = mostrarDanfe, registrarBem, retorno = null, ligarACompra, ignorar }: {
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
  /** NAV-VOLTA-ORIGEM-01 — a volta da camada de cima (o "Da nota fiscal"/a nota abertos daqui): muda `n` a cada volta */
  retorno?: RetornoDaCamada | null;
  /** DRE-PAINEL-01 — a aba em que a lista abre quando vem de um link (o "Ver notas" da leitura do DRE abre em "A lançar"). */
  abaInicial?: AbaDaReceita;
  /** ENTREGA-FUTURA-LIGAR-01 — "Ligar à compra" na remessa de entrega futura (o cliente e a busca do faturamento pela chave); sem ele, fica o
   *  "Ver faturamento" de antes. `aoLigar` relê a lista (a remessa ligada passa a "Já no sistema"). */
  ligarACompra?: { clienteId: string; buscarFaturamento?: (titularId: string, chave: string) => Promise<{ ok: boolean; frase: string }>; aoLigar: () => void;
    /** a bancada injeta */ carregar?: Parameters<typeof LigarACompraDialog>[0]['carregar']; ligar?: Parameters<typeof LigarACompraDialog>[0]['ligar'] };
  /** NOTA-IGNORAR-01 — ignorar / desfazer (devolvem a frase da recusa; null = gravou e quem chama relê a lista); sem ele, os botões não aparecem */
  ignorar?: { ignorar: (n: NotaNaLista, motivo: MotivoIgnorar, texto: string | null) => Promise<string | null>; desfazer: (n: NotaNaLista) => Promise<string | null> };
}) {
  const [aba, setAba] = useState<AbaDaReceita>(abaInicial ?? 'todas');
  const [busca, setBusca] = useState('');
  const [titular, setTitular] = useState<string | null>(null);
  const [aberta, setAberta] = useState<NotaNaLista | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [casar, setCasar] = useState<NotaNaLista | null>(null);
  const [bem, setBem] = useState<NotaNaLista | null>(null);
  const [ligando, setLigando] = useState<NotaNaLista | null>(null);
  const [soVencidas, setSoVencidas] = useState(false);
  const [ignorando, setIgnorando] = useState<NotaNaLista | null>(null);
  /* NAV-VOLTA-ORIGEM-01 — a linha de onde saiu (e a de baixo dela): na volta, a linha fica destacada; se ela saiu da aba (lançou, vinculou),
     o destaque vai para a PRÓXIMA (o fluxo em série, sem reabrir nada) */
  const [origem, setOrigem] = useState<{ chave: string; proxima: string | null } | null>(null);
  const [voltou, setVoltou] = useState(false);
  const quadro = useRef<HTMLDivElement>(null);
  useEffect(() => { if (retorno && origem) setVoltou(true); }, [retorno?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const todas = useMemo(() => filtrarBusca(dados?.lista ?? [], busca, titular), [dados, busca, titular]);
  const filtro = ABAS_DA_RECEITA.find((a) => a.valor === aba)?.filtro ?? (() => true);
  const vencidas = todas.filter(vencidaSemLancamento).length;
  const filtradas = useMemo(() => todas.filter(filtro).filter((n) => !soVencidas || vencidaSemLancamento(n)), [todas, filtro, soVencidas]);
  const { ordem, alternar, ordenadas: linhas } = useOrdenacaoTabela(filtradas, COLUNAS_DA_RECEITA, { coluna: 'emissao', direcao: 'desc' });
  const marcarOrigem = (n: NotaNaLista) => {
    const i = linhas.findIndex((x) => x.chave === n.chave);
    setOrigem({ chave: n.chave, proxima: linhas[i + 1]?.chave ?? linhas[i - 1]?.chave ?? null }); setVoltou(false);
  };
  const destaque = voltou && origem
    ? (linhas.some((x) => x.chave === origem.chave) ? origem.chave : origem.proxima && linhas.some((x) => x.chave === origem.proxima) ? origem.proxima : null)
    : null;
  useEffect(() => {
    const linha = destaque ? quadro.current?.querySelector(`[data-chave="${destaque}"]`) : null;
    if (linha && typeof linha.scrollIntoView === 'function') linha.scrollIntoView({ block: 'nearest' });
  }, [destaque]);
  const pedemCiencia = todas.filter((n) => n.sit === 'pede_ciencia').length;
  const aLancar = todas.filter((n) => n.sit === 'nova' || n.sit === 'pode_estar').length;

  const comXml = async (n: NotaNaLista, fazer: (f: File) => void | Promise<void>) => {
    setOcupada(n.id); setAviso(null);
    try { await fazer(arquivoDoXml(n.chave, await lerXml(n.id))); } catch (e) { setAviso(e instanceof Error ? e.message : 'Não consegui ler o XML.'); } finally { setOcupada(null); }
  };
  /* NOTA-IGNORAR-01 — "Desfazer" na aba Ignoradas: a nota volta para onde estava (a lista relê por quem chama) */
  const desfazerIgnorar = async (n: NotaNaLista) => {
    if (!ignorar) return;
    setOcupada(n.id); setAviso(null);
    try { const f = await ignorar.desfazer(n); setAviso(f ?? `NF ${n.numero} voltou para a lista.`); } finally { setOcupada(null); }
  };
  const botaoLancar = (n: NotaNaLista, podeLancar: boolean, largura: string) => (
    <button type="button" className={cn(BOTAO, largura, 'whitespace-nowrap', podeLancar ? 'bg-[#E7C873] font-semibold text-foreground hover:bg-[#D9B95F]' : 'invisible')}
      disabled={!podeLancar || ocupada === n.id} data-testid="receita-lancar"
      title='Abre o "Da nota fiscal" com este XML (o mesmo caminho do arquivo solto)'
      onClick={() => { marcarOrigem(n); if (n.candidatos.length) setCasar(n); else void comXml(n, aoLancar); }}>Lançar</button>
  );

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
            {/* NOTAS-RECEITA-VENC-01 — o filtro rápido: só as vencidas que ainda não estão lançadas (marca navy, como a seleção da casa) */}
            <button type="button" aria-pressed={soVencidas} onClick={() => setSoVencidas((x) => !x)} data-testid="receita-so-vencidas"
              title="Vencidas sem lançamento: só as notas com duplicata vencida que ainda não estão lançadas — confira se já pagou"
              className={cn('h-[24px] shrink-0 whitespace-nowrap rounded-md border px-1.5 text-[10px]',
                soVencidas ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-red-700 hover:bg-muted')}>
              Vencidas <TextoReservado texto={dados ? String(vencidas) : '—'} reserva="999" />
            </button>
            <span className="flex-1" />
            <select className="h-[24px] w-[130px] flex-none truncate rounded-md border bg-card px-1 text-[10px]" value={titular ?? ''} aria-label="Produtor"
              onChange={(e) => setTitular(e.target.value || null)} data-testid="receita-produtor">
              <option value="">Produtor: todos</option>
              {(dados?.titulares ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busca emitente, nº"
              className="h-[24px] w-[110px] bg-card px-1.5 text-[10px]" data-testid="receita-busca" />
          </div>
          <div ref={quadro} className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card" data-testid="quadro-da-receita" data-desloca-livre>
            {/* NOTAS-RECEITA-SEM-LANCAMENTO-01: a 1ª ação passa a ter 92px numa linha ("Ver faturamento", "Registrar bem" inteiros) e a Situação 118 (selo + ⓘ) */}
            {/* NOTAS-RECEITA-VENC-01: + "Venc." (76, só a data) e "Parc." (44: "12/12" · "à vista"); "Recebeu" e "Tipo" cedem 54+8 (cabe a 1024: 982px) */}
            <table className="w-full min-w-[982px] table-fixed border-collapse">
              <colgroup>
                <col style={{ width: 76 }} /><col /><col style={{ width: 116 }} /><col style={{ width: 72 }} /><col style={{ width: 80 }} />
                <col style={{ width: 76 }} /><col style={{ width: 44 }} /><col style={{ width: 84 }} /><col style={{ width: 64 }} /><col style={{ width: 118 }} /><col style={{ width: 168 }} />
              </colgroup>
              <thead><tr className="h-[22px]">
                <ThOrdenavel coluna="emissao" rotulo="Emissão" ordem={ordem} onOrdenar={alternar} className={TH} />
                <ThOrdenavel coluna="emitente" rotulo="Emitente" ordem={ordem} onOrdenar={alternar} className={TH} />
                <th className={TH}>CNPJ/CPF</th>
                <ThOrdenavel coluna="numero" rotulo="Nº" ordem={ordem} onOrdenar={alternar} className={TH_NUM} alinhaDireita />
                <ThOrdenavel coluna="valor" rotulo="Valor" ordem={ordem} onOrdenar={alternar} className={TH_NUM} alinhaDireita />
                <ThOrdenavel coluna="venc" rotulo="Venc." ordem={ordem} onOrdenar={alternar} className={TH} /><th className={TH}>Parc.</th>
                <th className={TH}>Tipo</th><th className={TH}>Recebeu</th><th className={TH}>Situação</th><th className={TH}>Ações</th>
              </tr></thead>
              <tbody>
                {linhas.map((n) => {
                  const s = seloDaNota(n);
                  const fazer = oQueFazer(n);
                  const apagada = n.sit === 'cancelada' || n.sit === 'ignorada';
                  const temXml = n.tipo === 'completa';
                  const podeLancar = temXml && (n.sit === 'nova' || n.sit === 'pode_estar');
                  return (
                    <tr key={n.id} className={cn(LINHA, 'cursor-pointer hover:bg-muted/60', apagada && 'text-muted-foreground',
                      destaque === n.chave && 'bg-sky-50 outline outline-1 -outline-offset-1 outline-sky-400')} data-testid="receita-linha"
                      data-situacao={n.sit} data-chave={n.chave} data-destaque={destaque === n.chave ? '' : undefined} onClick={() => setAberta(n)}>
                      <td className={TD_REGUA}>{dataBR(n.emissao)}</td>
                      <td className={TD_REGUA_TEXTO} title={n.emitenteNome ?? undefined}>{n.emitenteNome ?? '—'}</td>
                      <td className={cn(TD_REGUA, 'tabular-nums')}>{n.emitenteNaTabela || '—'}</td>
                      <td className={TD_REGUA_NUM} title={`série ${n.serie}`}>{n.numero}</td>
                      <td className={cn(TD_REGUA_NUM, apagada && 'line-through')}>{n.valorCent == null ? '—' : brl(n.valorCent)}</td>
                      <td className={TD_REGUA} onClick={(e) => e.stopPropagation()}><CelulaVenc n={n} /></td>
                      <td className={TD_REGUA}><CelulaParcela n={n} /></td>
                      <td className={cn(TD_REGUA, 'whitespace-nowrap')} title={n.eventos.length ? n.eventos.map((e) => e.descricao ?? e.tpEvento).join(' · ') : undefined}>
                        {n.tipo === 'completa' ? 'Completa' : 'Resumo'}{n.eventos.length ? <span className="text-muted-foreground"> +{n.eventos.length} ev.</span> : null}
                      </td>
                      <td className={TD_REGUA_TEXTO} title={n.titularNome}>{n.titularNome}</td>
                      <td className={TD_REGUA} title={n.ignorada ? `Ignorada: ${fraseDaIgnorada(n.ignorada)}` : s.dica} onClick={fazer ? (e) => e.stopPropagation() : undefined}
                        data-testid={n.ignorada ? 'receita-ignorada-motivo' : undefined}>
                        <span className="inline-flex items-center gap-1">
                          <span className={cn('whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9px] font-semibold', s.cor)} data-testid="receita-selo">{s.rotulo}</span>
                          {fazer && <Ajuda titulo={s.rotulo} oQueE={s.dica} porQue="Lido da própria nota (o CFOP e a natureza da operação), automático pelo XML." comoFazer={fazer} />}
                          {/* NOTA-DEMONSTRACAO-01 — a compra do bem que esteve em demonstração */}
                          {n.demonstracao?.papel === 'compra' && (
                            <span className={cn('whitespace-nowrap rounded-full px-1 py-[1px] text-[8.5px] font-semibold ring-1',
                              n.demonstracao.por === 'fornecedor' ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-sky-50 text-sky-800 ring-sky-300')}
                              title={fraseDaLigacao(n.demonstracao)} data-testid="receita-da-demo">demo</span>
                          )}
                        </span>
                      </td>
                      <td className={TD_REGUA} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {ehAcaoBem(n) && registrarBem ? (
                            <button type="button" className={cn(BOTAO, 'w-[92px] whitespace-nowrap border border-primary/40 bg-card font-semibold text-primary hover:bg-muted')}
                              data-testid="receita-registrar-bem" title="Registrar como bem de terceiro (Patrimônio › Bens de terceiros)"
                              onClick={() => setBem(n)}>Registrar bem</button>
                          ) : ligadaDaDemo(n) ? (
                            <button type="button" className={cn(BOTAO, 'w-[92px] whitespace-nowrap border border-primary/40 bg-card font-semibold text-primary hover:bg-muted')}
                              data-testid="receita-ver-ligada" title={n.demonstracao ? fraseDaLigacao(n.demonstracao) : undefined}
                              onClick={() => { const o = dados?.lista.find((x) => x.chave === ligadaDaDemo(n)?.outraChave); setAberta(o ?? n); }}>
                              {ligadaDaDemo(n)?.tipo === 'retorno' ? 'Ver retorno' : 'Ver compra'}
                            </button>
                          ) : ehAcaoFaturamento(n) && ligarACompra ? (
                            <button type="button" className={cn(BOTAO, 'w-[92px] whitespace-nowrap border border-primary/40 bg-card font-semibold text-primary hover:bg-muted')}
                              data-testid="receita-ligar-compra" title={n.citadas.length ? `Guardar esta remessa na compra (cita o faturamento NF ${n.citadas.join(', ')})` : 'Guardar esta remessa na compra (sem NF de faturamento)'}
                              onClick={() => setLigando(n)}>Ligar à compra</button>
                          ) : ehAcaoFaturamento(n) ? (
                            <button type="button" className={cn(BOTAO, 'w-[92px] whitespace-nowrap border border-primary/40 bg-card font-semibold text-primary hover:bg-muted')}
                              data-testid="receita-ver-faturamento" title={n.citadas.length ? `A NF de faturamento citada: ${n.citadas.join(', ')}` : 'A nota não cita o faturamento'}
                              onClick={() => setAberta(n)}>Ver faturamento</button>
                          ) : n.sit === 'ignorada' && ignorar ? (
                            /* NOTA-IGNORAR-01 — a ignorada: "Desfazer" no mesmo lugar (92px) */
                            <button type="button" className={cn(BOTAO, 'w-[92px] whitespace-nowrap border border-primary/40 bg-card font-semibold text-primary hover:bg-muted')}
                              disabled={ocupada === n.id} data-testid="receita-desfazer-ignorar"
                              title="Desfazer o ignorar: a nota volta para a lista em que estava" onClick={() => void desfazerIgnorar(n)}>Desfazer</button>
                          ) : ignorar && podeIgnorar(n) ? (
                            /* NOTA-IGNORAR-01 — os 92px viram Lançar (46) + Ignorar (42): nenhuma coluna muda de largura */
                            <span className="flex w-[92px] items-center gap-1">
                              {botaoLancar(n, podeLancar, 'w-[46px]')}
                              <button type="button" className={cn(BOTAO, 'w-[42px] whitespace-nowrap border bg-card hover:bg-muted',
                                n.sugestaoIgnorar && 'border-amber-400 font-semibold text-amber-800')}
                                disabled={ocupada === n.id} data-testid="receita-ignorar" data-sugerido={n.sugestaoIgnorar ? '' : undefined}
                                title={n.sugestaoIgnorar?.frase ?? 'Ignorar esta nota (compra pessoal, não é da operação, duplicada…): sai do "A lançar"'}
                                onClick={() => setIgnorando(n)}>Ignorar</button>
                            </span>
                          ) : botaoLancar(n, podeLancar, 'w-[92px]')}
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
                  <tr className={LINHA}><td colSpan={11} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')} data-testid="receita-vazia">
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
            {aviso ?? 'Só leitura: lançar ou vincular pelo Da nota fiscal.'}
          </span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
        </div>
        {aberta && <DadosDaNota n={aberta} aoFechar={() => setAberta(null)} />}
        {ligando && ligarACompra && dados && (
          <LigarACompraDialog n={ligando} lista={dados.lista} clienteId={ligarACompra.clienteId} lerXml={lerXml}
            buscarFaturamento={ligarACompra.buscarFaturamento} carregar={ligarACompra.carregar} ligar={ligarACompra.ligar}
            aoFechar={(ligou) => { setLigando(null); if (ligou) { setAviso('Remessas ligadas à compra: ficam nos documentos dos lançamentos (não somam no Documentado).'); ligarACompra.aoLigar(); } }} />
        )}
        {ignorando && ignorar && (
          <IgnorarNota n={ignorando} ignorar={(m, t) => ignorar.ignorar(ignorando, m, t)}
            aoFechar={(feito) => { const n = ignorando; setIgnorando(null); if (feito) setAviso(`NF ${n.numero} ignorada: está na aba "Ignoradas" (Desfazer volta).`); }} />
        )}
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
    /* UI-LARGURA-FIXA-01: as linhas são SEMPRE as mesmas (a altura não depende da nota): sem dado, "—" */
    ['Substituída por', n.substituta ? `NF ${n.substituta}` : '—'],
    ['Demonstração', n.demonstracao ? fraseDaLigacao(n.demonstracao) : '—'],
    ['Vencimento', n.venc.proxima ? `${dataBR(n.venc.proxima.vencimento)}${n.venc.todas.length > 1 ? ` · parcela ${n.venc.indice}/${n.venc.todas.length}` : ''}` : n.venc.aVista ? 'à vista' : '—'],
  ];
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="w-[min(520px,calc(100vw-16px))] max-w-none gap-0 p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="receita-dados">
        <div className="flex h-[34px] items-center bg-primary px-3 pr-10">
          <DialogTitle className="truncate text-[11px] font-semibold text-primary-foreground">Nota {n.numero} · {n.emitenteNome ?? '—'}</DialogTitle>
          <DialogDescription className="sr-only">Os dados da nota que a Receita mandou.</DialogDescription>
        </div>
        {/* UI-LARGURA-FIXA-01 (Gabriel 19/11): uma TABELA de linhas fixas — texto longo = "…" + o inteiro no title, nunca quebra (a altura é a mesma em toda nota) */}
        <div className="p-3">
          <table className="w-full table-fixed border-collapse text-[10.5px]">
            <colgroup><col style={{ width: 96 }} /><col /></colgroup>
            <tbody>{campos.map(([k, v]) => (
              <tr key={k} className="h-[20px]"><td className={cn(TD_REGUA, 'text-muted-foreground')}>{k}</td><td className={cn(TD_REGUA_TEXTO, 'tabular-nums')} title={v}>{v}</td></tr>
            ))}</tbody>
          </table>
        </div>
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
          {/* UI-LARGURA-FIXA-01: o quadro tem ALTURA fixa (260), nunca a do número de candidatos */}
          <div className="h-[260px] overflow-auto rounded-md border bg-card">
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
      <DialogContent className="flex h-[min(420px,calc(100vh-16px))] w-[min(600px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="receita-bem">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10">
          <DialogTitle className="truncate text-[11px] font-semibold text-primary-foreground">Registrar bem de terceiro · NF {n.numero}</DialogTitle>
          <DialogDescription className="sr-only">A prévia pela nota de remessa; nada grava antes de Registrar.</DialogDescription>
        </div>
        {/* UI-LARGURA-FIXA-01: o modal tem altura FIXA (420); os itens rolam no quadro deles, que ocupa a sobra */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 bg-muted p-3 text-[10.5px]">
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
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card" data-testid="receita-bem-quadro">
            <table className="w-full table-fixed border-collapse">
              <colgroup><col style={{ width: 30 }} /><col /><col style={{ width: 60 }} /><col style={{ width: 120 }} /></colgroup>
              <thead><tr className="h-[22px]"><th className={TH}>#</th><th className={TH}>Bem (da nota)</th><th className={TH_NUM}>Qtd.</th><th className={TH_NUM}>Valor de referência</th></tr></thead>
              <tbody>{previa.itens.map((i) => (
                <tr key={i.n} className={LINHA} data-testid="receita-bem-item"><td className={TD_REGUA}>{i.n}</td><td className={TD_REGUA_TEXTO} title={i.descricao}>{i.descricao}</td>
                  <td className={TD_REGUA_NUM}>{i.quantidade == null ? '—' : i.quantidade.toLocaleString('pt-BR')}</td>
                  <td className={TD_REGUA_NUM}>{i.valor == null ? '—' : brl(Math.round(i.valor * 100))}</td></tr>))}</tbody>
            </table>
            </div>
            <div className="shrink-0 text-muted-foreground">Não entra no patrimônio do cliente (nem na depreciação nem no valor dos bens). Fica em Bens de terceiros até a nota de retorno.</div>
          </>)}
        </div>
        <div className="flex h-[34px] shrink-0 items-center justify-end gap-2 border-t bg-card px-3">
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

/* NOTA-IGNORAR-01 (Gabriel 23/11) — o modal pequeno do "Ignorar": motivo (Compra pessoal · Não é da operação · Duplicada · Outro + texto) →
   a nota sai do "A lançar" para a aba "Ignoradas". Altura e largura FIXAS; a frase da sugestão e a da recusa têm lugar reservado. */
function IgnorarNota({ n, ignorar, aoFechar }: {
  n: NotaNaLista; ignorar: (motivo: MotivoIgnorar, texto: string | null) => Promise<string | null>; aoFechar: (feito: boolean) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoIgnorar | ''>(n.sugestaoIgnorar?.motivo ?? '');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const falta = !motivo ? 'Escolha o motivo.' : motivo === 'outro' && !texto.trim() ? 'Em "Outro", escreva o motivo.' : null;
  const gravar = async () => {
    if (!motivo || falta) { setErro(falta); return; }
    setGravando(true); setErro(null);
    const f = await ignorar(motivo, texto.trim() || null);
    setGravando(false);
    if (f) setErro(f); else aoFechar(true);
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !gravando) aoFechar(false); }}>
      <DialogContent className="flex h-[260px] w-[min(440px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="receita-ignorar-modal">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10">
          <DialogTitle className="truncate text-[11px] font-semibold text-primary-foreground">Ignorar a NF {n.numero}</DialogTitle>
          <DialogDescription className="sr-only">A nota sai do A lançar e vai para a aba Ignoradas; Desfazer volta.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-3 text-[10.5px]">
          <div className="grid h-[16px] grid-cols-[minmax(0,1fr)_110px] items-center gap-2">
            <span className="truncate" title={n.emitenteNome ?? undefined}>{n.emitenteNome ?? '—'}</span>
            <span className="text-right tabular-nums">{n.valorCent == null ? '—' : `R$ ${brl(n.valorCent)}`}</span>
          </div>
          {/* duas linhas RESERVADAS: a frase quebra, nunca corta (fora de tabela não há "…") */}
          <span className="h-[28px] overflow-hidden text-[9.5px] leading-[14px] text-amber-800" data-testid="receita-ignorar-sugestao">
            {n.sugestaoIgnorar?.frase ?? ''}
          </span>
          <div className="flex h-[16px] items-center gap-1 text-muted-foreground">
            <span>Motivo</span>
            <Ajuda titulo="Ignorar a nota" oQueE="A nota sai do “A lançar” e fica na aba “Ignoradas”, com o motivo, quem e quando."
              porQue="Notas que não são da operação (compra pessoal, duplicada…) não devem ficar pedindo lançamento."
              comoFazer="Escolha o motivo (em “Outro”, escreva qual). Para voltar, use “Desfazer” na aba Ignoradas." />
          </div>
          <Segmentado<MotivoIgnorar | ''> valor={motivo} onEscolher={(v) => { setMotivo(v); setErro(null); }} fonte={10}
            opcoes={MOTIVOS_IGNORAR.map((m) => ({ valor: m.valor, rotulo: m.rotulo }))} />
          <Input value={texto} onChange={(e) => { setTexto(e.target.value); setErro(null); }} maxLength={200} data-testid="receita-ignorar-texto"
            placeholder={motivo === 'outro' ? 'Escreva o motivo' : 'Observação (opcional)'}
            className={cn('h-[24px] bg-card px-1.5 text-[10px]', erro && motivo === 'outro' && !texto.trim() && 'border-destructive')} />
          <span className="h-[28px] overflow-hidden text-[9.5px] leading-[14px] text-destructive" data-testid="receita-ignorar-erro">{erro ?? ''}</span>
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">Desfazer na aba Ignoradas.</span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" disabled={gravando} onClick={() => aoFechar(false)}>Cancelar</Button>
          <Button size="sm" className="h-[24px] w-[64px] text-[10px]" disabled={gravando} onClick={() => void gravar()} data-testid="receita-ignorar-gravar">
            {gravando ? '…' : 'Ignorar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
