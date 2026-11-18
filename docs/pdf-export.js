import {PDFDocument,rgb} from './vendor/pdf-lib.min.js';
import './vendor/fontkit.min.js';
import fontData from './vendor/DejaVuSans.js';

export async function exportPdf(title,tables) {
  const document=await PDFDocument.create();document.registerFontkit(globalThis.fontkit);
  const bytes=Uint8Array.from(atob(fontData),character=>character.charCodeAt(0));
  const font=await document.embedFont(bytes,{subset:true});
  document.setTitle(title);document.setAuthor('MPAdmin – smyšlená ukázka');
  const margin=28,width=842,height=595,size=8,lineHeight=11,available=width-margin*2;
  let page,y;
  const newPage=()=>{
    page=document.addPage([width,height]);y=height-margin;
    page.drawText(title,{x:margin,y:y-14,size:14,font});y-=35;
    page.drawText('MPAdmin · Smyšlená ukázková data',{x:margin,y:13,size:8,font,color:rgb(.4,.4,.4)});
  };
  const clean=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').replaceAll('\u00a0',' ');
  function wrap(value,cellWidth){
    const result=[];let line='';
    for(const character of clean(value)){
      if(font.widthOfTextAtSize(line+character,size)>cellWidth-8&&line){result.push(line);line='';}
      line+=character;
    }
    result.push(line);return result;
  }
  newPage();
  for(const rows of tables){
    if(!rows.length)continue;
    const count=Math.max(...rows.map(row=>row.length));if(!count)continue;
    if(y<margin+35)newPage();
    const weights=Array.from({length:count},(_,index)=>Math.min(45,Math.max(10,...rows.map(row=>clean(row[index]).length))));
    const total=weights.reduce((a,b)=>a+b,0),widths=weights.map(weight=>available*weight/total);
    const draw=(row,header=false)=>{
      const cells=widths.map((cellWidth,index)=>wrap(row[index],cellWidth));
      let offset=0;const lines=Math.max(...cells.map(cell=>cell.length));
      while(offset<lines){
        const capacity=Math.max(1,Math.floor((y-margin-8)/lineHeight));
        const take=Math.min(lines-offset,capacity),rowHeight=take*lineHeight+8;
        if(y-rowHeight<margin){newPage();continue;}
        let x=margin;
        for(let i=0;i<count;i++){
          page.drawRectangle({x,y:y-rowHeight,width:widths[i],height:rowHeight,borderWidth:.4,borderColor:rgb(.65,.65,.65),color:header?rgb(.9,.93,.95):rgb(1,1,1)});
          for(let line=0;line<take;line++)if(cells[i][offset+line])page.drawText(cells[i][offset+line],{x:x+4,y:y-12-line*lineHeight,size,font});
          x+=widths[i];
        }
        y-=rowHeight;offset+=take;if(offset<lines)newPage();
      }
    };
    draw(rows[0],true);
    for(const row of rows.slice(1)){if(y<margin+35){newPage();draw(rows[0],true);}draw(row);}
    y-=18;
  }
  const pages=document.getPages();pages.forEach((page,index)=>page.drawText(`${index+1} / ${pages.length}`,{x:width-margin-45,y:13,size:8,font}));
  const output=await document.save();const url=URL.createObjectURL(new Blob([output],{type:'application/pdf'}));
  const link=Object.assign(globalThis.document.createElement('a'),{href:url,download:title.replace(/[<>:"/\\|?*]/g,'-')+'.pdf'});link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
