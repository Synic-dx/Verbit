// Fetch top 10 trending headlines from News API
// Replace 'YOUR_NEWS_API_KEY' with your actual API key

export async function fetchTrendingHeadlines(country = "in", category = "general") {
  const apiKey = process.env.NEWS_API_KEY || "YOUR_NEWS_API_KEY";
  const url = `https://newsapi.org/v2/top-headlines?country=${country}&category=${category}&pageSize=10&apiKey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch news headlines");
  const data = await res.json();
  return data.articles.map((a: any) => a.title);
}

// Usage example:
// const headlines = await fetchTrendingHeadlines("in", "business");
// const globalHeadlines = await fetchTrendingHeadlines("us", "general");
