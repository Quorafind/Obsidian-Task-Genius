// Debug script to simulate the actual task parsing process
console.log("=== Simulating Task Parsing Process ===");

// Simulate the task content
const taskContent = "12:00-13:00 New 任务 #project/任务 🔼 📅 2025-06-19";
console.log("Task content:", taskContent);

// Simulate the time parsing service configuration (from DEFAULT_SETTINGS)
const timeParsingConfig = {
  enabled: true,
  supportedLanguages: ["en", "zh"],
  dateKeywords: {
    start: ["start", "begin", "from", "starting", "begins", "开始", "从", "起始", "起", "始于", "自"],
    due: ["due", "deadline", "by", "until", "before", "expires", "ends", "截止", "到期", "之前", "期限", "最晚", "结束", "终止", "完成于"],
    scheduled: ["scheduled", "on", "at", "planned", "set for", "arranged", "安排", "计划", "在", "定于", "预定", "约定", "设定"]
  },
  removeOriginalText: true,
  perLineProcessing: true,
  realTimeReplacement: true,
  timePatterns: {
    singleTime: [
      /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g,
      /\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/g
    ],
    timeRange: [
      /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*[-~～]\s*([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g,
      /\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\s*[-~～]\s*(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/g
    ],
    rangeSeparators: ["-", "~", "～"]
  },
  timeDefaults: {
    preferredFormat: "24h",
    defaultPeriod: "AM",
    midnightCrossing: "next-day"
  }
};

console.log("\n=== Time Parsing Configuration ===");
console.log("Enabled:", timeParsingConfig.enabled);
console.log("Range separators:", timeParsingConfig.timePatterns.rangeSeparators);

// Test the time range regex from the config
console.log("\n=== Testing Time Range Regex from Config ===");
const timeRangeRegex = timeParsingConfig.timePatterns.timeRange[0];
console.log("Regex:", timeRangeRegex);

const matches = [...taskContent.matchAll(timeRangeRegex)];
console.log("Matches found:", matches.length);
matches.forEach((match, index) => {
  console.log(`Match ${index}:`, {
    fullMatch: match[0],
    position: match.index,
    groups: match.slice(1)
  });
});

// Simulate the parseTimeComponent function
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

// Simulate the extractTimeComponents function
function extractTimeComponents(text) {
  const timeComponents = {};
  const timeExpressions = [];

  // Check for time ranges first
  const rangeMatches = [...text.matchAll(timeRangeRegex)];
  
  for (const match of rangeMatches) {
    const fullMatch = match[0];
    const index = match.index || 0;

    // Parse start and end times
    const parts = fullMatch.split(/\s*[-~\uff5e]\s*/);
    if (parts.length === 2) {
      const startTime = parseTimeComponent(parts[0]);
      const endTime = parseTimeComponent(parts[1]);

      if (startTime && endTime) {
        startTime.isRange = true;
        endTime.isRange = true;
        startTime.rangePartner = endTime;
        endTime.rangePartner = startTime;

        timeExpressions.push({
          text: fullMatch,
          index,
          isRange: true,
          rangeStart: startTime,
          rangeEnd: endTime,
        });

        // Determine context for time range
        const context = determineTimeContext(text, fullMatch, index);
        console.log("Determined context:", context);
        
        if (context === "start" || !timeComponents.startTime) {
          timeComponents.startTime = startTime;
          timeComponents.endTime = endTime;
        } else if (context === "due") {
          timeComponents.dueTime = startTime;
          // For due time ranges, we might want to use the end time as the actual due time
          // But for now, let's keep it as start time for consistency
        } else if (context === "scheduled") {
          timeComponents.scheduledTime = startTime;
        }
      }
    }
  }

  return { timeComponents, timeExpressions };
}

// Simulate the determineTimeContext function
function determineTimeContext(text, expression, index) {
  const beforeText = text.substring(Math.max(0, index - 20), index).toLowerCase();
  const afterText = text.substring(index + expression.length, Math.min(text.length, index + expression.length + 20)).toLowerCase();
  const context = beforeText + " " + afterText;

  // Check for start keywords first
  for (const keyword of timeParsingConfig.dateKeywords.start) {
    if (context.includes(keyword.toLowerCase())) {
      return "start";
    }
  }

  // Check for scheduled keywords
  for (const keyword of timeParsingConfig.dateKeywords.scheduled) {
    if (context.includes(keyword.toLowerCase())) {
      return "scheduled";
    }
  }

  // Check for due keywords
  for (const keyword of timeParsingConfig.dateKeywords.due) {
    if (context.includes(keyword.toLowerCase())) {
      return "due";
    }
  }

  // Default based on common patterns
  if (context.includes("at") || context.includes("@")) {
    return "scheduled";
  }

  // Default to due if no specific context found
  return "due";
}

console.log("\n=== Simulating extractTimeComponents ===");
const result = extractTimeComponents(taskContent);

// Handle circular references by creating a safe representation
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, val) => {
    if (val != null && typeof val == "object") {
      if (seen.has(val)) {
        return "[Circular]";
      }
      seen.add(val);
    }
    return val;
  }, 2);
}

console.log("Time components:", safeStringify(result.timeComponents));
console.log("Time expressions:", safeStringify(result.timeExpressions));

// Check what should be in the task metadata
console.log("\n=== Expected Task Metadata ===");
if (Object.keys(result.timeComponents).length > 0) {
  console.log("Should have timeComponents:", result.timeComponents);
  console.log("Should have enhancedDates (if combined with date)");
} else {
  console.log("No time components found - this is the problem!");
}