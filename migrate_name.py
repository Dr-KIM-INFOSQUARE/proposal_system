import sqlite3
import os
db_path = 'planweaver.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # Check if name column exists
        cursor.execute("PRAGMA table_info(projects)")
        cols = [c[1] for c in cursor.fetchall()]
        if 'name' not in cols:
            print("Adding name column to projects table...")
            cursor.execute("ALTER TABLE projects ADD COLUMN name TEXT")
            # Initialize name with filename
            cursor.execute("UPDATE projects SET name = filename")
            conn.commit()
            print("Migration successful.")
        else:
            print("Column 'name' already exists.")
    except Exception as e:
        print(f"Migration error: {e}")
    finally:
        conn.close()
else:
    print("No DB file to migrate.")
