# Verbit

Verbit is a dark, modern verbal aptitude practice platform for CAT/IPMAT aspirants. It uses adaptive scoring, LLM-generated questions, and per-topic VerScore tracking.

## Git Bash Setup

1. Check Node.js

```bash
node -v
```

If Node.js is missing, install Node LTS, then continue.

2. Install dependencies

```bash
npm install
```

3. Create `.env.local`

```bash
cat <<'EOF' > .env.local
MONGODB_URI=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OPENAI_API_KEY=
EOF
```

4. Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Core Features

- Adaptive VerScore per topic with new anchor-based percentile mapping:
	- 0 → 50th percentile
	- 50 → 90th percentile
	- 65 → 95th percentile
	- 75 → 98th percentile
	- 85 → 99th percentile
	- 95 → 99.8th percentile
	- 100 → 100th percentile
	(Piecewise linear mapping between anchors)
- RC dual-pane layout with independent scrolling.
- Parajumbles free-input evaluation.
- LLM-generated questions saved to MongoDB.
- NextAuth with Google and email/password.

## Project Structure

```
app/
	api/
	dashboard/
	practice/[topic]/
	auth/sign-in/
components/
lib/
models/
```
