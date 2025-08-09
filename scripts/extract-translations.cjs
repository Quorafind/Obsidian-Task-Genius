const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const SRC_DIR = path.resolve(__dirname, "../src");
const TRANSLATIONS_DIR = path.resolve(SRC_DIR, "translations/locale");
const BASE_LOCALE = "en";

// Define supported locales
const SUPPORTED_LOCALES = [
	"ar",
	"cs",
	"da",
	"de",
	"en",
	"en-gb",
	"es",
	"fr",
	"hi",
	"id",
	"it",
	"ja",
	"ko",
	"nl",
	"no",
	"pl",
	"pt",
	"pt-br",
	"ro",
	"ru",
	"tr",
	"zh-cn",
	"zh-tw",
	"uk",
];

function extractTranslationKeys(sourceFile) {
	const keys = [];

	function visit(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "t"
		) {
			const firstArg = node.arguments[0];
			if (ts.isStringLiteral(firstArg)) {
				keys.push({
					key: firstArg.text,
					location: `${sourceFile.fileName}:${
						sourceFile.getLineAndCharacterOfPosition(
							node.getStart()
						).line + 1
					}`,
				});
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return keys;
}

function scanDirectory(dir) {
	const allKeys = [];

	function scan(currentDir) {
		const entries = fs.readdirSync(currentDir);

		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry);
			const stat = fs.statSync(fullPath);

			if (stat.isDirectory()) {
				scan(fullPath);
			} else if (stat.isFile() && /\.(ts|tsx)$/.test(entry)) {
				const sourceFile = ts.createSourceFile(
					fullPath,
					fs.readFileSync(fullPath, "utf-8"),
					ts.ScriptTarget.Latest,
					true
				);

				allKeys.push(...extractTranslationKeys(sourceFile));
			}
		}
	}

	scan(dir);
	return allKeys;
}

function loadTranslations(locale) {
	try {
		const filePath = path.join(TRANSLATIONS_DIR, `${locale}.ts`);
		if (!fs.existsSync(filePath)) {
			return {};
		}
		const content = fs.readFileSync(filePath, "utf-8");
		const sourceFile = ts.createSourceFile(
			filePath,
			content,
			ts.ScriptTarget.Latest,
			true
		);

		// Simple AST parsing to extract the translations object
		let translations = {};
		ts.forEachChild(sourceFile, (node) => {
			if (ts.isVariableStatement(node)) {
				const declarations = node.declarationList.declarations;
				if (declarations.length > 0) {
					const declaration = declarations[0];
					const initializer = declaration.initializer;
					if (
						initializer &&
						ts.isObjectLiteralExpression(initializer)
					) {
						initializer.properties.forEach((prop) => {
							if (
								ts.isPropertyAssignment(prop) &&
								ts.isStringLiteral(prop.initializer) &&
								ts.isIdentifier(prop.name)
							) {
								translations[prop.name.text] =
									prop.initializer.text;
							}
						});
					}
				}
			}
		});

		return translations;
	} catch (error) {
		console.warn(`Failed to load translations for ${locale}:`, error);
		return {};
	}
}

function generateTemplates(extractedKeys) {
	const baseTranslations = loadTranslations(BASE_LOCALE);

	// First, deduplicate keys while preserving all unique locations
	const uniqueKeys = extractedKeys.reduce((acc, { key, location }) => {
		if (!acc[key]) {
			acc[key] = { key, locations: [location] };
		} else {
			acc[key].locations.push(location);
		}
		return acc;
	}, {});

	// Generate template for each supported locale
	SUPPORTED_LOCALES.forEach((locale) => {
		const templatePath = path.resolve(
			__dirname,
			`../translation-templates/${locale}.json`
		);

		// Load existing template if it exists
		let existingTemplate = {};
		try {
			if (fs.existsSync(templatePath)) {
				existingTemplate = JSON.parse(
					fs.readFileSync(templatePath, "utf-8")
				);
			}
		} catch (error) {
			console.warn(
				`Failed to load existing template for ${locale}:`,
				error
			);
		}

		const currentTranslations = loadTranslations(locale);
		const existingEntries = existingTemplate.entries || [];

		// Create a map of existing translations for quick lookup
		const existingTranslationsMap = existingEntries.reduce((acc, entry) => {
			acc[entry.key] = entry;
			return acc;
		}, {});

		// Merge existing and new translations
		const entries = Object.values(uniqueKeys).map(({ key, locations }) => {
			const existing = existingTranslationsMap[key];
			let status = "UNTRANSLATED";
			let target = "";

			if (existing) {
				// Preserve existing translation and status
				status = existing.status;
				target = existing.target;
			} else if (currentTranslations[key]) {
				status = "TRANSLATED";
				target = currentTranslations[key];
			} else if (locale !== BASE_LOCALE && baseTranslations[key]) {
				status = "UNTRANSLATED";
			}

			return {
				key,
				status,
				locations,
				source: baseTranslations[key] || key,
				target,
			};
		});

		const template = {
			language: locale,
			entries,
			lastUpdated: new Date().toISOString(),
		};

		// Create directory if it doesn't exist
		const outputDir = path.dirname(templatePath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
		console.log(
			`Translation template for ${locale} written to: ${templatePath}`
		);
	});
}

function main() {
	console.log("Scanning for translation keys...");
	const extractedKeys = scanDirectory(SRC_DIR);
	console.log(`Found ${extractedKeys.length} translation keys`);

	generateTemplates(extractedKeys);
}

main();
