/**
 * MAPA-CRIAR-PIQUETES-01 (fatia 1) — a tela do "Criar piquetes" sobre o mapa da Validação (mock aprovado mock-criar-piquetes-v1):
 *   - a BARRA (2 linhas fixas, como a da edição — UI-ESPACO-RESERVADO): N iguais | Grade, quantas partes, girar as linhas; Cancelar e
 *     "Prévia e gravar" fixos à direita; na 2ª linha a área, quantas divisões e o aviso que trava a prévia;
 *   - a LISTA das divisões (régua da casa): o nome de cada uma (caso novo) ou "é a divisão…" do cadastro (o pai que já é grupo, o P6),
 *     a área pela fórmula do banco; clicar na área (ou na divisão no mapa) abre "Área desejada";
 *   - a PRÉVIA é a própria `fn_piquetes_criar` com simular (o mês, no caso novo; a frase do banco) — Gravar grava o gesto inteiro.
 */
import { Button } from '@/components/ui/button';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Segmentado } from '@/components/ui/segmentado';
import { TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { RotateCw } from 'lucide-react';
import { haDoBanco, membrosPorParecenca } from '@/lib/mapa/criarPiquetes';
import { mesesDeInicio } from '@/lib/mapa/piquetesEmEspera';
import { letraDaDivisao, type CriarPiquetes } from '@/hooks/useCriarPiquetes';
import { cn } from '@/lib/utils';

const TXT = 'text-[9.5px]';
const haBr = (ha: number) => haDoBanco(ha).toFixed(2).replace('.', ',');
const inteiroEntre = (n: number | null, min: number, max: number, atual: number) => (n == null ? atual : Math.min(max, Math.max(min, Math.round(n))));

export function CriarPiquetesNoMapa({ piq }: { piq: CriarPiquetes }) {
  if (!piq.aberto || !piq.pai) return null;
  const n = piq.divisoes.length;
  const media = n ? piq.divisoes.reduce((s, d) => s + d.areaHa, 0) / n : 0;
  const aviso = piq.erro ?? piq.motivo;
  const avisoVermelho = !!piq.erro || (!!piq.motivo && piq.grupo.estado !== 'lendo');
  const escolhida = piq.escolhida != null ? piq.divisoes[piq.escolhida] : null;

  return (
    <div className="contents" data-testid="piquetes-tela">
      <div className="absolute left-3 right-3 top-2 z-20 rounded-md border border-border bg-card/95 px-2 py-1 shadow-md backdrop-blur-sm" data-testid="barra-piquetes">
        {/* 1ª linha: [o gesto e quantas partes] [FIXO: Cancelar · Prévia e gravar] */}
        <div className="flex h-[22px] items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" data-testid="piquetes-zona">
            <p className={`flex-none whitespace-nowrap font-semibold text-foreground ${TXT}`}
              title="As linhas da grade ficam paralelas ao lado mais longo do pasto (Girar troca); as áreas são iguais pela fórmula do banco.">
              Criar piquetes <span className="font-normal text-muted-foreground">{piq.pai.nome}</span>
            </p>
            <Segmentado altura={20} fonte={9.5} valor={piq.modo} onEscolher={piq.setModo}
              opcoes={[{ valor: 'iguais', rotulo: 'N iguais' }, { valor: 'grade', rotulo: 'Grade' }]} />
            {piq.modo === 'grade' ? (
              <span className={`flex flex-none items-center gap-1 whitespace-nowrap ${TXT}`} data-testid="piquetes-grade">
                <CampoNumeroComConta valor={piq.linhas} casas={0} className="h-5 w-[34px] px-1 text-center text-[9.5px]" title="Faixas (no comprido)"
                  onChange={v => piq.setLinhas(inteiroEntre(v, 1, 7, piq.linhas))} />
                ×
                <CampoNumeroComConta valor={piq.colunas} casas={0} className="h-5 w-[34px] px-1 text-center text-[9.5px]" title="Divisões em cada faixa (no atravessado)"
                  onChange={v => piq.setColunas(inteiroEntre(v, 1, 7, piq.colunas))} />
                = {n}
              </span>
            ) : (
              <span className={`flex flex-none items-center gap-1 whitespace-nowrap ${TXT}`} data-testid="piquetes-iguais">
                <CampoNumeroComConta valor={piq.colunas} casas={0} className="h-5 w-[38px] px-1 text-center text-[9.5px]" title="Quantas partes iguais"
                  onChange={v => piq.setColunas(inteiroEntre(v, 2, 49, piq.colunas))} />
                partes
              </span>
            )}
            <Button variant="ghost" size="sm" className={`h-5 flex-none gap-1 px-1.5 ${TXT}`} onClick={() => piq.setGirado(!piq.girado)}
              title="Girar as linhas 90° (paralelas ao outro lado)" data-testid="piquetes-girar">
              <RotateCw className="h-3 w-3" />Girar
            </Button>
          </div>
          <div className="flex flex-none items-center gap-1.5" data-testid="piquetes-fixos">
            <Button variant="outline" size="sm" className={`h-5 flex-none px-2 ${TXT}`} onClick={piq.fechar} data-testid="piquetes-cancelar">Cancelar</Button>
            <Button size="sm" className={`h-5 w-[86px] flex-none px-0 ${TXT}`} disabled={!!piq.motivo || piq.conferindo}
              onClick={() => void piq.prever()} title={piq.motivo ?? undefined} data-testid="piquetes-previa">
              {piq.conferindo ? 'Conferindo…' : 'Prévia e gravar'}
            </Button>
          </div>
        </div>
        {/* 2ª linha: a área, quantas divisões · o aviso (ou a dica) */}
        <div className={`flex h-[18px] items-center gap-3 tabular-nums ${TXT}`} data-testid="piquetes-linha-2">
          <span className="flex-none whitespace-nowrap font-semibold text-foreground" data-testid="piquetes-medidas">
            {piq.totalHa != null ? `${haBr(piq.totalHa)} ha` : '— ha'} · {n} {n === 1 ? 'divisão' : 'divisões'}{n ? ` de ${haBr(media)} ha em média` : ''}
          </span>
          <span className="min-w-0 flex-1" />
          {aviso ? (
            <span className={`flex-none whitespace-nowrap font-medium ${avisoVermelho ? 'text-red-600' : 'text-muted-foreground'}`} data-testid="piquetes-aviso">{aviso}</span>
          ) : (
            <span className="flex-none whitespace-nowrap text-muted-foreground">arraste ⭘ para deslizar uma linha · clique numa divisão para pedir a área</span>
          )}
          {piq.grupo.estado === 'erro' && (
            <Button variant="outline" size="sm" className={`h-4 flex-none px-1.5 ${TXT}`} onClick={piq.tentarGrupoDeNovo} data-testid="piquetes-tentar">Tentar de novo</Button>
          )}
        </div>
      </div>

      {/* a lista das divisões (à direita, abaixo da barra) */}
      <div className="absolute right-3 top-[64px] z-20 w-[250px] overflow-hidden rounded-md border border-border bg-card shadow-md" data-testid="piquetes-lista">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col className="w-[26px]" /><col /><col className="w-[64px]" /></colgroup>
          <thead className="bg-primary">
            <tr>
              <th className={cn(TH_REGUA, 'text-left')}>Div.</th>
              <th className={cn(TH_REGUA, 'text-left')}>{piq.existente ? 'É a divisão do cadastro' : 'Nome'}</th>
              <th className={cn(TH_REGUA, 'text-right')}>Área (ha)</th>
            </tr>
          </thead>
        </table>
        <div className="h-[160px] overflow-y-auto" data-testid="piquetes-lista-corpo">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col className="w-[26px]" /><col /><col className="w-[64px]" /></colgroup>
            <tbody>
              {piq.divisoes.map((d, i) => (
                <tr key={`${d.linha}-${d.coluna}`} className={cn('border-b border-border', piq.escolhida === i && 'bg-violet-50')} data-testid="piquetes-linha">
                  <td className={cn(TD_REGUA, 'font-semibold text-violet-700')}>{letraDaDivisao(i)}</td>
                  <td className={cn(TD_REGUA_TEXTO, 'py-[1px]')}>
                    {piq.existente ? (
                      <SearchableSelect dense semTodos triggerClassName="h-[17px] text-[10px]" value={piq.ligas[i] ?? ''} placeholder="escolha a divisão…"
                        onValueChange={v => piq.setLiga(i, v || null)}
                        options={membrosPorParecenca(piq.nomes[i] ?? '', piq.membrosSemDesenho).map(m => ({ value: m.id, label: m.nome }))} />
                    ) : (
                      <Input value={piq.nomes[i] ?? ''} onChange={ev => piq.setNome(i, ev.target.value)} className="h-[17px] px-1 text-[10px]"
                        title="Nome do pasto novo (a divisão)" data-testid="piquetes-nome" />
                    )}
                  </td>
                  <td className={TD_REGUA_NUM}>
                    <button type="button" className="tabular-nums text-[#2B6CB0]" onClick={() => piq.setEscolhida(i)} title="Pedir a área desta divisão">
                      {d.geojson ? haBr(d.areaHa) : '—'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col className="w-[26px]" /><col /><col className="w-[64px]" /></colgroup>
          <tfoot className="bg-primary text-primary-foreground">
            <tr className="h-[23px] text-[10px]">
              <td className="px-1" />
              <td className="px-1">Soma</td>
              <td className="px-1 text-right font-semibold tabular-nums" data-testid="piquetes-soma">{haBr(piq.divisoes.reduce((s, d) => s + d.areaHa, 0))}</td>
            </tr>
          </tfoot>
        </table>
        {/* a área desejada da divisão escolhida (as outras da faixa dividem o resto) */}
        <div className={`flex h-[26px] items-center gap-1.5 border-t border-border px-1.5 ${TXT}`} data-testid="piquetes-area-desejada">
          {escolhida && piq.escolhida != null ? (
            <>
              <span className="flex-none whitespace-nowrap font-semibold">Área de {letraDaDivisao(piq.escolhida)}:</span>
              <CampoNumeroComConta key={`${piq.escolhida}-${haBr(escolhida.areaHa)}`} valor={haDoBanco(escolhida.areaHa)} soAoSair sufixoDentro="ha"
                className="h-5 w-[84px] text-[10px]" onChange={v => piq.pedirArea(piq.escolhida ?? 0, v)} invalido={!!piq.avisoDaArea}
                title="A área que esta divisão deve ter; as outras da mesma faixa dividem o resto em partes iguais" />
            </>
          ) : (
            <span className="text-muted-foreground">Clique numa divisão para pedir a área dela.</span>
          )}
        </div>
        {piq.avisoDaArea && <p className={`px-1.5 pb-1 text-red-600 ${TXT}`} data-testid="piquetes-aviso-area">{piq.avisoDaArea}</p>}
      </div>

      <PreviaDoCriarPiquetes piq={piq} />
    </div>
  );
}

function PreviaDoCriarPiquetes({ piq }: { piq: CriarPiquetes }) {
  const p = piq.previa;
  const meses = mesesDeInicio(new Date());
  return (
    <Dialog open={!!p} onOpenChange={o => { if (!o) piq.setPrevia(null); }}>
      <DialogContent className="max-w-md" data-testid="piquetes-dialogo-previa">
        <DialogHeader>
          <DialogTitle className="text-sm">Prévia — criar piquetes de {piq.pai?.nome}</DialogTitle>
          <DialogDescription className="text-[11px]">Nada foi gravado ainda. Confira e grave.</DialogDescription>
        </DialogHeader>
        {p && (
          <div className="space-y-2 text-[11px]">
            {p.caso === 'novo' && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Os piquetes começam em</span>
                <Segmentado valor={piq.mes ?? meses[meses.length - 1].valor} altura={22} opcoes={meses.map(m => ({ valor: m.valor, rotulo: m.rotulo }))}
                  onEscolher={m => { piq.setMes(m); void piq.prever(m); }} />
              </div>
            )}
            <table className="w-full table-fixed border-collapse tabular-nums" data-testid="piquetes-previa-tabela">
              <colgroup><col /><col className="w-[110px]" /><col className="w-[70px]" /></colgroup>
              <thead className="bg-primary">
                <tr><th className={cn(TH_REGUA, 'text-left')}>Divisão</th><th className={cn(TH_REGUA, 'text-left')}>No cadastro</th><th className={cn(TH_REGUA, 'text-right')}>Área (ha)</th></tr>
              </thead>
              <tbody>
                {p.piquetes.map(x => (
                  <tr key={x.nome} className="border-b border-border">
                    <td className={TD_REGUA_TEXTO} title={x.nome}>{x.nome}</td>
                    <td className={TD_REGUA_TEXTO}>{x.liga === 'novo' ? 'pasto novo' : 'liga à existente'}</td>
                    <td className={TD_REGUA_NUM}>{haBr(x.areaHa)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-primary text-primary-foreground">
                <tr className="h-[23px] text-[10px]">
                  <td className="px-1">Soma · contorno {p.contornoHa != null ? haBr(p.contornoHa) : '—'}</td>
                  <td className="px-1" />
                  <td className="px-1 text-right font-semibold">{haBr(p.somaHa)}</td>
                </tr>
              </tfoot>
            </table>
            {p.frase && <p data-testid="piquetes-previa-frase">{p.frase}</p>}
            {p.semDesenho && <p className="font-medium text-amber-700">Continuam sem desenho: {p.semDesenho}</p>}
            <p className="text-muted-foreground">O contorno de {piq.pai?.nome} fica como está (é o contorno do grupo).</p>
            {piq.erro && <p className="font-medium text-red-600">{piq.erro}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => piq.setPrevia(null)}>Voltar</Button>
          <Button size="sm" disabled={piq.gravando || piq.conferindo} onClick={() => void piq.gravar()} data-testid="piquetes-gravar">
            {piq.gravando ? 'Gravando…' : 'Gravar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
