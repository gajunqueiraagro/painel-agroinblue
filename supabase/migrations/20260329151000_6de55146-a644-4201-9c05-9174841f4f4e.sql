
-- Fix security: set security_invoker on all views
ALTER VIEW public.vw_financeiro_fluxo_caixa_mensal SET (security_invoker = on);
ALTER VIEW public.vw_financeiro_dashboard_mensal SET (security_invoker = on);
ALTER VIEW public.vw_financeiro_auditoria_competencia_caixa SET (security_invoker = on);
ALTER VIEW public.vw_financeiro_desembolso_centro SET (security_invoker = on);
