/**
 * RESUMO-CLIENTES-01 passo a — a tabela das pendências (painel e modal do cliente usam a MESMA).
 * Linhas de 22px, colunas em px fixos (só "O que" estica e corta, inteiro no `title`), uma linha por registro; cabeçalho navy e rodapé
 * com fundo próprio, presos; o corpo rola. "Cobrei" troca as ações da linha pelos três canais (grava data + canal); "Resolvida" grava
 * na hora. O recado (erro do banco) fica num lugar reservado sobre o rodapé.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CANAIS, ROTULO_CANAL, ROTULO_STATUS, dataCompleta, emAberto, fraseDoRodape, ordenarPendencias, rodapePendencias, textoDaCobranca,
  textoDaOrigem, vencida, type CanalCobranca, type Pendencia,
} from '@/lib/consultor/pendencias';

export interface PendenciasTabelaProps {
  lista: readonly Pendencia[];
  /** Com o mapa id → nome, a tabela ganha a coluna Cliente (o painel); sem ele, é a tabela de um cliente só (o modal). */
  nomesDosClientes?: ReadonlyMap<string, string>;
  onCobrar: (id: string, canal: CanalCobranca) => Promise<string | null>;
  onResolver: (id: string) => Promise<string | null>;
}

const TH = 'px-1.5 text-left font-semibold';
/* UI-SEM-CORTE-02 — texto QUEBRA a linha (a linha cresce), nunca "…"; data e numero ficam numa linha so'. */
const TD = 'break-words px-1.5 py-0.5 leading-tight';
const COR_STATUS: Record<Pendencia['status'], string> = { aberta: 'text-[#b45309]', cobrada: 'text-[#1d4ed8]', resolvida: 'text-muted-foreground' };

export function PendenciasTabela({ lista, nomesDosClientes, onCobrar, onResolver }: PendenciasTabelaProps) {
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const comCliente = !!nomesDosClientes;
  const linhas = ordenarPendencias(lista);
  const r = rodapePendencias(lista);

  const rodar = async (id: string, f: () => Promise<string | null>) => {
    setOcupado(id); setRecado(null);
    const e = await f();
    setOcupado(null); setCobrando(null);
    if (e) setRecado(e);
  };

  const cols = (
    <colgroup>
      {comCliente && <col style={{ width: 130 }} />}
      <col style={{ width: 70 }} /><col style={{ width: 104 }} /><col /><col style={{ width: 112 }} />
      <col style={{ width: 66 }} /><col style={{ width: 100 }} /><col style={{ width: 168 }} />
    </colgroup>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="pendencias-tabela">
      {/* UI-SEM-CORTE-02 — o corpo e' o flex-1 da altura de quem hospeda (modal ou painel): nunca uma altura propria que empurre os botoes */}
      <div className="min-h-0 flex-1 overflow-auto" data-testid="pendencias-corpo">
        <table className="w-full table-fixed text-[10px]">
          {cols}
          <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
            <tr className="h-[22px] text-[9.5px]">
              {comCliente && <th className={TH}>Cliente</th>}
              <th className={TH}>Prazo</th><th className={TH}>Cobrar de</th><th className={TH}>O que</th><th className={TH}>Origem</th>
              <th className={TH}>Status</th><th className={TH}>Última cobrança</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            {linhas.map(p => {
              const aberta = emAberto(p);
              return (
                <tr key={p.id} className={cn('h-[22px] border-b', !aberta && 'text-muted-foreground')} data-testid="pendencia-linha" data-status={p.status}>
                  {comCliente && <td className={TD} title={nomesDosClientes?.get(p.clienteId) ?? ''}>{nomesDosClientes?.get(p.clienteId) ?? '—'}</td>}
                  <td className={cn('whitespace-nowrap px-1.5 tabular-nums', vencida(p) && 'font-semibold text-destructive')} data-testid="pendencia-prazo">{dataCompleta(p.prazo)}</td>
                  <td className={TD} title={p.cobrarDe}>{p.cobrarDe}</td>
                  <td className={TD} title={p.oQue}>{p.oQue}</td>
                  <td className={TD} title={textoDaOrigem(p)}>{textoDaOrigem(p)}</td>
                  <td className={cn('px-1.5', COR_STATUS[p.status])}>{ROTULO_STATUS[p.status]}</td>
                  <td className={TD} title={textoDaCobranca(p)}>{textoDaCobranca(p)}</td>
                  <td className="whitespace-nowrap px-1.5 text-right">
                    {!aberta ? null : cobrando === p.id ? (
                      <span className="inline-flex items-center gap-1" data-testid="canais-da-cobranca">
                        {CANAIS.map(c => (
                          <button key={c} type="button" disabled={ocupado === p.id} className="rounded border px-1 leading-[14px] hover:bg-muted"
                            data-testid={`cobrei-${c}`} onClick={() => void rodar(p.id, () => onCobrar(p.id, c))}>{ROTULO_CANAL[c]}</button>
                        ))}
                        <button type="button" className="px-0.5 text-muted-foreground" aria-label="cancelar" onClick={() => setCobrando(null)}>✕</button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <button type="button" disabled={ocupado === p.id} className="rounded border px-1.5 leading-[14px] hover:bg-muted"
                          data-testid="cobrei" onClick={() => setCobrando(p.id)}>Cobrei</button>
                        <button type="button" disabled={ocupado === p.id} className="rounded border px-1.5 leading-[14px] hover:bg-muted"
                          data-testid="resolvida" onClick={() => void rodar(p.id, () => onResolver(p.id))}>Resolvida</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr className="h-[22px]"><td colSpan={comCliente ? 8 : 7} className="px-1.5 text-muted-foreground">Nenhuma pendência registrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="h-4 shrink-0 truncate px-1.5 text-[10px] text-destructive" data-testid="pendencias-recado" title={recado ?? ''}>{recado ?? ''}</p>
      <div className="flex h-[22px] shrink-0 items-center bg-[#E8E6DF] px-1.5 text-[10px] font-semibold" data-testid="pendencias-rodape">
        {fraseDoRodape(r)}
      </div>
    </div>
  );
}
