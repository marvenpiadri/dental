#!/usr/bin/env python3
"""Builds public/teeth.svg: one <symbol> per tooth shape, with only the layers the tooth chart uses.

Source: Angular-Advanced-Odontogram by Zoltan Dul (MIT), `core/assets/teeth-svgs/measured/*.svg`.
Usage: build-tooth-sprite.py <path to that measured/ folder> > public/teeth.svg
Each layer group gets a class (`c-<condition>`), shown by the chart through the CSS variable `--show-<condition>`.
"""
import sys
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
q = lambda tag: f'{{{SVG}}}{tag}'

# Layer ids in the source files -> the chart's condition. `tooth` is the healthy tooth, hidden by implants.
LAYERS = {
    'tooth': ['tooth-base', 'tooth-base-dentin', 'tooth-base-beauty', 'tooth-healthy-pulp'],
    'caries': ['caries'],
    'filled': ['composite'],
    'root-canal': ['endo-filling'],
    'crown': ['metal-ceramic'],
    'implant': ['implant'],
}
# The source hides every sub-layer with an inline `display: none`. Show the layer itself plus these parts, drop the rest.
REVEAL = {'caries': {'caries-occlusal', 'caries-mesial'}, 'filled': {'filling-composite-occlusal'}, 'crown': {'metal-ceramic-crown'}}

# Shapes drawn: upper right (11-18) and lower left (31-38); the other quadrants are mirrored by the chart.
SHAPES = [str(n) for n in (*range(11, 19), *range(31, 39))]


def reveal(el, wanted, top=True):
    for child in list(el):
        reveal(child, wanted, False)
        if 'display: none' in (child.get('style') or '') and child.get('id') not in wanted:
            el.remove(child)
    style = el.get('style') or ''
    if 'display: none' in style and (top or el.get('id') in wanted):
        el.set('style', style.replace('display: none;', '').strip())


def main(folder):
    out = ET.Element(q('svg'), {'width': '0', 'height': '0', 'style': 'position:absolute'})
    out.append(ET.Comment(
        ' Tooth artwork derived from Angular-Advanced-Odontogram, (c) 2026 Zoltan Dul, MIT License.'
        ' https://github.com/ZoliQua/Angular-Advanced-Odontogram '))
    style = ET.SubElement(out, q('style'))
    style.text = ''.join(f'.c-{c}{{display:var(--show-{c},none)}}' for c in LAYERS if c != 'tooth') + \
        '.c-tooth{display:var(--show-tooth,inline)}'
    defs = ET.SubElement(out, q('defs'))
    for n in SHAPES:
        root = ET.parse(f'{folder}/{n}.svg').getroot()
        for d in root.findall(q('defs')):
            defs.extend(list(d))
        symbol = ET.SubElement(out, q('symbol'), {'id': f't{n}', 'viewBox': root.get('viewBox')})
        for condition, ids in LAYERS.items():
            for el in list(root.iter()):
                if el.get('id') in ids:
                    el.attrib.pop('data-active', None)
                    el.set('class', f'c-{condition}')
                    reveal(el, REVEAL.get(condition, set()))
                    symbol.append(el)
    for el in out.iter():
        for attr in [a for a in el.attrib if a.startswith('data-')]:
            del el.attrib[attr]
    sys.stdout.write(ET.tostring(out, encoding='unicode'))


main(sys.argv[1])
