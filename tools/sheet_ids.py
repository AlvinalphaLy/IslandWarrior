import sys
from PIL import Image, ImageDraw
src=sys.argv[1]; out=sys.argv[2]; S=int(sys.argv[3]); y0=int(sys.argv[4]); y1=int(sys.argv[5])
im=Image.open(src).convert('RGBA'); cols=im.width//16
crop=im.crop((0,y0*16,im.width,y1*16))
bg=Image.new('RGBA',crop.size,(255,0,255,255)); bg.alpha_composite(crop)
big=bg.resize((crop.width*S,crop.height*S),Image.NEAREST); d=ImageDraw.Draw(big)
for ty in range(y1-y0):
  for tx in range(cols):
    d.rectangle([tx*16*S,ty*16*S,(tx+1)*16*S-1,(ty+1)*16*S-1],outline=(0,0,0))
    d.text((tx*16*S+2,ty*16*S+1),str((ty+y0)*cols+tx),fill=(255,255,255),stroke_width=1,stroke_fill=(0,0,0))
big.save(out)
