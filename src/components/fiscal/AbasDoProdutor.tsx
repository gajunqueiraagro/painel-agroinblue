/**
 * FISCAL onda 1 (a) — as abas da ficha do produtor (gabarito: cadastro-produtor-mock.html): Identificação · Fiscal e Reforma · Contas
 * bancárias · Certificado digital · Grupo. "Fazendas e participação" mora em `FazendasDoProdutor.tsx`.
 *
 * ⚠ IDENTIFICAÇÃO E O REGIME DO IR são o FORMULÁRIO da ficha (o Salvar do rodapé da tela). A condição no IBS/CBS, a conta e o grupo são
 * gestos próprios, cada um com a prévia do banco (`useGestoComPrevia`): as versões (condição, grupo) começam num MÊS.
 * ⚠ SEM NÚMERO INVENTADO: "Receita para o limite" e "LCDPR" ficam "—" até o Resumo fiscal (onda 2, lê o livro por produtor); o
 * certificado é da frente FISCAL-DFE-01 (só o lugar, apagado).
 */
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { BlocoFormulario, Rotulo, REGUA_CAMPO, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM } from '@/components/ui/regua-tabela';
import { CampoDoMes } from '@/components/mapa-geo/CampoDoMes';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import {
  anosDasVersoes, CONDICOES_IBS, inicioDoMes, mesBR, pct, ROTULO_CONDICAO_IBS, ROTULO_REGIME, soDocumento, tipoDoDocumento, UFS,
  type CondicaoIbs, type FormTitular, type RegimeIr, type Titular,
} from '@/lib/fiscal/produtores';
import type { ContaDoCliente } from '@/lib/fiscal/produtoresApi';
import { useHistoricoDaCondicao, useProdutoresApi } from '@/hooks/useProdutores';
import type { Pedido } from './PreviaDoBanco';

export const TH_FICHA = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');
export const TH_FICHA_NUM = cn(TH_FICHA, 'text-right');
export const QUADRO_FICHA = 'min-h-0 overflow-x-hidden overflow-y-auto rounded border bg-card';

/** O ⓘ do mock: o texto longo mora no `title`, nunca na tela. */
export function Info({ texto }: { texto: string }) {
  return (
    <span className="ml-1 inline-flex h-[12px] w-[12px] shrink-0 cursor-help items-center justify-center rounded-full border border-muted-foreground/60 text-[8px] font-bold leading-none text-muted-foreground"
      title={texto} aria-label={texto}>i</span>
  );
}

type SetForm = <K extends keyof FormTitular>(k: K, v: FormTitular[K]) => void;
type Previa = (titulo: string, pedido: Pedido, depois?: (r: unknown) => void) => Promise<string | null>;

/* ── Identificação ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function AbaIdentificacao({ form, set, erros, fazendas }: {
  form: FormTitular; set: SetForm; erros: Partial<Record<'nome' | 'documento' | 'ies', string>>;
  fazendas: ReadonlyArray<{ id: string; nome: string }>;
}) {
  const tipo = tipoDoDocumento(form.documento);
  const pf = tipo !== 'PJ';
  const mudarIe = (i: number, campo: 'uf' | 'ie' | 'fazenda_id', v: string) =>
    set('ies', form.ies.map((x, j) => (j === i ? { ...x, [campo]: campo === 'fazenda_id' ? (v || null) : v } : x)));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="produtor-aba-identificacao">
      <BlocoFormulario titulo="Quem é">
        <div className={cn(GRADE_FORMULARIO, 'grid-cols-[150px_150px_minmax(0,1fr)]')}>
          <div>
            <Rotulo texto="Papel" />
            <Segmentado altura={28} fonte={10} valor={form.papel} onEscolher={v => set('papel', v)} opcoes={[
              { valor: 'produtor', rotulo: 'Produtor', title: 'contribuinte do cliente: entra no livro caixa e na Reforma' },
              { valor: 'terceiro', rotulo: 'Terceiro', title: 'parceiro de rateio (ex.: quem tem a nota no nome e divide a despesa); não é cliente' },
            ]} />
          </div>
          <div>
            <div className="flex items-center"><Rotulo texto={tipo === 'PJ' ? 'CNPJ' : tipo === 'PF' ? 'CPF' : 'CPF ou CNPJ'} obrig className="mb-0.5" />
              <Info texto="Obrigatório. O CNPJ pode ser alfanumérico (12 posições 0-9/A-Z + 2 dígitos). O dígito é conferido ao salvar." /></div>
            <Input value={form.documento} onChange={e => set('documento', e.target.value)}
              className={cn(REGUA_CAMPO, 'tabular-nums', erros.documento && 'border-destructive')} placeholder="000.000.000-00" data-testid="produtor-documento" />
          </div>
          <div>
            <Rotulo texto={tipo === 'PJ' ? 'Razão social' : 'Nome completo'} obrig />
            <Input value={form.nome} onChange={e => set('nome', e.target.value)} className={cn(REGUA_CAMPO, erros.nome && 'border-destructive')} data-testid="produtor-nome" />
          </div>
        </div>
        {/* PF: CNPJ do produtor e nascimento; PJ: o lugar fica reservado (a altura do bloco não muda) */}
        <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-[150px_150px_minmax(0,1fr)]')}>
          <div className={cn(!pf && 'invisible')} aria-hidden={!pf || undefined}>
            <div className="flex items-center"><Rotulo texto="CNPJ do produtor PF" className="mb-0.5" /><Info texto="Novo em 2027: o produtor PF terá CNPJ (inclusive alfanumérico). Deixe vazio até ter." /></div>
            <Input value={form.cnpj_produtor} onChange={e => set('cnpj_produtor', e.target.value)} placeholder="a partir de 2027" className={cn(REGUA_CAMPO, 'tabular-nums')} data-testid="produtor-cnpj-pf" />
          </div>
          <div className={cn(!pf && 'invisible')} aria-hidden={!pf || undefined}>
            <Rotulo texto="Nascimento" />
            <DatePicker value={form.nascimento} onChange={v => set('nascimento', v ?? '')} className={REGUA_CAMPO} />
          </div>
          <div />
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Inscrições estaduais" dica="uma por estado onde produz; é a IE das notas de venda e da GTA"
        acao={<button type="button" className="text-[10px] font-medium text-primary hover:underline" onClick={() => set('ies', [...form.ies, { uf: '', ie: '', fazenda_id: null }])}
          data-testid="produtor-ie-mais">+ estado</button>}>
        <div className="flex flex-col gap-1">
          {form.ies.length === 0 && <p className="h-7 text-[10px] leading-7 text-muted-foreground">nenhuma IE: o produtor fica com o aviso "cadastro incompleto"</p>}
          {form.ies.map((ie, i) => (
            <div key={i} className={cn(GRADE_FORMULARIO, 'grid-cols-[70px_150px_minmax(0,1fr)_20px] items-center')} data-testid="produtor-ie">
              <SearchableSelect value={ie.uf} onValueChange={v => mudarIe(i, 'uf', v)} semTodos allLabel="UF" allValue="" options={UFS.map(u => ({ value: u, label: u }))}
                triggerClassName={cn(REGUA_CAMPO, erros.ies && !ie.uf && 'border-destructive')} />
              <Input value={ie.ie} onChange={e => mudarIe(i, 'ie', e.target.value)} placeholder="IE" className={cn(REGUA_CAMPO, 'tabular-nums')} />
              <SearchableSelect value={ie.fazenda_id ?? ''} onValueChange={v => mudarIe(i, 'fazenda_id', v)} allLabel="sem fazenda" allValue=""
                options={fazendas.map(f => ({ value: f.id, label: f.nome }))} triggerClassName={REGUA_CAMPO} />
              <button type="button" className="text-muted-foreground hover:text-destructive" title="tirar esta IE (fica inativa, nada se apaga)"
                onClick={() => set('ies', form.ies.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Contato fiscal">
        <div className={cn(GRADE_FORMULARIO, 'grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]')}>
          <div><Rotulo texto="E-mail fiscal / contador" /><Input value={form.email_fiscal} onChange={e => set('email_fiscal', e.target.value)} className={REGUA_CAMPO} /></div>
          <div><Rotulo texto="Endereço fiscal" /><Input value={form.endereco} onChange={e => set('endereco', e.target.value)} className={REGUA_CAMPO} /></div>
        </div>
        <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-[minmax(0,1fr)_70px_100px]')}>
          <div><Rotulo texto="Município" /><Input value={form.municipio} onChange={e => set('municipio', e.target.value)} className={REGUA_CAMPO} /></div>
          <div>
            <Rotulo texto="UF" />
            <SearchableSelect value={form.uf} onValueChange={v => set('uf', v)} allLabel="—" allValue="" options={UFS.map(u => ({ value: u, label: u }))} triggerClassName={REGUA_CAMPO} />
          </div>
          <div><Rotulo texto="CEP" /><Input value={form.cep} onChange={e => set('cep', e.target.value)} className={cn(REGUA_CAMPO, 'tabular-nums')} placeholder="00000-000" /></div>
        </div>
      </BlocoFormulario>
      <p className="text-[10px] text-muted-foreground">CPF/CNPJ e nome são obrigatórios. O resto falta como aviso ("cadastro incompleto"): nada é bloqueado.</p>
    </div>
  );
}

const rotuloDaCondicao = (v: string): string => { const c = CONDICOES_IBS.find(x => x === v); return c ? ROTULO_CONDICAO_IBS[c] : v; };

/* ── Fiscal e Reforma ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function AbaFiscal({ titular, clienteId, form, set, previa }: {
  titular: Titular; clienteId: string; form: FormTitular; set: SetForm; previa: Previa;
}) {
  const api = useProdutoresApi();
  const hoje = hojeLocal();
  const { data: historico = [], isLoading } = useHistoricoDaCondicao(clienteId, titular.id);
  const [condicao, setCondicao] = useState<CondicaoIbs>(titular.condicao_ibs?.condicao ?? 'nao_contribuinte');
  const [mes, setMes] = useState<string | null>(hoje.slice(0, 7));
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const pf = soDocumento(titular.documento).length === 11;
  const regimes: RegimeIr[] = pf ? ['pf_atividade_rural'] : ['pj_presumido', 'pj_real', 'pj_simples'];
  const ehProdutor = titular.papel === 'produtor';

  const gravarCondicao = async () => {
    if (!mes) { setErro('Informe desde quando vale a condição.'); return; }
    if (motivo.trim().length < 3) { setErro('Diga o motivo (pelo menos 3 letras).'); return; }
    setErro(await previa(`${titular.nome} · condição no IBS/CBS`,
      s => api.gravarCondicao(titular.id, inicioDoMes(mes), condicao, motivo.trim(), s)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="produtor-aba-fiscal">
      <BlocoFormulario titulo="Condição e limites">
        <div className={cn(GRADE_FORMULARIO, 'grid-cols-[minmax(0,1fr)_150px]')}>
          <div>
            <div className="flex items-center"><Rotulo texto="Condição no IBS/CBS" obrig className="mb-0.5" />
              <Info texto="Não contribuinte: receita abaixo de R$ 3,6 mi no ano (somando as PJs agropecuárias em que tem participação). Pode optar por ser contribuinte: vale no mês seguinte e não volta no ano." /></div>
            <Segmentado altura={28} fonte={10} valor={condicao} onEscolher={v => { setCondicao(v); setErro(null); }}
              opcoes={CONDICOES_IBS.map(c => ({ valor: c, rotulo: ROTULO_CONDICAO_IBS[c], desabilitada: !ehProdutor, title: ehProdutor ? undefined : 'a condição no IBS/CBS é só do produtor' }))} />
          </div>
          <div>
            <Rotulo texto="Desde (mês)" />
            <CampoDoMes valor={mes} onMudar={v => { setMes(v); setErro(null); }} anos={anosDasVersoes(hoje)} anoDeReferencia={Number(hoje.slice(0, 4))} testid="produtor-condicao-mes" />
          </div>
        </div>
        <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-[minmax(0,1fr)_150px] items-end')}>
          <div>
            <Rotulo texto="Motivo da condição" />
            <Input value={motivo} onChange={e => { setMotivo(e.target.value); setErro(null); }} disabled={!ehProdutor} placeholder="ex.: receita do ano anterior abaixo do limite"
              className={cn(REGUA_CAMPO, erro && 'border-destructive')} data-testid="produtor-condicao-motivo" />
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!ehProdutor} onClick={() => void gravarCondicao()} data-testid="produtor-condicao-gravar"
            title={ehProdutor ? 'mostra a prévia antes de gravar' : 'a condição no IBS/CBS é só do produtor'}>Gravar condição…</Button>
        </div>
        <p className="mt-0.5 h-[13px] truncate text-[10px] text-destructive" title={erro ?? undefined}>{erro ?? ''}</p>
        <div className={cn(GRADE_FORMULARIO, 'mt-0.5 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]')}>
          <div>
            <Rotulo texto="Regime do IR" />
            <Segmentado altura={28} fonte={10} valor={form.regime_ir || '__nenhum'} onEscolher={v => set('regime_ir', v === '__nenhum' ? '' : v)} opcoes={[
              ...regimes.map(r => ({ valor: r, rotulo: ROTULO_REGIME[r] })),
            ]} />
          </div>
          <div>
            <div className="flex items-center"><Rotulo texto="Receita para o limite de R$ 3,6 mi" className="mb-0.5" /><Info texto="Chega com o Resumo fiscal, que lê o livro caixa por produtor (próxima onda). Até lá, sem número." /></div>
            <div className={cn(REGUA_CAMPO, 'flex items-center rounded-md border bg-muted/60 px-2 text-muted-foreground')} data-testid="produtor-receita-limite">—</div>
          </div>
          <div>
            <div className="flex items-center"><Rotulo texto="LCDPR (limite R$ 4,8 mi, caixa)" className="mb-0.5" /><Info texto="Acima de R$ 4,8 mi de receita bruta no ano, o LCDPR é obrigatório. O número chega com o Resumo fiscal." /></div>
            <div className={cn(REGUA_CAMPO, 'flex items-center rounded-md border bg-muted/60 px-2 text-muted-foreground')}>—</div>
          </div>
        </div>
      </BlocoFormulario>
      <div className={cn(QUADRO_FICHA, 'flex-1')}>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 70 }} /><col style={{ width: 70 }} /><col /></colgroup>
          <thead className="text-primary-foreground"><tr><th className={TH_FICHA}>Histórico da condição</th><th className={TH_FICHA}>De</th><th className={TH_FICHA}>Até</th><th className={TH_FICHA}>Motivo</th></tr></thead>
          <tbody>
            {historico.map(h => (
              <tr key={h.id} className="border-b border-border/40">
                <td className={TD_REGUA_TEXTO}>{rotuloDaCondicao(h.condicao)}</td>
                <td className={cn(TD_REGUA_NUM, 'text-left')}>{mesBR(h.vigencia_inicio)}</td>
                <td className={cn(TD_REGUA_NUM, 'text-left')}>{mesBR(h.vigencia_fim)}</td>
                <td className={TD_REGUA_TEXTO} title={h.motivo}>{h.motivo}</td>
              </tr>
            ))}
            {historico.length === 0 && <tr><td colSpan={4} className={cn(TD_REGUA, 'py-3 text-center text-muted-foreground')}>{isLoading ? 'Carregando…' : 'sem condição gravada'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Contas bancárias ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function AbaContas({ titular, contas, previa }: { titular: Titular; contas: readonly ContaDoCliente[]; previa: Previa }) {
  const api = useProdutoresApi();
  const [erro, setErro] = useState<string | null>(null);
  const doc = soDocumento(titular.documento);
  const ligar = async (c: ContaDoCliente, titularId: string | null) =>
    setErro(await previa(`${c.nome} · titular da conta`, s => api.gravarContaTitular(c.id, titularId, s)));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1" data-testid="produtor-aba-contas">
      <div className={cn(QUADRO_FICHA, 'flex-1')}>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 190 }} /><col style={{ width: 130 }} /></colgroup>
          <thead className="text-primary-foreground"><tr>
            <th className={TH_FICHA}>Conta</th><th className={TH_FICHA}>Banco</th>
            <th className={TH_FICHA}><span className="inline-flex items-center">Titular<Info texto="De quem é a conta. Só a ligação ao produtor grava o titular (o cadastro da conta mostra, não edita)." /></span></th>
            <th className={TH_FICHA} />
          </tr></thead>
          <tbody>
            {contas.map(c => {
              const minha = c.titular_documento != null && soDocumento(c.titular_documento) === doc;
              return (
                <tr key={c.id} className="border-b border-border/40" data-testid="produtor-conta">
                  <td className={TD_REGUA_TEXTO} title={c.nome}>{c.nome}</td>
                  <td className={TD_REGUA_TEXTO} title={c.banco ?? undefined}>{c.banco ?? '—'}</td>
                  <td className={cn(TD_REGUA_TEXTO, minha && 'font-semibold')} title={c.titular_nome ?? 'sem titular'}>{c.titular_nome ?? '—'}</td>
                  <td className={cn(TD_REGUA, 'text-right')}>
                    {minha
                      ? <button type="button" className="text-[10px] text-muted-foreground hover:text-destructive hover:underline" onClick={() => void ligar(c, null)}>desligar</button>
                      : <button type="button" className="text-[10px] font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                          disabled={!titular.ativo} title={titular.ativo ? undefined : 'titular inativo'} onClick={() => void ligar(c, titular.id)}>
                          {c.titular_nome ? 'trocar para este' : 'ligar a este'}</button>}
                  </td>
                </tr>
              );
            })}
            {contas.length === 0 && <tr><td colSpan={4} className={cn(TD_REGUA, 'py-3 text-center text-muted-foreground')}>nenhuma conta ativa no cliente</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="h-[13px] shrink-0 truncate text-[10px] text-destructive" title={erro ?? undefined}>{erro ?? ''}</p>
    </div>
  );
}

/* ── Certificado digital (FISCAL-DFE-01: só o lugar) ──────────────────────────────────────────────────────────────────────── */
export function AbaCertificado() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="produtor-aba-certificado">
      <BlocoFormulario titulo="Certificado digital A1">
        <div className={cn(GRADE_FORMULARIO, 'grid-cols-3')}>
          <div><Rotulo texto="Certificado A1" /><div className={cn(REGUA_CAMPO, 'flex items-center rounded-md border bg-muted/60 px-2 text-muted-foreground')}>não cadastrado</div></div>
          <div><Rotulo texto="Validade" /><div className={cn(REGUA_CAMPO, 'flex items-center rounded-md border bg-muted/60 px-2 text-muted-foreground')}>—</div></div>
          <div><Rotulo texto="Última busca" /><div className={cn(REGUA_CAMPO, 'flex items-center rounded-md border bg-muted/60 px-2 text-muted-foreground')}>—</div></div>
        </div>
      </BlocoFormulario>
      <p className="text-[10px] text-muted-foreground">Frente FISCAL-DFE-01 (desenho de segurança em andamento). Até lá, as notas entram por XML/PDF e o sistema reconhece o produtor pelo CPF/CNPJ do destinatário.</p>
    </div>
  );
}

/* ── Grupo (as PJs do produtor) ────────────────────────────────────────────────────────────────────────────────────────────── */
export function AbaGrupo({ titular, titulares, previa }: { titular: Titular; titulares: readonly Titular[]; previa: Previa }) {
  const [editando, setEditando] = useState(false);
  const docDe = useMemo(() => new Map(titulares.map(t => [t.id, t.documento_formatado])), [titulares]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1" data-testid="produtor-aba-grupo">
      <div className={cn(QUADRO_FICHA, 'flex-1')}>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 84 }} /><col style={{ width: 130 }} /><col style={{ width: 96 }} /></colgroup>
          <thead className="text-primary-foreground"><tr>
            <th className={TH_FICHA}>Empresa ligada</th><th className={TH_FICHA}>CNPJ</th><th className={TH_FICHA_NUM}>Participação</th>
            <th className={TH_FICHA}>Atividade</th><th className={TH_FICHA}>Entra no limite?</th>
          </tr></thead>
          <tbody>
            {titular.grupo.map(g => (
              <tr key={g.empresa_id} className="border-b border-border/40" data-testid="produtor-grupo-linha">
                <td className={TD_REGUA_TEXTO} title={g.empresa}>{g.empresa}</td>
                <td className={cn(TD_REGUA, 'whitespace-nowrap tabular-nums')}>{docDe.get(g.empresa_id) ?? '—'}</td>
                <td className={TD_REGUA_NUM}>{pct(g.participacao)}</td>
                <td className={TD_REGUA_TEXTO} title={g.atividade ?? undefined}>{g.atividade ?? '—'}</td>
                <td className={TD_REGUA}>{g.entra_no_limite ? 'sim' : 'não'}</td>
              </tr>
            ))}
            {titular.grupo.length === 0 && <tr><td colSpan={5} className={cn(TD_REGUA, 'py-3 text-center text-muted-foreground')}>nenhuma empresa ligada</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex h-[22px] shrink-0 items-center gap-3 text-[10px]">
        <button type="button" className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={titular.papel !== 'produtor'}
          title={titular.papel === 'produtor' ? undefined : 'o grupo é só do produtor'} onClick={() => setEditando(true)} data-testid="produtor-grupo-editar">Editar o grupo…</button>
        <span className="text-muted-foreground">o limite de R$ 3,6 mi soma as receitas das PJs agropecuárias em que o produtor tem participação</span>
      </div>
      {editando && <GrupoDialog titular={titular} titulares={titulares} previa={previa} aoFechar={() => setEditando(false)} />}
    </div>
  );
}

interface LinhaDoGrupo { empresa_id: string; participacao: number | null; atividade: string; entra_no_limite: boolean }
function GrupoDialog({ titular, titulares, previa, aoFechar }: { titular: Titular; titulares: readonly Titular[]; previa: Previa; aoFechar: () => void }) {
  const api = useProdutoresApi();
  const hoje = hojeLocal();
  const [mes, setMes] = useState<string | null>(hoje.slice(0, 7));
  const [linhasG, setLinhas] = useState<LinhaDoGrupo[]>(() => titular.grupo.map(g => ({ empresa_id: g.empresa_id, participacao: g.participacao, atividade: g.atividade ?? '', entra_no_limite: g.entra_no_limite })));
  const [erro, setErro] = useState<string | null>(null);
  const empresas = titulares.filter(t => t.tipo === 'PJ' && t.papel === 'produtor' && t.ativo && t.id !== titular.id);
  const mudar = (i: number, p: Partial<LinhaDoGrupo>) => { setLinhas(l => l.map((x, j) => (j === i ? { ...x, ...p } : x))); setErro(null); };
  const verPrevia = async () => {
    if (!mes) { setErro('Informe o mês de início.'); return; }
    if (linhasG.some(l => !l.empresa_id || !(l.participacao && l.participacao > 0))) { setErro('Escolha a empresa e a participação de cada linha.'); return; }
    const e = await previa(`${titular.nome} · grupo`, s => api.gravarGrupo(titular.id, inicioDoMes(mes),
      linhasG.map(l => ({ empresa_id: l.empresa_id, participacao: l.participacao ?? 0, atividade: l.atividade.trim(), entra_no_limite: l.entra_no_limite })), s), () => aoFechar());
    if (e) setErro(e);
  };
  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[340px] w-[640px] max-w-[calc(100vw-16px)] flex-col gap-0 overflow-hidden p-0 [&>button]:top-2 [&>button]:text-primary-foreground" data-testid="produtor-grupo-dialog">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="truncate text-[11px] font-semibold">{titular.nome} · empresas do grupo</DialogTitle>
          <DialogDescription className="sr-only">A nova composição do grupo vale a partir do mês escolhido.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 bg-muted p-2">
          <div className="flex items-end gap-2">
            <div className="w-[150px]"><Rotulo texto="Vale a partir de (mês)" /><CampoDoMes valor={mes} onMudar={setMes} anos={anosDasVersoes(hoje)} anoDeReferencia={Number(hoje.slice(0, 4))} testid="produtor-grupo-mes" /></div>
            <p className="pb-1.5 text-[10px] text-muted-foreground">a versão de antes termina no mês anterior; o mesmo mês corrige a versão</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded border bg-card p-1">
            {linhasG.map((l, i) => (
              <div key={i} className={cn(GRADE_FORMULARIO, 'mb-1 grid-cols-[minmax(0,1fr)_84px_140px_80px_20px] items-center')}>
                <SearchableSelect value={l.empresa_id} onValueChange={v => mudar(i, { empresa_id: v })} semTodos allLabel="empresa" allValue=""
                  options={empresas.map(t => ({ value: t.id, label: t.nome }))} triggerClassName={REGUA_CAMPO} />
                <CampoNumeroComConta valor={l.participacao} onChange={v => mudar(i, { participacao: v })} percentual sufixoDentro="%" className={REGUA_CAMPO} />
                <Input value={l.atividade} onChange={e => mudar(i, { atividade: e.target.value })} placeholder="atividade" className={REGUA_CAMPO} />
                <Segmentado altura={28} fonte={10} valor={l.entra_no_limite ? 'sim' : 'nao'} onEscolher={v => mudar(i, { entra_no_limite: v === 'sim' })}
                  opcoes={[{ valor: 'sim', rotulo: 'sim', title: 'a receita entra no limite' }, { valor: 'nao', rotulo: 'não' }]} />
                <button type="button" className="text-muted-foreground hover:text-destructive" title="tirar esta empresa do grupo" onClick={() => setLinhas(x => x.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {linhasG.length === 0 && <p className="py-2 text-center text-[10px] text-muted-foreground">sem empresas: a partir do mês, o produtor fica sem grupo</p>}
            <button type="button" className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              disabled={empresas.length === 0} title={empresas.length ? undefined : 'cadastre a empresa (CNPJ, papel produtor) antes'}
              onClick={() => setLinhas(x => [...x, { empresa_id: '', participacao: null, atividade: '', entra_no_limite: true }])}><Plus className="h-3 w-3" /> empresa</button>
          </div>
          <p className="h-[13px] shrink-0 truncate text-[10px] text-destructive" title={erro ?? undefined}>{erro ?? ''}</p>
        </div>
        <div className="flex h-[40px] shrink-0 items-center justify-end gap-2 border-t bg-card px-3">
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[26px] text-[11px]" onClick={() => void verPrevia()} data-testid="produtor-grupo-previa">Ver prévia</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
