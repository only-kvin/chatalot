-- create_booking()/reschedule_booking() call private.overlapping_bookings();
-- the service-role backend (AI, widgets) needs to reach it. Function-level
-- grants still decide what it may run.
grant usage on schema private to service_role;
