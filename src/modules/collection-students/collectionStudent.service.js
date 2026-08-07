'use strict';

const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { STUDENT_STATUS } = require('../../core/constants');
const { buildQueryOptions } = require('../../core/QueryOptions');

const collectionStudentRepository = require('./collectionStudent.repository');
const collectionRepository = require('../collections/collection.repository');
const studentRepository = require('../students/student.repository');

/**
 * Enrolment of students into collections.
 *
 * Membership is written in three places — the join collection (authoritative),
 * the student's cached `collections` array, and the collection's `studentsCount`.
 * This service is the only writer of all three, which is what keeps them
 * consistent in the absence of multi-document transactions.
 */
class CollectionStudentService extends BaseService {
  constructor({
    repository = collectionStudentRepository,
    collections = collectionRepository,
    students = studentRepository,
  } = {}) {
    super(repository, {
      resourceName: 'Enrolment',
      searchableFields: ['studentName'],
      filterableFields: [
        'collectionId:objectId',
        'student:objectId',
        'isActive:boolean',
        'enrolledAt:date',
      ],
      sortableFields: ['studentName', 'enrolledAt', 'createdAt'],
      defaultSort: { enrolledAt: -1 },
    });
    this.collections = collections;
    this.students = students;
  }

  /** Load a collection or fail — used to validate every nested route. */
  async #requireCollection(collectionId) {
    const collection = await this.collections.findById(collectionId);
    if (!collection) throw ApiError.notFound('Collection not found');
    return collection;
  }

  /**
   * Enrol a student.
   * @param {string} collectionId
   * @param {string} studentId
   * @param {string} actorId
   */
  async addStudent(collectionId, studentId, actorId, notes) {
    const collection = await this.#requireCollection(collectionId);

    const student = await this.students.findById(studentId);
    if (!student) throw ApiError.notFound('Student not found');
    if (student.status !== STUDENT_STATUS.ACTIVE) {
      throw ApiError.badRequest('Only approved (active) students can be enrolled');
    }

    const existing = await this.repository.findEnrolment(collectionId, studentId, {
      includeDeleted: true,
    });
    if (existing && !existing.deletedAt) {
      throw ApiError.conflict('This student is already enrolled in this collection');
    }

    if (collection.capacity !== null && collection.studentsCount >= collection.capacity) {
      throw ApiError.conflict(`This collection has reached its capacity of ${collection.capacity}`);
    }

    // Reuse a tombstoned row so the unique index is not violated by a re-enrolment.
    const enrolment = existing
      ? await this.repository.updateOne(
          { _id: existing._id },
          {
            $set: {
              deletedAt: null,
              deletedBy: null,
              isActive: true,
              enrolledAt: new Date(),
              addedBy: actorId,
              studentName: student.fullName,
              notes,
            },
          },
          { includeDeleted: true }
        )
      : await this.repository.create({
          collectionId,
          student: studentId,
          studentName: student.fullName,
          addedBy: actorId,
          notes,
        });

    await this.students.attachCollection(studentId, collectionId);
    await this.collections.adjustStudentsCount(collectionId, 1);

    return enrolment;
  }

  /** Enrol several students, reporting per-student outcomes. */
  async addStudents(collectionId, studentIds, actorId) {
    const results = { enrolled: [], skipped: [] };

    for (const studentId of studentIds) {
      try {
        // Sequential so capacity checks observe each preceding enrolment.
        // eslint-disable-next-line no-await-in-loop
        const enrolment = await this.addStudent(collectionId, studentId, actorId);
        results.enrolled.push({ student: studentId, enrolmentId: enrolment._id });
      } catch (error) {
        results.skipped.push({ student: studentId, reason: error.message });
      }
    }

    return results;
  }

  /** Unenrol a student, keeping their attendance/grade history intact. */
  async removeStudent(collectionId, studentId, actorId) {
    await this.#requireCollection(collectionId);

    const enrolment = await this.repository.findEnrolment(collectionId, studentId);
    if (!enrolment) throw ApiError.notFound('This student is not enrolled in this collection');

    await this.repository.deleteById(enrolment._id, actorId);
    await this.students.detachCollection(studentId, collectionId);
    await this.collections.adjustStudentsCount(collectionId, -1);

    return { collection: collectionId, student: studentId };
  }

  /** Suspend or resume a student inside one collection without unenrolling. */
  async setActive(collectionId, studentId, isActive) {
    const enrolment = await this.repository.findEnrolment(collectionId, studentId);
    if (!enrolment) throw ApiError.notFound('This student is not enrolled in this collection');
    return this.repository.updateById(enrolment._id, { $set: { isActive } });
  }

  /**
   * List (and search) the students enrolled in a collection.
   *
   * Reads through to the `Student` collection so the response carries full
   * profiles — the roster view needs attendance and payment status, not just
   * names — while still paginating and searching on indexed fields.
   */
  async listStudents(collectionId, query = {}) {
    await this.#requireCollection(collectionId);

    const options = buildQueryOptions(query, {
      searchableFields: ['fullName', 'email', 'phone', 'parentPhone', 'school'],
      filterableFields: [
        'status',
        'educationLevel',
        'performance',
        'paymentStatus',
        'attendancePercentage:number',
      ],
      sortableFields: ['fullName', 'attendancePercentage', 'createdAt', 'performance'],
      defaultSort: { fullName: 1 },
      baseFilter: { collections: collectionId },
    });

    return this.students.paginate(options, {
      select:
        'fullName email phone parentPhone educationLevel school status performance attendancePercentage totalPresent totalAbsent totalSessions paymentStatus outstandingBalance profileImage',
    });
  }

  /** Raw enrolment rows for a collection, including join metadata. */
  async listEnrolments(collectionId, query = {}) {
    await this.#requireCollection(collectionId);
    return this.list(query, { collectionId });
  }

  /** Collections a given student belongs to. */
  async listCollectionsForStudent(studentId, query = {}) {
    const student = await this.students.findById(studentId, { select: '_id collections' });
    if (!student) throw ApiError.notFound('Student not found');

    const options = buildQueryOptions(query, {
      searchableFields: ['name', 'subject', 'description'],
      filterableFields: ['subject', 'educationLevel', 'isActive:boolean'],
      defaultSort: { name: 1 },
      baseFilter: { _id: { $in: student.collections || [] } },
    });

    return this.collections.paginate(options);
  }
}

module.exports = new CollectionStudentService();
module.exports.CollectionStudentService = CollectionStudentService;
