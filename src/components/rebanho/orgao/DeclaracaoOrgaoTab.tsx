/**
 * REBANHO-ORGAO-01 (F3) — Produção › Pecuária › Declaração ao órgão (mock aprovado 23/11 13:38, `ui-validar/rebanho-orgao-01-ref`).
 * O estado e os gestos: `useDeclaracaoOrgao`; a conta: `propostaDaDeclaracao` (F2, uma só para a tela e a planilha).
 * Mudanças do mock aprovadas no briefing (DX1/DX2): sem o selo "estimado" — o que o sistema não separa sai num BLOCO (a célula do
 * "Sistema hoje" e da Dif. mesclada nas faixas do bloco) e a troca de faixa sem nascimento lançado nasce EM BRANCO para a pessoa
 * preencher; o passo 3 é "órgão × sistema" (sem "campo"). Fonte = só o sistema.
 * ⚠ Sem número = "—" (nunca 0). Editado = amarelo + ↺ (volta ao sugerido). Faixa negativa = a frase em vermelho, e "Marcar como
 *   declarado" fica apagado com o motivo escrito.
 * ⚠ Layout fixo: a tabela tem `colgroup` em px; o lado direito 330px; nada muda de lugar com o estado (os botões têm lugar reservado).
 */
import { Fragment, useState, type ReactNode } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { TD_REGUA, TD_REGUA_NUM, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { extrairLinhasPdf } from '@/lib/oc/leitura/linhasDoPdf';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { useDeclaracaoOrgao, type DaFazenda, type LerLinhasDoPdf } from '@/hooks/useDeclaracaoOrgao';
import type { DeclaracaoApi } from '@/lib/rebanho/orgao/declaracaoApi';
import { FAIXAS, ROTULO_DA_FAIXA, type Faixa, type Sexo } from '@/lib/rebanho/orgao/tipos';
import type { LinhaDaProposta } from '@/lib/rebanho/orgao/propostaDaDeclaracao';
import { diasAte, prazoDaEtapa, type CelulaEditavel } from '@/lib/rebanho/orgao/montarDeclaracao';
import { baixarPlanilhaDaDeclaracao } from '@/lib/rebanho/orgao/planilhaDaDeclaracao';

const REGRA_DO_PDF: RegraDeAceite = { tipos: ['pdf'], tamanhoMaxBytes: 10 * 1024 * 1024 };
const lerPdfDoApp: LerLinhasDoPdf = async (f) => (await extrairLinhasPdf(f)).linhas;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataBR = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const n0 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'));
const comSinal = (v: number) => (v > 0 ? `+${v.toLocaleString('pt-BR')}` : v.toLocaleString('pt-BR'));
const NOME: Record<Sexo, string> = { F: 'Fêmea', M: 'Macho' };
const GRUPO: Record<Sexo, string> = { F: 'Fêmeas', M: 'Machos' };
const COLS = [52, 112, 58, 84, 84, 92, 62, 66, 76, 50];
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary');
/** A faixa que ainda passa para a próxima (37+ não passa) e a de cima — sem cast: o `=== 3` estreita a união. */
const daQuePassa = (k: Faixa): 0 | 1 | 2 | null => (k === 3 ? null : k);
const proxima = (k: 0 | 1 | 2): Faixa => (k === 0 ? 1 : k === 1 ? 2 : 3);
const LINHA = 'h-[26px] border-b border-border/40';

/** A tela do menu: o cliente vem do contexto. */
export function DeclaracaoOrgaoTab() {
  const { clienteAtual } = useCliente();
  return <DeclaracaoOrgao clienteId={clienteAtual?.id ?? null} clienteNome={clienteAtual?.nome ?? ''} />;
}

/** A tela de verdade (monta isolada na bancada e no teste: a API, o leitor do PDF e o "hoje" injetáveis). */
export function DeclaracaoOrgao(props: { clienteId: string | null; clienteNome: string; api?: DeclaracaoApi; lerPdf?: LerLinhasDoPdf; hoje?: string }) {
  const { clienteId, clienteNome } = props;
  const hoje = props.hoje ?? hojeLocal();
  const d = useDeclaracaoOrgao({ clienteId, hoje, api: props.api, lerPdf: props.lerPdf ?? lerPdfDoApp });
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [frase, setFrase] = useState<string | null>(null);
  const atual = d.porFazenda.find((f) => f.fazenda.id === escolhida) ?? d.porFazenda[0] ?? null;

  if (!clienteId) return <Vazio texto="Escolha o cliente." />;
  if (d.erro) return <Vazio texto={d.erro} />;
  if (d.carregando) return <Vazio texto="Carregando…" />;
  if (!d.uf) return <Vazio texto="Nenhuma fazenda com gado tem a UF no cadastro: cadastre a UF para ver a etapa do órgão." />;
  if (!d.etapa) return <Vazio texto={`Sem etapa de declaração cadastrada para ${d.uf}.`} />;

  const etapa = d.etapa;
  const prazo = prazoDaEtapa(etapa);
  const faltam = diasAte(hoje, prazo);
  const mesDaEtapa = `${MESES[Number(etapa.inicio.slice(5, 7)) - 1]}/${etapa.inicio.slice(0, 4)}`;
  const agir = (p: Promise<string | null>) => { setFrase(null); void p.then(setFrase); };

  return (
    <div className="flex min-h-0 flex-col gap-2 p-3 text-[11px]" data-testid="declaracao-orgao">
      <div className="flex h-[40px] shrink-0 items-center gap-3 rounded-md bg-primary px-3 text-primary-foreground">
        <span className="shrink-0 text-[14px] font-semibold">Declaração do rebanho</span>
        <span className="min-w-0 flex-1 truncate" title={`${clienteNome} · ${etapa.orgao} (${etapa.uf}) · etapa de ${mesDaEtapa}`}>
          {clienteNome} · {etapa.orgao} ({etapa.uf}) · etapa de {mesDaEtapa}
        </span>
        <span className="shrink-0 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-950" data-testid="prazo">
          prazo {dataBR(prazo).slice(0, 5)} · {faltam >= 0 ? `faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'}` : `venceu há ${-faltam} ${faltam === -1 ? 'dia' : 'dias'}`}
        </span>
      </div>

      <div className="flex h-[28px] shrink-0 items-center gap-2">
        {d.porFazenda.length > 0 && atual && (
          <Segmentado valor={atual.fazenda.id} onEscolher={(v) => { setEscolhida(v); setFrase(null); }}
            opcoes={d.porFazenda.map((f) => ({ valor: f.fazenda.id, rotulo: f.fazenda.nome }))} />
        )}
        {atual && <ChipDivergencias f={atual} />}
        <span className="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground" data-testid="fonte"
          title={d.foraDaUf.length ? `fora desta etapa: ${d.foraDaUf.map((f) => `${f.nome} (${f.uf ?? 'sem UF — cadastre'})`).join(', ')}` : undefined}>
          {d.desde.data
            ? `fonte: movimentos lançados no sistema desde a última declaração (${dataBR(d.desde.data)}${d.desde.fonte === 'extrato' ? ', pelo extrato' : ''})`
            : 'solte o extrato do órgão para saber desde quando contar'}
          {d.foraDaUf.length > 0 && ` · ${d.foraDaUf.length} fazenda(s) fora (UF)`}
        </span>
      </div>

      {!atual ? <Vazio texto={`Nenhuma fazenda com gado em ${d.uf}.`} /> : (
        <>
          <Passos f={atual} />
          <AreaDeArquivo regra={REGRA_DO_PDF} className="h-7 shrink-0" testId="soltar-pdf-orgao" inputTestId="input-pdf-orgao"
            convite={`Solte aqui o Comprovante de Saldo ou o Extrato e-Saniagro de ${atual.fazenda.nome}`} detalhe="PDF do órgão · lido no navegador"
            desabilitado={!!d.ocupado || atual.declaracao?.status === 'declarada'}
            motivoDesabilitado={atual.declaracao?.status === 'declarada' ? 'Declarada: desfaça (com motivo) para trocar o PDF.' : 'Gravando…'}
            onArquivos={(arqs) => { if (arqs[0]) agir(d.soltarPdf(atual.fazenda.id, arqs[0])); }} />
          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_330px] gap-3">
            <TabelaDaEvolucao f={atual} ocupado={!!d.ocupado} declarada={atual.declaracao?.status === 'declarada'}
              aoEditar={(c, v) => agir(d.editar(atual.fazenda.id, c, v))} />
            <div className="flex min-w-0 flex-col gap-3">
              <OQueDeclarar f={atual} ocupado={!!d.ocupado} etapaFim={etapa.fim}
                aoBaixar={() => {
                  if (!atual.proposta) return;
                  void baixarPlanilhaDaDeclaracao(`${etapa.fim.slice(0, 7)}_Inventario_${atual.fazenda.nome.replace(/[^\p{L}\p{N}]+/gu, '_')}.xlsx`,
                    atual.fazenda.nome, dataBR(hoje), atual.proposta);
                }}
                aoDeclarar={() => agir(d.declarar(atual.fazenda.id))}
                aoDesfazer={(m) => agir(d.desfazer(atual.fazenda.id, m))} />
              <Divergencias f={atual} ocupado={!!d.ocupado} aoGravarEgtas={(simular) => agir(d.gravarEgtas(atual.fazenda.id, simular))} />
              <CardBrucelose f={atual} />
            </div>
          </div>
        </>
      )}
      <div className="h-[18px] shrink-0 truncate text-[10px] text-muted-foreground" data-testid="frase-da-declaracao" title={frase ?? undefined}>{frase ?? ''}</div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="m-6 rounded-md border border-dashed p-6 text-center text-[11px] text-muted-foreground" data-testid="declaracao-vazia">{texto}</div>;
}

/** A conta só vale com o comprovante do órgão lido: sem ele o IAGRO é "—" e não há divergência a dizer (nem "nenhuma"). */
const comSaldo = (f: DaFazenda) => !!f.comprovante && !!f.proposta;
const recusas = (f: DaFazenda) => f.proposta?.recusas ?? [];
const difsDoSistema = (f: DaFazenda) => (f.proposta ? (['F', 'M'] as const).flatMap((s) => f.proposta?.sistema[s].filter((g) => g.dif !== null && g.dif !== 0) ?? []) : []);

function ChipDivergencias({ f }: { f: DaFazenda }) {
  const n = difsDoSistema(f).length + recusas(f).length;
  return (
    <span className={cn('inline-flex h-[20px] w-[150px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
      !comSaldo(f) ? 'bg-muted text-muted-foreground' : n ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800')} data-testid="chip-divergencias">
      {comSaldo(f) ? (n ? `${n} ${n === 1 ? 'divergência' : 'divergências'} a explicar` : 'nenhuma divergência') : 'sem comprovante lido'}
    </span>
  );
}

function Passo({ n, feito, titulo, detalhe, testid }: { n: number; feito: boolean; titulo: string; detalhe: string; testid: string }) {
  return (
    <div className="flex h-[48px] min-w-0 flex-1 items-center gap-2 rounded-md border bg-card px-3" data-testid={testid}>
      <span className={cn('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white',
        feito ? 'bg-emerald-600' : 'bg-slate-400')}>{feito ? '✓' : n}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] font-semibold" title={titulo}>{titulo}</span>
        <span className="truncate text-[9.5px] text-muted-foreground" title={detalhe}>{detalhe}</span>
      </span>
    </div>
  );
}

function Passos({ f }: { f: DaFazenda }) {
  const c = f.casamento;
  const nEgtas = c ? c.casados.reduce((a, x) => a + x.documentos.length, 0) + c.egtaSemMovimento.length : 0;
  const casadas = c ? c.casados.reduce((a, x) => a + x.documentos.length, 0) : 0;
  const declarada = f.declaracao?.status === 'declarada';
  return (
    <div className="flex shrink-0 gap-2">
      <Passo n={1} testid="passo-saldo" feito={!!f.comprovante} titulo="Saldo do órgão"
        detalhe={f.comprovante ? `Comprovante ${dataBR(f.comprovante.saldoEm.slice(0, 10)).slice(0, 5)} ${f.comprovante.saldoEm.slice(11, 16)} · lido` : 'solte o Comprovante de Saldo (PDF)'} />
      <Passo n={2} testid="passo-gtas" feito={!!c && c.egtaSemMovimento.length === 0} titulo="GTAs conferidas"
        detalhe={c ? `extrato e-Saniagro · ${casadas} de ${nEgtas} casadas` : 'solte o Extrato e-Saniagro (PDF)'} />
      <Passo n={3} testid="passo-conferir" feito={declarada || (comSaldo(f) && recusas(f).length === 0 && difsDoSistema(f).length === 0)}
        titulo="Conferir a proposta" detalhe="órgão × sistema" />
      <Passo n={4} testid="passo-declarar" feito={declarada} titulo="Declarar no e-Saniagro"
        detalhe={declarada ? `marcado como declarado em ${dataBR(f.declaracao?.declaradaEm?.slice(0, 10))}` : 'marcar como declarado'} />
    </div>
  );
}

/* ═══ a tabela ═══ */
function CelulaEditada({ valor, sugerido, editavel, aoMudar, testid }: {
  valor: number | null; sugerido: number | null; editavel: boolean; aoMudar: (v: number | null) => void; testid: string;
}) {
  const editado = valor !== sugerido;
  if (!editavel) return <span className="tabular-nums">{n0(valor)}</span>;
  return (
    <span className="inline-flex items-center justify-end gap-0.5" data-testid={testid}>
      <CampoNumeroComConta valor={valor} casas={0} soAoSair onChange={(v) => aoMudar(v === null ? null : Math.max(0, Math.round(v)))}
        placeholder="—" title={editado ? `editado · sugerido ${n0(sugerido)}` : 'sugerido pelo sistema · editável'}
        className={cn('h-[20px] w-[58px] text-right text-[10.5px]', editado && 'bg-amber-100')} />
      <button type="button" className={cn('w-[12px] text-[11px] text-muted-foreground hover:text-foreground', !editado && 'invisible')}
        title={`voltar ao sugerido (${n0(sugerido)})`} onClick={() => aoMudar(null)} data-testid={`${testid}-voltar`}>↺</button>
    </span>
  );
}

function TabelaDaEvolucao({ f, ocupado, declarada, aoEditar }: {
  f: DaFazenda; ocupado: boolean; declarada: boolean; aoEditar: (c: CelulaEditavel, v: number | null) => void;
}) {
  const p = f.proposta;
  const editavel = !!p && !ocupado && !declarada && !!f.comprovante;
  const total = (sel: (l: LinhaDaProposta) => number | null) => {
    if (!p) return null;
    const xs = (['F', 'M'] as const).flatMap((s) => p.linhas[s].map(sel));
    return xs.some((x) => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0);
  };
  const totalSistema = p ? (['F', 'M'] as const).reduce((a, s) => a + p.sistema[s].reduce((b, g) => b + g.cab, 0), 0) : null;
  const totalProposto = total((l) => l.proposto);
  return (
    <div className="flex min-w-0 flex-col rounded-md border bg-card p-3" data-testid="tabela-evolucao">
      <div className="mb-2 flex h-[18px] items-center">
        <span className="text-[12px] font-semibold">Evolução por sexo e faixa · bovinos</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-fixed border-collapse" style={{ width: COLS.reduce((a, c) => a + c, 0) }}>
          <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead><tr>
            <th className={cn(TH, 'text-left')}>Sexo</th><th className={cn(TH, 'text-left')}>Faixa</th>
            <th className={cn(TH, 'text-right')} title="o comprovante do órgão">IAGRO</th>
            <th className={cn(TH, 'text-right')} title="sistema · editável">Nascimentos</th>
            <th className={cn(TH, 'text-right')} title="sistema · editável">Mortes/consumo</th>
            <th className={cn(TH, 'text-right')} title="sobe 1 faixa · editável">Passa p/ próxima</th>
            <th className={cn(TH, 'text-right')} title="da faixa anterior">Entra</th>
            <th className={cn(TH, 'text-right')}>Proposto</th>
            <th className={cn(TH, 'text-right')} title="último fechamento + movimentos lançados depois">Sistema hoje</th>
            <th className={cn(TH, 'text-right')}>Dif.</th>
          </tr></thead>
          <tbody>
            {(['F', 'M'] as const).map((s) => (
              <Fragment key={s}>
                <tr className="h-[22px] bg-muted"><td colSpan={10} className={cn(TD_REGUA, 'font-semibold')}>{GRUPO[s]}</td></tr>
                {FAIXAS.map((k) => {
                  const l = p?.linhas[s][k] ?? null;
                  const g = p?.sistema[s].find((x) => k >= x.de && k <= x.ate) ?? null;
                  const primeira = !!g && g.de === k;
                  const alt = g ? g.ate - g.de + 1 : 1;
                  return (
                    <tr key={k} className={LINHA} data-testid={`linha-${s}-${k}`}>
                      <td className={TD_REGUA}>{NOME[s]}</td>
                      <td className={TD_REGUA}>{ROTULO_DA_FAIXA[k]}</td>
                      <td className={TD_REGUA_NUM}>{n0(l?.iagro)}</td>
                      <td className={TD_REGUA_NUM}>{k === 0 && l ? (
                        <CelulaEditada valor={l.nascimentos} sugerido={l.sugerido.nascimentos} editavel={editavel} testid={`nasc-${s}`}
                          aoMudar={(v) => aoEditar({ sexo: s, campo: 'nascimentos' }, v)} />) : '—'}</td>
                      <td className={TD_REGUA_NUM}>{l ? (
                        <CelulaEditada valor={l.mortesConsumo} sugerido={l.sugerido.mortesConsumo} editavel={editavel} testid={`mc-${s}-${k}`}
                          aoMudar={(v) => aoEditar({ sexo: s, campo: 'mortesConsumo', faixa: k }, v)} />) : '—'}</td>
                      <td className={TD_REGUA_NUM}>{(() => {
                        const kp = daQuePassa(k);
                        return kp !== null && l ? (
                          <CelulaEditada valor={l.passa} sugerido={l.sugerido.passa} editavel={editavel} testid={`passa-${s}-${k}`}
                            aoMudar={(v) => aoEditar({ sexo: s, campo: 'passa', faixa: kp }, v)} />) : '—';
                      })()}</td>
                      <td className={cn(TD_REGUA_NUM, 'text-emerald-700')}>{k === 0 || !l ? '—' : `+${n0(l.entra)}`}</td>
                      <td className={cn(TD_REGUA_NUM, 'bg-blue-50 font-semibold')}>{n0(l?.proposto)}</td>
                      {(!g || primeira) && (
                        <td rowSpan={g ? alt : 1} className={cn(TD_REGUA_NUM, alt > 1 && 'border-l bg-slate-50')}
                          title={alt > 1 ? `o sistema não separa ${ROTULO_DA_FAIXA[g?.de ?? 1]} a ${ROTULO_DA_FAIXA[g?.ate ?? 3]}: a Dif. é do bloco` : undefined}
                          data-testid={`sistema-${s}-${k}`}>
                          {g ? n0(g.cab) : '—'}{alt > 1 && <span className="block text-[9.5px] font-normal text-muted-foreground">bloco</span>}
                        </td>
                      )}
                      {(!g || primeira) && (
                        <td rowSpan={g ? alt : 1} className={cn(TD_REGUA_NUM, 'font-semibold', g?.dif ? 'text-red-600' : 'text-emerald-700')}
                          data-testid={`dif-${s}-${k}`}>
                          {!g || g.dif === null ? '—' : g.dif === 0 ? 'ok' : comSinal(g.dif)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            <tr className="h-[24px] bg-primary font-semibold text-primary-foreground" data-testid="linha-total">
              <td className={TD_REGUA} colSpan={2}>Total bovinos</td>
              <td className={TD_REGUA_NUM}>{n0(total((l) => l.iagro))}</td>
              <td className={TD_REGUA_NUM}>{n0(total((l) => (l.faixa === 0 ? l.nascimentos : 0)))}</td>
              <td className={TD_REGUA_NUM}>{n0(total((l) => l.mortesConsumo))}</td>
              <td className={TD_REGUA_NUM}>{n0(total((l) => (l.faixa < 3 ? l.passa : 0)))}</td>
              <td className={TD_REGUA_NUM}>{n0(total((l) => l.entra))}</td>
              <td className={TD_REGUA_NUM}>{n0(totalProposto)}</td>
              <td className={TD_REGUA_NUM}>{n0(totalSistema)}</td>
              <td className={TD_REGUA_NUM}>{totalSistema === null || totalProposto === null ? '—' : comSinal(totalSistema - totalProposto)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 min-h-[16px] text-[10px]" data-testid="recusas">
        {recusas(f).length
          ? recusas(f).map((r) => <div key={r} className="text-red-600">{r}</div>)
          : p ? <span className="text-emerald-700">✓ quem passa de faixa entra igual na faixa seguinte · nenhuma faixa fica negativa</span> : null}
      </div>
      {(f.proposta?.avisos.length ?? 0) > 0 && (
        <ul className="mt-1 list-disc pl-4 text-[10px] text-amber-800" data-testid="avisos">
          {f.proposta?.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      <p className="mt-2 text-[9.5px] leading-snug text-muted-foreground">
        <b>Proposto</b> = IAGRO + nascimentos − mortes/consumo + o que entra da faixa anterior − o que passa para a próxima. A troca de faixa sobe UMA
        faixa por vez e o número que sai é o mesmo que entra na seguinte. <b>Sistema hoje</b> = o rebanho do sistema (último fechamento + movimentos
        lançados depois); a categoria sem mês de nascimento (novilha, vaca, garrote, boi) não se divide por faixa: sai num bloco, com a Dif. do bloco.
        Vendas, abates e transferências com GTA já estão no órgão. A troca de faixa sem nascimento lançado fica em branco: preencha.
      </p>
    </div>
  );
}

/* ═══ o lado direito ═══ */
function Card({ titulo, selo, children, testid }: { titulo: string; selo?: ReactNode; children: ReactNode; testid: string }) {
  return (
    <div className="rounded-md border bg-card p-3" data-testid={testid}>
      <div className="mb-2 flex h-[20px] items-center gap-2"><span className="flex-1 text-[12px] font-semibold">{titulo}</span>{selo}</div>
      {children}
    </div>
  );
}
function Linha({ rotulo, valor, recuo }: { rotulo: string; valor: string; recuo?: boolean }) {
  return (
    <div className={cn('flex h-[22px] items-center border-b border-border/40', recuo && 'pl-3 text-muted-foreground')}>
      <span className="flex-1 truncate" title={rotulo}>{rotulo}</span><span className="shrink-0 font-semibold tabular-nums">{valor}</span>
    </div>
  );
}

function OQueDeclarar({ f, ocupado, etapaFim, aoBaixar, aoDeclarar, aoDesfazer }: {
  f: DaFazenda; ocupado: boolean; etapaFim: string; aoBaixar: () => void; aoDeclarar: () => void; aoDesfazer: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const p = f.proposta;
  const declarada = f.declaracao?.status === 'declarada';
  const nasc = (s: Sexo) => p?.linhas[s][0].nascimentos ?? null;
  const mc = p ? (['F', 'M'] as const).reduce((a, s) => a + p.linhas[s].reduce((b, l) => b + l.mortesConsumo, 0), 0) : null;
  const por = !comSaldo(f) ? 'leia o comprovante do órgão' : recusas(f).length ? 'há faixa negativa: corrija' : null;
  return (
    <Card titulo="O que declarar" testid="o-que-declarar">
      <Linha rotulo="Nascimentos" valor={n0(nasc('F') === null || nasc('M') === null ? null : (nasc('F') ?? 0) + (nasc('M') ?? 0))} />
      <Linha rotulo="fêmeas" valor={n0(nasc('F'))} recuo /><Linha rotulo="machos" valor={n0(nasc('M'))} recuo />
      <Linha rotulo="Mortes e consumo" valor={n0(mc)} />
      <div className="flex h-[22px] items-center border-b border-border/40">Troca de faixa (era)</div>
      {(['F', 'M'] as const).flatMap((s) => ([0, 1, 2] as const).map((k) => (
        <Linha key={`${s}${k}`} recuo rotulo={`${s} ${ROTULO_DA_FAIXA[k]} → ${ROTULO_DA_FAIXA[proxima(k)]}`} valor={n0(p?.linhas[s][k].passa)} />
      )))}
      <p className="my-2 text-[9.5px] text-muted-foreground">Valor editado fica amarelo, com ↺ para voltar ao sugerido; a edição fica na trilha.</p>
      <div className="flex h-[30px] items-center gap-2">
        <Button variant="outline" size="sm" disabled={!p} onClick={aoBaixar} data-testid="baixar-planilha">Baixar planilha</Button>
        {declarada ? (
          motivo === null
            ? <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setMotivo('')} data-testid="desfazer-declarado"
                title="volta a rascunho; pede o motivo (trilha)">Desfazer o declarado</Button>
            : (
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="motivo" className="h-[26px] min-w-0 flex-1 text-[10.5px]" data-testid="motivo-desfazer" />
                <Button size="sm" disabled={ocupado || !motivo.trim()} onClick={() => { aoDesfazer(motivo); setMotivo(null); }}>Desfazer</Button>
              </span>
            )
        ) : (
          <Button size="sm" disabled={ocupado || !!por} onClick={aoDeclarar} data-testid="marcar-declarado"
            title={por ?? `congela os números desta etapa (até ${dataBR(etapaFim)}); desfazer pede motivo`}>Marcar como declarado</Button>
        )}
      </div>
      <div className="h-[14px] truncate text-[9.5px] text-muted-foreground" data-testid="motivo-do-botao">{declarada ? 'declarado: os números estão congelados' : (por ?? '')}</div>
    </Card>
  );
}

const CLASSE: Record<'a' | 'b' | 'c' | 'd', string> = { a: 'morte/consumo não declarado', b: 'falta lançar no sistema', c: 'saída sem GTA', d: 'erro de sexo/faixa declarado' };

function Divergencias({ f, ocupado, aoGravarEgtas }: { f: DaFazenda; ocupado: boolean; aoGravarEgtas: (simular: boolean) => void }) {
  const difs = (['F', 'M'] as const).flatMap((s) => (f.proposta?.sistema[s] ?? []).filter((g) => g.dif !== null && g.dif !== 0)
    .map((g) => ({ s, g })));
  const c = f.casamento;
  return (
    <Card titulo="Divergência a explicar" testid="divergencias"
      selo={difs.length ? <span className="rounded-full bg-red-100 px-2 text-[10px] font-semibold text-red-700">antes de declarar</span> : undefined}>
      {!comSaldo(f) ? <p className="text-[10px] text-muted-foreground">—</p> : difs.length === 0
        ? <p className="text-[10px] text-emerald-700">Órgão e sistema batem em todas as faixas.</p>
        : difs.map(({ s, g }) => (
          <p key={`${s}${g.de}`} className="text-[10.5px]">
            <b>{GRUPO[s]} {g.de === g.ate ? ROTULO_DA_FAIXA[g.de] : `${ROTULO_DA_FAIXA[g.de]} a ${ROTULO_DA_FAIXA[g.ate]}`}:</b> o órgão ficaria com <b>{n0(g.proposto)}</b>,
            o sistema tem <b>{n0(g.cab)}</b> ({comSinal((g.proposto ?? 0) - g.cab)} no órgão).
          </p>
        ))}
      {f.explicacoes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1" data-testid="explicacoes">
          {f.explicacoes.map((x, i) => (
            <li key={i} className="text-[10px]"><span className="mr-1 rounded bg-muted px-1 text-[9.5px] font-semibold">({x.classe}) {CLASSE[x.classe]}</span>{x.texto}</li>
          ))}
        </ul>
      )}
      {c && (
        <div className="mt-2 flex h-[26px] items-center gap-2 border-t pt-2 text-[10px]">
          <span className="flex-1 truncate" title="grava o nº de cada eGTA casada na movimentação do sistema (só o vazio; a prévia diz antes)">
            {c.casados.length} movimentação(ões) casada(s) com eGTA
          </span>
          <Button size="sm" variant="outline" className="h-[22px] text-[10px]" disabled={ocupado || !c.casados.length}
            onClick={() => aoGravarEgtas(true)} data-testid="previa-egtas">Prévia</Button>
          <Button size="sm" className="h-[22px] text-[10px]" disabled={ocupado || !c.casados.length}
            onClick={() => aoGravarEgtas(false)} data-testid="gravar-egtas">Gravar os nºs</Button>
        </div>
      )}
    </Card>
  );
}

function CardBrucelose({ f }: { f: DaFazenda }) {
  const b = f.brucelose;
  return (
    <Card titulo="Brucelose" testid="brucelose"
      selo={b && b.aVacinar !== null ? <span className="rounded-full bg-amber-100 px-2 text-[10px] font-semibold text-amber-900">{b.aVacinar} a vacinar</span> : undefined}>
      <Linha rotulo="Última vacinação (órgão)" valor={dataBR(b?.ultimaVacina)} />
      <Linha rotulo="Fêmeas que terão 3–8 meses" valor={n0(b?.candidatas)} />
      <Linha rotulo="Já vacinadas (extrato)" valor={n0(b?.vacinadas)} />
      <Linha rotulo="Vacinar até" valor={dataBR(b?.vacinarAte)} />
      <p className="mt-2 text-[9.5px] text-muted-foreground">Pelas fêmeas nascidas lançadas no sistema; sem o extrato, "já vacinadas" fica "—".</p>
    </Card>
  );
}
