/**
 * BPO-GUIA-01 — o guia "Como funciona" da aprovação de pagamentos (Gabriel 18/11, mock aprovado 11:19: ui-validar/bpo-guia-01-ref).
 * Seis passos; abre na 1ª visita de cada usuário e pelo botão "Como funciona". O passo 6 ("Ligar neste cliente") é SÓ DO ADMIN e liga
 * pelas RPCs que já existem, com prévia: `fn_bpo_aprovador_gravar` e `fn_bpo_config_gravar` (`p_simular`). Nada novo no banco.
 * ⚠ OS TEXTOS SÃO AS REGRAS DA 118160 (D1–D10). Onde o mock dizia diferente do que o banco faz, mudou o TEXTO, não a regra:
 *   - "Mudou depois?": a foto tem também classificação e fazenda (o gatilho `trg_zz_aprovacao_foto_mudou`), não só valor/venc./fornecedor/conta;
 *   - "Fila nova para aprovar": o aviso automático AINDA NÃO existe (D8, PR seguinte) — escrito como "em breve";
 *   - "Valendo a partir de": o `desde` conta a prévia (as saídas em aberto com vencimento a partir dele); o bloqueio do Agendar vale
 *     desde o ligar, para toda saída — o texto diz isso.
 * ⚠ ZERO TEXTO QUEBRADO (regra do Gabriel): toda frase é UMA linha (`whitespace-nowrap`), escrita para caber em 390px; o gate mede.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { supabase } from '@/integrations/supabase/client';
import { buscarNomesDosAutores } from '@/hooks/useNomesDosAutores';
import { mapaDosNomes } from '@/lib/acessos/nomesDosAutores';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import {
  DIAS_DA_SEMANA, PASSOS_DO_GUIA, alternarDia, candidatosAAprovador, fraseDaPreviaDoLigar, textoDosDias,
  type CandidatoAAprovador,
} from '@/lib/financeiro/guiaDaAprovacao';

const NOWRAP = 'whitespace-nowrap';
const ALTURA_DO_CORPO = 352;
/* BPO-GUIA-01 (23/11): no celular o corpo também tem ALTURA FIXA (o passo mais alto, os 4 papéis empilhados, cabe): sem ela o rodapé
   (Voltar · Próximo) subia e descia a cada passo — nada se desloca. Passo mais alto que isso rola por dentro, nunca empurra o rodapé. */
const ALTURA_DO_CORPO_ESTREITO = 476;

/** um rótulo de situação (as mesmas cores do mock) */
function Pilula({ tom, children }: { tom: 'prev' | 'prog' | 'ag' | 'apr' | 'rec' | 'agd' | 'pg'; children: string }) {
  const cor = {
    prev: 'bg-[#EEF1F5] text-[#5A6A80]', prog: 'bg-[#E6EEFB] text-[#1F56B8]', ag: 'bg-[#FFF3DF] text-[#9A6512]',
    apr: 'bg-[#E3F2EA] text-[#1E7A4E]', rec: 'bg-[#FBECEC] text-[#A23B37]', agd: 'bg-[#EDE7FA] text-[#5B3FA8]', pg: 'bg-navy text-white',
  }[tom];
  return <span className={`${NOWRAP} rounded-full px-[7px] py-[2px] text-[10.5px] font-semibold ${cor}`}>{children}</span>;
}

function Nota({ children }: { children: string }) {
  return <div className={`${NOWRAP} mt-3.5 rounded-lg border border-[#CFDCF2] bg-[#EEF3FB] px-3 py-2.5 text-[12px] text-[#284a85]`} data-texto-guia>{children}</div>;
}

function Titulo({ titulo, apoio }: { titulo: string; apoio: string }) {
  return (
    <>
      <h3 className={`${NOWRAP} text-[17px] font-bold text-navy`} data-texto-guia>{titulo}</h3>
      <p className={`${NOWRAP} mb-4 mt-1 text-[13px] text-[#5A6A80]`} data-texto-guia>{apoio}</p>
    </>
  );
}

function Passo1({ estreito }: { estreito: boolean }) {
  /* BPO-GUIA-01 (Gabriel 23/11 08:41): o papel de quem AGENDA entra no guia. No banco (118160) ele não é uma marca à parte: agenda quem
     edita o lançamento (gestor ou financeiro), e o gatilho `trg_00_aprovacao_agendar` só deixa virar Agendado o que tem aprovação viva. */
  const papeis: [string, string, string][] = [
    ['Equipe financeira', 'Lança e envia', 'Lança a conta e envia à fila.'],
    ['Dono do cliente', 'Aprova ou recusa', 'Aprova em lote ou recusa.'],
    ['Operadora', 'Agenda o aprovado', 'Só o aprovado vira Agendado.'],
    ['Banco', 'Paga o agendado', 'O pago volta pelo extrato.'],
  ];
  return (
    <>
      <Titulo titulo="Quem lança, quem aprova" apoio="Nenhum pagamento é agendado sem o ok do dono." />
      <div className={`grid gap-2.5 ${estreito ? 'grid-cols-1' : 'grid-cols-2'}`} data-testid="guia-papeis">
        {papeis.map(([quem, o, como]) => (
          <div key={quem} className="rounded-lg border border-[#D3D9E2] px-3 py-2.5">
            <div className={`${NOWRAP} text-[11px] text-[#5A6A80]`} data-texto-guia>{quem}</div>
            <div className={`${NOWRAP} mt-0.5 text-[14px] font-semibold text-navy`} data-texto-guia>{o}</div>
            <div className={`${NOWRAP} mt-1 text-[12px] text-[#5A6A80]`} data-texto-guia>{como}</div>
          </div>
        ))}
      </div>
      <Nota>A consultoria lança; quem aprova é o cliente.</Nota>
    </>
  );
}

function Lista({ sim, titulo, itens }: { sim: boolean; titulo: string; itens: [React.ReactNode, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#D3D9E2]">
      <div className={`${NOWRAP} px-3 py-2 text-[12.5px] font-semibold ${sim ? 'bg-[#E8F5EE] text-[#1E7A4E]' : 'bg-[#FBECEC] text-[#A23B37]'}`} data-texto-guia>{titulo}</div>
      {itens.map(([p, t], i) => (
        <div key={i} className="flex items-center gap-2 border-t border-[#EDF0F4] px-3 py-[7px]">
          {p}<span className={`${NOWRAP} text-[12px] text-[#5A6A80]`} data-texto-guia>{t}</span>
        </div>
      ))}
    </div>
  );
}

function Passo2({ estreito }: { estreito: boolean }) {
  return (
    <>
      <Titulo titulo="Quais pagamentos passam" apoio="Só saídas que ainda não foram pagas." />
      <div className={`grid gap-3 ${estreito ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <Lista sim titulo="✓ Entram na fila" itens={[
          [<Pilula key="a" tom="prev">Previsto</Pilula>, 'a conta prevista, ainda sem nota'],
          [<Pilula key="b" tom="prog">Programado</Pilula>, 'a conta a pagar, com ou sem boleto'],
        ]} />
        <Lista sim={false} titulo="✕ Não entram" itens={[
          [<Pilula key="c" tom="pg">Realizado</Pilula>, 'já pago'],
          [<Pilula key="d" tom="prev">Entrada</Pilula>, 'recebimentos'],
          [<Pilula key="e" tom="apr">Aprovado</Pilula>, 'lançado por quem aprova já nasce aprovado'],
        ]} />
      </div>
      <Nota>A situação da conta não muda; a aprovação fica ao lado.</Nota>
    </>
  );
}

function Passo3({ estreito }: { estreito: boolean }) {
  const etapas: [React.ReactNode, string, string][] = [
    [<Pilula key="1" tom="prog">Programado</Pilula>, 'Equipe', 'lança'],
    [<Pilula key="2" tom="ag">Aguardando</Pilula>, 'Equipe', 'envia'],
    [<Pilula key="3" tom="apr">Aprovado</Pilula>, 'Dono', 'aprova'],
    [<Pilula key="4" tom="agd">Agendado</Pilula>, 'Operadora', 'agenda'],
    [<Pilula key="5" tom="pg">Realizado</Pilula>, 'Banco', 'concilia'],
  ];
  return (
    <>
      <Titulo titulo="O caminho de um pagamento" apoio="Cada etapa tem um responsável, com data." />
      <div className={estreito ? 'grid grid-cols-1 gap-1.5' : 'flex items-stretch gap-1.5'}>
        {etapas.map(([p, quem, faz], i) => (
          <div key={i} className={`flex ${estreito ? 'items-center gap-2 rounded-lg border border-[#D3D9E2] px-3 py-1.5' : 'min-w-0 flex-1 flex-col items-center rounded-lg border border-[#D3D9E2] px-2 py-2.5'}`}>
            {p}
            <span className={`${NOWRAP} text-[10.5px] text-[#5A6A80] ${estreito ? '' : 'mt-1.5'}`} data-texto-guia>{quem} {faz}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#F1CFCD] bg-[#FDF5F5] px-3 py-2">
        <Pilula tom="rec">Recusado</Pilula>
        <span className={`${NOWRAP} text-[12px] text-[#7A2E2B]`} data-texto-guia>volta com o motivo; a equipe corrige e reenvia</span>
      </div>
      <Nota>Só o aprovado vira Agendado.</Nota>
    </>
  );
}

function Passo4() {
  const linhas: [string, boolean][] = [
    ['Valor', true], ['Vencimento', true], ['Fornecedor ou conta bancária', true], ['Classificação ou fazenda', true], ['Descrição', false],
  ];
  return (
    <>
      <Titulo titulo="Mudou depois de aprovado?" apoio="Mudou algo que pesa, volta para a fila." />
      <div className="overflow-hidden rounded-lg border border-[#D3D9E2]">
        <div className="grid grid-cols-[1fr_auto] bg-navy px-3 py-1.5 text-[11px] font-medium text-white">
          <span className={NOWRAP}>Campo alterado</span><span className={NOWRAP}>O que acontece</span>
        </div>
        {linhas.map(([campo, volta]) => (
          <div key={campo} className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-[#EDF0F4] px-3 py-[6px] text-[12px]">
            <span className={NOWRAP} data-texto-guia>{campo}</span>
            {volta ? <Pilula tom="ag">volta a Aguardando</Pilula> : <Pilula tom="apr">continua aprovado</Pilula>}
          </div>
        ))}
      </div>
      <Nota>O histórico guarda cada rodada e o campo que mudou.</Nota>
    </>
  );
}

function Passo5({ estreito }: { estreito: boolean }) {
  const avisos: [string, string, 'err' | 'warn' | 'em-breve'][] = [
    ['Pago sem aprovação', 'saiu do banco sem passar pela fila', 'err'],
    ['Aprovado e não pago', 'venceu e não foi pago', 'warn'],
    ['Pago diferente do aprovado', 'o banco pagou outro valor', 'err'],
    ['Fila nova para aprovar', 'aviso ao aprovador · em breve', 'em-breve'],
  ];
  return (
    <>
      <Titulo titulo="Avisos e alertas" apoio="O sistema aponta; nunca corrige sozinho." />
      <div className="overflow-hidden rounded-lg border border-[#D3D9E2]">
        {avisos.map(([t, d, tom], i) => (
          <div key={t} className={`flex items-center gap-2.5 px-3 py-2 ${i ? 'border-t border-[#EDF0F4]' : ''}`}>
            <i className={`h-2 w-2 flex-none rounded-full ${tom === 'err' ? 'bg-[#D9534F]' : tom === 'warn' ? 'bg-[#D99A2B]' : 'border border-[#9AA7B8]'}`} />
            {/* no celular a descrição vai na linha de baixo (cada texto segue numa linha só) */}
            <div className={estreito ? 'flex min-w-0 flex-col' : 'flex min-w-0 items-center gap-2.5'}>
              <span className={`${NOWRAP} text-[12.5px] font-semibold text-navy`} data-texto-guia>{t}</span>
              <span className={`${NOWRAP} text-[12px] text-[#5A6A80]`} data-texto-guia>{d}</span>
            </div>
          </div>
        ))}
      </div>
      <Nota>Os alertas ficam na aba Alertas, mês a mês.</Nota>
    </>
  );
}

interface EstadoDoLigar { aprovador: string; desde: string; dias: number[] }

function Passo6({ estado, setEstado, candidatos, lendo, estreito }: {
  estado: EstadoDoLigar; setEstado: (e: EstadoDoLigar) => void; candidatos: CandidatoAAprovador[] | null; lendo: boolean; estreito: boolean;
}) {
  const opcoes = (candidatos ?? []).map((c) => ({
    value: c.userId, label: c.rotulo, hint: c.jaAprova ? 'já aprova' : c.perfil === 'financeiro' ? 'financeiro' : 'gestor',
  }));
  return (
    <>
      <Titulo titulo="Ligar neste cliente" apoio="Só o administrador liga, com prévia antes." />
      <div className={`grid gap-3 ${estreito ? 'grid-cols-1' : 'grid-cols-[1.4fr_1fr]'}`}>
        <label className="flex flex-col gap-1">
          <span className={`${NOWRAP} text-[11px] font-medium text-[#5A6A80]`} data-texto-guia>Quem aprova</span>
          <SearchableSelect value={estado.aprovador} onValueChange={(v) => setEstado({ ...estado, aprovador: v })} options={opcoes}
            placeholder={lendo ? 'Lendo os gestores…' : opcoes.length ? 'Escolha um gestor do cliente' : 'Nenhum gestor ativo no cliente'} disabled={lendo || !opcoes.length} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={`${NOWRAP} text-[11px] font-medium text-[#5A6A80]`} data-texto-guia>Saídas com vencimento a partir de</span>
          <DatePicker value={estado.desde} onChange={(v) => setEstado({ ...estado, desde: v })} />
        </label>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <span className={`${NOWRAP} text-[11px] font-medium text-[#5A6A80]`} data-texto-guia>Dias de pagamento (combinados)</span>
        <div className="flex items-center gap-1.5">
          {DIAS_DA_SEMANA.map((d) => {
            const on = estado.dias.includes(d.n);
            return (
              <button key={d.n} type="button" aria-pressed={on} data-dia={d.n} onClick={() => setEstado({ ...estado, dias: alternarDia(estado.dias, d.n) })}
                className={`h-7 w-[42px] flex-none rounded-md border text-[12px] font-medium transition-colors ${on ? 'border-navy bg-navy text-white' : 'border-[#D3D9E2] bg-white text-[#1A2433] hover:bg-[#F3F5F8]'}`}>
                {d.rotulo}
              </button>
            );
          })}
          {!estreito && <span className={`${NOWRAP} ml-1 text-[12px] text-[#5A6A80]`} data-texto-guia data-testid="guia-dias-texto">{textoDosDias(estado.dias)}</span>}
        </div>
        {estreito && <span className={`${NOWRAP} text-[12px] text-[#5A6A80]`} data-texto-guia data-testid="guia-dias-texto">{textoDosDias(estado.dias)}</span>}
      </div>
      {/* Gabriel 23/11 08:46: data NUNCA trava (no máximo uma sugestão, depois); o banco só guarda os dias (`dias_semana`), nada recusa por eles */}
      <Nota>Data não trava nada; só a aprovação trava.</Nota>
    </>
  );
}

export interface GuiaDaAprovacaoProps {
  aberto: boolean;
  /** `naoMostrar`: a caixa "Não mostrar de novo" no fechar */
  onFechar: (naoMostrar: boolean) => void;
  passoInicial?: number;
  ehAdmin: boolean;
  clienteId: string;
  /** o BPO já está ligado neste cliente (o passo 6 vira "Prévia e salvar") */
  ligado: boolean;
  /** depois de ligar/salvar: a tela relê */
  onLigou: (frase: string) => void;
}

export function GuiaDaAprovacao({ aberto, onFechar, passoInicial = 0, ehAdmin, clienteId, ligado, onLigou }: GuiaDaAprovacaoProps) {
  const largura = useLarguraDaJanela();
  const estreito = largura < 760;
  const total = ehAdmin ? 6 : 5;
  const [passo, setPasso] = useState(passoInicial);
  const [naoMostrar, setNaoMostrar] = useState(true);
  const [estado, setEstado] = useState<EstadoDoLigar>({ aprovador: '', desde: hojeLocal(), dias: [] });
  const [candidatos, setCandidatos] = useState<CandidatoAAprovador[] | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (aberto) { setPasso(Math.min(passoInicial, total - 1)); setPrevia(null); setErro(null); } }, [aberto, passoInicial, total]);

  /* o passo 6 lê os gestores/financeiro ativos do cliente, os que já aprovam e a configuração atual (só o admin chega aqui) */
  const noLigar = ehAdmin && passo === 5;
  useEffect(() => {
    if (!aberto || !noLigar || candidatos !== null) return;
    let vivo = true;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: as tabelas da 118160 não estão no types.ts
      const sb = supabase as any;
      const [membros, aprov, cfg] = await Promise.all([
        sb.from('cliente_membros').select('user_id, perfil, ativo').eq('cliente_id', clienteId).in('perfil', ['gestor_cliente', 'financeiro']),
        sb.from('financeiro_aprovadores').select('user_id').eq('cliente_id', clienteId).eq('ativo', true),
        sb.from('financeiro_bpo_config').select('desde, dias_semana').eq('cliente_id', clienteId).limit(1),
      ]);
      const ids = Array.isArray(membros.data) ? membros.data.map((m: { user_id?: unknown }) => m.user_id).filter((x: unknown): x is string => typeof x === 'string') : [];
      /* BPO-NOMES-LARGURA-01: o nome vem da fonte única (`fn_nomes_dos_autores`, por user_id e guardada pelo cliente). Ler `profiles`
         direto casava o id do usuário com o id da LINHA (nunca achava) e, para quem não é admin, a RLS só deixa ler o próprio perfil. */
      const nomes = ids.length ? await buscarNomesDosAutores(clienteId, ids).catch(() => []) : [];
      if (!vivo) return;
      const lista = candidatosAAprovador(membros.data, mapaDosNomes(nomes), aprov.data);
      setCandidatos(lista);
      const c = Array.isArray(cfg.data) ? cfg.data[0] : null;
      const diasGravados = Array.isArray(c?.dias_semana) ? c.dias_semana.filter((n: unknown): n is number => typeof n === 'number') : [];
      setEstado((e) => ({
        aprovador: e.aprovador || (lista.find((x) => x.jaAprova)?.userId ?? ''),
        desde: typeof c?.desde === 'string' ? c.desde : e.desde,
        dias: diasGravados.length ? diasGravados : e.dias,
      }));
    })();
    return () => { vivo = false; };
  }, [aberto, noLigar, candidatos, clienteId]);

  const nomeDoAprovador = useMemo(() => candidatos?.find((c) => c.userId === estado.aprovador)?.rotulo ?? '', [candidatos, estado.aprovador]);

  const chamar = async (simular: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
    const sb = supabase as any;
    const a = await sb.rpc('fn_bpo_aprovador_gravar', { p_cliente: clienteId, p_user: estado.aprovador, p_ativo: true, p_simular: simular });
    if (a.error) return { erro: a.error.message as string | undefined };
    const c = await sb.rpc('fn_bpo_config_gravar', {
      p_cliente: clienteId, p_ativo: true, p_desde: estado.desde, p_dias: estado.dias, p_horario: null, p_email: false, p_whatsapp: false, p_simular: simular,
    });
    if (c.error) return { erro: c.error.message as string | undefined };
    return { aguardando: Number(c.data?.aguardando_ao_ligar ?? 0) };
  };

  const fraseDoErro = (m: string | undefined) => (m?.startsWith('BPO: ') ? m.slice(5) : 'Não consegui ligar agora. Nada foi gravado; tente de novo.');

  const avancar = async () => {
    setErro(null);
    if (passo < total - 1) { setPasso(passo + 1); return; }
    if (!noLigar) { onFechar(naoMostrar); return; }
    if (!estado.aprovador) { setErro('Escolha quem aprova.'); return; }
    if (!estado.desde) { setErro('Escolha a data a partir da qual valem os vencimentos.'); return; }
    setOcupado(true);
    try {
      if (previa === null) {
        const r = await chamar(true);
        if ('erro' in r) { setErro(fraseDoErro(r.erro)); return; }
        setPrevia(fraseDaPreviaDoLigar({ aguardando: r.aguardando, desde: estado.desde, aprovador: nomeDoAprovador, dias: estado.dias }));
        return;
      }
      const r = await chamar(false);
      if ('erro' in r) { setErro(fraseDoErro(r.erro)); return; }
      onLigou(`Aprovação ligada · aprova ${nomeDoAprovador} · ${textoDosDias(estado.dias)}`);
      onFechar(true);
    } catch { setErro('Não consegui ligar agora. Nada foi gravado; tente de novo.'); } finally { setOcupado(false); }
  };

  const rotuloDoAvancar = passo < total - 1 ? 'Próximo' : !noLigar ? 'Entendi' : previa === null ? (ligado ? 'Prévia e salvar' : 'Prévia e ligar') : (ligado ? 'Salvar' : 'Ligar');

  const conteudo = [<Passo1 key={0} estreito={estreito} />, <Passo2 key={1} estreito={estreito} />, <Passo3 key={2} estreito={estreito} />,
    <Passo4 key={3} />, <Passo5 key={4} estreito={estreito} />,
    <Passo6 key={5} estado={estado} setEstado={(e) => { setEstado(e); setPrevia(null); }} candidatos={candidatos} lendo={candidatos === null} estreito={estreito} />][passo];

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(naoMostrar); }}>
      <DialogContent className={`flex flex-col gap-0 overflow-hidden p-0 sm:rounded-[10px] [&>button:last-child]:text-white ${estreito ? 'max-w-[95vw]' : 'max-w-[960px]'}`}
        data-testid="guia-aprovacao">
        <div className="flex h-[52px] flex-none items-center bg-navy px-[18px] pr-12 text-white">
          <DialogTitle className={`${NOWRAP} text-[15px] font-semibold`}>Aprovação de pagamentos</DialogTitle>
          <span className={`${NOWRAP} ml-2.5 text-[12px] text-[#9FB0C8]`} data-texto-guia>
            {estreito ? `passo ${passo + 1} de ${total}` : `como funciona · ${total} passos`}
          </span>
        </div>
        <div className={estreito ? 'flex flex-col overflow-y-auto' : 'grid grid-cols-[220px_1fr]'}
          style={{ height: estreito ? ALTURA_DO_CORPO_ESTREITO : ALTURA_DO_CORPO }} data-testid="guia-corpo">
          {!estreito && (
            <div className="border-r border-[#D3D9E2] bg-[#F3F5F8] py-3.5" data-testid="guia-passos">
              {PASSOS_DO_GUIA.slice(0, total).map((nome, i) => (
                <button key={nome} type="button" onClick={() => { setPasso(i); setErro(null); }} aria-current={i === passo ? 'step' : undefined}
                  className={`flex w-full items-center gap-2.5 px-4 py-[9px] text-left text-[12.5px] ${i === passo ? 'bg-white font-semibold text-navy shadow-[inset_3px_0_0_#1F56B8]' : 'font-medium text-[#5A6A80]'}`}>
                  <b className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border text-[11px] font-semibold ${i === passo ? 'border-[#1F56B8] bg-[#1F56B8] text-white' : i < passo ? 'border-[#A9D8BE] bg-[#E3F2EA] text-[#2FA36B]' : 'border-[#B8C3D3] bg-white'}`}>
                    {i < passo ? <Check className="h-3 w-3" /> : i + 1}
                  </b>
                  <span className={NOWRAP} data-texto-guia>{nome}</span>
                </button>
              ))}
            </div>
          )}
          <div className={estreito ? 'px-4 py-4' : 'min-w-0 overflow-hidden px-[26px] py-[22px]'} data-testid={`guia-passo-${passo + 1}`}>{conteudo}</div>
        </div>
        {(previa || erro) && (
          <div className={`${estreito ? 'whitespace-normal' : NOWRAP} flex-none border-t px-[18px] py-2 text-[12px] ${erro ? 'border-[#F1CFCD] bg-[#FDF5F5] text-[#A23B37]' : 'border-[#CFDCF2] bg-[#EEF3FB] text-[#284a85]'}`}
            data-testid={erro ? 'guia-erro' : 'guia-previa'} data-texto-guia>
            {erro ?? `Prévia: ${previa}. Confira e clique em ${ligado ? 'Salvar' : 'Ligar'}.`}
          </div>
        )}
        <div className="flex h-[52px] flex-none items-center gap-3 border-t border-[#D3D9E2] px-[18px]">
          <label className="flex items-center gap-2 text-[12px] text-[#5A6A80]">
            <Checkbox checked={naoMostrar} onCheckedChange={(v) => setNaoMostrar(v === true)} aria-label="Não mostrar de novo" />
            <span className={NOWRAP} data-texto-guia>{estreito ? 'Não mostrar' : 'Não mostrar de novo'}</span>
          </label>
          {!estreito && (
            <div className="flex gap-1.5" aria-hidden>
              {Array.from({ length: total }).map((_, i) => <i key={i} className={`h-1.5 w-1.5 rounded-full ${i === passo ? 'bg-[#1F56B8]' : 'bg-[#C9D2DE]'}`} />)}
            </div>
          )}
          <span className="flex-1" />
          <button type="button" onClick={() => { setErro(null); setPasso(Math.max(0, passo - 1)); }} disabled={passo === 0}
            className={`h-8 w-[84px] rounded-md border border-[#D3D9E2] bg-white text-[12.5px] font-medium ${passo === 0 ? 'invisible' : ''}`}>Voltar</button>
          <button type="button" onClick={() => void avancar()} disabled={ocupado} data-testid="guia-avancar"
            className={`h-8 rounded-md bg-[#1F56B8] text-[12.5px] font-semibold text-white disabled:opacity-60 ${estreito ? 'w-[118px]' : 'w-[132px]'}`}>
            {rotuloDoAvancar}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
