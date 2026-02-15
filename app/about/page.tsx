import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Logo } from "@/components/logo";
import SignOutButton from "@/components/sign-out-button";

export const metadata = {
  title: "About | Verbit",
};

export default async function AboutPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.isAdmin === true;
  const dailyLimit = Number(process.env.DAILY_SET_LIMIT) || 5;

  return (
    <div className="min-h-screen bg-grid">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-12 flex items-center justify-between">
          <Logo />
          {session?.user ? (
            <div className="flex items-center gap-3">
              <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 p-1">
                <Link
                  href="/dashboard"
                  className="rounded-full px-4 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  Dashboard
                </Link>
                <Link
                  href="/analytics"
                  className="rounded-full px-4 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  Analytics
                </Link>
                <Link
                  href="/about"
                  className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
                >
                  About
                </Link>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className="rounded-full px-4 py-2 text-xs font-medium text-amber-300/70 transition hover:bg-amber-500/10 hover:text-amber-200"
                  >
                    Admin
                  </Link>
                ) : null}
              </nav>
              <SignOutButton />
            </div>
          ) : null}
        </header>

        <article className="prose-invert prose-sm space-y-8 text-white/80 leading-relaxed">
          <h1 className="text-3xl font-bold text-white">About Verbit</h1>

          <section className="space-y-4">
            <p>
              Hi, I&apos;m Shinjan — 1st Year IPM student at IIM Indore.
              I&apos;ve always guided aspirants to use carefully curated prompts to
              leverage the full power of LLMs for verbal ability practice — and it
              genuinely works well. But the process is inefficient: crafting the right
              prompt every time, copy-pasting outputs, manually tracking what
              you&apos;ve already done. A lot of time gets wasted on logistics instead
              of actual practice. So I decided to automate the entire workflow into
              a single platform — one that generates{" "}
              <strong className="text-white">unlimited</strong> fresh questions,{" "}
              <strong className="text-white">adapts</strong> to your skill level{" "}
              <strong className="text-white">in real time</strong>, and costs you{" "}
              <strong className="text-white">absolutely nothing</strong>. That&apos;s Verbit.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Why It&apos;s Free (and will stay free)</h2>
            <p>
              This platform is 100% automated — every question, every evaluation,
              every difficulty adjustment is done by AI. There is no human curation,
              no editorial board, no team of content writers. Because of that, I
              don&apos;t want personal accountability for the quality of every single
              output. That&apos;s why it&apos;s free. I am not going to be another one of those
              {" "}&ldquo;cracked IPMAT, now let me monetize my rank&rdquo; type mentors.
              I have no interest in building a coaching brand off this.
            </p>
            <p>
              The AI credits (OpenAI API calls) that power every question generation
              and evaluation are paid out of my own pocket, and I&apos;m fine bearing
              that cost for as long as I can. When I eventually run out of credits,
              I&apos;ll put up a small donation link — every rupee collected will go
              directly toward purchasing more API credits so the platform keeps
              running. No profit, no middlemen.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Daily Limits on RC &amp; Conversation Sets</h2>
            <p>
              Reading Comprehension and Conversation Sets are the most token-heavy
              features on the platform — each set involves generating a full passage
              plus 6 questions with explanations. To keep costs sustainable, each
              user is limited to <strong>{dailyLimit} sets per day</strong> for each of these
              two topics. The limit resets at 12:00 AM IST.
            </p>
            <p>
              Honestly, {dailyLimit} sets a day is a lot more than most people will bother doing
              in a single sitting. If you&apos;re consistently hitting the cap, you&apos;re
              already putting in serious work.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">There Will Be Errors</h2>
            <p>
              Let me be upfront: there <em>will</em> be mistakes. AI-generated questions
              are not perfect. You&apos;ll encounter questions with ambiguous options,
              debatable answers, or occasional factual slips. That&apos;s the nature of
              a fully automated system. But I&apos;ve built a whole ML pipeline to deal with it.
            </p>
            <p>
              When you hit the <strong>&ldquo;Report bad question&rdquo;</strong> button and
              describe what&apos;s wrong, the system doesn&apos;t just blindly remove the
              question. It sends your report and the full question to an AI evaluator
              that independently assesses whether the question is actually flawed. If
              your report is valid — say the correct answer is wrong, there are
              multiple correct options, or the passage contradicts the question — the
              question gets flagged and permanently removed from the database. The
              AI&apos;s analysis of <em>what went wrong</em> then gets stored as an
              instruction for subsequent question generation, so the same type of
              mistake is less likely to happen again. If the AI determines the
              question is actually fine and your report isn&apos;t valid, the question is
              retained. It&apos;s a self-correcting feedback loop.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">How VerScore Works</h2>
            <p>
              Your VerScore is a per-topic adaptive rating on a 0–100 scale. Under
              the hood, it&apos;s mapped to a <strong>percentile</strong> using a
              logarithmic curve:
            </p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 font-mono text-sm text-white/70">
              <p>percentile = 50 + 50 × log₁₀(1 + 0.255 × verScore) / log₁₀(1 + 0.255 × 100)</p>
            </div>
            <p>
              A VerScore of 0 maps to the 50th percentile (average), ~50 maps to
              roughly the 90th percentile, and 100 maps to the 100th. This
              logarithmic scaling means early gains come faster, but climbing higher
              gets exponentially harder — just like in real competitive exams.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Adaptive Difficulty (Elo-inspired)</h2>
            <p>
              After every question, your VerScore is updated using an Elo-like
              system. Your current score and the question&apos;s difficulty are both
              converted to percentiles, and an <strong>expected probability of
              success</strong> is computed:
            </p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 font-mono text-sm text-white/70">
              <p>E = 1 / (1 + 10^((Q_percentile − U_percentile) / 10))</p>
            </div>
            <p>
              The delta is then K × gapScale × (actual − expected), where K = 4.5,
              and gapScale amplifies updates when the gap between your level and the
              question&apos;s level is large. A <strong>speed factor</strong> (ratio of
              ideal time to your actual time, clamped between 0.6 and 1.4) further
              adjusts the update — solving faster than expected boosts you more,
              solving slower dampens the gain.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Calibration Phase</h2>
            <p>
              When you first start a topic, Verbit doesn&apos;t know your level. Instead
              of starting you at zero and making you grind through easy questions,
              it runs a <strong>calibration phase</strong> — a fixed sequence of
              questions at predetermined difficulty levels spanning the full range.
            </p>
            <p>
              For most topics, that&apos;s 10 questions at difficulties [10, 20, 30, …, 100].
              For RC and Conversation Sets, it&apos;s 3 sets at [30, 60, 90] (because
              each set is itself 4–5 questions, so you&apos;re still answering 12–15
              questions total).
            </p>
            <p>
              Your initial VerScore is computed using a blend of <strong>difficulty-weighted
              accuracy (60%)</strong> and <strong>raw accuracy (40%)</strong>, with speed
              adjustments applied. Getting hard questions right yields a higher initial
              score than getting only easy ones right.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Dynamic Question Difficulty (IRT-Bayesian)</h2>
            <p>
              Questions aren&apos;t static either. Every question in the database has its
              own difficulty rating that evolves over time based on how users perform
              on it. This uses an <strong>Item Response Theory (IRT)</strong>-inspired
              Bayesian update:
            </p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 font-mono text-sm text-white/70">
              <p>P(success) = 1 / (1 + exp(−(θ − b) / s))</p>
              <p className="mt-1">surprise = actual − P(success)</p>
              <p className="mt-1">new_difficulty = old − learningRate × surprise × speedFactor</p>
            </div>
            <p>
              Here θ is the solver&apos;s VerScore, b is the question&apos;s current difficulty,
              and s is a scale parameter. If strong users consistently get a question
              wrong, its difficulty drifts upward. If weak users consistently get it
              right, it drifts down. The learning rate decays with √(attemptCount),
              so well-tested questions stabilise over time.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">RAG Pipeline (Retrieval-Augmented Generation)</h2>
            <p>
              Questions aren&apos;t generated from thin air. I scanned and extracted 156
              previous year question papers and stored them as reference documents in
              MongoDB. When generating a new question, the system retrieves relevant
              past questions as few-shot examples and feeds them to the LLM alongside
              detailed topic-specific prompts. This grounds the output in real exam
              patterns — the sentence structures, option styles, and difficulty curves
              all mirror actual IPMAT/CAT verbal sections.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Deduplication</h2>
            <p>
              Nobody wants to see the same vocabulary word or idiom twice. The system
              tracks every word/idiom you&apos;ve already been tested on and actively
              avoids repeating them — both when sampling from the existing question
              pool and when generating new ones. For RC and Conversation Sets, it
              deduplicates at the <em>passage level</em>, tracking passage titles/themes
              to ensure you get diverse reading material instead of seeing the same
              domain repeated.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Topic Coverage</h2>
            <p>
              Verbit covers 8 verbal aptitude topics modelled after the IPMAT and CAT
              exam patterns:
            </p>
            <ul className="list-inside list-disc space-y-1 text-white/70">
              <li><strong>Reading Comprehension Sets</strong> — full passage + 4–5 MCQs</li>
              <li><strong>Conversation Sets</strong> — dialogue-based passage + questions</li>
              <li><strong>Parajumbles</strong> — rearrange jumbled sentences</li>
              <li><strong>Vocabulary Usage</strong> — contextual word usage</li>
              <li><strong>Paracompletions</strong> — complete a paragraph</li>
              <li><strong>Sentence Completions</strong> — fill-in-the-blank</li>
              <li><strong>Sentence Correction</strong> — identify and fix errors</li>
              <li><strong>Idioms &amp; Phrases</strong> — meaning and usage</li>
            </ul>
            <p>
              Each topic has its own detailed prompt engineered to match the exact
              format observed in real PYQ papers, with 20+ diverse domain examples to
              ensure variety.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Tech Stack</h2>
            <ul className="list-inside list-disc space-y-1 text-white/70">
              <li>Next.js (App Router, TypeScript)</li>
              <li>MongoDB Atlas</li>
              <li>OpenAI GPT-4o-mini</li>
              <li>NextAuth (Google OAuth + credentials)</li>
              <li>Tailwind CSS</li>
              <li>Deployed on Vercel</li>
            </ul>
          </section>

          <section className="space-y-4 border-t border-white/10 pt-8">
            <p className="text-white/50 text-sm">
              Built with a lot of caffeine and a little bit of spite for overpriced
              coaching. If you find a bug, hit the report button. If you like it,
              tell a friend.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
