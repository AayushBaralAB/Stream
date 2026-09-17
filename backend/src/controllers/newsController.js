const News = require('../models/News');

exports.createNews = async (req, res) => {
  try {
    const { text, active, priority } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'News text is required' });
    }

    const news = await News.create({
      text: text.trim(),
      active: active !== false,
      priority: priority || 0,
      createdBy: req.user._id,
    });

    res.status(201).json({ message: 'News created', news });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getNews = async (req, res) => {
  try {
    const news = await News.find({ createdBy: req.user._id })
      .sort({ priority: -1, createdAt: -1 });
    res.json({ news });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getActiveNews = async (req, res) => {
  try {
    const news = await News.find({ active: true })
      .sort({ priority: -1, createdAt: -1 });
    res.json({ news });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateNews = async (req, res) => {
  try {
    const { text, active, priority } = req.body;
    const news = await News.findOne({ _id: req.params.id, createdBy: req.user._id });

    if (!news) {
      return res.status(404).json({ error: 'News not found' });
    }

    if (text !== undefined) news.text = text.trim();
    if (active !== undefined) news.active = active;
    if (priority !== undefined) news.priority = priority;

    await news.save();
    res.json({ message: 'News updated', news });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteNews = async (req, res) => {
  try {
    const news = await News.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });

    if (!news) {
      return res.status(404).json({ error: 'News not found' });
    }

    res.json({ message: 'News deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.toggleNews = async (req, res) => {
  try {
    const news = await News.findOne({ _id: req.params.id, createdBy: req.user._id });

    if (!news) {
      return res.status(404).json({ error: 'News not found' });
    }

    news.active = !news.active;
    await news.save();

    res.json({ message: `News ${news.active ? 'activated' : 'deactivated'}`, news });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
