const core = require("@actions/core");
const exec = require("@actions/exec");
const tc = require("@actions/tool-cache");
const os = require("os");
const path = require("path");
const fs = require("fs");

async function run() {
  try {
    // Get inputs
    const version = core.getInput("esp_idf_version");
    let idfPath = core.getInput("esp_idf_path");
    let toolsPath = core.getInput("esp_idf_tools_path");

    // Set default paths if not provided
    if (!idfPath) {
      idfPath = process.platform === "win32" ? "C:\\esp\\idf" : "/tmp/esp/idf";
    }
    if (!toolsPath) {
      toolsPath = process.platform === "win32" ? "C:\\esp" : "/tmp/esp";
    }

    // Install platform-specific dependencies
    await installDependencies(process.platform);

    // Get the appropriate EIM download URL
    const eimVersion = "v0.1.5";
    const downloadUrl = getEimDownloadUrl(
      process.platform,
      process.arch,
      eimVersion
    );

    // Download and extract EIM
    core.info(`Downloading EIM from ${downloadUrl}`);
    const downloadedPath = await tc.downloadTool(downloadUrl);
    const extractedPath = await tc.extractZip(downloadedPath);

    // Make EIM executable on Unix systems
    if (process.platform !== "win32") {
      await exec.exec("chmod", ["+x", path.join(extractedPath, "eim")]);
    }

    // Prepare EIM command
    const eimCmd = process.platform === "win32" ? "eim.exe" : "./eim";
    const eimPath = path.join(extractedPath, eimCmd);

    // Prepare EIM arguments
    const args = ["-r", "true", "-n", "true", "-a", "true"];
    if (version !== "latest") {
      args.push("-i", version);
    }
    args.push("-p", idfPath);
    args.push("--tool-install-folder-name", toolsPath);

    // Run EIM
    core.info("Running EIM installation...");
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

    if (process.platform === "win32") {
      // On Windows, look for PowerShell profile
      const files = await fs.promises.readdir(idfPath);
      const versionDir = files.find((f) => /^v\d+\.\d+$/.test(f));
      if (!versionDir) {
        throw new Error("Could not find version directory in IDF path");
      }

      const profilePath = path.join(
        idfPath,
        versionDir,
        "Microsoft.PowerShell_profile.ps1"
      );
      if (
        !(await fs.promises
          .access(profilePath)
          .then(() => true)
          .catch(() => false))
      ) {
        throw new Error("Could not find PowerShell profile script");
      }

      // Execute PowerShell profile with -e parameter
      await exec.exec(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          profilePath,
          "-e",
        ],
        options
      );
    } else {
      // On Unix systems, look for activation script
      const files = await fs.promises.readdir(idfPath);
      const activationFile = files.find(
        (f) => f.startsWith("activate_") && f.endsWith(".sh")
      );
      if (!activationFile) {
        throw new Error("Could not find activation script");
      }

      const activationScript = path.join(idfPath, activationFile);
      await exec.exec("chmod", ["+x", activationScript]);
      await exec.exec(activationScript, ["-e"], options);
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

    // Set all environment variables
    for (const [key, value] of Object.entries(envVars)) {
      if (key === "PATH") {
        // For PATH, we need to add each directory
        const newPaths = value.split(":").filter(Boolean);
        for (const newPath of newPaths) {
          core.addPath(newPath);
        }
      } else {
        core.exportVariable(key, value);
      }
      core.info(`Set ${key}`);
    }

    // Create a bin directory for our wrapper scripts
    const binDir = path.join(toolsPath, "bin");
    await fs.promises.mkdir(binDir, { recursive: true });

    // Create wrapper scripts for common commands
    const commands =
      process.platform === "win32"
        ? {
            "idf.py": `%IDF_PYTHON_ENV_PATH%\\Scripts\\python.exe %IDF_PATH%\\tools\\idf.py`,
            "esptool.py": `%IDF_PYTHON_ENV_PATH%\\Scripts\\python.exe %IDF_PATH%\\components\\esptool_py\\esptool\\esptool.py`,
            "espefuse.py": `%IDF_PYTHON_ENV_PATH%\\Scripts\\python.exe %IDF_PATH%\\components\\esptool_py\\esptool\\espefuse.py`,
            "espsecure.py": `%IDF_PYTHON_ENV_PATH%\\Scripts\\python.exe %IDF_PATH%\\components\\esptool_py\\esptool\\espsecure.py`,
            "otatool.py": `%IDF_PYTHON_ENV_PATH%\\Scripts\\python.exe %IDF_PATH%\\components\\app_update\\otatool.py`,
            "parttool.py": `%IDF_PYTHON_ENV_PATH%\\Scripts\\python.exe %IDF_PATH%\\components\\partition_table\\parttool.py`,
          }
        : {
            "idf.py": `${envVars.IDF_PYTHON_ENV_PATH}/bin/python3 ${envVars.IDF_PATH}/tools/idf.py`,
            "esptool.py": `${envVars.IDF_PYTHON_ENV_PATH}/bin/python3 ${envVars.IDF_PATH}/components/esptool_py/esptool/esptool.py`,
            "espefuse.py": `${envVars.IDF_PYTHON_ENV_PATH}/bin/python3 ${envVars.IDF_PATH}/components/esptool_py/esptool/espefuse.py`,
            "espsecure.py": `${envVars.IDF_PYTHON_ENV_PATH}/bin/python3 ${envVars.IDF_PATH}/components/esptool_py/esptool/espsecure.py`,
            "otatool.py": `${envVars.IDF_PYTHON_ENV_PATH}/bin/python3 ${envVars.IDF_PATH}/components/app_update/otatool.py`,
            "parttool.py": `${envVars.IDF_PYTHON_ENV_PATH}/bin/python3 ${envVars.IDF_PATH}/components/partition_table/parttool.py`,
          };

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

    // Add our bin directory to PATH
    core.addPath(binDir);

    core.info(
      "ESP-IDF installation and environment setup completed successfully"
    );
  } catch (error) {
    core.setFailed(error.message || "An unexpected error occurred");
  }
}

function getEimDownloadUrl(platform, arch, version) {
  const baseUrl = "https://github.com/espressif/idf-im-cli/releases/download";

  switch (platform) {
    case "linux":
      return `${baseUrl}/${version}/eim-${version}-linux-${
        arch === "arm64" ? "arm64" : "x64"
      }.zip`;
    case "darwin":
      return `${baseUrl}/${version}/eim-${version}-macos-${
        arch === "arm64" ? "aarch64" : "x64"
      }.zip`;
    case "win32":
      return `${baseUrl}/${version}/eim-${version}-windows-x64.zip`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function installDependencies(platform) {
  switch (platform) {
    case "linux":
      await exec.exec("sudo apt-get update");
      await exec.exec(
        "sudo apt-get install -y git cmake ninja-build wget flex bison gperf ccache libffi-dev libssl-dev dfu-util libusb-1.0-0 python3 python3-pip python3-setuptools python3-wheel xz-utils unzip python3-venv"
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
