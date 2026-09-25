-- A contact number on public contact-form messages (owner ask, 2026-09-25).
--
-- Nullable so the rows sent before this change stay valid, and so the column
-- can be added while the OLD code is still running. New messages always carry one:
-- the form and ContactSchema (src/lib/validation/contact.ts) require exactly
-- 10 digits. The check stops anything else from being stored.
alter table public.contact_messages
  add column if not exists phone text
    constraint contact_messages_phone_format check (phone is null or phone ~ '^[0-9]{10}$');

comment on column public.contact_messages.phone is
  'Sender''s 10-digit contact number. Null on messages sent before 2026-09-25.';
