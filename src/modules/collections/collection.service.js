'use strict';

const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { ROLES } = require('../../core/constants');

const collectionRepository = require('./collection.repository');
const collectionStudentRepository = require('../collection-students/collectionStudent.repository');
const studentRepository = require('../students/student.repository');

/**
 * Teaching-group (collection) management.
 */
class CollectionService extends BaseService {
  constructor({
    repository = collectionRepository,
    enrolments = collectionStudentRepository,
    students = studentRepository,
  } = {}) {
    super(repository, {
      resourceName: 'Collection',
      searchableFields: ['name', 'subject', 'description'],
      filterableFields: [
        'subject',
        'educationLevel',
        'isActive:boolean',
        'pricePerClass:number',
        'monthlySubscriptionPrice:number',
        'createdBy:objectId',
        'createdAt:date',
      ],
      sortableFields: [
        'name',
        'subject',
        'educationLevel',
        'pricePerClass',
        'monthlySubscriptionPrice',
        'studentsCount',
        'createdAt',
      ],
      defaultSort: { createdAt: -1 },
    });
    this.enrolments = enrolments;
    this.students = students;
  }

  /** Reject overlapping slots on the same weekday within one schedule. */
  static assertScheduleIsConsistent(schedule = []) {
    const byDay = new Map();
    for (const slot of schedule) {
      const slots = byDay.get(slot.day) || [];
      const overlaps = slots.some(
        (existing) => slot.startTime < existing.endTime && existing.startTime < slot.endTime
      );
      if (overlaps) {
        throw ApiError.badRequest(`Schedule slots overlap on ${slot.day}`);
      }
      slots.push(slot);
      byDay.set(slot.day, slots);
    }
  }

  async createCollection(payload, actorId) {
    CollectionService.assertScheduleIsConsistent(payload.schedule);

    const duplicate = await this.repository.exists({
      name: payload.name,
      subject: payload.subject,
      educationLevel: payload.educationLevel,
    });
    if (duplicate) {
      throw ApiError.conflict(
        'A collection with this name already exists for the same subject and education level'
      );
    }

    return this.repository.create({ ...payload, createdBy: actorId });
  }

  async updateCollection(id, payload) {
    if (payload.schedule) CollectionService.assertScheduleIsConsistent(payload.schedule);

    const existing = await this.repository.findById(id);
    if (!existing) throw ApiError.notFound('Collection not found');

    // Shrinking capacity below the current roster would leave it in an invalid state.
    if (payload.capacity != null && payload.capacity < existing.studentsCount) {
      throw ApiError.badRequest(
        `Capacity cannot be lower than the current enrolment of ${existing.studentsCount}`
      );
    }

    return this.repository.updateById(id, { $set: payload });
  }

  /**
   * Soft-delete a collection and detach it from every student.
   * Lessons, homework and attachments are retained and become reachable again
   * if the collection is restored.
   */
  async removeCollection(id, actorId) {
    const existing = await this.repository.findById(id);
    if (!existing) throw ApiError.notFound('Collection not found');

    await this.repository.deleteById(id, actorId);
    await this.enrolments.removeAllForCollection(id, actorId);
    await this.students.detachCollectionFromAll(id);

    return { id };
  }

  /** Collection with its live enrolment count and roster summary. */
  async getDetails(id) {
    const collection = await this.getById(id, {
      populate: { path: 'createdBy', select: 'fullName email' },
    });
    const studentsCount = await this.enrolments.countByCollection(id);

    // Self-heal the denormalised counter if it has drifted.
    if (studentsCount !== collection.studentsCount) {
      await this.repository.syncStudentsCount(id, studentsCount);
      collection.studentsCount = studentsCount;
    }

    return collection;
  }

  /** Collections visible to the caller — students see only their own. */
  async listForUser(user, query) {
    if (user.role === ROLES.INSTRUCTOR) return this.list(query);

    const student = await this.students.findByUserId(user._id, { select: '_id collections' });
    if (!student) throw ApiError.notFound('No student profile is linked to this account');
    return this.list(query, { _id: { $in: student.collections || [] } });
  }

  /** Assert a student is enrolled before letting them read collection content. */
  async assertStudentHasAccess(user, collectionId) {
    if (user.role === ROLES.INSTRUCTOR) return true;
    const student = await this.students.findByUserId(user._id, { select: '_id' });
    if (!student) throw ApiError.notFound('No student profile is linked to this account');
    const enrolled = await this.enrolments.isEnrolled(collectionId, student._id);
    if (!enrolled) throw ApiError.forbidden('You are not enrolled in this collection');
    return true;
  }

  async distinctSubjects() {
    return this.repository.distinctSubjects();
  }
}

module.exports = new CollectionService();
module.exports.CollectionService = CollectionService;
