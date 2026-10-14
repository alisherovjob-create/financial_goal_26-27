const assert=(v,m)=>{if(!v)throw new Error(m)};
let locked=false, failComment=false;
function makeSheet(cells){return {
  deleteRow:r=>cells.splice(r-1,1),
  cells,getParent:()=>book,getLastRow:()=>cells.length,
  getRange:(r,c,n=1,w=1)=>({
    getValues:()=>cells.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),
    setNumberFormat:()=>{},
    setValues:rows=>{assert(locked,'Write outside lock');rows.forEach((row,i)=>{cells[r-1+i]??=[];row.forEach((v,j)=>cells[r-1+i][c-1+j]=v);});},
    setRichTextValue:value=>{assert(locked,'Comment outside lock');if(failComment)throw new Error('Comment failure');cells[r-1][c-1]=value;}
  })
};}
const savings=makeSheet([['Date','Category','Planned','Actual','UpdatedAt'],['2026-10-23','Быт',50000,50000,new Date()]]);
let ledger=null;
const book={getSheetByName:name=>name==='Entries'?savings:ledger,getSpreadsheetTimeZone:()=> 'Europe/Moscow',insertSheet:()=>ledger=makeSheet([])};
const SpreadsheetApp={getActiveSpreadsheet:()=>book,flush:()=>assert(locked,'Flush unlocked'),newRichTextValue:()=>({setText:text=>({build:()=>text})})};
const SHEET_NAME='Entries';
const LockService={getScriptLock:()=>({waitLock:()=>{assert(!locked,'Nested lock');locked=true},hasLock:()=>locked,releaseLock:()=>locked=false})};
const ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})};
const Utilities={};
const original=JSON.stringify(savings.cells);
assert(doGet({parameter:{action:'expenses'}}).expenses.length===0,'Empty history');
let payload={action:'addExpense',id:'12345678-abcd-1234-5678',category:'Быт',amount:7000,comment:'=literal text',dates:['2026-10-23']};
const post=()=>doPost({postData:{contents:JSON.stringify(payload)}});
failComment=true;assert(!post().ok && ledger.cells.length===1,'Failed comment write rolls back');
failComment=false;assert(post().ok,'Save expense');
assert(post().ok && ledger.cells.length===2,'Retry must not duplicate');
assert(JSON.stringify(savings.cells)===original,'Savings unchanged');
assert(doGet({parameter:{action:'expenses'}}).expenses[0].Comment==='=literal text','Comment stored literally');
payload={...payload,id:'12345678-abcd-1234-5679',amount:44000};
assert(post().ok,'Allow expense above available balance');
assert(doGet({parameter:{action:'expenses'}}).expenses.reduce((sum,e)=>sum+e.Amount,0)===51000,'Expenses exceed unchanged savings');
payload.amount=-1;assert(!post().ok && !locked,'Reject negative and release lock');
payload.amount=1.5;assert(!post().ok,'Reject fractional rubles');
payload={...payload,id:'12345678-abcd-1234-5681',amount:43000};assert(post().ok,'Allow further expense with negative balance');
payload={...payload,id:'12345678-abcd-1234-5680',amount:1};assert(post().ok,'Allow expense when already overdrawn');
assert(JSON.stringify(savings.cells)===original,'Overdraft must leave savings unchanged');
return 'PASS: server isolated ledger, idempotency, exact balance, overdraft, validation, literal comments, locking';
