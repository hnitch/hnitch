import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bookNoteKey,bookNotes,applyBookNotes} from './book-notes.js';
test('notes are bound to the exact book and review',()=>{
 const b={bookId:'1',title:'Book',review:'Loved the pacing.',rating:4};
 const key=bookNoteKey(b);applyBookNotes({recent:[b]},{[key]:['great pacing']});
 assert.deepEqual(bookNotes(b),['great pacing']);
 b.review='Changed my mind.';assert.deepEqual(bookNotes(b),[]);
 applyBookNotes({recent:[b]},{});assert.equal(b.bookNote,undefined);
});
test('invalid display notes stay hidden',()=>{
 const b={bookId:'2',review:'Review'};b.bookNote={key:bookNoteKey(b),labels:['<script>']};assert.deepEqual(bookNotes(b),[]);
});
test('a corrected rating preserves earlier notes without reusing them after a review edit',()=>{
 const b={bookId:'1',title:'Book',author:'Author',review:'Loved the pacing.',rating:4.75};
 const oldKey=createHash('sha256').update(JSON.stringify([b.bookId,b.title,b.author,b.review,0])).digest('hex');
 const notes={[oldKey]:['great pacing']};
 applyBookNotes({recent:[b]},notes);
 assert.deepEqual(bookNotes(b),['great pacing']);
 b.rating=4.5;
 assert.deepEqual(bookNotes(b),['great pacing']);
 b.review='The pacing dragged.';
 applyBookNotes({recent:[b]},notes);
 assert.deepEqual(bookNotes(b),[]);
});
