export const TOPICS = [
  "Reading Comprehension Sets",
  "Conversation Sets",
  "Parajumbles",
  "Vocabulary Usage",
  "Paracompletions",
  "Sentence Completions",
  "Sentence Correction",
  "Idioms & Phrases",
] as const;

export type Topic = (typeof TOPICS)[number];
