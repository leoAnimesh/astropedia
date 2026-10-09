/**
 * Banglish (Latin-script Bengali) forms of the template sentences and their
 * slot values, written by hand (./roman.ts matches a Bengali-script answer back
 * to these). Pairs are [Bengali sentence as in the tables, Banglish]. Style:
 * everyday Banglish as people type it ("apnar jonno", "sobcheye bhalo somoy",
 * "bishesh kore … nagad"), planet names in their Bengali form (Shoni,
 * Brihoshpoti, Shukro), months in English, Latin digits. A "-er" after a word
 * ("{P}-er porbe") is joined by roman.ts ("Shonir porbe", "Mongoler porbe").
 */
import { BN_ITEMS } from './roman-bn-items';

export const ROMAN_BN: readonly (readonly [string, string])[] = BN_ITEMS;
