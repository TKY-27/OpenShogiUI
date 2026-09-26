/**
 * Japanese move notation for PVs and kifu lines, built with tsshogi from each
 * move's preceding position (同, 打, 成/不成 included). Raw USI stays the
 * fallback for the kifu tab list only when a replay cannot be built at all.
 */
const cache = new Map<string, string[]>();

export async function pvJapanese(
  sfen: string,
  pv: string[],
): Promise<string[]> {
  const key = `${sfen}|${pv.join(" ")}`;
  const memo = cache.get(key);
  if (memo) return memo;
  const tsshogi = await import("tsshogi");
  let result: string[];
  try {
    const record = tsshogi.Record.newByUSI(
      `position sfen ${sfen} moves ${pv.join(" ")}`,
    );
    if (record instanceof tsshogi.Record) {
      result = [];
      let node = record.first.next;
      while (node !== null) {
        if (!(node.move instanceof tsshogi.Move)) break;
        // displayText already carries the side mark (☗/☖ or ▲/△), 同,
        // 打 and 成/不成 for the position it is played from.
        result.push(node.displayText);
        node = node.next;
      }
    } else {
      result = [];
    }
  } catch {
    result = [];
  }
  if (result.length === 0) result = [...pv];
  if (cache.size > 512) cache.clear();
  cache.set(key, result);
  return result;
}
