import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "planweaver.db")

def migrate():
    print(f"Connecting to DB at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE usage_logs ADD COLUMN task_type VARCHAR DEFAULT 'analysis'")
        conn.commit()
        print("Successfully added 'task_type' column to usage_logs table.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("Column 'task_type' already exists in usage_logs table.")
        else:
            print(f"Error executing migration: {e}")
            
    conn.close()

if __name__ == "__main__":
    migrate()
