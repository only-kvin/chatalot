-- Extensions
create extension if not exists vector with schema extensions;

-- Non-exposed schema for RLS helper functions (never reachable via PostgREST)
create schema if not exists private;
