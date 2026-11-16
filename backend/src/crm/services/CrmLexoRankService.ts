/**
 * CRM V2: LexoRank Fractional Indexing Engine
 * Generates O(1) fractional string ranks between arbitrary cards,
 * preventing expensive mass reordering of rows when moving cards in Kanban.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length;
const DEFAULT_MIDDLE = '0|hzzzzz:';
const DEFAULT_BUCKET = '0|';

export class CrmLexoRankService {
  /**
   * Return initial rank for index i
   */
  public static initial(index: number = 0): string {
    const step = 1000;
    const val = 100000 + index * step;
    return `${DEFAULT_BUCKET}${this.numberToString(val, 6)}:`;
  }

  /**
   * Generates a rank strictly between prevRank and nextRank.
   * If prev is null/empty, generates rank before next.
   * If next is null/empty, generates rank after prev.
   * If both are null/empty, returns middle default.
   */
  public static between(prevRank?: string | null, nextRank?: string | null): string {
    const prevClean = prevRank ? this.cleanRank(prevRank) : '';
    const nextClean = nextRank ? this.cleanRank(nextRank) : '';

    if (!prevClean && !nextClean) {
      return DEFAULT_MIDDLE;
    }

    if (!prevClean && nextClean) {
      return `${DEFAULT_BUCKET}${this.rankBefore(nextClean)}:`;
    }

    if (prevClean && !nextClean) {
      return `${DEFAULT_BUCKET}${this.rankAfter(prevClean)}:`;
    }

    // Both prev and next exist
    if (prevClean >= nextClean) {
      // Out of order or identical: append midpoint suffix
      return `${DEFAULT_BUCKET}${prevClean}m:`;
    }

    const mid = this.findMidpoint(prevClean, nextClean);
    return `${DEFAULT_BUCKET}${mid}:`;
  }

  /**
   * Generates ranks for rebalancing a column of N cards
   */
  public static rebalance(count: number): string[] {
    const ranks: string[] = [];
    const step = Math.floor(1000000 / (count + 1));
    for (let i = 1; i <= count; i++) {
      ranks.push(`${DEFAULT_BUCKET}${this.numberToString(i * step, 6)}:`);
    }
    return ranks;
  }

  private static cleanRank(rank: string): string {
    // Strip bucket prefix and trailing colon (e.g. "0|hzzzzz:" -> "hzzzzz")
    let s = rank.trim();
    if (s.includes('|')) {
      s = s.split('|')[1];
    }
    if (s.endsWith(':')) {
      s = s.slice(0, -1);
    }
    return s;
  }

  private static rankBefore(str: string): string {
    let i = 0;
    while (i < str.length && str[i] === ALPHABET[0]) {
      i++;
    }
    if (i === str.length) {
      return ALPHABET[0] + 'm';
    }
    const charIdx = ALPHABET.indexOf(str[i]);
    const lowerChar = ALPHABET[Math.floor(charIdx / 2)];
    return str.slice(0, i) + lowerChar + str.slice(i + 1);
  }

  private static rankAfter(str: string): string {
    const lastChar = str[str.length - 1];
    const idx = ALPHABET.indexOf(lastChar);
    if (idx < BASE - 1) {
      return str.slice(0, -1) + ALPHABET[idx + 1];
    }
    return str + 'm';
  }

  private static findMidpoint(prev: string, next: string): string {
    let p = prev;
    let n = next;
    // Pad to same length if needed
    const maxLen = Math.max(p.length, n.length);
    while (p.length < maxLen) p += '0';
    while (n.length < maxLen) n += '0';

    let result = '';
    let foundDiff = false;

    for (let i = 0; i < maxLen; i++) {
      const pIdx = ALPHABET.indexOf(p[i]);
      const nIdx = ALPHABET.indexOf(n[i]);

      if (pIdx === nIdx && !foundDiff) {
        result += p[i];
      } else {
        foundDiff = true;
        if (nIdx - pIdx > 1) {
          const midIdx = Math.floor((pIdx + nIdx) / 2);
          result += ALPHABET[midIdx];
          return result;
        } else {
          result += p[i];
          // Append midpoint between remaining
          const nextP = i + 1 < p.length ? ALPHABET.indexOf(p[i + 1]) : 0;
          const midNext = Math.floor((nextP + BASE) / 2);
          result += ALPHABET[midNext];
          return result;
        }
      }
    }

    return result + 'm';
  }

  private static numberToString(val: number, minLength: number): string {
    let res = '';
    let n = Math.abs(val);
    while (n > 0) {
      res = ALPHABET[n % BASE] + res;
      n = Math.floor(n / BASE);
    }
    while (res.length < minLength) {
      res = '0' + res;
    }
    return res;
  }
}

