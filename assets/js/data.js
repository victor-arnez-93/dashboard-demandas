export const DEMANDS = [
  ["DEM-001","Revisar documentação do processo","Gerente A","Documentação","Alta","2026-07-02","2026-07-31","Em andamento",8],
  ["DEM-002","Validar indicadores do relatório mensal","Gerente B","Relatórios","Normal","2026-07-04","2026-07-26","Concluída",6],
  ["DEM-003","Atualizar fluxo de acompanhamento","Gerente C","Processos","Urgente","2026-07-07","2026-07-22","Atrasada",14],
  ["DEM-004","Consolidar solicitações do período","Gerente A","Atendimento","Normal","2026-07-09","2026-08-02","Pendente",5],
  ["DEM-005","Preparar material da reunião executiva","Gerente B","Apresentação","Alta","2026-07-10","2026-07-28","Concluída",7],
  ["DEM-006","Mapear pontos de melhoria operacional","Gerente C","Processos","Baixa","2026-07-12","2026-08-08","Em andamento",9],
  ["DEM-007","Organizar histórico de solicitações","Gerente A","Documentação","Normal","2026-07-14","2026-08-05","Pendente",5],
  ["DEM-008","Revisar prazos do backlog","Gerente B","Planejamento","Urgente","2026-07-16","2026-07-24","Atrasada",12],
  ["DEM-009","Padronizar categorias de demandas","Gerente C","Planejamento","Alta","2026-07-18","2026-08-10","Em andamento",8],
  ["DEM-010","Conferir dados do fechamento","Gerente A","Relatórios","Normal","2026-07-20","2026-07-29","Concluída",4],
  ["DEM-011","Estruturar pauta de acompanhamento","Gerente B","Apresentação","Baixa","2026-07-22","2026-08-15","Pendente",6],
  ["DEM-012","Documentar retorno das áreas envolvidas","Gerente C","Atendimento","Alta","2026-07-23","2026-08-04","Concluída",5],
].map(([id,title,manager,category,priority,startDate,dueDate,status,averageDays]) => ({
  id,title,manager,category,priority,startDate,dueDate,status,averageDays,
}));

export const PERIOD_DATA = {
  7: { labels:["23 Jul","24 Jul","25 Jul","26 Jul","27 Jul","28 Jul","29 Jul"], received:[3,5,4,7,5,8,6], completed:[2,4,5,4,6,7,5], multiplier:.46 },
  30: { labels:["1–5 Jul","6–10 Jul","11–15 Jul","16–20 Jul","21–25 Jul","26–29 Jul"], received:[16,22,19,26,24,29], completed:[12,18,21,20,25,27], multiplier:1 },
  90: { labels:["Mai — 1ª","Mai — 2ª","Jun — 1ª","Jun — 2ª","Jul — 1ª","Jul — 2ª"], received:[48,56,61,54,66,73], completed:[44,49,58,57,62,70], multiplier:2.55 },
};

export const STATUS_COLORS = {
  Pendente:"#ffad5c",
  "Em andamento":"#25a4ff",
  Concluída:"#2bc48a",
  Atrasada:"#ff647c",
};
