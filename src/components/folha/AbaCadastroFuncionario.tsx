/**
 * FOLHA-FUNC-CADASTRO-01 (Gabriel 25/11/2026 09:06, mock aprovado `folha-funcionario-cadastro-ref`) — a aba Cadastro do funcionário em
 * blocos com selo (Completa / o que falta, âmbar): Dados pessoais · Contrato · Documentos · Contato e endereço · Pagamento (inteiro).
 * ⚠ SÓ APRESENTAÇÃO: o estado e o gravar são do `FuncionarioDialog` (o Salvar do rodapé grava o funcionário E o favorecido).
 * ⚠ Pagamento e contato moram no FAVORECIDO (fonte única, o mesmo cadastro do Financeiro): aqui se editam, lá se gravam.
 * ⚠ Régua de fontes nova (UI-FONTES-REGUA-01) pelos tokens de `ui/regua-fontes`; seletor com a largura do maior nome da lista.
 */
import type { CSSProperties } from 'react';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { BlocoFormulario, Rotulo, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import { ALTURA_CONTROLE, CAMPO_DATA, CONTROLE, FONTE_CONTROLE, LARGURA_CAMPO_DATA, LARGURA_DATA_PX, QUADRADO_CONTROLE, TEXTO_ROTULO, larguraDoSeletor } from '@/components/ui/regua-fontes';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { cn } from '@/lib/utils';
import { VINCULOS, type FormFuncionario } from '@/lib/folha/folhaTela';
import {
  CNH_CATEGORIAS, DIAS_DE_PAGAMENTO, ESTADOS_CIVIS, FORMAS_DA_FICHA, JORNADAS, SEXOS, TIPOS_CHAVE_PIX, TIPOS_CONTA, seloDoBloco, titularDaConta,
  type Bloco, type FormExtras, type FormFavorecido,
} from '@/lib/folha/fichaCadastro';

const op = (xs: ReadonlyArray<{ valor: string; rotulo: string }>) => xs.map(x => ({ value: x.valor, label: x.rotulo }));
const opTexto = (xs: ReadonlyArray<string>) => xs.map(x => ({ value: x, label: x }));
const OP_VINCULO = op(VINCULOS); const OP_SEXO = op(SEXOS); const OP_ESTADO = op(ESTADOS_CIVIS); const OP_JORNADA = op(JORNADAS);
const OP_DIA = op(DIAS_DE_PAGAMENTO); const OP_CNH = opTexto(CNH_CATEGORIAS); const OP_CHAVE = opTexto(TIPOS_CHAVE_PIX); const OP_CONTA = opTexto(TIPOS_CONTA);
const L = (nomes: string[]) => larguraDoSeletor(nomes);

function Selo({ falta, testid }: { falta: readonly string[]; testid: string }) {
  const ok = falta.length === 0;
  return (
    <span data-testid={testid} title={seloDoBloco(falta)}
      className={cn('whitespace-nowrap rounded-full border px-1.5 font-semibold leading-[15px]', TEXTO_ROTULO,
        ok ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-800')}>
      {seloDoBloco(falta)}
    </span>
  );
}
const grade = (colunas: string): CSSProperties => ({ gridTemplateColumns: colunas });

export function AbaCadastroFuncionario({
  form, set, erros, extras, setExtra, fav, setFav, faltas, clienteId, opFazendas, favorecidoNome,
}: {
  form: FormFuncionario; set: <K extends keyof FormFuncionario>(k: K, v: FormFuncionario[K]) => void; erros: Partial<Record<keyof FormFuncionario, string>>;
  extras: FormExtras; setExtra: <K extends keyof FormExtras>(k: K, v: FormExtras[K]) => void;
  fav: FormFavorecido; setFav: <K extends keyof FormFavorecido>(k: K, v: FormFavorecido[K]) => void;
  faltas: Record<Bloco, string[]>; clienteId: string; opFazendas: Array<{ value: string; label: string; title?: string }>; favorecidoNome: string | null;
}) {
  const temFav = !!form.favorecido_id;
  const titular = titularDaConta(form.cpf, fav.cpf_cnpj_pagamento);
  const w = {
    sexo: L(['sexo', ...SEXOS.map(s => s.rotulo)]), estado: L(['estado civil', ...ESTADOS_CIVIS.map(s => s.rotulo)]),
    vinculo: L(['vínculo', ...VINCULOS.map(s => s.rotulo)]), jornada: L(['jornada', ...JORNADAS.map(s => s.rotulo)]),
    fazenda: L(['fazenda', ...opFazendas.map(o => o.label)]), cnh: L(['cat.', ...CNH_CATEGORIAS]), dia: L(['dia', ...DIAS_DE_PAGAMENTO.map(d => d.rotulo)]),
    chave: L(['tipo', ...TIPOS_CHAVE_PIX]), conta: L(['tipo', ...TIPOS_CONTA]),
  };
  const amb = (vazio: boolean) => vazio && 'border-amber-300 bg-amber-50/60';
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1.5 overflow-y-auto" data-testid="funcionario-cadastro-blocos">
      <BlocoFormulario titulo="Dados pessoais" acao={<Selo falta={faltas.pessoais} testid="selo-pessoais" />}>
        <div className={GRADE_FORMULARIO} style={grade('minmax(0,1fr) 130px')}>
          <div><Rotulo texto="Nome completo" obrig /><Input value={form.nome} onChange={e => set('nome', e.target.value)} className={cn(CONTROLE, erros.nome && 'border-destructive')} data-testid="funcionario-nome" /></div>
          <div><Rotulo texto="CPF" /><Input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" className={cn(CONTROLE, 'tabular-nums', amb(!form.cpf), erros.cpf && 'border-destructive')} data-testid="funcionario-cpf" /></div>
        </div>
        <div className={cn(GRADE_FORMULARIO, 'mt-1')} style={grade(`${LARGURA_DATA_PX}px ${w.sexo}px ${w.estado}px minmax(0,1fr)`)}>
          <div className={LARGURA_CAMPO_DATA}><Rotulo texto="Nascimento" /><DatePicker value={form.nascimento} onChange={v => set('nascimento', v ?? '')} className={CAMPO_DATA} /></div>
          <div><Rotulo texto="Sexo" /><SearchableSelect value={extras.sexo} onValueChange={v => setExtra('sexo', v)} semTodos allLabel="sexo" allValue="" options={OP_SEXO} triggerClassName={CONTROLE} /></div>
          <div><Rotulo texto="Estado civil" /><SearchableSelect value={extras.estado_civil} onValueChange={v => setExtra('estado_civil', v)} semTodos allLabel="estado civil" allValue="" options={OP_ESTADO} triggerClassName={CONTROLE} /></div>
          <div><Rotulo texto="Dependentes" /><Input value={extras.dependentes} onChange={e => setExtra('dependentes', e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={cn(CONTROLE, 'tabular-nums')} data-testid="funcionario-dependentes" /></div>
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Contrato" acao={<Selo falta={faltas.contrato} testid="selo-contrato" />}>
        <div className={GRADE_FORMULARIO} style={grade(`${w.vinculo}px ${LARGURA_DATA_PX}px minmax(0,1fr) 80px`)}>
          <div><Rotulo texto="Vínculo" obrig /><SearchableSelect value={form.vinculo} onValueChange={v => set('vinculo', v)} semTodos allLabel="vínculo" allValue="" options={OP_VINCULO} triggerClassName={CONTROLE} /></div>
          <div className={LARGURA_CAMPO_DATA}><Rotulo texto="Admissão" obrig /><DatePicker value={form.admissao} onChange={v => set('admissao', v ?? '')} className={cn(CAMPO_DATA, amb(!form.admissao))} /></div>
          <div><Rotulo texto="Cargo" /><Input value={form.cargo} onChange={e => set('cargo', e.target.value)} className={cn(CONTROLE, amb(!form.cargo))} /></div>
          <div><Rotulo texto="CBO" /><Input value={form.cbo} onChange={e => set('cbo', e.target.value)} className={cn(CONTROLE, 'tabular-nums')} /></div>
        </div>
        <div className={cn(GRADE_FORMULARIO, 'mt-1')} style={grade(`${w.jornada}px ${w.fazenda}px minmax(0,1fr) ${LARGURA_DATA_PX}px`)}>
          <div><Rotulo texto="Jornada" /><SearchableSelect value={extras.jornada} onValueChange={v => setExtra('jornada', v)} semTodos allLabel="jornada" allValue="" options={OP_JORNADA} triggerClassName={CONTROLE} /></div>
          <div title={form.empregador_registro ? `registro do empregador: ${form.empregador_registro}` : undefined}>
            <Rotulo texto="Registro (fazenda)" /><SearchableSelect value={extras.fazenda_registro_id} onValueChange={v => setExtra('fazenda_registro_id', v)} semTodos allLabel="fazenda" allValue="" options={opFazendas} triggerClassName={CONTROLE} />
          </div>
          <div><Rotulo texto="Código no contador" /><Input value={form.codigo_contador} onChange={e => set('codigo_contador', e.target.value)} className={cn(CONTROLE, 'tabular-nums')} /></div>
          <div className={LARGURA_CAMPO_DATA}><Rotulo texto="Experiência até" /><DatePicker value={extras.experiencia_ate} onChange={v => setExtra('experiencia_ate', v ?? '')} className={CAMPO_DATA} /></div>
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Documentos" acao={<Selo falta={faltas.documentos} testid="selo-documentos" />}>
        <div className={GRADE_FORMULARIO} style={grade('minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)')}>
          <div><Rotulo texto="RG" /><Input value={extras.rg} onChange={e => setExtra('rg', e.target.value)} placeholder="nº e órgão" className={cn(CONTROLE, amb(!extras.rg))} /></div>
          <div><Rotulo texto="PIS/NIS" /><Input value={form.pis} onChange={e => set('pis', e.target.value)} className={cn(CONTROLE, 'tabular-nums', amb(!form.pis), erros.pis && 'border-destructive')} data-testid="funcionario-pis" /></div>
          <div><Rotulo texto="CTPS (nº/série)" /><Input value={form.ctps} onChange={e => set('ctps', e.target.value)} className={cn(CONTROLE, amb(!form.ctps))} /></div>
        </div>
        <div className={cn(GRADE_FORMULARIO, 'mt-1')} style={grade(`${w.cnh}px ${LARGURA_DATA_PX}px minmax(0,1fr)`)}>
          <div><Rotulo texto="CNH (cat.)" /><SearchableSelect value={extras.cnh_categoria} onValueChange={v => setExtra('cnh_categoria', v)} semTodos allLabel="cat." allValue="" options={OP_CNH} triggerClassName={CONTROLE} /></div>
          <div className={LARGURA_CAMPO_DATA}><Rotulo texto="CNH (validade)" /><DatePicker value={extras.cnh_validade} onChange={v => setExtra('cnh_validade', v ?? '')} className={CAMPO_DATA} /></div>
          <div />
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Contato e endereço" dica={temFav ? undefined : 'escolha o favorecido no Pagamento'} acao={<Selo falta={faltas.contato} testid="selo-contato" />}>
        <div className={GRADE_FORMULARIO} style={grade('minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)')}>
          <div><Rotulo texto="Celular / WhatsApp" /><Input value={fav.celular} onChange={e => setFav('celular', e.target.value)} disabled={!temFav} className={cn(CONTROLE, 'tabular-nums', temFav && amb(!fav.celular))} data-testid="funcionario-celular" /></div>
          <div><Rotulo texto="E-mail" /><Input value={fav.email} onChange={e => setFav('email', e.target.value)} disabled={!temFav} className={CONTROLE} /></div>
          <div><Rotulo texto="Contato de emergência" /><Input value={extras.contato_emergencia} onChange={e => setExtra('contato_emergencia', e.target.value)} placeholder="nome · telefone" className={CONTROLE} /></div>
        </div>
        <div className={cn(GRADE_FORMULARIO, 'mt-1')} style={grade('minmax(0,1fr) 96px')}>
          <div><Rotulo texto="Endereço" /><Input value={fav.logradouro} onChange={e => setFav('logradouro', e.target.value)} disabled={!temFav} className={cn(CONTROLE, temFav && amb(!fav.logradouro))} data-testid="funcionario-endereco" /></div>
          <div><Rotulo texto="CEP" /><Input value={fav.cep} onChange={e => setFav('cep', e.target.value)} disabled={!temFav} placeholder="00000-000" className={cn(CONTROLE, 'tabular-nums')} /></div>
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Pagamento" className="col-span-2" testId="funcionario-bloco-pagamento"
        dica={temFav ? `usado nos lançamentos da folha; grava no favorecido ${favorecidoNome ?? ''} (o mesmo cadastro do Financeiro)` : 'escolha o favorecido: pagamento e contato moram nele'}
        acao={<Selo falta={faltas.pagamento} testid="selo-pagamento" />}>
        <div className={GRADE_FORMULARIO} style={grade(`minmax(0,1fr) 190px ${w.chave}px minmax(0,1fr) ${w.dia}px`)}>
          <div><Rotulo texto="Favorecido" obrig />
            <FavorecidoSelect value={form.favorecido_id} onChange={id => set('favorecido_id', id)} clienteId={clienteId} triggerClassName={CONTROLE} novoButtonClassName={QUADRADO_CONTROLE} /></div>
          <div><Rotulo texto="Forma padrão" />
            <Segmentado altura={ALTURA_CONTROLE} fonte={FONTE_CONTROLE} valor={fav.tipo_recebimento} onEscolher={v => setFav('tipo_recebimento', v)}
              opcoes={FORMAS_DA_FICHA.map(f => ({ valor: f.valor, rotulo: f.rotulo, desabilitada: !temFav }))} /></div>
          <div><Rotulo texto="Tipo da chave Pix" /><SearchableSelect value={fav.pix_tipo_chave} onValueChange={v => setFav('pix_tipo_chave', v)} semTodos allLabel="tipo" allValue="" options={OP_CHAVE} triggerClassName={CONTROLE} disabled={!temFav} /></div>
          <div><Rotulo texto="Chave Pix" /><Input value={fav.pix_chave} onChange={e => setFav('pix_chave', e.target.value)} disabled={!temFav} className={CONTROLE} data-testid="funcionario-pix" /></div>
          <div><Rotulo texto="Dia do pagamento" /><SearchableSelect value={extras.dia} onValueChange={v => setExtra('dia', v)} semTodos allLabel="dia" allValue="" options={OP_DIA} triggerClassName={CONTROLE} /></div>
        </div>
        <div className={cn(GRADE_FORMULARIO, 'mt-1')} style={grade(`minmax(0,1fr) 90px minmax(0,1fr) ${w.conta}px 130px minmax(0,1fr)`)}>
          <div><Rotulo texto="Banco" /><Input value={fav.banco} onChange={e => setFav('banco', e.target.value)} disabled={!temFav} className={CONTROLE} data-testid="funcionario-banco" /></div>
          <div><Rotulo texto="Agência" /><Input value={fav.agencia} onChange={e => setFav('agencia', e.target.value)} disabled={!temFav} className={cn(CONTROLE, 'tabular-nums')} /></div>
          <div><Rotulo texto="Conta" /><Input value={fav.conta} onChange={e => setFav('conta', e.target.value)} disabled={!temFav} className={cn(CONTROLE, 'tabular-nums')} /></div>
          <div><Rotulo texto="Tipo da conta" /><SearchableSelect value={fav.tipo_conta} onValueChange={v => setFav('tipo_conta', v)} semTodos allLabel="tipo" allValue="" options={OP_CONTA} triggerClassName={CONTROLE} disabled={!temFav} /></div>
          <div><Rotulo texto="CPF do titular da conta" /><Input value={fav.cpf_cnpj_pagamento} onChange={e => setFav('cpf_cnpj_pagamento', e.target.value)} disabled={!temFav} placeholder="000.000.000-00" className={cn(CONTROLE, 'tabular-nums')} data-testid="funcionario-titular" /></div>
          <div className="flex items-end pb-[5px]">
            <span data-testid="funcionario-titular-confere" className={cn('whitespace-nowrap', TEXTO_ROTULO, titular === 'proprio' ? 'text-emerald-700' : titular === 'outro' ? 'text-amber-800' : 'text-muted-foreground')}>
              {titular === 'proprio' ? '✓ a conta é do próprio funcionário' : titular === 'outro' ? 'conta de outra pessoa (o lançamento avisa)' : 'confere o CPF ao informar a conta'}
            </span>
          </div>
        </div>
        <p className={cn('mt-1 whitespace-nowrap text-muted-foreground', TEXTO_ROTULO)}>
          Pagar na conta do próprio funcionário vale como recibo (art. 464 da CLT).
        </p>
      </BlocoFormulario>
    </div>
  );
}
