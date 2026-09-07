// My Documents module - shared constants.
//
// Plain JS, matching project conventions. Lives in src/data alongside the
// app's other static reference data (countries.js, operatorBrand.js, etc).

export const DOCUMENT_TYPES = {
  PASSPORT: 'passport',
  WORK_PERMIT: 'work_permit',
  VISA: 'visa',
  EMPLOYMENT_CONTRACT: 'employment_contract',
  FOMEMA: 'fomema',
  INSURANCE: 'insurance',
  DRIVING_LICENCE: 'driving_licence',
  MEDICAL: 'medical',
  PAYSLIP: 'payslip',
  BANK: 'bank',
  PASSPORT_PHOTO: 'passport_photo',
  OTHER: 'other',
};

export const DOCUMENT_TYPE_LABELS = {
  [DOCUMENT_TYPES.PASSPORT]: 'Passport',
  [DOCUMENT_TYPES.WORK_PERMIT]: 'Work Permit / PLKS',
  [DOCUMENT_TYPES.VISA]: 'Visa',
  [DOCUMENT_TYPES.EMPLOYMENT_CONTRACT]: 'Employment Contract',
  [DOCUMENT_TYPES.FOMEMA]: 'FOMEMA',
  [DOCUMENT_TYPES.INSURANCE]: 'Insurance',
  [DOCUMENT_TYPES.DRIVING_LICENCE]: 'Driving Licence',
  [DOCUMENT_TYPES.MEDICAL]: 'Medical Documents',
  [DOCUMENT_TYPES.PAYSLIP]: 'Payslip',
  [DOCUMENT_TYPES.BANK]: 'Bank Documents',
  [DOCUMENT_TYPES.PASSPORT_PHOTO]: 'Passport Photo',
  [DOCUMENT_TYPES.OTHER]: 'Other Documents',
};

export const DOCUMENT_TYPE_ICONS = {
  [DOCUMENT_TYPES.PASSPORT]: '🛂',
  [DOCUMENT_TYPES.WORK_PERMIT]: '📄',
  [DOCUMENT_TYPES.VISA]: '🛃',
  [DOCUMENT_TYPES.EMPLOYMENT_CONTRACT]: '📝',
  [DOCUMENT_TYPES.FOMEMA]: '🏥',
  [DOCUMENT_TYPES.INSURANCE]: '🛡️',
  [DOCUMENT_TYPES.DRIVING_LICENCE]: '🚗',
  [DOCUMENT_TYPES.MEDICAL]: '💊',
  [DOCUMENT_TYPES.PAYSLIP]: '💵',
  [DOCUMENT_TYPES.BANK]: '🏦',
  [DOCUMENT_TYPES.PASSPORT_PHOTO]: '🖼️',
  [DOCUMENT_TYPES.OTHER]: '📁',
};

// Types that support multiple pages/images per document.
export const MULTI_PAGE_TYPES = [
  DOCUMENT_TYPES.PASSPORT,
  DOCUMENT_TYPES.EMPLOYMENT_CONTRACT,
  DOCUMENT_TYPES.MEDICAL,
  DOCUMENT_TYPES.INSURANCE,
];

export const DOCUMENT_STATUS = {
  VALID: 'valid',
  EXPIRING_SOON: 'expiring_soon',
  EXPIRED: 'expired',
  NOT_ADDED: 'not_added',
};

export const STATUS_LABELS = {
  [DOCUMENT_STATUS.VALID]: 'Valid',
  [DOCUMENT_STATUS.EXPIRING_SOON]: 'Expiring Soon',
  [DOCUMENT_STATUS.EXPIRED]: 'Expired',
  [DOCUMENT_STATUS.NOT_ADDED]: 'Not Added',
};

// Semantic status colors - intentionally independent of the brand theme
// (teal/blue) since these map to universal valid/warning/error meaning.
export const STATUS_COLORS = {
  [DOCUMENT_STATUS.VALID]: '#2E7D32',
  [DOCUMENT_STATUS.EXPIRING_SOON]: '#E58A00',
  [DOCUMENT_STATUS.EXPIRED]: '#C62828',
  [DOCUMENT_STATUS.NOT_ADDED]: '#9E9E9E',
};

export const DEFAULT_REMINDER_OFFSETS = [90, 30, 7, 1];

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB per file

/**
 * @typedef {Object} DocumentFile
 * @property {string} url - resolved download URL
 * @property {string} storagePath - canonical Storage path, used for delete/replace
 * @property {string} fileType - one of ALLOWED_MIME_TYPES
 * @property {number} fileSize - bytes
 * @property {number} uploadedAt - epoch millis
 */

/**
 * @typedef {Object} ReminderSettings
 * @property {boolean} enabled
 * @property {number[]} offsets - days-before-expiry, e.g. [90, 30, 7, 1]
 */

/**
 * @typedef {Object} AppDocument
 * @property {string} id
 * @property {string} userId
 * @property {string} documentType - one of DOCUMENT_TYPES
 * @property {string} documentName
 * @property {string} [documentNumber]
 * @property {number|null} [issueDate] - epoch millis
 * @property {number|null} [expiryDate] - epoch millis
 * @property {DocumentFile[]} files
 * @property {string} [notes]
 * @property {ReminderSettings} reminderSettings
 * @property {string} status - one of DOCUMENT_STATUS
 * @property {number} createdAt
 * @property {number} updatedAt
 */
