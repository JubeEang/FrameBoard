// Shared storage settings. Leave supabaseKey empty to run in local-only mode
// (boards saved in this browser only).
//
// supabaseKey must be the PUBLISHABLE key (sb_publishable_...) or the legacy
// "anon" key. Never put the secret / service_role key here: this file is public.
window.FRAMEBOARD_CONFIG = {
  supabaseUrl: "https://snlvevrfkjtvmlpvrrif.supabase.co",
  supabaseKey: "",
  imageBucket: "frameboard-images"
};
