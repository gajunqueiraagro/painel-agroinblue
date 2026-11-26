/**
 * FOLHA-TELAS-03 (1) — a aba FOLHA DO MÊS (mock MDj3uBiVv1ez5SFtBP7hEn; contrato do PR C §B): o mês, o tipo (Mensal · 13º 1ª · 13º 2ª), a
 * faixa dos 4 documentos, uma linha por funcionário (Previsto · Recibo · Diferença · Pago em · Situação · O que falta) e o rodapé preso.
 * ⚠ TUDO VEM DE `fn_folha_mes`: a tela não soma nem decide a situação (`folhaMes.ts` só escreve o rótulo).
 * ⚠ "Arrastar recibos do contador" = a MESMA porta da Caixa (`lerReciboDoArquivo` → `FolhaDaCaixaDialog` → `fn_folha_recibos_aplicar`).
 * ⚠ "Confirmar folha" só libera quando tudo bate; apagado, diz por quê ao lado (`motivoParaNaoConfirmar`, fonte única). Confirmar e Reabrir
 *   passam pela prévia do banco (`fn_folha_mes_confirmar` / `fn_folha_reabrir`, lote 118740) e só o 2º clique grava; o reabrir pede o motivo.
 * ⚠ RÉGUA DE FONTES NOVA (UI-FONTES-REGUA-01): controles 11px/26px, cabeçalho e datas 10px, linha 11px/24px; tabela de régua fixa
 *   (`colgroup` em px; Funcionário é a elástica), cabeçalho e rodapé presos, um scrollport, altura até o fim da janela.
 */
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { QUADRO_REGUA, RODAPE_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { CONTROLE, TEXTO_ROTULO, TH_FONTES, LINHA_FONTES, TD_FONTES, TD_FONTES_TEXTO, TD_FONTES_NUM, TD_FONTES_DATA } from '@/components/ui/regua-fontes';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { SeletorPeriodo } from '@/v2/components/SeletorPeriodo';
import { mesUnico, type Periodo } from '@/v2/lib/periodo';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFolhaApi, useFuncionarios, useRelerFolha } from '@/hooks/useFolha';
import { useFolhaDoMes, useFolhaMesApi } from '@/hooks/useFolhaMes';
import type { EntradaDaFolha as EntradaDaCaixa } from '@/hooks/useFolhaDaCaixa';
import { cn } from '@/lib/utils';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { competenciaBR, dataBR, n2 } from '@/lib/folha/folhaTela';
import {
  TIPOS_DA_FOLHA, competenciaDe, estaConfirmada, fraseDoTipo, lugaresDosDocumentos, motivoParaNaoConfirmar, pagoEm, situacaoDaLinha,
  type LinhaDoMes, type TipoDaFolha, type TomDaSituacao,
} from '@/lib/folha/folhaMes';
import { codigosDasFazendas, rotuloDaFazenda, tituloDaFazenda } from '@/lib/folha/fazendaDaAtuacao';
import { lerReciboDoArquivo } from '@/lib/folha/reciboDoArquivo';
import { FolhaDaCaixaDialog } from '@/components/financeiro-v2/FolhaDaCaixaDialog';
import { LancamentoDaFolha } from './LancamentoDaFolha';
import { useVerDocumento } from './useVerDocumento';

type Coluna = 'nome' | 'fazenda' | 'previsto' | 'recibo' | 'diferenca' | 'pago_em' | 'situacao' | 'falta' | 'doc' | 'abrir';
/** px medidos para a janela de 1126 (≈ 950 de tabela): Funcionário é a elástica (~150px a 1126, o inteiro no `title`) */
const COLUNAS: ReadonlyArray<{ coluna: Coluna; rotulo: string; largura: number | null; direita?: boolean }> = [
  { coluna: 'nome', rotulo: 'Funcionário', largura: null },
  { coluna: 'fazenda', rotulo: 'Fazenda', largura: 72 },
  { coluna: 'previsto', rotulo: 'Previsto', largura: 92, direita: true },
  { coluna: 'recibo', rotulo: 'Recibo', largura: 92, direita: true },
  { coluna: 'diferenca', rotulo: 'Diferença', largura: 84, direita: true },
  { coluna: 'pago_em', rotulo: 'Pago em', largura: 80 },
  { coluna: 'situacao', rotulo: 'Situação', largura: 128 },
  { coluna: 'falta', rotulo: 'O que falta', largura: 160 },
  { coluna: 'doc', rotulo: 'Recibo', largura: 52 },
  { coluna: 'abrir', rotulo: '', largura: 36 },
];
function Colunas() {
  return <colgroup>{COLUNAS.map(c => <col key={c.coluna} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>;
}
const PONTO: Record<TomDaSituacao, string> = { verde: 'bg-emerald-600', ambar: 'bg-amber-500', cinza: 'bg-slate-400', azul: 'bg-blue-600' };
const REGRA_RECIBO: RegraDeAceite = { tipos: ['pdf'], tamanhoMaxBytes: 30 * 1024 * 1024, varios: false };
const valorOuTraco = (v: number | null) => (v == null ? '—' : n2(v));
const MOTIVO_LIGAR = 'Folha do mês: o lançamento entrou pelo favorecido';

export function AbaFolhaMes({ clienteId, onFicha }: { clienteId: string; onFicha: (id: string) => void }) {
  const hoje = hojeLocal();
  const [periodo, setPeriodo] = useState<Periodo>(() => mesUnico(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))));
  const [tipo, setTipo] = useState<TipoDaFolha>('mensal');
  const competencia = competenciaDe(periodo.de.ano, periodo.de.mes);
  const { data: folha, isLoading, error } = useFolhaDoMes(clienteId, competencia, tipo);
  const { data: lista } = useFuncionarios(clienteId);
  const { fazendas } = useFazenda();
  const codigo = useMemo(() => codigosDasFazendas(fazendas), [fazendas]);
  const atuacaoDe = useMemo(() => new Map((lista?.funcionarios ?? []).map(f => [f.id, f.atuacao])), [lista]);
  const api = useFolhaApi();
  const reler = useRelerFolha();
  const [erro, setErro] = useState<string | null>(null);
  const [recusaDoArquivo, setRecusaDoArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [recibo, setRecibo] = useState<EntradaDaCaixa | null>(null);
  const [ligando, setLigando] = useState<{ linha: LinhaDoMes; ids: string[] } | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  /* a prévia do Confirmar / Reabrir na 3ª linha da faixa (o banco já disse que pode; o 2º clique grava) */
  const [previa, setPrevia] = useState<{ acao: 'confirmar'; frase: string } | { acao: 'reabrir'; motivo: string } | null>(null);
  const apiMes = useFolhaMesApi();
  const { ver, visualizador } = useVerDocumento(setErro);

  const linhas = folha?.linhas ?? [];
  const motivo = motivoParaNaoConfirmar(isLoading ? null : folha ?? null);
  const confirmada = estaConfirmada(folha);
  const docs = folha ? lugaresDosDocumentos(folha) : null;
  const t = folha?.totais;

  const receber = async (arquivos: File[]) => {
    const a = arquivos[0];
    if (!a) return;
    setRecusaDoArquivo(null); setErro(null); setLendo(true);
    const r = await lerReciboDoArquivo(a);
    setLendo(false);
    if (r.ok === false) { setRecusaDoArquivo(r.frase); return; }
    setRecibo({ clienteId, entradaId: null, bytes: r.bytes, nomeDoArquivo: r.nome, folha: r.folha });
  };
  /* B3 "ligar": o lançamento que entrou pelo favorecido passa a ser DESTE funcionário — a prévia primeiro */
  const pedirLigar = async (l: LinhaDoMes) => {
    setErro(null);
    const ids = l.lancamentos.filter(x => !x.ligado).map(x => x.id);
    const r = await api.ligar(ids, l.funcionario_id, MOTIVO_LIGAR, true);
    if (!r.ok) { setErro(r.erro ?? 'Não consegui preparar a ligação.'); return; }
    setLigando({ linha: l, ids });
  };
  const preverConfirmar = async () => {
    setErro(null);
    const r = await apiMes.confirmar(clienteId, competencia, tipo, true);
    if (!r.ok) { setErro(r.erro ?? 'Não consegui preparar a confirmação.'); return; }
    const n = typeof r.dados?.pessoas === 'number' ? r.dados.pessoas : linhas.length;
    setPrevia({ acao: 'confirmar', frase: `Confirmar a folha de ${competenciaBR(competencia)} (${n} ${n === 1 ? 'pessoa' : 'pessoas'}, ${valorOuTraco(t?.recibo ?? null)})?` });
  };
  const gravarPrevia = async () => {
    if (!previa) return;
    setErro(null);
    if (previa.acao === 'confirmar') {
      const r = await apiMes.confirmar(clienteId, competencia, tipo, false);
      setPrevia(null);
      if (!r.ok) { setErro(r.erro ?? 'Não consegui confirmar. Nada foi gravado.'); return; }
    } else {
      const id = folha?.folha?.id;
      const m = previa.motivo.trim();
      if (!id || !m) return;
      const p = await apiMes.reabrir(id, m, true);
      if (!p.ok) { setErro(p.erro ?? 'Não consegui reabrir.'); return; }
      const r = await apiMes.reabrir(id, m, false);
      setPrevia(null);
      if (!r.ok) { setErro(r.erro ?? 'Não consegui reabrir. Nada foi gravado.'); return; }
    }
    void reler();
  };
  const ligar = async () => {
    if (!ligando) return;
    const r = await api.ligar(ligando.ids, ligando.linha.funcionario_id, MOTIVO_LIGAR, false);
    setLigando(null);
    if (!r.ok) { setErro(r.erro ?? 'Não consegui ligar. Nada foi gravado.'); return; }
    void reler();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="folha-aba-mes">
      <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border bg-card px-2 py-1.5" data-testid="folha-mes-faixa">
        <div className="flex min-h-[30px] items-center gap-2">
          <div className="min-w-0 flex-1"><SeletorPeriodo modo="ano-mes" modoUnico periodo={periodo} onPeriodoChange={setPeriodo} /></div>
          <Segmentado altura={26} fonte={11} valor={tipo} onEscolher={setTipo}
            opcoes={TIPOS_DA_FOLHA.map(o => ({ valor: o.valor, rotulo: <span className="inline-block w-[96px] text-center">{o.rotulo}</span> }))} />
        </div>
        {/* a 2ª linha cabe numa só de 1126px para cima; mais estreita, Arrastar e Confirmar descem para uma linha própria (antes passavam
            da borda e a página rolava de lado ao abrir a prévia — gate de deslocamento a 750/814/1000) */}
        <div className="flex min-h-[26px] flex-wrap items-center gap-1.5">
          {(docs ?? lugaresVazios).map(d => (
            <span key={d.chave} data-testid={`folha-mes-doc-${d.chave}`} title={`${d.rotulo}: ${d.detalhe}`}
              className={cn('inline-flex h-[26px] w-[132px] shrink-0 items-center gap-1.5 rounded-md border px-2', TEXTO_ROTULO,
                d.chegou ? 'border-border text-foreground' : 'border-dashed border-amber-300 bg-amber-50 text-amber-800')}>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', d.chegou ? 'bg-emerald-600' : 'bg-amber-500')} />
              <span className="truncate">{d.rotulo}</span>
              <span className="ml-auto shrink-0 tabular-nums">{d.chegou ? (d.chave === 'recibos' ? d.detalhe : '✓') : '—'}</span>
            </span>
          ))}
          {/* Arrastar e Confirmar andam JUNTOS (descem juntos quando a linha não cabe) */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <AreaDeArquivo regra={REGRA_RECIBO} onArquivos={a => void receber(a)} convite={lendo ? 'Lendo o recibo…' : 'Arrastar recibos do contador'} detalhe=""
              desabilitado={lendo} motivoExterno={recusaDoArquivo} className={cn(CONTROLE, 'w-[220px] shrink-0')} testId="folha-mes-arrastar" />
            {confirmada ? (
              <Button type="button" size="sm" variant="outline" className={cn(CONTROLE, 'w-[120px] shrink-0')} title={motivo ?? undefined}
                onClick={() => setPrevia({ acao: 'reabrir', motivo: '' })} data-testid="folha-mes-reabrir">Reabrir folha</Button>
            ) : (
              <Button type="button" size="sm" disabled={!!motivo} title={motivo ?? 'tudo confere: confirmar a folha do mês'} className={cn(CONTROLE, 'w-[120px] shrink-0')}
                onClick={() => void preverConfirmar()} data-testid="folha-mes-confirmar">Confirmar folha</Button>
            )}
          </div>
        </div>
        {/* a 3ª linha tem 26px SEMPRE (a frase, a prévia com os botões, o motivo do reabrir): nada se desloca ao abrir a prévia */}
        <div className={cn('flex h-[26px] items-center gap-2', TEXTO_ROTULO)}>
          {previa ? (
            <span className="flex min-w-0 flex-1 items-center gap-2" data-testid="folha-mes-previa">
              {previa.acao === 'confirmar' ? <span className="truncate">{previa.frase}</span> : (
                <>
                  <span className="shrink-0">Reabrir: o motivo</span>
                  <Input value={previa.motivo} onChange={e => setPrevia({ acao: 'reabrir', motivo: e.target.value })} className={cn(CONTROLE, 'w-[260px]')}
                    placeholder="ex.: o contador corrigiu um recibo" data-testid="folha-mes-reabrir-motivo" />
                </>
              )}
              <Button type="button" size="sm" className={cn(CONTROLE, 'w-[90px] shrink-0')} onClick={() => void gravarPrevia()}
                disabled={previa.acao === 'reabrir' && !previa.motivo.trim()} title={previa.acao === 'reabrir' && !previa.motivo.trim() ? 'escreva o motivo' : undefined}
                data-testid="folha-mes-previa-ok">{previa.acao === 'confirmar' ? 'Confirmar' : 'Reabrir'}</Button>
              <Button type="button" size="sm" variant="outline" className={cn(CONTROLE, 'w-[80px] shrink-0')} onClick={() => setPrevia(null)}>Cancelar</Button>
            </span>
          ) : ligando ? (
            <span className="flex min-w-0 flex-1 items-center gap-2" data-testid="folha-mes-ligar-previa">
              <span className="truncate">Ligar {ligando.ids.length} {ligando.ids.length === 1 ? 'lançamento' : 'lançamentos'} a {ligando.linha.nome}?</span>
              <Button type="button" size="sm" className={cn(CONTROLE, 'w-[90px] shrink-0')} onClick={() => void ligar()} data-testid="folha-mes-ligar-ok">Ligar</Button>
              <Button type="button" size="sm" variant="outline" className={cn(CONTROLE, 'w-[80px] shrink-0')} onClick={() => setLigando(null)}>Cancelar</Button>
            </span>
          ) : erro ? (
            <span className="min-w-0 flex-1 truncate text-red-700" title={erro} data-testid="folha-mes-erro">{erro}</span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={folha ? fraseDoTipo(folha) : undefined} data-testid="folha-mes-frase">
              {folha ? fraseDoTipo(folha) : ''}
            </span>
          )}
          <span className={cn('max-w-[50%] shrink-0 truncate text-right', confirmada ? 'font-semibold text-emerald-700' : 'text-muted-foreground')}
            title={motivo ?? undefined} data-testid="folha-mes-motivo">{motivo ?? 'Tudo confere.'}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className={QUADRO_REGUA}>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll" data-testid="folha-mes-rolagem">
            <table className="w-full table-fixed border-collapse" data-testid="folha-mes-tabela">
              <Colunas />
              <thead className="text-primary-foreground">
                <tr className="h-[22px]">
                  {COLUNAS.map(c => <th key={c.coluna} className={cn(TH_FONTES, 'sticky top-0 z-10 bg-primary', c.direita ? 'text-right' : 'text-left')}>{c.rotulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const s = situacaoDaLinha(l);
                  const at = atuacaoDe.get(l.funcionario_id) ?? [];
                  const pago = pagoEm(l);
                  const lanc = l.lancamentos[0]?.id ?? null;
                  return (
                    <tr key={l.funcionario_id} className={cn(LINHA_FONTES, 'border-b border-border/40 hover:bg-muted/40')} data-testid="folha-mes-linha">
                      <td className={TD_FONTES_TEXTO} title={l.vinculo_a_confirmar ? `${l.nome} · vínculo a confirmar` : l.nome}>
                        <button type="button" className="max-w-full truncate text-left hover:underline" onClick={() => onFicha(l.funcionario_id)}>{l.nome}</button>
                      </td>
                      <td className={cn(TD_FONTES_TEXTO, at.length === 0 && 'text-muted-foreground')} title={tituloDaFazenda(at, codigo) || undefined} data-testid="folha-mes-fazenda">{rotuloDaFazenda(at, codigo)}</td>
                      <td className={cn(TD_FONTES_NUM, l.previsto == null && 'text-muted-foreground')}>{valorOuTraco(l.previsto)}</td>
                      <td className={cn(TD_FONTES_NUM, l.recibo == null && 'text-muted-foreground')}>{valorOuTraco(l.recibo)}</td>
                      <td className={cn(TD_FONTES_NUM, l.diferenca ? 'text-amber-700' : 'text-muted-foreground')}>
                        {l.diferenca == null || l.diferenca === 0 ? '—' : `${l.diferenca > 0 ? '+' : ''}${n2(l.diferenca)}`}
                      </td>
                      <td className={cn(TD_FONTES_DATA, !pago && 'text-muted-foreground')}>{pago ? dataBR(pago) : '—'}</td>
                      <td className={TD_FONTES} title={s.texto}>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={cn('h-1.5 w-1.5 rounded-full', PONTO[s.tom])} />{s.texto}</span>
                      </td>
                      {/* o "ligar" fica no lugar dele (não corta); só a frase corta, com ela inteira no `title` (REGRA DE CORTE) */}
                      <td className={cn(TD_FONTES, !l.falta_frase && 'text-muted-foreground')}>
                        <div className="flex min-w-0 items-center">
                          {l.falta.includes('ligar') && (
                            <button type="button" className="mr-1 flex-none font-semibold text-primary hover:underline" onClick={() => void pedirLigar(l)} data-testid="folha-mes-ligar">ligar</button>
                          )}
                          <span className="min-w-0 truncate" title={l.falta_frase ?? undefined}>{l.falta_frase ?? '—'}</span>
                        </div>
                      </td>
                      <td className={TD_FONTES}>
                        {l.recibos.length === 0 ? <span className="text-muted-foreground">—</span> : (
                          <button type="button" className="text-primary hover:underline" title={l.recibos.map(r => r.nome).join(' · ')}
                            onClick={() => void ver(l.recibos[0].bucket, l.recibos[0].storage_path, l.recibos[0].nome)} data-testid="folha-mes-ver-recibo">
                            ver{l.recibos.length > 1 ? ` +${l.recibos.length - 1}` : ''}
                          </button>
                        )}
                      </td>
                      <td className={cn(TD_FONTES, 'text-center')}>
                        {lanc && (
                          <button type="button" className="inline-flex items-center text-primary" onClick={() => setAbrindo(lanc)}
                            title={l.lancamentos.length > 1 ? `${l.lancamentos.length} lançamentos — abre o 1º` : 'abrir o lançamento'} data-testid="folha-mes-abrir">
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {linhas.length === 0 && (
                  <tr className={LINHA_FONTES}>
                    <td colSpan={COLUNAS.length} className={cn(TD_FONTES, 'py-6 text-center text-muted-foreground')}>
                      {isLoading ? 'Carregando…' : error ? 'Não consegui ler a folha do mês. Tente de novo.' : 'Ninguém nesta folha.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={cn(RODAPE_REGUA, 'overflow-x-hidden overflow-y-scroll')} data-testid="folha-mes-rodape">
            <table className="w-full table-fixed border-collapse">
              <Colunas />
              <tbody>
                <tr className="h-[24px] text-[11px] font-semibold">
                  <td colSpan={2} className="truncate px-1" title={t ? `${t.pessoas} funcionários · ${t.confere} conferem` : undefined}>
                    {t ? `${t.pessoas.toLocaleString('pt-BR')} ${t.pessoas === 1 ? 'funcionário' : 'funcionários'}` : ''}
                  </td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums">{t ? valorOuTraco(t.previsto) : ''}</td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums">{t ? valorOuTraco(t.recibo) : ''}</td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums">{t && t.diferenca ? n2(t.diferenca) : '—'}</td>
                  <td colSpan={5} className="truncate px-1 text-[10px] font-normal" data-testid="folha-mes-contagem"
                    title={t ? `${t.confere} conferem · ${t.diferencas} com diferença · ${t.sem_recibo} sem recibo · ${t.a_conferir} a conferir · ${t.sem_previsto} sem previsto` : undefined}>
                    {t && <>
                      <TextoReservado texto={`${t.confere}`} reserva="999" /> conferem · <TextoReservado texto={`${t.diferencas}`} reserva="999" /> com diferença ·{' '}
                      <TextoReservado texto={`${t.sem_recibo}`} reserva="999" /> sem recibo
                    </>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {visualizador}
      {abrindo && <LancamentoDaFolha lancamentoId={abrindo} aoFechar={() => setAbrindo(null)} onAbrirFuncionario={id => { setAbrindo(null); onFicha(id); }} />}
      {recibo && (
        <FolhaDaCaixaDialog entrada={recibo} aoFechar={() => setRecibo(null)} aoAplicado={() => void reler()}
          aoConcluir={() => {
            const lido = recibo.folha;
            setRecibo(null);
            /* depois de aplicar, a tela mostra a folha QUE o recibo trouxe */
            setPeriodo(mesUnico(Number(lido.competencia.slice(0, 4)), Number(lido.competencia.slice(5, 7))));
            setTipo(lido.tipo);
            void reler();
          }} />
      )}
    </div>
  );
}

/* enquanto lê: os 4 lugares já no lugar (nada se desloca quando a resposta chega) */
const lugaresVazios = [
  { chave: 'espelho', rotulo: 'Espelho da folha', chegou: false, detalhe: '…' },
  { chave: 'recibos', rotulo: 'Recibos', chegou: false, detalhe: '…' },
  { chave: 'guia_fgts', rotulo: 'Guia FGTS', chegou: false, detalhe: '…' },
  { chave: 'guia_inss', rotulo: 'Guia INSS', chegou: false, detalhe: '…' },
];
