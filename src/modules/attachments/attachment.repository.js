'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Attachment = require('./attachment.model');

class AttachmentRepository extends BaseRepository {
  constructor(model = Attachment) {
    super(model);
  }

  async incrementDownloads(id) {
    return this.model.updateOne({ _id: id }, { $inc: { downloadCount: 1 } }).exec();
  }

  async countByCollection(collectionId) {
    return this.count({ collectionId });
  }
}

module.exports = new AttachmentRepository();
module.exports.AttachmentRepository = AttachmentRepository;
