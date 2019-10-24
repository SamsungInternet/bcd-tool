#!/usr/bin/env node

const fs = require('mz/fs');
const path = require('path');
const simpleGit = require('simple-git/promise');
const gitPath = path.join(__dirname, 'browser-compat-data/');
const util = require('util');
const glob = util.promisify(require('glob'));


function exec(cmd) {
    const exec = require('child_process').exec;
    return new Promise((resolve, reject) => {
     exec(cmd, {
        cwd: gitPath
      }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      }
      resolve(stdout? stdout : stderr);
     });
    });
}

(async function main() {

	const args = process.argv.slice(2);
    const git = simpleGit(gitPath);

    const targetBranch = args[0] || 'master';
    const origBranch = args[1] || (await git.status()).current;

    await git.checkout(origBranch);

    const folders = (await glob(gitPath + '*/'))
    .map(s => s.replace(gitPath, ''));

    function folderToBranchName(folderName) {
        return origBranch + '_' + folderName.replace(/[^a-z0-9]/ig,'');
    }

    for (const folder of folders) {
        try {
            await exec(`git ls-files --error-unmatch ${folder}`);
        } catch (e) {
            continue;
        }

        await git.checkout(targetBranch);

        const newBranchName = folderToBranchName(folder);

        await exec(`git checkout -b ${newBranchName}`);

        await exec(`git checkout ${origBranch} -- ${folder}`);

        try {
            await exec(`! git diff --cached --quiet --exit-code`);
        } catch (e) {
            console.log(`${folder}, no changes skipping`);
            await git.checkout(targetBranch);
            await exec(`git branch -D ${newBranchName}`);
            continue;
        }

        await git.commit(`Updating folder ${folder}`);
    }

    await git.checkout(origBranch);
}());