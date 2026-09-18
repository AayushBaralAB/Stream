const Log = require('../models/Log');

exports.getLogs = async (req, res) => {
  try {
    const { level, limit = 100, offset = 0 } = req.query;
    const query = {};
    if (level) query.level = level;

    const logs = await Log.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    const total = await Log.countDocuments(query);

    res.json({ logs, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.clearLogs = async (req, res) => {
  try {
    await Log.deleteMany({});
    res.json({ message: 'Logs cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
