import OpenAI from "openai";
import { z } from "zod";
import type { Topic } from "@/lib/topics";
import { verScoreToPercentile } from "@/lib/scoring";
import { connectDb } from "@/lib/db";
import { BadReportModel } from "@/models/BadReport";
import { retrieveExamples, formatExamplesForPrompt } from "@/lib/rag";

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
  pjExplanation: z.string(),
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
        `Write an original passage of ${rcWordCount} words. ` +
        "The passage may be argumentative, analytical, descriptive, or informational — " +
        "on a topic typical of IPMAT/CAT exams (e.g. social media regulation, economic policy, climate science, " +
        "technology ethics, political systems, urbanisation, public health, cultural commentary, globalisation). " +
        "It should read like an excerpt from a newspaper editorial, journal article, or policy analysis — " +
        "with a clear thesis, supporting evidence, and nuanced reasoning. " +
        "Create exactly 6 questions covering: (1) main idea or central argument, (2) author's tone or purpose, " +
        "(3) logical inference, (4) specific detail retrieval, (5) meaning of a word/phrase as used in the passage, " +
        "(6) conclusion or implication. " +
        "Each option must be a full-sentence statement — conceptual or interpretive. " +
        "Options should be plausible paraphrases — avoid obviously wrong or absurd distractors. " +
        "Each explanation must quote or cite the specific sentence(s) that justify the answer.",
    },
    "Conversation Sets": {
      schemaName: "rc",
      description:
        `Generate a ${levelTag} Conversation-based comprehension set. ` +
        "Write a realistic dialogue (400-600 words) between two speakers discussing a substantive topic " +
        "(e.g. business strategy, economics, ideas, technology, or abstract concepts) — " +
        "in the style of a business podcast, editorial interview, or panel discussion. " +
        "Use named speakers with roles (e.g. 'Interviewer', 'CEO', 'Economist'). " +
        "Each speaker should have a distinct position and reasoning style. " +
        "Create exactly 6 questions testing: (1) meaning of a specific term in context, " +
        "(2) concept explanation, (3) logical inference, (4) main idea or summary of the conversation, " +
        "(5) a speaker's primary argument or intent, (6) a factual detail from the transcript. " +
        "Each option must be a full-sentence explanation or interpretation. " +
        "Distractors should be subtle — plausible paraphrases that distort the speaker's actual position.",
    },
    "Parajumbles": {
      schemaName: "pj",
      description:
        `Generate a ${levelTag} Parajumble question. ` +
        "Produce 4-5 sentences (labeled A, B, C, D, and optionally E) that together form a coherent paragraph " +
        "on a factual or analytical topic (e.g. ancient civilisations, scientific discoveries, economic history, " +
        "literary movements, geopolitical events). " +
        "Present the sentences in a SCRAMBLED order. " +
        "Sentences should contain subtle connectors when correctly ordered — pronoun references (this, these, such, its), " +
        "cause-effect links, chronological markers, and demonstrative phrases that point back to prior sentences. " +
        "The correct order should require careful analysis: chronological order, cause and effect, " +
        "pronoun references, opening vs concluding sentences, and logical argument flow. " +
        "Avoid explicit position markers like 'firstly', 'in conclusion', 'to begin with'. " +
        "Do NOT use numbered lists.",
    },
    "Vocabulary Usage": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Vocabulary Usage question. ` +
        "Randomly choose ONE of these two formats:\n\n" +
        "FORMAT A — Incorrect Word Usage:\n" +
        "One target word is used in 4 different sentences (labeled a, b, c, d). " +
        "Each option contains one full sentence. " +
        "Exactly ONE sentence uses the word incorrectly or inappropriately " +
        "(wrong meaning, wrong connotation, or confused with a paronym). " +
        "The other 3 must use it correctly in distinct real-world contexts. " +
        "The question text MUST begin with: 'One of the statements below contains the word [WORD] used incorrectly " +
        "or inappropriately. Choose the statement with the incorrect usage.' " +
        "Choose words with nuanced meanings commonly tested in IPMAT/CAT " +
        "(e.g. 'train', 'bank', 'novel', 'precipitate', 'qualify', 'check'). " +
        "The incorrect usage should be a plausible mistake.\n\n" +
        "FORMAT B — Meaning-based Fill:\n" +
        "Write a sentence with ONE blank (shown as '______'). " +
        "The question text MUST begin with: 'Choose the word that best fills the blank.' " +
        "followed by the sentence with the blank. " +
        "Provide 4 single-word options (a, b, c, d). " +
        "Only one word fits the context correctly in meaning, grammar, and collocational fit. " +
        "The sentence should be on a real-world topic (economics, science, current affairs, environment). " +
        "Distractors should be words that seem plausible on first reading but fail on closer examination.",
    },
    "Paracompletions": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Paragraph Completion question. ` +
        "Write a short coherent paragraph of 3-5 sentences on an analytical or factual topic " +
        "(e.g. monsoon economy, urbanisation, scientific methodology, trade policy, cultural evolution). " +
        "The FINAL sentence is missing. " +
        "The question text MUST begin with: 'Choose the sentence that best completes the paragraph below.' " +
        "followed by the paragraph text ending with '______' where the missing sentence should be. " +
        "Provide 4 options (a, b, c, d). Each option is a full sentence that could conclude the paragraph. " +
        "The correct option should logically and stylistically complete the paragraph — " +
        "it should serve as a natural conclusion, summary, or implication of what came before. " +
        "Distractors should be topically relevant but subtly wrong: " +
        "(a) introduce a slight contradiction, (b) shift the tone or register, " +
        "(c) repeat information already stated, or (d) introduce a tangential point.",
    },
    "Sentence Completions": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Sentence Completion question (IPMAT/CAT style). ` +
        "Randomly choose ONE of these three formats:\n\n" +
        "FORMAT A — Single Blank:\n" +
        "Write one sentence with one blank (shown as '______'). " +
        "The question text MUST begin with: 'Fill in the blank with the most appropriate word.' " +
        "followed by the sentence. " +
        "Provide 4 single-word options (a, b, c, d). " +
        "Only one word fits grammatically and contextually.\n\n" +
        "FORMAT B — Double Blank:\n" +
        "Write one sentence with two blanks. " +
        "The question text MUST begin with: 'Fill in the blanks with the most appropriate pair of words.' " +
        "followed by the sentence. " +
        "Provide 4 options, each containing a pair of words (comma-separated). " +
        "Only one pair fits both blanks logically and grammatically.\n\n" +
        "FORMAT C — Triple Blank:\n" +
        "Write one sentence with three blanks. " +
        "The question text MUST begin with: 'Fill in the blanks with the most appropriate set of words.' " +
        "followed by the sentence. " +
        "Provide 4 options, each containing a set of three words (comma-separated). " +
        "The correct set must fit grammatically, maintain logical meaning, and match tone or contrast. " +
        "Distractors should have words that individually seem plausible but fail as a complete set.\n\n" +
        "The sentence should be on an academic or real-world topic (science, history, economics, current affairs).",
    },
    "Sentence Correction": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Sentence Correction question (IPMAT/CAT style). ` +
        "Randomly choose ONE of these two formats:\n\n" +
        "FORMAT A — Error Spotting:\n" +
        "Write one sentence divided into four parts (labeled a, b, c, d). " +
        "Exactly one part contains a grammatical error. " +
        "The question text MUST begin with the instruction: 'Identify the part of the sentence that contains an error.' " +
        "followed by the full sentence with parts labeled. " +
        "Each option represents one part of the sentence.\n\n" +
        "FORMAT B — Correct Version:\n" +
        "Write one sentence that contains a grammatical error or awkward phrasing. " +
        "The question text MUST begin with the instruction: 'Choose the option that corrects the error in the sentence below.' " +
        "followed by the full original sentence. " +
        "Provide 4 options (a, b, c, d), each offering a corrected version of the problematic part. " +
        "Exactly one option is grammatically correct, idiomatic, and contextually appropriate.\n\n" +
        "Common error types to use: subject-verb agreement, tense errors, modifier placement, " +
        "word choice (e.g. 'regarded to be' → 'regarded as'), preposition errors, and parallelism. " +
        "Focus on commonly tested grammar traps in IPMAT/CAT: subject-verb agreement with intervening clauses, " +
        "gerund vs infinitive, conditional moods, pronoun-antecedent agreement, and misplaced modifiers. " +
        "The sentence should be from an academic or journalistic context.",
    },
    "Idioms & Phrases": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Idioms & Phrases question. ` +
        "Randomly choose ONE of these two formats:\n\n" +
        "FORMAT A — Meaning:\n" +
        "One idiom or phrase is given. " +
        "The question text MUST begin with: 'What is the meaning of the idiom/phrase: [IDIOM]?' " +
        "Provide 4 options (a, b, c, d), each offering a short meaning or definition. " +
        "Only one meaning is correct. " +
        "Distractors should be plausible interpretations based on the component words.\n\n" +
        "FORMAT B — Correct Usage:\n" +
        "Give 4 sentences (a, b, c, d), each using the same idiom or phrase. " +
        "The question text MUST begin with: 'In which sentence is the idiom/phrase used correctly?' " +
        "Exactly one sentence uses the idiom correctly. " +
        "The other 3 should misuse it: wrong context, literal misapplication, or garbled phrasing.\n\n" +
        "Choose idioms commonly tested in competitive exams — well-known but with meanings that are " +
        "non-obvious from component words (e.g. 'red herring', 'throw in the towel', 'bark up the wrong tree', " +
        "'a dime a dozen', 'burn the midnight oil'). Avoid region-specific slang.",
    },
  };

  const config = topicDescriptions[topic];

  const schemaInstructions =
    config.schemaName === "rc"
      ? "Return JSON with keys: passageTitle, passage, questions (array of 6). " +
        "Each question has text, options (4 strings), correctIndex (0-3), explanation."
      : config.schemaName === "pj"
        ? "Return JSON with keys: pjSentences (array of sentences in scrambled order), " +
          "pjCorrectOrder (string like BDAC using letters A-E matching sentence indices), " +
          "pjExplanation (a brief explanation of why this is the correct order, referencing logical flow and connectors)."
        : "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation.";

  return {
    schemaName: config.schemaName,
    prompt: `${config.description}\n\n${schemaInstructions}\n\nTarget difficulty: ${difficulty}.`,
  };
}

export async function generateQuestion(topic: Topic, difficulty: number, avoidWords?: string[]) {
  const { schemaName, prompt } = buildPrompt(topic, difficulty);

  // For Vocab/Idioms: inject a "do not reuse" list so the same word/idiom never repeats
  let avoidWordsClause = "";
  if (
    avoidWords &&
    avoidWords.length > 0 &&
    (topic === "Vocabulary Usage" || topic === "Idioms & Phrases")
  ) {
    avoidWordsClause =
      "\n\nCRITICAL — Do NOT use any of these words/idioms (they have already appeared for this user):\n" +
      avoidWords.map((w) => `- ${w}`).join("\n") +
      "\nPick a completely different word/idiom that has NOT been used before.";
  }

  // RAG: retrieve similar PYQ examples + avoidance rules in parallel
  const [ragExamples, avoidanceRules] = await Promise.all([
    retrieveExamples(topic, difficulty, 3).catch(() => []),
    getAvoidanceRules(topic),
  ]);
  const ragContext = formatExamplesForPrompt(ragExamples);
  const systemPrompt = BASE_SYSTEM_PROMPT + ragContext + avoidanceRules + avoidWordsClause;

  // Model selection: fine-tuned → gpt-4o (long-form) → gpt-4o-mini
  // Fine-tuned model is only used for short-form topics (not RC/Conversation)
  // because it's based on gpt-4o-mini which has a smaller context window.
  const isLongForm = schemaName === "rc";
  const finetunedModel = process.env.FINETUNED_MODEL;
  const model =
    isLongForm
      ? "gpt-4o-mini"
      : finetunedModel
        ? finetunedModel
        : "gpt-4o-mini";
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
        model: "gpt-4o-mini",
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
