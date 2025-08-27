#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import semver from 'semver';

// Get the current version from package.json
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const currentVersion = packageJson.version;

// Get the latest tag version
let latestTag = null;
try {
	const tagOutput = execSync('git tag -l --sort=-v:refname | head -1', { encoding: 'utf8' }).trim();
	if (tagOutput) {
		latestTag = tagOutput.replace(/^v/, '');
	}
} catch (e) {
	// No tags found
}

// Check for version mismatch warning
if (latestTag && semver.gt(latestTag, currentVersion)) {
	console.warn(`⚠️  Warning: package.json version (${currentVersion}) is behind latest tag (${latestTag})`);
	console.warn(`   You may want to sync package.json version first.`);
	console.log('');
}

// Parse command line arguments
const args = process.argv.slice(2);
const increment = args[0]; // 'patch', 'minor', 'major', or undefined

// Check if we're already on a beta version
const isCurrentlyBeta = semver.prerelease(currentVersion) !== null;

let releaseCommand = 'npx release-it --config .release-it.beta.cjs';

if (isCurrentlyBeta && (!increment || increment === 'continue')) {
	// If already on beta and no increment specified, just bump the prerelease
	console.log(`📦 Current version: ${currentVersion} (beta)`);
	console.log('🔄 Continuing beta sequence...');
	// Use 'prerelease' increment to properly continue the beta sequence
	releaseCommand += ' prerelease --preRelease=beta';
} else if (increment === 'patch' || increment === 'minor' || increment === 'major') {
	// If increment is specified, create new beta.0 for that version
	console.log(`📦 Current version: ${currentVersion}`);
	console.log(`🚀 Creating new ${increment} beta version...`);
	releaseCommand += ` ${increment} --preRelease=beta`;
} else if (!isCurrentlyBeta) {
	// If not on beta and no increment, default to patch
	console.log(`📦 Current version: ${currentVersion} (stable)`);
	console.log('🚀 Creating new patch beta version...');
	releaseCommand += ' patch --preRelease=beta';
} else {
	// Default to continuing prerelease
	console.log(`📦 Current version: ${currentVersion} (beta)`);
	console.log('🔄 Continuing beta sequence...');
	// Use 'prerelease' increment to properly continue the beta sequence
	releaseCommand += ' prerelease --preRelease=beta';
}

// Add any additional arguments
const additionalArgs = args.slice(1).join(' ');
if (additionalArgs) {
	releaseCommand += ' ' + additionalArgs;
}

console.log(`\n📝 Executing: ${releaseCommand}\n`);

try {
	execSync(releaseCommand, { stdio: 'inherit' });
} catch (error) {
	console.error('❌ Release failed:', error.message);
	process.exit(1);
}