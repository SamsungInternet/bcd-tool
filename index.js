#!/usr/bin/env node

const fs = require('mz/fs');
const path = require('path');
const simpleGit = require('simple-git/promise');
const gitPath = path.join(__dirname, 'browser-compat-data/');
const util = require('util');
const glob = util.promisify(require('glob'));
const remote = 'https://github.com/SamsungInternet/browser-compat-data';
const Replacer = require('pattern-replace');
const samsungReplacer = new Replacer({
	patterns: [{
		match: /(chrome|version) (\d\d)/ig,
		replacement: function (needle) {
            const chromeVersion = Number(needle.slice(-2));
			return 'Samsung Internet ' + getSamsungVersion(chromeVersion);
		}
	}]
})

const mappings = [
	["1.0", 18],
	["1.5", 28],
	["2.0", 34],
	["3.0", 38],
	["4.0", 44],
	["5.0", 51],
	["6.0", 56],
	["7.0", 59],
	["8.0", 63],
	["9.0", 67],
	["10.0", 71],
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

function getSamsungDataFromChromeData(propName, chromeData, samsungDataIn) {
					
	const samsungData = samsungDataIn || {};


	// We don't use flags. 
	if (chromeData['flags']) {
		return {
			version_added: false
		}
	}

	// For eacho of the properties defined in the chrome data
	for (const prop of Object.keys(chromeData).sort()) {

		// Ignore notes they contain browser specific 
		// details we cannout garuntee.
		if (prop === 'notes' && typeof chromeData[prop] === 'string' && chromeData[prop].match(/windows|linux|macos/ig)) continue;

		// if that property is not defined in the existing Samsung data
		// or if the data is falsy or true, it maybe updated to an actual version
		if (!samsungData[prop] || samsungData[prop] === true || (prop.match(/^version/i) && chromeData[prop] <= 4)) {

			console.log(`${propName} ${prop} in Chrome, ${chromeData.version_added} which is Samsung ${getSamsungVersion(chromeData.version_added)}`);

			// Convert version numbers to the equivalent Samsung version
			let value = chromeData[prop];

			if (prop === 'notes' && typeof chromeData[prop] === 'string') {
				value = samsungReplacer.replace(value) || value;
				value = value.replace(/chrome/ig, "Samsung Internet");
			} else if (prop === 'notes' && Array.isArray(value)) {
				value = value.map(value => {
					value = samsungReplacer.replace(value) || value;
					value = value.replace(/chrome/ig, "Samsung Internet");
					return value;
				});
			}

			if (
				prop === 'version_added' ||
				prop === 'version_removed'
			) {
				value = getSamsungVersion(value);
			}

			// Update the samsung version with that value
			samsungData[prop] = value;
		}
	}

	// If a feature is added and removed in the same version then it was never added
	if (samsungData.version_added && samsungData.version_added === samsungData.version_removed) {
		delete samsungData.version_removed;
		samsungData.version_added = false;
	}

	// if (data.version_added == false) {
	// 	return {
	// 		version_added: false
	// 	}
	// }

	return samsungData;
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
	const files = args.length ? await glob(path.resolve(args[0])) : await glob(path.join(gitPath, '**/*.json'));
	for (const filepath of files) {
		let dirty = false;
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

			// Find __compat objects
			compatWalker(api, type, function (parentName, compat) {			
				const support = compat.support;

				console.log(`Found ${parentName}`)
				if (!support) {
					console.log('WARNING! Compat does not have support');
					return;
				}

				const chromeData = (function () {
					if (Array.isArray(support.chrome_android)) {
						const tempArray = support.chrome_android
						.filter(i => !i.flags)
						.filter(i => !(i.version_removed && getSamsungVersion(i.version_added) === getSamsungVersion(i.version_removed)));
						if (tempArray.length === 1) return tempArray[0];
						return tempArray;
					}
					return support.chrome_android;
				}());
				
				if (!chromeData) {
					console.log('Chrome Android Info is not defined cannot infer data');
				} else if (Array.isArray(chromeData)) {
					// Handle the case where it is an Array, t`his will overwrite if the number of entries is different
					console.log(`${parentName} added in Chrome, data is Array so may be overwriting`);
					if (
						support.samsunginternet_android &&
						Array.isArray(support.samsunginternet_android) &&
						support.samsunginternet_android.length === chromeData.length
					) {
						support.samsunginternet_android = chromeData.map((data, i) => getSamsungDataFromChromeData(parentName, data, support.samsunginternet_android[i]));
						dirty = true;
					} else {
						dirty = true;
						support.samsunginternet_android = chromeData.map(data => getSamsungDataFromChromeData(parentName, data));
					}
				} else {
					dirty = true;
					support.samsunginternet_android = getSamsungDataFromChromeData(
						parentName, 
						chromeData,
						support.samsunginternet_android
					)
				}

				// Sort support into alphabetical order
				compat.support = {};
				Object.keys(support)
				.sort()
				.forEach(key => {
					compat.support[key] = support[key]
				});
			});
		}

		// console.log(`Writing out ${filepath}`)
		// Write it back out, 2 spaces seperation with newline at end.
		if (dirty) await fs.writeFile(filepath, JSON.stringify(file, null, 2) + '\n');
	}
}());