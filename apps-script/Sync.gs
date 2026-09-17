// Replace the existing functions with this file's contents.
// Keep your existing const SHEET_NAME = '...'; in the Apps Script project.
// Expected columns A:E: Date, Category, Planned, Actual, UpdatedAt.
function getEntriesSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Лист "${SHEET_NAME}" не найден`);
  const headers = sheet.getRange(1, 1, 1, 5).getValues()[0];
  if (headers.join('|') !== 'Date|Category|Planned|Actual|UpdatedAt') {
    throw new Error('Ожидаются столбцы Date, Category, Planned, Actual, UpdatedAt в A:E');
  }
  return sheet;
}
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function entryDate_(value, timeZone) {
  if (value instanceof Date) return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text);
    if (Number.isFinite(date.getTime())) return Utilities.formatDate(date, timeZone, 'yyyy-MM-dd');
  }
  throw new Error('Некорректная дата в таблице');
}
function entries_(sheet) {
  const timeZone = sheet.getParent().getSpreadsheetTimeZone();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
    .map((row, index) => ({row, index: index + 2}))
    .filter(({row}) => row.some(value => value !== ''))
    .map(({row, index}) => ({
      index,
      Date: entryDate_(row[0], timeZone),
      Category: String(row[1]),
      Planned: Number(row[2]),
      Actual: Number(row[3]),
      UpdatedAt: row[4] instanceof Date ? row[4].toISOString() : String(row[4])
    }));
}
function entryKey_(entry) { return JSON.stringify([entry.Date, entry.Category]); }
function latestEntries_(entries) {
  const latest = new Map();
  entries.forEach(entry => {
    const key = entryKey_(entry), previous = latest.get(key);
    if (!previous || (Date.parse(entry.UpdatedAt) || 0) >= (Date.parse(previous.UpdatedAt) || 0)) latest.set(key, entry);
  });
  return latest;
}
function doGet() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const entries = Array.from(latestEntries_(entries_(getEntriesSheet_())).values())
      .map(({index, ...entry}) => entry);
    return json_({ok: true, entries});
  } catch (error) { return json_({ok: false, error: error.message}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
        typeof body.category !== 'string' || !body.category.trim()) throw new Error('date и category обязательны');
    const planned = Number(body.planned), actual = Number(body.actual);
    if (!Number.isFinite(planned) || !Number.isFinite(actual) || planned < 0 || actual < 0) throw new Error('Некорректная сумма');
    // The lock covers lookup AND write: concurrent retries cannot append the same key.
    lock.waitLock(10000);
    const sheet = getEntriesSheet_();
    const matches = entries_(sheet).filter(entry => entry.Date === body.date && entry.Category === body.category);
    const row = [body.date, body.category, planned, actual, new Date()];
    if (matches.length) {
      // Until cleanup is run, keep existing duplicates consistent; never create new ones.
      matches.forEach(entry => {
        sheet.getRange(entry.index, 1).setNumberFormat('@');
        sheet.getRange(entry.index, 1, 1, 5).setValues([row]);
      });
    } else {
      const index = sheet.getLastRow() + 1;
      sheet.getRange(index, 1).setNumberFormat('@');
      sheet.getRange(index, 1, 1, 5).setValues([row]);
    }
    SpreadsheetApp.flush();
    return json_({ok: true});
  } catch (error) { return json_({ok: false, error: error.message}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
// Run once manually from the Apps Script editor. Not exposed through the API.
// Copies the entire sheet before removing older duplicates. Amounts are NOT summed.
function deduplicateEntries() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getEntriesSheet_(), entries = entries_(sheet), latest = latestEntries_(entries);
    const obsolete = entries.filter(entry => latest.get(entryKey_(entry)).index !== entry.index);
    if (!obsolete.length) return {removed: 0};
    const backup = sheet.copyTo(sheet.getParent());
    backup.setName('Entries_backup_' + Date.now());
    obsolete.sort((a, b) => b.index - a.index).forEach(entry => sheet.deleteRow(entry.index));
    SpreadsheetApp.flush();
    return {removed: obsolete.length, backup: backup.getName()};
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
