import {randomUUID} from "node:crypto";
import {load} from 'cheerio';
import confirmedRatings from '../data/book-ratings.json' with {type:'json'};

export function goodreadsReview(text) {
 const review = typeof text === 'string' ? text.trim() : '';
 if (/^(?:r\.?t\.?c|review (?:to come|pending|coming soon))[\s.…]*$/i.test(review)) {
  return { review: '', reviewPlaceholder: review };
 }
 return { review };
}

// Only use explicit first-person ratings for this book. Other numbers in the
// review can describe earlier books, an imagined score, or the community rating.
export function statedFractionalRating(review, fullStars) {
 const statements = /\b(?:i(?:'m| am) (?:keeping this(?: book)? at|giving this(?: book)?)|my (?:final|overall) rating(?: for this book)? is) (\d+\.(?:25|50?|75))(?=\s*(?:stars?\b|\/\s*5\b|rather than giving it the full five stars\b))/gi;
 const scores = new Set([...review.replace(/’/g, "'").matchAll(statements)].map(match => Number(match[1])));
 if(scores.size!==1)return null;
 const [rating]=scores;
 return rating>fullStars&&rating<fullStars+1?rating:null;
}

// The public profile still exposes complete reviews when its RSS routes are unavailable.
// Only reuse metadata for known editions; missing evidence must never clear a shelf.
export function parsePublicGoodreads(profileHtml, updatesHtml, previous, metadata = []) {
 const profile=load(profileHtml), updates=load(updatesHtml);
 const shelf=profile('#shelves a[href*="shelf=currently-reading"]').text();
 const count=Number(shelf.match(/\((\d+)\)/)?.[1] ?? NaN);
 if(!Number.isFinite(count)||!updates('table.newsfeedUpdates').length)throw Error('Goodreads public fallback did not contain a valid shelf and updates');
 const known=new Map([...metadata,previous?.current,...(previous?.recent||[])].filter(Boolean).map(b=>[b.bookId,b]));
 let current=null;
 if(count>0){
  const heading=profile('#currentlyReadingReviews').length?profile('#currentlyReadingReviews'):updates('h2').filter((_,el)=>/currently reading/i.test(updates(el).text())).first().closest('.bigBox');
  const id=heading.find('a[href*="/book/show/"]').first().attr('href')?.match(/\/book\/show\/(\d+)/)?.[1];
  if(!id||!known.has(id))throw Error('Goodreads current edition needs fresh metadata; retaining last good snapshot');
  current={...known.get(id)};
  if(previous?.current?.bookId!==id){
   delete current.progress;
   current.dateAdded='';
   current.readingSessionId=randomUUID();
  } else if(!Number.isFinite(Date.parse(current.dateAdded))&&!current.readingSessionId){
   current.readingSessionId=randomUUID();
  }
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
  // p6 describes the icon fill, not the reader's exact fractional score.
  const values={'0':0,'6':0.6,'10':1};
  if(stars.length!==5||stars.some(s=>!(s in values)))throw Error('Goodreads rating could not be read precisely');
  const iconRating=stars.reduce((sum,s)=>sum+values[s],0);
  const footer=(reviewRow.length?reviewRow:row).next('tr.feedFooterReview');
  const reviewId=reviewRow.find('[id^="reviewTextContainer"]').attr('id')?.match(/^reviewTextContainer(\d+)$/)?.[1]
   ?? footer.attr('id')?.match(/^update_comment_stuff_Review(\d+)$/)?.[1];
  const confirmed=confirmedRatings[reviewId];
  const trusted=confirmed?.bookId===id?confirmed.rating:book.ratingSource==='numeric-feed'?book.rating:null;
  const fullStars=stars.filter(s=>s==='10').length;
  const compatible=Number.isFinite(trusted)&&trusted>fullStars&&trusted<fullStars+1&&Number.isInteger(trusted*4);
  const stated=stars.includes('6')?statedFractionalRating(review,fullStars):null;
  const rating=stars.includes('6')?(stated??(compatible?trusted:null)):iconRating;
  const ratingSource=stars.includes('6')?(stated!==null?'review-text':compatible?(confirmed?.bookId===id?'confirmed':'numeric-feed'):'unavailable'):'public-stars';
  const { progress, reviewPlaceholder, displayRating, ...metadata } = book;
  recent.push({
   ...metadata,
   rating,
   ratingSource,
   ...(rating === null ? { displayRating: iconRating } : {}),
   ...goodreadsReview(review),
   link: reviewId ? `https://www.goodreads.com/review/show/${reviewId}` : `https://www.goodreads.com/book/show/${id}`,
   readAt: book.readAt || row.attr('data-timestamp') || '',
  });
 });
 if(!recent.length)throw Error('No own reviews found in Goodreads public fallback');
 for(const book of previous?.recent||[])if(!recent.some(b=>b.bookId===book.bookId)&&book.bookId!==current?.bookId)recent.push(book);
 return {current,recent:recent.slice(0,4)};
}

export function fallbackBookIds(profileHtml, updatesHtml) {
 const p=load(profileHtml), u=load(updatesHtml);
 const ids=p('#currentlyReadingReviews .bookTitle').toArray().map(e=>p(e).attr('href')?.match(/\/book\/show\/(\d+)/)?.[1]);
 u('tr.update').each((_,e)=>{const row=u(e),action=row.find('.updateAction').first();if(/^haarshaan\s+rated a book/.test(action.text().trim())&&action.find('a[href*="/user/show/178629903"]').length)ids.push(row.find('.bookTitle').attr('href')?.match(/\/book\/show\/(\d+)/)?.[1]);});
 return [...new Set(ids.filter(Boolean))].slice(0,8);
}
export function parseEdition(html, id) {
 const $ = load(html);
 const data = JSON.parse($('#__NEXT_DATA__').text() || '{}');
 const state = data.props?.pageProps?.apolloState || {};
 const book = Object.values(state).find(b => b?.__typename === 'Book' && String(b.legacyId) === String(id) && b.title);
 const author = state[book?.primaryContributorEdge?.node?.__ref]?.name;
 if (!book || !author) throw Error('Goodreads edition metadata missing or mismatched');

 // Goodreads keeps the community average on the work shared by its editions.
 const work = state[book.work?.__ref];
 const structured = $('script[type="application/ld+json"]').toArray().map(element => {
  try { return JSON.parse($(element).text()); }
  catch { return null; }
 }).find(record => record?.['@type'] === 'Book'
  && (record.name === book.title || record.name === book.titleComplete));
 const averageRating = [work?.stats?.averageRating, structured?.aggregateRating?.ratingValue]
  .map(Number).find(rating => rating > 0 && rating <= 5) ?? null;
 const publicationTime = book.details?.publicationTime;
 const date = new Date(publicationTime || NaN);
 const published = Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) : '';

 return {
  bookId: String(id), title: book.title, author, link: book.webUrl, rating: 0,
  cover: book.imageUrl, pages: Number(book.details?.numPages || structured?.numberOfPages) || null,
  averageRating, published, dateAdded: '', readAt: '', review: '',
 };
}

export async function publicGoodreads(profile, updates, previous, readEdition) {
 const known = new Set([previous?.current, ...(previous?.recent || [])].filter(Boolean).map(book => String(book.bookId)));
 const metadata = await Promise.all(fallbackBookIds(profile, updates).filter(id => !known.has(id)).map(readEdition));
 return parsePublicGoodreads(profile, updates, previous, metadata);
}

function hasPublicationMonth(value) {
 const published = String(value || '').trim();
 return Boolean(published) && !/^\d{4}$/.test(published) && Number.isFinite(Date.parse(published));
}

export async function refreshGoodreadsMetadata(books, previous, readEdition, { checks = {}, now = new Date() } = {}) {
 const known = new Map([previous?.current, ...(previous?.recent || [])].filter(Boolean).map(book => [book.bookId, book]));
 const metadataChecks = {};
 const refresh = async book => {
  if (!book || !/^\d+$/.test(book.bookId)) return book;
  const { bookId } = book;
  const cached = known.get(bookId);
  const details = {
   averageRating: book.averageRating || cached?.averageRating || null,
   published: hasPublicationMonth(cached?.published) ? cached.published : book.published || cached?.published || '',
  };
  const hours = details.averageRating && hasPublicationMonth(details.published) ? 24 : 1;
  const lastCheck = checks[bookId];
  if (now - Date.parse(lastCheck) < hours * 60 * 60_000) {
   metadataChecks[bookId] = lastCheck;
  } else {
   metadataChecks[bookId] = now.toISOString();
   try {
    const edition = await readEdition(bookId);
    details.averageRating = edition.averageRating || details.averageRating;
    details.published = edition.published || details.published;
   } catch (error) {
    console.warn(`warning: Goodreads metadata for ${bookId} unavailable (${error.message})`);
   }
  }
  return { ...book, ...details };
 };
 const [current, ...recent] = await Promise.all([books.current, ...books.recent].map(refresh));
 return { data: { current, recent }, metadataChecks };
}
