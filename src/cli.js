#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

import prompts from "prompts";
import jsonc from "jsonc-parser";

const __filename = fileURLToPath(import.meta.url);

const YES_ARG = process.argv.includes("--yes") || process.argv.includes("-y");
const MONOREPO_ARG = process.argv.includes("--monorepo") || process.argv.includes("-m");

// find --scope=@SCOPE
const defaultScope = process.argv.find((arg) => arg.startsWith("--scope="))?.split("=")[1] ?? "";

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
    console.log(`Running command: ${command}`);
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

async function checkCreateMonorepo() {
    if (MONOREPO_ARG) {
        return true;
    }

    const response = await prompts({
        type: "confirm",
        name: "value",
        message: "Create monorepo?",
    });

    return Boolean(response.value);
}

// Ask for a scope (optionally). If no @ is provided, prefix with @
async function getScope(isOptional = true) {
    if (defaultScope) {
        if (defaultScope.startsWith("@")) {
            return defaultScope;
        }

        return `@${defaultScope}`;
    }

    const response = await prompts({
        type: "text",
        name: "value",
        message: `Scope${isOptional ? " (optional)" : ""}`,
    });

    if (!response.value) {
        if (!isOptional) {
            throw new Error("Scope is required");
        }

        return "";
    }

    if (response.value.trim() === "" || response.value.startsWith("@")) {
        return `${response.value.trim()}`;
    }

    return `@${response.value}`;
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

// Sets "type": "module" in package.json
async function patchPackageJson(workspace) {
    await runCommand(`npm ${workspace} pkg set type=module`);
}

// options for editing tsconfig.json
const MODIFICATION_OPTIONS = {
    formattingOptions: {
        tabSize: 4,
        insertSpaces: true,
        insertFinalNewline: true,
    },
};

/**
 * Patch tsconfig to include compilerOptions.outDir = "dist", include = ["src"], and paths if scope is not empty
 * @param {string} original Original tsconfig.json contents
 * @param {string | undefined} scope Scope, will set up paths if not undefined
 * @param {boolean} skipSetup Skip setting up outDir and include
 */
function patchTsconfigJson(original, scope, skipSetup = false) {
    const patches = skipSetup
        ? []
        : [
              {
                  path: ["compilerOptions", "outDir"],
                  value: "dist",
              },
              {
                  path: ["include"],
                  value: ["src"],
              },
          ];

    if (scope) {
        patches.push({
            path: ["compilerOptions", "paths", `${scope}/*`],
            value: [`../*/src`],
        });
    }

    let tsconfig = original;

    for (const patch of patches) {
        tsconfig = jsonc.applyEdits(tsconfig, jsonc.modify(tsconfig, patch.path, patch.value, MODIFICATION_OPTIONS));
    }

    return tsconfig;
}

/**
 * Check if package.json exists, if not, prompt for npm init
 * @param {string} scope
 */
async function checkPackageJson(scope) {
    try {
        await fs.access("./package.json");
        console.log("package.json found, continuing...");

        await patchPackageJson("");
    } catch {
        const yesArg = YES_ARG ? "-y" : "";
        if (scope === "") {
            await runCommand(`npm init ${yesArg}`);
        } else {
            await runCommand(`npm init --scope=${scope} ${yesArg}`);
        }

        await patchPackageJson("");
    }
}

/**
 * Get all files in a directory, excluding directories
 * @param {string} dir The directory to get files from
 * @returns {Promise<string[]>}
 */
async function allFiles(dir) {
    const dirContents = await fs.readdir(dir);
    const files = await Promise.all(
        dirContents.map(async (file) => {
            const stats = await fs.stat(path.join(dir, file));

            if (stats.isFile()) {
                return file;
            }
        })
    );

    return files.filter((file) => file !== undefined);
}

/**
 * Copy all files from one directory to another
 * @param {string} fromDir
 * @param {string} toDir
 * @returns {Promise<void[]>}
 */
async function copyFiles(fromDir, toDir) {
    const files = await allFiles(fromDir);
    return Promise.all(files.map((file) => fs.copyFile(path.join(fromDir, file), path.join(toDir, file))));
}

/*
 * Begin flow
 */

const isMonorepo = await checkCreateMonorepo();

const scope = await getScope(!isMonorepo);

await checkEmptyDirectory();

await checkPackageJson(scope);

const TEMPLATE_FILES_DIR = path.join(__filename, "../..", "template-files");

const COMMON_FILES_DIR = path.join(TEMPLATE_FILES_DIR, "common");
const CODE_FILES_DIR = path.join(TEMPLATE_FILES_DIR, "code");
const ROOT_FILES_DIR = path.join(TEMPLATE_FILES_DIR, "root");
const PACKAGE_FILES_DIR = path.join(TEMPLATE_FILES_DIR, "package");

// Copy every file from template-files/root
await copyFiles(ROOT_FILES_DIR, process.cwd());

/**
 * @param {string} directory path to copy template files into, should exist
 * @param {string} workspace workspace flag, e.g. "-w packages/demoLib" or "" if not a monorepo
 * @param {string} sourceFile path to source file, e.g. "src/index.ts"
 * @param {string} testFile path to test file, e.g. "test/index.test.ts"
 * @param {string} scope scope of the package, e.g. "@scope"
 */
async function preparePackage(directory, workspace, sourceFile, testFile) {
    // Install typescript and tsconfig dependency
    if (workspace) {
        // only need typescript since the tsconfig is in the root
        await runCommand(`npm install ${workspace} --save-dev typescript`);
    } else {
        // need typescript and tsconfig
        await runCommand(`npm install --save-dev typescript @sindresorhus/tsconfig`);
    }

    // Install testing dependencies
    await runCommand(`npm install ${workspace} --save-dev vitest vite-tsconfig-paths`);

    await copyFiles(COMMON_FILES_DIR, directory);

    if (workspace) {
        await copyFiles(PACKAGE_FILES_DIR, directory);
    }

    // Formatting
    await runCommand(
        `npm install ${workspace} --save-dev eslint-plugin-prettier eslint-config-prettier ` +
            "eslint-config-xo eslint-config-xo-typescript @typescript-eslint/parser @typescript-eslint/eslint-plugin"
    );

    await runCommand(`npm install ${workspace} --save-dev --save-exact prettier`);

    // Copy src folder from template-files
    await fs.mkdir(path.join(directory, "src"));
    await fs.copyFile(path.join(CODE_FILES_DIR, sourceFile), path.join(directory, "src/index.ts"));

    // Copy test folder from template-files
    await fs.mkdir(path.join(directory, "test"));
    await fs.copyFile(path.join(CODE_FILES_DIR, testFile), path.join(directory, "test/index.test.ts"));

    // if scope is not empty, replace {{SCOPEPREFIX}} in index.ts with `${scope}/` else ""
    const replacer = scope === "" ? "" : `${scope}/`;
    const contents = await fs.readFile(path.join(directory, "src/index.ts"), "utf-8");
    await fs.writeFile(path.join(directory, "src/index.ts"), contents.replace("{{SCOPEPREFIX}}", replacer));

    if (workspace) {
        // in a workspace, patch tsconfig.json and tsconfig.build.json since tsconfig.json extends tsconfig.build.json
        const tsconfigBuildJsonc = await fs.readFile(path.join(directory, "tsconfig.build.json"), "utf-8");
        const editedBuild = patchTsconfigJson(tsconfigBuildJsonc);
        await fs.writeFile(path.join(directory, "tsconfig.build.json"), editedBuild);

        if (scope) {
            const tsconfigJsonc = await fs.readFile(path.join(directory, "tsconfig.json"), "utf-8");
            const edited = patchTsconfigJson(tsconfigJsonc, scope, true);
            await fs.writeFile(path.join(directory, "tsconfig.json"), edited);
        }
    } else {
        // Just patch tsconfig.json with outDir and include
        const tsconfigJsonc = await fs.readFile(path.join(directory, "tsconfig.json"), "utf-8");
        const edited = patchTsconfigJson(tsconfigJsonc, scope);
        await fs.writeFile(path.join(directory, "tsconfig.json"), edited);
    }

    // Create lint command
    await runCommand(`npm ${workspace} pkg set scripts.lint="npx eslint ."`);

    // Create build command
    if (workspace) {
        await runCommand(`npm ${workspace} pkg set scripts.build="tsc --project tsconfig.build.json"`);
    } else {
        await runCommand(`npm ${workspace} pkg set scripts.build="tsc"`);
    }

    // Create test command
    await runCommand(`npm ${workspace} pkg set scripts.test="vitest run"`);
    await runCommand(`npm ${workspace} pkg set scripts.test:watch="vitest watch"`);

    // Set main and types in package.json
    await runCommand(`npm ${workspace} pkg set main="dist/src/index.js"`);
    await runCommand(`npm ${workspace} pkg set types="dist/src/index.d.ts"`);

    await patchPackageJson(workspace);

    await runCommand(`npm ${workspace} run lint`);
    await runCommand(`npm ${workspace} run build`);
    await runCommand(`npm ${workspace} run test`);
}

if (isMonorepo) {
    await runCommand(`npm install --save-dev typescript @sindresorhus/tsconfig`);

    const libWorkspace = `-w ./packages/lib`;

    const scopeArg = scope === "" ? "" : `--scope=${scope}`;

    await runCommand(`npm init -y ${libWorkspace} ${scopeArg}`);

    const libDir = path.join(process.cwd(), "packages/lib");
    await preparePackage(libDir, libWorkspace, "src/index.ts", "test/index.test.ts");

    const appWorkspace = `-w ./packages/app`;

    await runCommand(`npm init -y ${appWorkspace} ${scopeArg}`);

    const appDir = path.join(process.cwd(), "packages/app");
    await preparePackage(appDir, appWorkspace, "src/main.ts", "test/main.test.ts");

    // Read root license file
    try {
        const rootPackageJson = await fs.readFile(path.join(process.cwd(), "package.json"), "utf-8");
        // We can just use JSON.parse since package.json is not JSONC
        const rootPackage = JSON.parse(rootPackageJson);
        const rootLicense = rootPackage.license;

        if (rootLicense) {
            await runCommand(`npm ${appWorkspace} pkg set license="${rootLicense}"`);
            await runCommand(`npm ${libWorkspace} pkg set license="${rootLicense}"`);
        } else {
            console.error(`No license found in root package.json, please check child packages manually if needed`);
        }
    } catch {
        console.error(
            `There was an error copying license from the root package.json, please check child packages manually if needed`
        );
    }

    // Set root build, lint, and test commands to run with the -ws flag
    await runCommand(`npm pkg set scripts.build="npm run build -ws"`);
    await runCommand(`npm pkg set scripts.lint="npm run lint -ws"`);
    await runCommand(`npm pkg set scripts.test="npm run test -ws"`);

    // And then run them
    await runCommand(`npm run build`);
    await runCommand(`npm run lint`);
    await runCommand(`npm run test`);
} else {
    await preparePackage(".", "", "src/index.ts", "test/index.test.ts");
}
