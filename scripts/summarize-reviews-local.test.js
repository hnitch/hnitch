import assert from "node:assert/strict";
import test from "node:test";

import {
  callLocalReviewModel,
  extractOllamaContent,
  normaliseLocalModelName,
  normaliseLocalModelUrl,
} from "./summarize-reviews-local.js";

test("accepts normal Ollama model identifiers and rejects control syntax", () => {
  assert.equal(normaliseLocalModelName("gpt-oss:20b"), "gpt-oss:20b");
  assert.equal(normaliseLocalModelName(" qwen3:8b "), "qwen3:8b");
  assert.throws(
    () => normaliseLocalModelName("gpt-oss:20b\nrun something else"),
    /unsupported characters/u,
  );
});

test("keeps the default model endpoint on loopback", () => {
  assert.equal(normaliseLocalModelUrl(), "http://127.0.0.1:11434");
  assert.equal(normaliseLocalModelUrl("http://localhost:11434/"), "http://localhost:11434");
});

test("rejects a remote model endpoint unless it is explicitly allowed", () => {
  assert.throws(
    () => normaliseLocalModelUrl("http://100.64.0.10:11434"),
    /Refusing a non-loopback model URL/u,
  );
  assert.equal(
    normaliseLocalModelUrl("http://100.64.0.10:11434", true),
    "http://100.64.0.10:11434",
  );
});

test("extracts Ollama chat content and rejects empty responses", () => {
  assert.equal(extractOllamaContent({ message: { content: " {\"summaries\":[]} " } }), "{\"summaries\":[]}");
  assert.throws(() => extractOllamaContent({ message: { content: "" } }), /no text response/u);
});

test("sends a non-streaming JSON request to the selected local model", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ message: { content: "{\"summaries\":[]}" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const content = await callLocalReviewModel({
    systemPrompt: "trusted guide",
    prompt: "review payload",
    model: "gpt-oss:20b",
    fetchImpl,
  });

  assert.equal(content, "{\"summaries\":[]}");
  assert.equal(request.url, "http://127.0.0.1:11434/api/chat");
  assert.equal(request.body.model, "gpt-oss:20b");
  assert.equal(request.body.stream, false);
  assert.equal(request.body.format, "json");
  assert.deepEqual(request.body.messages.map(({ role }) => role), ["system", "user"]);
});
