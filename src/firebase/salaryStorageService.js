// Firebase Storage helpers for the Salary & OT module's payslip uploads
// (PRD section 16). Mirrors documentStorageService.js's structure closely
// (same validate/upload/delete shape) - the two differ only in path and
// which constants they validate against.
//
// Path: salary-payslips/{uid}/{recordId}/{fileName} - keep in sync with
// storage.rules' `match /salary-payslips/{uid}/{recordId}/{fileName}`
// block. recordId is the 'YYYY-MM' salary record id (see
// salaryRecordService.recordId()), so every month's payslip(s) group
// under that month's folder.
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './config';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB, same ceiling as My Documents

export function validatePayslipFile(file) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, reason: 'Unsupported file type. Please use a JPG, PNG or PDF file.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, reason: 'File is too large. Maximum size is 15MB.' };
  }
  return { valid: true };
}

/**
 * Uploads one payslip file and reports progress.
 * @param {string} userId
 * @param {string} recordId - the 'YYYY-MM' salary record this payslip belongs to
 * @param {{ uri: string, type: string, size: number, name?: string }} file
 * @param {(progressPct: number) => void} [onProgress]
 * @returns {Promise<{ url:string, storagePath:string, fileType:string, fileSize:number, uploadedAt:number }>}
 */
export async function uploadPayslip(userId, recordId, file, onProgress) {
  if (!userId) throw new Error('Not authenticated');

  const check = validatePayslipFile(file);
  if (!check.valid) throw new Error(check.reason);

  const fallbackExt = file.type === 'application/pdf' ? 'pdf' : 'jpg';
  const fileName = (file.name || `${Date.now()}.${fallbackExt}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `salary-payslips/${userId}/${recordId}/${Date.now()}-${fileName}`;
  const storageRef = ref(storage, storagePath);

  const response = await fetch(file.uri);
  const blob = await response.blob();

  const task = uploadBytesResumable(storageRef, blob, { contentType: file.type });

  await new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
        onProgress?.(pct);
      },
      reject,
      resolve
    );
  });

  const url = await getDownloadURL(storageRef);

  return {
    url,
    storagePath,
    fileType: file.type,
    fileSize: file.size,
    uploadedAt: Date.now(),
  };
}

export async function deletePayslip(storagePath) {
  if (!storagePath) return;
  await deleteObject(ref(storage, storagePath)).catch(() => {
    // Swallow (e.g. already-deleted object), same as documentStorageService.deleteFiles().
  });
}
