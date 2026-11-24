/**
 * FOLHA-NA-CAIXA-01 — a PRÉVIA do recibo do contador aberto pela Caixa: uma linha por funcionário (na ordem do PDF) com o que o banco
 * vai fazer (casa · cria · sem lançamento · confira), o lançamento (descrição, vencimento, valor de antes) e o recibo; a soma = o
 * documento; "Aprovar" grava e sobe a página de cada um; "Desfazer" pede o motivo e mostra o que volta antes.
 * Régua da casa (cabeçalho navy 22px, linha 19px); quadro de altura fixa, só o corpo rola; o botão apagado diz por quê ao lado.
 */
import { Fragment, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TH_REGUA, TD_REGUA, TD_REGUA_NUM } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { dataBR, valorBR, type Selo, type Tom } from '@/lib/financeiro/boleto/caixaDeBoletos';
import { FRASE_DEPOIS_DO_PRAZO, ROTULO_DO_TIPO, competenciaBR, prazoLegalDoTipo, type LinhaDaPrevia, type OQueAcontece } from '@/lib/folha/folhaNaCaixa';
import type { FolhaCaixaApi } from '@/lib/folha/folhaCaixaApi';
import { caixaDeTitulo } from '@/lib/fornecedores/consultaCnpj';
import type { Divisao } from '@/lib/pdf/dividirPdf';
import { useFolhaDaCaixa, type EntradaDaFolha, type Subida } from '@/hooks/useFolhaDaCaixa';

const TOM: Record<Tom, string> = {
  ok: 'bg-green-100 text-green-800', ambar: 'bg-amber-100 text-amber-800', vermelho: 'bg-red-100 text-red-800',
  cinza: 'bg-gray-200 text-gray-700', azul: 'bg-blue-100 text-blue-800',
};
const SeloDaFolha = ({ s, testid }: { s: Selo; testid?: string }) => (
  <span className={cn('inline-block shrink-0 rounded-[3px] px-1 text-[9.5px] font-semibold leading-[15px]', TOM[s.tom])} data-testid={testid}>{s.texto}</span>
);
export const SELO_DO_QUE_ACONTECE: Record<OQueAcontece, Selo> = {
  casa: { texto: 'atualiza o valor', tom: 'ok' }, anexa: { texto: 'liga a página', tom: 'ok' },
  completar_dividir: { texto: 'precisa dividir', tom: 'vermelho' }, completar_criar: { texto: 'precisa criar', tom: 'vermelho' }, divide: { texto: 'vira a 1ª parcela', tom: 'ok' }, cria: { texto: 'cria o lançamento', tom: 'azul' },
  sem_lancamento: { texto: 'sem lançamento', tom: 'ambar' }, ambiguo: { texto: 'confira', tom: 'vermelho' }, sem_resposta: { texto: '—', tom: 'cinza' },
};
const SUBIDA: Record<Subida, Selo> = { subindo: { texto: 'subindo…', tom: 'cinza' }, ok: { texto: 'guardado', tom: 'ok' }, falhou: { texto: 'não subiu', tom: 'vermelho' } };
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');
const TH_NUM = cn(TH, 'text-right');
const LINHA = 'h-[19px] border-b border-border/40';
const BOTAO = 'h-[16px] shrink-0 rounded-[3px] border px-1.5 text-[9.5px] font-medium leading-[14px] disabled:opacity-50';
/* px medidos para 880 de tabela (o modal tem 900); Funcionário é a elástica */
const COLS = [44, null, 136, 270, 76, 96, 96, 120] as const;
/* Gabriel 24/11 12:45: na prévia da folha NADA se corta — nome e descrição QUEBRAM em 2 linhas (a linha cresce; a régua de 19px é o mínimo) */
const TD_QUEBRA = cn(TD_REGUA, 'whitespace-normal break-words py-[3px] leading-[12px]');
const paginasBR = (p: readonly number[]) => p.join(', ');
/** Gabriel 24/11 13:18: o nome do PDF (CAIXA ALTA) aparece em Nome Próprio — só na tela; o que vai ao banco é o que veio */
const nomeNaTela = (n: string) => caixaDeTitulo(n);

export function FolhaDaCaixaDialog({ entrada, clienteNome, aoFechar, aoAplicado, aoConcluir, comDesfazerAberto = false, api, dividir }: {
  entrada: EntradaDaFolha; clienteNome?: string | null; aoFechar: () => void;
  /** depois do aplicar (a Caixa marca a linha como feita e, se veio por e-mail, resolve a entrada) */
  aoAplicado?: () => void;
  /** Gabriel 24/11 14:03: o "Concluir" depois do aplicar (a Caixa fecha e mostra o aviso "13º aplicado · Desfazer") */
  aoConcluir?: (lancamentos: number) => void;
  /** o "Desfazer" do aviso reabre a prévia já com o desfazer aberto */
  comDesfazerAberto?: boolean;
  api?: FolhaCaixaApi; dividir?: (b: Uint8Array, g: number[][]) => Promise<Divisao>;
}) {
  const f = useFolhaDaCaixa(entrada, { api, dividir });
  const { folha, nomeDoArquivo } = entrada;
  const [motivoDesfazer, setMotivoDesfazer] = useState('');
  const [abrirDesfazer, setAbrirDesfazer] = useState(comDesfazerAberto);
  const [verSemRecibo, setVerSemRecibo] = useState(false);
  const aplicado = f.fase === 'aplicado' || !!f.resposta?.jaAplicado;
  const soma = f.resposta?.soma ?? null;
  const confere = soma !== null && Math.round(soma * 100) === Math.round(folha.total * 100);
  const titulo = `Folha · ${ROTULO_DO_TIPO[folha.tipo]} · ${competenciaBR(folha.competencia)}${clienteNome ? ` · ${clienteNome}` : ''}`;
  const semRecibo = f.resposta?.semRecibo ?? [];
  const textoSemRecibo = semRecibo.map((s) => `${nomeNaTela(s.nome)} ${valorBR(s.valor)}`).join(' · ');
  const docDaLinha = (l: LinhaDaPrevia) => f.resposta?.documentos.find((d) => d.paginas.length === l.paginas.length && d.paginas.every((x, i) => x === l.paginas[i]));

  const aprovar = async () => { if (await f.aprovar()) aoAplicado?.(); };
  /** os lançamentos que o aplicar tocou (o que atualiza, divide ou cria) */
  const lancamentos = f.linhas.filter((l) => l.acontece === 'casa' || l.acontece === 'divide' || l.acontece === 'anexa' || l.acontece === 'cria').length;
  const acabouDeAplicar = f.fase === 'aplicado';

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(520px,calc(100vh-16px))] w-[min(1200px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-1.5 [&>button]:text-primary-foreground"
        data-testid="folha-da-caixa">
        <div className="flex h-[30px] shrink-0 items-center gap-3 bg-primary px-3 pr-9 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className={cn('ml-auto shrink-0 text-[10px]', aplicado ? 'font-semibold text-green-300' : 'text-primary-foreground/85')} data-testid="estado-da-folha">
            {acabouDeAplicar ? `✓ Aplicado · ${lancamentos} ${lancamentos === 1 ? 'lançamento' : 'lançamentos'}` : aplicado ? '✓ Já aplicado'
              : f.resposta?.completar ? 'completar: já aplicado sem as páginas — liga as páginas (os valores ficam)' : 'nada é gravado antes do Aprovar'}
          </DialogDescription>
        </div>
        {/* a faixa do documento: arquivo · pessoas · total · soma = documento (lugares fixos) */}
        <div className="flex h-[24px] shrink-0 items-center gap-3 border-b px-3 text-[10px]">
          <span className="min-w-0 flex-1 truncate" title={nomeDoArquivo}>{nomeDoArquivo}</span>
          <span className="w-[70px] shrink-0 whitespace-nowrap text-right tabular-nums" data-testid="pessoas">{folha.pessoas.length} {folha.pessoas.length === 1 ? 'pessoa' : 'pessoas'}</span>
          <span className="w-[160px] shrink-0 whitespace-nowrap text-right tabular-nums" data-testid="total-do-documento">documento R$ {valorBR(folha.total)}</span>
          <span className={cn('w-[230px] shrink-0 whitespace-nowrap text-right tabular-nums', soma === null ? 'text-muted-foreground' : confere ? 'text-green-800' : 'text-red-700')} data-testid="soma">
            {soma === null ? 'soma —' : `soma R$ ${valorBR(soma)} ${confere ? '= documento' : '≠ documento'}`}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto" data-testid="quadro-da-folha" data-desloca-livre>
          <table className="w-full table-fixed border-collapse" data-testid="tabela-da-folha">
            <colgroup>{COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
            <thead>
              <tr>
                <th className={TH}>Pág.</th><th className={TH}>Funcionário</th><th className={TH}>O que acontece</th><th className={TH}>Lançamento</th>
                <th className={TH}>Venc.</th><th className={TH_NUM}>Antes</th><th className={TH_NUM}>Recibo</th><th className={TH}>PDF</th>
              </tr>
            </thead>
            <tbody>
              {f.fase === 'preparando' && <tr className={LINHA}><td className={TD_REGUA} colSpan={8}>preparando a prévia…</td></tr>}
              {f.fase !== 'preparando' && f.linhas.length === 0 && folha.pessoas.map((p, k) => (
                <tr key={k} className={LINHA}><td className={TD_REGUA_NUM}>{paginasBR(p.paginas)}</td><td className={TD_QUEBRA}>{nomeNaTela(p.nome)}</td>
                  <td className={TD_REGUA}>—</td><td className={TD_REGUA}>—</td><td className={TD_REGUA}>—</td><td className={TD_REGUA_NUM}>—</td>
                  <td className={TD_REGUA_NUM}>{valorBR(p.valor)}</td><td className={TD_REGUA}>—</td></tr>
              ))}
              {f.linhas.map((l) => {
                const doc = docDaLinha(l);
                const subida = doc ? f.subidas[doc.storagePath] : undefined;
                return (
                  <Fragment key={l.k}>
                  <tr className={LINHA} data-testid={`linha-folha-${l.k}`}>
                    <td className={TD_REGUA_NUM}>{paginasBR(l.paginas)}</td>
                    <td className={cn(TD_QUEBRA, l.nomeParcial && 'text-amber-800')}
                      title={l.nomeParcial ? `${nomeNaTela(l.nome)} (nome em parte) · o nome confere só em parte com o cadastro` : undefined}>
                      {l.nomeParcial ? `${nomeNaTela(l.nome)} (nome em parte)` : nomeNaTela(l.nome)}
                    </td>
                    <td className={TD_REGUA}>
                      <span className="flex items-center gap-1">
                        {l.acontece === 'sem_resposta' ? <span data-testid={`acontece-${l.k}`}>—</span>
                          : <SeloDaFolha s={SELO_DO_QUE_ACONTECE[l.acontece]} testid={`acontece-${l.k}`} />}
                        {(l.acontece === 'sem_lancamento' || l.acontece === 'cria') && !aplicado && (
                          <button type="button" className={cn(BOTAO, l.acontece === 'cria' ? 'border-border bg-card' : 'border-[#E7C873] bg-[#E7C873] font-semibold')}
                            disabled={f.fase !== 'previa'} onClick={() => f.alternarCriar(l.k)} data-testid={`criar-${l.k}`}
                            title={l.acontece === 'cria' ? 'não criar' : 'cria o lançamento pelo molde dos outros recibos do mesmo empregador'}>
                            {l.acontece === 'cria' ? '✕' : 'Criar'}
                          </button>
                        )}
                      </span>
                      {l.funcionarioNovo && (
                        <span className="block pt-[2px] text-[9.5px] leading-[11px] text-blue-800" data-testid={`funcionario-novo-${l.k}`}
                          title="não está no cadastro de funcionários: o funcionário nasce com o lançamento e a página se guarda nele">funcionário novo</span>
                      )}
                      {l.valorDifere && (
                        <span className="block pt-[2px] text-[9.5px] leading-[11px] text-amber-800" data-testid={`valor-difere-${l.k}`}
                          title="o completar só liga a página e o status; o valor de hoje fica (confira com o consultor)">valor de hoje ≠ recibo</span>
                      )}
                      {l.depoisDoPrazo && (
                        <span className="block pt-[2px] text-[9.5px] leading-[11px] text-amber-800" data-testid={`prazo-${l.k}`}
                          title={`o prazo legal desta parcela é ${dataBR(prazoLegalDoTipo(folha))}; o vencimento fica o do lançamento (nada muda)`}>
                          {FRASE_DEPOIS_DO_PRAZO}
                        </span>
                      )}
                    </td>
                    <td className={cn(TD_QUEBRA, l.descricaoAntes && 'text-blue-800')} data-testid={`descricao-${l.k}`}
                      title={l.descricaoAntes ? `${l.descricaoAntes} → ${l.descricao ?? '—'}` : (l.descricao ?? undefined)}>{l.descricao ?? '—'}</td>
                    <td className={cn(TD_REGUA_NUM, 'text-left', l.vencimentoAntes && 'text-blue-800', l.depoisDoPrazo && 'text-amber-800')} data-testid={`vencimento-${l.k}`}
                      title={l.vencimentoAntes ? `${dataBR(l.vencimentoAntes)} → ${dataBR(l.vencimento)}` : undefined}>{dataBR(l.vencimento)}</td>
                    <td className={TD_REGUA_NUM}>{valorBR(l.antes)}</td>
                    <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{valorBR(l.recibo)}</td>
                    <td className={TD_REGUA}>
                      {subida ? (
                        <span className="flex items-center gap-1">
                          <SeloDaFolha s={SUBIDA[subida]} testid={`subida-${l.k}`} />
                          {subida === 'falhou' && doc && (
                            <button type="button" className={cn(BOTAO, 'border-border bg-card')} onClick={() => f.tentarDeNovo(doc.storagePath)} data-testid={`subir-de-novo-${l.k}`}>de novo</button>
                          )}
                        </span>
                      ) : (
                        <span className={cn('text-[9.5px]', l.guardaArquivo ? 'text-muted-foreground' : 'text-amber-800')}
                          title={l.guardaArquivo ? 'a página desta pessoa vai para os documentos dela' : 'sem funcionário no cadastro: o valor se aplica, o PDF não se guarda'}>
                          {l.guardaArquivo ? (aplicado ? '—' : 'guarda a página') : 'não guarda'}
                        </span>
                      )}
                    </td>
                  </tr>
                  {l.segunda && (
                    <tr className={cn(LINHA, 'text-muted-foreground')} data-testid={`segunda-${l.k}`}>
                      <td className={TD_REGUA} /><td className={TD_QUEBRA}>↳ a 2ª parcela fica prevista</td>
                      <td className={TD_REGUA}><SeloDaFolha s={{ texto: '2ª parcela', tom: 'cinza' }} /></td>
                      <td className={TD_QUEBRA}>{l.segunda.descricao ?? '—'}</td>
                      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(l.segunda.vencimento)}</td>
                      <td className={TD_REGUA_NUM} /><td className={TD_REGUA_NUM}>{valorBR(l.segunda.valor)}</td><td className={TD_REGUA} />
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* o que o documento NÃO trouxe (só aviso; os lançamentos ficam como estão) */}
        {/* Gabriel 24/11 14:03: nada cortado — o resumo numa linha e a lista inteira (que quebra) só quando pedida */}
        <div className="relative flex h-[20px] shrink-0 items-center gap-2 border-t px-3 text-[9.5px] text-muted-foreground" data-testid="sem-recibo">
          <span>{semRecibo.length
            ? `${semRecibo.length} ${semRecibo.length === 1 ? 'lançamento' : 'lançamentos'} do tipo sem recibo neste documento (ficam como estão)`
            : 'Todos os lançamentos do tipo nesta competência têm recibo neste documento.'}</span>
          {semRecibo.length > 0 && (
            <button type="button" className={cn(BOTAO, 'w-[76px] whitespace-nowrap border-border bg-card text-center')} onClick={() => setVerSemRecibo((x) => !x)} data-testid="ver-sem-recibo">
              {verSemRecibo ? 'esconder' : 'ver quem ⓘ'}
            </button>
          )}
          {/* a lista abre POR CIMA (nada se desloca): quebra em linhas, rola se for longa */}
          {verSemRecibo && semRecibo.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 z-20 max-h-[96px] overflow-auto whitespace-normal break-words rounded border bg-card px-2 py-1 text-[9.5px] leading-[12px] text-foreground shadow-md"
              data-testid="lista-sem-recibo">
              {textoSemRecibo}
            </div>
          )}
        </div>
        {abrirDesfazer && (
          <div className="flex h-[28px] shrink-0 items-center gap-2 border-t px-3 text-[10px]" data-testid="faixa-desfazer">
            <Input value={motivoDesfazer} onChange={(e) => setMotivoDesfazer(e.target.value)} maxLength={300} placeholder="motivo do desfazer"
              className="h-[20px] w-[260px] px-2 text-[10px]" data-testid="motivo-desfazer-folha" />
            <button type="button" className={cn(BOTAO, 'border-border bg-card')} disabled={!motivoDesfazer.trim()} onClick={() => void f.preverDesfazer(motivoDesfazer)} data-testid="prever-desfazer">
              Ver o que volta
            </button>
            <span className="min-w-0 flex-1 truncate" data-testid="o-que-volta">
              {f.desfeito ? `volta o valor de ${f.desfeito.valores} · cancela ${f.desfeito.criados} criado(s) · ${f.desfeito.documentos} documento(s)` : ''}
            </span>
            <button type="button" className={cn(BOTAO, 'border-red-700 bg-red-700 text-white')} disabled={!f.desfeito || !motivoDesfazer.trim() || f.fase === 'desfazendo'}
              onClick={() => void f.desfazer(motivoDesfazer).then((ok) => { if (ok) { setAbrirDesfazer(false); setMotivoDesfazer(''); } })} data-testid="confirmar-desfazer-folha">
              Desfazer
            </button>
          </div>
        )}
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-t px-3">
          <span className={cn('min-w-0 flex-1 truncate text-[10px]', f.fase === 'erro' ? 'text-red-700' : 'text-foreground')} title={f.frase ?? f.motivo ?? undefined} data-testid="frase-da-folha">
            {f.frase ?? (aplicado ? (f.fase === 'aplicado' ? 'Aplicado: os valores estão nos lançamentos e cada página nos documentos do funcionário.' : 'Este documento já foi aplicado.') : f.motivo ?? '')}
          </span>
          {!acabouDeAplicar && <Button variant="outline" size="sm" className="h-[22px] w-[64px] text-[10px]" onClick={aoFechar}>Fechar</Button>}
          {aplicado && (
            <Button variant="outline" size="sm" className="h-[22px] w-[96px] text-[10px]" onClick={() => setAbrirDesfazer((x) => !x)} data-testid="desfazer-folha">Desfazer…</Button>
          )}
          {/* o sucesso é óbvio: o primário vira "Concluir" (fecha; a Caixa avisa "13º aplicado · Desfazer") */}
          {acabouDeAplicar && (
            <Button size="sm" className="h-[22px] w-[64px] bg-[#E7C873] text-[10px] font-semibold text-foreground hover:bg-[#D9B95F]"
              onClick={() => { aoConcluir?.(lancamentos); aoFechar(); }} data-testid="concluir-folha">Concluir</Button>
          )}
          {!aplicado && (
            <Button size="sm" className="h-[22px] w-[96px] bg-[#E7C873] text-[10px] text-foreground hover:bg-[#D9B95F]" disabled={f.fase !== 'previa' || !!f.motivo}
              onClick={() => void aprovar()} data-testid="aprovar-folha" title={f.motivo ?? 'grava os valores e guarda a página de cada um'}>
              {f.fase === 'aplicando' ? 'Aplicando…' : f.resposta?.completar ? `Ligar ${folha.pessoas.length}` : `Aprovar ${folha.pessoas.length}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
