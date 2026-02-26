// Fetch top 10 trending headlines from News API
// Replace 'YOUR_NEWS_API_KEY' with your actual API key

export async function fetchTrendingHeadlines(query = "technology OR business OR science OR politics OR economy", days = 30) {
  const apiKey = process.env.NEWS_API_KEY || "YOUR_NEWS_API_KEY";
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);
  const fromISO = dateFrom.toISOString().split("T")[0];

  const encodedQuery = encodeURIComponent(query);
  const url = `https://newsapi.org/v2/everything?q=${encodedQuery}&from=${fromISO}&sortBy=popularity&pageSize=10&language=en&apiKey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch news headlines");
  const data = await res.json();
  return data.articles?.map((a: { title: string }) => a.title) || [];
}

// Usage example:
// const headlines = await fetchTrendingHeadlines("in", "business");
// const globalHeadlines = await fetchTrendingHeadlines("us", "general");
