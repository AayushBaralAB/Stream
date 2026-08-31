const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(process.env.DATABASE_PATH || './data/streams.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Check if column already exists
  db.get("PRAGMA table_info(videos)", (err, row) => {
    if (err) {
      console.error('Error checking table info:', err);
      db.close();
      return;
    }

    db.all("PRAGMA table_info(videos)", (err, rows) => {
      if (err) {
        console.error('Error checking table info:', err);
        db.close();
        return;
      }

      const hasThumbnailColumn = rows.some(row => row.name === 'thumbnail_path');
      
      if (!hasThumbnailColumn) {
        db.run("ALTER TABLE videos ADD COLUMN thumbnail_path TEXT", (err) => {
          if (err) {
            console.error('Error adding thumbnail_path column:', err);
          } else {
            console.log('Successfully added thumbnail_path column to videos table');
          }
          db.close();
        });
      } else {
        console.log('thumbnail_path column already exists');
        db.close();
      }
    });
  });
});