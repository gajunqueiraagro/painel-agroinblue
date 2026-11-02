/**
 * INFRA-FICHAS-PATR-01 — a FICHA da infraestrutura no painel do Gestor: editar (campos do tipo) e ler. O catálogo é `fichasDaInfra.ts`.
 * - Opções-padrão pelo seletor da casa, com "Outro…" que abre um campo para digitar (o banco aceita qualquer texto; a lista é sugestão).
 * - Sim/não e lados pelo `Segmentado` (a seleção da casa); números pelo `CampoNumeroComConta` com a unidade dentro.
 * - Cocho: "Metros lineares úteis" = comprimento × lados, calculado na hora (não se digita, não se grava).
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { formatNum } from '@/lib/calculos/formatters';
import { camposDaFicha, metrosUteis, textoDoCampo, type CampoDaFicha, type Ficha } from '@/lib/mapa/fichasDaInfra';
import type { TipoInfra } from '@/lib/mapa/infraestrutura';

const OUTRO = '__outro__';
const NADA = '__nada__';

function CampoDeTexto({ c, valor, onChange }: { c: CampoDaFicha; valor: string; onChange: (v: string) => void }) {
  const naLista = !!c.opcoes?.includes(valor);
  const [outroAberto, setOutroAberto] = useState(!!valor && !naLista);
  /* o cursor vai ao campo só quando a pessoa ESCOLHE "Outro…" (abrir o Editar com um valor fora da lista não rouba o foco) */
  const [focar, setFocar] = useState(false);
  if (!c.opcoes) {
    return <Input value={valor} onChange={e => onChange(e.target.value)} maxLength={80} className="h-[24px] px-1.5 text-[10.5px]" aria-label={c.rotulo} />;
  }
  const escolhido = naLista ? valor : outroAberto ? OUTRO : NADA;
  const opcoes = [{ value: NADA, label: '—' }, ...c.opcoes.map(o => ({ value: o, label: o })), { value: OUTRO, label: 'Outro…' }];
  return (
    <div className="flex flex-col gap-0.5">
      <SearchableSelect value={escolhido} options={opcoes} semTodos dense triggerClassName="h-[24px] min-h-0 py-0 text-[10.5px]"
        onValueChange={v => {
          if (v === OUTRO) { setOutroAberto(true); setFocar(true); if (naLista) onChange(''); return; }
          setOutroAberto(false);
          onChange(v === NADA ? '' : v);
        }} />
      {outroAberto && (
        <Input value={valor} onChange={e => onChange(e.target.value)} maxLength={80} placeholder="Digite" autoFocus={focar}
          className="h-[24px] px-1.5 text-[10.5px]" aria-label={`${c.rotulo} (outro)`} />
      )}
    </div>
  );
}

export function FichaEditar({ tipo, ficha, onChange }: { tipo: TipoInfra; ficha: Ficha; onChange: (f: Ficha) => void }) {
  const mudar = (chave: string, v: string | number | boolean | null) => {
    const nova = { ...ficha };
    if (v === null || v === '') delete nova[chave]; else nova[chave] = v;
    onChange(nova);
  };
  const uteis = metrosUteis(ficha);
  return (
    <div className="flex flex-col gap-1.5" data-testid="infra-ficha-editar">
      {camposDaFicha(tipo).map(c => {
        const v = ficha[c.chave];
        return (
          <div key={c.chave} className="flex flex-col gap-0.5">
            <span className="text-[9.5px] text-[#5A6472]">{c.rotulo}</span>
            {c.forma === 'texto' && <CampoDeTexto c={c} valor={typeof v === 'string' ? v : ''} onChange={t => mudar(c.chave, t)} />}
            {(c.forma === 'numero' || c.forma === 'inteiro') && (
              <CampoNumeroComConta valor={typeof v === 'number' ? v : null} onChange={n => mudar(c.chave, n)} casas={c.forma === 'inteiro' ? 0 : c.casas ?? 0}
                sufixoDentro={c.unidade} className="h-[24px] text-[10.5px]" />
            )}
            {c.forma === 'simnao' && (
              <Segmentado valor={v === true ? 'sim' : v === false ? 'nao' : ''} altura={22} fonte={10}
                onEscolher={x => mudar(c.chave, x === 'sim')} opcoes={[{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }]} />
            )}
            {c.forma === 'lados' && (
              <Segmentado valor={v === 1 ? '1' : v === 2 ? '2' : ''} altura={22} fonte={10}
                onEscolher={x => mudar(c.chave, x === '1' ? 1 : 2)} opcoes={[{ valor: '1', rotulo: '1 lado' }, { valor: '2', rotulo: '2 lados' }]} />
            )}
          </div>
        );
      })}
      {tipo === 'cocho' && (
        /* lugar reservado: sem comprimento e lados, a caixa fica com "—" (nada abaixo se desloca) */
        <div className="flex h-[20px] items-center justify-between rounded-md bg-[#FFF6D6] px-1.5 text-[10px]" data-testid="infra-metros-uteis">
          <span>Metros lineares úteis</span><b className="tabular-nums">{uteis == null ? '—' : `${formatNum(uteis, 1)} m`}</b>
        </div>
      )}
    </div>
  );
}

export function FichaLer({ tipo, ficha }: { tipo: TipoInfra; ficha: Ficha }) {
  const uteis = metrosUteis(ficha);
  const linhas = camposDaFicha(tipo).map(c => ({ rotulo: c.rotulo, texto: textoDoCampo(c, ficha[c.chave]) }));
  if (tipo === 'cocho') linhas.splice(3, 0, { rotulo: 'Úteis', texto: uteis == null ? '' : `${formatNum(uteis, 1)} m lineares` });
  return (
    <dl className="grid grid-cols-[86px_1fr] gap-x-1.5 gap-y-1 leading-[13px]" data-testid="infra-ficha-ler">
      {linhas.map(l => (
        <div key={l.rotulo} className="contents">
          <dt className="text-[#5A6472]">{l.rotulo}</dt><dd className="break-words tabular-nums">{l.texto}</dd>
        </div>
      ))}
    </dl>
  );
}
