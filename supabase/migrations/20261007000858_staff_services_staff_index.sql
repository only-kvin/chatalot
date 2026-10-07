-- Covers the (tenant_id, staff_id) foreign key, so removing a staff member
-- doesn't scan every staff/service link.
create index staff_services_tenant_staff_idx on public.staff_services (tenant_id, staff_id);
