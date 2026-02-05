# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Validate localization against official Uma Musume Global terminology.

This script checks:
1. viewer.html UI labels for incorrect terms
2. enriched_data.json for non-Global translations

Usage:
    python validate_localization.py [--fix]
    
    --fix    Automatically fix issues in viewer.html
"""

import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()


def safe_print(text: str):
    """Print with fallback for non-ASCII chars on Windows."""
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode())

# =============================================================================
# Official Global Terminology Mappings
# =============================================================================

# Running styles: Various terms → Official Global English
RUNNING_STYLES = {
    # Correct Global terms
    "Front Runner": "Front Runner",   # 逃げ (Nige) - leads from start
    "Pace Chaser": "Pace Chaser",     # 先行 (Senko) - stays near front
    "Late Surger": "Late Surger",     # 差し (Sashi) - middle of pack
    "End Closer": "End Closer",       # 追込 (Oikomi) - stays at back
    
    # JP community terms → correct Global
    "Runner": "Front Runner",
    "Nige": "Front Runner",
    "Leader": "Pace Chaser",
    "Senko": "Pace Chaser",
    "Stalker": "Pace Chaser",
    "Betweener": "Late Surger",
    "Sashi": "Late Surger",
    "Chaser": "End Closer",
    "Oikomi": "End Closer",
    "Closer": "End Closer",
    
    # Alternate spellings
    "Front-runner": "Front Runner",
    "Frontrunner": "Front Runner",
}

# Distance categories: Various terms → Official Global English
DISTANCES = {
    # Correct Global terms
    "Sprint": "Sprint",     # 短距離 (1000-1400m)
    "Mile": "Mile",         # マイル (1401-1800m)
    "Medium": "Medium",     # 中距離 (1801-2400m)
    "Long": "Long",         # 長距離 (2401m+)
    
    # Common incorrect terms → correct
    "Short": "Sprint",
    "Short Distance": "Sprint",
    "Mid-Distance": "Medium",
    "Mid Distance": "Medium",
    "Medium Distance": "Medium",
    "Middle": "Medium",
    "Middle Distance": "Medium",
    "Long-Distance": "Long",
    "Long Distance": "Long",
}

# Ground types (these are generally correct)
GROUND_TYPES = {
    "Turf": "Turf",
    "Dirt": "Dirt",
    "Grass": "Turf",
}

# Support card types
SUPPORT_CARD_TYPES = {
    # Correct Global terms
    "Speed": "Speed",
    "Stamina": "Stamina",
    "Power": "Power",
    "Guts": "Guts",
    "Wit": "Wit",           # Global uses "Wit"
    "Friend": "Friend",
    "Group": "Group",
    
    # Common incorrect terms
    "Wisdom": "Wit",
    "Wiz": "Wit",
    "Int": "Wit",
    "Intelligence": "Wit",
}

# Stat names (only check UI labels, not property keys like char.wiz)
STAT_NAMES = {
    # Correct Global terms
    "Speed": "Speed",
    "Stamina": "Stamina", 
    "Power": "Power",
    "Guts": "Guts",
    "Wit": "Wit",         # Global uses "Wit" (JP: 賢さ)
    
    # Common incorrect terms → correct
    "Wisdom": "Wit",
    "Intelligence": "Wit",
    "Int": "Wit",
    # Note: 'wiz' is a valid property key in the data, don't flag it
}

# Combine all mappings for general checking
ALL_TERM_CORRECTIONS = {
    **{k: v for k, v in RUNNING_STYLES.items() if k != v},
    **{k: v for k, v in DISTANCES.items() if k != v},
    **{k: v for k, v in GROUND_TYPES.items() if k != v},
    **{k: v for k, v in SUPPORT_CARD_TYPES.items() if k != v},
    **{k: v for k, v in STAT_NAMES.items() if k != v},
}


# =============================================================================
# Validation Functions
# =============================================================================

def check_viewer_html() -> list[dict]:
    """Check viewer.html for incorrect terminology in UI labels."""
    issues = []
    viewer_path = SCRIPT_DIR / "viewer.html"
    
    if not viewer_path.exists():
        return [{"file": "viewer.html", "issue": "File not found"}]
    
    content = viewer_path.read_text(encoding="utf-8")
    lines = content.split('\n')
    
    # Only check these specific terms that are likely UI labels (not property keys)
    ui_term_corrections = {
        # Running styles - JP terms that should use Global terms
        "Runner": "Front Runner",
        "Frontrunner": "Front Runner",
        "Front-runner": "Front Runner",
        "Leader": "Pace Chaser",
        "Stalker": "Pace Chaser",
        "Betweener": "Late Surger",
        "Chaser": "End Closer",
        # Distances - only flag incorrect ones
        "Short": "Sprint",
        "Mid-Distance": "Medium",
        "Middle": "Medium",
        # Stats
        "Wisdom": "Wit",
    }
    
    for line_num, line in enumerate(lines, 1):
        for term, correct in ui_term_corrections.items():
            # Only match as standalone UI labels (in span tags with aptitude-label class)
            pattern = rf'aptitude-label["\']?>({re.escape(term)})<'
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                found_term = match.group(1)
                if found_term.lower() == term.lower():
                    issues.append({
                        "file": "viewer.html",
                        "line": line_num,
                        "found": found_term,
                        "expected": correct,
                        "context": line.strip()[:80],
                    })
    
    return issues


def check_enriched_data() -> list[dict]:
    """Check enriched_data.json for non-Global terminology.
    
    Only checks spark names for exact terminology matches.
    Skill names, character names, etc. are excluded since they contain
    these terms as part of proper nouns or descriptive names.
    """
    issues = []
    data_path = SCRIPT_DIR / "enriched_data.json"
    
    if not data_path.exists():
        return [{"file": "enriched_data.json", "issue": "File not found"}]
    
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [{"file": "enriched_data.json", "issue": f"Invalid JSON: {e}"}]
    
    if not isinstance(data, list):
        return [{"file": "enriched_data.json", "issue": "Expected array of characters"}]
    
    # Terms that should be exact matches in spark names
    spark_term_corrections = {
        # Running styles - JP terms → Global
        "Runner": "Front Runner",
        "Frontrunner": "Front Runner",
        "Front-runner": "Front Runner",
        "Nige": "Front Runner",
        "Leader": "Pace Chaser",
        "Senko": "Pace Chaser",
        "Stalker": "Pace Chaser", 
        "Betweener": "Late Surger",
        "Sashi": "Late Surger",
        "Chaser": "End Closer",
        "Oikomi": "End Closer",
        # Distances - incorrect → Global
        "Short": "Sprint",
        "Short Distance": "Sprint",
        "Mid-Distance": "Medium",
        "Middle Distance": "Medium",
        # Stats - incorrect → Global (Wit is correct)
        "Wisdom": "Wit",
        "Int": "Wit",
        "Intelligence": "Wit",
    }
    
    # Terms to check in epithet names (support bonuses)
    # Note: "Wit Bonus" and "Wit Cap Up" are CORRECT Global terms
    # Use exact match to avoid false positives (e.g., "Skill Point Bonus" contains "int bonus" as substring)
    epithet_term_corrections = {
        "Wisdom Bonus": "Wit Bonus",
        "Wisdom Cap Up": "Wit Cap Up",
        "Wiz Bonus": "Wit Bonus",
        "Int Bonus": "Wit Bonus",
        "Int Cap Up": "Wit Cap Up",
    }
    
    sample_issues = {}
    
    for idx, char in enumerate(data):
        # Check spark names for exact terminology
        sparks = char.get("spark_array_enriched", [])
        for spark in sparks:
            if isinstance(spark, dict):
                value = spark.get("spark_name_en", "")
                if value:
                    # Check for exact matches
                    for term, correct in spark_term_corrections.items():
                        if value.strip().lower() == term.lower():
                            key = f"spark:{term}"
                            if key not in sample_issues:
                                sample_issues[key] = {
                                    "file": "enriched_data.json",
                                    "field": "spark_array_enriched[].spark_name_en",
                                    "found": term,
                                    "expected": correct,
                                    "sample_value": value[:50],
                                    "char_index": idx,
                                }
        
        # Check epithet names (use EXACT match to avoid false positives)
        # e.g., "Skill Point Bonus" contains "int bonus" as substring but is correct
        epithets = char.get("nickname_array_enriched", [])
        for epithet in epithets:
            if isinstance(epithet, dict):
                value = epithet.get("nickname_name_en", "")
                if value:
                    for term, correct in epithet_term_corrections.items():
                        # Use exact match (case-insensitive) to avoid substring false positives
                        if value.strip().lower() == term.lower():
                            key = f"epithet:{term}"
                            if key not in sample_issues:
                                sample_issues[key] = {
                                    "file": "enriched_data.json",
                                    "field": "nickname_array_enriched[].nickname_name_en",
                                    "found": term,
                                    "expected": correct,
                                    "sample_value": value[:50],
                                    "char_index": idx,
                                }
    
    return list(sample_issues.values())


def fix_viewer_html() -> int:
    """Fix incorrect terminology in viewer.html."""
    viewer_path = SCRIPT_DIR / "viewer.html"
    
    if not viewer_path.exists():
        print("[X] viewer.html not found")
        return 0
    
    content = viewer_path.read_text(encoding="utf-8")
    original = content
    fixes = 0
    
    # Specific fixes for UI labels (be precise to avoid breaking code)
    ui_fixes = [
        # Aptitude labels
        (r"(aptitude-label['\"]>)Front-runner(<)", r"\1Runner\2"),
        (r"(aptitude-label['\"]>)Stalker(<)", r"\1Leader\2"),
        (r"(aptitude-label['\"]>)Short(<)", r"\1Sprint\2"),
        (r"(aptitude-label['\"]>)Medium(<)", r"\1Mid-Distance\2"),
        (r"(aptitude-label['\"]>)Middle(<)", r"\1Mid-Distance\2"),
        
        # String literals in JS (for labels)
        (r"'Front-runner'", "'Runner'"),
        (r"'Stalker'", "'Leader'"),
        (r"'Short'", "'Sprint'"),
        (r"'Medium'", "'Mid-Distance'"),
    ]
    
    for pattern, replacement in ui_fixes:
        new_content = re.sub(pattern, replacement, content)
        if new_content != content:
            fixes += 1
            content = new_content
    
    if fixes > 0:
        viewer_path.write_text(content, encoding="utf-8")
        print(f"[OK] Fixed {fixes} terminology issues in viewer.html")
    else:
        print("[OK] No fixes needed in viewer.html")
    
    return fixes


def print_terminology_reference():
    """Print the correct Global terminology for reference."""
    print("\n" + "=" * 60)
    print("OFFICIAL GLOBAL TERMINOLOGY REFERENCE")
    print("=" * 60)
    
    print("\n[Running Styles]")
    print("  Global Term    | JP Term    | Description")
    print("  ---------------|------------|---------------------------")
    print("  Front Runner   | Runner     | Leads from start (Nige)")
    print("  Pace Chaser    | Leader     | Stays near front (Senko)")
    print("  Late Surger    | Betweener  | Middle of pack (Sashi)")
    print("  End Closer     | Chaser     | Stays at back (Oikomi)")
    
    print("\n[Distances]")
    print("  Sprint  - 1000-1400m")
    print("  Mile    - 1401-1800m")
    print("  Medium  - 1801-2400m")
    print("  Long    - 2401m+")
    
    print("\n[Ground Types]")
    print("  Turf - Grass track")
    print("  Dirt - Dirt track")
    
    print("\n[Stats]")
    print("  Speed, Stamina, Power, Guts, Wit")
    
    print("\n[Support Card Types]")
    print("  Speed, Stamina, Power, Guts, Wit, Friend, Group")
    print()


def main():
    print("=== Uma Viewer Localization Validator ===\n")
    
    fix_mode = "--fix" in sys.argv
    
    # Check viewer.html
    print("Checking viewer.html...")
    viewer_issues = check_viewer_html()
    
    # Check enriched_data.json
    print("Checking enriched_data.json...")
    data_issues = check_enriched_data()
    
    all_issues = viewer_issues + data_issues
    
    if not all_issues:
        print("\n[OK] No localization issues found!")
        print_terminology_reference()
        return 0
    
    # Report issues
    print(f"\n[!] Found {len(all_issues)} localization issue(s):\n")
    
    for issue in all_issues:
        if "line" in issue:
            print(f"  {issue['file']}:{issue['line']}")
            print(f"    Found: '{issue['found']}' -> Should be: '{issue['expected']}'")
            safe_print(f"    Context: {issue['context']}")
        elif "field" in issue:
            print(f"  {issue['file']} [{issue['field']}]")
            print(f"    Found: '{issue['found']}' -> Should be: '{issue['expected']}'")
            safe_print(f"    Sample: {issue['sample_value']}")
        else:
            print(f"  {issue['file']}: {issue.get('issue', 'Unknown issue')}")
        print()
    
    # Fix if requested
    if fix_mode:
        print("\n" + "-" * 40)
        print("Applying fixes...")
        fix_viewer_html()
    else:
        print("Run with --fix to automatically fix viewer.html issues")
    
    print_terminology_reference()
    
    return 1 if all_issues else 0


if __name__ == "__main__":
    sys.exit(main())
