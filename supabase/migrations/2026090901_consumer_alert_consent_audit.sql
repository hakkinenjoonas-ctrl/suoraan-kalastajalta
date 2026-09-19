-- Record consumer marketing consent and withdrawal so that consent can be
-- demonstrated and withdrawn as easily as it is given.
alter table public.consumer_alert_subscriptions
  add column if not exists consent_text_version text not null default '2026-09-09',
  add column if not exists consented_at timestamptz not null default now(),
  add column if not exists withdrawn_at timestamptz;

update public.consumer_alert_subscriptions
set consented_at = coalesce(created_at, now()),
    consent_text_version = 'pre-2026-09-09'
where consent_text_version = '2026-09-09'
  and created_at < timestamptz '2026-09-09 00:00:00+03';

