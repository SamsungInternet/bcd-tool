#!/usr/bin/env node

const fs = require('mz/fs');
const path = require('path');
const simpleGit = require('simple-git/promise');
const gitPath = path.join(__dirname, 'browser-compat-data/');
const util = require('util');
const glob = util.promisify(require('glob'));
const remote = 'https://github.com/SamsungInternet/browser-compat-data';

const mappings = [
	[4, 44],
	[5, 51],
	[6, 56],
	[7, 59],
	[8, 63],
	[9, 67],
	[10, 71],
];

function getSamsungVersion(chromeVersion) {
	if (chromeVersion === null) return null;
	if (chromeVersion === false) return false;
	if (chromeVersion === true) return true;

	if (chromeVersion < mappings[0][1]) return true;

	let version = false;
	for (const [samsung, chrome] of mappings) {
		if (chromeVersion <= chrome) {
			version = samsung;
			break;
		}
	}
	return String(version);
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

function getSamsungDataFromChromeData(propName, chromeData, samsungData) {
					
	const data = samsungData || {};

	// For eacho of the properties defined in the chrome data
	for (const prop of Object.keys(chromeData)) {

		// Ignore flags we don't promote them
		if (prop === 'flags') continue;

		// if that property is not defined in the existing Samsung data
		// or if the data is falsy or true, it maybe updated to an actual version
		if (!data[prop] || data[prop] === true) {

			console.log(`${propName} ${prop} in Chrome, ${chromeData.version_added} which is Samsung ${getSamsungVersion(chromeData.version_added)}`);

			// Convert version numbers to the equivalent Samsung version
			let value = chromeData[prop];
			if (
				prop === 'version_added' ||
				prop === 'version_removed'
			) {
				value = getSamsungVersion(value);
			}

			// Update the samsung version with that value
			data[prop] = value;
		}
	}

	return data;
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

	const args = process.argv.slice(2);
	const files = args.length ? args.map(s => path.resolve(s)) : await glob(path.join(gitPath, '**/*.json'));
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
				console.log(`Found ${parentName}`)
				if (!support) {
					console.log('WARNING! Compat does not have support');
					return;
				}

				const chromeData = support.chrome_android;
				if (!chromeData) {
					console.log('Chrome Android Info is not defined cannot infer data');
				} else if (Array.isArray(chromeData)) {
					// Handle the case where it is an Array, this will always overwrite
					console.log(`${parentName} added in Chrome, data is Array so overwriting`);
					support.samsunginternet_android = chromeData.map(data => getSamsungDataFromChromeData(parentName, data));
				} else {
					support.samsunginternet_android = getSamsungDataFromChromeData(
						parentName, 
						chromeData,
						support.samsunginternet_android
					)
				}
			});
		}

		// console.log(`Writing out ${filepath}`)
		// Write it back out, 2 spaces seperation with newline at end.
		await fs.writeFile(filepath, JSON.stringify(file, null, 2) + '\n');
	}
}());