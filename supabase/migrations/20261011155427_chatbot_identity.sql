-- The chatbot's own identity in the website chat: a name ("Lindi") and an
-- uploaded icon. The icon reuses widget_settings.avatar_url (until now a
-- pasted link); uploads go to a public bucket, because the widget shows the
-- icon on business websites.

alter table public.widget_settings
  add column assistant_name text
    check (assistant_name is null or char_length(btrim(assistant_name)) between 1 and 40),
  -- Show the icon on the round chat button too, instead of the speech bubble.
  add column icon_on_launcher boolean not null default true;

-- Files under <tenant_id>/. Uploads and deletes go through the dashboard's
-- server actions with the service role, after checking the signed-in user's
-- business (as for staff photos), so there are no storage policies for users.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('widget-icons', 'widget-icons', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);
