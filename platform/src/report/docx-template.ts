/**
 * Fills a My Valuer master template (.docx) from job data.
 *
 * The firm's templates are Word mail-merge documents. Rather than build a report
 * from scratch, this fills the template the firm already uses, so the layout,
 * clause wording and compliance text stay exactly as approved.
 *
 * Four instruction kinds appear as MERGEFIELD codes (see tools/extract-template-spec.py):
 *
 *   Valuations.NBS                      a job-level value, substituted in place
 *   Address / Price / SaleDate           a row-level value inside a repeating region
 *   TableStart:X … TableEnd:X            a region repeated once per row
 *   VPDelStart:Cond … VPDelEnd:Cond      a block kept or deleted on a condition
 *   Image:PhotoID,410,270                a picture slot
 *
 * Filling runs in four passes over each content part: flatten the field
 * constructs to tokens, expand regions, resolve conditionals, then substitute.
 * Working in token space keeps the later passes out of Word's run/field XML.
 */
import JSZip from 'jszip';

/**
 * Token delimiters. Private-use characters, because the templates already
 * contain guillemets as text: Word caches each merge field's display text as
 * «Name», and a field expression can hold that cached text in its instruction.
 */
const OPEN = '\uE000';
const CLOSE = '\uE001';

export type FieldValues = Record<string, string | number | null | undefined>;

export type FillInput = {
  /** Job-level values, keyed as the template names them: `Valuations.NBS`. */
  fields: FieldValues;
  /** Rows for each repeating region, keyed by region name: `so_Bedroom`. */
  rows?: Record<string, FieldValues[]>;
  /** Values the conditional blocks test, e.g. `Valuations.UseGST` -> `'No'`. */
  switches?: FieldValues;
};

/** What the fill did, for logging and for warning the valuer about gaps. */
export type FillReport = {
  fieldsFilled: number;
  fieldsMissing: string[];
  regionsExpanded: { name: string; rows: number }[];
  blocksKept: string[];
  blocksDropped: string[];
  imagesSkipped: number;
  /** Tokens no value reached, removed so Word can still open the file. */
  tokensDropped: string[];
  /** Region or block markers left without a pair, removed as debris. */
  markersOrphaned: string[];
  /**
   * Places the template asks the valuer to type over by hand.
   *
   * The commercial template states its value conclusion as literal text —
   * `??? Thousand Dollars ($,000) plus GST, if any` — rather than as a merge
   * field, so filling cannot reach it. Reporting them means no report goes out
   * with `$??????` in it, and shows which figures are worth adding merge
   * fields for.
   */
  placeholders: string[];
};

export async function fillTemplate(
  templateBytes: Buffer | Uint8Array,
  input: FillInput,
): Promise<{ docx: Buffer; report: FillReport }> {
  const zip = await JSZip.loadAsync(templateBytes);
  const report: FillReport = {
    fieldsFilled: 0,
    fieldsMissing: [],
    regionsExpanded: [],
    blocksKept: [],
    blocksDropped: [],
    imagesSkipped: 0,
    tokensDropped: [],
    markersOrphaned: [],
    placeholders: [],
  };

  const parts = Object.keys(zip.files).filter((n) =>
    /^word\/(document|header\d+|footer\d+)\.xml$/.test(n),
  );

  // `IF` and `=` field expressions are evaluated during pass 1, so they need
  // the job-level values before the substitution pass runs.
  const resolve: FieldResolver = (name) => {
    const value = input.fields[name] ?? input.switches?.[name];
    return value === undefined || value === null ? null : String(value);
  };

  for (const part of parts) {
    let xml = await zip.file(part)!.async('string');
    xml = flattenFields(xml, resolve);
    xml = expandRegions(xml, input.rows ?? {}, report);
    xml = resolveConditionals(xml, input.switches ?? {}, report);
    xml = substitute(xml, input.fields, report);
    xml = stripRemainingTokens(xml, report);
    xml = stripCachedFieldText(xml);
    collectPlaceholders(xml, report);
    zip.file(part, xml);
  }

  // The contents page and cross references still hold the text Word cached the
  // last time the template was merged. Asking Word to refresh fields on open
  // rebuilds them against this report's headings and page numbers.
  const settings = zip.file('word/settings.xml');
  if (settings) zip.file('word/settings.xml', updateFieldsOnOpen(await settings.async('string')));

  const docx = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    // Word is content-type driven, but keep mimetype-ish ordering stable anyway.
    compressionOptions: { level: 6 },
  });
  return { docx, report };
}

/* ------------------------------------------------------------------ pass 1 */

/** Looks up a job-level value while field expressions are being evaluated. */
export type FieldResolver = (name: string) => string | null;

/**
 * Rewrites every MERGEFIELD construct as a single run holding a token, and
 * evaluates the field expressions the templates wrap around merge fields.
 *
 * Word writes merge fields two ways: the compact `w:fldSimple` element, and a
 * run sequence bracketed by `w:fldChar` begin/separate/end with the code in
 * `w:instrText`. Both collapse to one token run here, carrying the original
 * run properties so the substituted text keeps the template's formatting.
 *
 * The templates also nest merge fields inside two Word field expressions:
 *
 *   IF «X» = Yes "text" "other"   conditional wording
 *   = «A» + «B»                   a sum, e.g. total floor area
 *
 * Word would evaluate those during its own mail merge, so filling the template
 * ourselves means evaluating them here. Both are resolved from job-level
 * values: a field expression reading a row-level value is not supported,
 * because rows are only known later, in pass 2.
 *
 * Any other field kind — PAGE, PAGEREF, TOC, DATE — is left exactly as the
 * template wrote it, so page numbers and the contents page still work.
 */
export function flattenFields(xml: string, resolve: FieldResolver = () => null): string {
  return flattenFldChar(flattenFldSimple(xml, resolve), resolve);
}

function flattenFldSimple(xml: string, resolve: FieldResolver): string {
  let result = '';
  let i = 0;
  for (;;) {
    const open = indexOfTag(xml, '<w:fldSimple', i);
    if (open < 0) {
      result += xml.slice(i);
      return result;
    }
    const end = matchingClose(xml, open, 'w:fldSimple');
    if (end === null) {
      result += xml.slice(i);
      return result;
    }
    const element = xml.slice(open, end);
    const frame = newFrame(firstRunProps(element));
    frame.code = attr(element, 'w:instr') ?? '';
    frame.cached = textOfRuns(element);
    const resolved = evaluateField(frame, resolve);
    result += xml.slice(i, open);
    // A field kind we do not interpret stays as the template wrote it.
    result += resolved ? resolved.xml : element;
    i = end;
  }
}

/** One field construct being read, innermost last on the stack. */
type Frame = {
  /** The instruction text, with each nested field replaced by a placeholder. */
  code: string;
  /** Values of the fields nested in this one, addressed by placeholder index. */
  nested: string[];
  /** Run properties to carry onto the token, so formatting survives. */
  props: string;
  /** The original runs, so a field kind we do not interpret survives untouched. */
  raw: string;
  /** Word stores the last merge result after `separate`; it is not code. */
  afterSeparate: boolean;
  /** Text of that stored result — the only value available for a field we skip. */
  cached: string;
};

function newFrame(props: string): Frame {
  return { code: '', nested: [], props, raw: '', afterSeparate: false, cached: '' };
}

function flattenFldChar(xml: string, resolve: FieldResolver): string {
  const pieces = splitRuns(xml);
  const stack: Frame[] = [];
  let out = '';

  for (const piece of pieces) {
    const top = stack[stack.length - 1];

    if (!piece.isRun) {
      if (top) top.raw += piece.text;
      else out += piece.text;
      continue;
    }

    const kind = fldCharType(piece.text);
    if (kind === 'begin') {
      const frame = newFrame(firstRunProps(piece.text));
      frame.raw = piece.text;
      stack.push(frame);
      continue;
    }
    if (!top) {
      out += piece.text;
      continue;
    }
    if (kind === 'separate') {
      top.afterSeparate = true;
      top.raw += piece.text;
      continue;
    }
    if (kind === 'end') {
      top.raw += piece.text;
      stack.pop();
      const parent = stack[stack.length - 1];
      const resolved = evaluateField(top, resolve);
      if (parent) {
        // A field nested in another field's code: its value belongs to that
        // code as an operand, not to the document.
        parent.raw += top.raw;
        parent.code += `${PLACEHOLDER}${parent.nested.length}${PLACEHOLDER}`;
        parent.nested.push(resolved ? resolved.value : top.cached);
        if (!parent.props) parent.props = top.props;
      } else {
        out += resolved ? resolved.xml : top.raw;
      }
      continue;
    }

    top.raw += piece.text;
    if (top.afterSeparate) {
      // Runs after `separate` hold the result of the template's last merge.
      top.cached += textOfRuns(piece.text);
      continue;
    }
    // A run of plain text inside an instruction is a nested field the
    // `w:fldSimple` pass already turned into a token — the commercial template
    // writes the result of `IF … = Yes "…"` that way. The token belongs in the
    // instruction, so the chosen branch can carry it into the document.
    const text = instrText(piece.text) ?? textOfRuns(piece.text);
    if (text) {
      top.code += text;
      if (!top.props) top.props = firstRunProps(piece.text);
    }
  }

  // A `begin` with no matching `end`: keep the markup rather than lose it.
  for (const frame of stack) out += frame.raw;
  return out;
}

/** What a field contributes: a value to its parent's code, and XML to the document. */
type Resolved = { value: string; xml: string };

/** Placeholder delimiter for a nested field's value inside an instruction. */
const PLACEHOLDER = '\u0001';

/** Resolves one field construct, or null for a field kind we leave untouched. */
function evaluateField(frame: Frame, resolve: FieldResolver): Resolved | null {
  const toks = tokenizeCode(frame.code, frame.nested, resolve);
  const first = toks[0];
  if (!first) return null;
  const keyword = first.kind === 'word' ? first.text.toUpperCase() : first.text;

  if (keyword === 'MERGEFIELD') {
    const name = toks[1] ? toks[1].value.trim() : '';
    if (!name) return null;
    // Stays a token: a row-level name can only be filled once rows are known.
    return { value: resolve(name) ?? '', xml: tokenRun(name, frame.props) };
  }

  if (keyword === 'IF') {
    const value = evaluateIf(toks);
    return { value, xml: textRun(value, frame.props) };
  }

  if (keyword === '=') {
    const cursor = { i: 1 };
    const value = formatNumber(parseExpression(toks, cursor));
    return { value, xml: textRun(value, frame.props) };
  }

  return null;
}

/** `IF <lhs> <op> <rhs> <then> <else>` — Word's comparison field. */
function evaluateIf(toks: CodeTok[]): string {
  const lhs = toks[1]?.value ?? '';
  const op = toks[2]?.text ?? '=';
  const rhs = toks[3]?.value ?? '';
  const thenValue = toks[4]?.value ?? '';
  const elseValue = toks[5]?.value ?? '';
  return compare(lhs, op, rhs) ? thenValue : elseValue;
}

function compare(lhs: string, op: string, rhs: string): boolean {
  const a = lhs.trim();
  const b = rhs.trim();
  if (op === '=' || op === '<>') {
    const equal = a.toLowerCase() === b.toLowerCase();
    return op === '=' ? equal : !equal;
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (op === '>') return x > y;
  if (op === '<') return x < y;
  if (op === '>=') return x >= y;
  if (op === '<=') return x <= y;
  return false;
}

type CodeTok = { kind: 'word' | 'str' | 'value' | 'op'; text: string; value: string };

/**
 * Splits an instruction into operands and operators.
 *
 * Formatting switches (`\* MERGEFORMAT`, `\# "$#,##0"`) are dropped: the text
 * we substitute is already formatted by the platform.
 */
function tokenizeCode(code: string, nested: string[], resolve: FieldResolver): CodeTok[] {
  const toks: CodeTok[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === PLACEHOLDER) {
      const close = code.indexOf(PLACEHOLDER, i + 1);
      if (close < 0) break;
      const index = Number(code.slice(i + 1, close));
      const value = nested[index] ?? '';
      toks.push({ kind: 'value', text: value, value });
      i = close + 1;
      continue;
    }
    if (ch === '"') {
      const close = code.indexOf('"', i + 1);
      // Word reads an unterminated string as running to the end of the code.
      const text = close < 0 ? code.slice(i + 1) : code.slice(i + 1, close);
      toks.push({ kind: 'str', text, value: text });
      i = close < 0 ? code.length : close + 1;
      continue;
    }
    if (ch === '\\') {
      i = skipSwitch(code, i);
      continue;
    }
    const two = code.slice(i, i + 2);
    if (two === '<>' || two === '>=' || two === '<=') {
      toks.push({ kind: 'op', text: two, value: two });
      i += 2;
      continue;
    }
    if ('=<>+*/()'.includes(ch) || (ch === '-' && /\s/.test(code[i + 1] ?? ' '))) {
      toks.push({ kind: 'op', text: ch, value: ch });
      i += 1;
      continue;
    }
    let j = i;
    while (j < code.length && !/[\s"()]/.test(code[j]) && code[j] !== PLACEHOLDER) {
      if ('=<>+*/'.includes(code[j])) break;
      j += 1;
    }
    if (j === i) j = i + 1;
    const text = code.slice(i, j);
    // A `w:fldSimple` writes a nested field into its instruction as display
    // text, so `«Name»` outside a quoted result is a value to read, not a word.
    const ref = /^«(.+)»$/.exec(text);
    if (ref) toks.push({ kind: 'value', text, value: resolve(ref[1].trim()) ?? '' });
    else toks.push({ kind: 'word', text, value: text });
    i = j;
  }
  return toks;
}

/** Steps past `\<char> <argument>`, where the argument may be quoted. */
function skipSwitch(code: string, at: number): number {
  let i = at + 1;
  while (i < code.length && !/\s/.test(code[i])) i += 1;
  while (i < code.length && /\s/.test(code[i])) i += 1;
  if (code[i] === '"') {
    const close = code.indexOf('"', i + 1);
    return close < 0 ? code.length : close + 1;
  }
  while (i < code.length && !/\s/.test(code[i])) i += 1;
  return i;
}

/* Arithmetic for `=` fields: expression, term, factor. */

function parseExpression(toks: CodeTok[], cursor: { i: number }): number {
  let value = parseTerm(toks, cursor);
  for (;;) {
    const op = toks[cursor.i];
    if (!op || op.kind !== 'op' || (op.text !== '+' && op.text !== '-')) return value;
    cursor.i += 1;
    const rhs = parseTerm(toks, cursor);
    value = op.text === '+' ? value + rhs : value - rhs;
  }
}

function parseTerm(toks: CodeTok[], cursor: { i: number }): number {
  let value = parseFactor(toks, cursor);
  for (;;) {
    const op = toks[cursor.i];
    if (!op || op.kind !== 'op' || (op.text !== '*' && op.text !== '/')) return value;
    cursor.i += 1;
    const rhs = parseFactor(toks, cursor);
    value = op.text === '*' ? value * rhs : rhs === 0 ? 0 : value / rhs;
  }
}

function parseFactor(toks: CodeTok[], cursor: { i: number }): number {
  const tok = toks[cursor.i];
  if (!tok) return 0;
  cursor.i += 1;
  if (tok.kind === 'op' && tok.text === '(') {
    const value = parseExpression(toks, cursor);
    if (toks[cursor.i]?.text === ')') cursor.i += 1;
    return value;
  }
  if (tok.kind === 'op' && tok.text === '-') return -parseFactor(toks, cursor);
  return toNumber(tok.value);
}

/** Reads a number out of a formatted value: `$1,250,000` -> 1250000. */
function toNumber(value: string): number {
  const cleaned = value.replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Word's default `=` field formatting: plain, no thousands separator. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Splits the part into runs and the markup between them, preserving order. */
function splitRuns(xml: string): { isRun: boolean; text: string }[] {
  const pieces: { isRun: boolean; text: string }[] = [];
  let i = 0;
  for (;;) {
    const open = indexOfTag(xml, '<w:r', i);
    if (open < 0) {
      pieces.push({ isRun: false, text: xml.slice(i) });
      return pieces;
    }
    const end = matchingClose(xml, open, 'w:r');
    if (end === null) {
      pieces.push({ isRun: false, text: xml.slice(i) });
      return pieces;
    }
    if (open > i) pieces.push({ isRun: false, text: xml.slice(i, open) });
    pieces.push({ isRun: true, text: xml.slice(open, end) });
    i = end;
  }
}

function fldCharType(run: string): 'begin' | 'separate' | 'end' | null {
  const m = /<w:fldChar[^>]*w:fldCharType="(begin|separate|end)"/.exec(run);
  return m ? (m[1] as 'begin' | 'separate' | 'end') : null;
}

function instrText(run: string): string | null {
  const matches = run.match(/<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/g);
  if (!matches) return null;
  return matches
    .map((m) => unescapeXml(m.replace(/^<w:instrText[^>]*>/, '').replace(/<\/w:instrText>$/, '')))
    .join('');
}

/** The visible text of a fragment, with the field plumbing left out. */
function textOfRuns(fragment: string): string {
  const matches = fragment.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g);
  if (!matches) return '';
  return matches.map((m) => unescapeXml(m.replace(/<[^>]+>/g, ''))).join('');
}

function firstRunProps(fragment: string): string {
  const m = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(fragment);
  return m ? m[0] : '';
}

function tokenRun(name: string, props: string): string {
  return `<w:r>${props}<w:t xml:space="preserve">${OPEN}${name}${CLOSE}</w:t></w:r>`;
}

/**
 * A run of literal text produced by a field expression.
 *
 * Word writes a merge field inside a quoted `IF` result as its display text,
 * `«Valuations.Crosslease»`, so those become tokens for pass 4 to fill.
 */
function textRun(text: string, props: string): string {
  const withTokens = text.replace(/«([^«»]+)»/g, (_w, name: string) =>
    `${OPEN}${String(name).trim()}${CLOSE}`,
  );
  return `<w:r>${props}<w:t xml:space="preserve">${escapeXml(withTokens)}</w:t></w:r>`;
}

/* ------------------------------------------------------------------ pass 2 */

/**
 * Repeats each `TableStart:X … TableEnd:X` span once per supplied row.
 *
 * The span is widened to whole Word elements so the result stays well formed:
 * a region inside one table row repeats that row, a region spanning rows
 * repeats those rows, and anything else repeats the enclosing paragraphs.
 * A region with no rows is removed outright.
 */
export function expandRegions(
  xml: string,
  rows: Record<string, FieldValues[]>,
  report: FillReport,
): string {
  let out = xml;
  // Outermost-first: take the first start marker and find the end that closes it.
  for (let guard = 0; guard < 500; guard += 1) {
    const m = new RegExp(`${OPEN}TableStart:([^${CLOSE}]+)${CLOSE}`).exec(out);
    if (!m) break;
    const name = m[1];
    const startTok = m.index;
    const endMarker = `${OPEN}TableEnd:${name}${CLOSE}`;
    const endTok = matchMarker(out, startTok, m[0], endMarker);
    if (endTok < 0) {
      // Unbalanced marker (the templates contain a few); drop it and move on.
      out = out.slice(0, startTok) + out.slice(startTok + m[0].length);
      continue;
    }
    const endTokEnd = endTok + endMarker.length;
    const span = widenToElements(out, startTok, endTokEnd);
    const block = out.slice(span.start, span.end);
    const data = rows[name] ?? [];
    report.regionsExpanded.push({ name, rows: data.length });

    const rendered = data
      .map((row) => substituteRow(stripMarkers(block, name), row))
      .join('');
    out = out.slice(0, span.start) + rendered + out.slice(span.end);
  }
  return out;
}

function stripMarkers(block: string, name: string): string {
  return block
    .split(`${OPEN}TableStart:${name}${CLOSE}`)
    .join('')
    .split(`${OPEN}TableEnd:${name}${CLOSE}`)
    .join('');
}

/** Row values fill bare tokens; job-level tokens are left for pass 4. */
function substituteRow(block: string, row: FieldValues): string {
  return block.replace(
    new RegExp(`${OPEN}([^${CLOSE}]+)${CLOSE}`, 'g'),
    (whole, name: string) => {
      if (name.startsWith('Valuations.') || name.startsWith('Valuer.')) return whole;
      if (name.startsWith('Image:')) return whole;
      const v = row[name];
      return v === undefined || v === null ? '' : escapeXml(String(v));
    },
  );
}

/* ------------------------------------------------------------------ pass 3 */

/**
 * Deletes each `VPDelStart:Cond … VPDelEnd:Cond` block whose condition holds.
 *
 * The marker is a delete instruction, not a keep instruction: the condition says
 * when the block comes *out*. The commercial template settles it — the insurance
 * cost estimates, the insurance cost terms and the insurance appendix all sit
 * inside `Valuations.ComReport_neq_Insurance`, so they are deleted whenever the
 * report is not an insurance report, and the rateable value, SWOT and rental
 * evidence sections sit inside `Valuations.ComReport_eq_Insurance`, deleted when
 * it is. Reading it the other way round puts the insurance section in every
 * report but the insurance one.
 *
 * Blocks nest and also cross (`Start:A … Start:B … End:A … End:B`), so each
 * marker pair is resolved on its own. A deleted span widens to whole elements,
 * so removing a clause never leaves half a table row behind.
 */
export function resolveConditionals(
  xml: string,
  switches: FieldValues,
  report: FillReport,
): string {
  let out = xml;
  for (let guard = 0; guard < 500; guard += 1) {
    const m = new RegExp(`${OPEN}VPDelStart:([^${CLOSE}]+)${CLOSE}`).exec(out);
    if (!m) break;
    const expr = m[1];
    const startTok = m.index;
    const endMarker = `${OPEN}VPDelEnd:${expr}${CLOSE}`;
    const endTok = matchMarker(out, startTok, m[0], endMarker);
    if (endTok < 0) {
      out = out.slice(0, startTok) + out.slice(startTok + m[0].length);
      continue;
    }
    if (!shouldDeleteBlock(expr, switches)) {
      report.blocksKept.push(expr);
      out =
        out.slice(0, startTok) +
        out.slice(startTok + m[0].length, endTok) +
        out.slice(endTok + endMarker.length);
    } else {
      report.blocksDropped.push(expr);
      const span = widenToElements(out, startTok, endTok + endMarker.length);
      out = out.slice(0, span.start) + out.slice(span.end);
    }
  }
  return out;
}

/**
 * `Valuations.UseGST_eq_No` -> delete the block when UseGST is 'No'.
 *
 * Hyphens in the value stand for spaces, so `ComReport_eq_Ground-Rental` tests
 * for 'Ground Rental'.
 */
export function shouldDeleteBlock(expr: string, switches: FieldValues): boolean {
  const cleaned = expr.replace(/^"+/, '').trim();
  const m = /^(.+?)_(eq|neq)_(.+)$/.exec(cleaned);
  if (!m) {
    // No operator appears in either template; read a bare name as a Yes/No flag.
    return String(switches[cleaned] ?? '').trim().toLowerCase() === 'yes';
  }
  const [, field, op, rawValue] = m;
  const expected = rawValue.replace(/-/g, ' ').trim().toLowerCase();
  const actual = String(switches[field] ?? '').replace(/-/g, ' ').trim().toLowerCase();
  return op === 'eq' ? actual === expected : actual !== expected;
}

/* ------------------------------------------------------------------ pass 4 */

function substitute(xml: string, fields: FieldValues, report: FillReport): string {
  return xml.replace(
    new RegExp(`${OPEN}([^${CLOSE}]+)${CLOSE}`, 'g'),
    (whole, name: string) => {
      if (name.startsWith('Image:')) return whole;
      const v = fields[name];
      if (v === undefined || v === null || v === '') {
        if (!report.fieldsMissing.includes(name)) report.fieldsMissing.push(name);
        return '';
      }
      report.fieldsFilled += 1;
      return escapeXml(String(v));
    },
  );
}

/** Image slots are not filled yet; remove the tokens so Word opens the file. */
function stripRemainingTokens(xml: string, report: FillReport): string {
  return xml.replace(new RegExp(`${OPEN}([^${CLOSE}]+)${CLOSE}`, 'g'), (_w, name: string) => {
    const text = String(name);
    if (text.startsWith('Image:')) report.imagesSkipped += 1;
    else if (/^(VPDel(Start|End)|Table(Start|End)):/.test(text)) {
      if (!report.markersOrphaned.includes(text)) report.markersOrphaned.push(text);
    } else if (!report.tokensDropped.includes(name)) report.tokensDropped.push(name);
    return '';
  });
}

/**
 * Removes the display text Word cached for fields we left in place.
 *
 * A contents entry keeps the text of its heading as it stood at the last
 * merge, merge fields and all, so `«VPDelStart:…»` can survive inside a TOC we
 * do not touch. Word rebuilds those entries when it refreshes fields on open;
 * clearing them here means nothing shows a raw field name in the meantime.
 */
function stripCachedFieldText(xml: string): string {
  return xml.replace(
    /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g,
    (whole, attrs: string | undefined, text: string) => {
      const cleaned = text.replace(/«[\w\s.:,()\/-]*»/g, '');
      return cleaned === text ? whole : `<w:t${attrs ?? ''}>${cleaned}</w:t>`;
    },
  );
}

/**
 * Notes the literal placeholders the template leaves for hand typing.
 *
 * A run of question marks, with or without a dollar sign, is how the templates
 * mark a figure the valuer fills in Word. They are left in place — removing
 * them would hide the gap — and reported so the platform can warn.
 */
function collectPlaceholders(xml: string, report: FillReport): void {
  const text = (xml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) ?? [])
    .map((t) => unescapeXml(t.replace(/<[^>]+>/g, '')))
    .join(' ');
  for (const m of text.matchAll(/[^.?!]{0,60}\$?\?{3,}[^.?!]{0,60}/g)) {
    const snippet = m[0].replace(/\s+/g, ' ').trim();
    if (snippet && !report.placeholders.includes(snippet)) report.placeholders.push(snippet);
  }
}

/** Sets `w:updateFields`, so Word refreshes the contents page when opened. */
function updateFieldsOnOpen(settings: string): string {
  if (settings.includes('<w:updateFields')) {
    return settings.replace(/<w:updateFields[^>]*\/>/, '<w:updateFields w:val="true"/>');
  }
  // CT_Settings is an ordered sequence; updateFields sits just before these.
  for (const tag of ['w:hdrShapeDefaults', 'w:footnotePr', 'w:endnotePr', 'w:compat', 'w:rsids']) {
    const at = settings.indexOf(`<${tag}`);
    if (at >= 0) {
      return `${settings.slice(0, at)}<w:updateFields w:val="true"/>${settings.slice(at)}`;
    }
  }
  return settings.replace('</w:settings>', '<w:updateFields w:val="true"/></w:settings>');
}

/* ----------------------------------------------------------------- helpers */

/**
 * Index of the end marker that closes the start marker at `startTok`, or -1.
 *
 * The same condition or region nests inside itself in both templates — the
 * commercial template opens `ComReport_neq_Lessors-Interest` inside an outer
 * block of the same name — so the first end marker after the start is often not
 * the one that closes it. Taking it deleted a fifth of the report body.
 */
function matchMarker(xml: string, startTok: number, startMarker: string, endMarker: string): number {
  let depth = 1;
  let i = startTok + startMarker.length;
  for (;;) {
    const nextEnd = xml.indexOf(endMarker, i);
    if (nextEnd < 0) return -1;
    const nextStart = xml.indexOf(startMarker, i);
    if (nextStart >= 0 && nextStart < nextEnd) {
      depth += 1;
      i = nextStart + startMarker.length;
    } else {
      depth -= 1;
      if (depth === 0) return nextEnd;
      i = nextEnd + endMarker.length;
    }
  }
}

/**
 * Grows [start,end) outward to whole Word elements so a cut or copy cannot
 * split an element. Table rows win over paragraphs, because a region marker in
 * a row means "repeat the row", and paragraphs inside it must travel with it.
 */
function widenToElements(xml: string, start: number, end: number): { start: number; end: number } {
  for (const tag of ['w:tr', 'w:p'] as const) {
    const a = elementRange(xml, start, tag);
    const b = elementRange(xml, end - 1, tag);
    if (a && b) return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
  }
  return { start, end };
}

/** The innermost `tag` element containing `index`, or null. */
export function elementRange(
  xml: string,
  index: number,
  tag: string,
): { start: number; end: number } | null {
  let from = index;
  while (from >= 0) {
    const open = lastIndexOfTag(xml, `<${tag}`, from);
    if (open < 0) return null;
    const end = matchingClose(xml, open, tag);
    if (end !== null && end > index) return { start: open, end };
    from = open - 1;
  }
  return null;
}

/** Index of `needle` used as a tag start (next char ends the name). */
function indexOfTag(xml: string, needle: string, from: number): number {
  let i = from;
  for (;;) {
    const at = xml.indexOf(needle, i);
    if (at < 0) return -1;
    const next = xml[at + needle.length];
    if (next === ' ' || next === '>' || next === '/' || next === '\n' || next === '\r') return at;
    i = at + 1;
  }
}

function lastIndexOfTag(xml: string, needle: string, from: number): number {
  let i = from;
  for (;;) {
    const at = xml.lastIndexOf(needle, i);
    if (at < 0) return -1;
    const next = xml[at + needle.length];
    if (next === ' ' || next === '>' || next === '/' || next === '\n' || next === '\r') return at;
    i = at - 1;
    if (i < 0) return -1;
  }
}

/** End index (exclusive) of the element opening at `openIdx`. */
function matchingClose(xml: string, openIdx: number, tag: string): number | null {
  const openTagEnd = xml.indexOf('>', openIdx);
  if (openTagEnd < 0) return null;
  if (xml[openTagEnd - 1] === '/') return openTagEnd + 1;
  const closeStr = `</${tag}>`;
  let depth = 1;
  let i = openTagEnd + 1;
  while (i < xml.length) {
    const nextClose = xml.indexOf(closeStr, i);
    if (nextClose < 0) return null;
    const nextOpen = indexOfTag(xml, `<${tag}`, i);
    if (nextOpen >= 0 && nextOpen < nextClose) {
      const e = xml.indexOf('>', nextOpen);
      if (e < 0) return null;
      if (xml[e - 1] !== '/') depth += 1;
      i = e + 1;
    } else {
      depth -= 1;
      i = nextClose + closeStr.length;
      if (depth === 0) return i;
    }
  }
  return null;
}

function attr(element: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(element);
  return m ? unescapeXml(m[1]) : null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
