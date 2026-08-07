'use strict';

const ApiError = require('../../core/ApiError');
const BaseRepository = require('../../core/BaseRepository');
const Setting = require('./setting.model');
const storageService = require('../../services/storage');
const userRepository = require('../users/user.repository');
const authService = require('../auth/auth.service');

const settingRepository = new BaseRepository(Setting);

/**
 * Instructor profile and preference management.
 *
 * Identity fields (name, email, phone, photo, password) live on `User`;
 * preferences live in `Setting`. This service presents both as one "settings"
 * surface so the client does not have to know about the split.
 */
class SettingService {
  constructor({
    repository = settingRepository,
    users = userRepository,
    storage = storageService,
    auth = authService,
  } = {}) {
    this.repository = repository;
    this.users = users;
    this.storage = storage;
    this.auth = auth;
  }

  /** Fetch the caller's settings, creating defaults on first access. */
  async getForUser(userId) {
    return this.repository.upsert({ owner: userId }, { $setOnInsert: { owner: userId } });
  }

  /** Profile (User) + preferences (Setting) in one payload. */
  async getProfile(user) {
    const settings = await this.getForUser(user._id);
    return {
      profile: {
        id: String(user._id),
        fullName: user.fullName,
        email: user.email,
        phone: user.phone ?? null,
        role: user.role,
        profileImage: user.profileImage ?? null,
        lastLoginAt: user.lastLoginAt ?? null,
      },
      settings,
    };
  }

  /**
   * Update identity fields on the `User` document.
   * Changing the email requires it to be unused by any other account.
   */
  async updateProfile(userId, payload) {
    if (payload.email) {
      const existing = await this.users.findByEmail(payload.email, { includeDeleted: true });
      if (existing && String(existing._id) !== String(userId)) {
        throw ApiError.conflict('This email address is already in use');
      }
    }

    const updated = await this.users.updateById(userId, { $set: payload });
    if (!updated) throw ApiError.notFound('Account not found');

    return {
      id: String(updated._id),
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone ?? null,
      profileImage: updated.profileImage ?? null,
    };
  }

  /** Update preference blocks; nested objects are merged, not replaced. */
  async updateSettings(userId, payload) {
    const flattened = {};

    for (const [section, value] of Object.entries(payload)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, nested] of Object.entries(value)) {
          // Dot paths let `$set` patch one field without clobbering its siblings.
          flattened[`${section}.${key}`] = nested;
        }
      } else {
        flattened[section] = value;
      }
    }

    return this.repository.upsert({ owner: userId }, { $set: flattened });
  }

  /** Replace the caller's profile image. */
  async uploadProfileImage(userId, file) {
    if (!file) throw ApiError.badRequest('An image file is required');

    const user = await this.users.findById(userId, { select: 'profileImage' });
    if (!user) throw ApiError.notFound('Account not found');

    const stored = await this.storage.upload(file, {
      folder: `users/${userId}`,
      kind: file.resolvedKind,
    });

    const updated = await this.users.updateById(userId, { $set: { profileImage: stored } });
    if (user.profileImage?.key) await this.storage.remove(user.profileImage);

    return { profileImage: updated.profileImage };
  }

  /** Remove the profile image. */
  async removeProfileImage(userId) {
    const user = await this.users.findById(userId, { select: 'profileImage' });
    if (!user) throw ApiError.notFound('Account not found');
    if (!user.profileImage) return { profileImage: null };

    await this.users.updateById(userId, { $set: { profileImage: null } });
    await this.storage.remove(user.profileImage);
    return { profileImage: null };
  }

  /** Delegates to the auth service so password rules stay in one place. */
  async changePassword(userId, payload) {
    return this.auth.changePassword(userId, payload);
  }
}

module.exports = new SettingService();
module.exports.SettingService = SettingService;
