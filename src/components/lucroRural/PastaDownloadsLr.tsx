/**
 * FIN-LR-SYNC-01 passo c — a linha "pasta Downloads" do modal do LR. Quatro estados, UMA linha de 32px (o lugar não muda):
 *   sem a API (Safari/Firefox)  -> só a frase do porquê (o arrastar ao lado continua);
 *   sem pasta guardada          -> "Usar a pasta Downloads" (abre o seletor do navegador);
 *   permissão expirada          -> "Permitir acesso à pasta Downloads" (requestPermission SÓ no clique, nunca em silêncio);
 *   pasta ok                    -> os relatórios achados (nome, data, tamanho), que já vão para a comparação.
 * Quem escolhe os arquivos é `escolherRelatorios` (puro); quem lê o arquivo é o modal, pelo leitor de sempre.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { escolherRelatorios, fraseDaFalta, fraseDosVelhos, textoDoTamanho } from '@/v2/lib/lucroRural/pastaLr';
import type { FontePastaLr, PastaLr } from '@/v2/lib/lucroRural/pastaDownloads';

export const FRASE_SEM_API = 'Este navegador não deixa ler a pasta (só Chrome e Edge): arraste os dois relatórios.';

type Estado =
  | { tipo: 'verificando' } | { tipo: 'sem_api' } | { tipo: 'sem_pasta'; recado?: string }
  | { tipo: 'expirada'; pasta: PastaLr; recado?: string } | { tipo: 'guardada'; pasta: PastaLr } | { tipo: 'lendo'; pasta: PastaLr }
  | { tipo: 'achados'; pasta: PastaLr; arquivos: File[]; falta: string | null; velho: string | null };

const fmtData = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

export interface PastaDownloadsLrProps {
  fonte: FontePastaLr;
  /** Ler a pasta ao montar (falso depois de "trocar arquivos"). */
  auto: boolean;
  /** Os relatórios achados; `completos` = os dois; `aviso` = a frase da data velha. */
  onAchados: (arquivos: File[], completos: boolean, aviso: string | null) => void;
  onEsquecida?: () => void;
}

export function PastaDownloadsLr({ fonte, auto, onAchados, onEsquecida }: PastaDownloadsLrProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: fonte.disponivel ? 'verificando' : 'sem_api' });
  const montou = useRef(false);

  const ler = useCallback(async (pasta: PastaLr) => {
    if ((await pasta.permissao(false)) !== 'granted') { setEstado({ tipo: 'expirada', pasta }); return; }
    setEstado({ tipo: 'lendo', pasta });
    let lista: File[] = [];
    try { lista = await pasta.listarRelatorios(); } catch { setEstado({ tipo: 'expirada', pasta, recado: 'não foi possível ler a pasta' }); return; }
    const e = escolherRelatorios(lista.map(f => ({ nome: f.name, lastModified: f.lastModified, tamanho: f.size, f })), hojeLocal());
    const arquivos = [e.pagar, e.receber].flatMap(x => (x ? [x.f] : []));
    const velho = fraseDosVelhos(e.velhos);
    setEstado({ tipo: 'achados', pasta, arquivos, falta: fraseDaFalta(e.faltam), velho });
    if (arquivos.length > 0) onAchados(arquivos, e.faltam.length === 0, velho);
  }, [onAchados]);

  useEffect(() => {
    if (montou.current || !fonte.disponivel) return;
    montou.current = true;
    void fonte.lerGuardada().then(p => {
      if (!p) { setEstado({ tipo: 'sem_pasta' }); return; }
      if (auto) void ler(p); else setEstado({ tipo: 'guardada', pasta: p });
    });
  }, [fonte, auto, ler]);

  const autorizar = async () => {
    const p = await fonte.escolher();
    if (!p) { setEstado({ tipo: 'sem_pasta', recado: 'nenhuma pasta escolhida' }); return; }
    const guardou = await fonte.guardar(p);
    await ler(p);
    if (!guardou) setEstado(s => (s.tipo === 'achados' ? { ...s, velho: [s.velho, 'o navegador não guardou a pasta: vai pedir de novo'].filter(Boolean).join(' · ') } : s));
  };
  const permitir = async (pasta: PastaLr) => {
    if ((await pasta.permissao(true)) === 'granted') { await ler(pasta); return; }
    setEstado({ tipo: 'expirada', pasta, recado: 'acesso não permitido' });
  };
  const esquecer = async () => { await fonte.esquecer(); setEstado({ tipo: 'sem_pasta' }); onEsquecida?.(); };

  const linkEsquecer = <button type="button" className="shrink-0 text-[10px] text-primary underline" data-testid="esquecer-pasta" onClick={() => void esquecer()}>esquecer pasta</button>;

  return (
    <div className="flex h-8 w-[520px] items-center gap-2 text-[10px]" data-testid="pasta-downloads" data-estado={estado.tipo}>
      {estado.tipo === 'sem_api' && <span className="truncate text-muted-foreground" title={FRASE_SEM_API}>{FRASE_SEM_API}</span>}
      {estado.tipo === 'verificando' && <span className="text-muted-foreground">Procurando a pasta Downloads…</span>}
      {estado.tipo === 'sem_pasta' && (<>
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]" data-testid="usar-pasta" onClick={() => void autorizar()}>Usar a pasta Downloads</Button>
        <span className="truncate text-muted-foreground">{estado.recado ?? 'autorize uma vez: depois os dois relatórios mais novos entram sozinhos'}</span>
      </>)}
      {estado.tipo === 'expirada' && (<>
        <Button size="sm" className="h-7 shrink-0 px-2 text-[11px]" data-testid="permitir-pasta" onClick={() => void permitir(estado.pasta)}>Permitir acesso à pasta Downloads</Button>
        <span className="truncate text-muted-foreground">{estado.recado ?? 'o navegador pede para confirmar o acesso'}</span>
        {linkEsquecer}
      </>)}
      {estado.tipo === 'guardada' && (<>
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]" data-testid="ler-pasta" onClick={() => void ler(estado.pasta)}>Ler a pasta Downloads de novo</Button>
        <span className="truncate text-muted-foreground">ou arraste os relatórios</span>
        {linkEsquecer}
      </>)}
      {estado.tipo === 'lendo' && <span className="text-muted-foreground">Lendo a pasta {estado.pasta.nome}…</span>}
      {estado.tipo === 'achados' && (<>
        {estado.arquivos.map(f => (
          <span key={f.name} className="max-w-[230px] shrink truncate rounded border border-[#86efac] bg-[#f0fdf4] px-1.5 py-0.5" data-testid="arquivo-da-pasta"
            title={`${f.name} · ${fmtData(f.lastModified)} · ${textoDoTamanho(f.size)}`}>
            {f.name} · {fmtData(f.lastModified)} · {textoDoTamanho(f.size)}
          </span>
        ))}
        {(estado.falta || estado.velho) && (
          <span className="min-w-0 truncate text-[#b45309]" data-testid="aviso-da-pasta" title={[estado.falta, estado.velho].filter(Boolean).join(' · ')}>
            {[estado.falta, estado.velho].filter(Boolean).join(' · ')}
          </span>
        )}
        {linkEsquecer}
      </>)}
    </div>
  );
}
