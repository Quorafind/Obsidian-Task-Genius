// @ts-ignore
import { describe, it, expect } from "@jest/globals";

// Import the internal functions we need to test
import { Text, EditorState } from "@codemirror/state";

describe("autoDateManager - Execution Tracing", () => {
	it("should trace the exact problem with user's text", () => {
		const lineText = "- [-] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		
		console.log("\n=== DETAILED EXECUTION TRACE ===");
		console.log("Original line:", lineText);
		console.log("Line length:", lineText.length);
		
		// Step 1: Manually extract block reference
		const blockRefPattern = /\s*(\^[\w-]+)\s*$/;
		const blockRefMatch = lineText.match(blockRefPattern);
		
		if (blockRefMatch) {
			console.log("\n1. Block Reference Detection:");
			console.log("   - Full match:", JSON.stringify(blockRefMatch[0]));
			console.log("   - Block ID:", blockRefMatch[1]);
			console.log("   - Match index:", blockRefMatch.index);
			console.log("   - Match length:", blockRefMatch[0].length);
			
			const cleanedText = lineText.substring(0, blockRefMatch.index).trimEnd();
			console.log("   - Cleaned text:", JSON.stringify(cleanedText));
			console.log("   - Cleaned length:", cleanedText.length);
		}
		
		// Step 2: Check task pattern
		const taskMatch = lineText.match(/^[\s|\t]*([-*+]|\d+\.)\s\[.\]\s*/);
		if (taskMatch) {
			console.log("\n2. Task Pattern:");
			console.log("   - Task prefix:", JSON.stringify(taskMatch[0]));
			console.log("   - Initial position:", taskMatch[0].length);
		}
		
		// Step 3: Look for 🚀 emoji (configured)
		console.log("\n3. Configured Emoji Search (🚀):");
		const rocketPattern = /🚀\s*\d{4}-\d{2}-\d{2}/g;
		let match;
		while ((match = rocketPattern.exec(lineText)) !== null) {
			console.log("   - Found at index:", match.index);
			console.log("   - Match:", JSON.stringify(match[0]));
			console.log("   - End position:", match.index + match[0].length);
		}
		
		// Step 4: Look for 🛫 emoji (actual)
		console.log("\n4. Actual Emoji Search (🛫):");
		const planePattern = /🛫\s*\d{4}-\d{2}-\d{2}/g;
		while ((match = planePattern.exec(lineText)) !== null) {
			console.log("   - Found at index:", match.index);
			console.log("   - Match:", JSON.stringify(match[0]));
			console.log("   - End position:", match.index + match[0].length);
		}
		
		// Step 5: Find all metadata
		console.log("\n5. All Metadata Search:");
		const metadataPatterns = [
			{ name: "Tags", pattern: /#[\w-]+/g },
			{ name: "Dataview", pattern: /\[[a-zA-Z]+::[^\]]*\]/g },
			{ name: "Date markers", pattern: /[📅🚀✅❌🛫▶️⏰🏁]\s*\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/g }
		];
		
		metadataPatterns.forEach(({ name, pattern }) => {
			console.log(`   - ${name}:`);
			pattern.lastIndex = 0;
			while ((match = pattern.exec(lineText)) !== null) {
				console.log(`     * Index ${match.index}: ${JSON.stringify(match[0])}`);
			}
		});
		
		// Step 6: Determine where cancelled date would go
		console.log("\n6. Position Analysis:");
		
		// If we found 🛫 2025-04-20
		const planeMatch = lineText.match(/🛫\s*\d{4}-\d{2}-\d{2}/);
		if (planeMatch) {
			const afterPlanePos = planeMatch.index! + planeMatch[0].length;
			console.log("   - After 🛫 date:", afterPlanePos);
			console.log("   - Text after that position:", JSON.stringify(lineText.substring(afterPlanePos)));
		}
		
		// Find the last metadata item
		let lastMetadataEnd = 0;
		[/#[\w-]+/g, /\[[a-zA-Z]+::[^\]]*\]/g, /[📅🚀✅❌🛫▶️⏰🏁]\s*\d{4}-\d{2}-\d{2}/g].forEach(pattern => {
			pattern.lastIndex = 0;
			while ((match = pattern.exec(lineText)) !== null) {
				const end = match.index + match[0].length;
				if (end > lastMetadataEnd) {
					lastMetadataEnd = end;
				}
			}
		});
		
		console.log("   - Last metadata ends at:", lastMetadataEnd);
		console.log("   - Text after last metadata:", JSON.stringify(lineText.substring(lastMetadataEnd)));
	});
});