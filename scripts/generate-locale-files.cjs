const fs = require("fs");
const path = require("path");

const LOCALE_DIR = path.resolve(__dirname, "../src/translations/locale");
const TEMPLATE_DIR = path.resolve(__dirname, "../translation-templates");

// Only generate the following locales
const LOCALES = {
	"en-gb": "British English",
	en: "English",
	ja: "Japanese",
	"pt-br": "Brazilian Portuguese",
	ru: "Russian",
	uk: "Ukrainian",
	"zh-cn": "Simplified Chinese",
	"zh-tw": "Traditional Chinese",
};

const TEMPLATE = (lang, translations) => `// ${lang} translations
const translations = ${JSON.stringify(translations, null, 2)};

export default translations;
`;

function loadTemplateTranslations(locale) {
	try {
		const templatePath = path.join(TEMPLATE_DIR, `${locale}.json`);
		if (!fs.existsSync(templatePath)) {
			return {};
		}
		const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));

		// Try to load existing translations file if it exists
		let existingTranslations = {};
		const existingFilePath = path.join(LOCALE_DIR, `${locale}.ts`);
		if (fs.existsSync(existingFilePath)) {
			const content = fs.readFileSync(existingFilePath, "utf-8");
			const match = content.match(
				/const translations = (\{[\s\S]*?\n\});/
			);
			if (match && match[1]) {
				try {
					// Convert the matched string to a JavaScript object
					existingTranslations = eval(`(${match[1]})`);
				} catch (e) {
					console.warn(
						`Failed to parse existing translations for ${locale}:`,
						e
					);
				}
			}
		}

		const translations = { ...existingTranslations };

		// Only add untranslated entries to the end
		template.entries.forEach((entry) => {
			// Skip if already in existing translations
			if (translations[entry.key] !== undefined) {
				return;
			}

			// Use the source text as the target if target is empty
			translations[entry.key] = entry.target || entry.source;

			// Mark all generated entries as TRANSLATED
			if (template.entries.indexOf(entry) !== -1) {
				entry.status = "TRANSLATED";
			}
		});

		// Write back the updated template with TRANSLATED status
		fs.writeFileSync(
			templatePath,
			JSON.stringify(template, null, 2),
			"utf-8"
		);

		return translations;
	} catch (error) {
		console.warn(`Failed to load template for ${locale}:`, error);
		return {};
	}
}

function generateLocaleFiles() {
	// Create locale directory if it doesn't exist
	if (!fs.existsSync(LOCALE_DIR)) {
		fs.mkdirSync(LOCALE_DIR, { recursive: true });
	}

	// Process each locale
	for (const [locale, language] of Object.entries(LOCALES)) {
		const templatePath = path.join(TEMPLATE_DIR, `${locale}.json`);

		if (fs.existsSync(templatePath)) {
			console.log(
				`\nProcessing translations for ${language} (${locale})...`
			);

			// Generate the locale file
			const filename = `${locale}.ts`;
			const filepath = path.join(LOCALE_DIR, filename);
			const translations = loadTemplateTranslations(locale);

			fs.writeFileSync(filepath, TEMPLATE(language, translations));
			console.log(`Generated ${filename}`);
		} else {
			console.warn(`Template file not found for ${locale}`);
		}
	}
}

// Main function
function main() {
	try {
		generateLocaleFiles();
	} catch (error) {
		console.error("Error during locale file generation:", error);
		process.exit(1);
	}
}

main();
