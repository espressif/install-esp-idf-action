# ESP-IDF Installation Action

This GitHub Action automates the installation of the ESP-IDF framework on GitHub-hosted runners. It supports Windows, macOS, and Linux platforms, allowing you to set up ESP-IDF for your CI/CD workflows.

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
    uses: espressif/esp-idf-install-action@v1
  - name: Build your project
    run: |
      idf.py build
```

Advanced usage with custom configuration:

```yaml
steps:
  - uses: actions/checkout@v4
  - name: Install ESP-IDF
    uses: espressif/esp-idf-install-action@v1
    with:
      esp_idf_version: "v5.0"
      esp_idf_path: "/custom/path/to/esp-idf"
      esp_idf_tools_path: "/custom/path/to/tools"
```

## Inputs

| Input                | Description                   | Default                                          |
| -------------------- | ----------------------------- | ------------------------------------------------ |
| `esp_idf_version`    | Version of ESP-IDF to install | Latest released version                          |
| `esp_idf_path`       | Installation path for ESP-IDF | `/opt/esp/idf` (POSIX) or `C:\esp\idf` (Windows) |
| `esp_idf_tools_path` | Path for ESP-IDF tools        | `/opt/esp` (POSIX) or `C:\esp` (Windows)         |

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
        uses: espressif/esp-idf-install-action@v1
        with:
          esp_idf_version: "v5.0"

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

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Espressif Systems](https://www.espressif.com/) for ESP-IDF
- [cli-idf-installer](https://github.com/espressif/idf-im-cli) for the installation tools
