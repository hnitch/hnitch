import { createHash } from 'node:crypto';
export function bookNoteKey(book) {
 return createHash('sha256').update(JSON.stringify([String(book.bookId), book.title || '', book.author || '', book.review || '', book.rating ?? 0])).digest('hex');
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
  if(Array.isArray(notes?.[key])) book.bookNote={key,labels:notes[key]};
  if(!bookNotes(book).length) delete book.bookNote;
 }
}
