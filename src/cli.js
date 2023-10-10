#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

import prompts from "prompts";
import jsonc from "jsonc-parser";

console.log(`🔨 @rpappa/create`);

const __filename = fileURLToPath(import.meta.url);

const YES_ARG = process.argv.includes("--yes") || process.argv.includes("-y");
const MONOREPO_ARG = process.argv.includes("--monorepo") || process.argv.includes("-m");

// Creating a package in a monorepo, can pass "-w [directory ex packages/demoLib]"" or --workspace=[directory]
const workspaceFlagIdx = process.argv.findIndex((arg) => arg === "-w");
const CREATE_WORKSPACE_ARG =
    process.argv.find((arg) => arg.startsWith("--workspace="))?.split("=")[1] ||
    (workspaceFlagIdx !== -1 && process.argv[workspaceFlagIdx + 1]) ||
    "";

// find --scope=@SCOPE
const SCOPE_ARG = process.argv.find((arg) => arg.startsWith("--scope="))?.split("=")[1] ?? "";

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
    console.info(`Running command: ${command}`);
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

async function checkCreateMonorepo(isCreatingWorkspace) {
    if (!isCreatingWorkspace) {
        if (MONOREPO_ARG) {
            console.warn(`Ignoring --monorepo flag since creating a workspace`);
        }

        return false;
    }

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
    if (SCOPE_ARG) {
        if (SCOPE_ARG.startsWith("@")) {
            return SCOPE_ARG;
        }

        return `@${SCOPE_ARG}`;
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

// Ask about creating a workspace, only if done from a non-empty directory with a package.json
async function checkCreateWorkspace(isEmpty) {
    if (isEmpty && CREATE_WORKSPACE_ARG) {
        console.warn(`Ignoring --workspace flag since current directory is empty`);

        return "";
    }

    try {
        await fs.access("./package.json");
    } catch {
        if (CREATE_WORKSPACE_ARG) {
            console.warn(`Ignoring --workspace flag since no package.json found`);

            return "";
        }

        return "";
    }

    if (CREATE_WORKSPACE_ARG) {
        return CREATE_WORKSPACE_ARG;
    }

    const response = await prompts({
        type: "text",
        name: "value",
        message: "Workspace to create (e.g. packages/demoLib)",
    });

    return response.value;
}

// Is the current directory empty?
async function isEmptyDirectory() {
    const files = await fs.readdir(process.cwd());

    return files.length === 0;
}

// Check if current directory is empty, if not, prompt for empty directory
async function checkEmptyDirectory() {
    const isEmpty = await isEmptyDirectory();

    if (!isEmpty && !CREATE_WORKSPACE_ARG) {
        const response = await prompts({
            type: "confirm",
            name: "value",
            message: "Current directory is not empty, continue?",
        });

        if (!response.value) {
            console.log("Exiting...");
            process.exit(0);
        }
    }

    return isEmpty;
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
 * Patch eslint config to include "import/internal-regex": "^@scope/*", for monorepos
 * @param {string} scope
 */
async function patchEslintImportInternal(scope) {
    // For ease, just uncomment "// "import/internal-regex": "^@scope/*"," and replace @scope with scope

    const eslintConfig = await fs.readFile(path.join(process.cwd(), ".eslintrc.cjs"), "utf-8");

    const edited = eslintConfig.replace(
        `// "import/internal-regex": "^@scope/*",`,
        `"import/internal-regex": "^${scope}/*",`
    );

    await fs.writeFile(path.join(process.cwd(), ".eslintrc.cjs"), edited);
}

/**
 * Check if package.json exists, if not, prompt for npm init
 * @param {string} scope
 */
async function checkPackageJson(scope) {
    try {
        await fs.access("./package.json");
        console.info("package.json found, continuing...");

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

async function getPackageJsonLicense(packageJsonPath) {
    try {
        const rootPackageJson = await fs.readFile(path.join(packageJsonPath), "utf-8");
        // We can just use JSON.parse since package.json is not JSONC
        const rootPackage = JSON.parse(rootPackageJson);
        const rootLicense = rootPackage.license;

        return rootLicense;
    } catch {
        console.error(
            `There was an error copying license from the root package.json, please check child packages manually if needed`
        );
    }

    return "";
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
    console.info(`Copying files from ${fromDir} to ${toDir}`);

    const files = await allFiles(fromDir);
    return Promise.all(
        // the .gitignore file is prefixed with "dot" in the template-files directory, or else it wouldn't be
        // published to npm
        files.map((file) => fs.copyFile(path.join(fromDir, file), path.join(toDir, file.replace(/^dot/, "."))))
    );
}

/*
 * Begin flow
 */
const isEmpty = await checkEmptyDirectory();

const createWorkspace = await checkCreateWorkspace(isEmpty);

const isCreatingWorkspace = Boolean(createWorkspace);

const isMonorepo = await checkCreateMonorepo(!isCreatingWorkspace);

const scope = await getScope(!isMonorepo && !isCreatingWorkspace);

await checkPackageJson(scope);

const TEMPLATE_FILES_DIR = path.join(__filename, "../..", "template-files");

const COMMON_FILES_DIR = path.join(TEMPLATE_FILES_DIR, "common");
const CODE_FILES_DIR = path.join(TEMPLATE_FILES_DIR, "code");
const ROOT_FILES_DIR = path.join(TEMPLATE_FILES_DIR, "root");
const PACKAGE_FILES_DIR = path.join(TEMPLATE_FILES_DIR, "package");

// Copy every file from template-files/root
if (!isCreatingWorkspace) {
    await copyFiles(ROOT_FILES_DIR, process.cwd());

    // Formatting is shared
    await runCommand(
        `npm install --save-dev eslint-plugin-prettier eslint-config-prettier ` +
            "eslint-config-xo eslint-config-xo-typescript @typescript-eslint/parser @typescript-eslint/eslint-plugin " +
            "eslint-plugin-unicorn eslint-plugin-import eslint-import-resolver-typescript"
    );

    await runCommand(`npm install --save-dev --save-exact prettier`);

    // And the tsconfig dependency
    await runCommand(`npm install --save-dev  @sindresorhus/tsconfig`);
}

/**
 * @param {Object} options
 * @param {string} options.directory path to copy template files into, should exist
 * @param {string} options.workspace workspace flag, e.g. "-w packages/demoLib" or "" if not a monorepo
 * @param {string} options.sourceFile path to source file, e.g. "src/index.ts"
 * @param {string} options.testFile path to test file, e.g. "test/index.test.ts"
 * @param {string} options.license license of the package, e.g. "MIT"
 */
async function preparePackage({ directory, workspace, sourceFile, testFile, license }) {
    if (license) {
        await runCommand(`npm ${workspace} pkg set license="${license}"`);
    }

    // Install typescript and eslint to power scripts
    await runCommand(`npm install ${workspace} --save-dev typescript eslint`);

    // Install testing dependencies
    await runCommand(`npm install ${workspace} --save-dev vitest vite-tsconfig-paths`);

    await copyFiles(COMMON_FILES_DIR, directory);

    if (workspace) {
        await copyFiles(PACKAGE_FILES_DIR, directory);
    }

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

const rootLicense = await getPackageJsonLicense(path.join(process.cwd(), "package.json"));

if (isMonorepo) {
    await patchEslintImportInternal(scope);

    await runCommand(`npm install --save-dev typescript @sindresorhus/tsconfig`);

    const libWorkspace = `-w ./packages/lib`;

    const scopeArg = scope === "" ? "" : `--scope=${scope}`;

    await runCommand(`npm init -y ${libWorkspace} ${scopeArg}`);

    const libDir = path.join(process.cwd(), "packages/lib");
    await preparePackage({
        directory: libDir,
        workspace: libWorkspace,
        sourceFile: "src/index.ts",
        testFile: "test/index.test.ts",
        license: rootLicense,
    });

    const appWorkspace = `-w ./packages/app`;

    await runCommand(`npm init -y ${appWorkspace} ${scopeArg}`);

    const appDir = path.join(process.cwd(), "packages/app");
    await preparePackage({
        directory: appDir,
        workspace: appWorkspace,
        sourceFile: "src/main.ts",
        testFile: "test/main.test.ts",
        license: rootLicense,
    });

    // Set root build, lint, and test commands to run with the -ws flag
    await runCommand(`npm pkg set scripts.build="npm run build -ws"`);
    await runCommand(`npm pkg set scripts.lint="npm run lint -ws"`);
    await runCommand(`npm pkg set scripts.test="npm run test -ws"`);

    // And then run them
    await runCommand(`npm run build`);
    await runCommand(`npm run lint`);
    await runCommand(`npm run test`);
} else if (isCreatingWorkspace) {
    const workspaceArg = `-w ${createWorkspace}`;
    const scopeArg = scope === "" ? "" : `--scope=${scope}`;

    await runCommand(`npm init -y ${workspaceArg} ${scopeArg}`);

    const dir = path.join(process.cwd(), createWorkspace);
    await preparePackage({
        directory: dir,
        workspace: workspaceArg,
        sourceFile: "src/index.ts",
        testFile: "test/index.test.ts",
        license: rootLicense,
    });

    // Run top-level build, lint, and test commands
    await runCommand(`npm run build`);
    await runCommand(`npm run lint`);
    await runCommand(`npm run test`);
} else {
    await preparePackage({
        directory: process.cwd(),
        workspace: "",
        sourceFile: "src/index.ts",
        testFile: "test/index.test.ts",
        license: rootLicense,
    });
}

if (!rootLicense && (isMonorepo || isCreatingWorkspace)) {
    console.error(`No license found in root package.json, please check child packages manually if needed`);
}
