const express = require("express");

const router = express.Router();

async function getNews(category) {
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    throw new Error("GNEWS_API_KEY is not configured");
  }

  const url =
    "https://gnews.io/api/v4/top-headlines" +
    `?category=${encodeURIComponent(category)}` +
    "&lang=en" +
    "&country=ng" +
    "&max=10" +
    `&apikey=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.errors?.[0] || `GNews request failed (${response.status})`
    );
  }

  return (data.articles || []).map(article => ({
    title: article.title,
    description: article.description,
    content: article.content,
    url: article.url,
    image: article.image,
    publishedAt: article.publishedAt,
    source: article.source?.name || "News source"
  }));
}

router.get("/news", async (req, res) => {
  try {
    const articles = await getNews("general");
    res.json(articles);
  } catch (error) {
    console.error("News API error:", error.message);
    res.status(500).json({ error: "Unable to load news right now." });
  }
});

router.get("/entertainment", async (req, res) => {
  try {
    const articles = await getNews("entertainment");
    res.json(articles);
  } catch (error) {
    console.error("Entertainment API error:", error.message);
    res.status(500).json({
      error: "Unable to load entertainment right now."
    });
  }
});

module.exports = router;
