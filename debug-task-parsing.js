// Debug script to test task parsing with time components
const taskContent = "12:00-13:00 New 任务 #project/任务 🔼 📅 2025-06-19";

console.log("Testing task content:", taskContent);

// Test the time parsing service patterns
const TIME_RANGE = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*[-~～]\s*([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g;

console.log("\n=== Time Range Pattern Test ===");
const rangeMatches = [...taskContent.matchAll(TIME_RANGE)];
console.log("Range matches found:", rangeMatches.length);
rangeMatches.forEach((match, index) => {
  console.log(`Range Match ${index}:`, {
    fullMatch: match[0],
    position: match.index,
    startHour: match[1],
    startMinute: match[2],
    endHour: match[4],
    endMinute: match[5]
  });
});

// Test context determination
const beforeText = taskContent.substring(Math.max(0, 0 - 20), 0).toLowerCase();
const afterText = taskContent.substring(0 + "12:00-13:00".length, Math.min(taskContent.length, 0 + "12:00-13:00".length + 20)).toLowerCase();
const context = beforeText + " " + afterText;

console.log("\n=== Context Analysis ===");
console.log("Before text:", beforeText);
console.log("After text:", afterText);
console.log("Combined context:", context);

// Test date keywords
const dateKeywords = {
  start: ["start", "from", "begin", "开始"],
  due: ["due", "deadline", "by", "截止", "到期"],
  scheduled: ["at", "on", "scheduled", "安排", "@"]
};

console.log("\n=== Keyword Detection ===");
for (const [type, keywords] of Object.entries(dateKeywords)) {
  const found = keywords.some(keyword => context.includes(keyword.toLowerCase()));
  console.log(`${type}: ${found} (keywords: ${keywords.join(', ')})`);
}

// Test if the time range would be detected as "due" (default)
console.log("\nExpected context type: due (default)");

// Test individual time parsing
function parseTimeComponent(timeText) {
  const cleanedText = timeText.trim();
  
  // Try 24-hour format
  const match24h = cleanedText.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (match24h) {
    const hour = parseInt(match24h[1], 10);
    const minute = parseInt(match24h[2], 10);
    const second = match24h[3] ? parseInt(match24h[3], 10) : undefined;
    
    return {
      hour,
      minute,
      second,
      originalText: cleanedText,
      isRange: false,
    };
  }
  return null;
}

console.log("\n=== Individual Time Component Parsing ===");
const startTime = parseTimeComponent("12:00");
const endTime = parseTimeComponent("13:00");

console.log("Start time component:", startTime);
console.log("End time component:", endTime);

if (startTime && endTime) {
  startTime.isRange = true;
  endTime.isRange = true;
  startTime.rangePartner = endTime;
  endTime.rangePartner = startTime;
  
  console.log("Range setup complete:");
  console.log("Start time with range:", startTime);
  console.log("End time with range:", endTime);
}