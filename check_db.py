import sqlite3
import os
db_path = 'planweaver.db'
if not os.path.exists(db_path):
    print("DB file not found!")
    exit(1)
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT document_id, filename FROM projects")
rows = cursor.fetchall()
for row in rows:
    print(f"ID: {row[0]}, NAME: {row[1]}")
conn.close()
