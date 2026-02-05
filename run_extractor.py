# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Find and run UmaExtractor to export veteran data to this directory.

This script:
1. Searches for UmaExtractor installation on the system
2. Runs the extractor (requires Uma Musume to be on Veteran List page)
3. Outputs data.json to the same directory as this script

Usage:
    python run_extractor.py
"""

import os
import subprocess
import sys
from pathlib import Path

# Get the directory where this script lives (uma-viewer repo)
SCRIPT_DIR = Path(__file__).parent.resolve()


def find_umaextractor() -> Path | None:
    """Search for UmaExtractor installation in common locations."""
    
    # Possible locations to search
    search_paths = []
    
    # Check environment variable first
    if os.environ.get("UMAEXTRACTOR_PATH"):
        search_paths.append(Path(os.environ["UMAEXTRACTOR_PATH"]))
    
    # Common installation locations
    home = Path.home()
    search_paths.extend([
        # Sibling directory (same parent folder as uma-viewer)
        SCRIPT_DIR.parent / "UmaExtractor",
        # User's Downloads folder (most common for average users)
        home / "Downloads" / "UmaExtractor",
        # Other common locations
        home / "Desktop" / "UmaExtractor",
        home / "Documents" / "UmaExtractor",
        home / "Dev" / "UmaExtractor",
        # Program Files
        Path("C:/Program Files/UmaExtractor"),
        Path("C:/Program Files (x86)/UmaExtractor"),
        # Root of common drives
        Path("C:/UmaExtractor"),
        Path("D:/UmaExtractor"),
    ])
    
    # Check each location for the exe or python script
    for base_path in search_paths:
        if not base_path.exists():
            continue
            
        # Check for exe first (preferred - no dependencies needed)
        exe_path = base_path / "py" / "dist" / "UmaExtractor.exe"
        if exe_path.exists():
            return exe_path
        
        # Also check root (in case exe was moved)
        exe_path = base_path / "UmaExtractor.exe"
        if exe_path.exists():
            return exe_path
        
        # Check for Python script as fallback
        script_path = base_path / "py" / "extract_umas.py"
        if script_path.exists():
            return script_path
    
    return None


def run_extractor(extractor_path: Path, auto_confirm: bool = False) -> bool:
    """Run UmaExtractor and output data.json to the script directory."""
    
    print(f"Found UmaExtractor: {extractor_path}")
    print(f"Output directory: {SCRIPT_DIR}\n")
    
    # Check if game is likely running
    print("=" * 50)
    print("IMPORTANT: Before continuing, make sure:")
    print("  1. Uma Musume Pretty Derby is RUNNING")
    print("  2. You are on the VETERAN LIST page (Enhance -> List)")
    print("  3. The page has FULLY LOADED")
    print("=" * 50)
    
    if not auto_confirm:
        response = input("\nReady to extract? [Y/n]: ").strip().lower()
        if response and response not in ('y', 'yes'):
            print("Extraction cancelled.")
            return False
    else:
        print("\n[Auto-confirm enabled, starting extraction...]")
    
    print()
    
    # Determine how to run the extractor
    if extractor_path.suffix.lower() == '.exe':
        # Run the exe from our directory so data.json is created here
        print(f"Running {extractor_path.name}...")
        print("(This may take up to 60 seconds)\n")
        
        try:
            result = subprocess.run(
                [str(extractor_path)],
                cwd=str(SCRIPT_DIR),
                capture_output=False,  # Let output stream to console
                text=True,
            )
            
            # Check if data.json was created
            data_json = SCRIPT_DIR / "data.json"
            if data_json.exists():
                size_mb = data_json.stat().st_size / (1024 * 1024)
                print(f"\n[SUCCESS] Created {data_json}")
                print(f"          Size: {size_mb:.2f} MB")
                return True
            else:
                print("\n[ERROR] data.json was not created")
                print("        Check the error messages above")
                return False
                
        except FileNotFoundError:
            print(f"[ERROR] Could not find executable: {extractor_path}")
            return False
        except PermissionError:
            print("[ERROR] Permission denied. Try running as Administrator.")
            return False
        except Exception as e:
            print(f"[ERROR] Failed to run extractor: {e}")
            return False
    
    elif extractor_path.suffix.lower() == '.py':
        # Run the Python script
        print(f"Running {extractor_path.name} via Python...")
        print("(This requires 'frida' and 'msgpack' packages)")
        print("(This may take up to 60 seconds)\n")
        
        try:
            result = subprocess.run(
                [sys.executable, str(extractor_path)],
                cwd=str(SCRIPT_DIR),
                capture_output=False,
                text=True,
            )
            
            data_json = SCRIPT_DIR / "data.json"
            if data_json.exists():
                size_mb = data_json.stat().st_size / (1024 * 1024)
                print(f"\n[SUCCESS] Created {data_json}")
                print(f"          Size: {size_mb:.2f} MB")
                return True
            else:
                print("\n[ERROR] data.json was not created")
                return False
                
        except Exception as e:
            print(f"[ERROR] Failed to run extractor: {e}")
            return False
    
    else:
        print(f"[ERROR] Unknown extractor type: {extractor_path}")
        return False


def main():
    print("=== Uma Viewer - Data Extractor Launcher ===\n")
    
    # Parse arguments
    auto_confirm = "--yes" in sys.argv or "-y" in sys.argv
    
    # Find UmaExtractor
    print("Searching for UmaExtractor installation...")
    extractor_path = find_umaextractor()
    
    if not extractor_path:
        print("\n[ERROR] UmaExtractor not found!")
        print("\nSearched in common locations:")
        print("  - ../UmaExtractor/")
        print("  - ~/Downloads/UmaExtractor/")
        print("  - ~/Desktop/UmaExtractor/")
        print("  - C:/Program Files/UmaExtractor/")
        print("\nSolutions:")
        print("  1. Set UMAEXTRACTOR_PATH environment variable to the install directory")
        print("  2. Place UmaExtractor in one of the locations above")
        print("  3. Download from: https://github.com/FabulousCupcake/UmaExtractor")
        sys.exit(1)
    
    # Run the extractor
    success = run_extractor(extractor_path, auto_confirm=auto_confirm)
    
    if success:
        print("\n" + "=" * 50)
        print("Next step: Run the enrichment script:")
        print(f"  python enrich_data.py")
        print("=" * 50)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
