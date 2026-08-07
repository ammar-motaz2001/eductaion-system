'use strict';

const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { ROLES } = require('../../core/constants');
const storageService = require('../../services/storage');

const lessonRepository = require('./lesson.repository');
const collectionService = require('../collections/collection.service');

/**
 * Lesson material: one uploaded file per lesson, scoped to a collection.
 */
class LessonService extends BaseService {
  constructor({
    repository = lessonRepository,
    collections = collectionService,
    storage = storageService,
  } = {}) {
    super(repository, {
      resourceName: 'Lesson',
      searchableFields: ['lessonName', 'className', 'description'],
      filterableFields: [
        'collectionId:objectId',
        'className',
        'isPublished:boolean',
        'createdAt:date',
        { path: 'file.kind', type: 'string' },
      ],
      sortableFields: ['lessonName', 'className', 'order', 'createdAt', 'downloadCount'],
      defaultSort: { order: 1, createdAt: -1 },
      defaultPopulate: [
        { path: 'collectionId', select: 'name subject educationLevel' },
        { path: 'uploadedBy', select: 'fullName' },
      ],
    });
    this.collections = collections;
    this.storage = storage;
  }

  /** Map the friendly `?collection=` / `?fileKind=` params onto schema paths. */
  toQueryOptions(query = {}, baseFilter = {}) {
    const normalized = { ...query };
    if (normalized.collection) {
      normalized.collectionId = normalized.collection;
      delete normalized.collection;
    }
    if (normalized.fileKind) {
      normalized['file.kind'] = normalized.fileKind;
      delete normalized.fileKind;
    }
    return super.toQueryOptions(normalized, baseFilter);
  }

  /**
   * Create a lesson from an uploaded file.
   * The blob is removed again if the database write fails, so a rejected upload
   * cannot leave an orphan in storage.
   */
  async upload(payload, file, actorId) {
    if (!file) throw ApiError.badRequest('A lesson file is required');

    const collection = await this.collections.repository.findById(payload.collectionId);
    if (!collection) throw ApiError.notFound('Collection not found');

    const duplicate = await this.repository.exists({
      collectionId: payload.collectionId,
      lessonName: payload.lessonName,
    });
    if (duplicate) {
      throw ApiError.conflict('A lesson with this name already exists in this collection');
    }

    const stored = await this.storage.upload(file, {
      folder: `lessons/${payload.collectionId}`,
      kind: file.resolvedKind,
    });

    try {
      return await this.repository.create({ ...payload, file: stored, uploadedBy: actorId });
    } catch (error) {
      await this.storage.remove(stored);
      throw error;
    }
  }

  /** Update metadata and optionally swap the file. */
  async updateLesson(id, payload, file) {
    const lesson = await this.repository.findById(id);
    if (!lesson) throw ApiError.notFound('Lesson not found');

    if (payload.lessonName && payload.lessonName !== lesson.lessonName) {
      const duplicate = await this.repository.exists({
        collectionId: lesson.collectionId,
        lessonName: payload.lessonName,
        _id: { $ne: id },
      });
      if (duplicate) {
        throw ApiError.conflict('A lesson with this name already exists in this collection');
      }
    }

    const update = { ...payload };
    let replaced = null;

    if (file) {
      update.file = await this.storage.upload(file, {
        folder: `lessons/${lesson.collectionId}`,
        kind: file.resolvedKind,
      });
      replaced = lesson.file;
    }

    const updated = await this.repository.updateById(id, { $set: update });
    // Only discard the old blob once the new record is safely persisted.
    if (replaced) await this.storage.remove(replaced);

    return updated;
  }

  /** Soft-delete the record; the blob is retained so a restore stays possible. */
  async removeLesson(id, actorId) {
    const lesson = await this.repository.findById(id);
    if (!lesson) throw ApiError.notFound('Lesson not found');
    await this.repository.deleteById(id, actorId);
    return { id };
  }

  /** Permanently delete the record and its stored file. */
  async purgeLesson(id) {
    const lesson = await this.repository.findById(id, { includeDeleted: true });
    if (!lesson) throw ApiError.notFound('Lesson not found');
    await this.repository.hardDeleteById(id);
    await this.storage.remove(lesson.file);
    return { id, purged: true };
  }

  /** Lessons in a collection; students see published ones only. */
  async listForCollection(user, collectionId, query) {
    await this.collections.assertStudentHasAccess(user, collectionId);
    const baseFilter = { collectionId };
    if (user.role !== ROLES.INSTRUCTOR) baseFilter.isPublished = true;
    return this.list(query, baseFilter);
  }

  /**
   * Resolve a lesson for download, enforcing enrolment and counting the hit.
   * @returns {Promise<{lesson: object, downloadUrl: string, isLocal: boolean}>}
   */
  async prepareDownload(user, id) {
    const lesson = await this.repository.findById(id);
    if (!lesson) throw ApiError.notFound('Lesson not found');

    await this.collections.assertStudentHasAccess(user, lesson.collectionId);
    if (!lesson.isPublished && user.role !== ROLES.INSTRUCTOR) {
      throw ApiError.forbidden('This lesson has not been published yet');
    }

    await this.repository.incrementDownloads(id);
    const downloadUrl = await this.storage.getDownloadUrl(lesson.file);

    return { lesson, downloadUrl, isLocal: this.storage.isLocal() };
  }

  /** Guard reads of a single lesson. */
  async getForUser(user, id) {
    const lesson = await this.getById(id);
    const collectionId = lesson.collectionId?._id || lesson.collectionId;
    await this.collections.assertStudentHasAccess(user, collectionId);
    if (!lesson.isPublished && user.role !== ROLES.INSTRUCTOR) {
      throw ApiError.forbidden('This lesson has not been published yet');
    }
    return lesson;
  }
}

module.exports = new LessonService();
module.exports.LessonService = LessonService;
