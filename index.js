#!/usr/bin/env node

const fs = require('mz/fs');
const path = require('path');
const simpleGit = require('simple-git/promise');
const gitPath = path.join(__dirname, 'browser-compat-data/');
const util = require('util');
const glob = util.promisify(require('glob'));
const remote = 'https://github.com/SamsungInternet/browser-compat-data';

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
			if (typeof o === 'object') compatWalker (o, name, fn);
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
		let file;
		try {
			file = JSON.parse(
				await fs.readFile(filepath, 'utf8')
			);
		} catch (e) {
			console.log('WARNING! Invalid JSON.');
			continue;
		}
		for (const [type, api] of Object.entries(file)) {

			// Ignore browsers doesn't contain compat info
			if (type === "browsers") continue; 
			compatWalker(api, type, function (parentName, {support}) {
				if (!support) {
					console.log('WARNING! Compat does not have support');
					return;
				}
				if (
					!support.samsunginternet_android ||
					support.samsunginternet_android.version_added === false
				) {
					if (!support.chrome_android) {
						console.log('Chrome Android Info is not defined');
					} else if (
						support.chrome_android.version_added && 
						getSamsungVersion(support.chrome_android.version_added)
					) {
						console.log(`${parentName} added in Chrome, ${support.chrome_android.version_added} which is Samsung ${getSamsungVersion(support.chrome_android.version_added)}`);
						support.samsunginternet_android = {
							version_added: getSamsungVersion(support.chrome_android.version_added)
						}
					} else {
						console.log(`${parentName} is undefined but chrome_android is empty`);
					}
				}
			});
		}

		// console.log(`Writing out ${filepath}`)
		// Write it back out, 2 spaces seperation with newline at end.
		await fs.writeFile(filepath, JSON.stringify(file, null, 2) + '\n');
	}
}());