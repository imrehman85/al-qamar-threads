/* Public settings for the shop. Both values are safe to publish: the anon key only
   allows what the database security rules allow (see supabase/schema.sql).
   Leave them empty to run the site in demo mode (data kept in the visitor's browser). */
window.AQT_CONFIG = {
  supabaseUrl: "",      // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: ""   // Supabase → Project Settings → API → "anon public" key
};
