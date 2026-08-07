'use strict';

const crypto = require('crypto');

const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { ROLES, STUDENT_STATUS } = require('../../core/constants');
const storageService = require('../../services/storage');
const mailService = require('../../services/mail.service');

const studentRepository = require('./student.repository');
const userRepository = require('../users/user.repository');
const collectionRepository = require('../collections/collection.repository');
const collectionStudentRepository = require('../collection-students/collectionStudent.repository');
const notificationService = require('../notifications/notification.service');

/**
 * Student profile management.
 *
 * A student is two documents — a `User` (credentials) and a `Student` (profile).
 * This service owns that pair: it is the only writer that keeps the denormalised
 * `fullName`/`email`/`phone` copies on `Student` in step with `User`, and it
 * cascades status changes and deletions across both plus enrolment records.
 */
class StudentService extends BaseService {
  constructor({
    repository = studentRepository,
    users = userRepository,
    collections = collectionRepository,
    enrolments = collectionStudentRepository,
    notifications = notificationService,
    storage = storageService,
    mailer = mailService,
  } = {}) {
    super(repository, {
      resourceName: 'Student',
      searchableFields: ['fullName', 'email', 'phone', 'parentPhone', 'school'],
      filterableFields: [
        'status',
        'educationLevel',
        'performance',
        'paymentStatus',
        'school',
        'collections:objectId',
        // Aliases so `?collection=<id>` reads naturally while targeting the array.
        { path: 'collections', type: 'objectId' },
        'attendancePercentage:number',
        'age:number',
        'createdAt:date',
      ],
      sortableFields: [
        'fullName',
        'createdAt',
        'updatedAt',
        'age',
        'attendancePercentage',
        'educationLevel',
        'status',
        'performance',
      ],
      defaultSort: { createdAt: -1 },
      defaultPopulate: { path: 'collections', select: 'name subject educationLevel' },
    });
    this.users = users;
    this.collections = collections;
    this.enrolments = enrolments;
    this.notifications = notifications;
    this.storage = storage;
    this.mailer = mailer;
  }

  /** Map `?collection=` onto the cached `collections` array before filtering. */
  toQueryOptions(query = {}, baseFilter = {}) {
    const normalized = { ...query };
    if (normalized.collection) {
      normalized.collections = normalized.collection;
      delete normalized.collection;
    }
    return super.toQueryOptions(normalized, baseFilter);
  }

  /**
   * Create a student directly (instructor flow — bypasses activation codes).
   *
   * When no password is supplied a strong one is generated and returned exactly
   * once so the instructor can hand it over; it is never retrievable again.
   */
  async createStudent(payload, actorId) {
    const { email, password, collections: collectionIds = [], ...profile } = payload;

    const existing = await this.users.findByEmail(email, { includeDeleted: true });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    if (collectionIds.length) {
      const found = await this.collections.count({ _id: { $in: collectionIds } });
      if (found !== collectionIds.length) {
        throw ApiError.badRequest('One or more of the specified collections do not exist');
      }
    }

    const generatedPassword = password || StudentService.generatePassword();

    const user = await this.users.model.create({
      fullName: profile.fullName,
      email,
      password: generatedPassword,
      phone: profile.phone,
      role: ROLES.STUDENT,
      // Instructor-created accounts are trusted, so they start active.
      status: STUDENT_STATUS.ACTIVE,
    });

    let student;
    try {
      student = await this.repository.create({
        ...profile,
        user: user._id,
        email: String(email).toLowerCase(),
        status: STUDENT_STATUS.ACTIVE,
        collections: collectionIds,
        approvedBy: actorId,
        approvedAt: new Date(),
      });
    } catch (error) {
      await this.users.hardDeleteById(user._id).catch(() => {});
      throw error;
    }

    // Enrol into each requested collection and keep the counters accurate.
    await Promise.all(
      collectionIds.map(async (collectionId) => {
        await this.enrolments.create({
          collectionId,
          student: student._id,
          studentName: student.fullName,
          addedBy: actorId,
        });
        await this.collections.adjustStudentsCount(collectionId, 1);
      })
    );

    return {
      student,
      credentials: password ? undefined : { email, temporaryPassword: generatedPassword },
    };
  }

  /** Password that satisfies the policy without being guessable. */
  static generatePassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%*?';
    const all = upper + lower + digits + symbols;
    const pick = (set) => set[crypto.randomInt(set.length)];
    const characters = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    while (characters.length < 12) characters.push(pick(all));
    // Fisher-Yates so the guaranteed classes are not always in the first positions.
    for (let index = characters.length - 1; index > 0; index -= 1) {
      const swap = crypto.randomInt(index + 1);
      [characters[index], characters[swap]] = [characters[swap], characters[index]];
    }
    return characters.join('');
  }

  /**
   * Update a profile, propagating shared fields to the linked `User` and the
   * denormalised name on enrolment rows.
   */
  async updateStudent(id, payload, actorId) {
    const student = await this.repository.findById(id);
    if (!student) throw ApiError.notFound('Student not found');

    // `collections` membership is managed through the enrolment endpoints only.
    const { collections: _ignored, email: _ignoredEmail, ...updatable } = payload;

    const updated = await this.repository.updateById(id, { $set: updatable });

    const userUpdate = {};
    if (updatable.fullName) userUpdate.fullName = updatable.fullName;
    if (updatable.phone) userUpdate.phone = updatable.phone;
    if (Object.keys(userUpdate).length) {
      await this.users.updateById(student.user, { $set: userUpdate });
    }
    if (updatable.fullName) {
      await this.enrolments.syncStudentName(id, updatable.fullName);
    }

    void actorId;
    return updated;
  }

  /**
   * Approve a pending student.
   * Flips both documents to `active` and emails the student.
   */
  async approve(id, actorId) {
    const student = await this.repository.findById(id);
    if (!student) throw ApiError.notFound('Student not found');
    if (student.status === STUDENT_STATUS.ACTIVE) {
      throw ApiError.conflict('This student is already active');
    }

    const updated = await this.repository.updateById(id, {
      $set: { status: STUDENT_STATUS.ACTIVE, approvedBy: actorId, approvedAt: new Date() },
    });
    await this.users.updateById(student.user, { $set: { status: STUDENT_STATUS.ACTIVE } });

    if (student.email) {
      await this.mailer.sendAccountApproved({ to: student.email, name: student.fullName });
    }

    return updated;
  }

  /** Move an active student back to `pending`, suspending their access. */
  async revokeApproval(id) {
    const student = await this.repository.findById(id);
    if (!student) throw ApiError.notFound('Student not found');

    const updated = await this.repository.updateById(id, {
      $set: { status: STUDENT_STATUS.PENDING, approvedBy: null, approvedAt: null },
    });
    await this.users.updateById(student.user, { $set: { status: STUDENT_STATUS.PENDING } });
    // Force re-authentication so the stale `status` claim cannot be reused.
    await this.users.clearRefreshSessions(student.user);
    return updated;
  }

  /** Enable or disable the underlying login without deleting anything. */
  async setAccountActive(id, isActive) {
    const student = await this.repository.findById(id);
    if (!student) throw ApiError.notFound('Student not found');
    await this.users.updateById(student.user, { $set: { isActive } });
    if (!isActive) await this.users.clearRefreshSessions(student.user);
    return { id, isActive };
  }

  /**
   * Soft-delete a student and cascade to the login account and enrolments.
   * Historical records (grades, attendance, payments) are retained on purpose so
   * financial and academic history stays auditable.
   */
  async removeStudent(id, actorId) {
    const student = await this.repository.findById(id);
    if (!student) throw ApiError.notFound('Student not found');

    await this.repository.deleteById(id, actorId);
    await this.users.deleteById(student.user, actorId);
    await this.users.clearRefreshSessions(student.user);
    await this.enrolments.removeAllForStudent(id, actorId);

    // Keep collection counters truthful after the cascade.
    await Promise.all(
      (student.collections || []).map((collectionId) =>
        this.collections.adjustStudentsCount(collectionId, -1)
      )
    );

    return { id };
  }

  /** Replace the profile image, removing the previous blob. */
  async setProfileImage(id, file, actorId) {
    const student = await this.repository.findById(id);
    if (!student) throw ApiError.notFound('Student not found');

    const stored = await this.storage.upload(file, {
      folder: `students/${id}`,
      kind: file.resolvedKind,
    });

    const updated = await this.repository.updateById(id, { $set: { profileImage: stored } });
    await this.users.updateById(student.user, { $set: { profileImage: stored } });

    if (student.profileImage?.key) {
      await this.storage.remove(student.profileImage);
    }

    void actorId;
    return updated;
  }

  async addNote(id, body, actorId) {
    const updated = await this.repository.addNote(id, { body, createdBy: actorId });
    if (!updated) throw ApiError.notFound('Student not found');
    return updated;
  }

  async removeNote(id, noteId) {
    const student = await this.repository.findById(id);
    if (!student) throw ApiError.notFound('Student not found');
    const exists = (student.notes || []).some((note) => String(note._id) === String(noteId));
    if (!exists) throw ApiError.notFound('Note not found');
    return this.repository.removeNote(id, noteId);
  }

  /** Instructor's qualitative performance rating. */
  async setPerformance(id, performance) {
    const updated = await this.repository.updateById(id, { $set: { performance } });
    if (!updated) throw ApiError.notFound('Student not found');
    return updated;
  }

  /** Resolve the `Student` document for a signed-in student user. */
  async getOwnProfile(userId) {
    const student = await this.repository.findByUserId(userId, {
      populate: { path: 'collections', select: 'name subject educationLevel schedule' },
    });
    if (!student) throw ApiError.notFound('No student profile is linked to this account');
    return student;
  }

  /**
   * Resolve a student id for the caller, enforcing that a student may only ever
   * address their own record. Returns the id an instructor asked for unchanged.
   */
  async resolveAccessibleStudentId(user, requestedId) {
    if (user.role === ROLES.INSTRUCTOR) return requestedId;
    const own = await this.repository.findByUserId(user._id, { select: '_id' });
    if (!own) throw ApiError.notFound('No student profile is linked to this account');
    if (requestedId && String(own._id) !== String(requestedId)) {
      throw ApiError.forbidden('You may only access your own student record');
    }
    return String(own._id);
  }

  /** Students awaiting approval — the instructor's action queue. */
  async listPending(query) {
    return this.list({ ...query, status: STUDENT_STATUS.PENDING });
  }
}

module.exports = new StudentService();
module.exports.StudentService = StudentService;
