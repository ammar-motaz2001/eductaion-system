'use strict';

/**
 * Bootstrap script.
 *
 * Creates the initial instructor account (and its settings document) so the API
 * is usable immediately after a fresh install, and optionally seeds a small demo
 * dataset with `--demo`.
 *
 *   npm run seed
 *   npm run seed -- --demo
 *
 * Idempotent: existing records are reported and left untouched.
 */

const env = require('../config/env');
const logger = require('../config/logger');
const { connectDatabase, disconnectDatabase } = require('../config/database');
const { ROLES, STUDENT_STATUS, EDUCATION_LEVELS } = require('../core/constants');
const { addDays } = require('../utils/date.util');
const { generateActivationCode } = require('../utils/token.util');

const User = require('../modules/users/user.model');
const Setting = require('../modules/settings/setting.model');
const Collection = require('../modules/collections/collection.model');
const Student = require('../modules/students/student.model');
const CollectionStudent = require('../modules/collection-students/collectionStudent.model');
const ActivationCode = require('../modules/activation-codes/activationCode.model');

const wantsDemo = process.argv.includes('--demo');

async function seedInstructor() {
  const existing = await User.findOne({ email: env.SEED_INSTRUCTOR_EMAIL });
  if (existing) {
    logger.info(`Instructor already exists: ${existing.email}`);
    return existing;
  }

  const instructor = await User.create({
    fullName: env.SEED_INSTRUCTOR_NAME,
    email: env.SEED_INSTRUCTOR_EMAIL,
    password: env.SEED_INSTRUCTOR_PASSWORD, // hashed by the pre-save hook
    phone: env.SEED_INSTRUCTOR_PHONE,
    role: ROLES.INSTRUCTOR,
    status: STUDENT_STATUS.ACTIVE,
    isActive: true,
  });

  await Setting.create({
    owner: instructor._id,
    institution: {
      name: env.APP_NAME,
      contactEmail: instructor.email,
      contactPhone: instructor.phone,
    },
    preferences: { attendanceWarningThreshold: env.ATTENDANCE_WARNING_THRESHOLD },
  });

  logger.info(`Instructor created: ${instructor.email}`);
  return instructor;
}

async function seedDemo(instructor) {
  const collectionCount = await Collection.countDocuments({ deletedAt: null });
  if (collectionCount > 0) {
    logger.info('Demo data already present — skipping');
    return;
  }

  const collections = await Collection.create([
    {
      name: 'Physics — Grade 11 (Saturday group)',
      subject: 'Physics',
      educationLevel: 'secondary-2',
      pricePerClass: 150,
      monthlySubscriptionPrice: 500,
      capacity: 25,
      description: 'Mechanics and thermodynamics, following the national curriculum.',
      schedule: [{ day: 'saturday', startTime: '16:00', endTime: '18:00', room: 'A1' }],
      createdBy: instructor._id,
    },
    {
      name: 'Mathematics — Grade 9',
      subject: 'Mathematics',
      educationLevel: 'preparatory-3',
      pricePerClass: 120,
      monthlySubscriptionPrice: 420,
      capacity: 30,
      schedule: [
        { day: 'monday', startTime: '17:00', endTime: '19:00', room: 'B2' },
        { day: 'thursday', startTime: '17:00', endTime: '19:00', room: 'B2' },
      ],
      createdBy: instructor._id,
    },
  ]);

  logger.info(`Created ${collections.length} demo collections`);

  const demoStudents = [
    {
      fullName: 'Omar Khaled',
      email: 'omar@example.com',
      age: 17,
      level: 'secondary-2',
      school: 'Cairo Language School',
    },
    {
      fullName: 'Yara Hassan',
      email: 'yara@example.com',
      age: 16,
      level: 'secondary-2',
      school: 'Nasr Modern School',
    },
    {
      fullName: 'Mostafa Ali',
      email: 'mostafa@example.com',
      age: 15,
      level: 'preparatory-3',
      school: 'El Salam School',
    },
  ];

  for (const [index, entry] of demoStudents.entries()) {
    const collection = collections[entry.level === 'secondary-2' ? 0 : 1];

    // eslint-disable-next-line no-await-in-loop
    const user = await User.create({
      fullName: entry.fullName,
      email: entry.email,
      password: 'Student@123',
      phone: `+2010000001${index}0`,
      role: ROLES.STUDENT,
      status: STUDENT_STATUS.ACTIVE,
    });

    // eslint-disable-next-line no-await-in-loop
    const student = await Student.create({
      user: user._id,
      fullName: entry.fullName,
      email: entry.email,
      age: entry.age,
      phone: user.phone,
      parentPhone: `+2010000002${index}0`,
      educationLevel: entry.level,
      school: entry.school,
      status: STUDENT_STATUS.ACTIVE,
      approvedBy: instructor._id,
      approvedAt: new Date(),
      collections: [collection._id],
      address: { city: 'Giza', governorate: 'Giza', country: 'Egypt' },
    });

    // eslint-disable-next-line no-await-in-loop
    await CollectionStudent.create({
      collectionId: collection._id,
      student: student._id,
      studentName: student.fullName,
      addedBy: instructor._id,
    });

    // eslint-disable-next-line no-await-in-loop
    await Collection.updateOne({ _id: collection._id }, { $inc: { studentsCount: 1 } });
  }

  logger.info(`Created ${demoStudents.length} demo students (password: Student@123)`);

  // A few unused activation codes so the registration flow can be exercised.
  const codes = await ActivationCode.create(
    Array.from({ length: 3 }, () => ({
      code: generateActivationCode(),
      expiresAt: addDays(new Date(), env.ACTIVATION_CODE_EXPIRES_IN_DAYS),
      issuedBy: instructor._id,
      educationLevel: EDUCATION_LEVELS[10],
      collectionId: collections[0]._id,
    }))
  );

  logger.info(
    `Created ${codes.length} activation codes: ${codes.map((code) => code.code).join(', ')}`
  );
}

async function run() {
  await connectDatabase();

  const instructor = await seedInstructor();
  if (wantsDemo) await seedDemo(instructor);

  logger.info('Seed complete');
  logger.info(`  Sign in with: ${env.SEED_INSTRUCTOR_EMAIL} / ${env.SEED_INSTRUCTOR_PASSWORD}`);

  await disconnectDatabase();
  process.exit(0);
}

run().catch(async (error) => {
  logger.error('Seed failed', { error: error.message, stack: error.stack });
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
