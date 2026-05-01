import OpenAI from "openai";
import { z } from "zod";
import type { Topic } from "@/lib/topics";
import { verScoreToPercentile } from "@/lib/scoring";
import {
  retrieveExamples,
  formatExamplesForPrompt,
  retrieveBadPatterns,
  formatBadPatternsForPrompt,
} from "@/lib/rag";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  "UNIVERSAL RULES (apply to every question): " +
  "(1) All four answer options must be completely distinct — no two options may be identical or near-identical in wording or meaning. " +
  "(2) The question field must always include the complete question text with all necessary context — never just an instruction like 'Fill in the blank' without the actual sentence/passage. " +
  "(3) There must be exactly ONE unambiguously correct answer; before finalising, verify that each incorrect option fails for a clear, specific reason. " +
  "Before delivering your output, check and ensure that every question, passage, and option is free of grammar errors and reads naturally.";


function buildPrompt(topic: Topic, difficulty: number) {
  // RC passage length calibrated to real IPMAT PYQ lengths (300-550 words)
  const rcWordCount = difficulty <= 30 ? "300-380" : difficulty <= 60 ? "360-480" : "420-550";
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
        `Generate a ${levelTag} Reading Comprehension set modelled on real IPMAT PYQ passages.\n\nPASSAGE: ${rcWordCount} words, 3–4 paragraphs. Write in the style of a polished Indian newspaper editorial or magazine article (think The Hindu, Indian Express, Business Standard) — factual, analytical, precise. Cite specific data, statistics, reports, named organisations, or real individuals where natural. Indian context (policies, cities, companies, social issues) is highly valued. Do NOT write vague or generic prose.\n\nTOPIC DIVERSITY — pick from this range each time:\n• Current affairs/business/policy: AI regulation, India’s growth sectors, startup ecosystem, climate policy, healthcare reform, media landscape, geopolitics\n• Science/nature/biology: recent discoveries, evolutionary biology, environmental science, space, medical research\n• History/biography: notable scientists, explorers, reformers, intellectual history\n• Society/philosophy/economics: consumption, gender, education reform, urban poverty, behavioural economics\n• Health/psychology: sleep science, mental health, nutrition research, cognitive biases\nDo NOT default to tech/AI every time — rotate broadly.\n\nSIX QUESTIONS — select types from this IPMAT-weighted list (types used most often in actual PYQs first):\nCORE (must appear regularly): Fact Retrieval ("According to the passage…"), Main Idea/Objective ("The main focus of the passage is…"), NOT/EXCEPT ("Which of the following is NOT true?"), Implication/Inference ("The writer implies/suggests that…").\nSECONDARY (mix in): Vocabulary in Context ("The phrase ‘…’ (para X) means…"), Author’s Purpose ("The writer’s intention in saying ‘…’ is to…"), Specific Reference ("The first/last sentence is meant to…").\nHARD ONLY (≥71): Deep Inference, Assumption, Strengthen/Weaken a specific claim.\nDo NOT use Analogy, Paradox, or Application question types — they rarely appear in IPMAT.\n\nFor each question: randomly select from the appropriate tier, vary types across the 6 questions, never repeat the same type more than twice.\n\nIMPORTANT: Separate every paragraph with a single <br> tag. HTML tags only, no markdown. Explanation must use line breaks for clarity.`,
    },
    "Conversation Sets": {
      schemaName: "rc",
      description:
        `Generate a ${levelTag} Conversation set modelled on real IPMAT debate/interview passages.\n\nDIALOGUE: 350–500 words, 2 named speakers, structured like a TV interview, panel debate, or journalistic Q&A. The topic must be substantive and exam-relevant. Topics should rotate broadly — policy debates, science controversies, social reform, economic trade-offs, education, environment. Do NOT default to tech/AI every time.\n\nSTYLE RULES:\n• The conversation MUST be a genuine intellectual clash or probing interview — not a polite exchange.\n• Speakers forcefully defend opposing positions, challenge evidence, and shift the debate.\n• Emulate the style of hard-hitting Indian news debates (NDTV, The Wire, News18 panel format) or written interview transcripts.\n• Ground references in real contexts — mention policies, data, named countries or companies where natural.\n\nSIX QUESTIONS — select from this IPMAT-weighted list:\nCORE (use regularly): Fact-based speaker question ("What does Speaker X say about…?"), Point of Contention ("The main disagreement between the speakers is…"), Speaker Agreement/Disagreement, Tone of Speaker.\nSECONDARY (mix in): Speaker’s Intention, Most Logical Response, Common Ground Identification.\nHARD ONLY (≥71): Speaker’s Assumption, Hidden Implication, Logical Flaw in Speaker’s Argument.\n\nFor each question: randomly select from the appropriate tier, vary types, do not repeat the same type more than twice.\n\nIMPORTANT: Separate every speaker turn/paragraph with a single <br> tag. HTML tags only, no markdown. Explanation must use line breaks for clarity.`,
    },
    "Parajumbles": {
      schemaName: "pj",
      description:
        `Generate a ${levelTag} Parajumble. 4–5 sentences (A–E), scrambled, form a coherent paragraph. Topic: factual/analytical, exam-relevant. Higher difficulty: subtler logical/pronoun/chronology connectors. No explicit position markers or numbered lists. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Vocabulary Usage": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Vocabulary Usage question. The question prompt must clearly describe what the user has to do. Randomly pick: 1) Incorrect Usage: 4 sentences (a–d) with a target word, only ONE sentence uses it incorrectly (meaning, connotation, or paronym confusion). CRITICAL for Incorrect Usage: Before finalising, verify every sentence against the dictionary. Do NOT flag idioms (e.g. 'bank on' = rely on), metaphorical uses, or extended senses as incorrect — these are valid. The incorrect option must violate the word's core or accepted meaning in a way that is clearly wrong, not merely unusual. If all four sentences are genuinely correct, choose a different word. 2) Multi-Blank: write the full sentence with blanks (______) in the question field; if difficulty < 60 use 2 blanks, if ≥ 60 use 3; 4 options (a–d), each a set of 2 or 3 words. 3) Direct Definition: Ask for the definition of a word, clearly <b>highlight</b> the vocab word in the question. Higher difficulty: rarer words, subtler errors, more plausible distractors. Always specify what the user must do, and highlight the vocab word for definition questions. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Paracompletions": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Paragraph Completion question. Paragraph: 3–5 sentences, analytical/factual, exam-relevant. Final sentence missing, shown as '______'. 4 options (a–d), exactly ONE completes the paragraph logically and stylistically. CRITICAL: Before finalising, check each option one by one — if more than one option can logically complete the paragraph, revise the distractor options until only ONE clearly fits the paragraph's argument, tone, and concluding logic. Each incorrect option must fail for a specific, identifiable reason. Higher difficulty: subtler logic, more nuanced distractors. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Sentence Completions": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Sentence Completion question (IPMAT/CAT style). Randomly pick: 1) Single Blank: 1 blank, 4 options. 2) Double Blank: 2 blanks, 4 options (pairs). 3) Triple Blank: 3 blanks, 4 options (triplets). CRITICAL: The 'question' field MUST contain the complete sentence with the blank(s) written as '______'. NEVER write only an instruction like 'Fill in the blank with the most appropriate word' without including the actual sentence — the sentence IS the question. Higher difficulty: more blanks, rarer words, subtler fit. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Sentence Correction": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Sentence Correction question (IPMAT/CAT style). Randomly pick: 1) Error Spotting: 1 sentence split into 4 parts (a–d), only one part has a grammar/usage error. 2) Correct Version: 1 sentence with a grammatical error, 4 corrected versions as options. CRITICAL for Correct Version: All four options must be genuinely distinct corrections — they may differ in structure, word choice, or phrasing, but each must be a complete, grammatically correct sentence. The correct option must fully and elegantly resolve the identified error. Do NOT include options that merely rearrange the same problem or add different problems. Higher difficulty: subtler grammar traps, more plausible distractors. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
    },
    "Idioms & Phrases": {
      schemaName: "normal",
      description:
        `Generate a ${levelTag} Idioms & Phrases question. Use only standard, widely recognized idioms or phrasal verbs (as found in major dictionaries). Do NOT use literal phrases or paraphrased expressions. All answer options must be genuine idioms or phrasal verbs, each with a distinct meaning or usage. Do not use ambiguous, misleading, or synonymous options. The context must be concise (max 3 sentences). Randomly pick: (1) Meaning/Definition: 1 idiom, 4 options (one correct), <b>highlight</b> the idiom in the question text; CRITICAL: write the idiom/phrase in full inside the question text — NEVER use a blank (______) for the idiom itself. (2) Usage: Fill in the blank with 4 idiom options, one fits. Always specify if the question is about usage or definition, and highlight the idiom/phrase for definition questions. The idiom and its definition/explanation must not be identical or trivially similar. Use HTML tags and paragraph breaks where applicable. No markdown.\n\nIMPORTANT: The explanation field must use line breaks to separate logical steps and make it readable.`,
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

  // Compact hint for semantic RAG query (topic + level + question type cues)
  const queryHint = `${topic} ${levelTag} ${config?.schemaName ?? "normal"}: ${description.slice(0, 250)}`;

  return {
    schemaName: config?.schemaName || "normal",
    prompt: `${description}${eliteClause}\n\n${schemaInstructions}\n\nTarget difficulty: ${difficulty}.`,
    queryHint,
  };
}

export async function generateQuestion(
  topic: Topic,
  difficulty: number,
  avoidWords?: string[],
  avoidPassageTitles?: string[],
  newsHeadlines?: string[]
) {
  const promptData = buildPrompt(topic, difficulty);
  const schemaName = promptData.schemaName;
  const queryHint = promptData.queryHint;
  let prompt = promptData.prompt;
  // DEV ONLY: log input tokens
  if (process.env.NODE_ENV === "development") {
    // Estimate input tokens (very rough, for OpenAI: 1 token ≈ 4 chars English)
    const inputTokenEstimate = Math.ceil((prompt.length || 0) / 4);
    console.log(`[DEV] [GENERATION] Input token estimate: ${inputTokenEstimate}`);
  }

  // News headlines are VOLUNTARY — inject ~35% of the time to match real PYQ
  // topic distribution (most IPMAT passages are timeless, not news-driven).
  const useNews =
    newsHeadlines &&
    newsHeadlines.length > 0 &&
    (topic === "Reading Comprehension Sets" || topic === "Conversation Sets") &&
    Math.random() < 0.35;

  if (useNews) {
    prompt +=
      "\n\nOPTIONAL NEWS CONTEXT (you may use one of these as the basis for the passage, or ignore them and write a timeless analytical passage instead):\n" +
      newsHeadlines!.map((h, i) => `${i + 1}. ${h}`).join("\n");
  }

  // For Vocab/Idioms: inject a "do not reuse" list so the same word/idiom never repeats
  // Cap at 20 most-recent to prevent unbounded prompt growth
  let avoidWordsClause = "";
  if (
    avoidWords &&
    avoidWords.length > 0 &&
    (topic === "Vocabulary Usage" || topic === "Idioms & Phrases")
  ) {
    const recentWords = avoidWords.slice(-20);
    avoidWordsClause =
      "\n\nCRITICAL — Do NOT use any of these words/idioms (they have already appeared for this user):\n" +
      recentWords.map((w) => `- ${w}`).join("\n") +
      "\nPick a completely different word/idiom that has NOT been used before.";
  }

  // For RC/Conversation: inject passage titles to avoid so the same passage topic never repeats
  // Cap at 20 most-recent to prevent unbounded prompt growth
  let avoidPassagesClause = "";
  if (
    avoidPassageTitles &&
    avoidPassageTitles.length > 0 &&
    (topic === "Reading Comprehension Sets" || topic === "Conversation Sets")
  ) {
    const recentTitles = avoidPassageTitles.slice(-20);
    avoidPassagesClause =
      "\n\nCRITICAL — Do NOT write a passage on any of these topics (they have already appeared for this user):\n" +
      recentTitles.map((t) => `- ${t}`).join("\n") +
      "\nWrite about a COMPLETELY DIFFERENT subject matter. Do NOT reuse similar themes or angles.";
  }

  // RC/Conversation: gpt-4o (long-form coherence justifies cost)
  // Short-form: gpt-4o-mini (equivalent quality at ~16× lower cost)
  // Fine-tuned model override takes precedence for short-form if set
  const isLongForm = schemaName === "rc";
  const ragTopK = isLongForm ? 5 : 2;
  const patternTopK = isLongForm ? 8 : 5;

  // RAG: retrieve semantically relevant PYQ examples + bad patterns, in parallel
  const [ragExamples, badPatterns] = await Promise.all([
    retrieveExamples(topic, difficulty, ragTopK, queryHint).catch(() => []),
    retrieveBadPatterns(topic, schemaName as "rc" | "pj" | "normal", patternTopK).catch(() => []),
  ]);
  const ragContext = formatExamplesForPrompt(ragExamples);
  const avoidanceContext = formatBadPatternsForPrompt(badPatterns);
  const systemPrompt =
    BASE_SYSTEM_PROMPT + ragContext + avoidanceContext + avoidWordsClause + avoidPassagesClause;

  const finetunedModel = process.env.FINETUNED_MODEL;
  const model = finetunedModel && !isLongForm ? finetunedModel : "gpt-4o";
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
      console.log(`[DEV] [GENERATION] Output tokens: ${response.usage.completion_tokens}, Input tokens: ${response.usage.prompt_tokens}, Total: ${response.usage.total_tokens}`);
    } else {
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
        model: "gpt-4o",
        temperature: 0.8,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              prompt +
              "\n\nCRITICAL: You must return exactly 6 questions. The passage must be at least 300 words. Do NOT omit questions or cut the passage short.",
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
      console.error("[Zod Validation Error]", result.error, parsed);
      throw new Error("AI did not return valid Parajumbles JSON: " + result.error.message);
    }
    const validated = result.data;
    return { ...validated, difficulty: assignedDifficulty, topic } as GeneratedQuestion;
  }

  const validated = normalSchema.parse(parsed);
  return { ...validated, difficulty: assignedDifficulty, topic } as GeneratedQuestion;
}
