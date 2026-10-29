import {load} from 'cheerio';

// The public profile still exposes complete reviews when its RSS routes are unavailable.
// Only reuse metadata for known editions; missing evidence must never clear a shelf.
export function parsePublicGoodreads(profileHtml, updatesHtml, previous) {
 const profile=load(profileHtml), updates=load(updatesHtml);
 const shelf=profile('#shelves a[href*="shelf=currently-reading"]').text();
 const count=Number(shelf.match(/\((\d+)\)/)?.[1] ?? NaN);
 if(!Number.isFinite(count)||!updates('table.newsfeedUpdates').length)throw Error('Goodreads public fallback did not contain a valid shelf and updates');
 const known=new Map([previous?.current,...(previous?.recent||[])].filter(Boolean).map(b=>[b.bookId,b]));
 let current=null;
 if(count>0){
  const heading=updates('h2').filter((_,el)=>/currently reading/i.test(updates(el).text())).first().closest('.bigBox');
  const id=heading.find('a[href*="/book/show/"]').first().attr('href')?.match(/\/book\/show\/(\d+)/)?.[1];
  if(!id||!known.has(id))throw Error('Goodreads current edition needs fresh metadata; retaining last good snapshot');
  current={...known.get(id)};
 }
 const recent=[];
 updates('tr.update').each((_,el)=>{
  if(recent.length>=4)return;
  const row=updates(el),action=row.find('.updateAction').first();
  if(!/^haarshaan\s+rated a book/.test(action.text().trim()))return;
  if(!action.find('a[href*="/user/show/178629903"]').length)return;
  const id=row.find('.bookTitle').attr('href')?.match(/\/book\/show\/(\d+)/)?.[1];
  if(!id||id===current?.bookId||recent.some(b=>b.bookId===id))return;
  const book=known.get(id);
  if(!book)throw Error('Goodreads reviewed edition needs fresh metadata; retaining last good snapshot');
  const reviewRow=row.next('tr.update.no_border');
  const full=reviewRow.find('[id^="freeTextreview"]').first();
  const short=reviewRow.find('[id^="freeTextContainerreview"]').first();
  const text=full.length?full:short;
  if(!full.length&&reviewRow.find('[data-text-id]').length)throw Error('Goodreads review was truncated');
  const copy=text.clone();copy.find('br').replaceWith('\n');
  const review=copy.text().replace(/\s+/g,' ').trim();
  const stars=action.find('.staticStar').toArray().map(el=>updates(el).attr('class')?.match(/\bp(\d+)\b/)?.[1]);
  // p6 is Goodreads' half-star asset; unknown fractions fail closed.
  const values={'0':0,'6':0.5,'10':1};
  if(stars.length!==5||stars.some(s=>!(s in values)))throw Error('Goodreads rating could not be read precisely');
  const rating=stars.reduce((sum,s)=>sum+values[s],0);
  const reviewId=reviewRow.find('[id^="reviewTextContainer"]').attr('id')?.replace('reviewTextContainer','');
  if(!reviewId)return;
  const {progress,...metadata}=book;
  recent.push({...metadata,rating,review,link:`https://www.goodreads.com/review/show/${reviewId}`,readAt:book.readAt||row.attr('data-timestamp')||''});
 });
 if(!recent.length)throw Error('No own reviews found in Goodreads public fallback');
 for(const book of previous?.recent||[])if(!recent.some(b=>b.bookId===book.bookId)&&book.bookId!==current?.bookId)recent.push(book);
 return {current,recent:recent.slice(0,4)};
}
