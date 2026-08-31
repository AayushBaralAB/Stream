'use strict';

/**
 * Data layer.
 *
 * Production  -> MongoDB (MONGODB_URI set, e.g. MongoDB Atlas).
 * Development -> file-backed JSON store in DATA_DIR so the full stack is
 *                runnable/testable on a machine without a Mongo instance.
 *
 * The document shape is identical either way, so callers never need to know
 * which engine is active.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const STORE_FILE = path.join(config.DATA_DIR, 'ab-streaming-store.json');

/* ------------------------------ helpers ------------------------------- */

function sanitize(doc) {
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const { _id, ...rest } = doc;
    if (typeof _id === 'number') {
      return { id: _id, ...rest };
    }
    return { ...rest };
  }
  return doc;
}

function sanitizeList(list) {
  return list.map(sanitize);
}

/* --------------------------- Mongo engine ----------------------------- */

class MongoStore {
  constructor() {
    this.engine = 'mongodb';
    this.client = null;
    this.db = null;
    this.queryTimes = [];
  }

  async connect() {
    const { MongoClient } = require('mongodb');
    this.client = new MongoClient(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      appName: 'ab-streaming-software',
    });
    await this.client.connect();
    this.db = this.client.db(config.MONGODB_DB);
    await this.ensureIndexes();
  }

  async ensureIndexes() {
    await this.db.collection('videos').createIndex({ id: 1 });
    await this.db.collection('streams').createIndex({ id: 1 });
    await this.db.collection('streams').createIndex({ status: 1 });
  }

  _record(ms) {
    this.queryTimes.push(ms);
    if (this.queryTimes.length > 100) this.queryTimes.shift();
  }

  avgQueryTime() {
    if (this.queryTimes.length === 0) return 0;
    return this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
  }

  async nextId(name) {
    const counters = this.db.collection('counters');
    const res = await counters.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    return res.value ? res.value.seq : 1;
  }

  async getVideos() {
    const t = Date.now();
    const rows = await this.db.collection('videos').find({}).sort({ order: 1, id: 1 }).toArray();
    this._record(Date.now() - t);
    return sanitizeList(rows);
  }

  async getVideo(id) {
    const t = Date.now();
    const row = await this.db.collection('videos').findOne({ id: Number(id) });
    this._record(Date.now() - t);
    return sanitize(row);
  }

  async insertVideo(video) {
    const t = Date.now();
    const id = video.id != null ? video.id : await this.nextId('videos');
    await this.db.collection('videos').insertOne({ _id: id, id, ...video });
    this._record(Date.now() - t);
    return { id, ...video };
  }

  async updateVideo(id, patch) {
    const t = Date.now();
    await this.db.collection('videos').updateOne({ id: Number(id) }, { $set: patch });
    this._record(Date.now() - t);
  }

  async deleteVideo(id) {
    const t = Date.now();
    await this.db.collection('videos').deleteOne({ id: Number(id) });
    this._record(Date.now() - t);
  }

  async reorderVideos(ids) {
    const t = Date.now();
    const col = this.db.collection('videos');
    for (let i = 0; i < ids.length; i += 1) {
      await col.updateOne({ id: Number(ids[i]) }, { $set: { order: i } });
    }
    this._record(Date.now() - t);
  }

  async getStreams() {
    const t = Date.now();
    const rows = await this.db.collection('streams').find({}).sort({ id: 1 }).toArray();
    this._record(Date.now() - t);
    return sanitizeList(rows);
  }

  async getStream(id) {
    const t = Date.now();
    const row = await this.db.collection('streams').findOne({ id: Number(id) });
    this._record(Date.now() - t);
    return sanitize(row);
  }

  async insertStream(stream) {
    const t = Date.now();
    const id = stream.id != null ? stream.id : await this.nextId('streams');
    await this.db.collection('streams').insertOne({ _id: id, id, ...stream });
    this._record(Date.now() - t);
    return { id, ...stream };
  }

  async updateStream(id, patch) {
    const t = Date.now();
    await this.db.collection('streams').updateOne({ id: Number(id) }, { $set: patch });
    this._record(Date.now() - t);
  }

  async deleteStream(id) {
    const t = Date.now();
    await this.db.collection('streams').deleteOne({ id: Number(id) });
    this._record(Date.now() - t);
  }

  async updateStreamsByVideoId(videoId, patch) {
    const t = Date.now();
    await this.db.collection('streams').updateMany({ video_id: Number(videoId) }, { $set: patch });
    this._record(Date.now() - t);
  }

  async deleteStreamsByVideoId(videoId) {
    const t = Date.now();
    await this.db.collection('streams').deleteMany({ video_id: Number(videoId) });
    this._record(Date.now() - t);
  }

  async getSettings() {
    const t = Date.now();
    const row = await this.db.collection('settings').findOne({ _id: 'app' });
    this._record(Date.now() - t);
    return (row && sanitize(row)) || null;
  }

  async updateSettings(patch) {
    const t = Date.now();
    const doc = { appName: 'AB Streaming Software', logoPath: '/uploads/app-logo.svg', ...patch };
    await this.db
      .collection('settings')
      .updateOne({ _id: 'app' }, { $set: doc }, { upsert: true });
    this._record(Date.now() - t);
    return doc;
  }

  async close() {
    if (this.client) await this.client.close();
  }
}

/* ---------------------------- JSON engine ----------------------------- */

class JsonStore {
  constructor() {
    this.engine = 'json';
    this.data = null;
    this.persistTimer = null;
    this.queryTimes = [];
  }

  async connect() {
    if (fs.existsSync(STORE_FILE)) {
      try {
        this.data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      } catch {
        this.data = null;
      }
    }
    if (!this.data) {
      this.data = {
        counters: { videos: 0, streams: 0 },
        videos: [],
        streams: [],
        settings: { appName: 'AB Streaming Software', logoPath: '/uploads/app-logo.svg' },
      };
      this.persist();
    }
  }

  _record(ms) {
    this.queryTimes.push(ms);
    if (this.queryTimes.length > 100) this.queryTimes.shift();
  }

  avgQueryTime() {
    if (this.queryTimes.length === 0) return 0;
    return this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
  }

  persist() {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(this.data, null, 2));
  }

  _persistDebounced() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 150);
  }

  async nextId(name) {
    this.data.counters[name] = (this.data.counters[name] || 0) + 1;
    return this.data.counters[name];
  }

  async getVideos() {
    const t = Date.now();
    const rows = [...this.data.videos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this._record(Date.now() - t);
    return rows;
  }

  async getVideo(id) {
    const t = Date.now();
    const row = this.data.videos.find((v) => v.id === Number(id)) || null;
    this._record(Date.now() - t);
    return row;
  }

  async insertVideo(video) {
    const t = Date.now();
    const id = video.id != null ? video.id : await this.nextId('videos');
    const doc = { id, ...video };
    if (doc.order == null) doc.order = this.data.videos.length;
    this.data.videos.push(doc);
    this._persistDebounced();
    this._record(Date.now() - t);
    return doc;
  }

  async updateVideo(id, patch) {
    const t = Date.now();
    const row = this.data.videos.find((v) => v.id === Number(id));
    if (row) Object.assign(row, patch);
    this._persistDebounced();
    this._record(Date.now() - t);
  }

  async deleteVideo(id) {
    const t = Date.now();
    this.data.videos = this.data.videos.filter((v) => v.id !== Number(id));
    this._persistDebounced();
    this._record(Date.now() - t);
  }

  async reorderVideos(ids) {
    const t = Date.now();
    const byId = new Map(this.data.videos.map((v) => [v.id, v]));
    this.data.videos = ids
      .map((id, i) => {
        const v = byId.get(Number(id));
        if (v) {
          v.order = i;
          return v;
        }
        return null;
      })
      .filter(Boolean)
      .concat(this.data.videos.filter((v) => !ids.includes(v.id)));
    this._persistDebounced();
    this._record(Date.now() - t);
  }

  async getStreams() {
    const t = Date.now();
    const rows = [...this.data.streams].sort((a, b) => a.id - b.id);
    this._record(Date.now() - t);
    return rows;
  }

  async getStream(id) {
    const t = Date.now();
    const row = this.data.streams.find((s) => s.id === Number(id)) || null;
    this._record(Date.now() - t);
    return row;
  }

  async insertStream(stream) {
    const t = Date.now();
    const id = stream.id != null ? stream.id : await this.nextId('streams');
    const doc = { id, ...stream };
    this.data.streams.push(doc);
    this._persistDebounced();
    this._record(Date.now() - t);
    return doc;
  }

  async updateStream(id, patch) {
    const t = Date.now();
    const row = this.data.streams.find((s) => s.id === Number(id));
    if (row) Object.assign(row, patch);
    this._persistDebounced();
    this._record(Date.now() - t);
  }

  async deleteStream(id) {
    const t = Date.now();
    this.data.streams = this.data.streams.filter((s) => s.id !== Number(id));
    this._persistDebounced();
    this._record(Date.now() - t);
  }

  async updateStreamsByVideoId(videoId, patch) {
    const t = Date.now();
    this.data.streams.forEach((s) => {
      if (s.video_id === Number(videoId)) Object.assign(s, patch);
    });
    this._persistDebounced();
    this._record(Date.now() - t);
  }

  async deleteStreamsByVideoId(videoId) {
    const t = Date.now();
    this.data.streams = this.data.streams.filter((s) => s.video_id !== Number(videoId));
    this._persistDebounced();
    this._record(Date.now() - t);
  }

  async getSettings() {
    const t = Date.now();
    const row = this.data.settings;
    this._record(Date.now() - t);
    return row;
  }

  async updateSettings(patch) {
    const t = Date.now();
    this.data.settings = { appName: 'AB Streaming Software', logoPath: '/uploads/app-logo.svg', ...patch };
    this._persistDebounced();
    this._record(Date.now() - t);
    return this.data.settings;
  }

  async close() {
    clearTimeout(this.persistTimer);
    this.persist();
  }
}

/* ------------------------------ singleton ----------------------------- */

const store =
  config.MONGODB_URI && config.MONGODB_URI !== 'none' ? new MongoStore() : new JsonStore();

async function init() {
  await store.connect();
  return store;
}

module.exports = { store, init };