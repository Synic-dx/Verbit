import { NextResponse } from "next/server";
import { z } from "zod";

import { generateQuestion } from "@/lib/question-generator";
import { fetchTrendingHeadlines } from "@/lib/news-api";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import type { Topic } from "@/lib/topics";

const bodySchema = z.object({
  topic: z.string(),
  difficulty: z.number().min(0).max(100),
});

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const topic = body.topic as Topic;
  const difficulty = body.difficulty;

  // Expanded news fetching for all major global countries, India, and all relevant themes, prioritizing trending/viral content
  let newsHeadlines: string[] = [];
  if (
    topic === "Reading Comprehension Sets" ||
    topic === "Conversation Sets"
  ) {
    try {
      // Define broad queries to fetch diverse, high-impact news
      const queries = [
        "technology OR AI OR startup OR innovation",
        "business OR economy OR market OR finance",
        "politics OR policy OR election OR government",
        "science OR health OR climate OR space",
        "entertainment OR culture OR social media OR trending"
      ];

      // Fetch from all queries in parallel
      const fetchPromises = queries.map((q) => fetchTrendingHeadlines(q, 30));
      const results = await Promise.all(fetchPromises);
      let allHeadlines = results.flat().filter(Boolean);

      // Deduplicate (case-insensitive, ignoring whitespace/punctuation)
      const seen = new Set<string>();
      allHeadlines = allHeadlines.filter((h) => {
        const norm = h.replace(/[\s\W]+/g, "").toLowerCase();
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });

      // Prioritize global headlines by keywords (virality, importance, relevance, wide trends)
      const priorityKeywords = [
        "trending", "viral", "breaking", "buzz", "must-read", "top", "exclusive", "debate", "controversy", "record", "award", "summit", "launch", "startup", "AI", "climate", "mental health", "leadership", "innovation",
        "global", "worldwide", "international", "economy", "technology", "sports", "entertainment", "politics", "science", "health", "environment", "festival", "event", "market", "industry", "education", "youth", "internet", "social media",
        "UN", "United Nations", "WHO", "World Health Organization", "Olympics", "World Cup", "summit", "conference", "agreement", "treaty", "crisis", "inflation", "recession", "pandemic", "epidemic", "migration", "refugee", "peace talks", "trade", "sanctions",
        "election", "government", "prime minister", "president", "parliament", "congress", "senate", "minister", "cabinet", "policy", "law", "court", "supreme court", "justice", "rights", "protest", "strike", "demonstration", "movement", "campaign",
        "merger", "acquisition", "IPO", "stock market", "shares", "cryptocurrency", "bitcoin", "blockchain", "investment", "venture capital", "funding", "startup", "unicorn", "layoff", "hiring", "job market", "employment", "unemployment",
        "disaster", "earthquake", "flood", "hurricane", "cyclone", "storm", "wildfire", "tsunami", "eruption", "drought", "heatwave", "coldwave", "blizzard", "avalanche", "landslide", "volcano", "rescue", "evacuation",
        "space", "nasa", "spacex", "rocket", "satellite", "mars", "moon", "launch", "mission", "astronaut", "telescope", "discovery", "exploration",
        "award", "nobel", "oscar", "grammy", "emmy", "film festival", "box office", "blockbuster", "premiere", "release", "album", "concert", "tour", "festival", "celebrity", "scandal", "viral video", "meme", "trend",
        "AI", "artificial intelligence", "machine learning", "deep learning", "robotics", "automation", "data", "cloud", "cybersecurity", "privacy", "hack", "breach", "leak", "regulation", "ban", "restriction", "policy change",
        // Conversation/Interview/Podcast specific
        "podcast", "interview", "conversation", "talk show", "panel", "roundtable", "guest", "host", "Q&A", "fireside chat", "webinar", "livestream", "broadcast", "radio show", "audio", "voice", "discussion", "debate", "celebrity interview", "expert interview", "influencer", "YouTuber", "streamer", "Spotify", "Apple Podcasts", "Anchor", "Google Podcasts", "viral podcast", "trending podcast", "exclusive interview", "featured guest", "special guest"
      ];
      
      // Filter for only widely relevant, trending, or major headlines
      const prioritizedGlobal = allHeadlines.filter(h => {
        const lower = h.toLowerCase();
        // Must match at least one keyword and not be overly local or niche
        if (!priorityKeywords.some(kw => lower.includes(kw.toLowerCase()))) return false;
        // Exclude headlines that mention only local places/events (very niche)
        const nichePatterns = [/local\b/, /regional\b/, /village\b/, /district\b/, /municipal\b/, /parish\b/, /county\b/, /township\b/, /neighborhood\b/, /suburb\b/, /minor league/, /small town/, /local council/, /city hall/];
        if (nichePatterns.some(rx => rx.test(lower))) return false;
        return true;
      });
      
      newsHeadlines = prioritizedGlobal.length > 0 ? prioritizedGlobal : allHeadlines;

      // Fallback: if no headlines, use a default message
      if (!newsHeadlines.length) {
        newsHeadlines = ["No current news headlines available."];
      }
    } catch (e) {
      // If news fetch fails, continue without headlines
      newsHeadlines = [];
    }
  }

  const generated = await generateQuestion(topic, difficulty, undefined, undefined, newsHeadlines);

  await connectDb();
  const created = await QuestionModel.create({
    topic,
    question: (generated as any).question,
    options: (generated as any).options,
    correctIndex: (generated as any).correctIndex,
    explanation: (generated as any).explanation,
    passage: (generated as any).passage,
    passageTitle: (generated as any).passageTitle,
    questions: (generated as any).questions,
    pjSentences: (generated as any).pjSentences,
    pjCorrectOrder: (generated as any).pjCorrectOrder,
    pjExplanation: (generated as any).pjExplanation,
    difficulty: generated.difficulty,
  });

  return NextResponse.json({
    id: String(created._id),
    ...generated,
  });
}
