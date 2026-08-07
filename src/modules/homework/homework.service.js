'use strict';

const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { ROLES } = require('../../core/constants');
const storageService = require('../../services/storage');

const homeworkRepository = require('./homework.repository');
const collectionService = require('../collections/collection.service');
const studentRepository = require('../students/student.repository');
const notificationService = require('../notifications/notification.service');

/**
 * Homework assignments, with optional attachments.
 */
class HomeworkService extends BaseService {
  constructor({
    repository = homeworkRepository,
    collections = collectionService,
    students = studentRepository,
    notifications = notificationService,
    storage = storageService,
  } = {}) {
    super(repository, {
      resourceName: 'Homework',
      searchableFields: ['title', 'description'],
      filterableFields: [
        'collectionId:objectId',
        'isPublished:boolean',
        'dueDate:date',
        'createdAt:date',
        'createdBy:objectId',
      ],
      sortableFields: ['dueDate', 'title', 'createdAt'],
      defaultSort: { dueDate: -1 },
      defaultPopulate: [
        { path: 'collectionId', select: 'name subject educationLevel' },
        { path: 'createdBy', select: 'fullName' },
      ],
    });
    this.collections = collections;
    this.students = students;
    this.notifications = notifications;
    this.storage = storage;
  }

  toQueryOptions(query = {}, baseFilter = {}) {
    const normalized = { ...query };
    if (normalized.collection) {
      normalized.collectionId = normalized.collection;
      delete normalized.collection;
    }
    return super.toQueryOptions(normalized, baseFilter);
  }

  /**
   * Create an assignment and notify every enrolled student when published.
   */
  async createHomework(payload, files = [], actorId) {
    const collection = await this.collections.repository.findById(payload.collectionId);
    if (!collection) throw ApiError.notFound('Collection not found');

    const attachments = files.length
      ? await this.storage.uploadMany(files, { folder: `homework/${payload.collectionId}` })
      : [];

    let homework;
    try {
      homework = await this.repository.create({
        ...payload,
        attachments,
        createdBy: actorId,
      });
    } catch (error) {
      await this.storage.removeMany(attachments);
      throw error;
    }

    if (homework.isPublished) {
      const studentUserIds = await this.students.findUserIdsByCollection(payload.collectionId);
      await this.notifications.newHomework({ homework, studentUserIds });
    }

    return homework;
  }

  async updateHomework(id, payload) {
    const existing = await this.repository.findById(id);
    if (!existing) throw ApiError.notFound('Homework not found');

    const updated = await this.repository.updateById(id, { $set: payload });

    // Publishing a previously hidden assignment is the moment students learn of it.
    if (payload.isPublished === true && existing.isPublished === false) {
      const studentUserIds = await this.students.findUserIdsByCollection(existing.collectionId);
      await this.notifications.newHomework({ homework: updated, studentUserIds });
    }

    return updated;
  }

  /** Add attachments to an existing assignment. */
  async addAttachments(id, files) {
    if (!files?.length) throw ApiError.badRequest('At least one file is required');
    const homework = await this.repository.findById(id);
    if (!homework) throw ApiError.notFound('Homework not found');

    const stored = await this.storage.uploadMany(files, {
      folder: `homework/${homework.collectionId}`,
    });

    try {
      return await this.repository.pushAttachments(id, stored);
    } catch (error) {
      await this.storage.removeMany(stored);
      throw error;
    }
  }

  /** Remove one attachment, identified by its storage key. */
  async removeAttachment(id, key) {
    const homework = await this.repository.findById(id);
    if (!homework) throw ApiError.notFound('Homework not found');

    const attachment = (homework.attachments || []).find((file) => file.key === key);
    if (!attachment) throw ApiError.notFound('Attachment not found on this assignment');

    const updated = await this.repository.pullAttachment(id, key);
    await this.storage.remove(attachment);
    return updated;
  }

  /** Soft-delete the assignment and discard its attachments. */
  async removeHomework(id, actorId) {
    const homework = await this.repository.findById(id);
    if (!homework) throw ApiError.notFound('Homework not found');
    await this.repository.deleteById(id, actorId);
    await this.storage.removeMany(homework.attachments || []);
    return { id };
  }

  /** Assignments for a collection; students see published ones only. */
  async listForCollection(user, collectionId, query) {
    await this.collections.assertStudentHasAccess(user, collectionId);
    const baseFilter = { collectionId };
    if (user.role !== ROLES.INSTRUCTOR) baseFilter.isPublished = true;
    return this.list(query, baseFilter);
  }

  /** Every assignment across the student's collections, newest deadline first. */
  async listForStudent(user, query) {
    const student = await this.students.findByUserId(user._id, { select: 'collections' });
    if (!student) throw ApiError.notFound('No student profile is linked to this account');
    return this.list(query, {
      collectionId: { $in: student.collections || [] },
      isPublished: true,
    });
  }

  async getForUser(user, id) {
    const homework = await this.getById(id);
    const collectionId = homework.collectionId?._id || homework.collectionId;
    await this.collections.assertStudentHasAccess(user, collectionId);
    if (!homework.isPublished && user.role !== ROLES.INSTRUCTOR) {
      throw ApiError.forbidden('This assignment has not been published yet');
    }
    return homework;
  }

  async listUpcoming(days) {
    return this.repository.findUpcoming(days);
  }
}

module.exports = new HomeworkService();
module.exports.HomeworkService = HomeworkService;
