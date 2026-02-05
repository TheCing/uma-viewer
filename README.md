# Uma Viewer

A data enrichment and visualization tool for Uma Musume Pretty Derby trained character data.

Works with data exported from [UmaExtractor](https://github.com/FabulousCupcake/UmaExtractor).

## Features

- **Data Enrichment**: Adds English names to characters, skills, sparks, support cards, race wins, and epithets
- **Web Viewer**: Clean, coder-aesthetic interface to browse your trained characters
- **Family Tree**: Visual lineage tracking showing parents and grandparents
- **Clickable Navigation**: Jump between related characters in your collection

## Data Sources

English names are fetched from community translation projects:
- [uma-tools](https://github.com/TheCing/uma-tools) - Global skill and character names
- [UmaTL/hachimi-tl-en](https://github.com/UmaTL/hachimi-tl-en) - Text translations

## Usage

### 1. Export your data

Use [UmaExtractor](https://github.com/FabulousCupcake/UmaExtractor) to export your trained character data to `data.json`.

### 2. Enrich the data

```bash
python enrich_data.py data.json
```

This will create `enriched_data.json` with English names added.

**Requirements**: Python 3.10+ with `requests` library

```bash
pip install requests
```

### 3. View in browser

Start a local server in the same directory as `enriched_data.json` and `viewer.html`:

```bash
python -m http.server 8000
```

Open http://localhost:8000/viewer.html in your browser.

## What Gets Enriched

| Field | Description |
|-------|-------------|
| Character names | Base character + outfit/costume names |
| Skills | Skill names from Global data |
| Sparks | Stats, aptitudes, scenarios, race sparks, skill sparks |
| Support Cards | Full name, character, title, type (Speed/Stamina/etc.) |
| Race Wins | G1/G2/G3 race titles and achievements |
| Epithets | Earned titles like "G1 Hunter", "Legendary Diva" |
| Inheritance | Parent character names and their sparks |

## Viewer Sections

- **Stats**: Speed, Stamina, Power, Guts, Wisdom
- **Skills**: All learned skills with levels
- **Sparks**: Inherited factors/sparks
- **Race Wins**: Trophies earned during training
- **Epithets**: Achievement titles and support bonuses
- **Support Cards**: Training deck with type and limit break info
- **Family Tree**: Visual lineage with clickable ancestors
- **Races**: Recent race results
- **Raw JSON**: Collapsible full data view

## Screenshots

*Coming soon*

## License

MIT
