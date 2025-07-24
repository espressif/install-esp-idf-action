const core = require("@actions/core");
const exec = require("@actions/exec");
const tc = require("@actions/tool-cache");
const os = require("os");
const path = require("path");
const fs = require("fs");
const https = require("https");

// Function to parse Unix-style activation script
async function parseUnixScript(scriptPath) {
  const content = await fs.promises.readFile(scriptPath, "utf8");
  const commands = {};

  // Parse alias definitions
  const aliasRegex = /alias\s+([^=]+)="([^"]+)"/g;
  let match;

  while ((match = aliasRegex.exec(content)) !== null) {
    const [_, cmd, fullPath] = match;
    commands[cmd] = fullPath;
  }

  return commands;
}

// Function to parse Windows PowerShell script
async function parseWindowsScript(scriptPath) {
  const content = await fs.promises.readFile(scriptPath, "utf8");
  const commands = {};

  // Parse function definitions
  const functionRegex = /function global:([^\s{]+)\s*{[\r\n\s]*([^}]+)}/g;
  let match;

  while ((match = functionRegex.exec(content)) !== null) {
    const [_, functionName, functionBody] = match;
    // Clean up the command by taking the first non-empty line
    const command = functionBody
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)[0];

    commands[functionName] = command.replace(" @args", "");
  }

  // Special handling for Invoke-idfpy which becomes idf.py
  if (commands["Invoke-idfpy"]) {
    commands["idf.py"] = commands["Invoke-idfpy"];
    delete commands["Invoke-idfpy"];
  }

  return commands;
}

async function run() {
  try {
    // Get inputs
    const version = core.getInput("version");
    let idfPath = core.getInput("path");
    let toolsPath = core.getInput("tools-path");

    // Set default paths if not provided
    if (!idfPath) {
      idfPath = process.platform === "win32" ? "C:\\esp\\idf" : "/tmp/esp/idf";
    }
    if (!toolsPath) {
      toolsPath = process.platform === "win32" ? "C:\\esp" : "/tmp/esp";
    }

    // Install platform-specific dependencies
    await installDependencies(process.platform);

    // Get latest EIM version from GitHub
    const eimVersion = await getLatestEimVersion();
    core.info(`Using EIM version: ${eimVersion}`);

    // Get the appropriate EIM download URL
    const downloadUrl = getEimDownloadUrl(
      process.platform,
      process.arch,
      eimVersion
    );

    // Download and extract EIM
    core.info(`Downloading EIM from ${downloadUrl}`);
    const downloadedPath = await tc.downloadTool(downloadUrl);
    let eimPath;
    if (process.platform === "win32") {
      // Windows: downloaded file is the exe directly
      // eimPath = path.join(downloadedPath, "eim-cli-windows-x64.exe");
      eimPath = downloadedPath + ".exe";
      await fs.promises.rename(downloadedPath, eimPath);
    } else {
      // Unix: extract zip and make executable
      const extractedPath = await tc.extractZip(downloadedPath);
      eimPath = path.join(extractedPath, "eim");
      await exec.exec("chmod", ["+x", eimPath]);
    }

    // Prepare EIM command and execute installation
    const args = ["install", "-r", "true", "-n", "true", "-a", "true"];
    if (version !== "latest" && version.trim().length > 0) {
      core.info(`Installing ESP-IDF version |${version}|`);
      args.push("-i", version);
    }
    args.push("-p", idfPath);
    args.push("--tool-install-folder-name", toolsPath);

    // Run EIM
    core.info("Running EIM installation...");
    core.info(`EIM command: ${eimPath} ${args.join(" ")}`);

    await exec.exec(eimPath, args);

    // Find and execute the appropriate activation script
    core.info("Finding environment setup script...");
    let output = "";
    const options = {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        },
      },
    };

    // Find and parse activation script
    let scriptPath;
    let commands;

    if (process.platform === "win32") {
      const files = await fs.promises.readdir("C:\\Espressif\\tools");
      const profile_file = files.find((f) => f.startsWith("Microsoft") && f.endsWith(".ps1"));

      scriptPath = path.join(
        "C:\\Espressif\\tools",
        profile_file
      );
      if (
        !(await fs.promises
          .access(scriptPath)
          .then(() => true)
          .catch(() => false))
      ) {
        throw new Error("Could not find PowerShell profile script");
      }

      // Parse Windows commands
      commands = await parseWindowsScript(scriptPath);

      // Execute PowerShell profile
      await exec.exec(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-e"],
        options
      );
    } else {
      let spath = process.platform === "darwin" ? "/Users/runner/.espressif/tools/" : "/home/runner/.espressif/tools/";
      const files =  await fs.promises.readdir(spath);
      const activationFile = files.find(
        (f) => f.startsWith("activate_") && f.endsWith(".sh")
      );
      if (!activationFile) {
        throw new Error("Could not find activation script");
      }

      scriptPath = path.join(spath, activationFile);
      await exec.exec("chmod", ["+x", scriptPath]);

      // Parse Unix commands
      commands = await parseUnixScript(scriptPath);

      // Execute activation script
      await exec.exec(scriptPath, ["-e"], options);
    }

    // Parse the output and set environment variables
    const envVars = {};
    output.split("\n").forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        envVars[key] = value;
      }
    });

    // Set environment variables
    for (const [key, value] of Object.entries(envVars)) {
      if (key === "PATH") {
        const newPaths = value.split(path.delimiter).filter(Boolean);
        for (const newPath of newPaths) {
          core.addPath(newPath);
        }
      } else {
        core.exportVariable(key, value);
      }
      core.info(`Set ${key}`);
    }

    // Create bin directory for wrapper scripts
    const binDir = path.join(toolsPath, "bin");
    await fs.promises.mkdir(binDir, { recursive: true });

    // Create wrapper scripts based on parsed commands
    for (const [cmd, fullPath] of Object.entries(commands)) {
      const wrapperPath = path.join(binDir, cmd);
      if (process.platform === "win32") {
        // Create .cmd file for Windows
        const cmdContent = `@echo off\r\n${fullPath} %*`;
        await fs.promises.writeFile(wrapperPath + ".cmd", cmdContent);
      } else {
        // Create shell script for Unix
        const shContent = `#!/bin/bash\n${fullPath} "$@"`;
        await fs.promises.writeFile(wrapperPath, shContent);
        await exec.exec("chmod", ["+x", wrapperPath]);
      }
    }

    // Add bin directory to PATH
    core.addPath(binDir);
    core.info(
      "ESP-IDF installation and environment setup completed successfully"
    );
  } catch (error) {
    core.setFailed(error.message || "An unexpected error occurred");
  }
}

// Function to fetch latest release version from GitHub API
async function getLatestEimVersion() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "dl.espressif.com",
      path: "/dl/eim/eim_unified_release.json",
      headers: {
        "User-Agent": "GitHub-Action-ESP-IDF-Setup",
      },
    };

    const req = https.get(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const release = JSON.parse(data);
            resolve(release.tag_name);
          } catch (error) {
            reject(new Error("Failed to parse eim_unified_release.json"));
          }
        } else {
          reject(
            new Error(
              `dl.espressif.com request failed with status ${res.statusCode}`
            )
          );
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}

function getEimDownloadUrl(platform, arch, version) {
  const baseUrl = "https://github.com/espressif/idf-im-ui/releases/download";

  switch (platform) {
    case "linux":
      return `${baseUrl}/${version}/eim-cli-linux-${
        arch === "arm64" ? "arm64" : "x64"
      }.zip`;
    case "darwin":
      return `${baseUrl}/${version}/eim-cli-macos-${
        arch === "arm64" ? "aarch64" : "x64"
      }.zip`;
    case "win32":
      return `${baseUrl}/${version}/eim-cli-windows-x64.exe`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function installDependencies(platform) {
  switch (platform) {
    case "linux":
      try {
        await exec.exec("which apt-get");
      } catch (error) {
        core.setFailed(
          "---------------   WARNING   ---------------\n" +
            "This action currently supports only official GitHub-hosted Ubuntu runners. " +
            "If you're using a self-hosted runner or a different Linux distribution, " +
            "please ensure all required dependencies are pre-installed."
        );
        return;
      }
      await exec.exec("sudo apt-get update");
      await exec.exec(
        "sudo apt-get install -y git cmake ninja-build wget flex bison gperf ccache libffi-dev libssl-dev dfu-util libusb-1.0-0 python3 python3-pip python3-setuptools python3-wheel xz-utils unzip python3-venv libsdl2-dev libslirp-dev"
      );
      break;
    case "darwin":
      await exec.exec("brew install dfu-util cmake ninja");
      break;
    case "win32":
      // No dependencies needed for Windows
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

run();
