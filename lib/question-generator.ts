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
function randomDifficulty(verScore: number, band = 10): number {
  const lower = Math.max(0, verScore - band);
  const upper = Math.min(100, verScore + band);
  return Math.floor(lower + Math.random() * (upper - lower + 1));
}

const BASE_SYSTEM_PROMPT =
  "You generate CAT/IPMAT verbal questions. Return only valid JSON. " +
  "Follow the requested schema precisely. Avoid markdown. " +
  "All content produced, including correct options, must be grammatically correct. " +
  "For Reading Comprehension and Conversation Sets: Write in a human, natural style, not AI-like. Scale complexity and depth to the requested difficulty. Passages/dialogues should sometimes be artistic, creative, or literary, with vivid imagery, emotion, or narrative flair. Avoid generic, robotic, or formulaic writing. Cover current affairs, trending topics, and issues relevant for interviews, including social, economic, political, and cultural themes. " +
  "Before delivering your output, check and ensure that every question, passage, and option is free of grammar errors and reads naturally.";

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
  // RC passage length scales with difficulty: lower → shorter, higher → longer
  const rcWordCount = difficulty <= 30 ? "500-600" : difficulty <= 60 ? "600-700" : "700-800";
  const percentile = verScoreToPercentile(difficulty);
  let levelTag = `IPMAT/CAT Percentile ${percentile} (VerScore ${difficulty})`;
  let eliteClause = "";
  if (difficulty >= 95) {
    levelTag = `99.8th percentile (VerScore 95)`;
    eliteClause = " These must be of top elite SAT/GMAT/GRE/Olympiad level—extremely rare, creative, and matching the most difficult questions ever seen on those exams.";
  } else if (difficulty >= 85) {
    levelTag = `99th percentile (VerScore 85)`;
  } else if (difficulty >= 75) {
    levelTag = `98th percentile (VerScore 75)`;
  } else if (difficulty >= 65) {
    levelTag = `95th percentile (VerScore 65)`;
  } else if (difficulty >= 50) {
    levelTag = `90th percentile (VerScore 50)`;
  } else {
    levelTag = `50th percentile (VerScore 0)`;
  }

  const topicDescriptions: Record<Topic, { schemaName: string; description: string }> = {
    "Reading Comprehension Sets": {
      schemaName: "rc",
      description:
        `Generate a ${levelTag} Reading Comprehension set. Passage: ${rcWordCount} words, 3–5 paragraphs, unique, exam-relevant, contemporary, diverse, engaging. Themes: technology, psychology, business, policy, leadership, digital transformation, public health, internet culture, entertainment, social/economic/political/cultural issues, trending/newsworthy subjects. Style: editorial/journal article.\n\nCRITICAL INSTRUCTION: Ensure the passage is an IN-DEPTH discussion of these events. The text MUST BE argumentative, analytical, controversial, or highly informative. It should explore nuanced implications and diverse perspectives rather than just stating facts. Mention recent events/studies/news (with year/month if relevant).\n\nQuestion types by difficulty:\nEASY (≤30): Fact Retrieval, Vocab/Synonym/Antonym in Context, Reference, Cause–Effect, Best Title, Summary.\nMEDIUM (31–70): Main Idea, Author’s Purpose, Primary Concern, Tone, Paragraph/Line Function, Mention Reason, Contrast, Counterargument, NOT/EXCEPT, Nuanced Vocab, Logical Structure, Moderate Inference.\nHARD (≥71): Deep Inference, Implication, Assumption, Strengthen/Weaken/Evaluate Argument, Application, Analogy, Paradox, Data/Evidence Inference.\n\nFor each question, randomly select a type from the above lists, weighted so harder types appear more for high difficulty and direct types for low difficulty. The sequence and types must be randomized and diverse, not repetitive. All questions must be passage/news relevant.\n\nIMPORTANT: Separate every paragraph in the passage with a single <br> tag. Use HTML tags, <br> for paragraph breaks. No markdown. Explanation must use line breaks for clarity.`,
    },
    "Conversation Sets": {
      schemaName: "rc",
      description:
        `Generate a ${levelTag} Conversation set. Dialogue: 400–600 words, 2 named speakers, unique, exam-relevant topic. Topics must be contemporary, diverse, and engaging—examples include technology, psychology, business, policy, leadership, digital transformation, public health, internet culture, entertainment, social/economic/political/cultural issues, trending/newsworthy subjects.\n\nCRITICAL INSTRUCTION: The conversation MUST NOT be a mere exchange of information. It MUST BE a heavy debate or argument. Emulate the style of real interview, debate, or panel transcripts where speakers challenge each other's views, forcefully defend their positions, and critically examine ideas, opinions, and controversial aspects. It should feel like a real human-to-human intellectual clash or witty exchange.\n\nWhere possible, include mentions or citations of recent events, studies, or news headlines (with year or month if relevant).\n\nYou must select question types based on the dialogue's difficulty:\n\nEASY (≤30): Speaker Agreement, Speaker Disagreement, Fact-based speaker question, Complete the Dialogue.\nMEDIUM (31–70): Speaker’s Intention, Tone of Speaker, Which Speaker Would Agree With X?, Most Logical Response, Point of Contention, Common Ground Identification.\nHARD (≥71): Speaker’s Assumption, Hidden Implication, Logical Flaw in Speaker’s Argument, Strengthen/Weaken a Speaker’s Claim, Shift in Position.\n\nFor each question, randomly select a type from the above lists, weighted so harder types appear more for high difficulty and direct types for low difficulty. The sequence and types must be randomized and diverse, not repetitive. All questions must be conversation/news relevant.\n\nIMPORTANT: Separate every paragraph in the dialogue with a single <br> tag. Use HTML tags, <br> for paragraph breaks. No markdown. Explanation must use line breaks for clarity.`,
    },
    "Parajumbles": {
      schemaName: "pj",
      description:
        `Generate a ${levelTag} Parajumble. 4–5 sentences (A–E), scrambled, form a coherent paragraph. Topic: factual/analytical, exam-relevant. Higher difficulty: subtler logical/pronoun/chronology connectors. No explicit position markers or numbered lists. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Vocabulary Usage": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Vocabulary Usage question. The question prompt must clearly describe what the user has to do. Randomly pick: 1) Incorrect Usage: 4 sentences (a–d) with a target word, only one is incorrect (meaning, connotation, paronym confusion). 2) Multi-Blank: If difficulty < 60, use 2 blanks; if ≥ 60, use 3. 4 options (a–d), each a set of 2 or 3 words. 3) Direct Definition: Ask for the definition of a word, and clearly <b>highlight</b> the vocab word in the question. Higher difficulty: rarer words, subtler errors, more plausible distractors. Always specify if the question is about usage or definition, and highlight the vocab word if it is a definition question. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Paracompletions": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Paragraph Completion question. Paragraph: 3–5 sentences, analytical/factual, exam-relevant. Final sentence missing, shown as '______'. 4 options (a–d), only one completes logically and stylistically. Higher difficulty: subtler logic, more nuanced distractors. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Sentence Completions": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Sentence Completion question (IPMAT/CAT style). Randomly pick: 1) Single Blank: 1 blank, 4 options. 2) Double Blank: 2 blanks, 4 options (pairs). 3) Triple Blank: 3 blanks, 4 options (triplets). Higher difficulty: more blanks, rarer words, subtler fit. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Sentence Correction": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Sentence Correction question (IPMAT/CAT style). Randomly pick: 1) Error Spotting: 1 sentence split into 4 parts (a–d), only one has a grammar error. 2) Correct Version: 1 sentence with an error, 4 corrected options. Higher difficulty: subtler grammar traps, more plausible distractors. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Idioms & Phrases": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Idioms & Phrases question. Use only standard, widely recognized idioms or phrasal verbs (as found in major dictionaries). Do NOT use literal phrases or paraphrased expressions. All answer options must be genuine idioms or phrasal verbs, each with a distinct meaning or usage. Do not use ambiguous, misleading, or synonymous options. The context must be concise (max 3 sentences). Randomly pick: (1) Meaning/Definition: 1 idiom, 4 options (one correct), <b>highlight</b> the idiom; (2) Usage: Fill in the blank with 4 idiom options, one fits. Always specify if the question is about usage or definition, and highlight the idiom/phrase if it is a definition question. The idiom and its definition/explanation must not be identical or trivially similar. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
  };

  const config = topicDescriptions[topic];

  // If topic hint/description is missing, add a generic instruction
  const description = config?.description || `Generate a ${levelTag} verbal question for the topic '${topic}'. Ensure the prompt describes what needs to be done, including the format, number of options, and what the user is expected to answer. Use <i>, <b>, <u> for formatting. No markdown.`;

  const schemaInstructions =
    config?.schemaName === "rc"
      ? "Return JSON with keys: passageTitle, passage, questions (array of 6). Each question has text, options (4 strings), correctIndex (0-3), explanation."
      : config?.schemaName === "pj"
        ? "Return ONLY a JSON object in this exact format (no markdown, no extra fields): {\"pjSentences\": [\"Sentence A text.\", \"Sentence B text.\", \"Sentence C text.\", \"Sentence D text.\"], \"pjCorrectOrder\": \"ACBD\", \"pjExplanation\": \"Explanation of the correct order, referencing logical flow and connectors.\" } STRICT REQUIREMENTS: pjSentences must be an array of exactly 4 or 5 sentences, each at least 5 words, and must be scrambled (not in correct order). pjCorrectOrder must be a string of 4 or 5 uppercase letters A-E, each letter used once, matching the correct order of the sentences. pjExplanation must be a non-empty string. The explanation must be objective, logically grounded, and defensible, providing solid reasons for why this order is correct and concrete, provable reasons for why any other order is invalid. DO NOT add any extra fields or omit any required fields. DO NOT use markdown. DO NOT return a single string, HTML, or MCQ fields. If you deviate from this schema, your output will be rejected."
        : "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation.";

  return {
    schemaName: config?.schemaName || "normal",
    prompt: `${description}${eliteClause}\n\n${schemaInstructions}\n\nTarget difficulty: ${difficulty}.`,
  };
}

export async function generateQuestion(
  topic: Topic,
  difficulty: number,
  avoidWords?: string[],
  avoidPassageTitles?: string[],
  newsHeadlines?: string[]
) {
  let { schemaName, prompt } = buildPrompt(topic, difficulty);
  // DEV ONLY: log input tokens
  if (process.env.NODE_ENV === "development") {
    // Estimate input tokens (very rough, for OpenAI: 1 token ≈ 4 chars English)
    const inputTokenEstimate = Math.ceil((prompt.length || 0) / 4);
    // eslint-disable-next-line no-console
    console.log(`[DEV] [GENERATION] Input token estimate: ${inputTokenEstimate}`);
  }

  // If RC/Conversation, inject news headlines into prompt
  if (
    newsHeadlines &&
    newsHeadlines.length > 0 &&
    (topic === "Reading Comprehension Sets" || topic === "Conversation Sets")
  ) {
    const newsPrompt =
      "\n\nCURRENT NEWS HEADLINES (for inspiration, relevance, and context):\n" +
      newsHeadlines.map((h, i) => `${i + 1}. ${h}`).join("\n") +
      "\nUse one or more of these headlines as the basis for the passage/dialogue, or as inspiration for the topic, ensuring the content is exam-relevant, current, and unique.";
    prompt += newsPrompt;
  }

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

  // For RC/Conversation: inject passage titles to avoid so the same passage topic never repeats
  let avoidPassagesClause = "";
  if (
    avoidPassageTitles &&
    avoidPassageTitles.length > 0 &&
    (topic === "Reading Comprehension Sets" || topic === "Conversation Sets")
  ) {
    avoidPassagesClause =
      "\n\nCRITICAL — Do NOT write a passage on any of these topics (they have already appeared for this user):\n" +
      avoidPassageTitles.map((t) => `- ${t}`).join("\n") +
      "\nWrite about a COMPLETELY DIFFERENT subject matter. Do NOT reuse similar themes or angles.";
  }

  // RAG: retrieve similar PYQ examples + avoidance rules in parallel
  const [ragExamples, avoidanceRules] = await Promise.all([
    retrieveExamples(topic, difficulty, 3).catch(() => []),
    getAvoidanceRules(topic),
  ]);
  const ragContext = formatExamplesForPrompt(ragExamples);
  const systemPrompt = BASE_SYSTEM_PROMPT + ragContext + avoidanceRules + avoidWordsClause + avoidPassagesClause;

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
  // DEV ONLY: log output tokens
  if (process.env.NODE_ENV === "development") {
    if (response.usage) {
      // eslint-disable-next-line no-console
      console.log(`[DEV] [GENERATION] Output tokens: ${response.usage.completion_tokens}, Input tokens: ${response.usage.prompt_tokens}, Total: ${response.usage.total_tokens}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[DEV] [GENERATION] Output tokens: unknown`);
    }
  }


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
    // Zod-based validation: will throw if not matching schema
    const result = pjSchema.safeParse(parsed);
    if (!result.success) {
      // Print the error and the raw object for debugging
      // eslint-disable-next-line no-console
      console.error("[Zod Validation Error]", result.error, parsed);
      throw new Error("AI did not return valid Parajumbles JSON: " + result.error.message);
    }
    const validated = result.data;
    return { ...validated, difficulty: assignedDifficulty, topic } as GeneratedQuestion;
  }

  const validated = normalSchema.parse(parsed);
  return { ...validated, difficulty: assignedDifficulty, topic } as GeneratedQuestion;
}
