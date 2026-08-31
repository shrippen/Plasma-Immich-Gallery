#!/usr/bin/env python3
"""Generate .po files from translations.json. Run: python3 gen.py"""
import json, os

DIR = os.path.dirname(os.path.abspath(__file__))
JP = os.path.join(DIR, "translations.json")

with open(JP, "r", encoding="utf-8") as f:
    LANGS = json.load(f)

META = {
    "de": ("German", "de", "nplurals=2; plural=(n != 1);"),
    "fr": ("French", "fr", "nplurals=2; plural=(n > 1);"),
    "ja": ("Japanese", "ja", "nplurals=1; plural=0;"),
    "es": ("Spanish", "es", "nplurals=2; plural=(n != 1);"),
    "zh_CN": ("Chinese (Simplified)", "zh_CN", "nplurals=1; plural=0;"),
    "it": ("Italian", "it", "nplurals=2; plural=(n != 1);"),
    "nb": ("Norwegian Bokm\u00e5l", "nb", "nplurals=2; plural=(n != 1);"),
    "fi": ("Finnish", "fi", "nplurals=2; plural=(n != 1);"),
    "sv": ("Swedish", "sv", "nplurals=2; plural=(n != 1);"),
}

# Read STRINGS list directly from translations.json keys of the first language
first_lang = next(iter(LANGS.values()))
STRINGS = list(first_lang.keys())

def escape_po(s):
    return s.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')

if __name__ == "__main__":
    for code, tr in LANGS.items():
        team, lang, plurals = META.get(code, (code, code, "nplurals=2; plural=(n != 1);"))
        lines = [
            f"# {team} translation for Plasma-Immich-Gallery",
            'msgid ""',
            'msgstr ""',
            f'"Project-Id-Version: Plasma-Immich-Gallery 1.0\\n"',
            f'"Language: {lang}\\n"',
            f'"Language-Team: {team}\\n"',
            '"MIME-Version: 1.0\\n"',
            '"Content-Type: text/plain; charset=UTF-8\\n"',
            '"Content-Transfer-Encoding: 8bit\\n"',
            f'"Plural-Forms: {plurals}\\n"',
            "",
        ]
        for src in STRINGS:
            t = tr.get(src, "")
            lines.append(f"msgid \"{escape_po(src)}\"")
            lines.append(f"msgstr \"{escape_po(t)}\"")
            lines.append("")
        po_path = os.path.join(DIR, f"{code}.po")
        with open(po_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"  {code}.po ({len(STRINGS)} strings)")
    print(f"\nDone! {len(LANGS)} .po files")
