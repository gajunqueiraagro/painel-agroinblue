/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — "Notas da Receita" (mock ui-validar/notas-receita-f34.html, aprovado 16/11 15:15; Chat 20:05).
 * A casca é a da caixa de boletos (cabeçalho azul, abas com contagem reservada, quadro com rolagem própria, rodapé azul com o total).
 * SÓ LEITURA: lista o que a busca gravou; "Lançar" entrega o XML ao "Da nota fiscal" de hoje (D1), "PDF" baixa o XML (D3), a linha
 * abre os dados ("Ver"). Dar ciência (F3.3) e Ignorar (RPC nova) não entram nesta fatia.
 */
import { Fragment, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { RODAPE_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { lerXmlDaReceita, type DadosDaReceita } from '@/hooks/useNotasDaReceita';
import {
  ABAS_DA_RECEITA, arquivoDoXml, filtrarBusca, nomeDoXml, SITUACAO_NA_TELA, totalDaLista, type AbaDaReceita, type NotaNaLista,
} from '@/lib/fiscal/notasDaReceita';

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

export function NotasDaReceitaDialog({ clienteNome, dados, carregando, erro, aoFechar, aoLancar, lerXml = lerXmlDaReceita }: {
  clienteNome?: string | null;
  dados: DadosDaReceita | undefined;
  carregando: boolean;
  erro: string | null;
  aoFechar: () => void;
  /** D1 — o XML vai para o "Da nota fiscal" de hoje (o mesmo caminho do arquivo solto) */
  aoLancar: (arquivo: File) => void;
  /** a bancada injeta o leitor; a tela usa o banco */
  lerXml?: (id: string) => Promise<string>;
}) {
  const [aba, setAba] = useState<AbaDaReceita>('todas');
  const [busca, setBusca] = useState('');
  const [titular, setTitular] = useState<string | null>(null);
  const [aberta, setAberta] = useState<NotaNaLista | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const todas = useMemo(() => filtrarBusca(dados?.lista ?? [], busca, titular), [dados, busca, titular]);
  const filtro = ABAS_DA_RECEITA.find((a) => a.valor === aba)?.filtro ?? (() => true);
  const linhas = todas.filter(filtro);
  const pedemCiencia = todas.filter((n) => n.sit === 'pede_ciencia').length;
  const aLancar = todas.filter((n) => n.sit === 'nova').length;

  const comXml = async (n: NotaNaLista, fazer: (f: File) => void) => {
    setOcupada(n.id); setAviso(null);
    try { fazer(arquivoDoXml(n.chave, await lerXml(n.id))); } catch (e) { setAviso(e instanceof Error ? e.message : 'Não consegui ler o XML.'); } finally { setOcupada(null); }
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
            <table className="w-full min-w-[860px] table-fixed border-collapse">
              <colgroup>
                <col style={{ width: 70 }} /><col /><col style={{ width: 116 }} /><col style={{ width: 72 }} /><col style={{ width: 80 }} />
                <col style={{ width: 92 }} /><col style={{ width: 118 }} /><col style={{ width: 98 }} /><col style={{ width: 128 }} />
              </colgroup>
              <thead><tr className="h-[22px]">
                <th className={TH}>Emissão</th><th className={TH}>Emitente</th><th className={TH}>CNPJ/CPF</th><th className={TH_NUM}>Nº</th>
                <th className={TH_NUM}>Valor</th><th className={TH}>Tipo</th><th className={TH}>Recebeu</th><th className={TH}>Situação</th><th className={TH}>Ações</th>
              </tr></thead>
              <tbody>
                {linhas.map((n) => {
                  const s = SITUACAO_NA_TELA[n.sit];
                  const apagada = n.sit === 'cancelada' || n.sit === 'ignorada';
                  const temXml = n.tipo === 'completa';
                  const podeLancar = temXml && n.sit === 'nova';
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
                      <td className={TD_REGUA} title={s.dica}><span className={cn('whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9px] font-semibold', s.cor)}>{s.rotulo}</span></td>
                      <td className={TD_REGUA} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button type="button" className={cn(BOTAO, 'w-[52px]', podeLancar ? 'bg-[#E7C873] font-semibold text-foreground hover:bg-[#D9B95F]' : 'invisible')}
                            disabled={!podeLancar || ocupada === n.id} data-testid="receita-lancar"
                            title='Abre o "Da nota fiscal" com este XML (o mesmo caminho do arquivo solto)'
                            onClick={() => void comXml(n, aoLancar)}>Lançar</button>
                          <button type="button" className={cn(BOTAO, 'w-[34px] border', temXml ? 'bg-card hover:bg-muted' : 'cursor-not-allowed text-muted-foreground/50')}
                            disabled={!temXml || ocupada === n.id} data-testid="receita-pdf"
                            title={temXml ? 'Baixa o XML da nota (o DANFE vem depois)' : 'Sem XML ainda: só o resumo da Receita'}
                            onClick={() => void comXml(n, baixarArquivo)}>PDF</button>
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
      </DialogContent>
    </Dialog>
  );
}

/** "Ver": os dados que a Receita mandou, em linhas fixas (nada de XML na tela) */
function DadosDaNota({ n, aoFechar }: { n: NotaNaLista; aoFechar: () => void }) {
  const s = SITUACAO_NA_TELA[n.sit];
  const campos: [string, string][] = [
    ['Emitente', n.emitenteNome ?? '—'], ['CNPJ/CPF', n.emitenteNaTabela || '—'], ['Emissão', dataBR(n.emissao)],
    ['Nº · série', `${n.numero} · ${n.serie}`], ['Valor', n.valorCent == null ? '—' : `R$ ${brl(n.valorCent)}`],
    ['Tipo', n.tipo === 'completa' ? 'Completa (XML inteiro)' : 'Resumo da Receita'], ['Situação', `${s.rotulo} — ${s.dica}`],
    ['Recebeu', n.titularNome], ['Chave', n.chave.replace(/(\d{4})(?=\d)/g, '$1 ')], ['Arquivo', n.tipo === 'completa' ? nomeDoXml(n.chave) : '—'],
    ['Eventos', n.eventos.length ? n.eventos.map((e) => e.descricao ?? e.tpEvento).join(' · ') : 'nenhum'],
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
