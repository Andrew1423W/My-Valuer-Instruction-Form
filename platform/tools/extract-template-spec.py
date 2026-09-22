#!/usr/bin/env python3
"""Read a My Valuer master template (.docx) and emit its merge-field spec as JSON.

The templates carry four kinds of instruction, all as Word MERGEFIELD codes:

  Valuations.NBS                                a job-level value, substituted in place
  Address / Price / SaleDate                    a row-level value inside a repeating region
  TableStart:so_Bedroom ... TableEnd:so_Bedroom a region repeated once per row
  VPDelStart:Valuations.UseGST_eq_No ... End    a block DELETED when the condition holds
  Image:PhotoID,410,270                         a picture slot, width/height in points

Scope follows the dialect: job-level fields are namespaced (Valuations.*, Valuer.*),
row-level fields are bare names. That is more reliable than tracking region nesting,
because the templates contain unbalanced TableStart/TableEnd pairs.

Each field also records the conditional blocks enclosing it and where it first
appears, so the report entry form can ask only for what this kind of report
needs, in the order the report reads.

    python3 tools/extract-template-spec.py > src/report/field-dictionary.json
"""
import json
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

TEMPLATES = [
    ('commercial', 'templates/commercial-v65.docx'),
    ('residential', 'templates/residential-v48.docx'),
]

JOB_SCOPE = ('Valuations.', 'Valuer.', 'AuthValuer.')


def body_parts(zf):
    """Content-bearing parts, in the order a reader meets them."""
    names = [n for n in zf.namelist() if n == 'word/document.xml']
    names += sorted(n for n in zf.namelist()
                    if re.fullmatch(r'word/(header|footer)\d+\.xml', n))
    return names


def heading_levels(zf):
    """Outline level of every paragraph style that is a heading.

    The firm's templates do not use Word's built-in Heading styles: the sections
    are MV1, MV2, ResiMainHeadings and the like. What they share is an outline
    level, which is also what puts them in the contents page, so that is the
    test rather than the style's name.
    """
    levels = {}
    styles = zf.read('word/styles.xml').decode('utf8')
    for m in re.finditer(r'<w:style [^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)</w:style>', styles):
        sid, body = m.group(1), m.group(2)
        lvl = re.search(r'<w:outlineLvl w:val="(\d+)"', body)
        # Outline level 9 is Word's 'body text'; the contents page ignores it.
        if lvl and int(lvl.group(1)) < 9:
            levels[sid] = int(lvl.group(1))
    return levels


def codes_in_order(xml, levels):
    """Yield (code, section, subsection) for every MERGEFIELD, in document order.

    A field code is complete at the fldChar 'separate' or 'end' that closes it, so
    instrText is accumulated and flushed there — codes split across runs survive.
    """
    root = ET.fromstring(xml)
    out, buf, trail = [], [], {}

    def where():
        if not trail:
            return None, None
        ordered = sorted(trail)
        return trail[ordered[0]], trail[ordered[-1]]

    def flush():
        joined = ''.join(buf)
        buf.clear()
        section, subsection = where()
        for m in re.finditer(r'MERGEFIELD\s+("?)([^"\\]+)\1', joined):
            out.append((m.group(2).strip(), section, subsection))

    for para in root.iter(f'{W}p'):
        style = para.find(f'./{W}pPr/{W}pStyle')
        sid = style.get(f'{W}val') if style is not None else None
        for node in para.iter():
            if node.tag == f'{W}instrText':
                buf.append(node.text or '')
            elif node.tag == f'{W}fldChar':
                if node.get(f'{W}fldCharType') in ('separate', 'end'):
                    flush()
            elif node.tag == f'{W}fldSimple':
                # Word's compact single-element form: w:instr holds the whole code.
                buf.append(node.get(f'{W}instr') or '')
                flush()
        text = ''.join(t.text or '' for t in para.iter(f'{W}t'))
        # A heading can itself contain merge fields, whose cached display text
        # Word stores as «Name»; the section is the wording, not the plumbing.
        text = re.sub(r'\u00ab[^\u00ab\u00bb]*\u00bb', '', text).strip()
        level = levels.get(sid) if sid else None
        if level is not None and text:
            trail[level] = text
            for deeper in [k for k in trail if k > level]:
                del trail[deeper]
    flush()
    return out


def classify(code):
    code = code.lstrip('"').strip()
    for prefix, kind in (
        ('TableStart:', 'region_start'), ('TableEnd:', 'region_end'),
        ('VPDelStart:', 'conditional_start'), ('VPDelEnd:', 'conditional_end'),
        ('Image:', 'image'),
    ):
        if code.startswith(prefix):
            return kind, code[len(prefix):].strip()
    return 'field', code


def parse_condition(expr):
    """'Valuations.UseGST_eq_No' -> delete this block when UseGST == 'No'."""
    expr = expr.strip().strip('"')
    m = re.match(r'(.+?)_(eq|neq)_(.+)$', expr)
    if not m:
        return {'expr': expr, 'field': expr, 'op': '==', 'value': 'Yes'}
    field, op, value = m.groups()
    return {'expr': expr, 'field': field,
            'op': '==' if op == 'eq' else '!=',
            'value': value.replace('-', ' ')}


def pop_named(stack, name):
    """Removes the innermost entry with this name; the markers nest cleanly."""
    for i in range(len(stack) - 1, -1, -1):
        if stack[i] == name:
            del stack[i]
            return


def spec_for(path):
    job, rows, regions, conditions, images = {}, {}, {}, {}, []
    region_stack, condition_stack = [], []
    order = 0
    with zipfile.ZipFile(path) as zf:
        levels = heading_levels(zf)
        for part in body_parts(zf):
            for code, heading, subheading in codes_in_order(zf.read(part), levels):
                kind, name = classify(code)
                order += 1
                if kind == 'region_start':
                    region_stack.append(name)
                    regions.setdefault(name, {'name': name, 'section': heading,
                                              'subsection': subheading,
                                              'order': order,
                                              'conditions': list(condition_stack),
                                              'row_fields': []})
                elif kind == 'region_end':
                    pop_named(region_stack, name)
                elif kind == 'conditional_start':
                    cond = parse_condition(name)
                    conditions.setdefault(cond['expr'], {**cond, 'section': heading,
                                                         'subsection': subheading,
                                                         'order': order})
                    condition_stack.append(cond['expr'])
                elif kind == 'conditional_end':
                    pop_named(condition_stack, parse_condition(name)['expr'])
                elif kind == 'image':
                    bits = [b.strip() for b in name.split(',')]
                    images.append({'source': bits[0], 'section': heading,
                                   'subsection': subheading,
                                   'region': region_stack[-1] if region_stack else None,
                                   'conditions': list(condition_stack),
                                   'width': bits[1] if len(bits) > 1 else None,
                                   'height': bits[2] if len(bits) > 2 else None})
                elif name.startswith(JOB_SCOPE):
                    job.setdefault(name, {'name': name, 'section': heading,
                                          'subsection': subheading,
                                          'order': order,
                                          'conditions': list(condition_stack)})
                else:
                    region = region_stack[-1] if region_stack else None
                    entry = rows.setdefault(name, {'name': name, 'regions': []})
                    if region and region not in entry['regions']:
                        entry['regions'].append(region)
                    if region and name not in regions[region]['row_fields']:
                        regions[region]['row_fields'].append(name)
    switches = sorted({c['field'] for c in conditions.values()})
    return {
        'job_fields': sorted(job.values(), key=lambda f: f['order']),
        'row_fields': sorted(rows.values(), key=lambda f: f['name']),
        'regions': sorted(regions.values(), key=lambda r: r['order']),
        'conditions': sorted(conditions.values(), key=lambda c: c['expr']),
        'switch_fields': switches,
        'images': images,
    }


def main():
    out = {}
    for key, path in TEMPLATES:
        s = spec_for(path)
        out[key] = {'template': path, **s}
        print(f'{key:12} {len(s["job_fields"]):4} job  '
              f'{len(s["row_fields"]):4} row  '
              f'{len(s["regions"]):3} regions  '
              f'{len(s["conditions"]):3} conditions '
              f'({len(s["switch_fields"])} switches)  '
              f'{len(s["images"]):2} images', file=sys.stderr)
    json.dump(out, sys.stdout, indent=2)
    print()


if __name__ == '__main__':
    main()
