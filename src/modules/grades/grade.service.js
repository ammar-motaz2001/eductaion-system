'use strict';

const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { ROLES, EXAM_TYPES } = require('../../core/constants');

const gradeRepository = require('./grade.repository');
const studentRepository = require('../students/student.repository');
const collectionStudentRepository = require('../collection-students/collectionStudent.repository');
const homeworkRepository = require('../homework/homework.repository');
const notificationService = require('../notifications/notification.service');

/**
 * Exam and assessment results.
 */
class GradeService extends BaseService {
  constructor({
    repository = gradeRepository,
    students = studentRepository,
    enrolments = collectionStudentRepository,
    homework = homeworkRepository,
    notifications = notificationService,
  } = {}) {
    super(repository, {
      resourceName: 'Grade',
      searchableFields: ['title', 'notes'],
      filterableFields: [
        'student:objectId',
        'collectionId:objectId',
        'examType',
        'examDate:date',
        'score:number',
        'homework:objectId',
        'createdAt:date',
      ],
      sortableFields: ['examDate', 'score', 'examType', 'createdAt'],
      defaultSort: { examDate: -1 },
      defaultPopulate: [
        { path: 'student', select: 'fullName email educationLevel' },
        { path: 'collectionId', select: 'name subject' },
      ],
    });
    this.students = students;
    this.enrolments = enrolments;
    this.homework = homework;
    this.notifications = notifications;
  }

  toQueryOptions(query = {}, baseFilter = {}) {
    const normalized = { ...query };
    if (normalized.collection) {
      normalized.collectionId = normalized.collection;
      delete normalized.collection;
    }
    return super.toQueryOptions(normalized, baseFilter);
  }

  async #assertEnrolled(collectionId, studentId) {
    const enrolled = await this.enrolments.isEnrolled(collectionId, studentId);
    if (!enrolled) {
      throw ApiError.badRequest('This student is not enrolled in the specified collection');
    }
  }

  /** Record a grade. */
  async addGrade(payload, actorId) {
    await this.#assertEnrolled(payload.collectionId, payload.student);

    if (payload.homework) {
      const assignment = await this.homework.findById(payload.homework, {
        select: '_id collectionId',
      });
      if (!assignment) throw ApiError.badRequest('The referenced homework does not exist');
      if (String(assignment.collectionId) !== String(payload.collectionId)) {
        throw ApiError.badRequest('The referenced homework belongs to a different collection');
      }
    }

    const grade = await this.repository.create({ ...payload, recordedBy: actorId });

    // Announce exams dated in the future so students can prepare.
    if (new Date(grade.examDate).getTime() > Date.now()) {
      const studentUserIds = await this.students.findUserIdsByCollection(payload.collectionId);
      await this.notifications.upcomingExam({
        grade,
        studentUserIds,
        examLabel: grade.title || `A ${grade.examType}`,
      });
    }

    return grade;
  }

  /** Record the same exam for many students at once. */
  async addBulk({ collectionId, examType, examDate, title, totalScore, scores }, actorId) {
    const enrolledIds = (await this.enrolments.findStudentIdsByCollection(collectionId)).map(
      String
    );
    const outcome = { recorded: [], skipped: [] };

    for (const entry of scores) {
      if (!enrolledIds.includes(String(entry.student))) {
        outcome.skipped.push({ student: entry.student, reason: 'Not enrolled in this collection' });
        continue;
      }
      if (entry.score > totalScore) {
        outcome.skipped.push({ student: entry.student, reason: 'score exceeds totalScore' });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const grade = await this.repository.create({
        student: entry.student,
        collectionId,
        examType,
        examDate,
        title,
        totalScore,
        score: entry.score,
        notes: entry.notes,
        recordedBy: actorId,
      });
      outcome.recorded.push({ student: entry.student, grade: grade._id });
    }

    return outcome;
  }

  /** Update a grade, re-validating the score against its maximum. */
  async updateGrade(id, payload) {
    const grade = await this.repository.findById(id);
    if (!grade) throw ApiError.notFound('Grade not found');

    const score = payload.score ?? grade.score;
    const totalScore = payload.totalScore ?? grade.totalScore;
    if (score > totalScore) throw ApiError.badRequest('score cannot exceed totalScore');

    return this.repository.updateById(id, { $set: payload });
  }

  /** A student's grades; students may only read their own. */
  async listForStudent(user, studentId, query) {
    const resolvedId =
      user.role === ROLES.INSTRUCTOR
        ? studentId
        : String((await this.students.findByUserId(user._id, { select: '_id' }))?._id || '');

    if (!resolvedId) throw ApiError.notFound('Student not found');
    if (user.role !== ROLES.INSTRUCTOR && studentId && resolvedId !== String(studentId)) {
      throw ApiError.forbidden('You may only view your own grades');
    }

    const page = await this.list(query, { student: resolvedId });
    const summary = await this.repository.summarizeForStudent(resolvedId, query.collection);
    return { ...page, meta: { ...page.meta, summary } };
  }

  async summaryForStudent(studentId, collectionId) {
    return this.repository.summarizeForStudent(studentId, collectionId);
  }

  async summaryForCollection(collectionId) {
    return this.repository.summarizeForCollection(collectionId);
  }

  /** Exams scheduled within the next `days` days. */
  async upcomingExams(days) {
    return this.repository.findUpcomingExams(days);
  }

  /** The exam-type vocabulary, for building UI selectors. */
  // eslint-disable-next-line class-methods-use-this
  examTypes() {
    return Object.values(EXAM_TYPES);
  }
}

module.exports = new GradeService();
module.exports.GradeService = GradeService;
