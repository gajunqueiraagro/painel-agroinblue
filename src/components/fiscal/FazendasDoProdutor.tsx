/**
 * FISCAL onda 1 (a) — a aba "Fazendas e participação" da ficha do produtor (gabarito: cadastro-produtor-mock.html, C3 caso Vera).
 *
 * ⚠ A COMPOSIÇÃO É DA FAZENDA, NÃO DO TITULAR: quem divide, com quantos %, em que condição e o que o financeiro registra. Editar (✎ ou
 * "+ fazenda") abre a composição INTEIRA da fazenda e grava pela `fn_fiscal_fazenda_titulares_gravar` a partir de um MÊS (mesmo mês da
 * versão vigente = corrige; outro = nova versão, a anterior termina no mês de antes). A soma ≠ 100 é AVISO do banco, não recusa (D-P5).
 * ⚠ "O QUE O FINANCEIRO REGISTRA" muda a mesma composição (corrige a versão vigente, só o `registra` deste titular): o livro nunca divide
 * duas vezes.
 * ⚠ ACORDOS DE RATEIO: a lista é a `fn_fiscal_acordos_lista`; criar/editar pela `fn_fiscal_acordo_rateio_gravar` (parte vazia = "a
 * confirmar": os ligados não entram no livro até ela ser preenchida). Ligar lançamentos a um acordo é da tela do lançamento (onda 2).
 */
import { useMemo, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { BlocoFormulario, Rotulo, REGUA_CAMPO, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import { TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM } from '@/components/ui/regua-tabela';
import { CampoDoMes } from '@/components/mapa-geo/CampoDoMes';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import {
  anosDasVersoes, brl, comQuemDivide, CONDICOES_IMOVEL, inicioDoMes, mesBR, pct, ROTULO_COMO_PAGA, ROTULO_CONDICAO_IMOVEL, ROTULO_DOC_EM,
  somaDaFazenda, type Acordo, type ComoPaga, type CondicaoImovel, type DocumentoEm, type ParteNaFazenda, type Registra, type Titular,
} from '@/lib/fiscal/produtores';
import type { ImovelDaFazenda } from '@/lib/fiscal/produtoresApi';
import { useProdutoresApi } from '@/hooks/useProdutores';
import type { Pedido } from './PreviaDoBanco';
import { Info, QUADRO_FICHA, TH_FICHA, TH_FICHA_NUM } from './AbasDoProdutor';

type Previa = (titulo: string, pedido: Pedido, depois?: (r: unknown) => void) => Promise<string | null>;
interface Fazenda { id: string; nome: string }

export function AbaFazendas({ titular, titulares, fazendas, imoveis, composicao, acordos, clienteId, previa }: {
  titular: Titular; titulares: readonly Titular[]; fazendas: readonly Fazenda[]; imoveis: readonly ImovelDaFazenda[];
  composicao: Map<string, ParteNaFazenda[]>; acordos: readonly Acordo[]; clienteId: string; previa: Previa;
}) {
  const api = useProdutoresApi();
  const [editar, setEditar] = useState<{ fazendaId: string } | null>(null);
  const [acordo, setAcordo] = useState<{ acordo: Acordo | null } | null>(null);
  const [escolherFazenda, setEscolherFazenda] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const imovelDe = useMemo(() => new Map(imoveis.map(i => [i.fazenda_id, i])), [imoveis]);
  const semEsta = fazendas.filter(f => !titular.fazendas.some(p => p.fazenda_id === f.id));
  const meus = acordos.filter(a => a.produtor_id === titular.id || a.terceiro_id === titular.id);
  const ehProdutor = titular.papel === 'produtor';

  const trocarRegistra = async (fazendaId: string, registra: Registra) => {
    const partes = composicao.get(fazendaId) ?? [];
    const desde = titular.fazendas.find(f => f.fazenda_id === fazendaId)?.desde;
    if (!desde) return;
    const nome = fazendas.find(f => f.id === fazendaId)?.nome ?? 'fazenda';
    setErro(await previa(`${nome} · o que o financeiro registra`, s => api.gravarComposicao(fazendaId, desde,
      partes.map(p => ({ titular_id: p.titular_id, participacao: p.participacao, condicao: p.condicao, registra: p.titular_id === titular.id ? registra : p.registra })), s)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="produtor-aba-fazendas">
      <div className={cn(QUADRO_FICHA, 'max-h-[132px] shrink-0')}>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 86 }} /><col style={{ width: 70 }} /><col style={{ width: 82 }} /><col /><col style={{ width: 20 }} /></colgroup>
          <thead className="text-primary-foreground"><tr>
            <th className={TH_FICHA}>Fazenda</th><th className={TH_FICHA}>Imóvel</th>
            <th className={TH_FICHA}><span className="inline-flex items-center">Condição<Info texto="Proprietário, condômino, arrendatário, parceiro ou comodatário. Vai para o LCDPR, no cadastro do imóvel." /></span></th>
            <th className={TH_FICHA_NUM}><span className="inline-flex items-center">Particip.<Info texto="Parte do produtor nas receitas e despesas da fazenda. O livro caixa dele leva essa parte de cada lançamento, a não ser que o lançamento diga outra coisa." /></span></th>
            <th className={TH_FICHA}>Vigência</th><th className={cn(TH_FICHA, 'truncate')} title="Divide com: os outros titulares desta fazenda">Divide com</th><th className={TH_FICHA} />
          </tr></thead>
          <tbody>
            {titular.fazendas.map(f => {
              const im = imovelDe.get(f.fazenda_id);
              const imovel = im ? [im.nirf ? `NIRF ${im.nirf}` : 'sem NIRF', `CCIR ${im.ccir ? '✓' : '—'}`, `CAR ${im.car ? '✓' : '—'}`].join(' · ') : '—';
              const divide = comQuemDivide(f.fazenda_id, titular.id, composicao);
              return (
                <tr key={f.fazenda_id} className="border-b border-border/40" data-testid="produtor-fazenda">
                  <td className={TD_REGUA_TEXTO} title={f.fazenda}>{f.fazenda}</td>
                  <td className={TD_REGUA_TEXTO} title={imovel}>{imovel}</td>
                  <td className={TD_REGUA_TEXTO}>{ROTULO_CONDICAO_IMOVEL[f.condicao]}</td>
                  <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{pct(f.participacao)}</td>
                  <td className={cn(TD_REGUA, 'whitespace-nowrap tabular-nums')} title={f.ate ? `até ${mesBR(f.ate)}` : undefined}>desde {mesBR(f.desde)}</td>
                  <td className={TD_REGUA_TEXTO} title={divide}>{divide}</td>
                  <td className={cn(TD_REGUA, 'px-0 text-center')}>
                    <button type="button" className="text-muted-foreground hover:text-primary" title="editar a composição desta fazenda" onClick={() => setEditar({ fazendaId: f.fazenda_id })}>
                      <Pencil className="mx-auto h-3 w-3" /></button>
                  </td>
                </tr>
              );
            })}
            {titular.fazendas.length === 0 && <tr><td colSpan={7} className={cn(TD_REGUA, 'py-3 text-center text-muted-foreground')}>sem participação em fazenda</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex h-[24px] shrink-0 items-center gap-2 text-[10px]">
        <span className="text-muted-foreground">+ fazenda</span>
        <SearchableSelect value={escolherFazenda} onValueChange={v => { setEscolherFazenda(''); if (v) setEditar({ fazendaId: v }); }} allLabel="escolha a fazenda" allValue=""
          options={semEsta.map(f => ({ value: f.id, label: f.nome }))} className="w-[220px]" triggerClassName="h-[22px] text-[10px]" disabled={!titular.ativo} />
        <span className="min-w-0 flex-1 truncate text-destructive" title={erro ?? undefined}>{erro ?? ''}</span>
      </div>

      {ehProdutor && titular.fazendas.length > 0 && (
        <BlocoFormulario titulo="O que o financeiro desta fazenda registra" className="shrink-0"
          acao={<Info texto="Escolha como o financeiro foi lançado. Assim o livro caixa nunca divide duas vezes." />}>
          <div className="max-h-[76px] overflow-y-auto">
            <table className="w-full table-fixed border-collapse"><colgroup><col style={{ width: 158 }} /><col /></colgroup><tbody>
            {titular.fazendas.map(f => (
              <tr key={f.fazenda_id} className="h-[26px]" data-testid="produtor-registra">
                <td className="truncate pr-2 text-[10px]" title={f.fazenda}>{f.fazenda}</td>
                <td>
                <Segmentado altura={22} fonte={10} valor={f.registra} onEscolher={v => { if (v !== f.registra) void trocarRegistra(f.fazenda_id, v); }} opcoes={[
                  { valor: 'total', rotulo: 'O total da fazenda', title: 'o financeiro registra o total da fazenda: o livro divide pela participação' },
                  { valor: 'so_a_parte', rotulo: `Só a parte de ${titular.nome.split(' ')[0]}`, title: 'o financeiro registra só a parte dele: o livro leva 100%' },
                ]} />
                </td>
              </tr>
            ))}
            </tbody></table>
          </div>
        </BlocoFormulario>
      )}

      <BlocoFormulario titulo="Acordos de rateio com terceiros" className="min-h-0 flex-1"
        acao={<button type="button" className="text-[10px] font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          disabled={!ehProdutor || !titular.ativo} title={ehProdutor ? undefined : 'o acordo nasce no produtor (com um terceiro)'} onClick={() => setAcordo({ acordo: null })}
          data-testid="produtor-acordo-novo">+ acordo</button>}>
        <div className={cn(QUADRO_FICHA, 'flex-1')}>
          <table className="w-full table-fixed border-collapse">
            <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 84 }} /><col style={{ width: 60 }} /><col style={{ width: 80 }} /><col style={{ width: 104 }} /><col style={{ width: 50 }} /><col style={{ width: 20 }} /></colgroup>
            <thead className="text-primary-foreground"><tr>
              <th className={TH_FICHA}>Acordo</th><th className={TH_FICHA}>Com</th><th className={TH_FICHA}>Fazenda</th><th className={TH_FICHA_NUM}>Parte</th>
              <th className={TH_FICHA}>Documento</th><th className={TH_FICHA}>Como paga</th><th className={TH_FICHA_NUM}>Ligados</th><th className={TH_FICHA} />
            </tr></thead>
            <tbody>
              {meus.map(a => {
                const com = a.produtor_id === titular.id ? a.terceiro : a.produtor;
                return (
                  <tr key={a.acordo_id} className={cn('border-b border-border/40', !a.ativo && 'text-muted-foreground')} data-testid="produtor-acordo">
                    <td className={TD_REGUA_TEXTO} title={a.ativo ? a.nome : `${a.nome} (inativo)`}>{a.nome}</td>
                    <td className={TD_REGUA_TEXTO} title={com}>{com}</td>
                    <td className={TD_REGUA_TEXTO} title={a.fazenda ?? 'todas'}>{a.fazenda ?? 'todas'}</td>
                    <td className={cn(TD_REGUA_NUM, 'font-semibold')} title={a.parte_produtor == null ? 'a confirmar: os ligados não entram no livro até lá' : undefined}>
                      {a.parte_produtor == null ? <span className="text-amber-700">a confirmar</span> : pct(a.parte_produtor)}</td>
                    <td className={TD_REGUA_TEXTO}>{ROTULO_DOC_EM[a.documento_em]}</td>
                    <td className={TD_REGUA_TEXTO}>{ROTULO_COMO_PAGA[a.como_paga]}</td>
                    <td className={TD_REGUA_NUM} title={a.ligados ? `${a.ligados} lançamento(s) · ${brl(a.soma_ligados)}` : 'nenhum lançamento ligado'}>{a.ligados}</td>
                    <td className={cn(TD_REGUA, 'px-0 text-center')}>
                      <button type="button" className="text-muted-foreground hover:text-primary disabled:opacity-40" disabled={a.produtor_id !== titular.id}
                        title={a.produtor_id === titular.id ? 'editar o acordo' : 'edite pelo produtor do acordo'} onClick={() => setAcordo({ acordo: a })}><Pencil className="mx-auto h-3 w-3" /></button>
                    </td>
                  </tr>
                );
              })}
              {meus.length === 0 && <tr><td colSpan={8} className={cn(TD_REGUA, 'py-3 text-center text-muted-foreground')}>nenhum acordo de rateio</td></tr>}
            </tbody>
          </table>
        </div>
      </BlocoFormulario>

      {editar && (
        <ComposicaoDialog fazenda={fazendas.find(f => f.id === editar.fazendaId) ?? { id: editar.fazendaId, nome: 'Fazenda' }}
          partes={composicao.get(editar.fazendaId) ?? []} incluir={titular} titulares={titulares} previa={previa} aoFechar={() => setEditar(null)} />
      )}
      {acordo && (
        <AcordoDialog acordo={acordo.acordo} produtor={titular} titulares={titulares} fazendas={fazendas} clienteId={clienteId} previa={previa}
          aoFechar={() => setAcordo(null)} />
      )}
    </div>
  );
}

/* ── a composição de uma fazenda ───────────────────────────────────────────────────────────────────────────────────────────── */
interface LinhaDaComposicao { titular_id: string; participacao: number | null; condicao: CondicaoImovel; registra: Registra }
function ComposicaoDialog({ fazenda, partes, incluir, titulares, previa, aoFechar }: {
  fazenda: Fazenda; partes: readonly ParteNaFazenda[]; incluir: Titular; titulares: readonly Titular[]; previa: Previa; aoFechar: () => void;
}) {
  const api = useProdutoresApi();
  const hoje = hojeLocal();
  const desdeAtual = partes.map(p => p.desde).filter((d): d is string => !!d).sort().slice(-1)[0] ?? null;
  const [mes, setMes] = useState<string | null>((desdeAtual ?? hoje).slice(0, 7));
  const [linhasC, setLinhas] = useState<LinhaDaComposicao[]>(() => {
    const l: LinhaDaComposicao[] = partes.map(p => ({ titular_id: p.titular_id, participacao: p.participacao, condicao: p.condicao, registra: p.registra }));
    if (!l.some(x => x.titular_id === incluir.id)) l.push({ titular_id: incluir.id, participacao: null, condicao: 'proprietario', registra: 'total' });
    return l;
  });
  const [erro, setErro] = useState<string | null>(null);
  const ativos = titulares.filter(t => t.ativo);
  const soma = somaDaFazenda(linhasC.map(l => ({ participacao: l.participacao ?? 0 })));
  const mudar = (i: number, p: Partial<LinhaDaComposicao>) => { setLinhas(l => l.map((x, j) => (j === i ? { ...x, ...p } : x))); setErro(null); };
  const verPrevia = async () => {
    if (!mes) { setErro('Informe o mês de início.'); return; }
    if (linhasC.some(l => !l.titular_id || !(l.participacao && l.participacao > 0))) { setErro('Escolha o titular e a participação de cada linha.'); return; }
    const e = await previa(`${fazenda.nome} · composição`, s => api.gravarComposicao(fazenda.id, inicioDoMes(mes),
      linhasC.map(l => ({ titular_id: l.titular_id, participacao: l.participacao ?? 0, condicao: l.condicao, registra: l.registra })), s), () => aoFechar());
    if (e) setErro(e);
  };
  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[360px] w-[760px] max-w-[calc(100vw-16px)] flex-col gap-0 overflow-hidden p-0 [&>button]:top-2 [&>button]:text-primary-foreground" data-testid="produtor-composicao-dialog">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="truncate text-[11px] font-semibold">{fazenda.nome} · quem é titular</DialogTitle>
          <DialogDescription className="sr-only">A composição da fazenda a partir do mês escolhido.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 bg-muted p-2">
          <div className="flex items-end gap-2">
            <div className="w-[170px]"><Rotulo texto="Vale a partir de (mês)" /><CampoDoMes valor={mes} onMudar={setMes} anos={anosDasVersoes(hoje)} anoDeReferencia={Number(hoje.slice(0, 4))} testid="produtor-composicao-mes" /></div>
            <p className="pb-1.5 text-[10px] text-muted-foreground">{desdeAtual ? `a versão de hoje vale desde ${mesBR(desdeAtual)}: o mesmo mês corrige; outro mês cria a nova` : 'primeira composição desta fazenda'}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded border bg-card p-1">
            {linhasC.map((l, i) => (
              <div key={i} className={cn(GRADE_FORMULARIO, 'mb-1 grid-cols-[minmax(0,1fr)_84px_120px_132px_20px] items-center')} data-testid="produtor-composicao-linha">
                <SearchableSelect value={l.titular_id} onValueChange={v => mudar(i, { titular_id: v })} semTodos allLabel="titular" allValue=""
                  options={ativos.map(t => ({ value: t.id, label: t.papel === 'terceiro' ? `${t.nome} (terceiro)` : t.nome }))} triggerClassName={REGUA_CAMPO} />
                <CampoNumeroComConta valor={l.participacao} onChange={v => mudar(i, { participacao: v })} percentual sufixoDentro="%" className={REGUA_CAMPO} />
                <SearchableSelect value={l.condicao} onValueChange={v => { const c = CONDICOES_IMOVEL.find(x => x === v); if (c) mudar(i, { condicao: c }); }} semTodos
                  allLabel="condição" allValue="" options={CONDICOES_IMOVEL.map(c => ({ value: c, label: ROTULO_CONDICAO_IMOVEL[c] }))} triggerClassName={REGUA_CAMPO} />
                <Segmentado altura={28} fonte={10} valor={l.registra} onEscolher={v => mudar(i, { registra: v })} opcoes={[
                  { valor: 'total', rotulo: 'total', title: 'o financeiro registra o total da fazenda: o livro divide pela participação' },
                  { valor: 'so_a_parte', rotulo: 'só a parte', title: 'o financeiro registra só a parte dele: o livro leva 100%' },
                ]} />
                <button type="button" className="text-muted-foreground hover:text-destructive" title="tirar da composição" onClick={() => setLinhas(x => x.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <button type="button" className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              onClick={() => setLinhas(x => [...x, { titular_id: '', participacao: null, condicao: 'proprietario', registra: 'total' }])}><Plus className="h-3 w-3" /> titular</button>
          </div>
          <div className="flex h-[16px] shrink-0 items-center gap-2 text-[10px]">
            <span className={cn('tabular-nums', soma === 100 ? 'text-muted-foreground' : 'text-amber-700')} data-testid="produtor-composicao-soma">soma {pct(soma)}{soma !== 100 && linhasC.length ? ' (aviso: não é 100%)' : ''}</span>
            <span className="min-w-0 flex-1 truncate text-destructive" title={erro ?? undefined}>{erro ?? ''}</span>
          </div>
        </div>
        <div className="flex h-[40px] shrink-0 items-center justify-end gap-2 border-t bg-card px-3">
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[26px] text-[11px]" onClick={() => void verPrevia()} data-testid="produtor-composicao-previa">Ver prévia</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── o acordo de rateio ────────────────────────────────────────────────────────────────────────────────────────────────────── */
function AcordoDialog({ acordo, produtor, titulares, fazendas, clienteId, previa, aoFechar }: {
  acordo: Acordo | null; produtor: Titular; titulares: readonly Titular[]; fazendas: readonly Fazenda[]; clienteId: string; previa: Previa; aoFechar: () => void;
}) {
  const api = useProdutoresApi();
  const [nome, setNome] = useState(acordo?.nome ?? '');
  const [terceiro, setTerceiro] = useState(acordo?.terceiro_id ?? '');
  const [fazenda, setFazenda] = useState(acordo?.fazenda_id ?? '');
  const [parte, setParte] = useState<number | null>(acordo?.parte_produtor ?? null);
  const [docEm, setDocEm] = useState<DocumentoEm>(acordo?.documento_em ?? 'produtor');
  const [como, setComo] = useState<ComoPaga>(acordo?.como_paga ?? 'direto');
  const [palavras, setPalavras] = useState((acordo?.palavras ?? []).join(', '));
  const [inicio, setInicio] = useState(acordo?.vigencia_inicio ?? '');
  const [fim, setFim] = useState(acordo?.vigencia_fim ?? '');
  const [ativo, setAtivo] = useState(acordo?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const terceiros = titulares.filter(t => t.papel === 'terceiro' && (t.ativo || t.id === acordo?.terceiro_id));
  const verPrevia = async () => {
    if (!nome.trim()) { setErro('Dê um nome ao acordo.'); return; }
    if (!terceiro) { setErro('Escolha o terceiro (quem divide a despesa).'); return; }
    if (!inicio) { setErro('Informe o início do acordo.'); return; }
    const dados: Record<string, unknown> = {
      nome: nome.trim(), produtor_id: produtor.id, terceiro_id: terceiro, fazenda_id: fazenda, parte_produtor: parte == null ? '' : String(parte),
      documento_em: docEm, como_paga: como, palavras: palavras.split(',').map(p => p.trim()).filter(Boolean), vigencia_inicio: inicio, vigencia_fim: fim, ativo,
    };
    const e = await previa(acordo ? `Acordo ${acordo.nome}` : 'Novo acordo de rateio', s => api.gravarAcordo(clienteId, acordo?.acordo_id ?? null, dados, s), () => aoFechar());
    if (e) setErro(e);
  };
  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[380px] w-[640px] max-w-[calc(100vw-16px)] flex-col gap-0 overflow-hidden p-0 [&>button]:top-2 [&>button]:text-primary-foreground" data-testid="produtor-acordo-dialog">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="truncate text-[11px] font-semibold">{acordo ? `Acordo ${acordo.nome}` : `Novo acordo de rateio · ${produtor.nome}`}</DialogTitle>
          <DialogDescription className="sr-only">O acordo de rateio do produtor com um terceiro.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2">
          <BlocoFormulario titulo="O acordo">
            <div className={cn(GRADE_FORMULARIO, 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]')}>
              <div><Rotulo texto="Nome" obrig /><Input value={nome} onChange={e => { setNome(e.target.value); setErro(null); }} placeholder="Rateio folha" className={REGUA_CAMPO} data-testid="produtor-acordo-nome" /></div>
              <div>
                <Rotulo texto="Com (terceiro)" obrig />
                <SearchableSelect value={terceiro} onValueChange={v => { setTerceiro(v); setErro(null); }} semTodos allLabel={terceiros.length ? 'escolha' : 'cadastre o terceiro antes'} allValue=""
                  options={terceiros.map(t => ({ value: t.id, label: t.nome }))} triggerClassName={REGUA_CAMPO} disabled={!!acordo && acordo.ligados > 0} />
              </div>
              <div>
                <Rotulo texto="Fazenda" />
                <SearchableSelect value={fazenda} onValueChange={setFazenda} allLabel="todas" allValue="" options={fazendas.map(f => ({ value: f.id, label: f.nome }))} triggerClassName={REGUA_CAMPO} />
              </div>
            </div>
            <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)]')}>
              <div>
                <div className="flex items-center"><Rotulo texto="Parte (%)" className="mb-0.5" /><Info texto={`A parte de ${produtor.nome.split(' ')[0]}. Vazio = a confirmar: os lançamentos ligados não entram no livro até a parte ser preenchida.`} /></div>
                <CampoNumeroComConta valor={parte} onChange={setParte} percentual sufixoDentro="%" placeholder="a confirmar" className={REGUA_CAMPO} />
              </div>
              <div>
                <Rotulo texto="Documento em nome de" />
                <Segmentado altura={28} fonte={10} valor={docEm} onEscolher={setDocEm} opcoes={[
                  { valor: 'produtor', rotulo: 'produtor' }, { valor: 'terceiro', rotulo: 'terceiro' }, { valor: 'alterna', rotulo: 'um ou outro' },
                ]} />
              </div>
              <div>
                <Rotulo texto="Como paga" />
                <Segmentado altura={28} fonte={10} valor={como} onEscolher={setComo} opcoes={[
                  { valor: 'transfere_ao_terceiro', rotulo: 'transfere ao terceiro' }, { valor: 'direto', rotulo: 'paga direto' },
                ]} />
              </div>
            </div>
          </BlocoFormulario>
          <BlocoFormulario titulo="Vigência e sugestão">
            <div className={cn(GRADE_FORMULARIO, 'grid-cols-[120px_120px_minmax(0,1fr)_120px]')}>
              <div><Rotulo texto="Início" obrig /><DatePicker value={inicio} onChange={v => { setInicio(v ?? ''); setErro(null); }} className={REGUA_CAMPO} /></div>
              <div><Rotulo texto="Fim" /><DatePicker value={fim} onChange={v => setFim(v ?? '')} className={REGUA_CAMPO} /></div>
              <div>
                <div className="flex items-center"><Rotulo texto="Palavras da sugestão" className="mb-0.5" /><Info texto="Separadas por vírgula. A sugestão procura cada uma na descrição e no fornecedor do lançamento." /></div>
                <Input value={palavras} onChange={e => setPalavras(e.target.value)} placeholder="folha, mercado" className={REGUA_CAMPO} />
              </div>
              <div>
                <Rotulo texto="Situação" />
                <Segmentado altura={28} fonte={10} valor={ativo ? 'ativo' : 'inativo'} onEscolher={v => setAtivo(v === 'ativo')} opcoes={[
                  { valor: 'ativo', rotulo: 'ativo' }, { valor: 'inativo', rotulo: 'inativo', title: 'com lançamentos ligados, o banco pede encerrar pela vigência' },
                ]} />
              </div>
            </div>
          </BlocoFormulario>
          <p className="h-[13px] shrink-0 truncate text-[10px] text-destructive" title={erro ?? undefined}>{erro ?? ''}</p>
        </div>
        <div className="flex h-[40px] shrink-0 items-center justify-end gap-2 border-t bg-card px-3">
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[26px] text-[11px]" onClick={() => void verPrevia()} data-testid="produtor-acordo-previa">Ver prévia</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
