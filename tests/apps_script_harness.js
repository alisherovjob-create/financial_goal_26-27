const assert = (value, message) => { if (!value) throw new Error(message); };
let locked = false, backup = null;
const header = ['Date','Category','Planned','Actual','UpdatedAt'];
let cells = [header,
  [new Date('2026-09-24T21:00:00Z'),'Быт',34300,100,new Date('2026-09-17T10:00:00Z')],
  ['2026-09-25','Быт',34300,200,new Date('2026-09-17T11:00:00Z')]
];
const sheet = {
  getParent: () => spreadsheet,
  getLastRow: () => cells.length,
  getRange: (row, col, count=1, width=1) => ({
    getValues: () => cells.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),
    setNumberFormat: () => {},
    setValues: values => {
      assert(locked, 'Writes must occur inside the lock');
      values.forEach((value,index)=>{ cells[row-1+index] ??= []; cells[row-1+index].splice(col-1,width,...value); });
    }
  }),
  copyTo: () => {
    assert(locked, 'Backup must be locked');
    backup=cells.map(row=>row.slice());
    return {setName:()=>{},getName:()=> 'backup'};
  },
  deleteRow: row => { assert(backup,'Backup must precede deleting duplicates'); cells.splice(row-1,1); }
};
const spreadsheet = {getSheetByName:()=>sheet,getSpreadsheetTimeZone:()=> 'Europe/Moscow'};
const SpreadsheetApp = {getActiveSpreadsheet:()=>spreadsheet,flush:()=>{assert(locked,'Flush must precede unlock')}};
const LockService = {getScriptLock:()=>({waitLock:()=>{assert(!locked,'Overlapping lock');locked=true},hasLock:()=>locked,releaseLock:()=>{locked=false}})};
const Utilities = {formatDate: date => {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=type=>parts.find(p=>p.type===type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}};
const ContentService = {MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})};
const SHEET_NAME='Entries';
const loaded=doGet();
assert(loaded.ok && loaded.entries.length===1 && loaded.entries[0].Actual===200,'GET should return latest duplicate');
assert(loaded.entries[0].Date==='2026-09-25','GET should format in sheet timezone');
const cleaned=deduplicateEntries();
assert(cleaned.removed===1 && cells.length===2 && backup.length===3,'Cleanup must back up and keep latest');
assert(cells[1][3]===200,'Cleanup must not add amounts');
const post=(date,actual)=>doPost({postData:{contents:JSON.stringify({date,category:'Быт',planned:34300,actual})}});
assert(post('2026-09-25',300).ok && post('2026-09-25',400).ok,'Repeated updates must succeed');
assert(cells.length===2 && cells[1][3]===400,'Repeated POST must not append');
assert(post('2026-10-09',0).ok && post('2026-10-09',0).ok,'Zero must be accepted');
assert(cells.length===3,'Retry on newly appended row must not duplicate it');
assert(!post('2026-10-09',-1).ok && !locked,'Invalid POST must reject without leaking lock');
// Old Date-typed cells must also match plain-string requests.
cells.push([new Date('2026-10-22T21:00:00Z'),'Быт',34300,1,new Date()]);
assert(post('2026-10-23',500).ok && cells.length===4 && cells[3][3]===500,'Date objects must match incoming date');
return 'PASS: server date normalization, latest duplicate, backup cleanup, idempotent POST, zero, validation and locking';
