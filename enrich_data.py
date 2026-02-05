# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests",
# ]
# ///
"""
Enrich data.json with English names from uma-tools Global data.

This script downloads the community Global English data from uma-tools
and enriches the extracted veteran data with human-readable names.

Usage:
    python enrich_data.py [input.json] [output.json]
    
If no arguments provided, reads data.json and writes enriched_data.json

Data sources:
- https://github.com/TheCing/uma-tools (umalator-global)
"""

import json
import sys
from pathlib import Path

import requests

# uma-tools data URLs
# Global version (official English names)
SKILLNAMES_GLOBAL_URL = "https://raw.githubusercontent.com/TheCing/uma-tools/master/umalator-global/skillnames.json"
UMAS_GLOBAL_URL = "https://raw.githubusercontent.com/TheCing/uma-tools/master/umalator-global/umas.json"
# JP version (more complete, includes EN translations for JP-only content)
SKILLNAMES_JP_URL = "https://raw.githubusercontent.com/TheCing/uma-tools/master/uma-skill-tools/data/skillnames.json"
UMAS_FULL_URL = "https://raw.githubusercontent.com/TheCing/uma-tools/master/umas.json"
# UmaTL text data for support card names, spark names, and other text
TEXT_DATA_URL = "https://raw.githubusercontent.com/UmaTL/hachimi-tl-en/main/localized_data/text_data_dict.json"

# Spark names are loaded dynamically from text_data category 147
# Race names are loaded dynamically from text_data category 36
# No more hardcoded dictionaries needed!


def download_json(url: str, name: str) -> dict:
    """Download JSON data from URL."""
    print(f"Downloading {name}...")
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        print(f"  [OK] {name} ({len(data)} entries)")
        return data
    except requests.RequestException as e:
        print(f"  [!] Warning: Could not download {name}: {e}")
        return {}


def download_all_data() -> dict:
    """Download all translation/name data."""
    data = {}
    
    # Skill names - Global version (official EN names): {"skill_id": ["Skill Name"]}
    data["skills_global"] = download_json(SKILLNAMES_GLOBAL_URL, "skillnames.json (global)")
    
    # Skill names - JP version (more complete, with EN translations): {"skill_id": ["JP", "EN"]}
    data["skills_jp"] = download_json(SKILLNAMES_JP_URL, "skillnames.json (jp)")
    
    # Uma data (Global version - limited but accurate)
    data["umas_global"] = download_json(UMAS_GLOBAL_URL, "umas.json (global)")
    
    # Uma data (full - has all characters but JP outfits)
    data["umas_full"] = download_json(UMAS_FULL_URL, "umas.json (full)")
    
    # UmaTL text data (for support cards, spark names, and other text)
    data["text_data"] = download_json(TEXT_DATA_URL, "text_data_dict.json")
    
    return data


def get_skill_name(data: dict, skill_id: int | str) -> str | None:
    """Look up skill name from skill ID.
    
    Tries Global names first (official EN), then falls back to JP data (community EN translations).
    """
    skill_id_str = str(skill_id)
    
    # Try Global names first (format: {"id": ["Name"]})
    skills_global = data.get("skills_global", {})
    entry = skills_global.get(skill_id_str)
    if entry and isinstance(entry, list) and len(entry) > 0:
        return entry[0]
    
    # Fall back to JP names (format: {"id": ["JP Name", "EN Name"]})
    skills_jp = data.get("skills_jp", {})
    entry = skills_jp.get(skill_id_str)
    if entry and isinstance(entry, list) and len(entry) > 1:
        return entry[1]  # Second element is EN name
    
    return None


def get_spark_name(data: dict, spark_id: int) -> str | None:
    """Decode spark ID to human-readable name (called "Factors" in JP, "Sparks" in Global).
    
    Uses text_data category 147 for spark names and category 36 for race names.
    
    Spark ID encoding:
    - 1XX-5XX: Stats (Speed, Stamina, Power, Guts, Wit)
    - 11XX-12XX: Ground aptitude (Turf, Dirt)
    - 21XX-24XX: Running style (Runner, Leader, Betweener, Chaser)
    - 31XX-34XX: Distance (Sprint, Mile, Medium Distance, Long Distance)
    - 100XXXX: Race sparks (XXXX = race program ID)
    - 200XXXX: Skill sparks (use skill name lookup)
    - 3000XXX: Scenario sparks
    """
    text_data = data.get("text_data", {})
    
    # Category 147 has spark names (stats, aptitudes, scenarios)
    cat_147 = text_data.get("147", {})
    spark_name = cat_147.get(str(spark_id))
    if spark_name:
        return spark_name
    
    # Check if it's a skill spark (200XXXX format)
    if 2000000 <= spark_id < 3000000:
        skill_id = spark_id - 2000000
        skill_name = get_skill_name(data, skill_id)
        if skill_name:
            return skill_name
    
    # Check if it's a race spark (100XXXX format)
    if 1000000 <= spark_id < 2000000:
        race_program_id = spark_id // 100
        
        # Category 36 has race names, text_id = 1000 + (race_program_id % 1000)
        cat_36 = text_data.get("36", {})
        text_race_id = 1000 + (race_program_id % 1000)
        race_name = cat_36.get(str(text_race_id))
        if race_name:
            return race_name
    
    return None


# Support card type mapping based on first digit of ID
SUPPORT_CARD_TYPES = {
    '1': 'Speed',
    '2': 'Stamina',
    '3': 'Power',
    '4': 'Guts',
    '5': 'Wisdom',
    '6': 'Friend',
    '7': 'Group',
}


def get_race_title_name(data: dict, saddle_id: int) -> str | None:
    """Look up race/title name from saddle ID.
    
    Uses text_data category 111 which maps saddle IDs to race names/titles.
    These are the race wins/achievements (trophies) earned during training.
    """
    text_data = data.get("text_data", {})
    cat_111 = text_data.get("111", {})
    name = cat_111.get(str(saddle_id))
    if name:
        # Clean up newlines in names (some have line breaks)
        return name.replace('\n', ' ').strip()
    return None


def get_nickname_name(data: dict, nickname_id: int) -> str | None:
    """Look up epithet/bonus name from nickname ID.
    
    IDs 1-32 are support card bonuses (category 151) like "Speed Bonus", "Wit Cap Up".
    IDs 33+ are earned epithets (category 130) like "G1 Hunter", "Legendary Diva".
    """
    text_data = data.get("text_data", {})
    
    # Try category 151 first (support card bonuses, IDs 1-32)
    cat_151 = text_data.get("151", {})
    name = cat_151.get(str(nickname_id))
    if name:
        return name
    
    # Try category 130 (earned titles, IDs 33+)
    cat_130 = text_data.get("130", {})
    name = cat_130.get(str(nickname_id))
    if name:
        return name
    
    return None


def get_support_card_info(data: dict, support_card_id: int) -> dict:
    """Look up support card info from ID using text_data.
    
    Returns dict with:
    - support_card_name_en: Full name like "[Title] Character"
    - support_card_title_en: Just the title like "[Title]"
    - support_card_chara_en: Just the character like "Character"
    - support_card_type: Type like "Speed", "Stamina", etc.
    """
    result = {}
    text_data = data.get("text_data", {})
    sid_str = str(support_card_id)
    
    # Category 75: Full name "[Title] Character"
    cat_75 = text_data.get("75", {})
    full_name = cat_75.get(sid_str)
    if full_name:
        result["support_card_name_en"] = full_name
    
    # Category 76: Title only "[Title]"
    cat_76 = text_data.get("76", {})
    title = cat_76.get(sid_str)
    if title:
        result["support_card_title_en"] = title
    
    # Category 77: Character name only
    cat_77 = text_data.get("77", {})
    chara = cat_77.get(sid_str)
    if chara:
        result["support_card_chara_en"] = chara
    
    # Type from first digit of ID
    if sid_str:
        stype = SUPPORT_CARD_TYPES.get(sid_str[0])
        if stype:
            result["support_card_type"] = stype
    
    return result


def get_chara_info(data: dict, card_id: int) -> dict:
    """Get character info from card_id.
    
    card_id format: 1XXYYZ where:
    - 1XXY = chara_id (e.g., 1056 for Matikanefukukitaru)
    - Z = outfit variant (01, 02, etc.)
    """
    result = {}
    
    # Extract chara_id from card_id
    chara_id = str(card_id // 100)
    card_id_str = str(card_id)
    
    # Try global data first (has accurate English outfit names)
    umas_global = data.get("umas_global", {})
    if chara_id in umas_global:
        uma = umas_global[chara_id]
        names = uma.get("name", ["", ""])
        result["chara_name_en"] = names[1] if len(names) > 1 and names[1] else names[0]
        
        outfits = uma.get("outfits", {})
        if card_id_str in outfits:
            result["costume_name_en"] = outfits[card_id_str]
            result["card_name_en"] = f"{outfits[card_id_str]} {result['chara_name_en']}"
    
    # Fill in gaps from full data
    if "chara_name_en" not in result:
        umas_full = data.get("umas_full", {})
        if chara_id in umas_full:
            uma = umas_full[chara_id]
            names = uma.get("name", ["", ""])
            result["chara_name_en"] = names[1] if len(names) > 1 and names[1] else names[0]
            
            # Full data has JP outfit names but we can still use them as fallback
            outfits = uma.get("outfits", {})
            if card_id_str in outfits and "costume_name_en" not in result:
                result["costume_name_en"] = outfits[card_id_str]
                result["card_name_en"] = f"{outfits[card_id_str]} {result.get('chara_name_en', '')}"
    
    return result


def enrich_character(char: dict, data: dict) -> dict:
    """Add English names to a single character entry."""
    
    # Card/character info
    card_id = char.get("card_id")
    if card_id:
        info = get_chara_info(data, card_id)
        char.update(info)
    
    # Enrich skills
    skill_array = char.get("skill_array", [])
    for skill in skill_array:
        skill_id = skill.get("skill_id")
        if skill_id:
            skill_name = get_skill_name(data, skill_id)
            if skill_name:
                skill["skill_name_en"] = skill_name
    
    # Enrich sparks (called "Factors" in JP, "Sparks" in Global)
    factor_id_array = char.get("factor_id_array", [])
    enriched_sparks = []
    for spark_id in factor_id_array:
        spark_entry = {"spark_id": spark_id}
        spark_name = get_spark_name(data, spark_id)
        if spark_name:
            spark_entry["spark_name_en"] = spark_name
        enriched_sparks.append(spark_entry)
    if enriched_sparks:
        char["spark_array_enriched"] = enriched_sparks
    
    # Enrich factor_info_array (keep original key name for compatibility)
    factor_info_array = char.get("factor_info_array", [])
    for factor_info in factor_info_array:
        spark_id = factor_info.get("factor_id")
        if spark_id:
            spark_name = get_spark_name(data, spark_id)
            if spark_name:
                factor_info["spark_name_en"] = spark_name
    
    # Enrich win_saddle_id_array (race wins/trophies)
    win_saddle_array = char.get("win_saddle_id_array", [])
    if win_saddle_array:
        enriched_wins = []
        for saddle_id in win_saddle_array:
            win_entry = {"saddle_id": saddle_id}
            race_name = get_race_title_name(data, saddle_id)
            if race_name:
                win_entry["race_name_en"] = race_name
            enriched_wins.append(win_entry)
        char["win_saddle_array_enriched"] = enriched_wins
    
    # Enrich nickname_id_array (epithets and support bonuses)
    nickname_array = char.get("nickname_id_array", [])
    if nickname_array:
        enriched_nicknames = []
        for nickname_id in nickname_array:
            nick_entry = {"nickname_id": nickname_id}
            nick_name = get_nickname_name(data, nickname_id)
            if nick_name:
                nick_entry["nickname_name_en"] = nick_name
            enriched_nicknames.append(nick_entry)
        char["nickname_array_enriched"] = enriched_nicknames
    
    # Enrich support cards (using text_data categories 75, 76, 77)
    support_list = char.get("support_card_list", [])
    for support in support_list:
        support_id = support.get("support_card_id")
        if support_id:
            support_info = get_support_card_info(data, support_id)
            support.update(support_info)
    
    # Enrich succession (parent) characters
    succession_array = char.get("succession_chara_array", [])
    for parent in succession_array:
        parent_card_id = parent.get("card_id")
        if parent_card_id:
            info = get_chara_info(data, parent_card_id)
            parent.update(info)
            
            # Enrich parent's sparks
            parent_sparks = parent.get("factor_info_array", [])
            for spark in parent_sparks:
                spark_id = spark.get("factor_id")
                if spark_id:
                    spark_name = get_spark_name(data, spark_id)
                    if spark_name:
                        spark["spark_name_en"] = spark_name
    
    return char


def enrich_data(input_path: Path, output_path: Path):
    """Main function to enrich the data file."""
    
    # Load input data
    print(f"Loading {input_path}...")
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            characters = json.load(f)
    except FileNotFoundError:
        print(f"[X] Error: {input_path} not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"[X] Error: Invalid JSON in {input_path}: {e}")
        sys.exit(1)
    
    if not isinstance(characters, list):
        print(f"[X] Error: Expected array of characters, got {type(characters)}")
        sys.exit(1)
    
    print(f"[OK] Loaded {len(characters)} characters\n")
    
    # Download translation data
    data = download_all_data()
    
    if not data.get("skills_global") and not data.get("skills_jp") and not data.get("umas_global"):
        print("\n[!] No translation data available, output will have IDs only")
    
    # Enrich each character
    print("\nEnriching character data...")
    enriched_count = 0
    skill_enriched = 0
    
    for char in characters:
        before_keys = set(char.keys())
        enrich_character(char, data)
        after_keys = set(char.keys())
        if after_keys - before_keys:
            enriched_count += 1
        if any(s.get("skill_name_en") for s in char.get("skill_array", [])):
            skill_enriched += 1
    
    print(f"  [OK] {enriched_count}/{len(characters)} characters with name data")
    print(f"  [OK] {skill_enriched}/{len(characters)} characters with skill names")
    
    # Save output
    print(f"\nSaving to {output_path}...")
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(characters, f, indent=2, ensure_ascii=False)
        print(f"[OK] Saved enriched data to {output_path}")
    except PermissionError:
        print(f"[X] Error: Permission denied writing to {output_path}")
        sys.exit(1)
    
    # Show sample (with safe encoding for Windows console)
    if characters and (data.get("skills_global") or data.get("skills_jp") or data.get("umas_global")):
        sample = characters[0]
        
        def safe_print(text: str):
            """Print with fallback for non-ASCII chars on Windows."""
            try:
                print(text)
            except UnicodeEncodeError:
                print(text.encode("ascii", "replace").decode())
        
        print("\n--- Sample enriched character ---")
        safe_print(f"  card_id: {sample.get('card_id')}")
        safe_print(f"  chara_name_en: {sample.get('chara_name_en', 'N/A')}")
        safe_print(f"  costume_name_en: {sample.get('costume_name_en', 'N/A')}")
        safe_print(f"  card_name_en: {sample.get('card_name_en', 'N/A')}")
        
        skills = sample.get("skill_array", [])
        named_skills = [s for s in skills if s.get("skill_name_en")]
        if named_skills:
            safe_print(f"  skills with names: {len(named_skills)}/{len(skills)}")
            for skill in named_skills[:3]:
                safe_print(f"    - {skill.get('skill_name_en')} (Lv.{skill.get('level')})")
    
    print(f"\n[SUCCESS] Done!")


def main():
    # Parse arguments
    if len(sys.argv) >= 3:
        input_path = Path(sys.argv[1])
        output_path = Path(sys.argv[2])
    elif len(sys.argv) == 2:
        input_path = Path(sys.argv[1])
        output_path = input_path.parent / "enriched_data.json"
    else:
        # Default paths
        if Path("data.json").exists():
            input_path = Path("data.json")
        elif Path("../data.json").exists():
            input_path = Path("../data.json")
        else:
            print("Usage: python enrich_data.py [input.json] [output.json]")
            print("       If no arguments, reads data.json and writes enriched_data.json")
            sys.exit(1)
        output_path = input_path.parent / "enriched_data.json"
    
    enrich_data(input_path, output_path)


if __name__ == "__main__":
    main()
