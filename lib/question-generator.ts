import OpenAI from "openai";
import { z } from "zod";
import type { Topic } from "@/lib/topics";
import { verScoreToPercentile } from "@/lib/scoring";
import { connectDb } from "@/lib/db";
import { BadReportModel } from "@/models/BadReport";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const normalSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(5),
});

const rcSchema = z.object({
  passageTitle: z.string().min(3),
  passage: z.string().min(800),
  questions: z
    .array(
      z.object({
        text: z.string().min(8),
        options: z.array(z.string().min(1)).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().min(5),
      })
    )
    .length(6),
});

const pjSchema = z.object({
  pjSentences: z.array(z.string().min(5)).min(4).max(5),
  pjCorrectOrder: z.string().regex(/^[A-E]{4,5}$/),
});

export type GeneratedQuestion =
  | (z.infer<typeof normalSchema> & { topic: Topic; difficulty: number })
  | (z.infer<typeof rcSchema> & { topic: Topic; difficulty: number })
  | (z.infer<typeof pjSchema> & { topic: Topic; difficulty: number });

/** Return a random integer difficulty within ±band of verScore, clamped to 0-100. */
function randomDifficulty(verScore: number, band = 6): number {
  const lower = Math.max(0, verScore - band);
  const upper = Math.min(100, verScore + band);
  return Math.floor(lower + Math.random() * (upper - lower + 1));
}

const BASE_SYSTEM_PROMPT =
  "You generate CAT/IPMAT verbal questions. Return only valid JSON. " +
  "Follow the requested schema precisely. Avoid markdown.";

/** Fetch learned avoidance rules for a topic (most recent 15). */
async function getAvoidanceRules(topic: Topic): Promise<string> {
  await connectDb();
  const reports = await BadReportModel.find(
    { topic },
    { rule: 1 }
  )
    .sort({ createdAt: -1 })
    .limit(15)
    .lean();

  if (reports.length === 0) return "";

  const rules = reports.map((r: any) => `- ${r.rule}`).join("\n");
  return (
    "\n\nIMPORTANT — Avoid these mistakes that were flagged in previous questions:\n" +
    rules
  );
}

function buildPrompt(topic: Topic, difficulty: number) {
  const percentile = verScoreToPercentile(difficulty);
  const levelTag = `IPMAT/CAT Percentile ${percentile} level`;

  // RC passage length scales with difficulty: lower → shorter, higher → longer
  const rcWordCount = difficulty <= 30 ? "500-600" : difficulty <= 60 ? "600-700" : "700-800";

  const topicDescriptions: Record<Topic, { schemaName: string; description: string }> = {
    "Reading Comprehension Sets": {
      schemaName: "rc",
      description:
        `Generate a ${levelTag} Reading Comprehension set. ` +
        `Write an original, intellectually stimulating passage of ${rcWordCount} words on a topic suitable for IPMAT/CAT ` +
        "(e.g. economics, philosophy, science, sociology, history, art, technology, environment, psychology). " +
        "The passage should have a clear thesis with nuanced arguments, not surface-level content. " +
        "Create exactly 6 questions covering: inference, main idea, vocabulary-in-context, author's tone/purpose, " +
        "specific detail retrieval, and logical structure. " +
        "Options should be plausible — avoid obviously wrong distractors. " +
        "Each explanation must cite the specific part of the passage that justifies the answer.",
    },
    "Conversation Sets": {
      schemaName: "rc",
      description:
        `Generate a ${levelTag} Conversation-based comprehension set. ` +
        "Write a realistic dialogue (300-500 words) between 2-3 people discussing a substantive topic " +
        "(e.g. a business decision, ethical dilemma, academic debate, social issue). " +
        "Characters should have distinct viewpoints and reasoning styles. " +
        "Create exactly 6 questions testing: speaker's intent, implied meaning, agreement/disagreement between speakers, " +
        "tone shifts, logical conclusions, and factual details from the conversation. " +
        "Distractors should be tempting — paraphrases that subtly distort the speaker's actual position.",
    },
    "Parajumbles": {
      schemaName: "pj",
      description:
        `Generate a ${levelTag} Parajumble question. ` +
        "Produce 4-5 sentences that together form a coherent paragraph on a single topic. " +
        "Sentences should have clear logical/chronological connectors when rearranged correctly " +
        "(transition words, pronoun references, cause-effect chains). " +
        "Present the sentences in a SCRAMBLED order. The correct order should not be trivially obvious — " +
        "at least 2-3 sentences should be ambiguous without careful reading. " +
        "Avoid numbered lists or sentences that give away position via 'firstly', 'in conclusion', etc.",
    },
    "Vocabulary Usage": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Vocabulary Usage question. ` +
        "Present a word and 4 sentences using that word. Exactly ONE sentence uses the word INCORRECTLY " +
        "(wrong meaning, wrong connotation, wrong grammatical form, or confused with a similar-sounding word). " +
        "The other 3 sentences must use the word correctly in distinct, meaningful contexts. " +
        "The question should ask: 'In which sentence is the word used incorrectly?' " +
        "Choose words that are commonly tested in IPMAT/CAT — not obscure, but with nuanced meanings " +
        "(e.g. 'enervate', 'prevaricate', 'ameliorate', 'sanguine', 'equivocal'). " +
        "The incorrect usage should be a plausible mistake, not an absurd misuse.",
    },
    "Paracompletions": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Paracompletion question. ` +
        "Write a coherent paragraph (4-6 sentences) with ONE sentence missing (indicated by a blank or '[___]'). " +
        "Provide 4 options to fill the blank. The correct option should maintain the paragraph's logical flow, " +
        "tone, and argument direction. Distractors should be topically relevant but break logical continuity, " +
        "introduce contradictions, shift tone, or repeat information already stated. " +
        "The paragraph should be on an academic/analytical topic suitable for IPMAT/CAT.",
    },
    "Sentence Completions": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Sentence Completion question. ` +
        "Write a sentence with 1-2 blanks that test grammatical accuracy, idiomatic expression, or contextual vocabulary. " +
        "Provide 4 options (single words or phrases). The correct answer should be the only grammatically AND contextually " +
        "appropriate choice. Distractors should be close in meaning but fail on grammar, collocational fit, or connotation. " +
        "Focus on: subject-verb agreement traps, correct preposition usage, tense consistency, parallel structure, " +
        "or commonly confused word pairs (affect/effect, complement/compliment, etc.).",
    },
    "Idioms & Phrases": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Idioms & Phrases question. ` +
        "Present a sentence or short context that uses an idiom/phrase, and ask the user to identify " +
        "the correct meaning OR the correct usage. Vary the format between: " +
        "(a) 'What does the underlined idiom mean in this context?' with 4 meaning options, " +
        "(b) 'Which sentence uses the idiom correctly?' with 4 sentences, or " +
        "(c) 'Replace the underlined phrase with the most appropriate idiom' with 4 idiom options. " +
        "Choose idioms that are commonly tested — not extremely obscure or region-specific. " +
        "Distractors should be idioms with similar themes or words but different meanings.",
    },
  };

  const config = topicDescriptions[topic];

  const schemaInstructions =
    config.schemaName === "rc"
      ? "Return JSON with keys: passageTitle, passage, questions (array of 6). " +
        "Each question has text, options (4 strings), correctIndex (0-3), explanation."
      : config.schemaName === "pj"
        ? "Return JSON with keys: pjSentences (array of sentences in scrambled order), " +
          "pjCorrectOrder (string like BDAC using letters A-E matching sentence indices)."
        : "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation.";

  return {
    schemaName: config.schemaName,
    prompt: `${config.description}\n\n${schemaInstructions}\n\nTarget difficulty: ${difficulty}.`,
  };
}

export async function generateQuestion(topic: Topic, difficulty: number) {
  const { schemaName, prompt } = buildPrompt(topic, difficulty);

  const avoidanceRules = await getAvoidanceRules(topic);
  const systemPrompt = BASE_SYSTEM_PROMPT + avoidanceRules;

  // Use gpt-4o for RC/Conversation (long passages), gpt-4o-mini for the rest
  const isLongForm = schemaName === "rc";
  const model = isLongForm ? "gpt-4o" : "gpt-4o-mini";
  const maxTokens = isLongForm ? 4096 : 1024;

  const response = await openai.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_object",
    },
  });

  const content = response.choices[0]?.message?.content ?? "";

  if (!content) {
    throw new Error("OpenAI returned empty response");
  }

  const parsed = JSON.parse(content);
  const assignedDifficulty = randomDifficulty(difficulty);

  if (schemaName === "rc") {
    // Retry once if passage is too short
    const result = rcSchema.safeParse(parsed);
    if (!result.success) {
      const retryResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.8,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              prompt +
              "\n\nCRITICAL: The passage MUST be at least 500 words. Write a detailed, long-form passage. Do NOT cut it short.",
          },
        ],
        response_format: { type: "json_object" },
      });
      const retryContent = retryResponse.choices[0]?.message?.content ?? "";
      const retryParsed = JSON.parse(retryContent);
      const validated = rcSchema.parse(retryParsed);
      return { ...validated, difficulty: assignedDifficulty, topic } as GeneratedQuestion;
    }
    return { ...result.data, difficulty: assignedDifficulty, topic } as GeneratedQuestion;
  }

  if (schemaName === "pj") {
    const validated = pjSchema.parse(parsed);
    return { ...validated, difficulty: assignedDifficulty, topic } as GeneratedQuestion;
  }

  const validated = normalSchema.parse(parsed);
  return { ...validated, difficulty: assignedDifficulty, topic } as GeneratedQuestion;
}
