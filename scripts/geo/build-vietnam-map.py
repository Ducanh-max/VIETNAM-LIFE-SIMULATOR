import json,math,sys
f=json.load(open(sys.argv[1]))
LON0,LON1,LAT0,LAT1=101.6,117.6,6.9,23.7
K=math.cos(math.radians(15.5)); S=60
W=(LON1-LON0)*K*S; H=(LAT1-LAT0)*S
def P(lon,lat): return ((lon-LON0)*K*S, (LAT1-lat)*S)
def dp(pts,eps):
    if len(pts)<3: return pts
    a,b=pts[0],pts[-1]; dx,dy=b[0]-a[0],b[1]-a[1]; L=math.hypot(dx,dy) or 1e-9
    i,dm=0,0
    for k in range(1,len(pts)-1):
        d=abs(dy*(pts[k][0]-a[0])-dx*(pts[k][1]-a[1]))/L
        if d>dm: i,dm=k,d
    if dm>eps: return dp(pts[:i+1],eps)[:-1]+dp(pts[i:],eps)
    return [a,b]
main=[];islands=[]
for poly in f['geometry']['coordinates']:
    ring=[P(*c) for c in poly[0]]
    xs=[c[0] for c in poly[0]]
    if len(ring)>200 or (max(xs)<109.6 and len(ring)>30):
        h=len(ring)//2
        s=dp(ring[:h+1],0.35)[:-1]+dp(ring[h:],0.35)
        main.append('M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in s)+'Z')
    elif max(xs)>110:
        cx=sum(p[0] for p in ring)/len(ring); cy=sum(p[1] for p in ring)/len(ring)
        islands.append((round(cx,1),round(cy,1)))
out=f"""// Generated from Natural Earth 10m admin-0 (Vietnam point of view), public domain.
// Equirectangular projection, x scaled by cos(15.5°). Regenerate with scripts/geo/build-vietnam-map.py.
export const VN_MAP = {{ width: {W:.1f}, height: {H:.1f}, lon0: {LON0}, lat1: {LAT1}, kx: {K*S:.4f}, ky: {S} }} as const;
export const vietnamPath = {json.dumps(''.join(main))};
export const vietnamIslands: [number, number][] = {json.dumps(islands)};
export function project(lon: number, lat: number): [number, number] {{
  return [(lon - VN_MAP.lon0) * VN_MAP.kx, (VN_MAP.lat1 - lat) * VN_MAP.ky];
}}
"""
open(sys.argv[2],'w').write(out)
print(W,H,len(''.join(main)),len(islands))
