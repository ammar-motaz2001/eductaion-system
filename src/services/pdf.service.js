'use strict';

const PDFDocument = require('pdfkit');

const { formatDate, formatDateTime } = require('../utils/date.util');

/**
 * PDF rendering for student reports.
 *
 * Built with pdfkit and streamed, so a large report never has to be held in
 * memory in full. `renderToBuffer` is provided for the archive path, where the
 * bytes must be handed to a storage driver.
 */

const COLORS = Object.freeze({
  text: '#1f2933',
  muted: '#6b7280',
  accent: '#1d4ed8',
  rule: '#d1d5db',
  warning: '#b91c1c',
  success: '#047857',
});

const LAYOUT = Object.freeze({
  margin: 50,
  pageWidth: 595.28, // A4 portrait
});

const contentWidth = LAYOUT.pageWidth - LAYOUT.margin * 2;

/** Horizontal rule at the current cursor. */
function rule(doc, offset = 6) {
  const y = doc.y + offset;
  doc
    .moveTo(LAYOUT.margin, y)
    .lineTo(LAYOUT.pageWidth - LAYOUT.margin, y)
    .strokeColor(COLORS.rule)
    .lineWidth(0.75)
    .stroke();
  doc.y = y + offset;
}

function sectionHeading(doc, title) {
  // Start a new page rather than orphaning a heading at the foot of one.
  if (doc.y > 690) doc.addPage();
  doc.moveDown(0.8);
  doc.fillColor(COLORS.accent).fontSize(13).font('Helvetica-Bold').text(title.toUpperCase());
  rule(doc, 4);
  doc.fillColor(COLORS.text).font('Helvetica').fontSize(10);
}

/** Two-column key/value grid. */
function keyValueGrid(doc, entries, columns = 2) {
  const columnWidth = contentWidth / columns;
  const rows = Math.ceil(entries.length / columns);
  const startY = doc.y;
  const rowHeight = 20;

  entries.forEach(([label, value], index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const x = LAYOUT.margin + column * columnWidth;
    const y = startY + row * rowHeight;

    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(String(label).toUpperCase(), x, y, {
        width: columnWidth - 12,
      });
    doc
      .fontSize(10)
      .fillColor(COLORS.text)
      .text(value === null || value === undefined || value === '' ? '—' : String(value), x, y + 9, {
        width: columnWidth - 12,
      });
  });

  doc.y = startY + rows * rowHeight + 6;
  doc.x = LAYOUT.margin;
}

/** Simple table with a header row; column widths are fractions of the content width. */
function table(doc, { headers, rows, widths }) {
  if (!rows.length) {
    doc.fontSize(10).fillColor(COLORS.muted).text('No records for this period.');
    doc.fillColor(COLORS.text);
    return;
  }

  const columnWidths = widths.map((fraction) => contentWidth * fraction);

  const writeRow = (cells, { bold = false, color = COLORS.text } = {}) => {
    if (doc.y > 740) {
      doc.addPage();
    }
    const y = doc.y;
    let x = LAYOUT.margin;
    let tallest = 0;

    cells.forEach((cell, index) => {
      const width = columnWidths[index];
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 8.5 : 9)
        .fillColor(bold ? COLORS.muted : color)
        .text(cell === null || cell === undefined ? '—' : String(cell), x, y, {
          width: width - 8,
        });
      tallest = Math.max(tallest, doc.y - y);
      x += width;
    });

    doc.y = y + Math.max(tallest, 12) + 4;
    doc.x = LAYOUT.margin;
  };

  writeRow(headers, { bold: true });
  rule(doc, 2);
  rows.forEach((row) => writeRow(row));
}

/**
 * Write the report body into an open pdfkit document.
 * @param {PDFKit.PDFDocument} doc
 * @param {object} report The payload produced by the report service.
 */
function composeStudentReport(doc, report) {
  const { student, institution, period, attendance, grades, homework, payments, notes } = report;

  // ── Header ────────────────────────────────────────────────────────────────
  doc
    .fillColor(COLORS.accent)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(institution?.name || 'Education Management System', { align: 'left' });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Student progress report');

  if (institution?.addressLine) doc.text(institution.addressLine);
  if (institution?.contactPhone) doc.text(`Tel: ${institution.contactPhone}`);

  doc.moveDown(0.3);
  doc
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      `Generated ${formatDateTime(report.generatedAt)}${
        period?.from || period?.to
          ? ` · Period ${formatDate(period.from)} – ${formatDate(period.to)}`
          : ' · All time'
      }`
    );
  rule(doc);

  // ── Student information ───────────────────────────────────────────────────
  sectionHeading(doc, 'Student information');
  keyValueGrid(doc, [
    ['Full name', student.fullName],
    ['Email', student.email],
    ['Age', student.age],
    ['Phone', student.phone],
    ['Parent phone', student.parentPhone],
    ['Education level', student.educationLevel],
    ['School', student.school],
    ['Status', student.status],
    ['Performance', student.performance],
    ['Enrolled since', formatDate(student.enrolledAt)],
    [
      'Address',
      [student.address?.line, student.address?.city, student.address?.governorate]
        .filter(Boolean)
        .join(', '),
    ],
    ['Collections', (student.collections || []).map((item) => item.name).join(', ')],
  ]);

  // ── Attendance ────────────────────────────────────────────────────────────
  sectionHeading(doc, 'Attendance summary');
  keyValueGrid(
    doc,
    [
      ['Sessions counted', attendance.summary.totalSessions],
      ['Present', attendance.summary.totalPresent],
      ['Absent', attendance.summary.totalAbsent],
      ['Awaiting review', attendance.summary.totalPending],
      ['Attendance rate', `${attendance.summary.attendancePercentage}%`],
      [
        'Status',
        attendance.summary.hasWarning
          ? `BELOW REQUIRED ${attendance.summary.threshold}%`
          : 'Satisfactory',
      ],
    ],
    3
  );

  if (attendance.summary.hasWarning) {
    doc
      .fillColor(COLORS.warning)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(
        `Warning: attendance is below the required minimum of ${attendance.summary.threshold}%.`
      );
    doc.fillColor(COLORS.text).font('Helvetica');
    doc.moveDown(0.4);
  }

  table(doc, {
    headers: ['Date', 'Collection', 'Status', 'Notes'],
    widths: [0.18, 0.34, 0.14, 0.34],
    rows: attendance.records
      .slice(0, 40)
      .map((record) => [
        formatDate(record.date),
        record.collectionId?.name || '—',
        record.status,
        record.notes || '',
      ]),
  });

  // ── Grades ────────────────────────────────────────────────────────────────
  sectionHeading(doc, 'Grade summary');
  keyValueGrid(
    doc,
    [
      ['Assessments', grades.summary.examCount],
      ['Total scored', grades.summary.totalScored],
      ['Total possible', grades.summary.totalPossible],
      ['Weighted average', `${grades.summary.averagePercentage}%`],
      ['Best result', `${grades.summary.bestPercentage}%`],
      ['Weakest result', `${grades.summary.worstPercentage}%`],
    ],
    3
  );

  table(doc, {
    headers: ['Date', 'Type', 'Title', 'Score', '%'],
    widths: [0.16, 0.16, 0.38, 0.15, 0.15],
    rows: grades.records.map((grade) => [
      formatDate(grade.examDate),
      grade.examType,
      grade.title || grade.collectionId?.name || '—',
      `${grade.score} / ${grade.totalScore}`,
      `${Math.round((grade.score / grade.totalScore) * 1000) / 10}%`,
    ]),
  });

  // ── Homework ──────────────────────────────────────────────────────────────
  sectionHeading(doc, 'Homework summary');
  keyValueGrid(
    doc,
    [
      ['Assigned', homework.summary.total],
      ['Graded', homework.summary.graded],
      ['Overdue', homework.summary.overdue],
      ['Average score', `${homework.summary.averagePercentage}%`],
    ],
    4
  );

  table(doc, {
    headers: ['Due date', 'Title', 'Collection', 'Result'],
    widths: [0.18, 0.37, 0.27, 0.18],
    rows: homework.records.map((item) => [
      formatDate(item.dueDate),
      item.title,
      item.collectionId?.name || '—',
      item.result || 'Not graded',
    ]),
  });

  // ── Payments ──────────────────────────────────────────────────────────────
  sectionHeading(doc, 'Payment history');
  keyValueGrid(
    doc,
    [
      ['Total billed', payments.summary.totalBilled],
      ['Paid', payments.summary.paid.total],
      ['Pending', payments.summary.pending.total],
      ['Late', payments.summary.late.total],
      ['Outstanding', payments.summary.outstanding],
      ['Status', payments.summary.status],
    ],
    3
  );

  table(doc, {
    headers: ['Due date', 'Description', 'Amount', 'Status', 'Paid on'],
    widths: [0.18, 0.32, 0.16, 0.16, 0.18],
    rows: payments.records.map((payment) => [
      formatDate(payment.dueDate),
      payment.description || payment.collectionId?.name || '—',
      payment.amount,
      payment.status,
      payment.paidDate ? formatDate(payment.paidDate) : '—',
    ]),
  });

  // ── Notes ─────────────────────────────────────────────────────────────────
  sectionHeading(doc, 'Instructor notes');
  if (!notes.length) {
    doc.fontSize(10).fillColor(COLORS.muted).text('No notes recorded.');
    doc.fillColor(COLORS.text);
  } else {
    notes.forEach((note) => {
      doc.fontSize(8).fillColor(COLORS.muted).text(formatDate(note.createdAt));
      doc.fontSize(10).fillColor(COLORS.text).text(note.body, { width: contentWidth });
      doc.moveDown(0.4);
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.moveDown(1);
  rule(doc);
  doc
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text('This report is generated automatically from attendance, grade and payment records.', {
      align: 'center',
    });
}

/** Create a configured, empty document. */
function createDocument(title) {
  return new PDFDocument({
    size: 'A4',
    margin: LAYOUT.margin,
    bufferPages: true,
    info: { Title: title, Producer: 'Education Management System' },
  });
}

/**
 * Stream a student report straight to an HTTP response.
 * @param {import('express').Response} res
 * @param {object} report
 */
function streamStudentReport(res, report) {
  const filename = `report-${String(report.student.fullName || 'student')
    .replace(/[^\w]+/g, '-')
    .toLowerCase()}-${formatDate(new Date())}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = createDocument(`Student report — ${report.student.fullName}`);
  doc.pipe(res);
  composeStudentReport(doc, report);
  doc.end();
}

/**
 * Render a student report to a buffer (for archiving to storage).
 * @returns {Promise<Buffer>}
 */
function renderStudentReportToBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = createDocument(`Student report — ${report.student.fullName}`);
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    composeStudentReport(doc, report);
    doc.end();
  });
}

module.exports = { streamStudentReport, renderStudentReportToBuffer, COLORS };
