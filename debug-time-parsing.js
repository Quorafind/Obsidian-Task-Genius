// Debug script to test time parsing
const testText = "12:00-13:00 New 任务 #project/任务 🔼 📅 2025-06-19";

// Test the regex patterns
const TIME_RANGE = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*[-~～]\s*([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g;

console.log("Testing time range regex:");
console.log("Text:", testText);
console.log("Regex:", TIME_RANGE);

const matches = [...testText.matchAll(TIME_RANGE)];
console.log("Matches found:", matches.length);
matches.forEach((match, index) => {
  console.log(`Match ${index}:`, match[0], "at position", match.index);
});

// Test individual time parsing
const timeText = "12:00";
const TIME_24H = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
console.log("\nTesting individual time parsing:");
console.log("Time text:", timeText);
console.log("24h regex match:", timeText.match(TIME_24H));