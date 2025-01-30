# ESP-IDF Installation Action

This GitHub Action automates the installation of the ESP-IDF framework on GitHub-hosted runners. It supports Windows, macOS (arm64 and Intel), and Linux (arm64 and x64) platforms, allowing you to set up ESP-IDF for your CI/CD workflows.
If you just need to build the project, you can use [esp-idf-ci-action](https://github.com/espressif/esp-idf-ci-action).

## Features

- Cross-platform support (Windows, macOS, Linux) thanks to [EIM](https://github.com/espressif/idf-im-cli)
- Automatic installation of required system dependencies
- Configurable ESP-IDF version and installation paths
- Sets up all necessary environment variables and tools
- Adds ESP-IDF commands (`idf.py`, `esptool.py`, etc.) to PATH

## Usage

Basic usage with default settings:

```yaml
steps:
  - uses: actions/checkout@v4
  - name: Install ESP-IDF
    uses: espressif/install-esp-idf-action@v1
  - name: Build your project
    run: |
      idf.py build
```

Advanced usage with custom configuration:

```yaml
steps:
  - uses: actions/checkout@v4
  - name: Install ESP-IDF
    uses: espressif/install-esp-idf-action@v1
    with:
      version: "v5.0"
      path: "/custom/path/to/esp-idf"
      tools-path: "/custom/path/to/tools"
```

## Inputs

| Input        | Description                   | Default                                          |
| ------------ | ----------------------------- | ------------------------------------------------ |
| `version`    | Version of ESP-IDF to install | Latest released version                          |
| `path`       | Installation path for ESP-IDF | `/opt/esp/idf` (POSIX) or `C:\esp\idf` (Windows) |
| `tools-path` | Path for ESP-IDF tools        | `/opt/esp` (POSIX) or `C:\esp` (Windows)         |

## Available Commands

After installation, the following commands are available in your workflow:

- `idf.py` - Main ESP-IDF tool for project management
- `esptool.py` - Utility for flashing ESP chips
- `espefuse.py` - Utility for ESP chip eFuse management
- `espsecure.py` - Utility for ESP security features
- `otatool.py` - Utility for ESP OTA operations
- `parttool.py` - Utility for flash partitions operations

## Example Workflow

Here's a complete example showing how to use this action in a workflow:

```yaml
name: ESP-IDF Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    name: Build on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Install ESP-IDF
        uses: espressif/install-esp-idf-action@v1
        with:
          version: "v5.0"

      - name: Build Project
        run: |
          idf.py set-target esp32
          idf.py build
```

## Platform-Specific Notes

### Linux

- Automatically installs required packages using apt-get
- Default installation path: `/opt/esp/idf`

### macOS

- Automatically installs required packages using Homebrew
- Default installation path: `/opt/esp/idf`

### Windows

- No additional dependencies required
- Default installation path: `C:\esp\idf`

## Common Issues

### Windows Environment

- Make sure to use PowerShell when running commands
- Some commands might require elevated privileges

### macOS/Linux Environment

- Some operations might require sudo privileges
- Ensure Homebrew (macOS) is installed for dependency management

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/your-username/install-esp-idf-action.git
cd install-esp-idf-action
```

2. Install dependencies:

```bash
npm install
```

3. Install development tool for bundling:

```bash
npm install -g @vercel/ncc
```

4. Make your changes to the action code in `index.js`.

5. Build the action:

```bash
ncc build index.js --license licenses.txt
```

This will create a single file in `dist/index.js` containing all the bundled code.

6. Commit both your source changes and the built `dist` directory:

```bash
git add .
git commit -m "your changes"
git push origin your-branch
```

The GitHub Actions workflow will automatically test your changes on all supported platforms.

### Project Structure

- `action.yml` - Action metadata file
- `index.js` - Main action source code
- `dist/` - Compiled action code (must be committed)
- `.github/workflows/` - Test workflows

### Release Process

1. Update version in `package.json` if needed
2. Build the action:

```bash
ncc build index.js --license licenses.txt
```

3. Commit all changes including the `dist` directory
4. Create and push a new tag:

```bash
git push origin v1
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Espressif Systems](https://www.espressif.com/) for ESP-IDF
- [cli-idf-installer](https://github.com/espressif/idf-im-cli) for the installation tools
