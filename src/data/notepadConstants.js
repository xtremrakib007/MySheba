// Notepad module constants - a private per-user notes space (see
// src/firebase/notepadService.js, NotepadScreen/AddNoteScreen/
// NoteDetailScreen). Two shapes share one collection: a plain GENERAL note
// (title + free text) and a "money note" (CREDIT / DEBIT / LOAN) for
// tracking who owes what - person, amount, dates, and a settled/pending
// status - so users can keep credit/debit/loan details alongside their
// regular notes instead of a separate module.

export const NOTE_TYPES = {
  GENERAL: 'general',
  CREDIT: 'credit',
  DEBIT: 'debit',
  LOAN: 'loan',
};

export const NOTE_TYPE_LABELS = {
  [NOTE_TYPES.GENERAL]: 'General Note',
  [NOTE_TYPES.CREDIT]: 'Credit (Money Given)',
  [NOTE_TYPES.DEBIT]: 'Debit (Money Received)',
  [NOTE_TYPES.LOAN]: 'Loan',
};

// Short label used on cards/chips where the full label above is too long.
export const NOTE_TYPE_SHORT_LABELS = {
  [NOTE_TYPES.GENERAL]: 'Note',
  [NOTE_TYPES.CREDIT]: 'Credit',
  [NOTE_TYPES.DEBIT]: 'Debit',
  [NOTE_TYPES.LOAN]: 'Loan',
};

export const NOTE_TYPE_ICONS = {
  [NOTE_TYPES.GENERAL]: '📝',
  [NOTE_TYPES.CREDIT]: '💰',
  [NOTE_TYPES.DEBIT]: '💳',
  [NOTE_TYPES.LOAN]: '🏦',
};

// Accent color per type - money-in (credit) green, money-out (debit) red,
// loan amber, general note the app's neutral blue. Matches theme.js tones
// rather than importing colors here, so this stays a plain data file.
export const NOTE_TYPE_COLORS = {
  [NOTE_TYPES.GENERAL]: '#1A73E8',
  [NOTE_TYPES.CREDIT]: '#2E7D32',
  [NOTE_TYPES.DEBIT]: '#C62828',
  [NOTE_TYPES.LOAN]: '#F9A825',
};

// The three "money note" flavors - same field shape (person, amount,
// dates, status), different semantics. Anything not in this list is a
// plain GENERAL note (title + content, no amount/status).
export const MONEY_NOTE_TYPES = [NOTE_TYPES.CREDIT, NOTE_TYPES.DEBIT, NOTE_TYPES.LOAN];

export const NOTE_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
};

export const NOTE_STATUS_LABELS = {
  [NOTE_STATUS.PENDING]: 'Pending',
  [NOTE_STATUS.PAID]: 'Settled',
};

// Filter chips on NotepadScreen - 'all' plus one per note type.
export const NOTE_FILTERS = ['all', NOTE_TYPES.GENERAL, NOTE_TYPES.CREDIT, NOTE_TYPES.DEBIT, NOTE_TYPES.LOAN];
