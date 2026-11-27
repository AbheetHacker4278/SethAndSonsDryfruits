import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { MongoDatabase } from '../db/mongo.ts';
import { requireAdmin, requireAuth } from '../middleware/security.ts';

const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'Note title is required.').max(120, 'Note title must be 120 characters or fewer.'),
  description: z.string().trim().max(2000, 'Description must be 2000 characters or fewer.').optional().default(''),
  pinned: z.boolean().optional().default(false),
  status: z.enum(['note', 'pending', 'done']).optional().default('note'),
});

const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1, 'Note title cannot be empty.').max(120, 'Note title must be 120 characters or fewer.').optional(),
    description: z.string().trim().max(2000, 'Description must be 2000 characters or fewer.').optional(),
    pinned: z.boolean().optional(),
    status: z.enum(['note', 'pending', 'done']).optional(),
  })
  .refine(
    data =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.pinned !== undefined ||
      data.status !== undefined,
    { message: 'At least one field is required to update a note.' }
  );

/** Isolated router providing per-admin persistent Quick Notes CRUD. */
export function createAdminQuickNotesRouter(db: MongoDatabase): Router {
  const router = Router();

  // Require an active authenticated administrator for all quick-note endpoints.
  router.use(requireAuth, requireAdmin);

  router.get('/', async (req, res) => {
    const adminId = String(req.user!.id);
    const notes = await db.models.AdminQuickNote.find({ adminId }, { _id: 0 })
      .sort({ pinned: -1, updatedAt: -1, createdAt: -1 })
      .lean();
    res.json({ notes });
  });

  router.post('/', async (req, res) => {
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid quick note input.' });
      return;
    }

    const now = new Date().toISOString();
    const doc = await db.models.AdminQuickNote.create({
      id: `qnote_${crypto.randomUUID()}`,
      adminId: String(req.user!.id),
      title: parsed.data.title,
      description: parsed.data.description,
      pinned: parsed.data.pinned,
      status: parsed.data.status,
      createdAt: now,
      updatedAt: now,
    });

    const plain = doc.toObject() as Record<string, unknown>;
    delete plain._id;
    res.status(201).json({ note: plain, message: 'Quick note created.' });
  });

  router.put('/:id', async (req, res) => {
    const noteId = String(req.params.id || '').trim();
    if (!noteId) {
      res.status(400).json({ error: 'Invalid note ID.' });
      return;
    }

    const parsed = updateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid quick note update.' });
      return;
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.pinned !== undefined) updates.pinned = parsed.data.pinned;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    // Filter by both note id and authenticated adminId to prevent cross-admin access.
    const updated = await db.models.AdminQuickNote.findOneAndUpdate(
      { id: noteId, adminId: String(req.user!.id) },
      { $set: updates },
      { returnDocument: 'after', projection: { _id: 0 } }
    ).lean();

    if (!updated) {
      res.status(404).json({ error: 'Quick note not found.' });
      return;
    }

    res.json({ note: updated, message: 'Quick note updated.' });
  });

  router.delete('/:id', async (req, res) => {
    const noteId = String(req.params.id || '').trim();
    if (!noteId) {
      res.status(400).json({ error: 'Invalid note ID.' });
      return;
    }

    const deleted = await db.models.AdminQuickNote.findOneAndDelete(
      { id: noteId, adminId: String(req.user!.id) },
      { projection: { _id: 0 } }
    ).lean();

    if (!deleted) {
      res.status(404).json({ error: 'Quick note not found.' });
      return;
    }

    res.json({ deletedId: noteId, message: 'Quick note deleted.' });
  });

  return router;
}
