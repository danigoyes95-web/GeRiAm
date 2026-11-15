-- GeRiAm · 0008 · Escenario de simulacro "rotura" (rotura de una o varias presas)
alter table geriam.drill_runs drop constraint if exists drill_runs_scenario_check;
alter table geriam.drill_runs
  add constraint drill_runs_scenario_check check (scenario in ('tormenta', 'estructural', 'comunicacion', 'rotura'));
