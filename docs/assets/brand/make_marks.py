#!/usr/bin/env python3
"""Regenerate local SVG assets; fonttools is build-only, cairosvg optional for PNG."""
from pathlib import Path
import argparse,html,json,xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
HERE=Path(__file__).resolve().parent
def lettering(text,font_path,size,x,y,color,tracking=0):
 font=TTFont(font_path);glyphs=font.getGlyphSet();cmap=font.getBestCmap();scale=size/font['head'].unitsPerEm;pen=SVGPathPen(glyphs);cursor=x
 for char in text:
  name=cmap[ord(char)];glyphs[name].draw(TransformPen(pen,(scale,0,0,-scale,cursor,y)));cursor+=font['hmtx'][name][0]*scale+tracking
 font.close();return f'<path fill="{color}" d="{pen.getCommands()}"/>',cursor-x

def svg(w,h,label,body,desc='Symbolic project identity; not a scientific result.'):
 return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc"><title id="title">{html.escape(label)}</title><desc id="desc">{html.escape(desc)}</desc>{body}</svg>\n'


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--png',action='store_true');p.add_argument('--font-dir',type=Path,default=Path('/usr/share/fonts/truetype/liberation'));args=p.parse_args()
 c=json.loads((HERE/'brand.json').read_text());e=ET.parse(HERE/'mark.svg').getroot();ns='{http://www.w3.org/2000/svg}';ET.register_namespace('','http://www.w3.org/2000/svg')
 body=''.join(ET.tostring(x,encoding='unicode') for x in e if x.tag not in {ns+'title',ns+'desc'})
 generate(HERE,c,body,args.font_dir,args.png)

def generate(directory,c,body,fonts,png):
 palette=c['palette'];name=c['prefix']+c['wordmark'];x=112
 prefix,advance=lettering(c['prefix'],fonts/'LiberationSans-BoldItalic.ttf',50,x,64,palette['orange'])
 word,width=lettering(c['wordmark'],fonts/'LiberationSans-Bold.ttf',50,x+advance,64,palette['blue'])
 if advance+width>372:
  size=50*372/(advance+width);prefix,advance=lettering(c['prefix'],fonts/'LiberationSans-BoldItalic.ttf',size,x,64,palette['orange']);word,width=lettering(c['wordmark'],fonts/'LiberationSans-Bold.ttf',size,x+advance,64,palette['blue'])
 sub,sw=lettering(c['subtitle'],fonts/'LiberationSans-Regular.ttf',10,x,94,palette['grey'],1.1)
 if sw>372:sub,_=lettering(c['subtitle'],fonts/'LiberationSans-Regular.ttf',10*372/sw,x,94,palette['grey'],0)
 artwork='<g transform="translate(8 10) scale(1.3125)">'+body+'</g>'+prefix+word+'<path d="M112 76H484" stroke="'+palette['grey']+'" stroke-width="0.8"/>'+sub
 assets={'icon.svg':svg(64,64,name+' icon',body),'logo.svg':svg(500,104,name,artwork),'banner.svg':svg(1200,250,name,'<g transform="translate(100 21) scale(2)">'+artwork+'</g>')}
 for filename,data in assets.items():(directory/filename).write_text(data)
 if png:
  import cairosvg
  for filename,size in [('icon.png',512),('favicon.png',64)]:cairosvg.svg2png(bytestring=assets['icon.svg'].encode(),write_to=str(directory/filename),output_width=size,output_height=size)
if __name__=='__main__':main()
