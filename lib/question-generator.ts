import OpenAI from "openai";
import { z } from "zod";
import type { Topic } from "@/lib/topics";
import { verScoreToPercentile } from "@/lib/scoring";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const normalSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(5),
  difficulty: z.number().min(0).max(100),
});

const rcSchema = z.object({
  passageTitle: z.string().min(3),
  passage: z.string().min(120),
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
  difficulty: z.number().min(0).max(100),
});

const pjSchema = z.object({
  pjSentences: z.array(z.string().min(5)).min(4).max(5),
  pjCorrectOrder: z.string().regex(/^[A-E]{4,5}$/),
  difficulty: z.number().min(0).max(100),
});

export type GeneratedQuestion =
  | (z.infer<typeof normalSchema> & { topic: Topic })
  | (z.infer<typeof rcSchema> & { topic: Topic })
  | (z.infer<typeof pjSchema> & { topic: Topic });

const SYSTEM_PROMPT =
  "You generate CAT/IPMAT verbal questions. Return only valid JSON. " +
  "Follow the requested schema precisely. Avoid markdown.";

function buildPrompt(topic: Topic, difficulty: number) {
  const percentile = verScoreToPercentile(difficulty);
  const levelTag = `CAT Percentile ${percentile} Level ${topic} VA qs`;

  if (topic === "Reading Comprehension Sets") {
    return {
      schemaName: "rc",
      prompt:
        `Generate a Reading Comprehension passage with exactly 6 questions. ${levelTag}. ` +
        "Return JSON with keys: passageTitle, passage, questions (array of 6). " +
        "Each question has text, options (4 strings), correctIndex (0-3), explanation. " +
        `Target difficulty: ${difficulty}.`,
    };
  }

  if (topic === "Conversation Sets") {
    return {
      schemaName: "rc",
      prompt:
        `Generate a short dialogue or conversation with exactly 6 questions. ${levelTag}. ` +
        "Return JSON with keys: passageTitle, passage, questions (array of 6). " +
        "Each question has text, options (4 strings), correctIndex (0-3), explanation. " +
        `Target difficulty: ${difficulty}.`,
    };
  }

  if (topic === "Parajumbles") {
    return {
      schemaName: "pj",
      prompt:
        `Generate a Parajumbles question with 4-5 sentences. ${levelTag}. ` +
        "Return JSON with keys: pjSentences (array of sentences), pjCorrectOrder " +
        "(string like BDAC using letters A-E). " +
        `Target difficulty: ${difficulty}.`,
    };
  }

  if (topic === "Vocabulary Usage") {
    return {
      schemaName: "normal",
      prompt:
        `Generate a vocabulary usage question where the user identifies the wrong usage. ${levelTag}. ` +
        "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation. " +
        `Target difficulty: ${difficulty}.`,
    };
  }

  if (topic === "Paracompletions") {
    return {
      schemaName: "normal",
      prompt:
        `Generate a paracompletion question focused on inference. ${levelTag}. ` +
        "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation. " +
        `Target difficulty: ${difficulty}.`,
    };
  }

  if (topic === "Sentence Completions") {
    return {
      schemaName: "normal",
      prompt:
        `Generate a sentence completion question focused on grammar and structure. ${levelTag}. ` +
        "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation. " +
        `Target difficulty: ${difficulty}.`,
    };
  }

  if (topic === "Idioms & Phrases") {
    return {
      schemaName: "normal",
      prompt:
        `Generate an idioms and phrases question (meaning or correct usage). ${levelTag}. ` +
        "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation. " +
        `Target difficulty: ${difficulty}.`,
    };
  }

  return {
    schemaName: "normal",
    prompt:
      `Generate a single verbal aptitude question. ${levelTag}. ` +
      "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation. " +
      `Target difficulty: ${difficulty}. Topic: ${topic}.`,
  };
}

export async function generateQuestion(topic: Topic, difficulty: number) {
  const { schemaName, prompt } = buildPrompt(topic, difficulty);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.6,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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

  if (schemaName === "rc") {
    const validated = rcSchema.parse(parsed);
    return { ...validated, topic } as GeneratedQuestion;
  }

  if (schemaName === "pj") {
    const validated = pjSchema.parse(parsed);
    return { ...validated, topic } as GeneratedQuestion;
  }

  const validated = normalSchema.parse(parsed);
  return { ...validated, topic } as GeneratedQuestion;
}
