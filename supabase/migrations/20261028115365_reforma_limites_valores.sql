-- REFORMA-TELAS-01 · 20261028115365 — os VALORES dos limites fiscais (catálogo global `fiscal_limites`, da 115340), cada um com a norma.
-- Nenhum desses números vive no código: as telas leem daqui (sem linha = "pendente"/"a publicar"). Mudança futura (IPCA, nova norma)
-- = nova versão pela fn_fiscal_limite_gravar (só admin; a anterior fica substituída). Depende da 115340.
-- O crédito presumido de 2027 NÃO entra: o governo ainda não publicou (a tela mostra "a publicar").
set local lock_timeout = '2s';

do $$
begin
  if exists (select 1 from public.fiscal_limites where substituida_em is null
              and (ano, chave) in ((2025, 'lcdpr_obrigatorio'), (2026, 'lcdpr_obrigatorio'), (2027, 'lcdpr_obrigatorio'),
                                   (2027, 'ibs_cbs_nao_contribuinte'), (2027, 'ibs_cbs_excesso_pct'), (2025, 'aviso_perto_pct'))) then
    raise exception 'REFORMA 115365: já há limite vivo para um destes anos/chaves; use a fn_fiscal_limite_gravar.';
  end if;
  insert into public.fiscal_limites (ano, chave, valor, descricao, fonte) values
    (2025, 'lcdpr_obrigatorio', 4800000.00, 'Receita bruta da atividade rural acima da qual o LCDPR é obrigatório',
           'IN RFB 1.848/2018 (LCDPR): receita bruta acima de R$ 4.800.000,00 no ano-calendário'),
    (2026, 'lcdpr_obrigatorio', 4800000.00, 'Receita bruta da atividade rural acima da qual o LCDPR é obrigatório',
           'IN RFB 1.848/2018 (LCDPR): receita bruta acima de R$ 4.800.000,00 no ano-calendário'),
    (2027, 'lcdpr_obrigatorio', 4800000.00, 'Receita bruta da atividade rural acima da qual o LCDPR é obrigatório',
           'IN RFB 1.848/2018 (LCDPR): receita bruta acima de R$ 4.800.000,00 no ano-calendário (a reforma não muda)'),
    (2027, 'ibs_cbs_nao_contribuinte', 3600000.00, 'Receita do ano anterior até a qual o produtor rural pode ficar não contribuinte do IBS/CBS',
           'LC 214/2025, art. 164 (produtor rural não contribuinte; valor atualizado anualmente pelo IPCA)'),
    (2027, 'ibs_cbs_excesso_pct', 20.00, 'Excesso sobre o limite (em %) até o qual a mudança só vale no ano seguinte',
           'LC 214/2025, art. 164 (excesso de até 20%: efeito no ano seguinte; acima: a partir do 2º mês seguinte)'),
    (2025, 'aviso_perto_pct', 20.00, 'Aviso "perto do limite": a menos deste % do limite',
           'Regra do painel AgroinBlue (Gabriel 14/11/2026): perto = a menos de 20% do limite');
end $$;
