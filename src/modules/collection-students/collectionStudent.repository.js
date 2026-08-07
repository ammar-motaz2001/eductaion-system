'use strict';

const BaseRepository = require('../../core/BaseRepository');
const CollectionStudent = require('./collectionStudent.model');

class CollectionStudentRepository extends BaseRepository {
  constructor(model = CollectionStudent) {
    super(model);
  }

  async findEnrolment(collectionId, studentId, options = {}) {
    return this.findOne({ collectionId, student: studentId }, options);
  }

  async isEnrolled(collectionId, studentId) {
    return this.exists({ collectionId, student: studentId, isActive: true });
  }

  async countByCollection(collectionId) {
    return this.count({ collectionId, isActive: true });
  }

  /** Collection ids a student belongs to. */
  async findCollectionIdsByStudent(studentId) {
    const rows = await this.findMany(
      { student: studentId, isActive: true },
      { select: 'collectionId' }
    );
    return rows.map((row) => row.collectionId);
  }

  /** Student ids enrolled in a collection. */
  async findStudentIdsByCollection(collectionId) {
    const rows = await this.findMany({ collectionId, isActive: true }, { select: 'student' });
    return rows.map((row) => row.student);
  }

  /** Soft-delete every enrolment for a removed collection. */
  async removeAllForCollection(collectionId, actorId) {
    return this.model
      .updateMany(
        { collectionId, deletedAt: null },
        { $set: { deletedAt: new Date(), deletedBy: actorId || null, isActive: false } }
      )
      .exec();
  }

  /** Soft-delete every enrolment for a removed student. */
  async removeAllForStudent(studentId, actorId) {
    return this.model
      .updateMany(
        { student: studentId, deletedAt: null },
        { $set: { deletedAt: new Date(), deletedBy: actorId || null, isActive: false } }
      )
      .exec();
  }

  /** Keep the denormalised student name current after a profile rename. */
  async syncStudentName(studentId, studentName) {
    return this.model.updateMany({ student: studentId }, { $set: { studentName } }).exec();
  }
}

module.exports = new CollectionStudentRepository();
module.exports.CollectionStudentRepository = CollectionStudentRepository;
