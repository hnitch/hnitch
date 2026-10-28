import test from 'node:test';
import assert from 'node:assert/strict';
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
