const Destination = require('../models/Destination');
const { encrypt, decrypt, maskKey } = require('../services/encryptionService');

exports.createDestination = async (req, res) => {
  try {
    const { name, platform, rtmpUrl, streamKey } = req.body;

    if (!name || !platform || !rtmpUrl || !streamKey) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['youtube', 'facebook', 'custom'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform type' });
    }

    const encryptedKey = encrypt(streamKey);

    const destination = await Destination.create({
      name,
      platform,
      rtmpUrl,
      streamKey: encryptedKey,
      streamKeyEncrypted: true,
      enabled: true,
      createdBy: req.user._id,
    });

    const destObj = destination.toObject();
    destObj.streamKey = maskKey(streamKey);

    res.status(201).json({ message: 'Destination created', destination: destObj });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDestinations = async (req, res) => {
  try {
    const destinations = await Destination.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 });

    const masked = destinations.map(d => {
      const obj = d.toObject();
      obj.streamKey = maskKey(decrypt(obj.streamKey));
      return obj;
    });

    res.json({ destinations: masked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateDestination = async (req, res) => {
  try {
    const { name, platform, rtmpUrl, streamKey, enabled } = req.body;
    const destination = await Destination.findOne({ _id: req.params.id, createdBy: req.user._id });

    if (!destination) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    if (name) destination.name = name;
    if (platform) destination.platform = platform;
    if (rtmpUrl) destination.rtmpUrl = rtmpUrl;
    if (streamKey) {
      destination.streamKey = encrypt(streamKey);
      destination.streamKeyEncrypted = true;
    }
    if (typeof enabled === 'boolean') destination.enabled = enabled;

    await destination.save();

    const obj = destination.toObject();
    obj.streamKey = maskKey(decrypt(obj.streamKey));

    res.json({ message: 'Destination updated', destination: obj });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteDestination = async (req, res) => {
  try {
    const destination = await Destination.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id,
    });

    if (!destination) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    res.json({ message: 'Destination deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.toggleDestination = async (req, res) => {
  try {
    const destination = await Destination.findOne({ _id: req.params.id, createdBy: req.user._id });

    if (!destination) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    destination.enabled = !destination.enabled;
    await destination.save();

    const obj = destination.toObject();
    obj.streamKey = maskKey(decrypt(obj.streamKey));

    res.json({ message: `Destination ${destination.enabled ? 'enabled' : 'disabled'}`, destination: obj });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
