# Flash Inspiration

A responsive quote community built as a static frontend with Supabase Auth and PostgreSQL. Features include email/password registration and login, author profiles, quote submission with a moderation queue, topic/search filtering, likes, comments, author profiles, and share actions for native sharing, X, Facebook, and WhatsApp.

## What you need

- A Supabase project.
- GitHub Pages or another static host.
- The public Supabase project URL and **anon/publishable key** (safe for browser use when Row Level Security is enabled). Never put a `service_role` or secret key in this website.

## Configure Supabase

1. Create a Supabase project.
2. In **SQL Editor**, run the contents of [`supabase/schema.sql`](supabase/schema.sql).
3. In **Authentication → URL Configuration**, set the Site URL to the public website URL and add local and deployed URLs to Redirect URLs. For GitHub Pages, the project URL normally looks like `https://YOUR-USERNAME.github.io/flash-inspiration/`.
4. Copy the Project URL and anon/publishable key from **Project Settings → API**.
5. Replace the two placeholder values in [`supabase-config.js`](supabase-config.js).
6. Publish the repository with GitHub Pages (Settings → Pages → deploy from the `main` branch, root folder). The provided logo asset is [`assets/logo.svg`](assets/logo.svg).

The site remains in preview mode until both Supabase settings are configured. The first quote insert is pending moderation. Review it in Supabase Table Editor and change its status to `published` to make it visible. No moderation dashboard is included in this initial MVP.

## Local preview

Because the browser loads Supabase's JavaScript library and auth APIs, run the files through a local static server instead of opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`. Add that URL to Supabase Auth Redirect URLs for local authentication.

## Security and production notes

- Database access is protected by Row Level Security policies in the schema. Review those policies before launch.
- Supabase email confirmation and password policies should be configured in the Supabase dashboard.
- The public site has no admin dashboard, abuse-reporting workflow, rate limiting, or automated content moderation yet. Review pending quotes and comments before promoting the service broadly.
- The quote image/logo was recreated as a scalable SVG concept based on the provided blue-and-gold artwork. Replace `assets/logo.svg` with your licensed original asset if you have the source file.
- Do not use the same production domain/CNAME as another live site unless you intend to replace that site's content. The existing repository CNAME was not changed by this app commit.

## Files

- `index.html`, `styles.css`, `app.js` — app UI and client behavior.
- `supabase-config.js` — public project settings placeholders.
- `supabase/schema.sql` — database, profile trigger, and RLS policies.
- `assets/logo.svg` — Flash Inspiration brand mark.
