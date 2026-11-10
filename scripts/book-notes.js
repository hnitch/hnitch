import { createHash } from 'node:crypto';
const fields = book => [String(book.bookId), book.title || '', book.author || '', book.review || ''];
const hash = fields => createHash('sha256').update(JSON.stringify(fields)).digest('hex');

export function bookNoteKey(book) {
 return hash(fields(book));
}

export function findBookNote(book, notes) {
 if(!book.review?.trim())return undefined;
 const current=notes?.[bookNoteKey(book)];
 if(Array.isArray(current))return current;
 // Older entries also included the rating. Reuse them only for identical review text.
 for(const rating of new Set([book.rating??0,...Array.from({length:21},(_,i)=>i/4)])){
  const legacy=notes?.[hash([...fields(book),rating])];
  if(Array.isArray(legacy))return legacy;
 }
}
export function bookNotes(book) {
 const note = book.bookNote;
 return book.review && note?.key === bookNoteKey(book) && Array.isArray(note.labels) && note.labels.length <= 3 && new Set(note.labels).size === note.labels.length && note.labels.every(s => typeof s === 'string' && /^[a-z][a-z ,'-]{1,29}$/.test(s) && s.trim() === s) ? note.labels : [];
}
export function applyBookNotes(books, notes) {
 for(const book of [books?.current, ...(books?.recent ?? [])]) {
  if(!book) continue;
  delete book.bookNote;
  const key=bookNoteKey(book);
  const labels=findBookNote(book,notes);
  if(labels) book.bookNote={key,labels};
  if(!bookNotes(book).length) delete book.bookNote;
 }
}
