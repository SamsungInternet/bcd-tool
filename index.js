#!/usr/bin/env node

const fs = require('mz/fs');
const path = require('path');
const simpleGit = require('simple-git/promise');
const gitPath = path.join(__dirname, 'browser-compat-data/');
const util = require('util');
const glob = util.promisify(require('glob'));
const remote = 'https://github.com/mdn/browser-compat-data.git';

const mappings = [
	[6, 56],
	[7, 59],
	[8, 63],
	[9, 67],
	[10, 71],
];

function getSamsungVersion(chromeVersion) {
	if (chromeVersion < mappings[0][1]) return true;

	let version = false;
	for (const [samsung, chrome] of mappings) {
		if (chromeVersion <= chrome) {
			version = samsung;
			break;
		}
	}
	return version;
}

(async function main() {

	// Clone if it is not already downloaded
	if (!await fs.exists(gitPath)) {
		await fs.mkdir(gitPath);
		const git = simpleGit(gitPath);
		console.log('updating browser-compat-data');
		await git
		.silent(true)
		.clone(remote, gitPath, {});
	}

	const files = await glob(path.join(gitPath, '**/*.json'));
	for (const filepath of files) {
		console.log(filepath);
		const file = JSON.parse(
			await fs.readFile(filepath,'utf8')
		);
		

		for (const api of Object.keys(file.api)) {
			// Update file in place
			console.log(Object.keys(api));
		}

		// Write it back out, 2 spaces seperation with newline at end.
		fs.writeFile(filepath, JSON.stringify(file, null, 2) + '\n');
		break;
	}

	// Get a list of all the JSON files
}());