/**
 * MAPA-02f-b — o painel da INFRAESTRUTURA no Gestor (no lugar do painel do pasto, mesma largura).
 * - NOVO: o ponto já colocado no mapa; nome, pasto (sugerido pelo polígono onde caiu), bem do Patrimônio (filtrado pelas categorias do
 *   tipo), observação. "Ver prévia" chama `fn_infra_salvar` com prévia; "Gravar" grava.
 * - VER: só leitura (tipo, nome, pasto, bem, quem criou e quando) + "Editar" (arrastar o ponto no mapa e mudar os campos) e
 *   "Desativar" (motivo). Nada se apaga: desativar tira do mapa e fica na trilha.
 * A recusa do banco aparece aqui (nunca toast); o botão desabilitado diz por quê.
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useNomesDosAutores } from '@/hooks/useNomesDosAutores';
import type { BemDaFazenda, Resposta } from '@/hooks/useInfraestruturas';
import { COR_DO_GRUPO, definicaoDoTipo, iconeDaInfra, type CamposDaInfra, type InfraLida, type TipoInfra } from '@/lib/mapa/infraestrutura';

type Modo = 'novo' | 'ver' | 'editar' | 'desativar';
const SEM = '__sem__';

interface Props {
  className: string;
  fazendaId: string;
  clienteId: string | null;
  tipo: TipoInfra;
  infra: InfraLida | null;
  /** a posição atual do ponto (no NOVO e ao arrastar no EDITAR) */
  ponto: { lon: number; lat: number };
  pastoSugerido: string | null;
  pastos: readonly { id: string; nome: string; ativo: boolean }[];
  bens: readonly BemDaFazenda[];
  salvar: (c: CamposDaInfra, simular: boolean, motivo?: string) => Promise<Resposta>;
  desativar: (id: string, motivo: string, simular: boolean) => Promise<Resposta>;
  /** o painel avisa quando entra/sai da edição (o mapa deixa arrastar o ponto) */
  onEditando: (editando: boolean) => void;
  onGravou: () => void;
  onFechar: () => void;
}

function linhaDaPrevia(d: unknown): string {
  if (typeof d !== 'object' || d === null) return '';
  const rotulo = Reflect.get(d, 'rotulo'); const pasto = Reflect.get(d, 'pasto'); const bem = Reflect.get(d, 'bem');
  const pastoNome = typeof pasto === 'object' && pasto !== null ? Reflect.get(pasto, 'nome') : null;
  const bemDesc = typeof bem === 'object' && bem !== null ? Reflect.get(bem, 'descricao') : null;
  const avisos = Reflect.get(d, 'avisos');
  return [typeof rotulo === 'string' ? rotulo : '', typeof pastoNome === 'string' ? `no ${pastoNome}` : 'fora de pasto',
    typeof bemDesc === 'string' ? `bem: ${bemDesc}` : '', ...(Array.isArray(avisos) ? avisos.filter(a => typeof a === 'string') : [])]
    .filter(Boolean).join(' · ');
}

export function InfraPainel(p: Props) {
  const [modo, setModo] = useState<Modo>(p.infra ? 'ver' : 'novo');
  const [nome, setNome] = useState(p.infra?.nome ?? '');
  const [pastoId, setPastoId] = useState(p.infra ? (p.infra.pasto_id ?? SEM) : (p.pastoSugerido ?? SEM));
  const [bemId, setBemId] = useState(p.infra?.bem_id ?? SEM);
  const [observacao, setObservacao] = useState(p.infra?.observacao ?? '');
  const [motivo, setMotivo] = useState('');
  const [previa, setPrevia] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const def = definicaoDoTipo(p.tipo);
  const { nomes } = useNomesDosAutores(p.clienteId, [p.infra?.criado_por]);
  const { onEditando } = p;

  useEffect(() => { onEditando(modo === 'editar'); }, [modo, onEditando]);
  /* qualquer mudança derruba a prévia: o Gravar só vale para o que foi conferido */
  useEffect(() => { setPrevia(null); setRecusa(null); }, [nome, pastoId, bemId, observacao, p.ponto.lon, p.ponto.lat, modo]);

  const opcoesDePasto = useMemo(() => [{ value: SEM, label: 'Fora de pasto' },
    ...p.pastos.filter(x => x.ativo).map(x => ({ value: x.id, label: x.nome, sub: x.id === p.pastoSugerido ? 'onde o ponto caiu' : undefined }))],
  [p.pastos, p.pastoSugerido]);
  const opcoesDeBem = useMemo(() => [{ value: SEM, label: 'Sem bem do Patrimônio' },
    ...p.bens.filter(b => !def || (b.categoria != null && def.categorias.includes(b.categoria)))
      .map(b => ({ value: b.id, label: b.codigo ? `${b.codigo} · ${b.descricao}` : b.descricao, sub: b.situacao === 'baixado' ? 'baixado' : undefined }))],
  [p.bens, def]);

  const campos = (): CamposDaInfra => ({
    id: p.infra?.id ?? null, versao: p.infra?.versao ?? null, fazendaId: p.fazendaId, tipo: p.tipo, lon: p.ponto.lon, lat: p.ponto.lat,
    nome, pastoId: pastoId === SEM ? null : pastoId, bemId: bemId === SEM ? null : bemId, observacao,
  });

  const verPrevia = async () => {
    setRecusa(null);
    const r = modo === 'desativar' && p.infra ? await p.desativar(p.infra.id, motivo, true) : await p.salvar(campos(), true);
    if (!r.ok) { setRecusa(r.motivo); return; }
    const semMudanca = typeof r.dado === 'object' && r.dado !== null && Reflect.get(r.dado, 'sem_mudanca') === true;
    setPrevia(modo === 'desativar' ? `Desativar ${def?.rotulo ?? ''}${p.infra?.nome ? ` "${p.infra.nome}"` : ''}: sai do mapa, fica na trilha.`
      : semMudanca ? 'Nada muda.' : linhaDaPrevia(r.dado));
  };
  const gravar = async () => {
    setGravando(true);
    const r = modo === 'desativar' && p.infra ? await p.desativar(p.infra.id, motivo, false) : await p.salvar(campos(), false);
    setGravando(false);
    if (!r.ok) { setRecusa(r.motivo); return; }
    p.onGravou();
  };

  const nomeDoAutor = p.infra?.criado_por ? nomes.get(p.infra.criado_por)?.nome ?? '' : '';
  const quando = p.infra?.criado_em ? new Date(p.infra.criado_em).toLocaleDateString('pt-BR') : '';
  const pastoNome = (id: string | null) => (id ? p.pastos.find(x => x.id === id)?.nome ?? '' : '');
  const bem = p.infra?.bem_id ? p.bens.find(b => b.id === p.infra?.bem_id) : null;
  const porQue = modo === 'desativar' && !motivo.trim() ? 'Diga o motivo.' : !previa ? 'Veja a prévia antes.' : previa === 'Nada muda.' ? 'Nada muda.' : null;

  return (
    <div className={p.className} data-testid="mapa-painel-infra">
      <div className="flex-none border-b border-black/[0.08] px-2 pb-1.5 pt-2">
        <div className="flex items-center gap-1.5">
          <span className="flex-none" dangerouslySetInnerHTML={{ __html: iconeDaInfra(p.tipo) }} />
          <b className="min-w-0 break-words text-[12px] leading-[15px]">{p.infra?.nome || def?.rotulo}</b>
          <button type="button" aria-label="Fechar" className="ml-auto flex-none text-[#4A5361] hover:text-[#1d232b]" onClick={p.onFechar}><X className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-0.5 h-[12px] text-[9.5px] leading-[12px]" style={{ color: def ? COR_DO_GRUPO[def.grupo] : undefined }}>
          {modo === 'novo' ? `Nova infraestrutura · ${def?.rotulo}` : modo === 'editar' ? 'Editando · arraste o ponto no mapa' : def?.rotulo}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 text-[10px]">
        {modo === 'ver' && p.infra && (
          <dl className="grid grid-cols-[64px_1fr] gap-x-1.5 gap-y-1 leading-[13px]" data-testid="infra-leitura">
            <dt className="text-[#5A6472]">Tipo</dt><dd>{def?.rotulo}</dd>
            <dt className="text-[#5A6472]">Nome</dt><dd className="break-words">{p.infra.nome ?? ''}</dd>
            <dt className="text-[#5A6472]">Pasto</dt><dd>{pastoNome(p.infra.pasto_id)}</dd>
            <dt className="text-[#5A6472]">Bem</dt><dd className="break-words" title={bem ? 'O bem do Patrimônio ligado a esta infraestrutura' : undefined}>{bem ? `${bem.codigo ? `${bem.codigo} · ` : ''}${bem.descricao}` : ''}</dd>
            <dt className="text-[#5A6472]">Observação</dt><dd className="break-words">{p.infra.observacao ?? ''}</dd>
            <dt className="text-[#5A6472]">Criada</dt><dd>{[nomeDoAutor, quando].filter(Boolean).join(' · ')}</dd>
          </dl>
        )}
        {(modo === 'novo' || modo === 'editar') && (
          <div className="flex flex-col gap-1.5" data-testid="infra-formulario">
            <label className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Nome</span>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder={def?.rotulo} className="h-[24px] px-1.5 text-[10.5px]" /></label>
            <div className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Pasto</span>
              <SearchableSelect value={pastoId} onValueChange={setPastoId} options={opcoesDePasto} semTodos dense triggerClassName="h-[24px] min-h-0 py-0 text-[10.5px]" /></div>
            <div className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Bem do Patrimônio</span>
              <SearchableSelect value={bemId} onValueChange={setBemId} options={opcoesDeBem} semTodos dense triggerClassName="h-[24px] min-h-0 py-0 text-[10.5px]" /></div>
            <label className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Observação</span>
              <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="h-[24px] px-1.5 text-[10.5px]" /></label>
          </div>
        )}
        {modo === 'desativar' && (
          <label className="flex flex-col gap-0.5" data-testid="infra-desativar"><span className="text-[9.5px] text-[#5A6472]">Motivo de desativar</span>
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="ex.: cocho retirado" className="h-[24px] px-1.5 text-[10.5px]" /></label>
        )}
        {modo !== 'ver' && (
          <div className="mt-1.5 min-h-[26px] leading-[13px]" data-testid="infra-previa">
            {recusa ? <span className="text-[#B03A2E]">{recusa}</span> : previa ? <span>{previa}</span> : null}
          </div>
        )}
      </div>
      <div className="flex flex-none items-center justify-end gap-1 border-t border-black/[0.08] px-2 py-1.5">
        {modo === 'ver' ? (
          <>
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={() => setModo('editar')}>Editar</Button>
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10.5px] text-[#B03A2E]" onClick={() => setModo('desativar')}>Desativar</Button>
          </>
        ) : (
          <>
            {porQue && <span className="mr-auto text-[9.5px] text-[#5A6472]">{porQue}</span>}
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10.5px]" onClick={() => (p.infra ? setModo('ver') : p.onFechar())}>Cancelar</Button>
            {!previa
              ? <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={verPrevia} disabled={modo === 'desativar' && !motivo.trim()}>Ver prévia</Button>
              : <Button type="button" size="sm" className="h-6 px-2 text-[10.5px]" onClick={gravar} disabled={!!porQue || !!recusa || gravando} title={porQue ?? undefined}>
                {gravando ? 'Gravando…' : modo === 'desativar' ? 'Desativar' : 'Gravar'}</Button>}
          </>
        )}
      </div>
    </div>
  );
}
