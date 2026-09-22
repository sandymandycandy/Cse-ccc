-- The event's group-chat invite, handed to a student the moment they register.
--
-- Additive and nullable on purpose, so it can be applied while the OLD code is
-- still serving: an event without one behaves exactly as every event does today
-- — no pop-up after registering, and the confirmation email keeps the event
-- page on its button.
--
-- The https check is a second line of defence, not the only one. isGroupLink()
-- in src/lib/registration/whatsapp.ts is what the admin form validates against,
-- and what the API and the email re-check before rendering the value into an
-- href. The constraint is here so a value written by any other route — the SQL
-- console, a script, a future importer — still cannot become a `javascript:`
-- link on a public page.
--
-- No index: the column is only ever read alongside the event row it belongs to.
alter table public.events
  add column if not exists whatsapp_url text
    constraint events_whatsapp_url_https check (
      whatsapp_url is null
      or (whatsapp_url like 'https://%' and length(whatsapp_url) <= 300)
    );

comment on column public.events.whatsapp_url is
  'Group-chat invite shown to a registrant after they register, and mailed in their confirmation. Never exposed on the public event page — an invite link is a bearer token.';
