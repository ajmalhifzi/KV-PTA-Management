# FYP Progress & Supervision Platform — Locked Blueprint

## Core Problem
Teacher-student FYP supervision and communication, so teachers can monitor and give feedback even when absent. AI-assisted ideation is a secondary (phase 2) feature, not the primary hook.

## Scope
- Single course: Web Application and Database Management
- 5+ teachers, 20-40 students, 1 admin (course coordinator)
- Students assigned to teachers manually by admin (not self-select, not auto-match)

## Roles & Features

### Admin
- Assign students to teachers (dropdown/bulk, manual)
- Oversee all teacher-student activity (read-only visibility across the course)
- View platform error logs (own dev/bug monitoring, not student-project bugs)
- Seed old FYP data (mock data to start — real data can be added later)

### Teacher
- Dashboard of *own assigned students only*
- Comment thread per student project
- Approve / reject / request-revision on submitted ideas and milestones
- View student's GitHub commit activity (via periodic OAuth pull)
- Upload resource files (templates, guides) visible to assigned students
- AI-generated risk summary per student (from GitHub + comment-lag signals)

### Student
- Submit FYP idea: objective, purpose, scope
- Track approval status through a defined workflow
- Link GitHub repo via OAuth (this is the "push work" feature — no custom versioning built)
- Upload files: one-time formal docs (proposal/report PDF) + ongoing supplementary files (diagrams, extra docs) — flat list per project, no folders, no versioning
- View teacher comments and resource files
- Get AI idea-recommendation suggestions (based on old FYP mock data)

### Explicitly Cut / Simplified
- No custom file versioning system → GitHub OAuth link instead
- No Gantt chart UI → plain status table
- No student-facing bug tracker → admin-only error log
- No pgvector/embeddings for AI recommendation → plain Postgres + keyword filter + LLM reasoning over filtered context

## AI Features (two only, both single external API calls — Gemini or GPT)

1. **Progress risk-summary** (primary, tied to core problem)
   - Deterministic signals computed first: days since last commit, days since last teacher reply, milestone lag
   - LLM call generates a short natural-language risk summary for the teacher's dashboard
   - Report framing: the *summary generation* is AI; the *threshold detection* is plain logic — don't conflate the two

2. **Idea recommendation** (secondary, phase 2)
   - Filter old FYP mock data by keyword/category
   - Pass filtered candidates as context to a single LLM call
   - Model returns structured JSON: closest matches + unexplored angles
   - Report framing: proof-of-concept mechanism on mock data, not validated on real historical patterns

## Tech Stack
- Frontend: HTML + CSS + Tailwind + Vanilla JS
- Backend: Node.js + Express 5
- Database: PostgreSQL via Supabase (plain, no pgvector)
- Auth: JWT + bcrypt
- Deployment: Vercel (frontend) + Render (backend)
- File storage: Supabase Storage (service key + RLS policy, not anon key)

## Notifications
- GitHub push detection: periodic OAuth pull (not webhook — webhooks need a public endpoint + signature verification, not worth the complexity here)
- In-app events (comment, reply, doc upload): live-feel via Supabase, since it's already in the stack

## Design System
- Overall feel: Linear-style — minimal but crisp, confident status/color signaling (not Notion-style muted/calm)
- Animation: subtle/fast transitions only, no rich micro-interactions
- Corners: small rounded radius (not sharp/0px, not heavily rounded)
- Shadows: flat/bordered layout; shadows reserved for floating overlays (modals, dropdowns) only
- Navigation: icon + label, full sidebar, collapsible (state persisted in localStorage)
- Data display: hybrid — table/list rows with inline status badges for lists, cards for detail views
- Mobile: desktop-first overall; full mobile polish ONLY on the teacher check-in flow (dashboard, notifications, approve/reject, comment reply). Admin bulk actions and complex tables get Tailwind's default responsive fallback, not hand-tuned mobile polish.

## Build Phases (per locked workflow)
1. Setup
2. Backend API
3. Frontend
4. End-to-end test
5. Deploy

## Known Stack Fixes to Apply (carried over from prior projects)
- `app.options('/{*path}')` not `app.options('*')` (Express 5)
- Base64 JSON upload instead of Multer
- Raise JSON body limit to 10mb
- Always use `SUPABASE_SERVICE_KEY` for storage uploads
- Storage bucket needs RLS policy or uploads fail silently
- `DATABASE_URL` password: letters/numbers only
- Use port 6543 for connection pooling
- Add `family:4` to pg Pool config if ETIMEDOUT occurs
- Malaysia timezone: `SET timezone = 'Asia/Kuala_Lumpur'` on backend, `toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'})` on frontend — never `toISOString().split('T')[0]`
