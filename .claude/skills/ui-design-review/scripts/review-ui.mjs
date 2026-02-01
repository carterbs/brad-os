#!/usr/bin/env node

/**
 * UI Design Review Script
 *
 * Sends screenshots to OpenAI's vision API and returns design feedback.
 *
 * Usage:
 *   node review-ui.mjs <screenshot1> [screenshot2] [...] [--prompt "custom prompt"] [--model gpt-4o]
 *
 * Environment:
 *   OPENAI_API_KEY - Required. Your OpenAI API key.
 *
 * Examples:
 *   node review-ui.mjs ./screenshot.png
 *   node review-ui.mjs ./home.png ./detail.png --prompt "Focus on color contrast and typography"
 *   node review-ui.mjs ./screen.png --model gpt-4o-mini
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, extname, dirname } from "path";

const SUPPORTED_FORMATS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const DEFAULT_MODEL = "gpt-5.2";

const SYSTEM_PROMPT = `You are a senior UI/UX designer reviewing a mobile app's interface. You have deep expertise in:

- iOS Human Interface Guidelines
- Material Design principles
- Color theory and contrast ratios (WCAG accessibility)
- Typography hierarchies and readability
- Visual rhythm, spacing, and layout grids
- Gestalt principles of visual perception
- Mobile interaction patterns and affordances

When reviewing screenshots, provide actionable, specific feedback organized into these categories:

1. **Layout & Spacing** - Alignment, padding, margins, visual hierarchy
2. **Typography** - Font sizes, weights, line heights, readability
3. **Color & Contrast** - Palette cohesion, contrast ratios, accessibility
4. **Visual Polish** - Shadows, borders, rounded corners, consistency
5. **Interaction Design** - Touch targets, affordances, feedback indicators
6. **Overall Impression** - What works well and the top 3 changes that would have the biggest impact

Be specific: reference exact elements, suggest concrete values (e.g., "increase padding from ~8px to 16px"), and explain WHY each change improves the design. Prioritize changes by impact.`;

function parseArgs(args) {
  const screenshots = [];
  let prompt = "";
  let model = DEFAULT_MODEL;
  let output = "";

  let i = 0;
  while (i < args.length) {
    if (args[i] === "--prompt" && i + 1 < args.length) {
      prompt = args[i + 1];
      i += 2;
    } else if (args[i] === "--model" && i + 1 < args.length) {
      model = args[i + 1];
      i += 2;
    } else if (args[i] === "--output" && i + 1 < args.length) {
      output = args[i + 1];
      i += 2;
    } else if (args[i] === "--help" || args[i] === "-h") {
      printUsage();
      process.exit(0);
    } else {
      screenshots.push(args[i]);
      i++;
    }
  }

  return { screenshots, prompt, model, output };
}

function printUsage() {
  console.log(`
Usage: node review-ui.mjs <screenshot1> [screenshot2] [...] [options]

Options:
  --prompt "text"    Additional context or focus area for the review
  --model  name      OpenAI model to use (default: ${DEFAULT_MODEL})
  --output path.md   Save the full review conversation to a markdown file
  --help, -h         Show this help message

Environment:
  OPENAI_API_KEY    Required. Your OpenAI API key.

Examples:
  node review-ui.mjs ./screenshot.png
  node review-ui.mjs ./home.png ./detail.png --prompt "Focus on the navigation bar"
  node review-ui.mjs ./screen.png --model gpt-4o-mini
  node review-ui.mjs ./screen.png --output ./reviews/review-2025-01-15.md
`);
}

function loadImage(filepath) {
  const ext = extname(filepath).toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    throw new Error(
      `Unsupported image format: ${ext} (supported: ${[...SUPPORTED_FORMATS].join(", ")})`
    );
  }

  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };

  const data = readFileSync(filepath);
  const base64 = data.toString("base64");
  const mime = mimeMap[ext];

  return {
    filename: basename(filepath),
    dataUrl: `data:${mime};base64,${base64}`,
  };
}

async function reviewScreenshots(screenshots, userPrompt, model) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: OPENAI_API_KEY environment variable is not set.\n" +
        "Set it with: export OPENAI_API_KEY=sk-..."
    );
    process.exit(1);
  }

  // Build the content array with images and text
  const content = [];

  // Add each screenshot
  for (const path of screenshots) {
    const image = loadImage(path);
    content.push({
      type: "input_image",
      image_url: image.dataUrl,
    });
    content.push({
      type: "input_text",
      text: `[Screenshot: ${image.filename}]`,
    });
  }

  // Add the review request
  let reviewRequest = "Review these app screenshots and provide detailed UI/UX design feedback.";
  if (userPrompt) {
    reviewRequest += `\n\nAdditional context: ${userPrompt}`;
  }
  content.push({
    type: "input_text",
    text: reviewRequest,
  });

  // Try Responses API first, fall back to Chat Completions
  const response = await callOpenAI(apiKey, model, content);
  return response;
}

async function callOpenAI(apiKey, model, content) {
  // Try Responses API first
  try {
    const result = await callResponsesAPI(apiKey, model, content);
    return result;
  } catch (err) {
    // If Responses API fails (e.g., older account), fall back to Chat Completions
    if (err.status === 404 || err.code === "not_found") {
      console.error("Responses API not available, falling back to Chat Completions API...\n");
      return await callChatCompletionsAPI(apiKey, model, content);
    }
    throw err;
  }
}

async function callResponsesAPI(apiKey, model, content) {
  const body = {
    model,
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content,
      },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(
      `OpenAI Responses API error ${res.status}: ${errBody?.error?.message || res.statusText}`
    );
    err.status = res.status;
    err.code = errBody?.error?.code;
    throw err;
  }

  const data = await res.json();
  return data.output_text || data.output?.[0]?.content?.[0]?.text || "No response received.";
}

async function callChatCompletionsAPI(apiKey, model, content) {
  // Convert Responses API content format to Chat Completions format
  const chatContent = content.map((item) => {
    if (item.type === "input_image") {
      return {
        type: "image_url",
        image_url: { url: item.image_url, detail: "high" },
      };
    }
    if (item.type === "input_text") {
      return { type: "text", text: item.text };
    }
    return item;
  });

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: chatContent },
    ],
    max_tokens: 4096,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      `OpenAI Chat API error ${res.status}: ${errBody?.error?.message || res.statusText}`
    );
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No response received.";
}

function writeMarkdownReport(outputPath, { screenshots, prompt, model, feedback }) {
  const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

  const lines = [
    `# UI Design Review`,
    ``,
    `**Date:** ${timestamp}`,
    `**Model:** ${model}`,
    `**Screenshots:** ${screenshots.map((s) => basename(s)).join(", ")}`,
    ``,
  ];

  if (prompt) {
    lines.push(`## Prompt Context`, ``, prompt, ``);
  }

  lines.push(
    `## System Prompt`,
    ``,
    "```",
    SYSTEM_PROMPT,
    "```",
    ``,
    `## Review Feedback`,
    ``,
    feedback,
    ``
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.error(`Review saved to ${outputPath}`);
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  printUsage();
  process.exit(1);
}

const { screenshots, prompt, model, output } = parseArgs(args);

if (screenshots.length === 0) {
  console.error("Error: No screenshot files provided.\n");
  printUsage();
  process.exit(1);
}

console.error(`Reviewing ${screenshots.length} screenshot(s) with ${model}...\n`);

try {
  const feedback = await reviewScreenshots(screenshots, prompt, model);
  console.log(feedback);

  if (output) {
    writeMarkdownReport(output, { screenshots, prompt, model, feedback });
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
