"""Reconstruct reference as: grid-aligned terrain stack + free-placed object tiles.
Writes cache/recon.json and cache/recon.png / cache/diff.png"""
import json, itertools, time
import numpy as np
from PIL import Image
P='Serene_Village_revamped_v1.9/SERENE_VILLAGE_REVAMPED/'
SHEETS={'village':P+'Serene_Village_16x16.png','water':P+'Animated stuff/water_waves_16x16.png',
        'campfire':P+'Animated stuff/campfire_16x16.png','door':P+'Animated stuff/door_16x16.png',
        'auto':P+'Construct 3/Autotiles_no_inner_corners_16x16.png'}
BRIDGE=set([67,68,69,70,71,72,86,87,88,89,90,105,106,107,108,109,124,125,126,127,128])
H_,V_,D_=0x80000000,0x40000000,0x20000000
def variant(img,f):
    if f&D_: img=np.swapaxes(img,0,1)
    if f&H_: img=img[:,::-1]
    if f&V_: img=img[::-1]
    return np.ascontiguousarray(img)
TERRAIN_MAX=133
refrgb=np.asarray(Image.open('reference/village.png').convert('RGB'))[::2,::2].astype(np.int32)
ref=(refrgb[...,0]<<16)|(refrgb[...,1]<<8)|refrgb[...,2]
RH,RW=ref.shape; H,W=RH//16,RW//16
tiles=[]  # dict(name,id,c(16x16 int32),a(bool))
seen=set()
for name,path in SHEETS.items():
    im=np.asarray(Image.open(path).convert('RGBA')).astype(np.int32)
    cols=im.shape[1]//16
    for ty in range(im.shape[0]//16):
        for tx in range(cols):
            t=im[ty*16:ty*16+16,tx*16:tx*16+16]; a=t[...,3]>127
            if not a.any(): continue
            c=(t[...,0]<<16)|(t[...,1]<<8)|t[...,2]; c=np.where(a,c,-1)
            k=c.tobytes()
            if k in seen: continue
            seen.add(k); tiles.append(dict(sheet=name,id=ty*cols+tx,c=c,a=a,f=0))
            if name=='village' and ty*cols+tx in BRIDGE:
                for f in (D_|H_,D_|V_,H_,V_):
                    tiles.append(dict(sheet=name,id=ty*cols+tx,c=variant(c,f),a=variant(a,f),f=f))
def is_terrain(t): return t['f']==0 and (t['sheet'] in ('water','auto') or (t['sheet']=='village' and t['id']<TERRAIN_MAX))
# ---------- pass 1: terrain grid stack ----------
TT=[t for t in tiles if is_terrain(t)]
C=np.array([t['c'] for t in TT]).reshape(len(TT),-1); A=np.array([t['a'] for t in TT]).reshape(len(TT),-1)
opq=A.all(1)
ground=[[None]*W for _ in range(H)]
canvas=np.full((RH,RW),-1,np.int32)
for cy in range(H):
    for cx in range(W):
        cell=ref[cy*16:cy*16+16,cx*16:cx*16+16].reshape(-1)
        eq=C==cell; m=(eq&A).sum(1); e=(~eq&A).sum(1)
        base=np.where(opq)[0]; base=base[np.argsort(-m[base])][:5]
        sc=m-3*e; sc[opq]=-999; sc[m<4]=-999
        ov=np.argsort(-sc)[:10]; ov=ov[sc[ov]>-999]
        best=None
        for b in base:
            for k in range(3):
                for combo in itertools.permutations(ov,k):
                    good=eq[b].copy()
                    for o in combo: good=np.where(A[o],eq[o],good)
                    key=(256-good.sum(),len(combo))
                    if best is None or key<best[0]: best=(key,[b,*combo])
        st=best[1]; px=C[st[0]].copy()
        for o in st[1:]: px=np.where(A[o],C[o],px)
        canvas[cy*16:cy*16+16,cx*16:cx*16+16]=px.reshape(16,16)
        ground[cy][cx]=[[TT[i]['sheet'],TT[i]['id']] for i in st]; groundw=None
print('terrain acc',(canvas==ref).mean())
# ---------- pass 2: free-placed objects (positions may be negative => edge-clipped) ----------
OT=[t for t in tiles if not (t['sheet']=='water')]
U=canvas!=ref
M=16
REF=np.full((RH+2*M,RW+2*M),-2,np.int32); REF[M:M+RH,M:M+RW]=ref
UP=np.zeros_like(REF,bool); UP[M:M+RH,M:M+RW]=U
PH,PW=RH+M,RW+M   # positions px in [-M, RW) -> index px+M
cands=[]; t0=time.time()
for ti,t in enumerate(OT):
    ys,xs=np.nonzero(t['a']); n=len(ys)
    if n<16: continue
    cnt=np.zeros((PH,PW),np.int16); newc=np.zeros((PH,PW),np.int16)
    for y,x in zip(ys,xs):
        hit=REF[y:y+PH,x:x+PW]==t['c'][y,x]
        cnt+=hit; newc+=hit&UP[y:y+PH,x:x+PW]
    # visible opaque pixel count per position (for edge-clipped placements)
    ok=(newc>=8)&(cnt>=16)
    yy,xx=np.nonzero(ok)
    for y,x in zip(yy,xx):
        vis=t['a'][max(0,M-y):max(0,min(16,M+RH-y)),max(0,M-x):max(0,min(16,M+RW-x))].sum()
        if cnt[y,x]>=0.55*vis:
            cands.append((int(newc[y,x]),int(cnt[y,x]),n,ti,int(x)-M,int(y)-M))
print('cands',len(cands),'time',time.time()-t0)
def clip(t,x,y):
    x0=max(0,x);y0=max(0,y);x1=min(RW,x+16);y1=min(RH,y+16)
    return x0,y0,x1,y1,t['c'][y0-y:y1-y,x0-x:x1-x],t['a'][y0-y:y1-y,x0-x:x1-x]
cands.sort(key=lambda c:(-c[0],-c[1]))
explained=~U.copy(); placed=[]
# people in the reference (become NPC spawns) - don't try to explain their pixels
CHAR_BOXES=[(143,28,161,54),(54,210,74,238)]
care=np.ones_like(explained)
for x0,y0,x1,y1 in CHAR_BOXES: explained[y0:y1,x0:x1]=True; care[y0:y1,x0:x1]=False
for newc,cnt,n,ti,x,y in cands:
    x0,y0,x1,y1,tc,ta=clip(OT[ti],x,y)
    sub=ref[y0:y1,x0:x1]; good=ta&(sub==tc)
    gain=(good&~explained[y0:y1,x0:x1]).sum()
    if gain<6: continue
    bad=(ta&(sub!=tc)&explained[y0:y1,x0:x1]&care[y0:y1,x0:x1]).sum()
    if bad>gain: continue
    explained[y0:y1,x0:x1]|=good
    placed.append(dict(ti=ti,x=x,y=y))
print('placed',len(placed),'explained',explained.mean())
n=len(placed)
for p in placed:
    x0,y0,x1,y1,tc,ta=clip(OT[p['ti']],p['x'],p['y'])
    g=np.zeros((16,16),bool); g[y0-p['y']:y1-p['y'],x0-p['x']:x1-p['x']]=ta&(ref[y0:y1,x0:x1]==tc); p['good']=g
above=np.zeros((n,n),int)
for i in range(n):
    for j in range(i+1,n):
        a,b=placed[i],placed[j]
        dx=b['x']-a['x']; dy=b['y']-a['y']
        if abs(dx)>=16 or abs(dy)>=16: continue
        def sl(p,ox,oy): return (slice(max(0,oy),16+min(0,oy)),slice(max(0,ox),16+min(0,ox)))
        sa=sl(a,dx,dy); sb=sl(b,-dx,-dy)
        ta=OT[a['ti']]['a'][sa]; tb=OT[b['ti']]['a'][sb]; ga=a['good'][sa]; gb=b['good'][sb]
        both=ta&tb; va=(both&ga&~gb).sum(); vb=(both&gb&~ga).sum()
        if va>vb: above[i,j]=1
        elif vb>va: above[j,i]=1
order=sorted(range(n),key=lambda i:(above[i].sum()-above[:,i].sum(), placed[i]['y']))
for z,i in enumerate(order): placed[i]['z']=z
def mask_at(p):
    x0,y0,x1,y1,tc,ta=clip(OT[p['ti']],p['x'],p['y']); return tc,ta,x0,y0,x1,y1
# render
out=canvas.copy()
for i in order:
    tc,ta,x0,y0,x1,y1=mask_at(placed[i]); out[y0:y1,x0:x1]=np.where(ta,tc,out[y0:y1,x0:x1])
acc=(out==ref).mean(); print('final acc',acc)
def toimg(a): return Image.fromarray(np.stack([(a>>16)&255,(a>>8)&255,a&255],-1).astype(np.uint8))
toimg(out).resize((RW*2,RH*2),Image.NEAREST).save('cache/recon.png')
d=np.asarray(toimg(ref)).copy(); d[out!=ref]=[255,0,255]
Image.fromarray(d).resize((RW*2,RH*2),Image.NEAREST).save('cache/diff.png')
json.dump(dict(W=W,H=H,ground=ground,objects=[dict(sheet=OT[p['ti']]['sheet'],id=OT[p['ti']]['id'],f=OT[p['ti']]['f'],x=p['x'],y=p['y'],z=p['z']) for p in placed],acc=float(acc)),open('cache/recon.json','w'))
