/**
 * BOLETO D3d — A CAIXA DE BOLETOS E NOTAS QUE CHEGARAM (mock boleto-caixa-email-v2, aprovado pelo Gabriel 18/11 07:50, "D1–D7 sim").
 *
 * ⚠ TRÊS ABAS (D1): A resolver · Resolvidos · Ignorados. Em "A resolver", um GRUPO por e-mail (os anexos juntos), os arrastados nesta
 *   sessão e os boletos guardados sem lançamento. A regra das linhas é a de `caixaPorEmail.ts` (pura, testada).
 * ⚠ VER O ARQUIVO NUM CLIQUE (D2): clicar na linha mostra o PDF ao lado (a partir de 1366 de largura) ou por cima (o
 *   `VisualizadorDeDocumento` das notas, abaixo disso). O XML sem PDF mostra o resumo da nota.
 * ⚠ A NOTA VAI PARA O CAMINHO DAS NOTAS (D3): "Lançar nota" devolve o arquivo à tela de Lançamentos (`aoLancarNota`), que abre a MESMA
 *   prévia do "+ Da nota". Sem `aoLancarNota` (a caixa aberta do Editar lançamento), a linha diz onde lançar.
 * ⚠ IGNORAR PEDE O MOTIVO (D6) e volta pelo "Ignorados"; nada se apaga.
 * ⚠ LINHA ÚNICA EM TODA TABELA (Gabriel 18/11 07:50, "muitos textos quebrados"): texto corta com "…" e o inteiro no `title`; número,
 *   valor e data nunca cortam; o cabeçalho do grupo é uma linha só (o assunto cede).
 * ⚠ VER E BAIXAR EM TODA LINHA DE ARQUIVO (Gabriel 18/11 11:59, "salvo quando a tela permitir visualizar e salvar"): nas 3 abas, a coluna
 *   👁 ⤓ — Ver abre ao lado (≥ 1366) ou por cima (o PDF no `VisualizadorDeDocumento`; o XML sem PDF, o resumo da nota); Baixar salva o
 *   arquivo com o nome de origem (a linha com XML + PDF pergunta qual, no menu da casa). Os guardados na caixa baixam o PDF deles.
 * ⚠ MODAL DE TAMANHO FIXO, UM SCROLLPORT (a tabela); a faixa, a área de soltar e o rodapé no MESMO lugar em todas as abas.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, Eye } from 'lucide-react';
import { EnderecoDeBoletosDialog } from './EnderecoDeBoletosDialog';
import { VisualizadorDeDocumento } from './VisualizadorDeDocumento';
import {
  MOTIVOS_DE_IGNORAR, rotuloDoMotivo, type EntradaDoEmail, type EntradaEmailApi, type MotivoDeIgnorar,
} from '@/lib/financeiro/boleto/entradaEmailApi';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TH_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TextoReservado } from '@/components/ui/regua-tabela';
import { TAMANHO_MAXIMO } from '@/hooks/useLancamentoDocumentos';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { fraseDeFormatoNaoAceito, type RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { cn } from '@/lib/utils';
import { useCaixaDeBoletos, type LerArquivoDaCaixa } from '@/hooks/useCaixaDeBoletos';
import type { CaixaApi, ItemDaCaixa } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { dataBR, valorBR, type Selo, type Tom } from '@/lib/financeiro/boleto/caixaDeBoletos';
import {
  ABAS_DA_CAIXA_V2, ROTULO_DA_ACAO, contarAResolver, nomeDoRemetente, tituloDaAcao, virouDaEntrada,
  type AbaDaCaixaV2, type Acao, type GrupoDaCaixa, type LinhaDaCaixa, type ResumoDaNota,
} from '@/lib/financeiro/boleto/caixaPorEmail';

/** PDF e XML (o boleto e a nota), vários de uma vez. */
export const REGRA_DA_CAIXA: RegraDeAceite = {
  tipos: ['pdf', 'xml'], varios: true, tamanhoMaxBytes: TAMANHO_MAXIMO, frases: { tipo: fraseDeFormatoNaoAceito(['pdf', 'xml']) },
};
/** A partir desta largura da janela o arquivo aparece AO LADO da lista (abaixo, por cima). */
export const LARGURA_DO_PAINEL_AO_LADO = 1366;

const TOM: Record<Tom, string> = {
  ok: 'bg-green-100 text-green-800', ambar: 'bg-amber-100 text-amber-800', vermelho: 'bg-red-100 text-red-800',
  cinza: 'bg-gray-200 text-gray-700', azul: 'bg-blue-100 text-blue-800',
};
function SeloDaCaixa({ s }: { s: Selo }) {
  return <span className={cn('mr-1 inline-block shrink-0 rounded-[3px] px-1 text-[9.5px] font-semibold leading-[15px]', TOM[s.tom])} data-testid="selo-da-caixa">{s.texto}</span>;
}
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');
const TH_NUM = cn(TH, 'text-right');
const LINHA = 'h-[19px] border-b border-border/40';
const TIPO: Record<LinhaDaCaixa['tipo'], Selo> = {
  nota: { texto: 'Nota fiscal', tom: 'azul' }, boleto: { texto: 'Boleto', tom: 'ok' }, nada: { texto: 'Não sei', tom: 'cinza' },
  lendo: { texto: 'lendo…', tom: 'cinza' }, senha: { texto: 'Boleto?', tom: 'ambar' }, erro: { texto: 'Erro', tom: 'vermelho' },
  sem_anexo: { texto: 'Sem anexo', tom: 'cinza' }, recusado: { texto: 'Recusado', tom: 'vermelho' }, gmail: { texto: 'Gmail', tom: 'ambar' },
};
const BOTAO = 'h-[16px] shrink-0 rounded-[3px] border px-1.5 text-[9.5px] font-medium leading-[14px] disabled:opacity-50';
const BOTAO_P = cn(BOTAO, 'border-[#E7C873] bg-[#E7C873] font-semibold text-foreground hover:bg-[#D9B95F]');
const BOTAO_S = cn(BOTAO, 'border-border bg-card hover:bg-muted');
const BOTAO_X = cn(BOTAO, 'border-border bg-card text-muted-foreground hover:bg-muted');

/* ── as colunas (px medidos: a 918 o modal tem ~900 e a tabela ~880; "No sistema" é a elástica) ── */
const COLS_A_RESOLVER = [86, 150, 40, 136, 76, 86, null, 176] as const;
const COLS_RESOLVIDOS = [86, 190, 40, 150, 116, null, 116, 120] as const;
const COLS_IGNORADOS = [86, 190, 40, 150, 116, null, 116, 140] as const;
/** As colunas de cada tabela (o cabeçalho do grupo e a linha vazia ocupam todas). */
const N_COLUNAS = 8;
function Colunas({ larguras }: { larguras: readonly (number | null)[] }) {
  return <colgroup>{larguras.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>;
}

/** Um arquivo de uma linha da caixa (uma linha de nota pode ter o XML e o PDF). */
export interface ArquivoDaLinha { fonte: string; nome: string; tipo: 'xml' | 'pdf' }

/** 👁 Ver · ⤓ Baixar — em TODA linha com arquivo. Com mais de um arquivo, o Baixar pergunta qual (menu da casa). */
function VerEBaixar({ arquivos, aoVer, aoBaixar }: { arquivos: readonly ArquivoDaLinha[]; aoVer: () => void; aoBaixar: (fonte: string) => void }) {
  const nenhum = arquivos.length === 0;
  const icone = 'inline-flex h-[16px] w-[16px] items-center justify-center rounded-[3px] text-primary hover:bg-muted disabled:opacity-30';
  return (
    <span className="flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={icone} disabled={nenhum} onClick={aoVer} aria-label="Ver o arquivo"
        title={nenhum ? 'sem arquivo' : 'ver o arquivo'} data-testid="ver-arquivo"><Eye className="h-3 w-3" /></button>
      {arquivos.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={icone} aria-label="Baixar" title="baixar: escolha o arquivo" data-testid="baixar-arquivo"><Download className="h-3 w-3" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-[360px]">
            {arquivos.map((a) => (
              <DropdownMenuItem key={a.fonte} className="text-[10px]" title={a.nome} onSelect={() => aoBaixar(a.fonte)} data-testid="baixar-opcao">
                <span className="shrink-0 font-semibold">{a.tipo === 'xml' ? 'XML' : 'PDF'}</span><span className="min-w-0 truncate">{a.nome}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" className={icone} disabled={nenhum} onClick={() => arquivos[0] && aoBaixar(arquivos[0].fonte)} aria-label="Baixar"
          title={nenhum ? 'sem arquivo' : `baixar ${arquivos[0]?.nome ?? ''}`} data-testid="baixar-arquivo"><Download className="h-3 w-3" /></button>
      )}
    </span>
  );
}
const TH_VER = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-center');

function CelulaDaSenha({ nome, sugestoes, aoTentar }: { nome: string; sugestoes: string[]; aoTentar: (senha: string) => void }) {
  const [senha, setSenha] = useState('');
  return (
    <span className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Input value={senha} onChange={(e) => setSenha(e.target.value)} type="password" autoComplete="off" placeholder="senha"
        onKeyDown={(e) => { if (e.key === 'Enter') aoTentar(senha); }}
        className="h-[16px] w-[56px] px-1 text-[10px]" aria-label={`senha de ${nome}`} data-testid="senha-do-boleto" />
      {sugestoes.slice(0, 2).map((s) => (
        <button key={s} type="button" className={BOTAO_S} title="sugestão: os 5 primeiros dígitos do CPF/CNPJ de um titular"
          onClick={() => { setSenha(s); aoTentar(s); }} data-testid="sugestao-de-senha">{s}</button>
      ))}
      <button type="button" className={BOTAO_P} onClick={() => aoTentar(senha)}>abrir</button>
    </span>
  );
}

/** Os botões da linha: o 1º dourado; "Vincular" com mais de um candidato abre a escolha (menu da casa). */
function AcoesDaLinha({ l, ocupado, sugestoes, aoAgir, aoTentarSenha }: {
  l: LinhaDaCaixa; ocupado: boolean; sugestoes: string[];
  aoAgir: (a: Acao, lancamentos?: string[]) => void; aoTentarSenha: (s: string) => void;
}) {
  if (l.acoes.includes('senha')) return <CelulaDaSenha nome={l.arquivo} sugestoes={sugestoes} aoTentar={aoTentarSenha} />;
  const candidatos = l.previa?.ok === true && !(l.previa.jaExiste && l.previa.situacao.lancamentos.length) ? l.previa.candidatos : [];
  return (
    <span className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {l.acoes.map((a, i) => {
        const cls = i === 0 ? BOTAO_P : a === 'ignorar' ? BOTAO_X : BOTAO_S;
        if (a === 'vincular_boleto' && candidatos.length > 1) {
          return (
            <DropdownMenu key={a}>
              <DropdownMenuTrigger asChild>
                <button type="button" className={cls} disabled={ocupado} title="escolha o lançamento" data-testid="acao-vincular_boleto">Vincular ▾</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-[420px]">
                {candidatos.map((c, k) => {
                  const t = c.lancamentos.map((x) => `${x.descricao ?? '—'} · ${dataBR(x.vencimento)} · ${valorBR(x.valor)}`).join(' + ');
                  return (
                    <DropdownMenuItem key={k} className="text-[10px]" title={t} onSelect={() => aoAgir(a, c.lancamentos.map((x) => x.id))}>
                      <span className="truncate">{t}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
        return (
          <button key={a} type="button" className={cls} disabled={ocupado} title={tituloDaAcao(a, l)} data-testid={`acao-${a}`}
            onClick={() => aoAgir(a, a === 'vincular_boleto' ? (candidatos[0]?.lancamentos.map((x) => x.id) ?? []) : undefined)}>
            {ROTULO_DA_ACAO[a]}
          </button>
        );
      })}
    </span>
  );
}

function LinhaAResolver({ l, selecionada, ocupado, sugestoes, arquivos, aoVer, aoBaixar, aoAgir, aoTentarSenha }: {
  l: LinhaDaCaixa; selecionada: boolean; ocupado: boolean; sugestoes: string[]; arquivos: readonly ArquivoDaLinha[];
  aoVer: () => void; aoBaixar: (fonte: string) => void; aoAgir: (a: Acao, lancamentos?: string[]) => void; aoTentarSenha: (s: string) => void;
}) {
  return (
    <tr className={cn(LINHA, 'cursor-pointer hover:bg-muted/50', selecionada && 'bg-blue-50', l.antigo && 'text-muted-foreground')} onClick={aoVer}
      data-testid="linha-da-caixa" data-chave={l.chave}>
      <td className={TD_REGUA}><SeloDaCaixa s={TIPO[l.tipo]} /></td>
      <td className={TD_REGUA_TEXTO} title={l.arquivoTitulo}>{l.arquivo}</td>
      <td className={TD_REGUA}><VerEBaixar arquivos={arquivos} aoVer={aoVer} aoBaixar={aoBaixar} /></td>
      <td className={TD_REGUA_TEXTO} title={l.emitente ?? undefined}>{l.emitente ?? '—'}</td>
      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(l.vencimento)}</td>
      <td className={TD_REGUA_NUM}>{valorBR(l.valor)}</td>
      <td className={TD_REGUA} title={l.noSistema.titulo} data-testid="no-sistema">
        <span className="flex min-w-0 items-center">
          {l.noSistema.selo && <SeloDaCaixa s={l.noSistema.selo} />}
          <span className="min-w-0 truncate">{l.noSistema.texto}</span>
        </span>
      </td>
      <td className={TD_REGUA}>
        <AcoesDaLinha l={l} ocupado={ocupado} sugestoes={sugestoes} aoAgir={aoAgir} aoTentarSenha={aoTentarSenha} />
      </td>
    </tr>
  );
}

function CabecalhoDoGrupo({ g, ocupado, aoIgnorarAntigos }: { g: GrupoDaCaixa; ocupado: boolean; aoIgnorarAntigos: () => void }) {
  const faltam = g.linhas.filter((l) => l.acoes.length > 0).length;
  const antigos = g.linhas.filter((l) => l.antigo && !l.feito).length;
  return (
    <tr className="h-[20px] border-b border-border/60 bg-muted" data-testid="grupo-da-caixa">
      <td colSpan={N_COLUNAS} className={cn(TD_REGUA, 'h-[20px]')} title={g.assunto ? `${g.titulo} · ${g.assunto}` : g.titulo}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 font-semibold tabular-nums">{g.titulo}</span>
          {g.assunto && <span className="min-w-0 flex-1 truncate text-muted-foreground">· {g.assunto}</span>}
          {!g.assunto && <span className="flex-1" />}
          <span className="shrink-0 text-muted-foreground">
            {g.linhas.length} {g.linhas.length === 1 ? 'item' : 'itens'} · {faltam} a resolver
          </span>
          {g.fontesAntigas.length > 0 && (
            <button type="button" className={BOTAO_S} disabled={ocupado} onClick={aoIgnorarAntigos} data-testid="ignorar-antigos"
              title="ignora de uma vez os boletos antigos deste grupo (pede o motivo; volta pelo Ignorados)">Ignorar os {antigos} antigos</button>
          )}
        </span>
      </td>
    </tr>
  );
}

/** O minimodal do Ignorar (D6): o motivo é obrigatório; "Outro" pede o texto (UX-OBRIGATORIOS-01: o campo fica vermelho). */
function IgnorarDialog({ quantos, sugerido, aoCancelar, aoConfirmar }: {
  quantos: number; sugerido: MotivoDeIgnorar | null; aoCancelar: () => void; aoConfirmar: (m: MotivoDeIgnorar, d: string | null) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoDeIgnorar | null>(sugerido);
  const [detalhe, setDetalhe] = useState('');
  const [tentou, setTentou] = useState(false);
  const faltaMotivo = !motivo;
  const faltaDetalhe = motivo === 'outro' && !detalhe.trim();
  const confirmar = () => {
    setTentou(true);
    if (!motivo || faltaDetalhe) return;
    aoConfirmar(motivo, detalhe.trim() || null);
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoCancelar(); }}>
      <DialogContent className="w-[min(400px,calc(100vw-16px))] max-w-none gap-0 overflow-hidden p-0 [&>button]:top-1.5 [&>button]:text-primary-foreground" data-testid="ignorar-dialog">
        <div className="flex h-[30px] items-center justify-between bg-primary px-3 pr-9 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">Ignorar {quantos === 1 ? '1 item' : `${quantos} itens`}</DialogTitle>
          <DialogDescription className="text-[10px] text-primary-foreground/85">nada é apagado</DialogDescription>
        </div>
        <div className="grid gap-1.5 px-3 py-2.5 text-[10.5px]">
          {MOTIVOS_DE_IGNORAR.map((m) => (
            <button key={m.valor} type="button" onClick={() => setMotivo(m.valor)} data-testid={`motivo-${m.valor}`}
              className={cn('flex h-[20px] items-center gap-2 rounded px-1 text-left hover:bg-muted', motivo === m.valor && 'bg-muted font-medium')}>
              <span className={cn('inline-block h-[10px] w-[10px] shrink-0 rounded-full border', motivo === m.valor ? 'border-primary bg-primary' : 'border-muted-foreground')} />
              <span className="truncate">{m.rotulo}</span>
            </button>
          ))}
          <Input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} maxLength={300} data-testid="detalhe-do-motivo"
            placeholder={motivo === 'outro' ? 'escreva o motivo' : 'detalhe (opcional)'}
            className={cn('h-[22px] px-2 text-[10.5px]', tentou && faltaDetalhe && 'border-red-600')} />
          <span className={cn('h-[13px] text-[9.5px]', tentou && (faltaMotivo || faltaDetalhe) ? 'text-red-700' : 'text-muted-foreground')} data-testid="dica-do-motivo">
            {tentou && faltaMotivo ? 'Escolha o motivo.' : tentou && faltaDetalhe ? 'Escreva o motivo.' : 'O arquivo continua guardado. Volta pelo "Ignorados".'}
          </span>
        </div>
        <div className="flex h-[32px] items-center justify-end gap-2 border-t px-3">
          <Button variant="outline" size="sm" className="h-[22px] text-[10px]" onClick={aoCancelar}>Cancelar</Button>
          <Button size="sm" className="h-[22px] bg-[#E7C873] text-[10px] text-foreground hover:bg-[#D9B95F]" onClick={confirmar} data-testid="confirmar-ignorar">
            Ignorar {quantos}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O que se vê no painel: a linha escolhida (de qualquer aba) e os arquivos dela. */
interface Vista { chave: string; rotulo: string; nota: ResumoDaNota | null; arquivos: readonly ArquivoDaLinha[] }

/** O arquivo AO LADO (≥ 1366; abaixo, o mesmo painel por cima para o que não é PDF): o PDF no visualizador do navegador; o XML sem PDF,
 *  o resumo da nota. A faixa tem Baixar e Nova aba. */
function PainelDoArquivo({ vista, arquivo, carregando, aoNovaAba, aoBaixar, largura = 'w-[400px]', comFechar = false }: {
  vista: Vista | null; arquivo: File | null; carregando: boolean; aoNovaAba: () => void; aoBaixar: (fonte: string) => void; largura?: string;
  /** por cima: a faixa deixa o lugar do ✕ do diálogo */
  comFechar?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const ehPdf = !!arquivo && arquivo.type === 'application/pdf';
  useEffect(() => {
    if (!arquivo || !ehPdf || typeof URL.createObjectURL !== 'function') { setUrl(null); return undefined; }
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo, ehPdf]);
  let corpo: ReactNode;
  if (!vista) corpo = <span className="m-auto text-[10px] text-muted-foreground">Clique numa linha para ver o arquivo.</span>;
  else if (carregando) corpo = <span className="m-auto text-[10px] text-muted-foreground">abrindo…</span>;
  else if (ehPdf && url) corpo = <iframe title={arquivo?.name ?? 'arquivo'} src={url} className="h-full w-full border-0" data-testid="pdf-ao-lado" />;
  else if (vista.nota) {
    const n = vista.nota;
    corpo = (
      <div className="grid content-start gap-1 p-3 text-[10px]" data-testid="nota-ao-lado">
        <b className="text-[11px]">NF {n.numero} · {n.emitente ?? '—'}</b>
        <span>Valor: {valorBR(n.valor)} · 1º vencimento: {dataBR(n.vencimento)}</span>
        <span className="break-all text-muted-foreground">Chave: {n.chave}</span>
        <span className="text-muted-foreground">O XML não abre cru: "Lançar nota" mostra a nota inteira na prévia do "+ Da nota".</span>
      </div>
    );
  } else if (arquivo) corpo = <span className="m-auto px-3 text-center text-[10px] text-muted-foreground">Este arquivo não se mostra aqui: use "Baixar".</span>;
  else corpo = <span className="m-auto text-[10px] text-muted-foreground">Sem arquivo para ver.</span>;
  return (
    <div className={cn('flex h-full shrink-0 flex-col overflow-hidden rounded-md border border-border bg-card', largura)} data-testid="painel-do-arquivo">
      <div className={cn('flex h-[22px] shrink-0 items-center gap-2 bg-primary px-2 text-[9.5px] text-primary-foreground', comFechar && 'pr-8')}>
        {/* o nome do arquivo na faixa de 22px: a exceção DECLARADA (P71) — "…" com o nome inteiro no title */}
        <span className="min-w-0 flex-1 truncate" data-reticencias-com-title title={arquivo?.name ?? vista?.rotulo ?? undefined}>
          {arquivo?.name ?? (vista ? vista.rotulo : 'o arquivo')}
        </span>
        {vista && vista.arquivos.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="shrink-0 hover:underline" data-testid="painel-baixar">Baixar ▾</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[360px]">
              {vista.arquivos.map((a) => (
                <DropdownMenuItem key={a.fonte} className="text-[10px]" title={a.nome} onSelect={() => aoBaixar(a.fonte)}>
                  <span className="shrink-0 font-semibold">{a.tipo === 'xml' ? 'XML' : 'PDF'}</span><span className="min-w-0 truncate">{a.nome}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button type="button" className="shrink-0 hover:underline disabled:opacity-50" disabled={!vista?.arquivos[0]}
            onClick={() => vista?.arquivos[0] && aoBaixar(vista.arquivos[0].fonte)} data-testid="painel-baixar">Baixar ⤓</button>
        )}
        <button type="button" className="shrink-0 hover:underline disabled:opacity-50" disabled={!arquivo} onClick={aoNovaAba}>Nova aba ↗</button>
      </div>
      <div className="flex min-h-0 flex-1">{corpo}</div>
    </div>
  );
}

function LinhaResolvida({ e, virou: v, ocupado, selecionada, arquivos, aoVer, aoBaixar, aoDesfazer }: {
  e: EntradaDoEmail; virou: ReturnType<typeof virouDaEntrada>; ocupado: boolean; selecionada: boolean; arquivos: readonly ArquivoDaLinha[];
  aoVer: () => void; aoBaixar: (fonte: string) => void; aoDesfazer: () => void;
}) {
  const virou = v.texto;
  return (
    <tr className={cn(LINHA, 'cursor-pointer hover:bg-muted/50', selecionada && 'bg-blue-50')} onClick={aoVer} data-testid="linha-resolvida">
      <td className={TD_REGUA}><SeloDaCaixa s={e.estado === 'nota' ? TIPO.nota : TIPO.boleto} /></td>
      <td className={TD_REGUA_TEXTO} title={e.arquivoNome ?? undefined}>{e.arquivoNome ?? '—'}</td>
      <td className={TD_REGUA}><VerEBaixar arquivos={arquivos} aoVer={aoVer} aoBaixar={aoBaixar} /></td>
      <td className={TD_REGUA_TEXTO} title={e.remetente ?? undefined}>{nomeDoRemetente(e.remetente)}</td>
      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(e.recebidoEm)}</td>
      <td className={TD_REGUA_TEXTO} title={`${virou} · ${e.assunto ?? '—'}`}>{v.selo ? <SeloDaCaixa s={v.selo} /> : virou} · {e.assunto ?? '—'}</td>
      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(e.resolvidoEm)}</td>
      <td className={TD_REGUA}>
        <span className="flex justify-end" onClick={(x) => x.stopPropagation()}>
          <button type="button" className={BOTAO_X} disabled={ocupado} onClick={aoDesfazer} data-testid="desfazer-resolvido"
            title={v.guardadoId ? 'volta para A resolver e o boleto sai da caixa (nada se apaga); "Guardar" de novo reabre o mesmo boleto'
              : 'volta para A resolver; o boleto fica na caixa e o lançamento fica como está'}>Desfazer</button>
        </span>
      </td>
    </tr>
  );
}

function LinhaIgnorada({ tipo, arquivo, de, chegou, motivo, em, ocupado, selecionada, arquivos, aoVer, aoBaixar, aoVoltar }: {
  tipo: Selo; arquivo: string; de: string; chegou: string | null; motivo: string; em: string | null; ocupado: boolean;
  selecionada: boolean; arquivos: readonly ArquivoDaLinha[]; aoVer: () => void; aoBaixar: (fonte: string) => void; aoVoltar: () => void;
}) {
  return (
    <tr className={cn(LINHA, 'cursor-pointer hover:bg-muted/50', selecionada && 'bg-blue-50')} onClick={aoVer} data-testid="linha-ignorada">
      <td className={TD_REGUA}><SeloDaCaixa s={tipo} /></td>
      <td className={TD_REGUA_TEXTO} title={arquivo}>{arquivo}</td>
      <td className={TD_REGUA}><VerEBaixar arquivos={arquivos} aoVer={aoVer} aoBaixar={aoBaixar} /></td>
      <td className={TD_REGUA_TEXTO} title={de}>{de}</td>
      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(chegou)}</td>
      <td className={TD_REGUA_TEXTO} title={motivo}>{motivo}</td>
      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(em)}</td>
      <td className={TD_REGUA}>
        <span className="flex justify-end" onClick={(x) => x.stopPropagation()}>
          <button type="button" className={BOTAO_P} disabled={ocupado} onClick={aoVoltar} data-testid="voltar-ignorado">Voltar para A resolver</button>
        </span>
      </td>
    </tr>
  );
}

const motivoSugerido = (ls: readonly LinhaDaCaixa[]): MotivoDeIgnorar | null =>
  ls.every((l) => l.antigo) ? 'antigo' : ls.every((l) => l.tipo === 'nada' || l.tipo === 'sem_anexo' || l.tipo === 'gmail') ? 'nao_e_documento' : null;

export function CaixaDeBoletosDialog({ clienteId, clienteNome, aoFechar, api, parcela, ler, entrada, hoje, aoLancarNota }: {
  clienteId: string; clienteNome?: string | null; aoFechar: () => void;
  /** a bancada sintética injeta a API e o leitor; a tela de verdade usa os do banco e do pdfjs */
  api?: CaixaApi; parcela?: ParcelaApi; ler?: LerArquivoDaCaixa; entrada?: EntradaEmailApi; hoje?: string;
  /** D3 — a tela de Lançamentos recebe o arquivo da nota e abre a prévia do "+ Da nota". Sem ele, a nota só se ignora daqui. */
  aoLancarNota?: (arquivo: File) => void;
}) {
  const caixa = useCaixaDeBoletos(clienteId, { api, parcela, ler, entrada, hoje, podeLancar: !!aoLancarNota });
  const largura = useLarguraDaJanela();
  const aoLado = largura >= LARGURA_DO_PAINEL_AO_LADO;
  const [aba, setAba] = useState<AbaDaCaixaV2>('a_resolver');
  const [enderecoAberto, setEnderecoAberto] = useState(false);
  const [frase, setFrase] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [arquivoVisto, setArquivoVisto] = useState<{ chave: string; arquivo: File | null; carregando: boolean } | null>(null);
  const [porCima, setPorCima] = useState<{ bytes: ArrayBuffer; nome: string; arquivo: File; fonte: string } | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [painelPorCima, setPainelPorCima] = useState(false);
  const [aIgnorar, setAIgnorar] = useState<LinhaDaCaixa[] | null>(null);

  const linhas = useMemo(() => caixa.grupos.flatMap((g) => g.linhas), [caixa.grupos]);
  const linhaSel = linhas.find((l) => l.chave === selecionada) ?? null;
  /** Os arquivos de uma linha (os que têm arquivo guardado), na ordem das fontes: o PDF já vem à frente (`linhasDasFontes`) e é ele
   *  que o "Ver" abre. */
  const arquivosDe = (fontes: readonly string[]): ArquivoDaLinha[] => fontes
    .map((f) => { const n = caixa.nomeDaFonte(f); return n ? { fonte: f, ...n } : null; })
    .filter((a): a is ArquivoDaLinha => !!a);
  const contagem: Record<AbaDaCaixaV2, number | null> = {
    a_resolver: caixa.entradas ? contarAResolver(caixa.grupos) : null,
    resolvidos: caixa.entradas ? caixa.resolvidos.length : null,
    ignorados: caixa.entradas ? caixa.ignorados.length + caixa.descartados.length : null,
  };

  /** Ver (qualquer aba): o PDF da linha ao lado (≥ 1366) ou por cima; sem PDF, o painel (o resumo da nota) por cima. */
  const ver = async (v: Vista) => {
    setSelecionada(v.chave);
    setVista(v);
    const fonte = v.arquivos[0]?.fonte;
    if (!fonte) {
      setArquivoVisto({ chave: v.chave, arquivo: null, carregando: false });
      if (!aoLado) { if (v.nota) setPainelPorCima(true); else setFrase('Esta linha não tem arquivo.'); }
      return;
    }
    setArquivoVisto({ chave: v.chave, arquivo: null, carregando: true });
    const arquivo = await caixa.arquivoDe(fonte);
    setArquivoVisto({ chave: v.chave, arquivo, carregando: false });
    if (aoLado) { if (!arquivo) setFrase('Não consegui abrir o arquivo.'); return; }
    if (arquivo && arquivo.type === 'application/pdf') setPorCima({ bytes: await arquivo.arrayBuffer(), nome: arquivo.name, arquivo, fonte });
    else if (arquivo || v.nota) setPainelPorCima(true);
    else setFrase('Não consegui abrir o arquivo.');
  };
  const vistaDaLinha = (l: LinhaDaCaixa): Vista => ({ chave: l.chave, rotulo: l.arquivo, nota: l.nota, arquivos: arquivosDe(l.fontes) });
  const vistaDaEntrada = (e: EntradaDoEmail): Vista => ({ chave: `entrada:${e.id}`, rotulo: e.arquivoNome ?? '—', nota: null, arquivos: arquivosDe([e.id]) });
  const vistaDoGuardado = (i: ItemDaCaixa): Vista => ({
    chave: `guardado:${i.boleto.id ?? ''}`, rotulo: i.boleto.arquivoNome ?? 'boleto na caixa', nota: null, arquivos: arquivosDe([`guardado:${i.boleto.id ?? ''}`]),
  });
  /** Baixar: o arquivo com o nome de origem (o navegador salva); nada muda no banco. */
  const baixar = async (fonte: string) => {
    const arquivo = await caixa.arquivoDe(fonte);
    if (!arquivo || typeof URL.createObjectURL !== 'function') { setFrase('Não consegui baixar o arquivo.'); return; }
    const u = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = u; a.download = arquivo.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  };
  const novaAba = (arquivo: File | null) => {
    if (!arquivo || typeof URL.createObjectURL !== 'function') return;
    const u = URL.createObjectURL(arquivo);
    window.open(u, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  };

  const agir = async (l: LinhaDaCaixa, a: Acao, lancamentos?: string[]) => {
    setFrase(null);
    if (a === 'ignorar') { setAIgnorar([l]); return; }
    if (a === 'lancar_nota') {
      /* o XML manda (o "+ Da nota" lê o XML inteiro); sem XML, o PDF */
      const fonte = l.fontes.find((f) => /\.xml$/i.test(caixa.entradas?.find((e) => e.id === f)?.arquivoNome ?? '')) ?? l.fontes[0];
      const arquivo = fonte ? await caixa.arquivoDe(fonte) : null;
      if (!arquivo) { setFrase('Não consegui abrir o arquivo da nota.'); return; }
      aoLancarNota?.(arquivo);
      return;
    }
    if (a === 'desfazer') { if (l.boletoGuardadoId) setFrase(await caixa.desfazerGuardado(l.boletoGuardadoId)); return; }
    const r = a === 'vincular_nota' ? await caixa.vincularNota(l)
      : a === 'vincular_boleto' ? await caixa.vincularBoleto(l, lancamentos ?? [])
        : a === 'guardar' ? await caixa.guardar(l) : null;
    setFrase(r);
  };

  /* curta (cabe a 918, fora de tabela não corta): o detalhe dos verbos está no title de cada botão */
  const dica = aba === 'a_resolver' ? 'um grupo por e-mail · clique na linha para ver o arquivo'
    : aba === 'resolvidos' ? '"Desfazer" volta para A resolver' : 'o arquivo continua guardado';
  const rodape = frase ?? caixa.erro ?? (linhaSel ? `${linhaSel.arquivo} · ${linhaSel.noSistema.titulo}` : '');

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(560px,calc(100vh-16px))] w-[min(1500px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="caixa-de-boletos">
        <div className="flex h-[34px] shrink-0 items-center justify-between gap-3 bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={clienteNome ?? undefined}>
            Caixa de entrada{clienteNome ? ` · ${clienteNome}` : ''}
          </DialogTitle>
          <DialogDescription className="shrink-0 text-[10px] text-primary-foreground/85">nada entra sozinho</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2">
          <div className="flex h-[26px] shrink-0 items-center gap-2">
            <Segmentado valor={aba} onEscolher={setAba} fonte={10}
              opcoes={ABAS_DA_CAIXA_V2.map((a) => ({
                valor: a.valor,
                rotulo: <span>{a.rotulo} <TextoReservado texto={contagem[a.valor] == null ? '—' : String(contagem[a.valor])} reserva="999" /></span>,
              }))} />
            <span className="min-w-0 flex-1 truncate text-[9.5px] text-muted-foreground" title={dica}>{dica}</span>
            <Button variant="outline" size="sm" className="h-[22px] flex-none px-2 text-[10px]" onClick={() => setEnderecoAberto(true)} data-testid="abrir-endereco-de-boletos">
              E-mail de entrada
            </Button>
          </div>
          <AreaDeArquivo modo="lote" regra={REGRA_DA_CAIXA} className="h-7 shrink-0" testId="soltar-na-caixa" inputTestId="input-da-caixa"
            convite="Clique ou arraste PDFs de boletos ou notas (e XML de nota)" rotuloDoBotao="Escolher arquivos"
            onArquivos={(_a, vereditos) => {
              const bons = vereditos.filter((v) => !v.motivo).map((v) => v.arquivo);
              const ruim = vereditos.find((v) => v.motivo);
              if (bons.length) { caixa.receber(bons); setAba('a_resolver'); }
              setFrase(ruim ? `${ruim.arquivo.name}: ${ruim.motivo}` : null);
            }} />
          <div className="flex min-h-0 flex-1 gap-1.5">
            <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border border-border bg-card" data-testid="quadro-da-caixa" data-desloca-livre>
              {aba === 'a_resolver' ? (
                <table className="w-full min-w-[860px] table-fixed border-collapse" data-testid="tabela-a-resolver">
                  <Colunas larguras={COLS_A_RESOLVER} />
                  <thead><tr className="h-[22px]">
                    <th className={TH}>Tipo</th><th className={TH}>Arquivo</th><th className={TH_VER} title="ver · baixar o arquivo">Ver</th><th className={TH}>Emitente</th><th className={TH}>Venc.</th>
                    <th className={TH_NUM}>Valor</th><th className={TH}>No sistema</th><th className={cn(TH, 'text-right')}>O que fazer</th>
                  </tr></thead>
                  <tbody>
                    {caixa.grupos.map((g) => [
                      <CabecalhoDoGrupo key={g.chave} g={g} ocupado={!!caixa.ocupado}
                        aoIgnorarAntigos={() => setAIgnorar(g.linhas.filter((l) => l.antigo && !l.feito))} />,
                      ...g.linhas.map((l) => (
                        <LinhaAResolver key={`${g.chave}|${l.chave}`} l={l} selecionada={selecionada === l.chave} ocupado={!!caixa.ocupado}
                          sugestoes={caixa.sugestoes} arquivos={arquivosDe(l.fontes)} aoVer={() => void ver(vistaDaLinha(l))}
                          aoBaixar={(f) => void baixar(f)} aoAgir={(a, ls) => void agir(l, a, ls)}
                          aoTentarSenha={(s) => caixa.tentarSenha(l.fontes[0], s)} />
                      )),
                    ])}
                    {caixa.grupos.length === 0 && (
                      <tr className={LINHA}><td colSpan={N_COLUNAS} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>
                        {caixa.entradas ? 'Nada a resolver. O que chegar no e-mail de entrada aparece aqui.' : (caixa.erro ?? 'Carregando…')}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              ) : aba === 'resolvidos' ? (
                <table className="w-full min-w-[860px] table-fixed border-collapse" data-testid="tabela-resolvidos">
                  <Colunas larguras={COLS_RESOLVIDOS} />
                  <thead><tr className="h-[22px]">
                    <th className={TH}>Tipo</th><th className={TH}>Arquivo</th><th className={TH_VER} title="ver · baixar o arquivo">Ver</th><th className={TH}>De</th><th className={TH}>Chegou em</th>
                    <th className={TH}>O que virou</th><th className={TH}>Resolvido em</th><th className={TH} />
                  </tr></thead>
                  <tbody>
                    {caixa.resolvidos.map((e) => {
                      const v = virouDaEntrada(e, caixa.lista?.itens ?? null);
                      return (
                        <LinhaResolvida key={e.id} e={e} virou={v} ocupado={!!caixa.ocupado} selecionada={selecionada === `entrada:${e.id}`}
                          arquivos={arquivosDe([e.id])} aoVer={() => void ver(vistaDaEntrada(e))} aoBaixar={(f) => void baixar(f)}
                          aoDesfazer={() => void (v.guardadoId ? caixa.desfazerGuardado(v.guardadoId) : caixa.voltar({ entradaId: e.id })).then(setFrase)} />
                      );
                    })}
                    {caixa.resolvidos.length === 0 && (
                      <tr className={LINHA}><td colSpan={N_COLUNAS} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>Nada resolvido ainda.</td></tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[860px] table-fixed border-collapse" data-testid="tabela-ignorados">
                  <Colunas larguras={COLS_IGNORADOS} />
                  <thead><tr className="h-[22px]">
                    <th className={TH}>Tipo</th><th className={TH}>Arquivo</th><th className={TH_VER} title="ver · baixar o arquivo">Ver</th><th className={TH}>De</th><th className={TH}>Chegou em</th>
                    <th className={TH}>Motivo</th><th className={TH}>Ignorado em</th><th className={TH} />
                  </tr></thead>
                  <tbody>
                    {caixa.ignorados.map((e) => (
                      <LinhaIgnorada key={e.id} tipo={e.tipo === 'xml' ? TIPO.nota : e.tipo === 'pdf' ? { texto: 'PDF', tom: 'cinza' } : TIPO.sem_anexo}
                        arquivo={e.arquivoNome ?? (e.assunto ?? '—')} de={nomeDoRemetente(e.remetente)} chegou={e.recebidoEm}
                        motivo={[rotuloDoMotivo(e.ignoradoMotivo), e.ignoradoDetalhe].filter(Boolean).join(' · ')} em={e.ignoradoEm}
                        ocupado={!!caixa.ocupado || !e.storagePath} selecionada={selecionada === `entrada:${e.id}`}
                        arquivos={arquivosDe([e.id])} aoVer={() => void ver(vistaDaEntrada(e))} aoBaixar={(f) => void baixar(f)} aoVoltar={() => void caixa.voltar({ entradaId: e.id }).then(setFrase)} />
                    ))}
                    {caixa.descartados.map((i: ItemDaCaixa) => (
                      <LinhaIgnorada key={i.boleto.id ?? i.boleto.codigoBarras} tipo={TIPO.boleto} arquivo={i.boleto.arquivoNome ?? 'boleto na caixa'}
                        de={i.boleto.beneficiarioNome ?? '—'} chegou={i.boleto.criadoEm} motivo="boleto da caixa ignorado" em={null}
                        ocupado={!!caixa.ocupado || !i.boleto.id} selecionada={selecionada === `guardado:${i.boleto.id ?? ''}`}
                        arquivos={arquivosDe([`guardado:${i.boleto.id ?? ''}`])} aoVer={() => void ver(vistaDoGuardado(i))} aoBaixar={(f) => void baixar(f)} aoVoltar={() => void caixa.voltar({ boletoId: i.boleto.id ?? '' }).then(setFrase)} />
                    ))}
                    {caixa.ignorados.length + caixa.descartados.length === 0 && (
                      <tr className={LINHA}><td colSpan={N_COLUNAS} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>Nada ignorado.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {aoLado && (
              <PainelDoArquivo vista={vista?.chave === selecionada ? vista : null} arquivo={arquivoVisto?.chave === selecionada ? arquivoVisto.arquivo : null}
                carregando={arquivoVisto?.chave === selecionada && arquivoVisto.carregando} aoNovaAba={() => novaAba(arquivoVisto?.arquivo ?? null)}
                aoBaixar={(f) => void baixar(f)} />
            )}
          </div>
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <span className={cn('min-w-0 flex-1 truncate text-[10px]', frase ? 'text-red-700' : 'text-muted-foreground')} data-testid="rodape-da-caixa" title={rodape || undefined}>
            {rodape}
          </span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
        </div>
      </DialogContent>
      {enderecoAberto && (
        <EnderecoDeBoletosDialog clienteId={clienteId} clienteNome={clienteNome} api={entrada} aoFechar={() => setEnderecoAberto(false)} />
      )}
      {aIgnorar && (
        <IgnorarDialog quantos={new Set(aIgnorar.flatMap((l) => l.fontes)).size} sugerido={motivoSugerido(aIgnorar)} aoCancelar={() => setAIgnorar(null)}
          aoConfirmar={(m, d) => { const ls = aIgnorar; setAIgnorar(null); void caixa.ignorar(ls, m, d).then(setFrase); }} />
      )}
      {porCima && (
        <VisualizadorDeDocumento open bytes={porCima.bytes} nome={porCima.nome} onFechar={() => setPorCima(null)} onNovaAba={() => novaAba(porCima.arquivo)}
          onBaixar={() => void baixar(porCima.fonte)} />
      )}
      {painelPorCima && vista && (
        <Dialog open onOpenChange={(v) => { if (!v) setPainelPorCima(false); }}>
          <DialogContent className="h-[min(420px,calc(100vh-16px))] w-[min(440px,calc(100vw-16px))] max-w-none gap-0 overflow-hidden p-0 [&>button]:top-1 [&>button]:text-primary-foreground"
            data-testid="painel-por-cima">
            <DialogTitle className="sr-only">{vista.rotulo}</DialogTitle>
            <DialogDescription className="sr-only">o arquivo da linha</DialogDescription>
            <PainelDoArquivo vista={vista} arquivo={arquivoVisto?.chave === vista.chave ? arquivoVisto.arquivo : null} largura="w-full" comFechar
              carregando={arquivoVisto?.chave === vista.chave && arquivoVisto.carregando} aoNovaAba={() => novaAba(arquivoVisto?.arquivo ?? null)}
              aoBaixar={(f) => void baixar(f)} />
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

/** Para o teste e a bancada: o motivo sugerido do Ignorar. */
export { motivoSugerido as motivoSugeridoDoIgnorar };
