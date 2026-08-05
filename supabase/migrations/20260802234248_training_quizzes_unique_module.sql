-- training_quizzes was created without a uniqueness constraint on module_id,
-- but the app treats "one quiz per module" as an invariant (upsertQuiz uses
-- on conflict (module_id), module player reads it via .maybeSingle()).
alter table public.training_quizzes
  add constraint training_quizzes_module_id_key unique (module_id);
