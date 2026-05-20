-- ---------------------------------------------------------------------------
-- Seed two public-facing health quiz forms used by the /health-quiz pages.
-- IDs are stable so the frontend can reference them without an extra lookup.
-- ---------------------------------------------------------------------------

INSERT INTO public.intake_forms (id, name, description, questions, active)
VALUES (
  'a1f0c0d0-0001-4000-8001-000000000001',
  'Women''s Hormone Health Quiz',
  'Public hormone-health questionnaire for women. Submitted from /health-quiz/women.',
  $$[
    {"id":"q1","label":"Sometimes my mood is low and things I used to be interested in no longer interest me.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q2","label":"I'm irritable (even if this is just around your period).","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q3","label":"I used to want to have sex, but now I'm just like, \"meh.\"","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q4","label":"I have tried exercise and eating healthy but I keep gaining weight.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q5","label":"I wake up sweating at night and sometimes have to change the sheets.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q6","label":"I have trouble falling and/or staying asleep.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q7","label":"My energy is low.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q8","label":"My brain feels \"foggy\" and I feel like I forget simple words.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q9","label":"My belly feels bloated.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q10","label":"I have heartburn or acid reflux.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]}
  ]$$::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  questions   = EXCLUDED.questions,
  active      = EXCLUDED.active,
  updated_at  = now();

INSERT INTO public.intake_forms (id, name, description, questions, active)
VALUES (
  'a1f0c0d0-0002-4000-8001-000000000002',
  'Men''s Hormone Health Quiz',
  'Public hormone-health questionnaire for men. Submitted from /health-quiz/men.',
  $$[
    {"id":"q1","label":"My mood is low and it is affecting my outlook on life.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q2","label":"I used to have a great sex drive, but now I'm sometimes embarrassed to admit that it has declined.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q3","label":"Morning erections have decreased.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q4","label":"I have tried exercise and eating healthy but I keep gaining weight.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q5","label":"My energy is like the \"meh\" emoji.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q6","label":"I feel like taking a nap in the afternoon.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q7","label":"My motivation or drive to do things is low.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q8","label":"Little things seem to set me off.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q9","label":"My belly feels bloated.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q10","label":"I am having trouble with regular bowel movements (too many, too loose, or less than one a day).","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q11","label":"I have heartburn or acid reflux.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]},
    {"id":"q12","label":"I just don't feel like myself.","type":"radio","required":true,"options":["0 - Not at all","1 - A bit","2 - Sometimes","3 - Frequently and bothersome","4 - All or most of the time"]}
  ]$$::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  questions   = EXCLUDED.questions,
  active      = EXCLUDED.active,
  updated_at  = now();
