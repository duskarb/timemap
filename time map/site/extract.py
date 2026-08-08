import re, json, math
SVG=open('/sessions/jolly-ecstatic-volta/mnt/DDA/time map/exports/daejeon-transit-time-map.svg',encoding='utf-8').read()

def group(gid):
    i=SVG.index('<g id="%s"'%gid)
    m=re.compile(r'\n  <g id="').search(SVG,i+5)
    return SVG[i: m.start() if m else len(SVG)]

def paths(block):
    return re.findall(r'\sd="([^"]+)"', block)
def circles(block):
    return [(float(a),float(b),c) for c,a,b in
            re.findall(r'<circle(?:\s+id="([^"]*)")?\s+cx="([-\d.]+)"\s+cy="([-\d.]+)"', block)] \
        if False else [(float(m.group(2)),float(m.group(3)),m.group(1) or '')
            for m in re.finditer(r'<circle(?:\s+id="([^"]*)")?\s*cx="([-\d.]+)"\s*cy="([-\d.]+)"', block)]

def parse_path(d):
    subs=[]
    for seg in re.split(r'(?=M)', d):
        if not seg.strip(): continue
        pts=[tuple(map(float,p.split(','))) for p in re.findall(r'[ML]([-\d.]+,[-\d.]+)', seg)]
        closed = seg.rstrip().endswith('Z')
        if pts: subs.append((pts, closed))
    return subs

out={}
out['city']      = [parse_path(d) for d in paths(group('02-city-area'))]
out['gu']        = [parse_path(d) for d in paths(group('06-gu-boundaries'))]
out['dong']      = [parse_path(d) for d in paths(group('05-dong-boundaries'))]
out['line1']     = [parse_path(d) for d in paths(group('11-subway-line-1'))]
out['tram']      = [parse_path(d) for d in paths(group('14-tram-line-2'))]
out['line1_st']  = circles(group('12-subway-stations'))
out['tram_st']   = circles(group('15-tram-stations'))
lm=group('17-landmarks')
out['landmarks']=[]
for m in re.finditer(r'<g id="landmark-([^"]+)">\s*<circle cx="([-\d.]+)" cy="([-\d.]+)"', lm):
    out['landmarks'].append((float(m.group(2)),float(m.group(3)),m.group(1)))
gl=group('09-gu-labels')
out['gu_labels']=[(float(a),float(b),c) for a,b,c in re.findall(r'<text x="([-\d.]+)" y="([-\d.]+)">([^<]+)</text>',gl)]
dl=group('08-dong-labels')
out['dong_labels']=[(float(a),float(b),c) for a,b,c in re.findall(r'<text x="([-\d.]+)" y="([-\d.]+)">([^<]+)</text>',dl)]

print('city subpaths',sum(len(p) for p in out['city']),'pts',sum(len(s[0]) for p in out['city'] for s in p))
print('gu',sum(len(s[0]) for p in out['gu'] for s in p))
print('line1 pts',sum(len(s[0]) for p in out['line1'] for s in p))
print('tram paths',len(out['tram']),'pts',sum(len(s[0]) for p in out['tram'] for s in p))
print('line1 stations',len(out['line1_st']))
print('tram stops',len(out['tram_st']))
print('landmarks',len(out['landmarks']), [l[2] for l in out['landmarks']])
print('gu labels',out['gu_labels'])
print('dong labels',len(out['dong_labels']))
print('sample tram', out['tram_st'][:3], out['tram_st'][-3:])
json.dump(out,open('raw_svg.json','w'),ensure_ascii=False)
