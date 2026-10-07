-- Staff photos, shown to customers choosing who to book with in the
-- appointment widget. A public bucket (the widget shows them on business
-- websites), files under <tenant_id>/. Uploads and deletes go through the
-- dashboard's server actions with the service role, after checking the
-- signed-in user's business, so there are no storage policies for users.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);
