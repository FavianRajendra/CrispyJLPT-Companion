import { RubySegment, JlptLevel } from "../lib/db";

export interface TenseConjugationRow {
  tenseName: string;
  tenseEnglish: string;
  conjugatedForm: string;
  furiganaReading: string;
  rubySegments: RubySegment[];
  formationRule: string;
  exampleSentence: {
    japaneseWithRuby: RubySegment[];
    english: string;
  };
}

export interface SampleVerbModel {
  id: string;
  kanji: string;
  reading: string;
  meaning: string;
  group: "Ichidan" | "Godan" | "Irregular";
  level: JlptLevel;
  conjugations: TenseConjugationRow[];
}

export interface ParticleItem {
  id: string;
  particle: string;
  jlpt_level: JlptLevel;
  role: string;
  nuanceAndContrast: string;
  examples: {
    sentenceRuby: RubySegment[];
    english: string;
    focusExplanation: string;
  }[];
}

export interface GrammarQuestion {
  id: number;
  sentencePre: string;
  sentencePost: string;
  targetCategory: "particle" | "conjugation";
  jlpt_level: JlptLevel;
  correctAnswer: string;
  options: {
    text: string;
    explanation: string;
  }[];
  sentenceTranslation: string;
  fullSentenceRuby: RubySegment[];
  ruleSummary: string;
}

export const SAMPLE_VERBS: SampleVerbModel[] = [
  {
    id: "taberu",
    kanji: "食べる",
    reading: "たべる",
    meaning: "to eat",
    group: "Ichidan",
    level: "N5",
    conjugations: [
      {
        tenseName: "辞書形 (Non-Past Plain)",
        tenseEnglish: "Present / Future",
        conjugatedForm: "食べる",
        furiganaReading: "たべる",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べる", ruby: null }],
        formationRule: "Dictionary base form",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "毎日", ruby: "まいにち" },
            { base: "朝", ruby: "あさ" },
            { base: "ご飯", ruby: "はん" },
            { base: "を", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べる。", ruby: null },
          ],
          english: "I eat breakfast every day.",
        },
      },
      {
        tenseName: "タ形 (Past Plain)",
        tenseEnglish: "Past affirmative",
        conjugatedForm: "食べた",
        furiganaReading: "たべた",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べた", ruby: null }],
        formationRule: "Stem + た (Ichidan drop る -> た)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "昨日", ruby: "きのう" },
            { base: "すし", ruby: null },
            { base: "を", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べた。", ruby: null },
          ],
          english: "I ate sushi yesterday.",
        },
      },
      {
        tenseName: "ナイ形 (Negative Plain)",
        tenseEnglish: "Present negative",
        conjugatedForm: "食べない",
        furiganaReading: "たべない",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べない", ruby: null }],
        formationRule: "Stem + ない (Drop る -> ない)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "肉", ruby: "にく" },
            { base: "は", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べない。", ruby: null },
          ],
          english: "I do not eat meat.",
        },
      },
      {
        tenseName: "ナカッタ形 (Past Negative)",
        tenseEnglish: "Past negative",
        conjugatedForm: "食べなかった",
        furiganaReading: "たべなかった",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べなかった", ruby: null }],
        formationRule: "Negative stem + かった",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "朝", ruby: "あさ" },
            { base: "何", ruby: "なに" },
            { base: "も", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べなかった。", ruby: null },
          ],
          english: "I didn't eat anything this morning.",
        },
      },
      {
        tenseName: "マス形 (Polite Non-Past)",
        tenseEnglish: "Formal present",
        conjugatedForm: "食べます",
        furiganaReading: "たべます",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べます", ruby: null }],
        formationRule: "Stem + ます",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "レストラン", ruby: null },
            { base: "で", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べます。", ruby: null },
          ],
          english: "I will eat at a restaurant.",
        },
      },
      {
        tenseName: "マシタ形 (Polite Past)",
        tenseEnglish: "Formal past",
        conjugatedForm: "食べました",
        furiganaReading: "たべました",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べました", ruby: null }],
        formationRule: "Stem + ました",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "美味", ruby: "おい" },
            { base: "しく", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べました。", ruby: null },
          ],
          english: "I ate deliciously.",
        },
      },
      {
        tenseName: "テ形 (Te-Form)",
        tenseEnglish: "Connecting / Sequential",
        conjugatedForm: "食べて",
        furiganaReading: "たべて",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べて", ruby: null }],
        formationRule: "Stem + て",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "食", ruby: "た" },
            { base: "べて", ruby: null },
            { base: "から", ruby: null },
            { base: "行", ruby: "い" },
            { base: "きます。", ruby: null },
          ],
          english: "I will go after eating.",
        },
      },
      {
        tenseName: "可能形 (Potential)",
        tenseEnglish: "Can eat / able to eat",
        conjugatedForm: "食べられる",
        furiganaReading: "たべられる",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べられる", ruby: null }],
        formationRule: "Stem + られる (Colloquial: れる)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "辛", ruby: "から" },
            { base: "い", ruby: null },
            { base: "物", ruby: "もの" },
            { base: "が", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べられる。", ruby: null },
          ],
          english: "I can eat spicy food.",
        },
      },
      {
        tenseName: "受身形 (Passive)",
        tenseEnglish: "Is eaten / was eaten by",
        conjugatedForm: "食べられる",
        furiganaReading: "たべられる",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べられる", ruby: null }],
        formationRule: "Stem + られる",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "ケーキ", ruby: null },
            { base: "が", ruby: null },
            { base: "誰", ruby: "だれ" },
            { base: "かに", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べられた。", ruby: null },
          ],
          english: "The cake was eaten by someone.",
        },
      },
      {
        tenseName: "意向形 (Volitional)",
        tenseEnglish: "Let's eat / shall we eat",
        conjugatedForm: "食べよう",
        furiganaReading: "たべよう",
        rubySegments: [{ base: "食", ruby: "た" }, { base: "べよう", ruby: null }],
        formationRule: "Stem + よう",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "一緒", ruby: "いっしょ" },
            { base: "に", ruby: null },
            { base: "食", ruby: "た" },
            { base: "べよう！", ruby: null },
          ],
          english: "Let's eat together!",
        },
      },
    ],
  },
  {
    id: "kaku",
    kanji: "書く",
    reading: "かく",
    meaning: "to write",
    group: "Godan",
    level: "N5",
    conjugations: [
      {
        tenseName: "辞書形 (Non-Past Plain)",
        tenseEnglish: "Present / Future",
        conjugatedForm: "書く",
        furiganaReading: "かく",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "く", ruby: null }],
        formationRule: "Godan u-ending base",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "手紙", ruby: "てがみ" },
            { base: "を", ruby: null },
            { base: "書", ruby: "か" },
            { base: "く。", ruby: null },
          ],
          english: "I write a letter.",
        },
      },
      {
        tenseName: "タ形 (Past Plain)",
        tenseEnglish: "Past affirmative",
        conjugatedForm: "書いた",
        furiganaReading: "かいた",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "いた", ruby: null }],
        formationRule: "く -> いた (I-onbin sound shift)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "報告書", ruby: "ほうこくしょ" },
            { base: "を", ruby: null },
            { base: "書", ruby: "か" },
            { base: "いた。", ruby: null },
          ],
          english: "I wrote the report.",
        },
      },
      {
        tenseName: "ナイ形 (Negative Plain)",
        tenseEnglish: "Present negative",
        conjugatedForm: "書かない",
        furiganaReading: "かかない",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "かない", ruby: null }],
        formationRule: "く -> か + ない (a-row change)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "メモ", ruby: null },
            { base: "は", ruby: null },
            { base: "書", ruby: "か" },
            { base: "かない。", ruby: null },
          ],
          english: "I do not write notes.",
        },
      },
      {
        tenseName: "ナカッタ形 (Past Negative)",
        tenseEnglish: "Past negative",
        conjugatedForm: "書かなかった",
        furiganaReading: "かかなかった",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "かなかった", ruby: null }],
        formationRule: "書かない -> 書かなかった",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "返事", ruby: "へんじ" },
            { base: "を", ruby: null },
            { base: "書", ruby: "か" },
            { base: "かなかった。", ruby: null },
          ],
          english: "I did not write a reply.",
        },
      },
      {
        tenseName: "マス形 (Polite Non-Past)",
        tenseEnglish: "Formal present",
        conjugatedForm: "書きます",
        furiganaReading: "かきます",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "きます", ruby: null }],
        formationRule: "く -> き + ます (i-row change)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "丁寧", ruby: "ていねい" },
            { base: "に", ruby: null },
            { base: "書", ruby: "か" },
            { base: "きます。", ruby: null },
          ],
          english: "I will write politely.",
        },
      },
      {
        tenseName: "テ形 (Te-Form)",
        tenseEnglish: "Connecting / Continuous",
        conjugatedForm: "書いて",
        furiganaReading: "かいて",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "いて", ruby: null }],
        formationRule: "く -> いて",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "名前", ruby: "なまえ" },
            { base: "を", ruby: null },
            { base: "書", ruby: "か" },
            { base: "いて", ruby: null },
            { base: "ください。", ruby: null },
          ],
          english: "Please write your name.",
        },
      },
      {
        tenseName: "可能形 (Potential)",
        tenseEnglish: "Can write",
        conjugatedForm: "書ける",
        furiganaReading: "かける",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "ける", ruby: null }],
        formationRule: "く -> け + る (e-row shift)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "漢字", ruby: "かんじ" },
            { base: "が", ruby: null },
            { base: "書", ruby: "か" },
            { base: "ける。", ruby: null },
          ],
          english: "I can write kanji.",
        },
      },
      {
        tenseName: "受身形 (Passive)",
        tenseEnglish: "Is written",
        conjugatedForm: "書かれる",
        furiganaReading: "かかれる",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "かれる", ruby: null }],
        formationRule: "く -> か + れる",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "記事", ruby: "きじ" },
            { base: "が", ruby: null },
            { base: "書", ruby: "か" },
            { base: "かれた。", ruby: null },
          ],
          english: "The article was written.",
        },
      },
      {
        tenseName: "意向形 (Volitional)",
        tenseEnglish: "Let's write",
        conjugatedForm: "書こう",
        furiganaReading: "かこう",
        rubySegments: [{ base: "書", ruby: "か" }, { base: "こう", ruby: null }],
        formationRule: "く -> こ + う (o-row shift)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "日記", ruby: "にっき" },
            { base: "を", ruby: null },
            { base: "書", ruby: "か" },
            { base: "こう！", ruby: null },
          ],
          english: "Let's write a diary!",
        },
      },
    ],
  },
  {
    id: "jissou",
    kanji: "実装する",
    reading: "じっそうする",
    meaning: "to implement / deploy",
    group: "Irregular",
    level: "N2",
    conjugations: [
      {
        tenseName: "辞書形 (Non-Past Plain)",
        tenseEnglish: "Present / Future",
        conjugatedForm: "実装する",
        furiganaReading: "じっそうする",
        rubySegments: [
          { base: "実", ruby: "じっ" },
          { base: "装", ruby: "そう" },
          { base: "する", ruby: null },
        ],
        formationRule: "Noun + する (Irregular suru verb)",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "新機能", ruby: "しんきのう" },
            { base: "を", ruby: null },
            { base: "実", ruby: "じっ" },
            { base: "装", ruby: "そう" },
            { base: "する。", ruby: null },
          ],
          english: "I will implement the new feature.",
        },
      },
      {
        tenseName: "タ形 (Past Plain)",
        tenseEnglish: "Past affirmative",
        conjugatedForm: "実装した",
        furiganaReading: "じっそうした",
        rubySegments: [
          { base: "実", ruby: "じっ" },
          { base: "装", ruby: "そう" },
          { base: "した", ruby: null },
        ],
        formationRule: "する -> した",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "昨日", ruby: "きのう" },
            { base: "API", ruby: null },
            { base: "を", ruby: null },
            { base: "実", ruby: "じっ" },
            { base: "装", ruby: "そう" },
            { base: "した。", ruby: null },
          ],
          english: "I implemented the API yesterday.",
        },
      },
      {
        tenseName: "ナイ形 (Negative Plain)",
        tenseEnglish: "Present negative",
        conjugatedForm: "実装しない",
        furiganaReading: "じっそうしない",
        rubySegments: [
          { base: "実", ruby: "じっ" },
          { base: "装", ruby: "そう" },
          { base: "しない", ruby: null },
        ],
        formationRule: "する -> しない",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "今回", ruby: "こんかい" },
            { base: "は", ruby: null },
            { base: "実", ruby: "じっ" },
            { base: "装", ruby: "そう" },
            { base: "しない。", ruby: null },
          ],
          english: "We will not implement it this time.",
        },
      },
      {
        tenseName: "マス形 (Polite Non-Past)",
        tenseEnglish: "Formal present",
        conjugatedForm: "実装します",
        furiganaReading: "じっそうします",
        rubySegments: [
          { base: "実", ruby: "じっ" },
          { base: "装", ruby: "そう" },
          { base: "します", ruby: null },
        ],
        formationRule: "する -> します",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "仕様書", ruby: "しようしょ" },
            { base: "通", ruby: "どお" },
            { base: "りに", ruby: null },
            { base: "実", ruby: "じっ" },
            { base: "装", ruby: "そう" },
            { base: "します。", ruby: null },
          ],
          english: "I will implement it per the spec sheet.",
        },
      },
      {
        tenseName: "テ形 (Te-Form)",
        tenseEnglish: "Connecting / Sequential",
        conjugatedForm: "実装して",
        furiganaReading: "じっそうして",
        rubySegments: [
          { base: "実", ruby: "じっ" },
          { base: "装", ruby: "そう" },
          { base: "して", ruby: null },
        ],
        formationRule: "する -> して",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "実", ruby: "じっ" },
            { base: "装", ruby: "そう" },
            { base: "して", ruby: null },
            { base: "テスト", ruby: null },
            { base: "を", ruby: null },
            { base: "行", ruby: "おこな" },
            { base: "う。", ruby: null },
          ],
          english: "Implement and then execute tests.",
        },
      },
      {
        tenseName: "可能形 (Potential)",
        tenseEnglish: "Can implement",
        conjugatedForm: "実装できる",
        furiganaReading: "じっそうできる",
        rubySegments: [
          { base: "実", ruby: "じっ" },
          { base: "装", ruby: "そう" },
          { base: "できる", ruby: null },
        ],
        formationRule: "する -> できる",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "今日", ruby: "きょう" },
            { base: "中", ruby: "じゅう" },
            { base: "に", ruby: null },
            { base: "実", ruby: "じっ" },
            { base: "装", ruby: "そう" },
            { base: "できる。", ruby: null },
          ],
          english: "I can implement it within today.",
        },
      },
      {
        tenseName: "受身形 (Passive)",
        tenseEnglish: "Is implemented",
        conjugatedForm: "実装される",
        furiganaReading: "じっそうされる",
        rubySegments: [
          { base: "実", ruby: "じっ" },
          { base: "装", ruby: "そう" },
          { base: "される", ruby: null },
        ],
        formationRule: "する -> される",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "次期", ruby: "じき" },
            { base: "バージョン", ruby: null },
            { base: "で", ruby: null },
            { base: "実", ruby: "じっ" },
            { base: "装", ruby: "そう" },
            { base: "される。", ruby: null },
          ],
          english: "It will be implemented in the next release.",
        },
      },
      {
        tenseName: "意向形 (Volitional)",
        tenseEnglish: "Let's implement",
        conjugatedForm: "実装しよう",
        furiganaReading: "じっそうしよう",
        rubySegments: [
          { base: "実", ruby: "じっ" },
          { base: "装", ruby: "そう" },
          { base: "しよう", ruby: null },
        ],
        formationRule: "する -> しよう",
        exampleSentence: {
          japaneseWithRuby: [
            { base: "早速", ruby: "さっそく" },
            { base: "実", ruby: "じっ" },
            { base: "装", ruby: "そう" },
            { base: "しよう！", ruby: null },
          ],
          english: "Let's implement it right away!",
        },
      },
    ],
  },
];

export const PARTICLES_ENCYCLOPEDIA: ParticleItem[] = [
  {
    id: "wa",
    particle: "は",
    jlpt_level: "N5",
    role: "Topic Marker (Contrast & Theme)",
    nuanceAndContrast:
      "Pronounced 'wa'. Establishes the broad topic of conversation ('As for X...'). Contrasts with が: は marks known/shared context, while が introduces new information or marks the grammatical subject.",
    examples: [
      {
        sentenceRuby: [
          { base: "私", ruby: "わたし" },
          { base: "は", ruby: null },
          { base: "エンジニア", ruby: null },
          { base: "です。", ruby: null },
        ],
        english: "As for me, I am an engineer.",
        focusExplanation: "は sets 'me' as the conversational topic.",
      },
      {
        sentenceRuby: [
          { base: "肉", ruby: "にく" },
          { base: "は", ruby: null },
          { base: "食", ruby: "た" },
          { base: "べますが、", ruby: null },
          { base: "魚", ruby: "さかな" },
          { base: "は", ruby: null },
          { base: "食", ruby: "た" },
          { base: "べません。", ruby: null },
        ],
        english: "I eat meat, but (in contrast) I don't eat fish.",
        focusExplanation: "は explicitly contrasts meat vs. fish.",
      },
    ],
  },
  {
    id: "ga",
    particle: "が",
    jlpt_level: "N5",
    role: "Subject Identifier & Uncontrollable State",
    nuanceAndContrast:
      "Identifies the specific grammatical subject of an action, state, or perception (e.g. 好き, わかる, できる). Emphasizes 'this one in particular' among choices.",
    examples: [
      {
        sentenceRuby: [
          { base: "雨", ruby: "あめ" },
          { base: "が", ruby: null },
          { base: "降", ruby: "ふ" },
          { base: "っている。", ruby: null },
        ],
        english: "Rain is falling.",
        focusExplanation: "Natural phenomenon / direct observation always uses が.",
      },
      {
        sentenceRuby: [
          { base: "日本語", ruby: "にほんご" },
          { base: "が", ruby: null },
          { base: "話", ruby: "はな" },
          { base: "せる。", ruby: null },
        ],
        english: "I can speak Japanese.",
        focusExplanation: "Potential verbs (話せる) take が for their target ability.",
      },
    ],
  },
  {
    id: "o",
    particle: "を",
    jlpt_level: "N5",
    role: "Direct Object Marker & Traversal",
    nuanceAndContrast:
      "Pronounced 'o'. Marks the direct accusative object of transitive verbs. Also marks the path or medium traversed (e.g. 道を歩く, 空を飛ぶ).",
    examples: [
      {
        sentenceRuby: [
          { base: "本", ruby: "ほん" },
          { base: "を", ruby: null },
          { base: "読", ruby: "よ" },
          { base: "む。", ruby: null },
        ],
        english: "I read a book.",
        focusExplanation: "本 is the direct object being read.",
      },
      {
        sentenceRuby: [
          { base: "公園", ruby: "こうえん" },
          { base: "を", ruby: null },
          { base: "散歩", ruby: "さんぽ" },
          { base: "する。", ruby: null },
        ],
        english: "I take a walk through the park.",
        focusExplanation: "公園を marks the area traversed while walking.",
      },
    ],
  },
  {
    id: "ni",
    particle: "に",
    jlpt_level: "N5",
    role: "Target Point, Specific Time & Indirect Object",
    nuanceAndContrast:
      "Pinpoints a specific destination, precise time, static location of existence (いる/ある), or recipient of an action. Contrasts with で: に is destination/point; で is scene of an active event.",
    examples: [
      {
        sentenceRuby: [
          { base: "東京", ruby: "とうきょう" },
          { base: "に", ruby: null },
          { base: "行", ruby: "い" },
          { base: "く。", ruby: null },
        ],
        english: "I am going to Tokyo.",
        focusExplanation: "東京に marks the arrival endpoint.",
      },
      {
        sentenceRuby: [
          { base: "友", ruby: "とも" },
          { base: "達", ruby: "だち" },
          { base: "に", ruby: null },
          { base: "メール", ruby: null },
          { base: "を", ruby: null },
          { base: "送", ruby: "おく" },
          { base: "る。", ruby: null },
        ],
        english: "I send an email to a friend.",
        focusExplanation: "友達に marks the recipient.",
      },
    ],
  },
  {
    id: "de",
    particle: "で",
    jlpt_level: "N5",
    role: "Location of Action, Means, Tool & Cause",
    nuanceAndContrast:
      "Marks where an dynamic activity takes place, or the tool/method used (電車で, ペンで). Contrasts with に: 学校で勉強する (action happening at school) vs 学校に行く (traveling toward school).",
    examples: [
      {
        sentenceRuby: [
          { base: "図書館", ruby: "としょかん" },
          { base: "で", ruby: null },
          { base: "勉強", ruby: "べんきょう" },
          { base: "する。", ruby: null },
        ],
        english: "I study at the library.",
        focusExplanation: "図書館で marks the scene of the dynamic studying action.",
      },
      {
        sentenceRuby: [
          { base: "箸", ruby: "はし" },
          { base: "で", ruby: null },
          { base: "食", ruby: "た" },
          { base: "べる。", ruby: null },
        ],
        english: "I eat using chopsticks.",
        focusExplanation: "箸で marks the tool/instrument utilized.",
      },
    ],
  },
  {
    id: "he",
    particle: "へ",
    jlpt_level: "N5",
    role: "Directional Heading",
    nuanceAndContrast:
      "Pronounced 'e'. Emphasizes direction of movement ('heading towards X') rather than the final destination point (which is に).",
    examples: [
      {
        sentenceRuby: [
          { base: "西", ruby: "にし" },
          { base: "へ", ruby: null },
          { base: "向", ruby: "む" },
          { base: "かう。", ruby: null },
        ],
        english: "Head toward the west.",
        focusExplanation: "へ focuses on the vector direction.",
      },
      {
        sentenceRuby: [
          { base: "未来", ruby: "みらい" },
          { base: "への", ruby: null },
          { base: "一歩", ruby: "いっぽ" },
        ],
        english: "A step towards the future.",
        focusExplanation: "への connects direction to a following noun.",
      },
    ],
  },
  {
    id: "to",
    particle: "と",
    jlpt_level: "N5",
    role: "Exhaustive Listing ('and'), Mutual Partner ('with') & Quotation",
    nuanceAndContrast:
      "Lists all items exhaustively (A and B). Also indicates doing an action together with a partner, or quotes speech/thought (〜と思う, 〜と言う).",
    examples: [
      {
        sentenceRuby: [
          { base: "同僚", ruby: "どうりょう" },
          { base: "と", ruby: null },
          { base: "相談", ruby: "そうだん" },
          { base: "する。", ruby: null },
        ],
        english: "I consult with a colleague.",
        focusExplanation: "同僚と indicates mutual cooperative action.",
      },
      {
        sentenceRuby: [
          { base: "可能", ruby: "かのう" },
          { base: "だと", ruby: null },
          { base: "思", ruby: "おも" },
          { base: "う。", ruby: null },
        ],
        english: "I think that it is possible.",
        focusExplanation: "と marks the content of thought.",
      },
    ],
  },
  {
    id: "kara_made",
    particle: "から / まで",
    jlpt_level: "N5",
    role: "Starting Point ('from') to Endpoint ('until')",
    nuanceAndContrast:
      "から marks temporal or spatial origins ('from'); まで marks bounds ('until'). Also から marks subjective reason ('because').",
    examples: [
      {
        sentenceRuby: [
          { base: "９時", ruby: "くじ" },
          { base: "から", ruby: null },
          { base: "５時", ruby: "ごじ" },
          { base: "まで", ruby: null },
          { base: "働", ruby: "はたら" },
          { base: "く。", ruby: null },
        ],
        english: "I work from 9 to 5.",
        focusExplanation: "Marks temporal boundary from start to finish.",
      },
      {
        sentenceRuby: [
          { base: "雨", ruby: "あめ" },
          { base: "だから", ruby: null },
          { base: "傘", ruby: "かさ" },
          { base: "を", ruby: null },
          { base: "持", ruby: "も" },
          { base: "っていく。", ruby: null },
        ],
        english: "Because it's raining, I'll take an umbrella.",
        focusExplanation: "から indicates causal reason.",
      },
    ],
  },
  {
    id: "yori",
    particle: "より",
    jlpt_level: "N4",
    role: "Comparative Benchmark ('more than')",
    nuanceAndContrast:
      "Introduces the reference point of comparison (A は B より 大きい = A is bigger than B). In formal/written Japanese, can also mean 'starting from'.",
    examples: [
      {
        sentenceRuby: [
          { base: "計画", ruby: "けいかく" },
          { base: "より", ruby: null },
          { base: "早", ruby: "はや" },
          { base: "く", ruby: null },
          { base: "終", ruby: "お" },
          { base: "わった。", ruby: null },
        ],
        english: "It finished earlier than planned.",
        focusExplanation: "計画より sets the comparison benchmark.",
      },
      {
        sentenceRuby: [
          { base: "何", ruby: "なに" },
          { base: "より", ruby: null },
          { base: "健康", ruby: "けんこう" },
          { base: "が", ruby: null },
          { base: "大切", ruby: "たいせつ" },
          { base: "だ。", ruby: null },
        ],
        english: "Health is more important than anything.",
        focusExplanation: "何より means 'above all else'.",
      },
    ],
  },
  {
    id: "noni",
    particle: "のに",
    jlpt_level: "N3",
    role: "Contrary to Expectation ('even though / despite')",
    nuanceAndContrast:
      "Expresses frustration, surprise, or contradiction: X happened even though Y was expected. Contrasts with けど / が: のに carries strong emotion and cannot be followed by a command or suggestion.",
    examples: [
      {
        sentenceRuby: [
          { base: "一生懸命", ruby: "いっしょうけんめい" },
          { base: "勉強", ruby: "べんきょう" },
          { base: "したのに、", ruby: null },
          { base: "不合格", ruby: "ふごうかく" },
          { base: "だった。", ruby: null },
        ],
        english: "Even though I studied with all my might, I didn't pass.",
        focusExplanation: "Emphasizes frustration against expectations.",
      },
      {
        sentenceRuby: [
          { base: "薬", ruby: "くすり" },
          { base: "を", ruby: null },
          { base: "飲", ruby: "の" },
          { base: "んだのに、", ruby: null },
          { base: "熱", ruby: "ねつ" },
          { base: "が", ruby: null },
          { base: "下", ruby: "さ" },
          { base: "がらない。", ruby: null },
        ],
        english: "Despite taking medicine, the fever won't go down.",
        focusExplanation: "Unexpected contrary medical result.",
      },
    ],
  },
  {
    id: "nagara",
    particle: "ながら",
    jlpt_level: "N4",
    role: "Simultaneous Action ('while doing')",
    nuanceAndContrast:
      "Attached to verb masu-stem (Verb stem + ながら). The action after ながら is the primary action, while the action before ながら is secondary.",
    examples: [
      {
        sentenceRuby: [
          { base: "音楽", ruby: "おんがく" },
          { base: "を", ruby: null },
          { base: "聞", ruby: "き" },
          { base: "きながら", ruby: null },
          { base: "作業", ruby: "さぎょう" },
          { base: "する。", ruby: null },
        ],
        english: "I work while listening to music.",
        focusExplanation: "作業 (work) is the main focus, music is secondary.",
      },
      {
        sentenceRuby: [
          { base: "歩", ruby: "ある" },
          { base: "きながら", ruby: null },
          { base: "スマホ", ruby: null },
          { base: "を", ruby: null },
          { base: "見", ruby: "み" },
          { base: "てはいけない。", ruby: null },
        ],
        english: "You must not look at your phone while walking.",
        focusExplanation: "Prohibition on dual simultaneous behavior.",
      },
    ],
  },
  {
    id: "bakari",
    particle: "ばかり",
    jlpt_level: "N3",
    role: "Exclusivity ('nothing but') & Just completed (〜たばかり)",
    nuanceAndContrast:
      "Noun + ばかり means 'only / nothing but' (often with negative undertone). Verb-た + ばかり means 'just finished doing moment ago'.",
    examples: [
      {
        sentenceRuby: [
          { base: "遊", ruby: "あそ" },
          { base: "んでばかり", ruby: null },
          { base: "いる。", ruby: null },
        ],
        english: "He does nothing but play around.",
        focusExplanation: "Expresses critical sentiment about exclusivity.",
      },
      {
        sentenceRuby: [
          { base: "日本", ruby: "にほん" },
          { base: "に", ruby: null },
          { base: "来", ruby: "き" },
          { base: "たばかりです。", ruby: null },
        ],
        english: "I just recently arrived in Japan.",
        focusExplanation: "〜たばかり indicates immediate recency.",
      },
    ],
  },
  {
    id: "koso",
    particle: "こそ",
    jlpt_level: "N2",
    role: "Emphatic Focus ('precisely', 'the very')",
    nuanceAndContrast:
      "Strongly emphasizes the preceding noun or clause. Often used in formal gratitude (こちらこそ) or strong determination (今年こそ).",
    examples: [
      {
        sentenceRuby: [
          { base: "今年", ruby: "ことし" },
          { base: "こそ", ruby: null },
          { base: "N2", ruby: null },
          { base: "に", ruby: null },
          { base: "合格", ruby: "ごうかく" },
          { base: "する！", ruby: null },
        ],
        english: "This year for sure, I will pass N2!",
        focusExplanation: "こそ expresses resolute resolve.",
      },
      {
        sentenceRuby: [
          { base: "こちら", ruby: null },
          { base: "こそ", ruby: null },
          { base: "よろしく", ruby: null },
          { base: "お", ruby: null },
          { base: "願", ruby: "ねが" },
          { base: "いします。", ruby: null },
        ],
        english: "It is I who should be asking for your favor.",
        focusExplanation: "Polite reciprocity emphasis.",
      },
    ],
  },
];

export const GRAMMAR_QUIZ_QUESTIONS: GrammarQuestion[] = [
  {
    id: 1,
    sentencePre: "毎日 ７時",
    sentencePost: " 起きて、朝ご飯を食べます。",
    targetCategory: "particle",
    jlpt_level: "N5",
    correctAnswer: "に",
    options: [
      { text: "に", explanation: "Correct! Specific clock times (７時) take the target particle に." },
      { text: "で", explanation: "Incorrect. で marks location of action or tool, not specific clock time." },
      { text: "を", explanation: "Incorrect. を marks direct objects of transitive verbs." },
      { text: "へ", explanation: "Incorrect. へ indicates direction of movement." },
    ],
    sentenceTranslation: "I wake up at 7:00 every day and eat breakfast.",
    fullSentenceRuby: [
      { base: "毎日", ruby: "まいにち" },
      { base: "７時", ruby: "しちじ" },
      { base: "に", ruby: null },
      { base: "起", ruby: "お" },
      { base: "きて、", ruby: null },
      { base: "朝", ruby: "あさ" },
      { base: "ご飯", ruby: "はん" },
      { base: "を", ruby: null },
      { base: "食", ruby: "た" },
      { base: "べます。", ruby: null },
    ],
    ruleSummary: "Specific numerical clock times require に (e.g., ７時に, 月曜日に).",
  },
  {
    id: 2,
    sentencePre: "図書館",
    sentencePost: " 本を借りて、静かに勉強した。",
    targetCategory: "particle",
    jlpt_level: "N5",
    correctAnswer: "で",
    options: [
      { text: "で", explanation: "Correct! で marks the physical location where active events take place." },
      { text: "に", explanation: "Incorrect. に with dynamic actions would signify destination, not the scene of action." },
      { text: "へ", explanation: "Incorrect. へ denotes directional heading." },
      { text: "を", explanation: "Incorrect. 図書館 is the setting, not the direct object." },
    ],
    sentenceTranslation: "I borrowed books at the library and studied quietly.",
    fullSentenceRuby: [
      { base: "図書館", ruby: "としょかん" },
      { base: "で", ruby: null },
      { base: "本", ruby: "ほん" },
      { base: "を", ruby: null },
      { base: "借", ruby: "か" },
      { base: "りて、", ruby: null },
      { base: "静", ruby: "しず" },
      { base: "かに", ruby: null },
      { base: "勉強", ruby: "べんきょう" },
      { base: "した。", ruby: null },
    ],
    ruleSummary: "Dynamic actions happening within a space use で (場所 + で + 動作).",
  },
  {
    id: 3,
    sentencePre: "昨日 新しいパソコンを",
    sentencePost: " が、とても使いやすい。",
    targetCategory: "conjugation",
    jlpt_level: "N4",
    correctAnswer: "買った",
    options: [
      { text: "買った", explanation: "Correct! '昨日' (yesterday) mandates the plain past tense 買った (買う -> 買った)." },
      { text: "買いて", explanation: "Incorrect. 買う has a small-tsu shift (促音便): 買って / 買った, not 買いて." },
      { text: "買います", explanation: "Incorrect. Non-past polite does not match yesterday's completed past event." },
      { text: "買わない", explanation: "Incorrect. Negative does not match the affirmative continuation '使いやすい'." },
    ],
    sentenceTranslation: "I bought a new computer yesterday, and it is very easy to use.",
    fullSentenceRuby: [
      { base: "昨日", ruby: "きのう" },
      { base: "新", ruby: "あたら" },
      { base: "しいパソコンを", ruby: null },
      { base: "買", ruby: "か" },
      { base: "ったが、とても", ruby: null },
      { base: "使", ruby: "つか" },
      { base: "いやすい。", ruby: null },
    ],
    ruleSummary: "U-ending Godan verbs conjugate to った in plain past (買う -> 買った).",
  },
  {
    id: 4,
    sentencePre: "田中さん",
    sentencePost: " 相談しながら、新しいシステムを開発した。",
    targetCategory: "particle",
    jlpt_level: "N4",
    correctAnswer: "と",
    options: [
      { text: "と", explanation: "Correct! 相談する (to consult) requires と to indicate the mutual dialogue partner." },
      { text: "に", explanation: "Incorrect. While に can mark a recipient, 相談しながら naturally pairs with と for mutual collaboration." },
      { text: "で", explanation: "Incorrect. 田中さん is a person, not a tool or location." },
      { text: "を", explanation: "Incorrect. The person consulted with is not the direct object." },
    ],
    sentenceTranslation: "While consulting with Tanaka-san, we developed a new system.",
    fullSentenceRuby: [
      { base: "田中", ruby: "たなか" },
      { base: "さんと", ruby: null },
      { base: "相談", ruby: "そうだん" },
      { base: "しながら、", ruby: null },
      { base: "新", ruby: "あたら" },
      { base: "しいシステムを", ruby: null },
      { base: "開発", ruby: "かいはつ" },
      { base: "した。", ruby: null },
    ],
    ruleSummary: "Collaborative and discussion verbs pair with と (〜と相談する, 〜と話し合う).",
  },
  {
    id: 5,
    sentencePre: "毎日遅くまで残業して準備した",
    sentencePost: "、プレゼンが延期になった。",
    targetCategory: "particle",
    jlpt_level: "N3",
    correctAnswer: "のに",
    options: [
      { text: "のに", explanation: "Correct! のに expresses deep disappointment contrary to expectations ('even though I worked late...')." },
      { text: "ので", explanation: "Incorrect. ので expresses objective cause and effect, which contradicts the postponement outcome." },
      { text: "ながら", explanation: "Incorrect. ながら requires verb stem and implies simultaneous action, not contrast." },
      { text: "から", explanation: "Incorrect. から is 'because', which does not make sense here." },
    ],
    sentenceTranslation: "Even though I worked overtime until late every day preparing, the presentation was postponed.",
    fullSentenceRuby: [
      { base: "毎日", ruby: "まいにち" },
      { base: "遅", ruby: "おそ" },
      { base: "くまで", ruby: null },
      { base: "残業", ruby: "ざんぎょう" },
      { base: "して", ruby: null },
      { base: "準備", ruby: "じゅんび" },
      { base: "したのに、プレゼンが", ruby: null },
      { base: "延期", ruby: "えんき" },
      { base: "になった。", ruby: null },
    ],
    ruleSummary: "Clause (plain) + のに indicates strong contrary outcome with emotional nuance.",
  },
  {
    id: 6,
    sentencePre: "今期のサーバーログを詳しく",
    sentencePost: "、セキュリティの脆弱性が発見された。",
    targetCategory: "conjugation",
    jlpt_level: "N3",
    correctAnswer: "調べたところ",
    options: [
      { text: "調べたところ", explanation: "Correct! Verb-た + ところ means 'upon doing X, discovered Y result'." },
      { text: "調べるうちに", explanation: "Incorrect. うちに implies a gradual change over time while an action is ongoing." },
      { text: "調べながら", explanation: "Incorrect. ながら implies simultaneous conscious action by the same grammatical subject." },
      { text: "調べてばかり", explanation: "Incorrect. ばかり implies doing nothing but investigating." },
    ],
    sentenceTranslation: "Upon investigating the server logs in detail, a security vulnerability was discovered.",
    fullSentenceRuby: [
      { base: "今期", ruby: "こんき" },
      { base: "のサーバーログを", ruby: null },
      { base: "詳", ruby: "くわ" },
      { base: "しく", ruby: null },
      { base: "調", ruby: "しら" },
      { base: "べたところ、セキュリティの", ruby: null },
      { base: "脆弱性", ruby: "ぜいじゃくせい" },
      { base: "が", ruby: null },
      { base: "発見", ruby: "はっけん" },
      { base: "された。", ruby: null },
    ],
    ruleSummary: "Verb-た + ところ expresses the unexpected or consequential result found upon an action.",
  },
  {
    id: 7,
    sentencePre: "この大規模なデータベースをクラウドに",
    sentencePost: " には、少なくとも数日かかる。",
    targetCategory: "conjugation",
    jlpt_level: "N2",
    correctAnswer: "移行する",
    options: [
      { text: "移行する", explanation: "Correct! Verb dictionary form + には expresses purpose/condition: 'In order to migrate...'." },
      { text: "移行した", explanation: "Incorrect. Past tense cannot be followed by 〜には for required conditions." },
      { text: "移行して", explanation: "Incorrect. Te-form cannot connect to nominalizing には." },
      { text: "移行できる", explanation: "Incorrect. While potential, '移行するには' is the idiomatic target construct." },
    ],
    sentenceTranslation: "In order to migrate this large-scale database to the cloud, it will take at least several days.",
    fullSentenceRuby: [
      { base: "この", ruby: null },
      { base: "大規模", ruby: "だいきぼ" },
      { base: "なデータベースをクラウドに", ruby: null },
      { base: "移行", ruby: "いこう" },
      { base: "するには、", ruby: null },
      { base: "少", ruby: "すく" },
      { base: "なくとも", ruby: null },
      { base: "数日", ruby: "すうじつ" },
      { base: "かかる。", ruby: null },
    ],
    ruleSummary: "Verb (dictionary form) + には means 'in order to / for the purpose of'.",
  },
  {
    id: 8,
    sentencePre: "先輩エンジニアのアドバイス",
    sentencePost: " 、この難解なバグの原因を特定できた。",
    targetCategory: "particle",
    jlpt_level: "N2",
    correctAnswer: "のおかげで",
    options: [
      { text: "のおかげで", explanation: "Correct! Noun + のおかげで expresses gratitude for a positive causal factor ('thanks to...')." },
      { text: "のせいで", explanation: "Incorrect. のせいで expresses blame for a negative result." },
      { text: "にかぎって", explanation: "Incorrect. にかぎって implies an unfortunate coincidence or special limitation." },
      { text: "のもとで", explanation: "Incorrect. のもとで means 'under the guidance of', but causation fits better with おかげで." },
    ],
    sentenceTranslation: "Thanks to the senior engineer's advice, I was able to identify the cause of this perplexing bug.",
    fullSentenceRuby: [
      { base: "先輩", ruby: "せんぱい" },
      { base: "エンジニアのアドバイスのおかげで、この", ruby: null },
      { base: "難解", ruby: "なんかい" },
      { base: "なバグの", ruby: null },
      { base: "原因", ruby: "げんいん" },
      { base: "を", ruby: null },
      { base: "特定", ruby: "とくてい" },
      { base: "できた。", ruby: null },
    ],
    ruleSummary: "Noun + のおかげで = 'thanks to (positive attribution)'.",
  },
  {
    id: 9,
    sentencePre: "失敗を恐れずに挑戦して",
    sentencePost: "、真のイノベーションが生まれる。",
    targetCategory: "particle",
    jlpt_level: "N1",
    correctAnswer: "こそ",
    options: [
      { text: "こそ", explanation: "Correct! 〜てこそ means 'only after doing X / it is precisely through X that Y is possible'." },
      { text: "さえ", explanation: "Incorrect. さえ means 'even', which doesn't fit the conditional focus." },
      { text: "ばかり", explanation: "Incorrect. ばかり means 'nothing but'." },
      { text: "など", explanation: "Incorrect. など belittles or exemplifies." },
    ],
    sentenceTranslation: "It is precisely through challenging oneself without fear of failure that true innovation is born.",
    fullSentenceRuby: [
      { base: "失敗", ruby: "しっぱい" },
      { base: "を", ruby: null },
      { base: "恐", ruby: "おそ" },
      { base: "れずに", ruby: null },
      { base: "挑戦", ruby: "ちょうせん" },
      { base: "してこそ、", ruby: null },
      { base: "真", ruby: "しん" },
      { base: "のイノベーションが", ruby: null },
      { base: "生", ruby: "う" },
      { base: "まれる。", ruby: null },
    ],
    ruleSummary: "Verb-て + こそ = 'only through doing / it is precisely because...'.",
  },
  {
    id: 10,
    sentencePre: "契約書の条項を",
    sentencePost: " 上で、正式に合意のサインを取り交わした。",
    targetCategory: "conjugation",
    jlpt_level: "N1",
    correctAnswer: "精査した",
    options: [
      { text: "精査した", explanation: "Correct! Verb-た + 上で means 'after carefully completing X, then doing Y as a prerequisite'." },
      { text: "精査する", explanation: "Incorrect. '精査する上で' means 'in the process of scrutinizing', not prerequisite completion." },
      { text: "精査して", explanation: "Incorrect. Te-form cannot directly precede 上で." },
      { text: "精査しない", explanation: "Incorrect. Negative contradicts the successful signing." },
    ],
    sentenceTranslation: "After closely scrutinizing the terms of the contract, we formally signed the agreement.",
    fullSentenceRuby: [
      { base: "契約書", ruby: "けいやくしょ" },
      { base: "の", ruby: null },
      { base: "条項", ruby: "じょうこう" },
      { base: "を", ruby: null },
      { base: "精査", ruby: "せいさ" },
      { base: "した", ruby: null },
      { base: "上", ruby: "うえ" },
      { base: "で、", ruby: null },
      { base: "正式", ruby: "せいしき" },
      { base: "に", ruby: null },
      { base: "合意", ruby: "ごうい" },
      { base: "のサインを", ruby: null },
      { base: "取", ruby: "と" },
      { base: "り", ruby: null },
      { base: "交", ruby: "か" },
      { base: "わした。", ruby: null },
    ],
    ruleSummary: "Verb-た + 上で = 'after doing X as a required prerequisite step'.",
  },
];
