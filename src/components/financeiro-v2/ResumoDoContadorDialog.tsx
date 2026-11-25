/**
 * FOLHA-RESUMO-CONTADOR-01 — a PRÉVIA do resumo do contador ("Extrato Mensal") aberto pela Caixa: uma linha por EMPRESA (CAEPF) com o FGTS
 * do contador, a soma dos empregados (confere / não fecha), a fazenda (pelo CAEPF) e a previsão que o banco vai criar ("FGTS 13º 1ª
 * parcela", vencimento); "Prever FGTS" grava; "Desfazer" pede o motivo e mostra o que volta antes.
 * Mesma régua e mesmo molde da prévia da folha (`FolhaDaCaixaDialog`): quadro de altura fixa, só o corpo rola, nada se corta (quebra).
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TH_REGUA, TD_REGUA, TD_REGUA_NUM } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { dataBR, valorBR, type Selo, type Tom } from '@/lib/financeiro/boleto/caixaDeBoletos';
import { ROTULO_DO_TIPO, competenciaBR } from '@/lib/folha/folhaNaCaixa';
import type { OQueAconteceNoFgts } from '@/lib/folha/resumoNaCaixa';
import type { FolhaCaixaApi, ResumoCaixaApi } from '@/lib/folha/folhaCaixaApi';
import { caixaDeTitulo } from '@/lib/fornecedores/consultaCnpj';
import { useResumoDaCaixa, type EntradaDoResumo } from '@/hooks/useResumoDaCaixa';

const TOM: Record<Tom, string> = {
  ok: 'bg-green-100 text-green-800', ambar: 'bg-amber-100 text-amber-800', vermelho: 'bg-red-100 text-red-800',
  cinza: 'bg-gray-200 text-gray-700', azul: 'bg-blue-100 text-blue-800',
};
const SeloDoResumo = ({ s, testid }: { s: Selo; testid?: string }) => (
  <span className={cn('inline-block shrink-0 rounded-[3px] px-1 text-[9.5px] font-semibold leading-[15px]', TOM[s.tom])} data-testid={testid}>{s.texto}</span>
);
export const SELO_DO_FGTS: Record<OQueAconteceNoFgts, Selo> = {
  preve: { texto: 'cria a previsão', tom: 'azul' }, sem_fazenda: { texto: 'sem fazenda', tom: 'vermelho' },
  sem_molde: { texto: 'sem molde', tom: 'vermelho' }, sem_fgts: { texto: 'sem FGTS', tom: 'cinza' }, sem_resposta: { texto: '—', tom: 'cinza' },
};
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');
const TH_NUM = cn(TH, 'text-right');
const LINHA = 'h-[19px] border-b border-border/40';
const BOTAO = 'h-[16px] shrink-0 rounded-[3px] border px-1.5 text-[9.5px] font-medium leading-[14px] disabled:opacity-50';
/* px para 980 de tabela (o modal tem 1000); Empresa é a elástica */
const COLS = [52, null, 124, 50, 92, 112, 150, 76, 110] as const;
const TD_QUEBRA = cn(TD_REGUA, 'whitespace-normal break-words py-[3px] leading-[12px]');
/** as páginas da empresa: seguidas = a faixa ("1–4"), senão a lista ("1, 3") */
export const paginasDoResumo = (p: readonly number[]): string =>
  p.length > 2 && p.every((x, i) => i === 0 || x === p[i - 1] + 1) ? `${p[0]}–${p[p.length - 1]}` : p.join(', ');
/** 14 dígitos → "000.000.000/000-00" (o CAEPF como no papel); outro tamanho, como veio */
export const caepfBR = (d: string): string => (/^\d{14}$/.test(d) ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}/${d.slice(9, 12)}-${d.slice(12)}` : d);

export function ResumoDoContadorDialog({ entrada, clienteNome, aoFechar, aoAplicado, api, folhaApi }: {
  entrada: EntradaDoResumo; clienteNome?: string | null; aoFechar: () => void;
  /** depois do Prever (a Caixa marca a linha como feita e resolve a entrada do e-mail) */
  aoAplicado?: () => void;
  api?: ResumoCaixaApi; folhaApi?: Pick<FolhaCaixaApi, 'desfazer'>;
}) {
  const r = useResumoDaCaixa(entrada, { api, folha: folhaApi });
  const { resumo, nomeDoArquivo } = entrada;
  const [abrirDesfazer, setAbrirDesfazer] = useState(false);
  const [motivoDesfazer, setMotivoDesfazer] = useState('');
  const aplicado = r.fase === 'aplicado' || !!r.resposta?.jaAplicado;
  const previstas = r.linhas.filter((l) => l.acontece === 'preve').length;
  const titulo = `Resumo do contador · ${ROTULO_DO_TIPO[resumo.tipo]} · ${competenciaBR(resumo.competencia)}${clienteNome ? ` · ${clienteNome}` : ''}`;
  const confere = resumo.empresas.every((e) => e.confere);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(400px,calc(100vh-16px))] w-[min(1000px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-1.5 [&>button]:text-primary-foreground"
        data-testid="resumo-do-contador">
        <div className="flex h-[30px] shrink-0 items-center gap-3 bg-primary px-3 pr-9 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className={cn('ml-auto shrink-0 text-[10px]', aplicado ? 'font-semibold text-green-300' : 'text-primary-foreground/85')} data-testid="estado-do-resumo">
            {r.fase === 'aplicado' ? `✓ ${previstas} ${previstas === 1 ? 'previsão criada' : 'previsões criadas'}` : aplicado ? '✓ Já aplicado' : 'nada é gravado antes do Prever'}
          </DialogDescription>
        </div>
        <div className="flex h-[24px] shrink-0 items-center gap-3 border-b px-3 text-[10px]">
          <span className="min-w-0 flex-1 truncate" title={nomeDoArquivo}>{nomeDoArquivo}</span>
          <span className="w-[86px] shrink-0 whitespace-nowrap text-right tabular-nums" data-testid="empresas">{resumo.empresas.length} {resumo.empresas.length === 1 ? 'empresa' : 'empresas'}</span>
          <span className="w-[150px] shrink-0 whitespace-nowrap text-right tabular-nums" data-testid="total-fgts">FGTS R$ {valorBR(resumo.totalFgts)}</span>
          <span className={cn('w-[200px] shrink-0 whitespace-nowrap text-right', confere ? 'text-green-800' : 'text-red-700')} data-testid="confere-fgts">
            {confere ? 'empregados = total de cada empresa' : 'a soma dos empregados não fecha'}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto" data-testid="quadro-do-resumo" data-desloca-livre>
          <table className="w-full table-fixed border-collapse" data-testid="tabela-do-resumo">
            <colgroup>{COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
            <thead>
              <tr>
                <th className={TH}>Pág.</th><th className={TH}>Empresa</th><th className={TH}>CAEPF</th><th className={TH_NUM}>Empr.</th>
                <th className={TH_NUM}>FGTS</th><th className={TH_NUM}>Soma empr.</th><th className={TH}>Fazenda</th><th className={TH}>Venc.</th><th className={TH}>O que acontece</th>
              </tr>
            </thead>
            <tbody>
              {r.linhas.map((l) => (
                <tr key={l.k} className={LINHA} data-testid={`linha-resumo-${l.k}`}>
                  <td className={TD_REGUA_NUM}>{paginasDoResumo(resumo.empresas[l.k]?.paginas ?? [])}</td>
                  <td className={TD_QUEBRA}>{caixaDeTitulo(l.empresa)}</td>
                  <td className={cn(TD_REGUA_NUM, 'text-left')}>{caepfBR(l.cei)}</td>
                  <td className={TD_REGUA_NUM}>{l.empregados}</td>
                  <td className={cn(TD_REGUA_NUM, 'font-semibold')} data-testid={`fgts-${l.k}`}>{valorBR(l.fgts)}</td>
                  <td className={cn(TD_REGUA_NUM, !l.confere && 'text-red-700')} data-testid={`soma-${l.k}`}
                    title={l.confere ? 'a soma do FGTS dos empregados = o total da empresa' : 'a soma dos empregados difere do total do contador (a previsão usa o total)'}>
                    {valorBR(l.somaDosEmpregados)}
                  </td>
                  <td className={TD_QUEBRA} data-testid={`fazenda-${l.k}`}>{l.fazenda ?? '—'}</td>
                  <td className={cn(TD_REGUA_NUM, 'text-left')} data-testid={`vencimento-${l.k}`}>{dataBR(l.vencimento)}</td>
                  <td className={TD_REGUA}>
                    {r.fase === 'preparando' ? <span>…</span> : <SeloDoResumo s={SELO_DO_FGTS[l.acontece]} testid={`acontece-resumo-${l.k}`} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex h-[20px] shrink-0 items-center border-t px-3 text-[9.5px] text-muted-foreground" data-testid="descricao-da-previsao">
          {r.linhas.find((l) => l.descricao)?.descricao
            ? `cada fazenda ganha "${r.linhas.find((l) => l.descricao)?.descricao}" previsto, na conta e classificação do último FGTS dela`
            : 'a previsão sai na conta e classificação do último FGTS de cada fazenda'}
        </div>
        {abrirDesfazer && (
          <div className="flex h-[28px] shrink-0 items-center gap-2 border-t px-3 text-[10px]" data-testid="faixa-desfazer-resumo">
            <Input value={motivoDesfazer} onChange={(e) => setMotivoDesfazer(e.target.value)} maxLength={300} placeholder="motivo do desfazer"
              className="h-[20px] w-[260px] px-2 text-[10px]" data-testid="motivo-desfazer-resumo" />
            <button type="button" className={cn(BOTAO, 'border-border bg-card')} disabled={!motivoDesfazer.trim()} onClick={() => void r.preverDesfazer(motivoDesfazer)} data-testid="prever-desfazer-resumo">
              Ver o que volta
            </button>
            <span className="min-w-0 flex-1 truncate" data-testid="o-que-volta-resumo">
              {r.desfeito ? `cancela ${r.desfeito.criados} ${r.desfeito.criados === 1 ? 'previsão' : 'previsões'}` : ''}
            </span>
            <button type="button" className={cn(BOTAO, 'border-red-700 bg-red-700 text-white')} disabled={!r.desfeito || !motivoDesfazer.trim() || r.fase === 'desfazendo'}
              onClick={() => void r.desfazer(motivoDesfazer).then((ok) => { if (ok) { setAbrirDesfazer(false); setMotivoDesfazer(''); } })} data-testid="confirmar-desfazer-resumo">
              Desfazer
            </button>
          </div>
        )}
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-t px-3">
          <span className={cn('min-w-0 flex-1 truncate text-[10px]', r.fase === 'erro' ? 'text-red-700' : 'text-foreground')} title={r.frase ?? r.motivo ?? undefined} data-testid="frase-do-resumo">
            {r.frase ?? (r.fase === 'aplicado' ? 'Previsto: o FGTS de cada fazenda está em Lançamentos como previsto.' : r.motivo ?? '')}
          </span>
          {r.fase !== 'aplicado' && <Button variant="outline" size="sm" className="h-[22px] w-[64px] text-[10px]" onClick={aoFechar}>Fechar</Button>}
          {aplicado && (
            <Button variant="outline" size="sm" className="h-[22px] w-[96px] text-[10px]" onClick={() => setAbrirDesfazer((x) => !x)} data-testid="desfazer-resumo">Desfazer…</Button>
          )}
          {r.fase === 'aplicado' && (
            <Button size="sm" className="h-[22px] w-[64px] bg-[#E7C873] text-[10px] font-semibold text-foreground hover:bg-[#D9B95F]" onClick={aoFechar} data-testid="concluir-resumo">Concluir</Button>
          )}
          {!aplicado && (
            <Button size="sm" className="h-[22px] w-[110px] bg-[#E7C873] text-[10px] text-foreground hover:bg-[#D9B95F]" disabled={r.fase !== 'previa' || !!r.motivo}
              onClick={() => void r.aprovar().then((ok) => { if (ok) aoAplicado?.(); })} data-testid="prever-fgts" title={r.motivo ?? 'cria a previsão do FGTS em cada fazenda'}>
              {r.fase === 'aplicando' ? 'Gravando…' : `Prever FGTS (${previstas})`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
