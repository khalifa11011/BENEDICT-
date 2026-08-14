const express = require("express");
const OpenAI = require("openai");

const router = express.Router();

// Phase 8: build the client lazily. Creating it at module load crashed the
// whole server on boot whenever OPENAI_API_KEY was not configured.
let client = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return client;
}

router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: "Please enter a message."
      });
    }

    const openai = getClient();

    if (!openai) {
      return res.status(503).json({
        message: "BENEDICT AI is not configured."
      });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: message.trim()
    });

    res.json({
      reply: response.output_text
    });

  } catch (error) {
    console.error("OpenAI Error:", error);

    res.status(500).json({
      message: "BENEDICT AI is temporarily unavailable."
    });
  }
});

module.exports = router;
