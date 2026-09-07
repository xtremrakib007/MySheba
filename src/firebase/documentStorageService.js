// Firebase Storage helpers for the My Documents module.
//
// Path: my-documents/{uid}/{documentId}/{fileName} - keep in sync with
// storage.rules' `match /my-documents/{uid}/{documentId}/{fileName}` block.
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './config';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../data/documentConstants';

export function validateFile(file) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, reason: 'Unsupported file type. Please use a JPG, PNG, WEBP or PDF file.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, reason: 'File is too large. Maximum size is 15MB.' };
  }
  return { valid: true };
}

/**
 * Uploads one file (image or PDF) and reports progress.
 * @param {string} userId
 * @param {string} documentId - a client-generated temp id is fine for new documents
 * @param {{ uri: string, type: string, size: number, name?: string }} file
 * @param {(progressPct: number) => void} [onProgress]
 * @returns {Promise<import('../data/documentConstants').DocumentFile>}
 */
export async function uploadDocumentFile(userId, documentId, file, onProgress) {
  if (!userId) throw new Error('Not authenticated');

  const check = validateFile(file);
  if (!check.valid) throw new Error(check.reason);

  const fallbackExt = file.type === 'application/pdf' ? 'pdf' : 'jpg';
  const fileName = (file.name || `${Date.now()}.${fallbackExt}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `my-documents/${userId}/${documentId}/${Date.now()}-${fileName}`;
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

export async function uploadMultipleFiles(userId, documentId, files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    // Sequential (not Promise.all) so onProgress reflects one file at a
    // time and a single failure doesn't leave partial parallel uploads.
    const result = await uploadDocumentFile(userId, documentId, files[i], (pct) => onProgress?.(i, pct));
    results.push(result);
  }
  return results;
}

export async function deleteFile(storagePath) {
  await deleteObject(ref(storage, storagePath));
}

export async function deleteFiles(files) {
  await Promise.all(
    (files || []).map((f) =>
      deleteFile(f.storagePath).catch(() => {
        // Swallow individual failures (e.g. already-deleted object) so
        // one missing file doesn't block deleting the rest.
      })
    )
  );
}
