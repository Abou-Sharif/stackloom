import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { reporterFromOptions } from "../../services/index.js";

function feedbackDir() {
  return path.join(process.cwd(), ".loom", "ai");
}

function feedbackFile() {
  return path.join(feedbackDir(), "feedback.json");
}

function loadFeedback() {
  const file = feedbackFile();
  if (!existsSync(file)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return { entries: [] };
  }
}

function saveFeedback(data) {
  const dir = feedbackDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(feedbackFile(), JSON.stringify(data, null, 2), "utf-8");
}

export default async function aiFeedback(action, options = {}) {
  const reporter = reporterFromOptions(options);

  if (action === "review") {
    const data = loadFeedback();
    const entries = data.entries || [];

    if (entries.length === 0) {
      reporter.info("No feedback recorded yet.");
      reporter.result({ count: 0 });
      reporter.flush();
      return;
    }

    reporter.info(`Found ${entries.length} feedback entry(ies):`);
    for (const entry of entries) {
      const stars = "⭐".repeat(entry.rating || 0);
      console.log(`\n[${entry.timestamp}] Rating: ${entry.rating || "?"} ${stars}`);
      if (entry.message) console.log(`  Message: ${entry.message}`);
      if (entry.command) console.log(`  Command: ${entry.command}`);
      if (entry.context) console.log(`  Context: ${entry.context}`);
    }

    // Calculate average rating
    const ratings = entries.filter((e) => e.rating).map((e) => e.rating);
    if (ratings.length > 0) {
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      reporter.info(`\nAverage rating: ${avg.toFixed(1)} / 5 (${ratings.length} rating(s))`);
    }

    reporter.result({ count: entries.length });
    reporter.flush();
    return;
  }

  // Collect feedback entry
  const rating = options.rating || options.rating === 0 ? Number(options.rating) : null;
  const message = options.message || options.msg || "";
  const command = options.command || process.argv.slice(2).join(" ") || "";

  if (rating === null && !message) {
    reporter.error(
      'Usage:\n  loom ai feedback --rating 4 --msg "useful suggestion"\n  loom ai feedback --review',
    );
    reporter.result({ error: "Provide --rating and/or --msg" });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    rating,
    message: message || "",
    command,
    context: process.cwd(),
  };

  const data = loadFeedback();
  data.entries = data.entries || [];
  data.entries.push(entry);
  saveFeedback(data);

  const stars = rating ? "⭐".repeat(rating) : "";
  reporter.success(
    `Feedback saved${stars ? ` (${rating}/5 ${stars})` : ""}${message ? `: "${message}"` : ""}`,
  );
  reporter.result({ saved: true, entry });
  reporter.flush();
}
