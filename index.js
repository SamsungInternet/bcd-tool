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

// Recurse through object finding __compat and running fn on it.
function compatWalker(inObject, parentName, fn) {
	for (const [name, o] of Object.entries(inObject)) {
		if (name === '__compat') {
			fn(parentName, o);
		} else {
			compatWalker(o, name, fn);
		}
	}
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

		for (const [apiName, api] of Object.entries(file.api)) {
			compatWalker(api, apiName, function (parentName, {support}) {
				if (
					!support.samsunginternet_android ||
					support.samsunginternet_android.version_added === false
				) {
					if (
						support.chrome_android.version_added && 
						getSamsungVersion(support.chrome_android.version_added)
					) {
						console.log(`${parentName} of ${apiName} added in Chrome, ${support.chrome_android.version_added} which is Samsung ${getSamsungVersion(support.chrome_android.version_added)}`);
					} else {
						console.log(`${parentName} is undefined but chrome_android is empty`);
					}
				}
			});
		}

		// Write it back out, 2 spaces seperation with newline at end.
		fs.writeFile(filepath, JSON.stringify(file, null, 2) + '\n');
		break;
	}

	// Get a list of all the JSON files
}());