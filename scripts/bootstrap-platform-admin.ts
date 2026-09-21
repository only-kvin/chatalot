// One-off bootstrap: grants platform-admin rights to an existing Supabase Auth user.
// Can't be done through the app UI — there's no admin yet to gate the /admin page with.
// Usage: pnpm bootstrap-admin <email>
// (the user must have already signed in once via /login, so their auth.users row exists)

import { createAdminClient } from "../lib/db/supabase-admin";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm bootstrap-admin <email>");
    process.exit(1);
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Failed to list users:", error.message);
    process.exit(1);
  }

  const user = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!user) {
    console.error(
      `No auth user found for ${email}. Sign in once via /login first, then re-run this script.`,
    );
    process.exit(1);
  }

  const { error: insertError } = await supabase
    .from("platform_admins")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  if (insertError) {
    console.error("Failed to grant platform admin:", insertError.message);
    process.exit(1);
  }

  console.log(`${email} is now a platform admin.`);
}

main();
