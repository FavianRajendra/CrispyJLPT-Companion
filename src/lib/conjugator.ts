import type { Verb } from "./db";

export interface DynamicConjugationRow {
  tense: string;
  register: "Plain" | "Polite";
  kanjiForm: string;
  furiganaForm: string;
  ruleNote: string;
}

const GODAN_A_ROW: Record<string, string> = {
  う: "わ", く: "か", ぐ: "が", す: "さ", つ: "た", ぬ: "な", ぶ: "ば", む: "ま", る: "ら",
};

const GODAN_I_ROW: Record<string, string> = {
  う: "い", く: "き", ぐ: "ぎ", す: "し", つ: "ち", ぬ: "に", ぶ: "び", む: "み", る: "り",
};

const GODAN_E_ROW: Record<string, string> = {
  う: "え", く: "け", ぐ: "げ", す: "せ", つ: "て", ぬ: "ね", ぶ: "べ", む: "め", る: "れ",
};

const GODAN_O_ROW: Record<string, string> = {
  う: "おう", く: "こう", ぐ: "ごう", す: "そう", つ: "とう", ぬ: "のう", ぶ: "ぼう", む: "もう", る: "ろう",
};

function godanTaTe(stemK: string, stemF: string, ending: string, isIku: boolean): {
  taK: string; taF: string; teK: string; teF: string;
} {
  if (isIku) {
    return { taK: `${stemK}った`, taF: `${stemF}った`, teK: `${stemK}って`, teF: `${stemF}って` };
  }
  switch (ending) {
    case "う":
    case "つ":
    case "る":
      return { taK: `${stemK}った`, taF: `${stemF}った`, teK: `${stemK}って`, teF: `${stemF}って` };
    case "む":
    case "ぶ":
    case "ぬ":
      return { taK: `${stemK}んだ`, taF: `${stemF}んだ`, teK: `${stemK}んで`, teF: `${stemF}んで` };
    case "く":
      return { taK: `${stemK}いた`, taF: `${stemF}いた`, teK: `${stemK}いて`, teF: `${stemF}いて` };
    case "ぐ":
      return { taK: `${stemK}いだ`, taF: `${stemF}いだ`, teK: `${stemK}いで`, teF: `${stemF}いで` };
    case "す":
      return { taK: `${stemK}した`, taF: `${stemF}した`, teK: `${stemK}して`, teF: `${stemF}して` };
    default:
      return { taK: `${stemK}た`, taF: `${stemF}た`, teK: `${stemK}て`, teF: `${stemF}て` };
  }
}

export function conjugateVerb(verb: Verb): DynamicConjugationRow[] {
  const k = verb.kanji_form;
  const f = verb.furigana_reading;

  // 1. Irregular Verbs (する / 〜する / 来る / くる)
  if (verb.verb_group === "Irregular" || k.endsWith("する") || k === "来る" || k === "くる") {
    if (k.endsWith("する")) {
      const baseK = k.slice(0, -2);
      const baseF = f.slice(0, -2);
      return [
        { tense: "Non-Past (Present / Future)", register: "Plain", kanjiForm: `${baseK}する`, furiganaForm: `${baseF}する`, ruleNote: "Dictionary form" },
        { tense: "Past (タ形)", register: "Plain", kanjiForm: `${baseK}した`, furiganaForm: `${baseF}した`, ruleNote: "する → した" },
        { tense: "Negative (ナイ形)", register: "Plain", kanjiForm: `${baseK}しない`, furiganaForm: `${baseF}しない`, ruleNote: "する → しない" },
        { tense: "Past-Negative (ナカッタ形)", register: "Plain", kanjiForm: `${baseK}しなかった`, furiganaForm: `${baseF}しなかった`, ruleNote: "する → しなかった" },
        { tense: "Polite Non-Past (マス形)", register: "Polite", kanjiForm: `${baseK}します`, furiganaForm: `${baseF}します`, ruleNote: "する → します" },
        { tense: "Polite Past (マシタ形)", register: "Polite", kanjiForm: `${baseK}しました`, furiganaForm: `${baseF}しました`, ruleNote: "する → しました" },
        { tense: "Te-Form (テ形)", register: "Plain", kanjiForm: `${baseK}して`, furiganaForm: `${baseF}して`, ruleNote: "する → して" },
        { tense: "Potential (可能形)", register: "Plain", kanjiForm: `${baseK}できる`, furiganaForm: `${baseF}できる`, ruleNote: "する → できる" },
        { tense: "Passive (受身形)", register: "Plain", kanjiForm: `${baseK}される`, furiganaForm: `${baseF}される`, ruleNote: "する → される" },
        { tense: "Volitional (意向形)", register: "Plain", kanjiForm: `${baseK}しよう`, furiganaForm: `${baseF}しよう`, ruleNote: "する → しよう" },
      ];
    }

    // 来る (くる)
    const baseK = k.slice(0, -1);
    const baseF = f.slice(0, -2);
    return [
      { tense: "Non-Past (Present / Future)", register: "Plain", kanjiForm: `${baseK}る`, furiganaForm: `${baseF}くる`, ruleNote: "Dictionary form" },
      { tense: "Past (タ形)", register: "Plain", kanjiForm: `${baseK}た`, furiganaForm: `${baseF}きた`, ruleNote: "くる → きた" },
      { tense: "Negative (ナイ形)", register: "Plain", kanjiForm: `${baseK}ない`, furiganaForm: `${baseF}こない`, ruleNote: "くる → こない" },
      { tense: "Past-Negative (ナカッタ形)", register: "Plain", kanjiForm: `${baseK}なかった`, furiganaForm: `${baseF}こなかった`, ruleNote: "くる → こなかった" },
      { tense: "Polite Non-Past (マス形)", register: "Polite", kanjiForm: `${baseK}ます`, furiganaForm: `${baseF}きます`, ruleNote: "くる → きます" },
      { tense: "Polite Past (マシタ形)", register: "Polite", kanjiForm: `${baseK}ました`, furiganaForm: `${baseF}きました`, ruleNote: "くる → きました" },
      { tense: "Te-Form (テ形)", register: "Plain", kanjiForm: `${baseK}て`, furiganaForm: `${baseF}きて`, ruleNote: "くる → きて" },
      { tense: "Potential (可能形)", register: "Plain", kanjiForm: `${baseK}られる`, furiganaForm: `${baseF}こられる`, ruleNote: "くる → こられる" },
      { tense: "Passive (受身形)", register: "Plain", kanjiForm: `${baseK}られる`, furiganaForm: `${baseF}こられる`, ruleNote: "くる → こられる" },
      { tense: "Volitional (意向形)", register: "Plain", kanjiForm: `${baseK}よう`, furiganaForm: `${baseF}こよう`, ruleNote: "くる → こよう" },
    ];
  }

  // 2. Ichidan Verbs (Drop final る)
  if (verb.verb_group === "Ichidan") {
    const stemK = k.slice(0, -1);
    const stemF = f.slice(0, -1);
    return [
      { tense: "Non-Past (Present / Future)", register: "Plain", kanjiForm: k, furiganaForm: f, ruleNote: "Stem + る" },
      { tense: "Past (タ形)", register: "Plain", kanjiForm: `${stemK}た`, furiganaForm: `${stemF}た`, ruleNote: "Stem + た" },
      { tense: "Negative (ナイ形)", register: "Plain", kanjiForm: `${stemK}ない`, furiganaForm: `${stemF}ない`, ruleNote: "Stem + ない" },
      { tense: "Past-Negative (ナカッタ形)", register: "Plain", kanjiForm: `${stemK}なかった`, furiganaForm: `${stemF}なかった`, ruleNote: "Stem + なかった" },
      { tense: "Polite Non-Past (マス形)", register: "Polite", kanjiForm: `${stemK}ます`, furiganaForm: `${stemF}ます`, ruleNote: "Stem + ます" },
      { tense: "Polite Past (マシタ形)", register: "Polite", kanjiForm: `${stemK}ました`, furiganaForm: `${stemF}ました`, ruleNote: "Stem + ました" },
      { tense: "Te-Form (テ形)", register: "Plain", kanjiForm: `${stemK}て`, furiganaForm: `${stemF}て`, ruleNote: "Stem + て" },
      { tense: "Potential (可能形)", register: "Plain", kanjiForm: `${stemK}られる`, furiganaForm: `${stemF}られる`, ruleNote: "Stem + られる" },
      { tense: "Passive (受身形)", register: "Plain", kanjiForm: `${stemK}られる`, furiganaForm: `${stemF}られる`, ruleNote: "Stem + られる" },
      { tense: "Volitional (意向形)", register: "Plain", kanjiForm: `${stemK}よう`, furiganaForm: `${stemF}よう`, ruleNote: "Stem + よう" },
    ];
  }

  // 3. Godan Verbs (Inflect final kana across a/i/u/e/o rows)
  const ending = f.slice(-1);
  const stemK = k.slice(0, -1);
  const stemF = f.slice(0, -1);
  const aKana = GODAN_A_ROW[ending] || ending;
  const iKana = GODAN_I_ROW[ending] || ending;
  const eKana = GODAN_E_ROW[ending] || ending;
  const oKana = GODAN_O_ROW[ending] || ending;
  const isIku = f === "いく" || f.endsWith("いく") && k.endsWith("行く");
  const { taK, taF, teK, teF } = godanTaTe(stemK, stemF, ending, isIku);

  return [
    { tense: "Non-Past (Present / Future)", register: "Plain", kanjiForm: k, furiganaForm: f, ruleNote: `Dictionary (${ending}-ending)` },
    { tense: "Past (タ形)", register: "Plain", kanjiForm: taK, furiganaForm: taF, ruleNote: isIku ? "行く → 行った (Exception)" : `${ending} → ${taF.slice(stemF.length)}` },
    { tense: "Negative (ナイ形)", register: "Plain", kanjiForm: `${stemK}${aKana}ない`, furiganaForm: `${stemF}${aKana}ない`, ruleNote: `${ending} → ${aKana}ない` },
    { tense: "Past-Negative (ナカッタ形)", register: "Plain", kanjiForm: `${stemK}${aKana}なかった`, furiganaForm: `${stemF}${aKana}なかった`, ruleNote: `${ending} → ${aKana}なかった` },
    { tense: "Polite Non-Past (マス形)", register: "Polite", kanjiForm: `${stemK}${iKana}ます`, furiganaForm: `${stemF}${iKana}ます`, ruleNote: `${ending} → ${iKana}ます` },
    { tense: "Polite Past (マシタ形)", register: "Polite", kanjiForm: `${stemK}${iKana}ました`, furiganaForm: `${stemF}${iKana}ました`, ruleNote: `${ending} → ${iKana}ました` },
    { tense: "Te-Form (テ形)", register: "Plain", kanjiForm: teK, furiganaForm: teF, ruleNote: isIku ? "行く → 行って (Exception)" : `${ending} → ${teF.slice(stemF.length)}` },
    { tense: "Potential (可能形)", register: "Plain", kanjiForm: `${stemK}${eKana}る`, furiganaForm: `${stemF}${eKana}る`, ruleNote: `${ending} → ${eKana}る` },
    { tense: "Passive (受身形)", register: "Plain", kanjiForm: `${stemK}${aKana}れる`, furiganaForm: `${stemF}${aKana}れる`, ruleNote: `${ending} → ${aKana}れる` },
    { tense: "Volitional (意向形)", register: "Plain", kanjiForm: `${stemK}${oKana}`, furiganaForm: `${stemF}${oKana}`, ruleNote: `${ending} → ${oKana}` },
  ];
}