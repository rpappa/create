#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

import prompts from "prompts";

const __filename = fileURLToPath(import.meta.url);

/**
 * Runs a shell command in the current directory
 * using the child_process exec function
 *
 * Makes sure that output is printed to the console
 * and user input is passed to the command
 *
 * @param {string} command
 */
async function runCommand(command) {
    return new Promise((resolve, reject) => {
        process.chdir(process.cwd());
        const child = exec(command, { cwd: process.cwd() });

        // using pipes
        const stdoutPipe = child.stdout.pipe(process.stdout);
        const stdinPipe = child.stderr.pipe(process.stderr);

        const inPipe = process.stdin.pipe(child.stdin);

        const destroyPipes = () => {
            inPipe.destroy();
            stdoutPipe.destroy();
            stdinPipe.destroy();
        };

        child.on("error", (error) => {
            destroyPipes();
            reject(error);
        });

        child.on("exit", (code) => {
            if (code === 0) {
                destroyPipes();
                resolve();
            }

            destroyPipes();
            reject(new Error(`Process exited with code ${code}`));
        });
    });
}

// Is the current directory empty?
async function isEmptyDirectory() {
    const files = await fs.readdir(process.cwd());

    return files.length === 0;
}

// Check if current directory is empty, if not, prompt for empty directory
async function checkEmptyDirectory() {
    const isEmpty = await isEmptyDirectory();

    if (!isEmpty) {
        const response = await prompts({
            type: "confirm",
            name: "value",
            message: "Current directory is not empty, continue?",
        });

        if (!response.value) {
            process.exit(0);
        }
    }
}

await checkEmptyDirectory();

// Check if package.json exists, if not, prompt for npm init
async function checkPackageJson() {
    try {
        await fs.access("./package.json");
        console.log("package.json found, continuing...");

        await patchPackageJson();
    } catch {
        const response = await prompts({
            type: "confirm",
            name: "value",
            message: "No package.json found, run npm init?",
        });

        if (response.value) {
            await runCommand("npm init");

            await patchPackageJson();
        }
    }
}

// Sets "type": "module" in package.json
async function patchPackageJson() {
    await runCommand("npm pkg set type=module");
}

await checkPackageJson();

// Install typescript and tsconfig dependency
await runCommand("npm install --save-dev typescript @sindresorhus/tsconfig");

// Copy tsconfig.json from template-files
const TEMPLATE_FILES_DIR = path.join(__filename, "../..", "template-files");

// Install testing dependencies
await runCommand("npm install --save-dev jest ts-jest @types/jest cross-env");

// Copy every file from template-files, but no directories
const templateFiles = (
    await Promise.all(
        (await fs.readdir(TEMPLATE_FILES_DIR)).map(async (file) => {
            const stats = await fs.stat(path.join(TEMPLATE_FILES_DIR, file));

            if (stats.isFile()) {
                return file;
            }
        })
    )
).filter((file) => file !== undefined);

await Promise.all(
    templateFiles.map(async (file) => fs.copyFile(path.join(TEMPLATE_FILES_DIR, file), path.join(process.cwd(), file)))
);

// Formatting
await runCommand(
    "npm install --save-dev eslint-plugin-prettier eslint-config-prettier " +
        "eslint-config-xo eslint-config-xo-typescript @typescript-eslint/parser @typescript-eslint/eslint-plugin"
);

await runCommand("npm install --save-dev --save-exact prettier");

// Copy src folder from template-files
await fs.mkdir(path.join(process.cwd(), "src"));
await fs.copyFile(path.join(TEMPLATE_FILES_DIR, "src/index.ts"), path.join(process.cwd(), "src/index.ts"));

// Copy test folder from template-files
await fs.mkdir(path.join(process.cwd(), "test"));
await fs.copyFile(path.join(TEMPLATE_FILES_DIR, "test/index.test.ts"), path.join(process.cwd(), "test/index.test.ts"));

// Create lint command
await runCommand('npm pkg set scripts.lint="npx eslint ."');

// Create build command
await runCommand('npm pkg set scripts.build="tsc"');

// Create test command
await runCommand('npm pkg set scripts.test="NODE_OPTIONS=--experimental-vm-modules jest"');

await runCommand("npm run lint");
await runCommand("npm run build");
await runCommand("npm run test");
