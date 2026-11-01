from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
AGENT_DIR = ROOT / "agent"
OUTPUT = ROOT / "frontend" / "public" / "downloads" / "computegrid-gpu-agent-windows-v5.zip"
EXCLUDED_DIRS = {".git", ".venv", "__pycache__"}
EXCLUDED_FILES = {".env"}


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED) as package:
        for path in sorted(AGENT_DIR.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(AGENT_DIR)
            if any(part in EXCLUDED_DIRS for part in relative.parts):
                continue
            if path.name in EXCLUDED_FILES or path.suffix in {".pyc", ".pyo"}:
                continue
            if len(relative.parts) == 1 and path.name in {
                "Install.bat",
                "Install-ComputeGridAgent.py",
            }:
                continue
            package.write(path, Path("agent") / relative)

        package.write(AGENT_DIR / "Install-ComputeGridAgent.py", "Install-ComputeGridAgent.py")
        package.write(AGENT_DIR / "Install.bat", "Install.bat")

    print(f"Created {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
