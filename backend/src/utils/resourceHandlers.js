import { getSupabaseWithUser } from '../services/supabase.js';
import { generatePresignedUrl, deleteFile } from '../services/s3.js';

/**
 * Build a GET /:id route handler that fetches an owned record and returns it
 * with a presigned download URL. Used by the document/plan upload routes, which
 * share identical fetch/ownership/presign logic.
 *
 * @param {Object} config
 * @param {string} config.table - Supabase table name
 * @param {string} config.ownerField - Column holding the owning user id (e.g. 'uploaded_by', 'buyer_id')
 * @param {string} config.notFoundError - Message returned on 404
 * @param {string} config.retrieveError - Message returned on unexpected failure
 * @returns {Function} Express handler
 */
export const createGetByIdHandler = ({ table, ownerField, notFoundError, retrieveError }) =>
  async (req, res) => {
    try {
      const { id } = req.params;

      // Use user-scoped Supabase client to respect RLS
      const supabase = getSupabaseWithUser(req.userToken);

      const { data: record, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single();

      if (error || !record) {
        return res.status(404).json({ error: notFoundError });
      }

      // Check that the requesting user owns the record
      if (record[ownerField] !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Generate presigned URL for download if a file is attached
      let downloadUrl = null;
      if (record.file_path) {
        downloadUrl = await generatePresignedUrl(record.file_path, 3600);
      }

      res.json({
        ...record,
        download_url: downloadUrl,
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: retrieveError });
    }
  };

/**
 * Build a DELETE /:id route handler that verifies ownership, removes the S3
 * object (if any), then deletes the database record.
 *
 * @param {Object} config
 * @param {string} config.table - Supabase table name
 * @param {string} config.ownerField - Column holding the owning user id
 * @param {string} config.notFoundError - Message returned on 404
 * @param {string} config.deleteError - Message returned on delete failure
 * @param {string} config.successMessage - Message returned on success
 * @returns {Function} Express handler
 */
export const createDeleteHandler = ({ table, ownerField, notFoundError, deleteError, successMessage }) =>
  async (req, res) => {
    try {
      const { id } = req.params;

      // Use user-scoped Supabase client to respect RLS
      const supabase = getSupabaseWithUser(req.userToken);

      // Fetch the record to get file_path and verify ownership
      const { data: record, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !record) {
        return res.status(404).json({ error: notFoundError });
      }

      // Check ownership
      if (record[ownerField] !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Delete from S3 if a file is attached
      if (record.file_path) {
        await deleteFile(record.file_path);
      }

      // Delete from database
      const { error: dbDeleteError } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (dbDeleteError) {
        console.error('Error deleting from DB:', dbDeleteError);
        return res.status(500).json({ error: deleteError });
      }

      res.json({ message: successMessage });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: deleteError });
    }
  };
