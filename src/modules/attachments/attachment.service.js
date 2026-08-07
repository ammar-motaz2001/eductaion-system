'use strict';

const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { ROLES } = require('../../core/constants');
const storageService = require('../../services/storage');

const attachmentRepository = require('./attachment.repository');
const collectionService = require('../collections/collection.service');

/**
 * General files attached to a collection (syllabi, forms, reference sheets).
 */
class AttachmentService extends BaseService {
  constructor({
    repository = attachmentRepository,
    collections = collectionService,
    storage = storageService,
  } = {}) {
    super(repository, {
      resourceName: 'Attachment',
      searchableFields: ['name', 'description'],
      filterableFields: [
        'collectionId:objectId',
        'uploadedBy:objectId',
        'isVisibleToStudents:boolean',
        'uploadDate:date',
        { path: 'file.kind', type: 'string' },
      ],
      sortableFields: ['name', 'uploadDate', 'createdAt', 'downloadCount'],
      defaultSort: { uploadDate: -1 },
      defaultPopulate: [
        { path: 'collectionId', select: 'name subject' },
        { path: 'uploadedBy', select: 'fullName' },
      ],
    });
    this.collections = collections;
    this.storage = storage;
  }

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

  async upload(payload, file, actorId) {
    if (!file) throw ApiError.badRequest('A file is required');

    const collection = await this.collections.repository.findById(payload.collectionId);
    if (!collection) throw ApiError.notFound('Collection not found');

    const stored = await this.storage.upload(file, {
      folder: `attachments/${payload.collectionId}`,
      kind: file.resolvedKind,
    });

    try {
      return await this.repository.create({
        ...payload,
        // Fall back to the original filename when no display name was supplied.
        name: payload.name || file.originalname,
        file: stored,
        uploadedBy: actorId,
        uploadDate: new Date(),
      });
    } catch (error) {
      await this.storage.remove(stored);
      throw error;
    }
  }

  /** Update metadata and optionally replace the stored file. */
  async updateAttachment(id, payload, file) {
    const attachment = await this.repository.findById(id);
    if (!attachment) throw ApiError.notFound('Attachment not found');

    const update = { ...payload };
    let replaced = null;

    if (file) {
      update.file = await this.storage.upload(file, {
        folder: `attachments/${attachment.collectionId}`,
        kind: file.resolvedKind,
      });
      update.uploadDate = new Date();
      replaced = attachment.file;
    }

    const updated = await this.repository.updateById(id, { $set: update });
    if (replaced) await this.storage.remove(replaced);
    return updated;
  }

  /** Delete the record and its stored file. */
  async removeAttachment(id, actorId) {
    const attachment = await this.repository.findById(id);
    if (!attachment) throw ApiError.notFound('Attachment not found');
    await this.repository.deleteById(id, actorId);
    await this.storage.remove(attachment.file);
    return { id };
  }

  /** Attachments in a collection; students see visible ones only. */
  async listForCollection(user, collectionId, query) {
    await this.collections.assertStudentHasAccess(user, collectionId);
    const baseFilter = { collectionId };
    if (user.role !== ROLES.INSTRUCTOR) baseFilter.isVisibleToStudents = true;
    return this.list(query, baseFilter);
  }

  async prepareDownload(user, id) {
    const attachment = await this.repository.findById(id);
    if (!attachment) throw ApiError.notFound('Attachment not found');

    await this.collections.assertStudentHasAccess(user, attachment.collectionId);
    if (!attachment.isVisibleToStudents && user.role !== ROLES.INSTRUCTOR) {
      throw ApiError.forbidden('This attachment is not available to students');
    }

    await this.repository.incrementDownloads(id);
    const downloadUrl = await this.storage.getDownloadUrl(attachment.file);
    return { attachment, downloadUrl, isLocal: this.storage.isLocal() };
  }
}

module.exports = new AttachmentService();
module.exports.AttachmentService = AttachmentService;
