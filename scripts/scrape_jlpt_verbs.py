#!/usr/bin/env python3
"""
JLPT Verb Scraper & Full-Corpus Normalizer (N5 - N1)
Fetches JMdict-simplified, JmdictFurigana, and JLPT N5-N1 vocabulary lists,
extracts all Kanji verbs across N5-N1 + career industry tracks, and builds
both the native SQLite DB and browser seed JSON.
"""

import csv
import gzip
import io
import json
import os
import re
import sqlite3
import ssl
import tarfile
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl._create_unverified_context()

KANJI_RE = re.compile(r"[\u4e00-\u9faf\u3400-\u4dbf]")
VERB_POS_PREFIXES = ("v1", "v5", "vk", "vs", "vz")

JLPT_CSV_URLS = {
    "N5": "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n5.csv",
    "N4": "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n4.csv",
    "N3": "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n3.csv",
    "N2": "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n2.csv",
    "N1": "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n1.csv",
}

JMDICT_RELEASE_API = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"
FURIGANA_RELEASE_API = "https://api.github.com/repos/Doublevil/JmdictFurigana/releases/latest"

# Curated High-Yield Overrides across N5-N1 and 6 specialized career tracks
CURATED_VERBS: List[Dict[str, Any]] = [
    # ==================== JLPT N5 ====================
    {
        "id": 10001, "kanji_form": "食べる", "furigana_reading": "たべる",
        "ruby_segments": [{"base": "食", "ruby": "た"}, {"base": "べる", "ruby": None}],
        "meanings": ["to eat"], "jlpt_level": "N5", "verb_group": "Ichidan",
        "constituent_kanji": ["食"], "industry_tags": ["general", "fnb"], "is_core_jlpt": 1
    },
    {
        "id": 10002, "kanji_form": "飲む", "furigana_reading": "のむ",
        "ruby_segments": [{"base": "飲", "ruby": "の"}, {"base": "む", "ruby": None}],
        "meanings": ["to drink"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["飲"], "industry_tags": ["general", "fnb"], "is_core_jlpt": 1
    },
    {
        "id": 10003, "kanji_form": "行く", "furigana_reading": "いく",
        "ruby_segments": [{"base": "行", "ruby": "い"}, {"base": "く", "ruby": None}],
        "meanings": ["to go", "to proceed"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["行"], "industry_tags": ["general"], "is_core_jlpt": 1
    },
    {
        "id": 10004, "kanji_form": "来る", "furigana_reading": "くる",
        "ruby_segments": [{"base": "来", "ruby": "く"}, {"base": "る", "ruby": None}],
        "meanings": ["to come", "to arrive"], "jlpt_level": "N5", "verb_group": "Irregular",
        "constituent_kanji": ["来"], "industry_tags": ["general"], "is_core_jlpt": 1
    },
    {
        "id": 10005, "kanji_form": "見る", "furigana_reading": "みる",
        "ruby_segments": [{"base": "見", "ruby": "み"}, {"base": "る", "ruby": None}],
        "meanings": ["to see", "to look", "to watch"], "jlpt_level": "N5", "verb_group": "Ichidan",
        "constituent_kanji": ["見"], "industry_tags": ["general", "it"], "is_core_jlpt": 1
    },
    {
        "id": 10006, "kanji_form": "聞く", "furigana_reading": "きく",
        "ruby_segments": [{"base": "聞", "ruby": "き"}, {"base": "く", "ruby": None}],
        "meanings": ["to hear", "to listen", "to ask"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["聞"], "industry_tags": ["general"], "is_core_jlpt": 1
    },
    {
        "id": 10007, "kanji_form": "話す", "furigana_reading": "はなす",
        "ruby_segments": [{"base": "話", "ruby": "はな"}, {"base": "す", "ruby": None}],
        "meanings": ["to speak", "to converse"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["話"], "industry_tags": ["general"], "is_core_jlpt": 1
    },
    {
        "id": 10008, "kanji_form": "買う", "furigana_reading": "かう",
        "ruby_segments": [{"base": "買", "ruby": "か"}, {"base": "う", "ruby": None}],
        "meanings": ["to buy", "to purchase"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["買"], "industry_tags": ["general", "finance"], "is_core_jlpt": 1
    },
    {
        "id": 10009, "kanji_form": "書く", "furigana_reading": "かく",
        "ruby_segments": [{"base": "書", "ruby": "か"}, {"base": "く", "ruby": None}],
        "meanings": ["to write", "to author"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["書"], "industry_tags": ["general", "it"], "is_core_jlpt": 1
    },
    {
        "id": 10010, "kanji_form": "読む", "furigana_reading": "よむ",
        "ruby_segments": [{"base": "読", "ruby": "よ"}, {"base": "む", "ruby": None}],
        "meanings": ["to read"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["読"], "industry_tags": ["general"], "is_core_jlpt": 1
    },
    {
        "id": 10011, "kanji_form": "待つ", "furigana_reading": "まつ",
        "ruby_segments": [{"base": "待", "ruby": "ま"}, {"base": "つ", "ruby": None}],
        "meanings": ["to wait", "to anticipate"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["待"], "industry_tags": ["general"], "is_core_jlpt": 1
    },
    {
        "id": 10012, "kanji_form": "会う", "furigana_reading": "あう",
        "ruby_segments": [{"base": "会", "ruby": "あ"}, {"base": "う", "ruby": None}],
        "meanings": ["to meet", "to encounter"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["会"], "industry_tags": ["general"], "is_core_jlpt": 1
    },
    {
        "id": 10013, "kanji_form": "入る", "furigana_reading": "はいる",
        "ruby_segments": [{"base": "入", "ruby": "はい"}, {"base": "る", "ruby": None}],
        "meanings": ["to enter", "to go into"], "jlpt_level": "N5", "verb_group": "Godan",
        "constituent_kanji": ["入"], "industry_tags": ["general"], "is_core_jlpt": 1
    },
    {
        "id": 10014, "kanji_form": "出る", "furigana_reading": "でる",
        "ruby_segments": [{"base": "出", "ruby": "で"}, {"base": "る", "ruby": None}],
        "meanings": ["to leave", "to exit", "to appear"], "jlpt_level": "N5", "verb_group": "Ichidan",
        "constituent_kanji": ["出"], "industry_tags": ["general"], "is_core_jlpt": 1
    },

    # ==================== JLPT N4 ====================
    {
        "id": 10020, "kanji_form": "働く", "furigana_reading": "はたらく",
        "ruby_segments": [{"base": "働", "ruby": "はたら"}, {"base": "く", "ruby": None}],
        "meanings": ["to work", "to labor"], "jlpt_level": "N4", "verb_group": "Godan",
        "constituent_kanji": ["働"], "industry_tags": ["general", "manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10021, "kanji_form": "教える", "furigana_reading": "おしえる",
        "ruby_segments": [{"base": "教", "ruby": "おし"}, {"base": "える", "ruby": None}],
        "meanings": ["to teach", "to instruct", "to explain"], "jlpt_level": "N4", "verb_group": "Ichidan",
        "constituent_kanji": ["教"], "industry_tags": ["general", "it"], "is_core_jlpt": 1
    },
    {
        "id": 10022, "kanji_form": "調べる", "furigana_reading": "しらべる",
        "ruby_segments": [{"base": "調", "ruby": "しら"}, {"base": "べる", "ruby": None}],
        "meanings": ["to investigate", "to inspect", "to query"], "jlpt_level": "N4", "verb_group": "Ichidan",
        "constituent_kanji": ["調"], "industry_tags": ["general", "it", "healthcare"], "is_core_jlpt": 1
    },
    {
        "id": 10023, "kanji_form": "集める", "furigana_reading": "あつめる",
        "ruby_segments": [{"base": "集", "ruby": "あつ"}, {"base": "める", "ruby": None}],
        "meanings": ["to collect", "to assemble", "to gather"], "jlpt_level": "N4", "verb_group": "Ichidan",
        "constituent_kanji": ["集"], "industry_tags": ["general", "it", "finance"], "is_core_jlpt": 1
    },
    {
        "id": 10024, "kanji_form": "届ける", "furigana_reading": "とどける",
        "ruby_segments": [{"base": "届", "ruby": "とど"}, {"base": "ける", "ruby": None}],
        "meanings": ["to deliver", "to forward", "to report"], "jlpt_level": "N4", "verb_group": "Ichidan",
        "constituent_kanji": ["届"], "industry_tags": ["general", "fnb", "manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10025, "kanji_form": "直す", "furigana_reading": "なおす",
        "ruby_segments": [{"base": "直", "ruby": "なお"}, {"base": "す", "ruby": None}],
        "meanings": ["to fix", "to repair", "to patch"], "jlpt_level": "N4", "verb_group": "Godan",
        "constituent_kanji": ["直"], "industry_tags": ["it", "manufacturing", "healthcare"], "is_core_jlpt": 1
    },
    {
        "id": 10026, "kanji_form": "運ぶ", "furigana_reading": "はこぶ",
        "ruby_segments": [{"base": "運", "ruby": "はこ"}, {"base": "ぶ", "ruby": None}],
        "meanings": ["to transport", "to carry", "to convey"], "jlpt_level": "N4", "verb_group": "Godan",
        "constituent_kanji": ["運"], "industry_tags": ["manufacturing", "fnb"], "is_core_jlpt": 1
    },
    {
        "id": 10027, "kanji_form": "焼く", "furigana_reading": "やく",
        "ruby_segments": [{"base": "焼", "ruby": "や"}, {"base": "く", "ruby": None}],
        "meanings": ["to bake", "to grill", "to roast"], "jlpt_level": "N4", "verb_group": "Godan",
        "constituent_kanji": ["焼"], "industry_tags": ["fnb"], "is_core_jlpt": 1
    },
    {
        "id": 10028, "kanji_form": "冷やす", "furigana_reading": "ひやす",
        "ruby_segments": [{"base": "冷", "ruby": "ひ"}, {"base": "やす", "ruby": None}],
        "meanings": ["to cool down", "to chill", "to refrigerate"], "jlpt_level": "N4", "verb_group": "Godan",
        "constituent_kanji": ["冷"], "industry_tags": ["fnb", "healthcare"], "is_core_jlpt": 1
    },
    {
        "id": 10029, "kanji_form": "払う", "furigana_reading": "はらう",
        "ruby_segments": [{"base": "払", "ruby": "はら"}, {"base": "う", "ruby": None}],
        "meanings": ["to pay", "to settle accounts"], "jlpt_level": "N4", "verb_group": "Godan",
        "constituent_kanji": ["払"], "industry_tags": ["finance", "general"], "is_core_jlpt": 1
    },
    {
        "id": 10030, "kanji_form": "建てる", "furigana_reading": "たてる",
        "ruby_segments": [{"base": "建", "ruby": "た"}, {"base": "てる", "ruby": None}],
        "meanings": ["to construct", "to build"], "jlpt_level": "N4", "verb_group": "Ichidan",
        "constituent_kanji": ["建"], "industry_tags": ["manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10031, "kanji_form": "治す", "furigana_reading": "なおす",
        "ruby_segments": [{"base": "治", "ruby": "なお"}, {"base": "す", "ruby": None}],
        "meanings": ["to cure", "to heal", "to remedy"], "jlpt_level": "N4", "verb_group": "Godan",
        "constituent_kanji": ["治"], "industry_tags": ["healthcare"], "is_core_jlpt": 1
    },

    # ==================== JLPT N3 ====================
    {
        "id": 10040, "kanji_form": "管理する", "furigana_reading": "かんりする",
        "ruby_segments": [{"base": "管", "ruby": "かん"}, {"base": "理", "ruby": "り"}, {"base": "する", "ruby": None}],
        "meanings": ["to manage", "to control", "to oversee"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["管", "理"], "industry_tags": ["it", "finance", "manufacturing", "healthcare"], "is_core_jlpt": 1
    },
    {
        "id": 10041, "kanji_form": "解決する", "furigana_reading": "かいけつする",
        "ruby_segments": [{"base": "解", "ruby": "かい"}, {"base": "決", "ruby": "けつ"}, {"base": "する", "ruby": None}],
        "meanings": ["to resolve", "to solve (an issue)"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["解", "決"], "industry_tags": ["it", "general", "finance"], "is_core_jlpt": 1
    },
    {
        "id": 10042, "kanji_form": "確認する", "furigana_reading": "かくにんする",
        "ruby_segments": [{"base": "確", "ruby": "かく"}, {"base": "認", "ruby": "にん"}, {"base": "する", "ruby": None}],
        "meanings": ["to confirm", "to verify", "to validate"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["確", "認"], "industry_tags": ["it", "finance", "manufacturing", "healthcare"], "is_core_jlpt": 1
    },
    {
        "id": 10043, "kanji_form": "保存する", "furigana_reading": "ほぞんする",
        "ruby_segments": [{"base": "保", "ruby": "ほ"}, {"base": "存", "ruby": "ぞん"}, {"base": "する", "ruby": None}],
        "meanings": ["to save", "to store (data)", "to preserve"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["保", "存"], "industry_tags": ["it", "fnb", "healthcare"], "is_core_jlpt": 1
    },
    {
        "id": 10044, "kanji_form": "変更する", "furigana_reading": "へんこうする",
        "ruby_segments": [{"base": "変", "ruby": "へん"}, {"base": "更", "ruby": "こう"}, {"base": "する", "ruby": None}],
        "meanings": ["to modify", "to change", "to update"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["変", "更"], "industry_tags": ["it", "finance", "manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10045, "kanji_form": "検査する", "furigana_reading": "けんさする",
        "ruby_segments": [{"base": "検", "ruby": "けん"}, {"base": "査", "ruby": "さ"}, {"base": "する", "ruby": None}],
        "meanings": ["to inspect", "to audit", "to test"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["検", "査"], "industry_tags": ["manufacturing", "healthcare", "it"], "is_core_jlpt": 1
    },
    {
        "id": 10046, "kanji_form": "計算する", "furigana_reading": "けいさんする",
        "ruby_segments": [{"base": "計", "ruby": "けい"}, {"base": "算", "ruby": "さん"}, {"base": "する", "ruby": None}],
        "meanings": ["to calculate", "to compute", "to reckon"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["計", "算"], "industry_tags": ["finance", "it"], "is_core_jlpt": 1
    },
    {
        "id": 10047, "kanji_form": "調理する", "furigana_reading": "ちょうりする",
        "ruby_segments": [{"base": "調", "ruby": "ちょう"}, {"base": "理", "ruby": "り"}, {"base": "する", "ruby": None}],
        "meanings": ["to prepare food", "to cook culinarily"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["調", "理"], "industry_tags": ["fnb"], "is_core_jlpt": 1
    },
    {
        "id": 10048, "kanji_form": "治療する", "furigana_reading": "ちりょうする",
        "ruby_segments": [{"base": "治", "ruby": "ち"}, {"base": "療", "ruby": "りょう"}, {"base": "する", "ruby": None}],
        "meanings": ["to treat", "to provide medical therapy"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["治", "療"], "industry_tags": ["healthcare"], "is_core_jlpt": 1
    },
    {
        "id": 10049, "kanji_form": "製造する", "furigana_reading": "せいぞうする",
        "ruby_segments": [{"base": "製", "ruby": "せい"}, {"base": "造", "ruby": "ぞう"}, {"base": "する", "ruby": None}],
        "meanings": ["to manufacture", "to fabricate"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["製", "造"], "industry_tags": ["manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10050, "kanji_form": "連絡する", "furigana_reading": "れんらくする",
        "ruby_segments": [{"base": "連", "ruby": "れん"}, {"base": "絡", "ruby": "らく"}, {"base": "する", "ruby": None}],
        "meanings": ["to contact", "to notify", "to get in touch"], "jlpt_level": "N3", "verb_group": "Irregular",
        "constituent_kanji": ["連", "絡"], "industry_tags": ["general", "it"], "is_core_jlpt": 1
    },

    # ==================== JLPT N2 ====================
    {
        "id": 10060, "kanji_form": "実装する", "furigana_reading": "じっそうする",
        "ruby_segments": [{"base": "実", "ruby": "じっ"}, {"base": "装", "ruby": "そう"}, {"base": "する", "ruby": None}],
        "meanings": ["to implement", "to engineer", "to code/deploy"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["実", "装"], "industry_tags": ["it", "manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10061, "kanji_form": "運用する", "furigana_reading": "うんようする",
        "ruby_segments": [{"base": "運", "ruby": "うん"}, {"base": "用", "ruby": "よう"}, {"base": "する", "ruby": None}],
        "meanings": ["to operate", "to run in production", "to manage assets"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["運", "用"], "industry_tags": ["it", "finance"], "is_core_jlpt": 1
    },
    {
        "id": 10062, "kanji_form": "投資する", "furigana_reading": "とうしする",
        "ruby_segments": [{"base": "投", "ruby": "とう"}, {"base": "資", "ruby": "し"}, {"base": "する", "ruby": None}],
        "meanings": ["to invest capital", "to allocate funds"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["投", "資"], "industry_tags": ["finance"], "is_core_jlpt": 1
    },
    {
        "id": 10063, "kanji_form": "診断する", "furigana_reading": "しんだんする",
        "ruby_segments": [{"base": "診", "ruby": "しん"}, {"base": "断", "ruby": "だん"}, {"base": "する", "ruby": None}],
        "meanings": ["to diagnose", "to troubleshoot", "to assess clinically"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["診", "断"], "industry_tags": ["healthcare", "it"], "is_core_jlpt": 1
    },
    {
        "id": 10064, "kanji_form": "検疫する", "furigana_reading": "けんえきする",
        "ruby_segments": [{"base": "検", "ruby": "けん"}, {"base": "疫", "ruby": "えき"}, {"base": "する", "ruby": None}],
        "meanings": ["to quarantine", "to inspect sanitary conditions"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["検", "疫"], "industry_tags": ["healthcare", "fnb"], "is_core_jlpt": 1
    },
    {
        "id": 10065, "kanji_form": "調達する", "furigana_reading": "ちょうたつする",
        "ruby_segments": [{"base": "調", "ruby": "ちょう"}, {"base": "達", "ruby": "たつ"}, {"base": "する", "ruby": None}],
        "meanings": ["to procure", "to source supplies", "to raise capital"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["調", "達"], "industry_tags": ["finance", "manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10066, "kanji_form": "出荷する", "furigana_reading": "しゅっかする",
        "ruby_segments": [{"base": "出", "ruby": "しゅっ"}, {"base": "荷", "ruby": "か"}, {"base": "する", "ruby": None}],
        "meanings": ["to ship goods", "to dispatch cargo"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["出", "荷"], "industry_tags": ["manufacturing", "fnb"], "is_core_jlpt": 1
    },
    {
        "id": 10067, "kanji_form": "仕入れる", "furigana_reading": "しいれる",
        "ruby_segments": [{"base": "仕", "ruby": "し"}, {"base": "入", "ruby": "い"}, {"base": "れる", "ruby": None}],
        "meanings": ["to purchase inventory", "to stock raw ingredients"], "jlpt_level": "N2", "verb_group": "Ichidan",
        "constituent_kanji": ["仕", "入"], "industry_tags": ["fnb", "manufacturing", "finance"], "is_core_jlpt": 1
    },
    {
        "id": 10068, "kanji_form": "監査する", "furigana_reading": "かんさする",
        "ruby_segments": [{"base": "監", "ruby": "かん"}, {"base": "査", "ruby": "さ"}, {"base": "する", "ruby": None}],
        "meanings": ["to audit", "to inspect compliance"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["監", "査"], "industry_tags": ["finance", "it"], "is_core_jlpt": 1
    },
    {
        "id": 10069, "kanji_form": "削減する", "furigana_reading": "さくげんする",
        "ruby_segments": [{"base": "削", "ruby": "さく"}, {"base": "減", "ruby": "げん"}, {"base": "する", "ruby": None}],
        "meanings": ["to reduce", "to cut costs", "to curtail"], "jlpt_level": "N2", "verb_group": "Irregular",
        "constituent_kanji": ["削", "減"], "industry_tags": ["finance", "manufacturing"], "is_core_jlpt": 1
    },

    # ==================== JLPT N1 ====================
    {
        "id": 10080, "kanji_form": "最適化する", "furigana_reading": "さいてきかする",
        "ruby_segments": [{"base": "最", "ruby": "さい"}, {"base": "適", "ruby": "てき"}, {"base": "化", "ruby": "か"}, {"base": "する", "ruby": None}],
        "meanings": ["to optimize", "to streamline processes"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["最", "適", "化"], "industry_tags": ["it", "manufacturing", "finance"], "is_core_jlpt": 1
    },
    {
        "id": 10081, "kanji_form": "統合する", "furigana_reading": "とうごうする",
        "ruby_segments": [{"base": "統", "ruby": "とう"}, {"base": "合", "ruby": "ごう"}, {"base": "する", "ruby": None}],
        "meanings": ["to integrate", "to consolidate systems"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["統", "合"], "industry_tags": ["it", "finance"], "is_core_jlpt": 1
    },
    {
        "id": 10082, "kanji_form": "保守する", "furigana_reading": "ほしゅする",
        "ruby_segments": [{"base": "保", "ruby": "ほ"}, {"base": "守", "ruby": "しゅ"}, {"base": "する", "ruby": None}],
        "meanings": ["to maintain", "to service infrastructure"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["保", "守"], "industry_tags": ["it", "manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10083, "kanji_form": "融資する", "furigana_reading": "ゆうしする",
        "ruby_segments": [{"base": "融", "ruby": "ゆう"}, {"base": "資", "ruby": "し"}, {"base": "する", "ruby": None}],
        "meanings": ["to finance", "to extend a credit loan"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["融", "資"], "industry_tags": ["finance"], "is_core_jlpt": 1
    },
    {
        "id": 10084, "kanji_form": "償還する", "furigana_reading": "しょうかんする",
        "ruby_segments": [{"base": "償", "ruby": "しょう"}, {"base": "還", "ruby": "かん"}, {"base": "する", "ruby": None}],
        "meanings": ["to redeem", "to amortize debt", "to refund"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["償", "還"], "industry_tags": ["finance"], "is_core_jlpt": 1
    },
    {
        "id": 10085, "kanji_form": "殺菌する", "furigana_reading": "さっきんする",
        "ruby_segments": [{"base": "殺", "ruby": "さっ"}, {"base": "菌", "ruby": "きん"}, {"base": "する", "ruby": None}],
        "meanings": ["to sterilize", "to pasteurize", "to disinfect"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["殺", "菌"], "industry_tags": ["healthcare", "fnb"], "is_core_jlpt": 1
    },
    {
        "id": 10086, "kanji_form": "処方する", "furigana_reading": "しょほうする",
        "ruby_segments": [{"base": "処", "ruby": "しょ"}, {"base": "方", "ruby": "ほう"}, {"base": "する", "ruby": None}],
        "meanings": ["to prescribe medication"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["処", "方"], "industry_tags": ["healthcare"], "is_core_jlpt": 1
    },
    {
        "id": 10087, "kanji_form": "量産する", "furigana_reading": "りょうさんする",
        "ruby_segments": [{"base": "量", "ruby": "りょう"}, {"base": "産", "ruby": "さん"}, {"base": "する", "ruby": None}],
        "meanings": ["to mass-produce industrially"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["量", "産"], "industry_tags": ["manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10088, "kanji_form": "稼働する", "furigana_reading": "かどうする",
        "ruby_segments": [{"base": "稼", "ruby": "か"}, {"base": "働", "ruby": "どう"}, {"base": "する", "ruby": None}],
        "meanings": ["to operate actively", "to run uptime"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["稼", "働"], "industry_tags": ["it", "manufacturing"], "is_core_jlpt": 1
    },
    {
        "id": 10089, "kanji_form": "試作する", "furigana_reading": "しさくする",
        "ruby_segments": [{"base": "試", "ruby": "し"}, {"base": "作", "ruby": "さく"}, {"base": "する", "ruby": None}],
        "meanings": ["to prototype", "to fabricate a trial pilot"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["試", "作"], "industry_tags": ["manufacturing", "it"], "is_core_jlpt": 1
    },
    {
        "id": 10090, "kanji_form": "担保する", "furigana_reading": "たんぽする",
        "ruby_segments": [{"base": "担", "ruby": "たん"}, {"base": "保", "ruby": "ぽ"}, {"base": "する", "ruby": None}],
        "meanings": ["to collateralize", "to secure (a loan/guarantee)"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["担", "保"], "industry_tags": ["finance"], "is_core_jlpt": 1
    },
    {
        "id": 10091, "kanji_form": "暗号化する", "furigana_reading": "あんごうかする",
        "ruby_segments": [{"base": "暗", "ruby": "あん"}, {"base": "号", "ruby": "ごう"}, {"base": "化", "ruby": "か"}, {"base": "する", "ruby": None}],
        "meanings": ["to encrypt", "to encipher"], "jlpt_level": "N1", "verb_group": "Irregular",
        "constituent_kanji": ["暗", "号", "化"], "industry_tags": ["it"], "is_core_jlpt": 1
    }
]

FIELD_TO_INDUSTRY = {
    "comp": "it",
    "telec": "it",
    "finc": "finance",
    "econ": "finance",
    "bus": "finance",
    "food": "fnb",
    "med": "healthcare",
    "anat": "healthcare",
    "pharm": "healthcare",
    "engr": "manufacturing",
    "mech": "manufacturing",
    "elec": "manufacturing",
    "arch": "manufacturing",
}

KEYWORD_TO_INDUSTRY = {
    "it": ("software", "program", "database", "server", "network", "encrypt", "compile", "debug", "algorithm", "system", "data"),
    "finance": ("invest", "loan", "bank", "tax", "audit", "account", "finance", "stock", "bond", "debt", "credit", "budget", "remit"),
    "fnb": ("cook", "bake", "boil", "fry", "grill", "simmer", "brew", "ingredient", "seasoning", "dish", "culinary", "ferment"),
    "healthcare": ("diagnose", "prescribe", "symptom", "disease", "surgery", "clinical", "patient", "therapy", "sterilize", "nurse"),
    "manufacturing": ("manufacture", "fabricate", "assemble", "machinery", "cargo", "warehouse", "mass-produce", "prototype", "inspect"),
}


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "JLPT-Verb-Studio-Scraper/1.0"})
    with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as resp:
        return resp.read()


def fetch_jlpt_map() -> Dict[Tuple[str, str], str]:
    """Returns {(kanji_form, reading): 'N5'..'N1'} and {(kanji_form, ''): 'N5'..'N1'}."""
    jlpt_lookup: Dict[Tuple[str, str], str] = {}
    for level in ("N5", "N4", "N3", "N2", "N1"):
        print(f"Fetching JLPT {level} list...")
        raw = fetch_bytes(JLPT_CSV_URLS[level]).decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(raw))
        for row in reader:
            expr = (row.get("expression") or "").strip()
            read = (row.get("reading") or "").strip()
            if expr and KANJI_RE.search(expr):
                jlpt_lookup.setdefault((expr, read), level)
                jlpt_lookup.setdefault((expr, ""), level)
    return jlpt_lookup


def fetch_jmdict_words() -> List[Dict[str, Any]]:
    release = json.loads(fetch_bytes(JMDICT_RELEASE_API).decode("utf-8"))
    asset = next(
        a for a in release["assets"]
        if a["name"].startswith("jmdict-eng-") and a["name"].endswith(".json.tgz")
    )
    print(f"Downloading {asset['name']}...")
    tgz_bytes = fetch_bytes(asset["browser_download_url"])
    with tarfile.open(fileobj=io.BytesIO(tgz_bytes), mode="r:gz") as tf:
        member = next(m for m in tf.getmembers() if m.name.endswith(".json"))
        data = json.load(tf.extractfile(member))
    return data["words"]


def fetch_furigana_map() -> Dict[Tuple[str, str], List[Dict[str, Optional[str]]]]:
    release = json.loads(fetch_bytes(FURIGANA_RELEASE_API).decode("utf-8"))
    asset = next(
        a for a in release["assets"]
        if "JmdictFurigana.json" in a["name"]
    )
    print(f"Downloading {asset['name']}...")
    raw = fetch_bytes(asset["browser_download_url"])
    if asset["name"].endswith(".tar.gz") or asset["name"].endswith(".tgz"):
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tf:
            member = next(m for m in tf.getmembers() if m.name.endswith(".json"))
            entries = json.loads(tf.extractfile(member).read().decode("utf-8-sig"))
    elif asset["name"].endswith(".gz"):
        entries = json.loads(gzip.decompress(raw).decode("utf-8-sig"))
    else:
        entries = json.loads(raw.decode("utf-8-sig"))

    furi_map: Dict[Tuple[str, str], List[Dict[str, Optional[str]]]] = {}
    for item in entries:
        key = (item["text"], item["reading"])
        furi_map[key] = [
            {"base": seg["ruby"], "ruby": seg.get("rt")}
            for seg in item.get("furigana", [])
        ]
    return furi_map


def fallback_ruby_segments(kanji_form: str, reading: str) -> List[Dict[str, Optional[str]]]:
    """Deterministic okurigana splitter when exact character ruby isn't in JmdictFurigana."""
    prefix = ""
    suffix = ""
    k_chars = list(kanji_form)
    r_str = reading

    while k_chars and not KANJI_RE.match(k_chars[0]) and r_str.startswith(k_chars[0]):
        prefix += k_chars.pop(0)
        r_str = r_str[1:]

    while k_chars and not KANJI_RE.match(k_chars[-1]) and r_str.endswith(k_chars[-1]):
        suffix = k_chars.pop() + suffix
        r_str = r_str[:-1]

    segments: List[Dict[str, Optional[str]]] = []
    if prefix:
        segments.append({"base": prefix, "ruby": None})
    if k_chars:
        segments.append({"base": "".join(k_chars), "ruby": r_str or reading})
    if suffix:
        segments.append({"base": suffix, "ruby": None})
    return segments or [{"base": kanji_form, "ruby": reading}]


def detect_verb_group(pos_tags: List[str]) -> str:
    if any(p.startswith("v1") for p in pos_tags):
        return "Ichidan"
    if any(p.startswith("vk") or p.startswith("vs") for p in pos_tags):
        return "Irregular"
    return "Godan"


def infer_industries(fields: List[str], meanings: List[str], is_core: bool) -> List[str]:
    tags = set()
    if is_core:
        tags.add("general")
    for f in fields:
        if f in FIELD_TO_INDUSTRY:
            tags.add(FIELD_TO_INDUSTRY[f])
    joined = " ".join(meanings).lower()
    for industry, keywords in KEYWORD_TO_INDUSTRY.items():
        if any(kw in joined for kw in keywords):
            tags.add(industry)
    return sorted(tags) or ["general"]


def scrape_all_verbs() -> List[Dict[str, Any]]:
    jlpt_map = fetch_jlpt_map()
    furi_map = fetch_furigana_map()
    words = fetch_jmdict_words()

    curated_by_kanji = {v["kanji_form"]: v for v in CURATED_VERBS}
    results: Dict[str, Dict[str, Any]] = {}

    for entry in words:
        kanji_list = entry.get("kanji") or []
        kana_list = entry.get("kana") or []
        if not kanji_list or not kana_list:
            continue

        kanji_form = kanji_list[0]["text"]
        if not KANJI_RE.search(kanji_form):
            continue

        reading = kana_list[0]["text"]
        pos_tags: List[str] = []
        fields: List[str] = []
        meanings: List[str] = []

        for sense in entry.get("sense", []):
            pos_tags.extend(sense.get("partOfSpeech", []))
            fields.extend(sense.get("field", []))
            for g in sense.get("gloss", []):
                if g.get("lang") == "eng" and g.get("text") not in meanings:
                    meanings.append(g["text"])

        if not any(p.startswith(VERB_POS_PREFIXES) for p in pos_tags):
            continue
        if not meanings:
            continue

        jlpt_level = jlpt_map.get((kanji_form, reading)) or jlpt_map.get((kanji_form, ""))
        industries = infer_industries(fields, meanings[:4], is_core=bool(jlpt_level))

        # Include all JLPT N5-N1 verbs PLUS specialized workplace verbs
        has_specialized_industry = any(t != "general" for t in industries)
        if not jlpt_level and not has_specialized_industry:
            continue

        effective_level = jlpt_level or "N1"
        is_core = 1 if jlpt_level else 0
        ruby_segs = furi_map.get((kanji_form, reading)) or fallback_ruby_segments(kanji_form, reading)
        constituent_kanji = list(dict.fromkeys(KANJI_RE.findall(kanji_form)))

        results[kanji_form] = {
            "id": int(entry["id"]),
            "kanji_form": kanji_form,
            "furigana_reading": reading,
            "ruby_segments": ruby_segs,
            "meanings": meanings[:4],
            "jlpt_level": effective_level,
            "verb_group": detect_verb_group(pos_tags),
            "constituent_kanji": constituent_kanji,
            "industry_tags": industries,
            "is_core_jlpt": is_core,
        }

    # Apply curated overrides so domain tags & ruby splits are preserved
    for kanji_form, curated in curated_by_kanji.items():
        if kanji_form in results:
            merged_tags = sorted(set(results[kanji_form]["industry_tags"]) | set(curated["industry_tags"]))
            results[kanji_form]["industry_tags"] = merged_tags
            results[kanji_form]["ruby_segments"] = curated["ruby_segments"]
            results[kanji_form]["jlpt_level"] = curated["jlpt_level"]
        else:
            results[kanji_form] = curated

    level_order = {"N5": 1, "N4": 2, "N3": 3, "N2": 4, "N1": 5}
    return sorted(results.values(), key=lambda x: (level_order[x["jlpt_level"]], x["id"]))


def generate_sqlite_db(verbs: List[Dict[str, Any]], db_path: str) -> None:
    """Initializes and seeds the offline SQLite database."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE verbs (
        id INTEGER PRIMARY KEY,
        kanji_form TEXT NOT NULL,
        furigana_reading TEXT NOT NULL,
        ruby_segments TEXT NOT NULL,
        meanings TEXT NOT NULL,
        jlpt_level TEXT NOT NULL,
        verb_group TEXT NOT NULL,
        constituent_kanji TEXT NOT NULL,
        industry_tags TEXT NOT NULL,
        is_core_jlpt INTEGER NOT NULL DEFAULT 1
    );
    """)

    cursor.execute("CREATE INDEX idx_verbs_jlpt ON verbs(jlpt_level);")
    cursor.execute("CREATE INDEX idx_verbs_core ON verbs(is_core_jlpt);")

    for v in verbs:
        cursor.execute("""
        INSERT INTO verbs (
            id, kanji_form, furigana_reading, ruby_segments, meanings,
            jlpt_level, verb_group, constituent_kanji, industry_tags, is_core_jlpt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            v["id"],
            v["kanji_form"],
            v["furigana_reading"],
            json.dumps(v["ruby_segments"], ensure_ascii=False),
            json.dumps(v["meanings"], ensure_ascii=False),
            v["jlpt_level"],
            v["verb_group"],
            json.dumps(v["constituent_kanji"], ensure_ascii=False),
            json.dumps(v["industry_tags"], ensure_ascii=False),
            v["is_core_jlpt"],
        ))

    conn.commit()
    conn.close()
    print(f"Generated SQLite DB at {db_path} with {len(verbs)} verbs.")


def main() -> None:
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    db_out = os.path.join(root_dir, "src-tauri", "resources", "verbs_corpus.db")
    json_out = os.path.join(root_dir, "src", "data", "seed_verbs.json")

    try:
        verbs = scrape_all_verbs()
        print(f"Successfully ingested {len(verbs)} JLPT & industry kanji verbs.")
    except Exception as exc:
        print(f"Network ingestion failed ({exc}); falling back to CURATED_VERBS seed.")
        verbs = CURATED_VERBS

    os.makedirs(os.path.dirname(json_out), exist_ok=True)
    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(verbs, f, ensure_ascii=False, indent=2)
    print(f"Wrote {json_out}")

    generate_sqlite_db(verbs, db_out)


if __name__ == "__main__":
    main()